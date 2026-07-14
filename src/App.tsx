import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createDefaultDraft, emptyAddress } from './defaults'
import {
  activityPresets,
  calculateLateFiling,
  endingCapital,
  endingCash,
  evaluateEligibility,
  lateReasonTemplates,
  netReceipts,
  OFFICIAL_SOURCES,
  ordinaryIncome,
  qualifiesForScheduleBQuestion4,
  representativeDetails,
  totalExpenses,
} from './domain'
import {
  allocationTotals,
  isUnitedStatesCountry,
  maximumScheduleB1Percent,
  partnerDisplayName,
  partnerEntityType,
  partnerScheduleValues,
  partnersRequiringScheduleB1,
} from './schedules'
import {
  clearSavedDraft,
  loadSavedDraft,
  migrateDraft,
  saveDraft,
} from './storage'
import type {
  Address,
  ComplexityAnswers,
  Partner,
  ReturnDraft,
  YesNoUnknown,
} from './types'

const steps = [
  { title: 'Supported return', eyebrow: 'Start here' },
  { title: 'Business details', eyebrow: 'About the LLC' },
  { title: 'Business address', eyebrow: 'Mailing information' },
  { title: 'Partners', eyebrow: 'Ownership' },
  { title: 'Deadline', eyebrow: 'Filing timing' },
  { title: 'Complexity check', eyebrow: 'Keep this accurate' },
  { title: 'Money received', eyebrow: 'Income vs. contributions' },
  { title: 'Business expenses', eyebrow: '2025 deductions' },
  { title: 'Partner schedules', eyebrow: 'B-1 and K-1 details' },
  { title: 'Representative', eyebrow: 'IRS contact' },
  { title: 'Review & download', eyebrow: 'Draft Form 1065' },
]

const complexityQuestions: {
  key: keyof ComplexityAnswers
  label: string
  detail: string
}[] = [
  { key: 'foreignActivity', label: 'Foreign accounts or transactions', detail: 'Includes foreign bank authority, trusts, entities, or payments.' },
  { key: 'foreignPartner', label: 'A non-U.S. partner', detail: 'Includes an individual or entity that is not a U.S. person.' },
  { key: 'rentalActivity', label: 'Rental activity', detail: 'Includes real estate or other property rented to someone else.' },
  { key: 'inventory', label: 'Inventory or products sold', detail: 'Includes merchandise, materials, or cost of goods sold.' },
  { key: 'employeesOrPayroll', label: 'Employees or payroll', detail: 'Includes wages, payroll tax returns, retirement plans, or employee benefits.' },
  { key: 'contractor1099s', label: 'Payments that may require Form 1099', detail: 'For example, qualifying contractor, legal, rent, or service payments.' },
  { key: 'digitalAssets', label: 'Digital assets', detail: 'Includes receiving, selling, exchanging, or disposing of cryptocurrency or similar assets.' },
  { key: 'debtOrLoanChanges', label: 'Business debt or changed loan terms', detail: 'Includes loans, canceled debt, or reduced principal.' },
  { key: 'propertyOrEquipment', label: 'Equipment, vehicles, or other property', detail: 'Includes depreciation, amortization, or property sales.' },
  { key: 'ownershipChanges', label: 'Ownership changed during 2025', detail: 'Includes a partner joining, leaving, transferring, or changing percentages.' },
  { key: 'guaranteedPayments', label: 'Guaranteed payments to a partner', detail: 'Payments determined without regard to partnership income.' },
  { key: 'taxCreditsOrElections', label: 'Tax credits or elections', detail: 'Includes section 754, opportunity fund, or other specialized elections.' },
]

function App() {
  const [draft, setDraft] = useState<ReturnDraft>(createDefaultDraft)
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Loading saved details…')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSavedDraft()
      .then((saved) => {
        if (saved) {
          setDraft(saved)
          setSaveStatus('Saved details restored. Tax IDs are never auto-saved.')
        } else {
          setSaveStatus('Ready. Answers will be saved on this device.')
        }
      })
      .finally(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    setSaveStatus('Saving…')
    const timer = window.setTimeout(() => {
      saveDraft(draft)
        .then(() => setSaveStatus('Saved on this device · tax IDs excluded'))
        .catch((error: unknown) => {
          setSaveStatus(
            error instanceof Error ? `Could not save: ${error.message}` : 'Could not save locally',
          )
        })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [draft, hydrated])

  const step = draft.currentStep
  const eligibility = useMemo(() => evaluateEligibility(draft), [draft])
  const late = useMemo(
    () => calculateLateFiling(draft.filing, draft.partners.length),
    [draft.filing, draft.partners.length],
  )
  const progress = ((step + 1) / steps.length) * 100
  const canContinue = validateStep(step, draft)

  const updateDraft = (update: (current: ReturnDraft) => ReturnDraft) => {
    setDraft((current) => update(structuredClone(current)))
  }

  const goTo = (nextStep: number) => {
    updateDraft((current) => {
      current.currentStep = Math.max(0, Math.min(steps.length - 1, nextStep))
      return current
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const generatePdf = async () => {
    setGenerationError('')
    setIsGenerating(true)
    try {
      const sourceNames = {
        form1065: 'forms/f1065--2025.pdf',
        scheduleB1: 'forms/f1065sb1.pdf',
        scheduleK1: 'forms/f1065sk1--2025.pdf',
      }
      const sourceEntries = await Promise.all(
        Object.entries(sourceNames).map(async ([key, path]) => {
          const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
          if (!response.ok) {
            throw new Error(`Could not load ${path} (${response.status}).`)
          }
          return [key, new Uint8Array(await response.arrayBuffer())] as const
        }),
      )
      const sources = Object.fromEntries(sourceEntries) as {
        form1065: Uint8Array
        scheduleB1: Uint8Array
        scheduleK1: Uint8Array
      }
      const { generateFilingPackage } = await import('./companionPdf')
      const bytes = await generateFilingPackage(sources, draft)
      downloadBlob(
        new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
        `DRAFT-2025-1065-Filing-Package-${fileSafe(draft.business.legalName)}.pdf`,
      )
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'The PDF could not be generated.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const exportDraft = () => {
    downloadBlob(
      new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }),
      `form-1065-draft-${fileSafe(draft.business.legalName || 'partnership')}.json`,
    )
  }

  const importDraft = async (file?: File) => {
    if (!file) return
    try {
      const candidate = migrateDraft(JSON.parse(await file.text()))
      if (!candidate) {
        throw new Error('This is not a supported Form 1065 draft export.')
      }
      setDraft(candidate)
      setSaveStatus('Imported draft loaded and saved locally.')
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Import failed.')
    }
  }

  const resetAll = async () => {
    await clearSavedDraft()
    setDraft(createDefaultDraft())
    setSaveStatus('All saved browser data was cleared.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">1065</div>
          <div>
            <strong>Partnership Return Guide</strong>
            <span>Private 2025 draft interview</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="save-status">{saveStatus}</span>
          <button className="button button-quiet" onClick={exportDraft}>Export</button>
          <button className="button button-quiet" onClick={() => importRef.current?.click()}>Import</button>
          <button className="button button-quiet danger" onClick={resetAll}>Clear data</button>
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept="application/json"
            onChange={(event) => importDraft(event.target.files?.[0])}
          />
        </div>
      </header>

      <div className="privacy-banner">
        <strong>Your answers stay in this browser.</strong> There is no account or backend.
        Names and addresses autosave locally; partnership and partner tax IDs do not.
      </div>

      <div className="workspace">
        <aside className="step-sidebar" aria-label="Interview sections">
          <div className="sidebar-heading">2025 Form 1065</div>
          {steps.map((item, index) => (
            <button
              key={item.title}
              className={`step-link ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`}
              onClick={() => goTo(index)}
            >
              <span className="step-number">{index < step ? '✓' : index + 1}</span>
              <span>{item.title}</span>
            </button>
          ))}
          <div className="source-links">
            <div>Official IRS sources</div>
            <a href={OFFICIAL_SOURCES.form} target="_blank">2025 Form 1065</a>
            <a href={OFFICIAL_SOURCES.instructions} target="_blank">2025 instructions</a>
            <a href={OFFICIAL_SOURCES.scheduleB1} target="_blank">Schedule B-1</a>
            <a href={OFFICIAL_SOURCES.scheduleK1} target="_blank">2025 Schedule K-1</a>
            <a href={OFFICIAL_SOURCES.scheduleK1Instructions} target="_blank">K-1 instructions</a>
            <a href={OFFICIAL_SOURCES.landing} target="_blank">IRS Form 1065 page</a>
          </div>
        </aside>

        <main className="interview">
          <div className="mobile-step">{step + 1} of {steps.length}</div>
          <div className="progress-track" aria-label={`${Math.round(progress)}% complete`}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <section className="interview-card">
            <div className="step-eyebrow">{steps[step].eyebrow}</div>
            <h1>{steps[step].title}</h1>
            {renderStep(step, draft, updateDraft, late, eligibility)}
          </section>

          <div className="navigation">
            <button
              className="button button-secondary"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                className="button button-primary"
                disabled={!canContinue}
                onClick={() => goTo(step + 1)}
              >
                Save and continue
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={eligibility.blockers.length > 0 || isGenerating}
                onClick={generatePdf}
              >
                {isGenerating ? 'Preparing package…' : 'Download draft filing package'}
              </button>
            )}
          </div>
          {generationError && <div className="error-banner">{generationError}</div>}
        </main>
      </div>

      <footer>
        Preparation aid only — not tax, legal, or filing advice. Review the complete return,
        schedules, attachments, signatures, and filing requirements with a qualified tax professional.
      </footer>
    </div>
  )
}

function renderStep(
  step: number,
  draft: ReturnDraft,
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void,
  late: ReturnType<typeof calculateLateFiling>,
  eligibility: ReturnType<typeof evaluateEligibility>,
) {
  switch (step) {
    case 0:
      return (
        <>
          <p className="lead">
            This guided path is intentionally narrow. Confirm each statement before continuing.
          </p>
          <InfoBlock title="Why the scope is narrow">
            Form 1065 can require many schedules and elections. This MVP prepares a reviewable
            draft only for a small, domestic, early-stage LLC with simple cash activity.
          </InfoBlock>
          <div className="confirmation-list">
            <CheckRow
              checked={draft.scope.domesticLlc}
              label="The business is a domestic multi-member LLC."
              detail="It was formed in a U.S. state and has at least two owners."
              onChange={(checked) => updateDraft((current) => {
                current.scope.domesticLlc = checked
                return current
              })}
            />
            <CheckRow
              checked={draft.scope.taxedAsPartnership}
              label="The LLC is taxed as a partnership."
              detail="It did not elect to be taxed as a C corporation or S corporation."
              onChange={(checked) => updateDraft((current) => {
                current.scope.taxedAsPartnership = checked
                return current
              })}
            />
            <CheckRow
              checked={draft.scope.calendarYear}
              label="The return covers January 1 through December 31, 2025."
              detail="The business does not use a fiscal tax year."
              onChange={(checked) => updateDraft((current) => {
                current.scope.calendarYear = checked
                return current
              })}
            />
            <CheckRow
              checked={draft.scope.atLeastTwoPartners}
              label="The LLC had at least two partners throughout 2025."
              detail="The current path does not support ownership changes during the year."
              onChange={(checked) => updateDraft((current) => {
                current.scope.atLeastTwoPartners = checked
                return current
              })}
            />
          </div>
          {!validateStep(0, draft) && (
            <InlineNotice tone="warning">
              Every statement must be true to use this guided path.
            </InlineNotice>
          )}
        </>
      )
    case 1:
      return <BusinessStep draft={draft} updateDraft={updateDraft} />
    case 2:
      return (
        <>
          <p className="lead">Enter the address the IRS should use for the partnership.</p>
          <AddressFields
            address={draft.business.address}
            onChange={(address) => updateDraft((current) => {
              current.business.address = address
              return current
            })}
          />
          <InfoBlock title="Use one canonical address">
            This address is reused for partners who select “same as business.” That avoids
            asking for or maintaining the same address multiple times.
          </InfoBlock>
        </>
      )
    case 3:
      return <PartnersStep draft={draft} updateDraft={updateDraft} />
    case 4:
      return <FilingStep draft={draft} updateDraft={updateDraft} late={late} />
    case 5:
      return <ComplexityStep draft={draft} updateDraft={updateDraft} />
    case 6:
      return <IncomeStep draft={draft} updateDraft={updateDraft} />
    case 7:
      return <ExpenseStep draft={draft} updateDraft={updateDraft} />
    case 8:
      return <PartnerSchedulesStep draft={draft} updateDraft={updateDraft} />
    case 9:
      return <RepresentativeStep draft={draft} updateDraft={updateDraft} />
    case 10:
      return <ReviewStep draft={draft} late={late} eligibility={eligibility} />
    default:
      return null
  }
}

function BusinessStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  const selectedPreset =
    activityPresets.find(
      (preset) =>
        preset.code === draft.business.businessCode &&
        preset.activity === draft.business.principalActivity,
    )?.label ?? 'Enter my own'

  return (
    <>
      <div className="field-grid">
        <Field label="Legal name of the LLC" className="wide">
          <input
            value={draft.business.legalName}
            onChange={(event) => updateDraft((current) => {
              current.business.legalName = event.target.value
              return current
            })}
            placeholder="Example Ventures LLC"
          />
        </Field>
        <Field label="Federal EIN" hint="Format: 12-3456789">
          <input
            value={draft.business.ein}
            onChange={(event) => updateDraft((current) => {
              current.business.ein = event.target.value
              return current
            })}
            placeholder="12-3456789"
            inputMode="numeric"
          />
        </Field>
        <Field label="Date business started">
          <input
            type="date"
            value={draft.business.startDate}
            onChange={(event) => updateDraft((current) => {
              current.business.startDate = event.target.value
              return current
            })}
          />
        </Field>
      </div>
      <InfoBlock title="Sensitive identifier">
        The EIN remains in the current tab so it can be placed in the PDF, but it is removed
        from automatic browser saves. A manually exported draft file will contain it.
      </InfoBlock>
      <CheckRow
        checked={draft.business.initialReturn}
        label="This is the partnership’s first Form 1065."
        detail="Turn this off only if the partnership filed Form 1065 for an earlier year."
        onChange={(checked) => updateDraft((current) => {
          current.business.initialReturn = checked
          return current
        })}
      />
      <Field label="Choose a business-activity starting point">
        <select
          value={selectedPreset}
          onChange={(event) => {
            const preset = activityPresets.find((item) => item.label === event.target.value)
            if (!preset) return
            updateDraft((current) => {
              current.business.principalActivity = preset.activity
              current.business.productOrService = preset.service
              current.business.businessCode = preset.code
              return current
            })
          }}
        >
          {activityPresets.map((preset) => (
            <option key={preset.label}>{preset.label}</option>
          ))}
        </select>
      </Field>
      <InfoBlock title="Presets never lock the answer">
        The selection only suggests a description and code. Every field below remains
        editable, and “Enter my own” clears the suggestions for fully manual entry.
      </InfoBlock>
      <div className="field-grid">
        <Field label="Principal business activity">
          <input
            value={draft.business.principalActivity}
            onChange={(event) => updateDraft((current) => {
              current.business.principalActivity = event.target.value
              return current
            })}
          />
        </Field>
        <Field label="Principal product or service">
          <input
            value={draft.business.productOrService}
            onChange={(event) => updateDraft((current) => {
              current.business.productOrService = event.target.value
              return current
            })}
          />
        </Field>
        <Field label="Business activity code" hint="Confirm in the IRS instructions">
          <input
            value={draft.business.businessCode}
            onChange={(event) => updateDraft((current) => {
              current.business.businessCode = event.target.value
              return current
            })}
            inputMode="numeric"
          />
        </Field>
        <Field label="Accounting method">
          <select
            value={draft.business.accountingMethod}
            onChange={(event) => updateDraft((current) => {
              current.business.accountingMethod = event.target.value as ReturnDraft['business']['accountingMethod']
              return current
            })}
          >
            <option value="cash">Cash</option>
            <option value="accrual">Accrual</option>
            <option value="other">Other / custom</option>
          </select>
        </Field>
        {draft.business.accountingMethod === 'other' && (
          <Field label="Custom accounting method">
            <input
              value={draft.business.customAccountingMethod}
              onChange={(event) => updateDraft((current) => {
                current.business.customAccountingMethod = event.target.value
                return current
              })}
              placeholder="Describe the accounting method"
            />
          </Field>
        )}
        <Field
          label="IRS center where the partnership filed"
          hint="Enter “E-file” when appropriate, or type the center shown in your records"
        >
          <input
            value={draft.business.irsFilingCenter}
            onChange={(event) => updateDraft((current) => {
              current.business.irsFilingCenter = event.target.value
              return current
            })}
          />
        </Field>
      </div>
      {draft.business.accountingMethod !== 'cash' && (
        <InlineNotice tone="warning">
          This choice can be recorded on the form, but package generation is blocked because the
          guided calculations model cash-basis records only.
        </InlineNotice>
      )}
    </>
  )
}

function PartnersStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  const ownershipTotal = draft.partners.reduce(
    (total, partner) => total + Number(partner.ownershipPercent || 0),
    0,
  )
  return (
    <>
      <p className="lead">
        Add every person or entity that was a partner during 2025. The supported path keeps
        the managing member as an individual, while other partner types can be entered manually.
      </p>
      {draft.partners.map((partner, index) => (
        <div className="partner-card" key={partner.id}>
          <div className="partner-heading">
            <div>
              <span>Partner {index + 1}</span>
              {partner.isManagingMember && <strong>Managing member</strong>}
            </div>
            {draft.partners.length > 2 && !partner.isManagingMember && (
              <button
                className="text-button danger"
                onClick={() => updateDraft((current) => {
                  current.partners = current.partners.filter((item) => item.id !== partner.id)
                  return current
                })}
              >
                Remove
              </button>
            )}
          </div>
          <div className="field-grid three">
            <Field label="Partner type">
              <select
                value={partner.ownerKind}
                disabled={partner.isManagingMember}
                onChange={(event) => {
                  const ownerKind = event.target.value as Partner['ownerKind']
                  updatePartner(updateDraft, partner.id, {
                    ownerKind,
                    entityType:
                      ownerKind === 'individual'
                        ? 'Individual'
                        : ownerKind === 'estate'
                          ? 'Estate'
                          : '',
                  })
                }}
              >
                <option value="individual">Individual</option>
                <option value="estate">Estate</option>
                <option value="entity">Business, trust, or organization</option>
              </select>
            </Field>
            {partner.ownerKind === 'individual' ? (
              <>
                <Field label="First name">
                  <input
                    value={partner.firstName}
                    onChange={(event) => updatePartner(updateDraft, partner.id, { firstName: event.target.value })}
                  />
                </Field>
                <Field label="Last name">
                  <input
                    value={partner.lastName}
                    onChange={(event) => updatePartner(updateDraft, partner.id, { lastName: event.target.value })}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={partner.ownerKind === 'estate' ? 'Estate name' : 'Legal name'}>
                  <input
                    value={partner.displayName}
                    onChange={(event) => updatePartner(updateDraft, partner.id, { displayName: event.target.value })}
                  />
                </Field>
                <Field
                  label="Entity type"
                  hint="Manual entry is allowed—for example, Partnership, S corporation, or Trust"
                >
                  <input
                    value={partner.entityType}
                    onChange={(event) => updatePartner(updateDraft, partner.id, { entityType: event.target.value })}
                  />
                </Field>
              </>
            )}
            <Field label="Ownership percentage">
              <div className="input-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={partner.ownershipPercent}
                  onChange={(event) => updatePartner(updateDraft, partner.id, { ownershipPercent: Number(event.target.value) })}
                />
                <span>%</span>
              </div>
            </Field>
          </div>
          <CheckRow
            checked={partner.useBusinessAddress}
            label="Use the partnership’s business address for this partner."
            detail="Turn this off to save a separate mailing address."
            onChange={(checked) => updatePartner(updateDraft, partner.id, { useBusinessAddress: checked })}
          />
          {!partner.useBusinessAddress && (
            <>
              <AddressFields
                address={partner.address}
                onChange={(address) => updatePartner(updateDraft, partner.id, { address })}
              />
              {!addressComplete(partner.address) && (
                <InlineNotice tone="warning">
                  Complete this mailing address so the partner’s Schedule K-1 has a deliverable address.
                </InlineNotice>
              )}
            </>
          )}
        </div>
      ))}
      <button
        className="button button-secondary"
        disabled={draft.partners.length >= 4}
        onClick={() => updateDraft((current) => {
          current.partners.push({
            id: crypto.randomUUID(),
            ownerKind: 'individual',
            firstName: '',
            lastName: '',
            displayName: '',
            entityType: 'Individual',
            taxId: '',
            country: 'United States',
            ownershipPercent: 0,
            profitPercent: 0,
            lossPercent: 0,
            capitalPercent: 0,
            isManagingMember: false,
            useBusinessAddress: true,
            address: emptyAddress(),
            beginningCapital: 0,
            capitalContributed: 0,
            cashDistributions: 0,
          })
          return current
        })}
      >
        Add another partner
      </button>
      <InlineNotice tone={Math.abs(ownershipTotal - 100) < 0.01 ? 'success' : 'warning'}>
        Ownership entered: {formatNumber(ownershipTotal)}%. It must total 100%.
      </InlineNotice>
      {partnersRequiringScheduleB1(draft).length > 0 && (
        <InfoBlock title="Schedule B-1 will be included">
          Form 1065 asks for Schedule B-1 when a person or entity directly or indirectly
          owns 50% or more of profit, loss, or capital. The filing package will include
          each directly entered partner meeting that threshold; indirect ownership still
          requires manual review.
        </InfoBlock>
      )}
    </>
  )
}

function PartnerSchedulesStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  const totals = allocationTotals(draft)
  return (
    <>
      <p className="lead">
        These answers populate Schedule B-1 and one Schedule K-1 for each partner.
        Tax IDs remain only in the current tab and are removed from automatic browser saves.
      </p>
      <div className="official-form-grid">
        <OfficialFormLink
          title="Schedule B-1"
          detail="Reports partners owning 50% or more."
          href={OFFICIAL_SOURCES.scheduleB1}
        />
        <OfficialFormLink
          title="2025 Schedule K-1"
          detail="Reports each partner’s share of partnership items."
          href={OFFICIAL_SOURCES.scheduleK1}
        />
        <OfficialFormLink
          title="K-1 instructions"
          detail="Definitions and partner reporting guidance."
          href={OFFICIAL_SOURCES.scheduleK1Instructions}
        />
      </div>

      {draft.partners.map((partner, index) => {
        const values = partnerScheduleValues(draft, partner)
        return (
          <div className="partner-card" key={partner.id}>
            <div className="partner-heading">
              <div>
                <span>{partnerDisplayName(partner) || `Partner ${index + 1}`}</span>
                {partner.isManagingMember && <strong>Managing member</strong>}
              </div>
              {maximumScheduleB1Percent(draft, partner) >= 50 && <strong>B-1 owner</strong>}
            </div>
            <div className="field-grid three">
              <Field
                label={partner.ownerKind === 'individual' ? 'SSN or TIN' : 'EIN or TIN'}
                hint="Sensitive: not auto-saved"
              >
                <input
                  value={partner.taxId}
                  onChange={(event) => updatePartner(updateDraft, partner.id, { taxId: event.target.value })}
                  placeholder={partner.ownerKind === 'individual' ? '123-45-6789' : '12-3456789'}
                />
              </Field>
              <Field
                label={
                  partner.ownerKind === 'individual'
                    ? 'Country of citizenship'
                    : 'Country of organization'
                }
              >
                <input
                  value={partner.country}
                  onChange={(event) => updateDraft((current) => {
                    const currentPartner = current.partners.find((item) => item.id === partner.id)
                    if (currentPartner) currentPartner.country = event.target.value
                    current.complexity.foreignPartner = current.partners.some(
                      (item) => item.country.trim() && !isUnitedStatesCountry(item.country),
                    )
                    return current
                  })}
                />
              </Field>
              <Field label="K-1 entity type">
                <input
                  value={partnerEntityType(partner)}
                  disabled={partner.ownerKind !== 'entity'}
                  onChange={(event) => updatePartner(updateDraft, partner.id, { entityType: event.target.value })}
                />
              </Field>
            </div>
            {draft.allocations.mode === 'ownership' && (
              <div className="calculation-strip compact">
                <SummaryMetric label="Income allocation" value={values.currentYearIncome} />
                <SummaryMetric label="Capital contributed" value={values.capitalContributed} />
                <SummaryMetric label="Ending capital" value={values.endingCapital} />
              </div>
            )}
            {draft.allocations.mode === 'custom' && (
              <div className="field-grid three">
                <Field label="Profit percentage">
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={partner.profitPercent}
                      onChange={(event) => updatePartner(updateDraft, partner.id, { profitPercent: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </div>
                </Field>
                <Field label="Loss percentage">
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={partner.lossPercent}
                      onChange={(event) => updatePartner(updateDraft, partner.id, { lossPercent: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </div>
                </Field>
                <Field label="Capital percentage">
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={partner.capitalPercent}
                      onChange={(event) => updatePartner(updateDraft, partner.id, { capitalPercent: Number(event.target.value) })}
                    />
                    <span>%</span>
                  </div>
                </Field>
                <MoneyField
                  label="Beginning capital account"
                  value={partner.beginningCapital}
                  onChange={(value) => updatePartner(updateDraft, partner.id, { beginningCapital: value })}
                />
                <MoneyField
                  label="Capital contributed in 2025"
                  value={partner.capitalContributed}
                  onChange={(value) => updatePartner(updateDraft, partner.id, { capitalContributed: value })}
                />
                <MoneyField
                  label="Cash distributions in 2025"
                  value={partner.cashDistributions}
                  onChange={(value) => updatePartner(updateDraft, partner.id, { cashDistributions: value })}
                />
              </div>
            )}
          </div>
        )
      })}

      <Field label="How should K-1 percentages, contributions, and distributions be entered?">
        <select
          value={draft.allocations.mode}
          onChange={(event) => updateDraft((current) => {
            current.allocations.mode = event.target.value as ReturnDraft['allocations']['mode']
            return current
          })}
        >
          <option value="ownership">Automatically, using ownership percentages</option>
          <option value="custom">Enter each partner’s percentages and amounts manually</option>
        </select>
      </Field>

      {draft.allocations.mode === 'custom' && (
        <div className="allocation-checks">
          <AllocationCheck label="Profit percentages" actual={totals.profitPercent} expected={100} suffix="%" />
          <AllocationCheck label="Loss percentages" actual={totals.lossPercent} expected={100} suffix="%" />
          <AllocationCheck label="Capital percentages" actual={totals.capitalPercent} expected={100} suffix="%" />
          <AllocationCheck label="Beginning capital" actual={totals.beginningCapital} expected={draft.finances.beginningCapital} />
          <AllocationCheck label="Contributions" actual={totals.capitalContributed} expected={draft.finances.memberContributions} />
          <AllocationCheck label="Distributions" actual={totals.cashDistributions} expected={draft.finances.cashDistributions} />
        </div>
      )}
      {draft.partners.some(
        (partner) => partner.country.trim() && !isUnitedStatesCountry(partner.country),
      ) && (
        <InlineNotice tone="warning">
          Foreign partners are outside this guided path. Change the country or use professional
          preparation for the additional withholding and reporting rules.
        </InlineNotice>
      )}
      <InfoBlock title="Allocation review is still required" tone="warning">
        Ownership percentages do not always determine tax allocations. The automatic option is
        only the golden-path assumption. Use custom entry when the operating agreement or tax
        records allocate items differently, and have the completed K-1s professionally reviewed.
      </InfoBlock>
    </>
  )
}

function FilingStep({
  draft,
  updateDraft,
  late,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
  late: ReturnType<typeof calculateLateFiling>
}) {
  return (
    <>
      <InfoBlock title="2025 calendar-year deadline">
        The official instructions state that the 2025 Form 1065 was due March 16, 2026.
        A timely Form 7004 generally extends filing to September 15, 2026.
      </InfoBlock>
      <div className="field-grid">
        <Field label="When do you expect to file?">
          <input
            type="date"
            value={draft.filing.plannedFileDate}
            onChange={(event) => updateDraft((current) => {
              current.filing.plannedFileDate = event.target.value
              return current
            })}
          />
        </Field>
        <Field label="Was Form 7004 filed on time?">
          <YesNoSelect
            value={draft.filing.extensionFiled}
            onChange={(value) => updateDraft((current) => {
              current.filing.extensionFiled = value
              return current
            })}
          />
        </Field>
        <Field label="Were all Schedules K-1 filed and given to partners by the applicable due date?">
          <YesNoSelect
            value={draft.filing.schedulesK1Timely}
            onChange={(value) => updateDraft((current) => {
              current.filing.schedulesK1Timely = value
              return current
            })}
          />
        </Field>
      </div>
      <LateStatus result={late} partnerCount={draft.partners.length} />
      {late.status === 'late' && (
        <>
          <InfoBlock title="Reasonable-cause notes are not automatic relief" tone="warning">
            The IRS instructions say the late-filing penalty may not apply when the failure
            is due to reasonable cause. Whether a particular explanation qualifies is a
            tax judgment. Keep evidence and have the final wording reviewed.
          </InfoBlock>
          <Field label="Start with an editable notes template">
            <select
              value={draft.filing.lateReasonTemplate}
              onChange={(event) => updateDraft((current) => {
                current.filing.lateReasonTemplate = event.target.value
                current.filing.lateReasonNotes = lateReasonTemplates[event.target.value] ?? ''
                return current
              })}
            >
              <option value="first-year">First-year filing misunderstanding</option>
              <option value="records">Records temporarily unavailable</option>
              <option value="adviser">Reliance on an adviser</option>
              <option value="custom">Write my own</option>
            </select>
          </Field>
          <Field label="Late-filing notes" hint="For review and recordkeeping; not inserted into the PDF">
            <textarea
              rows={7}
              value={draft.filing.lateReasonNotes || lateReasonTemplates[draft.filing.lateReasonTemplate]}
              onChange={(event) => updateDraft((current) => {
                current.filing.lateReasonNotes = event.target.value
                return current
              })}
            />
          </Field>
        </>
      )}
    </>
  )
}

function ComplexityStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  const selected = Object.values(draft.complexity).filter(Boolean).length
  return (
    <>
      <p className="lead">
        Select anything that happened in 2025. A selection does not mean something is wrong;
        it means this narrow draft generator should stop and direct you to broader tax support.
      </p>
      <div className="complexity-grid">
        {complexityQuestions.map((question) => (
          <CheckRow
            key={question.key}
            checked={draft.complexity[question.key]}
            label={question.label}
            detail={question.detail}
            onChange={(checked) => updateDraft((current) => {
              current.complexity[question.key] = checked
              return current
            })}
          />
        ))}
      </div>
      <InlineNotice tone={selected === 0 ? 'success' : 'warning'}>
        {selected === 0
          ? 'No unsupported complexity selected.'
          : `${selected} unsupported item${selected === 1 ? '' : 's'} selected. The app will preserve your draft but will not generate the tax form.`}
      </InlineNotice>
    </>
  )
}

function IncomeStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  return (
    <>
      <InfoBlock title="Customer revenue and owner funding are different">
        Money paid by customers for products or services is revenue. Money transferred from
        a member’s personal account to fund the LLC is generally a capital contribution, not
        gross receipts. Enter them separately below.
      </InfoBlock>
      <div className="field-grid">
        <MoneyField
          label="Customer payments earned in 2025"
          value={draft.finances.grossReceipts}
          onChange={(value) => updateFinance(updateDraft, 'grossReceipts', value)}
        />
        <MoneyField
          label="Refunds or allowances given to customers"
          value={draft.finances.returnsAndAllowances}
          onChange={(value) => updateFinance(updateDraft, 'returnsAndAllowances', value)}
        />
        <MoneyField
          label="Personal funds contributed by members"
          value={draft.finances.memberContributions}
          onChange={(value) => updateFinance(updateDraft, 'memberContributions', value)}
        />
        <MoneyField
          label="Cash distributed back to members"
          value={draft.finances.cashDistributions}
          onChange={(value) => updateFinance(updateDraft, 'cashDistributions', value)}
        />
        <MoneyField
          label="Business cash on January 1, 2025"
          value={draft.finances.beginningCash}
          onChange={(value) => updateFinance(updateDraft, 'beginningCash', value)}
        />
        <MoneyField
          label="Partners’ capital on January 1, 2025"
          value={draft.finances.beginningCapital}
          onChange={(value) => updateFinance(updateDraft, 'beginningCapital', value)}
        />
      </div>
      <div className="calculation-strip">
        <SummaryMetric label="Net customer receipts" value={netReceipts(draft)} />
        <SummaryMetric label="Member contributions" value={draft.finances.memberContributions} />
      </div>
      {draft.finances.grossReceipts >= 2_000 && (
        <InlineNotice tone="warning">
          This MVP supports less than $2,000 of customer receipts.
        </InlineNotice>
      )}
    </>
  )
}

function ExpenseStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  return (
    <>
      <p className="lead">
        Enter only expenses paid or incurred by the partnership under its accounting records.
      </p>
      <div className="field-grid">
        <MoneyField label="Repairs and maintenance" value={draft.finances.repairs} onChange={(value) => updateFinance(updateDraft, 'repairs', value)} />
        <MoneyField label="Rent" value={draft.finances.rent} onChange={(value) => updateFinance(updateDraft, 'rent', value)} />
        <MoneyField label="Taxes and licenses" value={draft.finances.taxesAndLicenses} onChange={(value) => updateFinance(updateDraft, 'taxesAndLicenses', value)} />
        <MoneyField label="Business interest" value={draft.finances.interest} onChange={(value) => updateFinance(updateDraft, 'interest', value)} />
      </div>
      <h2 className="subheading">Other ordinary business expenses</h2>
      <p className="helper-text">
        These items are totaled on page 1, line 21 and included on an appended statement.
      </p>
      {draft.finances.otherExpenses.map((expense) => (
        <div className="expense-row" key={expense.id}>
          <input
            aria-label="Expense description"
            value={expense.description}
            onChange={(event) => updateDraft((current) => {
              const item = current.finances.otherExpenses.find((entry) => entry.id === expense.id)
              if (item) item.description = event.target.value
              return current
            })}
          />
          <div className="money-input">
            <span>$</span>
            <input
              aria-label={`${expense.description} amount`}
              type="number"
              min="0"
              step="0.01"
              value={expense.amount}
              onChange={(event) => updateDraft((current) => {
                const item = current.finances.otherExpenses.find((entry) => entry.id === expense.id)
                if (item) item.amount = Number(event.target.value)
                return current
              })}
            />
          </div>
        </div>
      ))}
      <div className="calculation-strip">
        <SummaryMetric label="Total expenses" value={totalExpenses(draft)} />
        <SummaryMetric label="Ordinary income (loss)" value={ordinaryIncome(draft)} />
        <SummaryMetric label="Calculated ending cash" value={endingCash(draft)} />
      </div>
    </>
  )
}

function RepresentativeStep({
  draft,
  updateDraft,
}: {
  draft: ReturnDraft
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void
}) {
  const details = representativeDetails(draft)
  return (
    <>
      <InfoBlock title="What is the partnership representative?">
        If the partnership does not make a valid election out of the centralized partnership
        audit regime, Form 1065 asks for a partnership representative who can act for the
        partnership in an IRS proceeding. This draft defaults to the managing member.
      </InfoBlock>
      <CheckRow
        checked={draft.representative.sameAsManagingMember}
        label="Use the managing member as the partnership representative."
        detail="Their saved name and address will be reused."
        onChange={(checked) => updateDraft((current) => {
          current.representative.sameAsManagingMember = checked
          return current
        })}
      />
      {!draft.representative.sameAsManagingMember && (
        <>
          <div className="field-grid">
            <Field label="Representative first name">
              <input value={draft.representative.firstName} onChange={(event) => updateDraft((current) => {
                current.representative.firstName = event.target.value
                return current
              })} />
            </Field>
            <Field label="Representative last name">
              <input value={draft.representative.lastName} onChange={(event) => updateDraft((current) => {
                current.representative.lastName = event.target.value
                return current
              })} />
            </Field>
          </div>
          <AddressFields
            address={draft.representative.address}
            onChange={(address) => updateDraft((current) => {
              current.representative.address = address
              return current
            })}
          />
        </>
      )}
      <Field label="U.S. phone number for the representative">
        <input
          value={draft.representative.phone}
          onChange={(event) => updateDraft((current) => {
            current.representative.phone = event.target.value
            return current
          })}
          placeholder="555-555-0123"
          inputMode="tel"
        />
      </Field>
      <InlineNotice tone="success">
        Draft representative: {details.firstName || '—'} {details.lastName || '—'}
      </InlineNotice>
    </>
  )
}

function ReviewStep({
  draft,
  late,
  eligibility,
}: {
  draft: ReturnDraft
  late: ReturnType<typeof calculateLateFiling>
  eligibility: ReturnType<typeof evaluateEligibility>
}) {
  const q4 = qualifiesForScheduleBQuestion4(draft)
  const b1OwnerCount = partnersRequiringScheduleB1(draft).length
  return (
    <>
      <p className="lead">
        Review the derived answers before downloading the draft filing package.
      </p>
      <div className="review-grid">
        <ReviewSection title="Partnership">
          <ReviewRow label="Legal name" value={draft.business.legalName} />
          <ReviewRow label="EIN" value={draft.business.ein || 'Not entered'} />
          <ReviewRow label="Partners" value={String(draft.partners.length)} />
          <ReviewRow label="Managing owner" value={`${draft.partners.find((partner) => partner.isManagingMember)?.ownershipPercent ?? 0}%`} />
        </ReviewSection>
        <ReviewSection title="2025 activity">
          <ReviewRow label="Customer receipts" value={formatCurrency(draft.finances.grossReceipts)} />
          <ReviewRow label="Member contributions" value={formatCurrency(draft.finances.memberContributions)} />
          <ReviewRow label="Total expenses" value={formatCurrency(totalExpenses(draft))} />
          <ReviewRow label="Ordinary income (loss)" value={formatCurrency(ordinaryIncome(draft))} />
          <ReviewRow label="Ending cash" value={formatCurrency(endingCash(draft))} />
          <ReviewRow label="Ending capital" value={formatCurrency(endingCapital(draft))} />
        </ReviewSection>
        <ReviewSection title="Filing timing">
          <ReviewRow label="Due date used" value={formatDate(late.dueDate)} />
          <ReviewRow label="Status" value={late.status.replace('-', ' ')} />
          <ReviewRow label="Estimated section 6698 penalty" value={formatCurrency(late.estimatedPenalty)} />
          <ReviewRow label="Schedule B question 4" value={q4 ? 'Yes' : 'No'} />
        </ReviewSection>
        <ReviewSection title="PDF output">
          <ReviewRow label="Official form" value="2025 IRS Form 1065" />
          <ReviewRow label="Other-deduction statement" value={draft.finances.otherExpenses.some((item) => item.amount > 0) ? 'Appended' : 'Not needed'} />
          <ReviewRow label="Schedules K-1" value={`${draft.partners.length} included`} />
          <ReviewRow label="Schedule B-1" value={b1OwnerCount > 0 ? `Included for ${b1OwnerCount} owner${b1OwnerCount === 1 ? '' : 's'}` : 'Not required from direct ownership entered'} />
        </ReviewSection>
      </div>

      {eligibility.blockers.length > 0 && (
        <div className="review-list blocker-list">
          <h2>Generation blocked</h2>
          {eligibility.blockers.map((item) => <div key={item}>× {item}</div>)}
        </div>
      )}
      <div className="review-list warning-list">
        <h2>Required review</h2>
        {eligibility.warnings.map((item) => <div key={item}>! {item}</div>)}
        <div>! The return must be signed and dated outside this app.</div>
        <div>! Confirm the filing address or approved e-file method in the official instructions.</div>
      </div>
      <InfoBlock title="What the download contains" tone="warning">
        The app fills supported fields on the official six-page 2025 Form 1065, includes
        Schedule B-1 when direct ownership entered reaches 50%, creates one Schedule K-1
        per partner, and appends an “other deductions” statement when needed. It does not
        generate state returns, e-file data, indirect-ownership reporting, or a
        reasonable-cause request.
      </InfoBlock>
    </>
  )
}

function LateStatus({
  result,
  partnerCount,
}: {
  result: ReturnType<typeof calculateLateFiling>
  partnerCount: number
}) {
  if (result.status === 'unknown') {
    return <InlineNotice tone="warning">Choose whether Form 7004 was filed to determine the applicable deadline.</InlineNotice>
  }
  if (result.status === 'on-time') {
    return <InlineNotice tone="success">The selected filing date is on or before March 16, 2026.</InlineNotice>
  }
  if (result.status === 'extended') {
    return <InlineNotice tone="success">With a timely extension, the selected date is on or before September 15, 2026.</InlineNotice>
  }
  return (
    <InlineNotice tone="warning">
      Estimated late period: {result.monthsLate} month{result.monthsLate === 1 ? '' : 's'} or partial months.
      At $255 × {partnerCount} partner{partnerCount === 1 ? '' : 's'} × {result.monthsLate},
      the estimated penalty is {formatCurrency(result.estimatedPenalty)}. The IRS decides
      the actual penalty and any reasonable-cause relief.
    </InlineNotice>
  )
}

function AddressFields({
  address,
  onChange,
}: {
  address: Address
  onChange: (address: Address) => void
}) {
  const update = (field: keyof Address, value: string) =>
    onChange({ ...address, [field]: value })
  return (
    <div className="field-grid address-grid">
      <Field label="Street address" className="wide">
        <input value={address.street} onChange={(event) => update('street', event.target.value)} />
      </Field>
      <Field label="Suite or unit">
        <input value={address.suite} onChange={(event) => update('suite', event.target.value)} />
      </Field>
      <Field label="City">
        <input value={address.city} onChange={(event) => update('city', event.target.value)} />
      </Field>
      <Field label="State">
        <input value={address.state} maxLength={2} onChange={(event) => update('state', event.target.value.toUpperCase())} />
      </Field>
      <Field label="ZIP code">
        <input value={address.zip} inputMode="numeric" onChange={(event) => update('zip', event.target.value)} />
      </Field>
    </div>
  )
}

function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      {children}
    </label>
  )
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <div className="money-input">
        <span>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </Field>
  )
}

function YesNoSelect({
  value,
  onChange,
}: {
  value: YesNoUnknown
  onChange: (value: YesNoUnknown) => void
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as YesNoUnknown)}>
      <option value="unknown">I’m not sure yet</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

function CheckRow({
  checked,
  label,
  detail,
  onChange,
}: {
  checked: boolean
  label: string
  detail: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="custom-check">{checked ? '✓' : ''}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  )
}

function InfoBlock({
  title,
  tone = 'info',
  children,
}: {
  title: string
  tone?: 'info' | 'warning'
  children: React.ReactNode
}) {
  return (
    <div className={`info-block ${tone}`}>
      <div className="info-icon">i</div>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  )
}

function InlineNotice({
  tone,
  children,
}: {
  tone: 'success' | 'warning'
  children: React.ReactNode
}) {
  return <div className={`inline-notice ${tone}`}>{children}</div>
}

function OfficialFormLink({
  title,
  detail,
  href,
}: {
  title: string
  detail: string
  href: string
}) {
  return (
    <a className="official-form-link" href={href} target="_blank" rel="noreferrer">
      <strong>{title}</strong>
      <span>{detail}</span>
      <small>Open official IRS PDF ↗</small>
    </a>
  )
}

function AllocationCheck({
  label,
  actual,
  expected,
  suffix,
}: {
  label: string
  actual: number
  expected: number
  suffix?: string
}) {
  const matches = Math.abs(actual - expected) < 0.01
  const display = suffix
    ? `${formatNumber(actual)}${suffix} of ${formatNumber(expected)}${suffix}`
    : `${formatCurrency(actual)} of ${formatCurrency(expected)}`
  return (
    <InlineNotice tone={matches ? 'success' : 'warning'}>
      <strong>{label}:</strong> {display}
    </InlineNotice>
  )
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-section">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function updatePartner(
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void,
  id: string,
  values: Partial<Partner>,
) {
  updateDraft((current) => {
    const partner = current.partners.find((item) => item.id === id)
    if (partner) Object.assign(partner, values)
    return current
  })
}

function updateFinance(
  updateDraft: (update: (current: ReturnDraft) => ReturnDraft) => void,
  key: keyof Omit<ReturnDraft['finances'], 'otherExpenses'>,
  value: number,
) {
  updateDraft((current) => {
    current.finances[key] = value
    return current
  })
}

function validateStep(step: number, draft: ReturnDraft): boolean {
  switch (step) {
    case 0:
      return Object.values(draft.scope).every(Boolean)
    case 1:
      return Boolean(
        draft.business.legalName.trim() &&
        /^\d{2}-\d{7}$/.test(draft.business.ein) &&
        draft.business.startDate &&
        draft.business.principalActivity.trim() &&
        draft.business.productOrService.trim() &&
        /^\d{6}$/.test(draft.business.businessCode) &&
        (draft.business.accountingMethod !== 'other' ||
          draft.business.customAccountingMethod.trim()),
      )
    case 2:
      return addressComplete(draft.business.address)
    case 3: {
      const total = draft.partners.reduce((sum, partner) => sum + Number(partner.ownershipPercent || 0), 0)
      const ownershipIsValid = draft.partners.every(
        (partner) =>
          Number.isFinite(partner.ownershipPercent) &&
          partner.ownershipPercent >= 0 &&
          partner.ownershipPercent <= 100,
      )
      return (
        draft.partners.length >= 2 &&
        draft.partners.every((partner) =>
          (partner.ownerKind === 'individual'
            ? partner.firstName.trim() && partner.lastName.trim()
            : partner.displayName.trim() &&
              (partner.ownerKind !== 'entity' || partner.entityType.trim())) &&
          (partner.useBusinessAddress || addressComplete(partner.address)),
        ) &&
        ownershipIsValid &&
        Math.abs(total - 100) < 0.01 &&
        draft.partners.filter((partner) => partner.isManagingMember).length === 1 &&
        (draft.partners.find((partner) => partner.isManagingMember)?.ownershipPercent ?? 0) >= 50 &&
        draft.partners.find((partner) => partner.isManagingMember)?.ownerKind === 'individual'
      )
    }
    case 4:
      return (
        draft.filing.extensionFiled !== 'unknown' &&
        draft.filing.schedulesK1Timely !== 'unknown' &&
        Boolean(draft.filing.plannedFileDate)
      )
    case 5:
      return !Object.values(draft.complexity).some(Boolean)
    case 6:
      return (
        draft.finances.grossReceipts >= 0 &&
        draft.finances.grossReceipts < 2_000 &&
        draft.finances.returnsAndAllowances <= draft.finances.grossReceipts
      )
    case 7:
      return (
        totalExpenses(draft) >= 0 &&
        draft.finances.otherExpenses.every((item) => item.amount === 0 || item.description.trim())
      )
    case 8: {
      const totals = allocationTotals(draft)
      const percentagesAreValid = draft.partners.every((partner) =>
        [partner.profitPercent, partner.lossPercent, partner.capitalPercent].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 100,
        ),
      )
      return (
        Boolean(draft.business.irsFilingCenter.trim()) &&
        draft.partners.every(
          (partner) =>
            /^(?:\d{2}-?\d{7}|\d{3}-?\d{2}-?\d{4})$/.test(partner.taxId) &&
            isUnitedStatesCountry(partner.country),
        ) &&
        (draft.allocations.mode !== 'custom' ||
          (percentagesAreValid &&
            Math.abs(totals.profitPercent - 100) < 0.01 &&
            Math.abs(totals.lossPercent - 100) < 0.01 &&
            Math.abs(totals.capitalPercent - 100) < 0.01 &&
            Math.abs(totals.beginningCapital - draft.finances.beginningCapital) < 0.01 &&
            Math.abs(totals.capitalContributed - draft.finances.memberContributions) < 0.01 &&
            Math.abs(totals.cashDistributions - draft.finances.cashDistributions) < 0.01))
      )
    }
    case 9: {
      const representative = representativeDetails(draft)
      return Boolean(
        representative.firstName.trim() &&
        representative.lastName.trim() &&
        representative.phone.trim() &&
        addressComplete(representative.address),
      )
    }
    default:
      return true
  }
}

function addressComplete(address: Address): boolean {
  return Boolean(
    address.street.trim() &&
    address.city.trim() &&
    /^[A-Z]{2}$/.test(address.state) &&
    /^\d{5}(?:-\d{4})?$/.test(address.zip),
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function fileSafe(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'partnership'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default App

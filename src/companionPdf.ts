import {
  PDFDocument,
  StandardFonts,
} from 'pdf-lib'
import { effectivePartnerAddress, ordinaryIncome } from './domain'
import {
  formatAmount,
  generateForm1065,
  selectCheckboxOption,
  selectYesNo,
  setText,
} from './pdf'
import {
  isUnitedStatesCountry,
  maximumScheduleB1Percent,
  partnerDisplayName,
  partnerEntityType,
  partnerScheduleValues,
  partnersRequiringScheduleB1,
} from './schedules'
import type { Address, Partner, ReturnDraft } from './types'

export interface FilingPackageSources {
  form1065: Uint8Array
  scheduleB1: Uint8Array
  scheduleK1: Uint8Array
}

export async function generateFilingPackage(
  sources: FilingPackageSources,
  draft: ReturnDraft,
): Promise<Uint8Array> {
  const documents: { bytes: Uint8Array; pages?: number[] }[] = []
  documents.push({
    bytes: await flattenPdf(await generateForm1065(sources.form1065, draft)),
  })

  const b1Owners = partnersRequiringScheduleB1(draft)
  if (b1Owners.length > 0) {
    documents.push({
      bytes: await generateScheduleB1(sources.scheduleB1, draft),
      pages: [0],
    })
  }

  for (const partner of draft.partners) {
    documents.push({
      bytes: await generateScheduleK1(sources.scheduleK1, draft, partner),
    })
  }

  const output = await PDFDocument.create()
  for (const item of documents) {
    const source = await PDFDocument.load(item.bytes)
    const pageIndexes =
      item.pages ?? Array.from({ length: source.getPageCount() }, (_, index) => index)
    const pages = await output.copyPages(source, pageIndexes)
    pages.forEach((page) => output.addPage(page))
  }
  output.setTitle(`DRAFT 2025 Form 1065 filing package - ${draft.business.legalName}`)
  output.setSubject(
    'Draft Form 1065, Schedule B-1, and partner Schedules K-1 for professional review',
  )
  output.setCreator('Form 1065 Interviewer')
  return output.save()
}

export async function generateScheduleB1(
  sourcePdf: Uint8Array,
  draft: ReturnDraft,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.load(sourcePdf)
  const form = document.getForm()
  const font = await document.embedFont(StandardFonts.Helvetica)
  setText(form, 'f1_1[0]', draft.business.legalName)
  setText(form, 'f1_2[0]', draft.business.ein)

  const entityOwners = partnersRequiringScheduleB1(draft).filter(
    (partner) => partner.ownerKind === 'entity',
  )
  entityOwners.forEach((partner, index) => {
    const start = 3 + index * 5
    setText(form, `f1_${start}[0]`, partnerDisplayName(partner))
    setText(form, `f1_${start + 1}[0]`, partner.taxId)
    setText(form, `f1_${start + 2}[0]`, partnerEntityType(partner))
    setText(form, `f1_${start + 3}[0]`, partner.country)
    setText(form, `f1_${start + 4}[0]`, formatB1Percent(maximumScheduleB1Percent(draft, partner)))
  })

  const individualOwners = partnersRequiringScheduleB1(draft).filter(
    (partner) => partner.ownerKind !== 'entity',
  )
  individualOwners.forEach((partner, index) => {
    const start = 38 + index * 4
    setText(form, `f1_${start}[0]`, partnerDisplayName(partner))
    setText(form, `f1_${start + 1}[0]`, partner.taxId)
    setText(form, `f1_${start + 2}[0]`, partner.country)
    setText(form, `f1_${start + 3}[0]`, formatB1Percent(maximumScheduleB1Percent(draft, partner)))
  })

  form.updateFieldAppearances(font)
  if (options.flatten !== false) {
    form.flatten()
  }
  document.setTitle(`Schedule B-1 - ${draft.business.legalName}`)
  return document.save()
}

export async function generateScheduleK1(
  sourcePdf: Uint8Array,
  draft: ReturnDraft,
  partner: Partner,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.load(sourcePdf)
  const form = document.getForm()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const values = partnerScheduleValues(draft, partner)
  const partnerAddress = effectivePartnerAddress(draft, partner)

  setText(form, 'f1_6[0]', draft.business.ein)
  setText(
    form,
    'f1_7[0]',
    formatNameAndAddress(draft.business.legalName, draft.business.address),
  )
  setText(form, 'f1_8[0]', draft.business.irsFilingCenter)
  setText(form, 'f1_9[0]', partner.taxId)
  setText(
    form,
    'f1_10[0]',
    formatNameAndAddress(partnerDisplayName(partner), partnerAddress),
  )
  selectCheckboxOption(
    form,
    'c1_4',
    partner.isManagingMember ? 0 : 1,
    2,
  )
  selectCheckboxOption(
    form,
    'c1_5',
    isUnitedStatesCountry(partner.country) ? 0 : 1,
    2,
  )
  setText(form, 'f1_13[0]', partnerEntityType(partner))
  for (const suffix of ['f1_14[0]', 'f1_15[0]']) {
    setText(form, suffix, formatK1Percent(values.profitPercent))
  }
  for (const suffix of ['f1_16[0]', 'f1_17[0]']) {
    setText(form, suffix, formatK1Percent(values.lossPercent))
  }
  for (const suffix of ['f1_18[0]', 'f1_19[0]']) {
    setText(form, suffix, formatK1Percent(values.capitalPercent))
  }

  setText(form, 'f1_26[0]', formatAmount(values.beginningCapital))
  setText(form, 'f1_27[0]', formatAmount(values.capitalContributed))
  setText(form, 'f1_28[0]', formatAmount(values.currentYearIncome))
  setText(form, 'f1_30[0]', formatAmount(values.cashDistributions))
  setText(form, 'f1_31[0]', formatAmount(values.endingCapital))
  selectYesNo(form, 'c1_11', false)
  setText(form, 'f1_34[0]', formatAmount(values.currentYearIncome))

  if (values.cashDistributions !== 0) {
    setText(form, 'Line19[0]', 'A')
    setText(form, 'f1_89[0]', formatAmount(values.cashDistributions))
  }

  form.updateFieldAppearances(font)
  if (options.flatten !== false) {
    form.flatten()
  }
  document.setTitle(`2025 Schedule K-1 - ${partnerDisplayName(partner)}`)
  document.setSubject(
    `Draft partner schedule; total partnership ordinary income ${formatAmount(ordinaryIncome(draft))}`,
  )
  return document.save()
}

async function flattenPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes)
  const form = document.getForm()
  if (form.getFields().length > 0) {
    form.flatten()
  }
  return document.save()
}

function formatNameAndAddress(name: string, address: Address): string {
  const street = [address.street, address.suite].filter(Boolean).join(', ')
  const cityLine = `${address.city}, ${address.state} ${address.zip}`.trim()
  return [name, street, cityLine].filter(Boolean).join('\n')
}

function formatK1Percent(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : ''
}

function formatB1Percent(value: number): string {
  return Number.isFinite(value)
    ? `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`
    : ''
}

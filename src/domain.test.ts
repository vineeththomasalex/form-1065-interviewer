import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from './defaults'
import {
  calculateLateFiling,
  endingCash,
  evaluateEligibility,
  ordinaryIncome,
  qualifiesForScheduleBQuestion4,
} from './domain'

function validDraft() {
  const draft = createDefaultDraft()
  draft.business.legalName = 'Example Ventures LLC'
  draft.business.ein = '12-3456789'
  draft.business.address = {
    street: '100 Main St',
    suite: '',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
  }
  draft.partners[0].firstName = 'Alex'
  draft.partners[0].lastName = 'Manager'
  draft.partners[1].firstName = 'Jordan'
  draft.partners[1].lastName = 'Partner'
  draft.filing.extensionFiled = 'no'
  draft.filing.schedulesK1Timely = 'no'
  draft.finances.grossReceipts = 900
  draft.finances.memberContributions = 1_500
  draft.finances.otherExpenses[0].amount = 300
  draft.representative.phone = '555-555-0123'
  return draft
}

describe('golden-path calculations', () => {
  it('does not treat member contributions as revenue', () => {
    const draft = validDraft()
    expect(ordinaryIncome(draft)).toBe(600)
    expect(endingCash(draft)).toBe(2_100)
  })

  it('uses the small-partnership schedule exception only when K-1s were timely', () => {
    const draft = validDraft()
    expect(qualifiesForScheduleBQuestion4(draft)).toBe(false)
    draft.filing.schedulesK1Timely = 'yes'
    expect(qualifiesForScheduleBQuestion4(draft)).toBe(true)
  })

  it('accepts the narrow supported facts', () => {
    const result = evaluateEligibility(validDraft())
    expect(result.blockers).toEqual([])
    expect(result.warnings.some((warning) => warning.includes('Schedule B-1'))).toBe(true)
  })

  it('blocks unsupported complexity', () => {
    const draft = validDraft()
    draft.complexity.digitalAssets = true
    expect(evaluateEligibility(draft).blockers).toContain(
      'This draft does not support digital-asset receipts, sales, exchanges, or dispositions.',
    )
  })

  it('blocks an unbalanced cash-only Schedule L', () => {
    const draft = validDraft()
    draft.finances.beginningCapital = 100
    expect(
      evaluateEligibility(draft).blockers.some((blocker) =>
        blocker.startsWith('Beginning cash and beginning capital must match'),
      ),
    ).toBe(true)
  })
})

describe('late filing estimate', () => {
  it('counts each month or partial month after March 16', () => {
    const result = calculateLateFiling(
      {
        plannedFileDate: '2026-07-13',
        extensionFiled: 'no',
        schedulesK1Timely: 'no',
        lateReasonTemplate: 'first-year',
        lateReasonNotes: '',
      },
      2,
    )
    expect(result.status).toBe('late')
    expect(result.monthsLate).toBe(4)
    expect(result.estimatedPenalty).toBe(2_040)
  })

  it('recognizes a timely extended return', () => {
    const result = calculateLateFiling(
      {
        plannedFileDate: '2026-07-13',
        extensionFiled: 'yes',
        schedulesK1Timely: 'yes',
        lateReasonTemplate: 'first-year',
        lateReasonNotes: '',
      },
      2,
    )
    expect(result.status).toBe('extended')
    expect(result.estimatedPenalty).toBe(0)
  })
})

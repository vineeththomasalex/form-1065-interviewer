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
  draft.partners[0].taxId = '111-22-3333'
  draft.partners[1].firstName = 'Jordan'
  draft.partners[1].lastName = 'Partner'
  draft.partners[1].taxId = '444-55-6666'
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

  it('blocks custom partner allocations that do not reconcile', () => {
    const draft = validDraft()
    draft.allocations.mode = 'custom'
    draft.partners[0].profitPercent = 80
    draft.partners[1].profitPercent = 30

    expect(evaluateEligibility(draft).blockers).toContain(
      'Custom profit percentages must add up to 100%.',
    )
  })

  it('blocks out-of-range custom percentages even when they total 100%', () => {
    const draft = validDraft()
    draft.allocations.mode = 'custom'
    draft.partners[0].profitPercent = -10
    draft.partners[1].profitPercent = 110

    expect(evaluateEligibility(draft).blockers).toContain(
      'Every custom profit, loss, and capital percentage must be between 0% and 100%.',
    )
  })

  it('blocks out-of-range ownership even when ownership totals 100%', () => {
    const draft = validDraft()
    draft.partners[0].ownershipPercent = 110
    draft.partners[1].ownershipPercent = -10

    expect(evaluateEligibility(draft).blockers).toContain(
      'Every partner ownership percentage must be between 0% and 100%.',
    )
  })

  it('blocks non-cash accounting methods and incomplete shared addresses', () => {
    const draft = validDraft()
    draft.business.accountingMethod = 'accrual'
    draft.business.address.street = ''

    const blockers = evaluateEligibility(draft).blockers
    expect(blockers).toContain(
      'Accrual and custom accounting methods are outside this cash-basis guided path.',
    )
    expect(blockers).toContain('The partnership needs a complete U.S. mailing address.')
    expect(blockers).toContain(
      'Alex Manager needs a complete Schedule K-1 mailing address.',
    )
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

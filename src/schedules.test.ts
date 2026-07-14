import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from './defaults'
import { allocationTotals, partnerScheduleValues } from './schedules'

describe('partner schedule allocations', () => {
  it('uses ownership percentages for the automatic golden path', () => {
    const draft = createDefaultDraft()
    draft.finances.grossReceipts = 900
    draft.finances.memberContributions = 1_500
    draft.finances.otherExpenses[0].amount = 300

    expect(partnerScheduleValues(draft, draft.partners[0])).toEqual({
      profitPercent: 50,
      lossPercent: 50,
      capitalPercent: 50,
      currentYearIncome: 300,
      beginningCapital: 0,
      capitalContributed: 750,
      cashDistributions: 0,
      endingCapital: 1_050,
    })
  })

  it('uses and reconciles manually entered custom allocations', () => {
    const draft = createDefaultDraft()
    draft.allocations.mode = 'custom'
    draft.finances.grossReceipts = 1_000
    draft.finances.otherExpenses[0].amount = 200
    draft.finances.beginningCapital = 100
    draft.finances.memberContributions = 1_000
    draft.finances.cashDistributions = 100
    Object.assign(draft.partners[0], {
      profitPercent: 75,
      lossPercent: 70,
      capitalPercent: 60,
      beginningCapital: 60,
      capitalContributed: 700,
      cashDistributions: 80,
    })
    Object.assign(draft.partners[1], {
      profitPercent: 25,
      lossPercent: 30,
      capitalPercent: 40,
      beginningCapital: 40,
      capitalContributed: 300,
      cashDistributions: 20,
    })

    expect(allocationTotals(draft)).toEqual({
      profitPercent: 100,
      lossPercent: 100,
      capitalPercent: 100,
      beginningCapital: 100,
      capitalContributed: 1_000,
      cashDistributions: 100,
    })
    expect(partnerScheduleValues(draft, draft.partners[0])).toEqual({
      profitPercent: 75,
      lossPercent: 70,
      capitalPercent: 60,
      currentYearIncome: 600,
      beginningCapital: 60,
      capitalContributed: 700,
      cashDistributions: 80,
      endingCapital: 1_280,
    })
  })

  it('uses loss percentages when ordinary income is negative', () => {
    const draft = createDefaultDraft()
    draft.allocations.mode = 'custom'
    draft.finances.otherExpenses[0].amount = 100
    draft.partners[0].profitPercent = 75
    draft.partners[1].profitPercent = 25
    draft.partners[0].lossPercent = 20
    draft.partners[1].lossPercent = 80

    expect(partnerScheduleValues(draft, draft.partners[0]).currentYearIncome).toBe(-20)
    expect(partnerScheduleValues(draft, draft.partners[1]).currentYearIncome).toBe(-80)
  })
})

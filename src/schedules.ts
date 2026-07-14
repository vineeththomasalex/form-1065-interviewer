import { ordinaryIncome } from './domain'
import type { Partner, ReturnDraft } from './types'

export interface PartnerScheduleValues {
  profitPercent: number
  lossPercent: number
  capitalPercent: number
  beginningCapital: number
  capitalContributed: number
  currentYearIncome: number
  cashDistributions: number
  endingCapital: number
}

export function partnerDisplayName(partner: Partner): string {
  if (partner.ownerKind === 'individual') {
    return `${partner.firstName} ${partner.lastName}`.trim()
  }
  return partner.displayName.trim()
}

export function partnerEntityType(partner: Partner): string {
  if (partner.ownerKind === 'individual') return 'Individual'
  if (partner.ownerKind === 'estate') return 'Estate'
  return partner.entityType.trim()
}

export function partnerScheduleValues(
  draft: ReturnDraft,
  partner: Partner,
): PartnerScheduleValues {
  const index = draft.partners.findIndex((item) => item.id === partner.id)
  const percentages = partnerSchedulePercentages(draft, partner)
  const beginningCapital =
    draft.allocations.mode === 'ownership'
      ? allocatedAmount(draft, draft.finances.beginningCapital, index, 'ownershipPercent')
      : partner.beginningCapital
  const capitalContributed =
    draft.allocations.mode === 'ownership'
      ? allocatedAmount(draft, draft.finances.memberContributions, index, 'ownershipPercent')
      : partner.capitalContributed
  const cashDistributions =
    draft.allocations.mode === 'ownership'
      ? allocatedAmount(draft, draft.finances.cashDistributions, index, 'ownershipPercent')
      : partner.cashDistributions
  const totalOrdinaryIncome = ordinaryIncome(draft)
  const currentYearIncome = allocatedAmount(
    draft,
    totalOrdinaryIncome,
    index,
    draft.allocations.mode === 'ownership'
      ? 'ownershipPercent'
      : totalOrdinaryIncome < 0
        ? 'lossPercent'
        : 'profitPercent',
  )

  return {
    ...percentages,
    beginningCapital,
    capitalContributed,
    currentYearIncome,
    cashDistributions,
    endingCapital:
      beginningCapital +
      capitalContributed +
      currentYearIncome -
      cashDistributions,
  }
}

export function partnersRequiringScheduleB1(draft: ReturnDraft): Partner[] {
  return draft.partners.filter(
    (partner) => maximumScheduleB1Percent(draft, partner) >= 50,
  )
}

export function partnerSchedulePercentages(
  draft: ReturnDraft,
  partner: Partner,
) {
  if (draft.allocations.mode === 'ownership') {
    return {
      profitPercent: partner.ownershipPercent,
      lossPercent: partner.ownershipPercent,
      capitalPercent: partner.ownershipPercent,
    }
  }
  return {
    profitPercent: partner.profitPercent,
    lossPercent: partner.lossPercent,
    capitalPercent: partner.capitalPercent,
  }
}

export function maximumScheduleB1Percent(
  draft: ReturnDraft,
  partner: Partner,
): number {
  const percentages = partnerSchedulePercentages(draft, partner)
  return Math.max(
    percentages.profitPercent,
    percentages.lossPercent,
    percentages.capitalPercent,
  )
}

export function isUnitedStatesCountry(country: string): boolean {
  return /^(united states|u\.?s\.?a?\.?)$/i.test(country.trim())
}

export function allocationTotals(draft: ReturnDraft) {
  return {
    profitPercent: draft.partners.reduce(
      (sum, partner) => sum + partner.profitPercent,
      0,
    ),
    lossPercent: draft.partners.reduce(
      (sum, partner) => sum + partner.lossPercent,
      0,
    ),
    capitalPercent: draft.partners.reduce(
      (sum, partner) => sum + partner.capitalPercent,
      0,
    ),
    beginningCapital: draft.partners.reduce(
      (sum, partner) => sum + partner.beginningCapital,
      0,
    ),
    capitalContributed: draft.partners.reduce(
      (sum, partner) => sum + partner.capitalContributed,
      0,
    ),
    cashDistributions: draft.partners.reduce(
      (sum, partner) => sum + partner.cashDistributions,
      0,
    ),
  }
}

function allocatedAmount(
  draft: ReturnDraft,
  total: number,
  partnerIndex: number,
  percentageKey: 'ownershipPercent' | 'profitPercent' | 'lossPercent',
): number {
  if (partnerIndex < 0) return 0
  if (partnerIndex === draft.partners.length - 1) {
    const prior = draft.partners
      .slice(0, -1)
      .reduce(
        (sum, partner) =>
          sum + roundCurrency(total * (partner[percentageKey] / 100)),
        0,
      )
    return roundCurrency(total - prior)
  }
  return roundCurrency(
    total * (draft.partners[partnerIndex][percentageKey] / 100),
  )
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

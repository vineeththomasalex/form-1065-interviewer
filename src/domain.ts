import type {
  EligibilityResult,
  LateFilingResult,
  ReturnDraft,
} from './types'

export const OFFICIAL_SOURCES = {
  form: 'https://www.irs.gov/pub/irs-prior/f1065--2025.pdf',
  instructions: 'https://www.irs.gov/pub/irs-prior/i1065--2025.pdf',
  landing: 'https://www.irs.gov/forms-pubs/about-form-1065',
  scheduleB1: 'https://www.irs.gov/pub/irs-pdf/f1065sb1.pdf',
  scheduleB1Landing:
    'https://www.irs.gov/forms-pubs/about-schedule-b-1-form-1065',
  scheduleK1: 'https://www.irs.gov/pub/irs-prior/f1065sk1--2025.pdf',
  scheduleK1Instructions:
    'https://www.irs.gov/pub/irs-prior/i1065sk1--2025.pdf',
  scheduleK1Landing:
    'https://www.irs.gov/forms-pubs/about-schedule-k-1-form-1065',
  usPersonDefinition:
    'https://www.irs.gov/businesses/international-businesses/foreign-persons',
  alienTaxStatus:
    'https://www.irs.gov/individuals/international-taxpayers/alien-tax-status',
  substantialPresence:
    'https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test',
}

export const activityPresets = [
  {
    label: 'Software development / programming',
    activity: 'Custom computer programming services',
    service: 'Software development services',
    code: '541511',
  },
  {
    label: 'Computer systems design',
    activity: 'Computer systems design services',
    service: 'Technology consulting and systems design',
    code: '541512',
  },
  {
    label: 'Management consulting',
    activity: 'Management consulting services',
    service: 'Business and management consulting',
    code: '541611',
  },
  {
    label: 'Enter my own',
    activity: '',
    service: '',
    code: '',
  },
]

export const lateReasonTemplates: Record<string, string> = {
  'first-year':
    'This was the partnership’s first filing year. The responsible member misunderstood the separate federal partnership return requirement and acted promptly after discovering it. The partnership has established a filing calendar and review process intended to prevent recurrence.',
  records:
    'The partnership could not complete the return on time because essential records were temporarily unavailable despite reasonable efforts to obtain them. The return was prepared promptly after the records became available, and the partnership has improved its record-retention process.',
  adviser:
    'The partnership relied on a tax or business adviser for a filing requirement or deadline and acted promptly after learning that the return remained outstanding. Supporting dates, communications, and corrective actions should be documented before using this explanation.',
  custom: '',
}

const complexityLabels: Record<keyof ReturnDraft['complexity'], string> = {
  foreignActivity: 'foreign accounts, trusts, ownership, or transactions',
  foreignPartner: 'a partner who is not a U.S. person',
  rentalActivity: 'rental real estate or other rental activity',
  inventory: 'inventory or cost of goods sold',
  employeesOrPayroll: 'employees, wages, payroll returns, or employee benefits',
  contractor1099s: 'contractor or other payments that may require Forms 1099',
  digitalAssets: 'digital-asset receipts, sales, exchanges, or dispositions',
  debtOrLoanChanges: 'business debt, canceled debt, or modified loan terms',
  propertyOrEquipment: 'equipment, depreciable property, vehicles, or property sales',
  ownershipChanges: 'partner admissions, departures, transfers, or changing ownership percentages',
  guaranteedPayments: 'guaranteed payments to a partner',
  taxCreditsOrElections: 'tax credits, section 754 elections, or other tax elections',
}

export function totalOtherExpenses(draft: ReturnDraft): number {
  return draft.finances.otherExpenses.reduce(
    (total, item) => total + nonNegative(item.amount),
    0,
  )
}

export function totalExpenses(draft: ReturnDraft): number {
  const { repairs, rent, taxesAndLicenses, interest } = draft.finances
  return (
    nonNegative(repairs) +
    nonNegative(rent) +
    nonNegative(taxesAndLicenses) +
    nonNegative(interest) +
    totalOtherExpenses(draft)
  )
}

export function netReceipts(draft: ReturnDraft): number {
  return (
    nonNegative(draft.finances.grossReceipts) -
    nonNegative(draft.finances.returnsAndAllowances)
  )
}

export function ordinaryIncome(draft: ReturnDraft): number {
  return netReceipts(draft) - totalExpenses(draft)
}

export function endingCash(draft: ReturnDraft): number {
  const { beginningCash, memberContributions, cashDistributions } = draft.finances
  return (
    nonNegative(beginningCash) +
    netReceipts(draft) +
    nonNegative(memberContributions) -
    totalExpenses(draft) -
    nonNegative(cashDistributions)
  )
}

export function endingCapital(draft: ReturnDraft): number {
  const { beginningCapital, memberContributions, cashDistributions } =
    draft.finances
  return (
    nonNegative(beginningCapital) +
    nonNegative(memberContributions) +
    ordinaryIncome(draft) -
    nonNegative(cashDistributions)
  )
}

export function qualifiesForScheduleBQuestion4(draft: ReturnDraft): boolean {
  return (
    draft.finances.grossReceipts < 250_000 &&
    Math.abs(endingCash(draft)) < 1_000_000 &&
    draft.filing.schedulesK1Timely === 'yes'
  )
}

export function evaluateEligibility(draft: ReturnDraft): EligibilityResult {
  const blockers: string[] = []
  const warnings: string[] = []

  if (!draft.scope.domesticLlc) {
    blockers.push('The current guided path supports only a domestic LLC.')
  }
  if (!draft.scope.calendarYear) {
    blockers.push('The current guided path supports only a calendar tax year ending December 31, 2025.')
  }
  if (!draft.scope.taxedAsPartnership) {
    blockers.push('The LLC must be taxed as a partnership, not as a corporation or disregarded entity.')
  }
  if (!draft.scope.atLeastTwoPartners || draft.partners.length < 2) {
    blockers.push('A partnership return requires at least two partners.')
  }
  if (!isCompleteAddress(draft.business.address)) {
    blockers.push('The partnership needs a complete U.S. mailing address.')
  }
  if (draft.business.accountingMethod !== 'cash') {
    blockers.push(
      'Accrual and custom accounting methods are outside this cash-basis guided path.',
    )
  }

  for (const [key, label] of Object.entries(complexityLabels) as [
    keyof ReturnDraft['complexity'],
    string,
  ][]) {
    if (draft.complexity[key]) {
      blockers.push(`This draft does not support ${label}.`)
    }
  }

  const ownershipTotal = draft.partners.reduce(
    (total, partner) => total + Number(partner.ownershipPercent || 0),
    0,
  )
  if (Math.abs(ownershipTotal - 100) > 0.01) {
    blockers.push('Partner ownership percentages must add up to 100%.')
  }
  if (
    draft.partners.some(
      (partner) =>
        !Number.isFinite(partner.ownershipPercent) ||
        partner.ownershipPercent < 0 ||
        partner.ownershipPercent > 100,
    )
  ) {
    blockers.push('Every partner ownership percentage must be between 0% and 100%.')
  }

  const managers = draft.partners.filter((partner) => partner.isManagingMember)
  if (managers.length !== 1) {
    blockers.push('The supported path requires exactly one managing member.')
  } else if (managers[0].ownershipPercent < 50) {
    blockers.push('The managing member must own at least 50% for this supported path.')
  } else if (managers[0].ownerKind !== 'individual') {
    blockers.push('The managing member must be an individual for this supported path.')
  }

  for (const partner of draft.partners) {
    const name =
      partner.ownerKind === 'individual'
        ? `${partner.firstName} ${partner.lastName}`.trim()
        : partner.displayName.trim()
    if (!name) {
      blockers.push('Every partner needs a name for Schedule K-1.')
    }
    if (!/^(?:\d{2}-?\d{7}|\d{3}-?\d{2}-?\d{4})$/.test(partner.taxId)) {
      blockers.push(`${name || 'Each partner'} needs a valid nine-digit SSN or TIN for Schedule K-1.`)
    }
    if (!partner.country.trim()) {
      blockers.push(
        `${name || 'Each partner'} needs a citizenship or organization country.`,
      )
    }
    if (
      partner.ownerKind === 'individual' &&
      partner.immigrationStatus === 'unknown'
    ) {
      blockers.push(`${name || 'Each individual partner'} needs an immigration or citizenship status.`)
    }
    if (
      partner.ownerKind === 'individual' &&
      partner.immigrationStatus === 'other' &&
      !partner.customImmigrationStatus.trim()
    ) {
      blockers.push(`${name || 'Each individual partner'} needs a custom immigration status description.`)
    }
    if (partner.taxPersonStatus === 'unknown') {
      blockers.push(`${name || 'Each partner'} needs an IRS U.S.-person tax classification.`)
    } else if (partner.taxPersonStatus === 'foreign-person') {
      blockers.push(
        `${name || 'Each partner'} is classified as a foreign partner for tax purposes; foreign partners are outside this guided path.`,
      )
    }
    if (partner.ownerKind === 'entity' && !partner.entityType.trim()) {
      blockers.push(`${name || 'Each entity partner'} needs a manually entered entity type.`)
    }
    if (!isCompleteAddress(effectivePartnerAddress(draft, partner))) {
      blockers.push(`${name || 'Each partner'} needs a complete Schedule K-1 mailing address.`)
    }
    if (
      partner.ownerKind === 'individual' &&
      partner.immigrationStatus === 'h1b' &&
      partner.taxPersonStatus === 'us-person'
    ) {
      warnings.push(
        `${name || 'The H-1B partner'} is treated as a U.S. person only because you confirmed resident-alien tax status; H-1B status alone does not establish it. Confirm the substantial presence or other applicable residency test.`,
      )
    }
  }

  if (!draft.business.irsFilingCenter.trim()) {
    blockers.push('Enter the IRS filing center or “E-file” for Schedule K-1, box C.')
  }

  if (draft.allocations.mode === 'custom') {
    const percentagesAreValid = draft.partners.every((partner) =>
      [partner.profitPercent, partner.lossPercent, partner.capitalPercent].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 100,
      ),
    )
    const profitTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.profitPercent,
      0,
    )
    const lossTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.lossPercent,
      0,
    )
    const capitalTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.capitalPercent,
      0,
    )
    const beginningCapitalTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.beginningCapital,
      0,
    )
    const contributedTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.capitalContributed,
      0,
    )
    const distributionTotal = draft.partners.reduce(
      (sum, partner) => sum + partner.cashDistributions,
      0,
    )
    if (!percentagesAreValid) {
      blockers.push('Every custom profit, loss, and capital percentage must be between 0% and 100%.')
    }
    if (Math.abs(profitTotal - 100) > 0.01) {
      blockers.push('Custom profit percentages must add up to 100%.')
    }
    if (Math.abs(lossTotal - 100) > 0.01) {
      blockers.push('Custom loss percentages must add up to 100%.')
    }
    if (Math.abs(capitalTotal - 100) > 0.01) {
      blockers.push('Custom capital percentages must add up to 100%.')
    }
    if (Math.abs(beginningCapitalTotal - draft.finances.beginningCapital) > 0.01) {
      blockers.push('Partner beginning capital amounts must equal total beginning capital.')
    }
    if (Math.abs(contributedTotal - draft.finances.memberContributions) > 0.01) {
      blockers.push('Partner contribution amounts must equal total member contributions.')
    }
    if (Math.abs(distributionTotal - draft.finances.cashDistributions) > 0.01) {
      blockers.push('Partner distribution amounts must equal total cash distributions.')
    }
  }

  if (draft.finances.grossReceipts >= 2_000) {
    blockers.push('The current golden path supports less than $2,000 of customer receipts.')
  }
  if (draft.finances.returnsAndAllowances > draft.finances.grossReceipts) {
    blockers.push('Returns and allowances cannot exceed gross customer receipts.')
  }
  if (endingCash(draft) < 0) {
    blockers.push(
      'The simple cash-only model produces negative ending cash. Review missing contributions, loans, or personally paid expenses.',
    )
  }
  if (
    draft.filing.schedulesK1Timely !== 'yes' &&
    Math.abs(draft.finances.beginningCash - draft.finances.beginningCapital) > 0.01
  ) {
    blockers.push(
      'Beginning cash and beginning capital must match in this cash-only model. A difference indicates assets, liabilities, or prior-year accounting this draft does not support.',
    )
  }
  if (
    draft.filing.schedulesK1Timely !== 'yes' &&
    Math.abs(endingCash(draft) - endingCapital(draft)) > 0.01
  ) {
    blockers.push(
      'Ending cash and ending capital must match in this cash-only model. Review missing assets, liabilities, personally paid expenses, or member loans.',
    )
  }
  if (draft.filing.schedulesK1Timely !== 'yes') {
    warnings.push(
      'Schedule B question 4 will be “No,” so the draft completes the simple Schedule L, M-1, and M-2 instead of using the small-partnership exception.',
    )
  }
  if (draft.partners.some((partner) => maximumB1Percent(draft, partner) >= 50)) {
    warnings.push(
      'Schedule B-1 is included because at least one partner owns 50% or more. Confirm direct and indirect ownership attribution rules.',
    )
  }
  warnings.push(
    'The package includes one Schedule K-1 per partner. Confirm partner classifications, allocations, capital accounts, and delivery requirements.',
  )
  warnings.push(
    'Partner classification, allocations, basis, liabilities, state returns, signatures, and filing method require separate review.',
  )

  return { blockers, warnings }
}

export function calculateLateFiling(
  filing: ReturnDraft['filing'],
  partnerCount: number,
): LateFilingResult {
  const originalDueDate = '2026-03-16'
  const extendedDueDate = '2026-09-15'
  const dueDate =
    filing.extensionFiled === 'yes' ? extendedDueDate : originalDueDate

  if (
    filing.extensionFiled === 'unknown' ||
    !isIsoDate(filing.plannedFileDate)
  ) {
    return {
      status: 'unknown',
      dueDate,
      monthsLate: 0,
      estimatedPenalty: 0,
    }
  }

  const fileDate = utcDate(filing.plannedFileDate)
  const due = utcDate(dueDate)
  if (fileDate <= due) {
    return {
      status: filing.extensionFiled === 'yes' ? 'extended' : 'on-time',
      dueDate,
      monthsLate: 0,
      estimatedPenalty: 0,
    }
  }

  let monthsLate = 0
  while (
    monthsLate < 12 &&
    fileDate > addUtcMonths(due, monthsLate)
  ) {
    monthsLate += 1
  }

  return {
    status: 'late',
    dueDate,
    monthsLate,
    estimatedPenalty: monthsLate * Math.max(0, partnerCount) * 255,
  }
}

export function getManagingMember(draft: ReturnDraft) {
  return (
    draft.partners.find((partner) => partner.isManagingMember) ??
    draft.partners[0]
  )
}

export function effectivePartnerAddress(
  draft: ReturnDraft,
  partner: ReturnDraft['partners'][number],
) {
  return partner.useBusinessAddress
    ? draft.business.address
    : partner.address
}

function maximumB1Percent(
  draft: ReturnDraft,
  partner: ReturnDraft['partners'][number],
): number {
  if (draft.allocations.mode === 'ownership') return partner.ownershipPercent
  return Math.max(
    partner.profitPercent,
    partner.lossPercent,
    partner.capitalPercent,
  )
}

function isCompleteAddress(address: ReturnDraft['business']['address']): boolean {
  return Boolean(
    address.street.trim() &&
    address.city.trim() &&
    /^[A-Z]{2}$/.test(address.state) &&
    /^\d{5}(?:-\d{4})?$/.test(address.zip),
  )
}

export function representativeDetails(draft: ReturnDraft) {
  const manager = getManagingMember(draft)
  if (draft.representative.sameAsManagingMember) {
    return {
      firstName: manager?.firstName ?? '',
      lastName: manager?.lastName ?? '',
      phone: draft.representative.phone,
      address: manager ? effectivePartnerAddress(draft, manager) : draft.business.address,
    }
  }
  return {
    firstName: draft.representative.firstName,
    lastName: draft.representative.lastName,
    phone: draft.representative.phone,
    address: draft.representative.useManagingMemberAddress && manager
      ? effectivePartnerAddress(draft, manager)
      : draft.representative.address,
  }
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

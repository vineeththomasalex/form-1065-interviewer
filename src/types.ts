export type YesNoUnknown = 'yes' | 'no' | 'unknown'

export interface Address {
  street: string
  suite: string
  city: string
  state: string
  zip: string
}

export interface Partner {
  id: string
  ownerKind: 'individual' | 'estate' | 'entity'
  firstName: string
  lastName: string
  displayName: string
  entityType: string
  taxId: string
  country: string
  ownershipPercent: number
  profitPercent: number
  lossPercent: number
  capitalPercent: number
  isManagingMember: boolean
  useBusinessAddress: boolean
  address: Address
  beginningCapital: number
  capitalContributed: number
  cashDistributions: number
}

export interface OtherExpense {
  id: string
  description: string
  amount: number
}

export interface ComplexityAnswers {
  foreignActivity: boolean
  foreignPartner: boolean
  rentalActivity: boolean
  inventory: boolean
  employeesOrPayroll: boolean
  contractor1099s: boolean
  digitalAssets: boolean
  debtOrLoanChanges: boolean
  propertyOrEquipment: boolean
  ownershipChanges: boolean
  guaranteedPayments: boolean
  taxCreditsOrElections: boolean
}

export interface ReturnDraft {
  version: 2
  currentStep: number
  scope: {
    domesticLlc: boolean
    calendarYear: boolean
    taxedAsPartnership: boolean
    atLeastTwoPartners: boolean
  }
  business: {
    legalName: string
    ein: string
    startDate: string
    initialReturn: boolean
    principalActivity: string
    productOrService: string
    businessCode: string
    accountingMethod: 'cash' | 'accrual' | 'other'
    customAccountingMethod: string
    irsFilingCenter: string
    address: Address
  }
  partners: Partner[]
  allocations: {
    mode: 'ownership' | 'custom'
  }
  filing: {
    plannedFileDate: string
    extensionFiled: YesNoUnknown
    schedulesK1Timely: YesNoUnknown
    lateReasonTemplate: string
    lateReasonNotes: string
  }
  finances: {
    beginningCash: number
    beginningCapital: number
    grossReceipts: number
    returnsAndAllowances: number
    memberContributions: number
    cashDistributions: number
    repairs: number
    rent: number
    taxesAndLicenses: number
    interest: number
    otherExpenses: OtherExpense[]
  }
  complexity: ComplexityAnswers
  representative: {
    sameAsManagingMember: boolean
    firstName: string
    lastName: string
    phone: string
    useManagingMemberAddress: boolean
    address: Address
  }
}

export interface EligibilityResult {
  blockers: string[]
  warnings: string[]
}

export interface LateFilingResult {
  status: 'unknown' | 'on-time' | 'extended' | 'late'
  dueDate: string
  monthsLate: number
  estimatedPenalty: number
}

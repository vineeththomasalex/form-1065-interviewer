import { del, get, set } from 'idb-keyval'
import { createDefaultDraft } from './defaults'
import type { Partner, ReturnDraft } from './types'

const STORAGE_KEY = 'form-1065-interviewer:draft:v1'
type LegacyPartner = Partial<Partner> & { allocationPercent?: number }

export async function loadSavedDraft(): Promise<ReturnDraft | undefined> {
  return migrateDraft(await get<unknown>(STORAGE_KEY))
}

export async function saveDraft(draft: ReturnDraft): Promise<void> {
  await set(STORAGE_KEY, sanitizeForStorage(draft))
}

export async function clearSavedDraft(): Promise<void> {
  await del(STORAGE_KEY)
}

export function sanitizeForStorage(draft: ReturnDraft): ReturnDraft {
  return {
    ...structuredClone(draft),
    business: {
      ...structuredClone(draft.business),
      ein: '',
    },
    partners: draft.partners.map((partner) => ({
      ...structuredClone(partner),
      taxId: '',
    })),
  }
}

export function migrateDraft(value: unknown): ReturnDraft | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Partial<Omit<ReturnDraft, 'version' | 'partners'>> & {
    version?: number
    partners?: LegacyPartner[]
  }
  const defaults = createDefaultDraft()
  if (source.version !== 1 && source.version !== 2 && source.version !== 3) {
    return undefined
  }

  return {
    ...defaults,
    ...source,
    version: 3,
    currentStep:
      source.version === 1 && (source.currentStep ?? 0) >= 8
        ? Math.min((source.currentStep ?? 0) + 1, 10)
        : source.currentStep ?? defaults.currentStep,
    scope: { ...defaults.scope, ...source.scope },
    business: { ...defaults.business, ...source.business },
    allocations: { ...defaults.allocations, ...source.allocations },
    filing: { ...defaults.filing, ...source.filing },
    finances: {
      ...defaults.finances,
      ...source.finances,
      otherExpenses:
        source.finances?.otherExpenses ?? defaults.finances.otherExpenses,
    },
    complexity: { ...defaults.complexity, ...source.complexity },
    representative: {
      ...defaults.representative,
      ...source.representative,
      address: {
        ...defaults.representative.address,
        ...source.representative?.address,
      },
    },
    partners: (source.partners ?? defaults.partners).map((partner, index) => {
      const partnerDefaults = createPartnerDefaults(index)
      const {
        allocationPercent,
        ...partnerSource
      } = partner
      const legacyPercent =
        allocationPercent ??
        partner.ownershipPercent ??
        partnerDefaults.ownershipPercent
      const ownerKind = partner.ownerKind ?? partnerDefaults.ownerKind
      const country =
        partner.country ??
        (source.version === 1 ? '' : partnerDefaults.country)
      const legacyUsPerson =
        source.version === 2 &&
        typeof partner.country === 'string' &&
        isUnitedStatesCountry(partner.country)
      return {
        ...partnerDefaults,
        ...partnerSource,
        country,
        immigrationStatus:
          partner.immigrationStatus ??
          (ownerKind === 'individual'
            ? legacyUsPerson
              ? 'us-citizen'
              : 'unknown'
            : 'not-applicable'),
        customImmigrationStatus: partner.customImmigrationStatus ?? '',
        taxPersonStatus:
          partner.taxPersonStatus ??
          (legacyUsPerson ? 'us-person' : 'unknown'),
        profitPercent: partner.profitPercent ?? legacyPercent,
        lossPercent: partner.lossPercent ?? legacyPercent,
        capitalPercent: partner.capitalPercent ?? legacyPercent,
        address: {
          ...emptyPartnerAddress,
          ...partner.address,
        },
      }
    }),
  }
}

const emptyPartnerAddress = {
  street: '',
  suite: '',
  city: '',
  state: '',
  zip: '',
}

function createPartnerDefaults(index: number): Partner {
  return {
    id: index === 0 ? 'managing-member' : `partner-${index + 1}`,
    ownerKind: 'individual',
    firstName: '',
    lastName: '',
    displayName: '',
    entityType: 'Individual',
    taxId: '',
    country: 'United States',
    immigrationStatus: 'unknown',
    customImmigrationStatus: '',
    taxPersonStatus: 'unknown',
    ownershipPercent: index < 2 ? 50 : 0,
    profitPercent: index < 2 ? 50 : 0,
    lossPercent: index < 2 ? 50 : 0,
    capitalPercent: index < 2 ? 50 : 0,
    isManagingMember: index === 0,
    useBusinessAddress: true,
    address: { ...emptyPartnerAddress },
    beginningCapital: 0,
    capitalContributed: 0,
    cashDistributions: 0,
  }
}

function isUnitedStatesCountry(country: string): boolean {
  return /^(united states|u\.?s\.?a?\.?)$/i.test(country.trim())
}

import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from './defaults'
import { migrateDraft, sanitizeForStorage } from './storage'

describe('browser persistence boundary', () => {
  it('keeps reusable identity details but removes partnership and partner tax IDs', () => {
    const draft = createDefaultDraft()
    draft.business.legalName = 'Example Ventures LLC'
    draft.business.ein = '12-3456789'
    draft.business.address.street = '100 Main St'
    draft.partners[0].taxId = '111-22-3333'

    const saved = sanitizeForStorage(draft)

    expect(saved.business.legalName).toBe('Example Ventures LLC')
    expect(saved.business.address.street).toBe('100 Main St')
    expect(saved.business.ein).toBe('')
    expect(saved.partners[0].taxId).toBe('')
    expect(draft.business.ein).toBe('12-3456789')
    expect(draft.partners[0].taxId).toBe('111-22-3333')
  })

  it('migrates version 1 partners to the companion-schedule schema', () => {
    const migrated = migrateDraft({
      ...createDefaultDraft(),
      version: 1,
      currentStep: 9,
      allocations: undefined,
      partners: [
        {
          id: 'legacy-partner',
          firstName: 'Alex',
          lastName: 'Manager',
          ownershipPercent: 100,
          isManagingMember: true,
          useBusinessAddress: true,
          address: {},
        },
      ],
    })

    expect(migrated?.version).toBe(2)
    expect(migrated?.currentStep).toBe(10)
    expect(migrated?.allocations.mode).toBe('ownership')
    expect(migrated?.partners[0]).toMatchObject({
      ownerKind: 'individual',
      entityType: 'Individual',
      taxId: '',
      country: 'United States',
      profitPercent: 100,
      lossPercent: 100,
      capitalPercent: 100,
    })
  })
})

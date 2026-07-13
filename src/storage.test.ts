import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from './defaults'
import { sanitizeForStorage } from './storage'

describe('browser persistence boundary', () => {
  it('keeps reusable identity details but removes the EIN', () => {
    const draft = createDefaultDraft()
    draft.business.legalName = 'Example Ventures LLC'
    draft.business.ein = '12-3456789'
    draft.business.address.street = '100 Main St'

    const saved = sanitizeForStorage(draft)

    expect(saved.business.legalName).toBe('Example Ventures LLC')
    expect(saved.business.address.street).toBe('100 Main St')
    expect(saved.business.ein).toBe('')
    expect(draft.business.ein).toBe('12-3456789')
  })
})

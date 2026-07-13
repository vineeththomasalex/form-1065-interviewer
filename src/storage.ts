import { del, get, set } from 'idb-keyval'
import type { ReturnDraft } from './types'

const STORAGE_KEY = 'form-1065-interviewer:draft:v1'

export async function loadSavedDraft(): Promise<ReturnDraft | undefined> {
  return get<ReturnDraft>(STORAGE_KEY)
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
  }
}

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { createDefaultDraft } from './defaults'
import { generateForm1065 } from './pdf'

const formPath = fileURLToPath(
  new URL('../public/forms/f1065--2025.pdf', import.meta.url),
)

describe('Form 1065 generation', () => {
  it('round-trips representative supported values through the official PDF', async () => {
    const draft = createDefaultDraft()
    draft.business.legalName = 'Example Ventures LLC'
    draft.business.ein = '12-3456789'
    draft.business.address = {
      street: '100 Main St',
      suite: '200',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
    }
    draft.partners[0].firstName = 'Alex'
    draft.partners[0].lastName = 'Manager'
    draft.partners[1].ownerKind = 'entity'
    draft.partners[1].displayName = 'Partner Holdings Inc'
    draft.partners[1].entityType = 'S corporation'
    draft.filing.extensionFiled = 'no'
    draft.filing.schedulesK1Timely = 'no'
    draft.finances.grossReceipts = 900
    draft.finances.memberContributions = 1_500
    draft.finances.otherExpenses[0].amount = 300
    draft.representative.phone = '555-555-0123'

    const source = await readFile(formPath)
    const output = await generateForm1065(source, draft)
    const result = await PDFDocument.load(output)
    const form = result.getForm()

    expect(text(form, 'f1_04[0]')).toBe('Example Ventures LLC')
    expect(text(form, 'f1_14[0]')).toBe('12-3456789')
    expect(text(form, 'f1_19[0]')).toBe('900')
    expect(text(form, 'f1_42[0]')).toBe('300')
    expect(text(form, 'f1_44[0]')).toBe('600')
    expect(text(form, 'f5_01[0]')).toBe('600')
    expect(checked(form, 'c2_3[0]')).toBe(true)
    expect(checked(form, 'c2_3[1]')).toBe(false)
    expect(checked(form, 'c2_2[0]')).toBe(true)
    expect(checked(form, 'c2_2[1]')).toBe(false)
    expect(result.getPageCount()).toBe(7)
  })
})

function text(form: ReturnType<PDFDocument['getForm']>, suffix: string) {
  const field = find(form, suffix)
  if (!(field instanceof PDFTextField)) throw new Error(`${suffix} is not text`)
  return field.getText()
}

function checked(form: ReturnType<PDFDocument['getForm']>, suffix: string) {
  const field = find(form, suffix)
  if (!(field instanceof PDFCheckBox)) throw new Error(`${suffix} is not a checkbox`)
  return field.isChecked()
}

function find(form: ReturnType<PDFDocument['getForm']>, suffix: string) {
  const field = form
    .getFields()
    .find((candidate) => candidate.getName().endsWith(`.${suffix}`))
  if (!field) throw new Error(`Missing ${suffix}`)
  return field
}

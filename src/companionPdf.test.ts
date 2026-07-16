import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  generateFilingPackage,
  generateScheduleB1,
  generateScheduleK1,
} from './companionPdf'
import { createDefaultDraft } from './defaults'

const form1065Path = fileURLToPath(
  new URL('../public/forms/f1065--2025.pdf', import.meta.url),
)
const scheduleB1Path = fileURLToPath(
  new URL('../public/forms/f1065sb1.pdf', import.meta.url),
)
const scheduleK1Path = fileURLToPath(
  new URL('../public/forms/f1065sk1--2025.pdf', import.meta.url),
)

describe('companion schedule generation', () => {
  it('round-trips supported Schedule B-1 and Schedule K-1 fields', async () => {
    const draft = populatedDraft()
    const [b1Source, k1Source] = await Promise.all([
      readFile(scheduleB1Path),
      readFile(scheduleK1Path),
    ])

    const b1 = await PDFDocument.load(
      await generateScheduleB1(b1Source, draft, { flatten: false }),
    )
    const b1Form = b1.getForm()
    expect(text(b1Form, 'f1_1[0]')).toBe('Example Ventures LLC')
    expect(text(b1Form, 'f1_2[0]')).toBe('12-3456789')
    expect(text(b1Form, 'f1_3[0]')).toBe('Partner Holdings Inc')
    expect(text(b1Form, 'f1_4[0]')).toBe('98-7654321')
    expect(text(b1Form, 'f1_5[0]')).toBe('S corporation')
    expect(text(b1Form, 'f1_6[0]')).toBe('United States')
    expect(text(b1Form, 'f1_7[0]')).toBe('50%')
    expect(text(b1Form, 'f1_38[0]')).toBe('Alex Manager')
    expect(text(b1Form, 'f1_39[0]')).toBe('111-22-3333')
    expect(text(b1Form, 'f1_40[0]')).toBe('India')
    expect(text(b1Form, 'f1_41[0]')).toBe('50%')

    const k1 = await PDFDocument.load(
      await generateScheduleK1(k1Source, draft, draft.partners[0], {
        flatten: false,
      }),
    )
    const k1Form = k1.getForm()
    expect(text(k1Form, 'f1_6[0]')).toBe('12-3456789')
    expect(text(k1Form, 'f1_9[0]')).toBe('111-22-3333')
    expect(text(k1Form, 'f1_14[0]')).toBe('50')
    expect(text(k1Form, 'f1_27[0]')).toBe('750')
    expect(text(k1Form, 'f1_28[0]')).toBe('300')
    expect(text(k1Form, 'f1_31[0]')).toBe('1,050')
    expect(text(k1Form, 'f1_34[0]')).toBe('300')
    expect(checked(k1Form, 'c1_4[0]')).toBe(true)
    expect(checked(k1Form, 'c1_4[1]')).toBe(false)
    expect(checked(k1Form, 'c1_5[0]')).toBe(true)
    expect(checked(k1Form, 'c1_5[1]')).toBe(false)
  })

  it('merges Form 1065, B-1 page 1, and one K-1 per partner', async () => {
    const draft = populatedDraft()
    const [form1065, scheduleB1, scheduleK1] = await Promise.all([
      readFile(form1065Path),
      readFile(scheduleB1Path),
      readFile(scheduleK1Path),
    ])

    const output = await generateFilingPackage(
      { form1065, scheduleB1, scheduleK1 },
      draft,
    )
    const result = await PDFDocument.load(output)

    expect(result.getPageCount()).toBe(10)
    expect(result.getForm().getFields()).toHaveLength(0)
  }, 20_000)

  it('uses distinct custom profit, loss, and capital percentages', async () => {
    const draft = populatedDraft()
    draft.allocations.mode = 'custom'
    Object.assign(draft.partners[0], {
      ownershipPercent: 40,
      profitPercent: 60,
      lossPercent: 30,
      capitalPercent: 40,
      capitalContributed: 750,
    })
    Object.assign(draft.partners[1], {
      ownershipPercent: 60,
      profitPercent: 40,
      lossPercent: 70,
      capitalPercent: 60,
      capitalContributed: 750,
    })
    const [b1Source, k1Source] = await Promise.all([
      readFile(scheduleB1Path),
      readFile(scheduleK1Path),
    ])

    const b1 = await PDFDocument.load(
      await generateScheduleB1(b1Source, draft, { flatten: false }),
    )
    expect(text(b1.getForm(), 'f1_7[0]')).toBe('70%')
    expect(text(b1.getForm(), 'f1_41[0]')).toBe('60%')

    const k1 = await PDFDocument.load(
      await generateScheduleK1(k1Source, draft, draft.partners[0], {
        flatten: false,
      }),
    )
    const form = k1.getForm()
    expect(text(form, 'f1_14[0]')).toBe('60')
    expect(text(form, 'f1_16[0]')).toBe('30')
    expect(text(form, 'f1_18[0]')).toBe('40')
  })
})

function populatedDraft() {
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
  draft.partners[0].country = 'India'
  draft.partners[0].immigrationStatus = 'lawful-permanent-resident'
  draft.partners[0].taxPersonStatus = 'us-person'
  draft.partners[1].ownerKind = 'entity'
  draft.partners[1].displayName = 'Partner Holdings Inc'
  draft.partners[1].entityType = 'S corporation'
  draft.partners[1].taxId = '98-7654321'
  draft.partners[1].immigrationStatus = 'not-applicable'
  draft.partners[1].taxPersonStatus = 'us-person'
  draft.filing.extensionFiled = 'no'
  draft.filing.schedulesK1Timely = 'no'
  draft.finances.grossReceipts = 900
  draft.finances.memberContributions = 1_500
  draft.finances.otherExpenses[0].amount = 300
  draft.representative.phone = '555-555-0123'
  return draft
}

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

import {
  PDFCheckBox,
  PDFDocument,
  PDFForm,
  PDFTextField,
  StandardFonts,
  rgb,
} from 'pdf-lib'
import {
  endingCapital,
  endingCash,
  netReceipts,
  ordinaryIncome,
  qualifiesForScheduleBQuestion4,
  representativeDetails,
  totalExpenses,
  totalOtherExpenses,
} from './domain'
import { partnersRequiringScheduleB1 } from './schedules'
import type { ReturnDraft } from './types'

export async function generateForm1065(
  sourcePdf: Uint8Array,
  draft: ReturnDraft,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(sourcePdf)
  const form = document.getForm()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const q4 = qualifiesForScheduleBQuestion4(draft)
  const income = ordinaryIncome(draft)
  const receipts = netReceipts(draft)
  const expenses = totalExpenses(draft)
  const representative = representativeDetails(draft)
  const b1Owners = partnersRequiringScheduleB1(draft)

  setText(form, 'f1_04[0]', draft.business.legalName)
  setText(form, 'f1_05[0]', draft.business.address.street)
  setText(form, 'f1_06[0]', draft.business.address.suite)
  setText(form, 'f1_07[0]', draft.business.address.city)
  setText(form, 'f1_08[0]', draft.business.address.state)
  setText(form, 'f1_10[0]', draft.business.address.zip)
  setText(form, 'f1_11[0]', draft.business.principalActivity)
  setText(form, 'f1_12[0]', draft.business.productOrService)
  setText(form, 'f1_13[0]', draft.business.businessCode)
  setText(form, 'f1_14[0]', draft.business.ein)
  setText(form, 'f1_15[0]', formatFormDate(draft.business.startDate))
  setText(form, 'f1_16[0]', q4 ? '' : formatAmount(endingCash(draft)))
  if (draft.business.initialReturn) {
    check(form, 'c1_1[0]')
  }
  const accountingIndex =
    draft.business.accountingMethod === 'cash'
      ? 0
      : draft.business.accountingMethod === 'accrual'
        ? 1
        : 2
  selectCheckboxOption(form, 'c1_6', accountingIndex, 3)
  setText(
    form,
    'f1_17[0]',
    draft.business.accountingMethod === 'other'
      ? draft.business.customAccountingMethod
      : '',
  )
  setText(form, 'f1_18[0]', String(draft.partners.length))

  setText(form, 'f1_19[0]', formatAmount(draft.finances.grossReceipts))
  setText(form, 'f1_20[0]', formatAmount(draft.finances.returnsAndAllowances))
  setText(form, 'f1_21[0]', formatAmount(receipts))
  setText(form, 'f1_23[0]', formatAmount(receipts))
  setText(form, 'f1_28[0]', formatAmount(receipts))
  setText(form, 'f1_31[0]', formatAmount(draft.finances.repairs))
  setText(form, 'f1_33[0]', formatAmount(draft.finances.rent))
  setText(form, 'f1_34[0]', formatAmount(draft.finances.taxesAndLicenses))
  setText(form, 'f1_35[0]', formatAmount(draft.finances.interest))
  setText(form, 'f1_42[0]', formatAmount(totalOtherExpenses(draft)))
  setText(form, 'f1_43[0]', formatAmount(expenses))
  setText(form, 'f1_44[0]', formatAmount(income))

  selectCheckboxOption(form, 'c2_1', 2, 6)
  selectYesNo(
    form,
    'c2_2',
    b1Owners.some((partner) => partner.ownerKind === 'entity'),
  )
  selectYesNo(
    form,
    'c2_3',
    b1Owners.some((partner) => partner.ownerKind !== 'entity'),
  )
  selectYesNo(form, 'c2_4', false)
  selectYesNo(form, 'c2_5', false)
  selectYesNo(form, 'c2_6', q4)
  for (const suffix of [
    'c2_7',
    'c2_8',
    'c2_9',
    'c2_10',
    'c2_11',
    'c2_12',
    'c2_13',
  ]) {
    selectYesNo(form, suffix, false)
  }

  for (const suffix of [
    'c3_1',
    'c3_2',
    'c3_5',
    'c3_6',
    'c3_7',
    'c3_9',
    'c3_10',
    'c3_11',
    'c3_12',
    'c3_13',
    'c3_14',
    'c3_15',
    'c3_16',
  ]) {
    selectYesNo(form, suffix, false)
  }

  for (const suffix of ['c4_1', 'c4_2', 'c4_3', 'c4_4']) {
    selectYesNo(form, suffix, false)
  }
  selectYesNo(form, 'c4_6', false)
  setText(form, 'f4_04[0]', representative.firstName)
  setText(form, 'f4_05[0]', representative.lastName)
  setText(form, 'f4_06[0]', representative.address.street)
  setText(form, 'f4_07[0]', representative.address.city)
  setText(form, 'f4_08[0]', representative.address.state)
  setText(form, 'f4_09[0]', representative.address.zip)
  setText(form, 'f4_10[0]', representative.phone)

  setText(form, 'f5_01[0]', formatAmount(income))
  setText(form, 'f6_01[0]', formatAmount(income))

  if (!q4) {
    fillSimpleBalanceSheet(form, draft)
  }

  form.updateFieldAppearances(font)
  appendOtherDeductionsStatement(document, draft, font)
  document.setTitle(`DRAFT 2025 Form 1065 - ${draft.business.legalName}`)
  document.setSubject('Draft prepared in-browser for review; not filing-ready tax advice')
  document.setCreator('Form 1065 Interviewer')
  return document.save()
}

function fillSimpleBalanceSheet(form: PDFForm, draft: ReturnDraft) {
  const beginCash = draft.finances.beginningCash
  const endCash = endingCash(draft)
  const beginCapital = draft.finances.beginningCapital
  const endCapital = endingCapital(draft)
  const income = ordinaryIncome(draft)

  setText(form, 'f6_15[0]', formatAmount(beginCash))
  setText(form, 'f6_17[0]', formatAmount(endCash))
  setText(form, 'f6_87[0]', formatAmount(beginCash))
  setText(form, 'f6_89[0]', formatAmount(endCash))
  setText(form, 'f6_119[0]', formatAmount(beginCapital))
  setText(form, 'f6_121[0]', formatAmount(endCapital))
  setText(form, 'f6_123[0]', formatAmount(beginCapital))
  setText(form, 'f6_125[0]', formatAmount(endCapital))

  setText(form, 'f6_126[0]', formatAmount(income))
  setText(form, 'f6_133[0]', formatAmount(income))
  setText(form, 'f6_141[0]', formatAmount(income))

  setText(form, 'f6_142[0]', formatAmount(beginCapital))
  setText(form, 'f6_143[0]', formatAmount(draft.finances.memberContributions))
  setText(form, 'f6_145[0]', formatAmount(income))
  setText(
    form,
    'f6_148[0]',
    formatAmount(beginCapital + draft.finances.memberContributions + income),
  )
  setText(form, 'f6_149[0]', formatAmount(draft.finances.cashDistributions))
  setText(form, 'f6_154[0]', formatAmount(draft.finances.cashDistributions))
  setText(form, 'f6_155[0]', formatAmount(endCapital))
}

function appendOtherDeductionsStatement(
  document: PDFDocument,
  draft: ReturnDraft,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const items = draft.finances.otherExpenses.filter((item) => item.amount > 0)
  if (items.length === 0) {
    return
  }

  const bold = document.embedStandardFont(StandardFonts.HelveticaBold)
  const page = document.addPage([612, 792])
  page.drawText('Form 1065 (2025) - Statement 1', {
    x: 54,
    y: 738,
    size: 12,
    font: bold,
    color: rgb(0.08, 0.12, 0.16),
  })
  page.drawText(draft.business.legalName, { x: 54, y: 716, size: 10, font })
  page.drawText(`EIN: ${draft.business.ein || 'Not entered'}`, {
    x: 390,
    y: 716,
    size: 10,
    font,
  })
  page.drawText('Page 1, line 21 - Other deductions', {
    x: 54,
    y: 682,
    size: 11,
    font: bold,
  })

  let y = 650
  for (const item of items) {
    page.drawText(item.description, { x: 66, y, size: 10, font })
    page.drawText(formatAmount(item.amount), {
      x: 486,
      y,
      size: 10,
      font,
    })
    y -= 22
  }
  page.drawLine({
    start: { x: 390, y: y + 8 },
    end: { x: 558, y: y + 8 },
    thickness: 0.8,
  })
  page.drawText('Total other deductions', { x: 300, y: y - 8, size: 10, font: bold })
  page.drawText(formatAmount(totalOtherExpenses(draft)), {
    x: 486,
    y: y - 8,
    size: 10,
    font: bold,
  })
  page.drawText('DRAFT - Review all classifications and attachments before filing.', {
    x: 54,
    y: 54,
    size: 9,
    font,
    color: rgb(0.55, 0.18, 0.12),
  })
}

export function setText(form: PDFForm, suffix: string, value: string) {
  const field = findField(form, suffix)
  if (!(field instanceof PDFTextField)) {
    throw new Error(`Expected ${suffix} to be a text field.`)
  }
  field.setText(value)
}

export function selectYesNo(form: PDFForm, baseName: string, yes: boolean) {
  selectCheckboxOption(form, baseName, yes ? 0 : 1, 2)
}

export function selectCheckboxOption(
  form: PDFForm,
  baseName: string,
  selectedIndex: number,
  optionCount: number,
) {
  for (let index = 0; index < optionCount; index += 1) {
    const field = findField(form, `${baseName}[${index}]`)
    if (!(field instanceof PDFCheckBox)) {
      throw new Error(`Expected ${baseName}[${index}] to be a checkbox.`)
    }
    if (index === selectedIndex) {
      field.check()
    } else {
      field.uncheck()
    }
  }
}

export function check(form: PDFForm, suffix: string) {
  const field = findField(form, suffix)
  if (!(field instanceof PDFCheckBox)) {
    throw new Error(`Expected ${suffix} to be a checkbox.`)
  }
  field.check()
}

export function findField(form: PDFForm, suffix: string) {
  const matches = form
    .getFields()
    .filter(
      (field) =>
        field.getName() === suffix || field.getName().endsWith(`.${suffix}`),
    )
  if (matches.length !== 1) {
    throw new Error(
      `Expected one PDF field ending in ${suffix}; found ${matches.length}.`,
    )
  }
  return matches[0]
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return ''
  }
  const rounded = Math.round(Math.abs(value)).toLocaleString('en-US')
  return value < 0 ? `(${rounded})` : rounded
}

function formatFormDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

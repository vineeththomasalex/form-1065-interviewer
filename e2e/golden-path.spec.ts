import { expect, test } from '@playwright/test'

test('completes the golden path, downloads a filing package, and protects tax IDs on reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('Legal name of the LLC').fill('Example Ventures LLC')
  await page.getByLabel('Federal EIN').fill('12-3456789')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('Street address').fill('100 Main St')
  await page.getByLabel('City').fill('Austin')
  await page.getByLabel('State').fill('TX')
  await page.getByLabel('ZIP code').fill('78701')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('First name').nth(0).fill('Alex')
  await page.getByLabel('Last name').nth(0).fill('Manager')
  await page.getByLabel('First name').nth(1).fill('Jordan')
  await page.getByLabel('Last name').nth(1).fill('Partner')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('Was Form 7004 filed on time?').selectOption('no')
  await page
    .getByLabel(
      'Were all Schedules K-1 filed and given to partners by the applicable due date?',
    )
    .selectOption('no')
  await expect(page.getByText('Estimated late period: 4 months')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await expect(page.getByText('No unsupported complexity selected.')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('Customer payments earned in 2025').fill('900')
  await page.getByLabel('Personal funds contributed by members').fill('1500')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('Software and online services amount').fill('300')
  await expect(page.getByText('$600')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page.getByLabel('SSN or TIN').nth(0).fill('111-22-3333')
  await page.getByLabel('SSN or TIN').nth(1).fill('444-55-6666')
  await expect(
    page.getByRole('link', { name: '2025 Schedule K-1', exact: true }),
  ).toHaveAttribute(
    'href',
    'https://www.irs.gov/pub/irs-prior/f1065sk1--2025.pdf',
  )
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await page
    .getByLabel('U.S. phone number for the representative')
    .fill('555-555-0123')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await expect(page.getByRole('heading', { name: 'Review & download' })).toBeVisible()
  await expect(page.getByText('Schedules K-1', { exact: true })).toBeVisible()
  await expect(page.getByText('2 included')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download draft filing package' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(
    'DRAFT-2025-1065-Filing-Package-Example-Ventures-LLC.pdf',
  )

  await page.reload()
  await page.getByRole('button', { name: 'Business details' }).click()
  await expect(page.getByLabel('Legal name of the LLC')).toHaveValue(
    'Example Ventures LLC',
  )
  await expect(page.getByLabel('Federal EIN')).toHaveValue('')
  await page.getByRole('button', { name: 'Partner schedules' }).click()
  await expect(page.getByLabel('SSN or TIN').nth(0)).toHaveValue('')
  await expect(page.getByLabel('SSN or TIN').nth(1)).toHaveValue('')
})

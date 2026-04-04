import { test, expect } from '../fixtures'

async function setupWizardAndGoToQuestions(page: import('@playwright/test').Page) {
  await page.goto('/#/wizard')
  await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
  await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
  // handle pod prompt
  try {
    await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 })
  } catch { /* already dismissed or logged in */ }
  await page.waitForURL(/#\/manage-questions/, { timeout: 5_000 })
}

test.describe('B – Editing Questions', () => {
  test('B1: manage-questions page loads with sections', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    await expect(page.getByText("My Questions & Items")).toBeVisible()
    // Page has a section for people
    await expect(page.getByText(/Who.*packing|People/i)).toBeVisible()
  })

  test('B2: add a person to the question set', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Find and click "Add Person" button
    await page.getByRole('button', { name: /Add Person/i }).click()
    // A new person entry should appear — type a name
    const nameInputs = page.getByPlaceholder(/name|person/i)
    const count = await nameInputs.count()
    await nameInputs.nth(count - 1).fill('Charlie')
    // Wait for auto-save
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 })
    // Reload to confirm persistence
    await page.reload()
    await expect(page.getByText('Charlie')).toBeVisible()
  })

  test('B3: remove a person from the question set', async ({ freshPage: page }) => {
    // Wizard creates one person "Me" — we need at least 2 to remove one
    await page.goto('/#/wizard')
    await page.getByLabel('Name').first().fill('PersonA')
    await page.getByRole('button', { name: /Add Another Person/i }).click()
    const nameInputs = page.getByLabel('Name')
    await nameInputs.nth(1).fill('PersonB')
    await page.getByRole('button', { name: /Generate My Packing Questions/i }).click()
    await expect(page.getByText('Questions Generated Successfully')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Refine My Packing List Questions/i }).click()
    try { await page.getByRole('button', { name: 'Maybe Later' }).click({ timeout: 3_000 }) } catch { /* ok */ }
    await page.waitForURL(/#\/manage-questions/)
    await expect(page.getByText('PersonB')).toBeVisible()
    // Click delete/remove button next to PersonB
    const personBSection = page.locator(':has-text("PersonB")').last()
    await personBSection.getByRole('button', { name: /remove|delete/i }).click()
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(page.getByText('PersonB')).not.toBeVisible()
  })

  test('B4: add an always-needed item', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Find "Always Needed Items" section and add an item
    const alwaysSection = page.getByText(/always.needed|always needed/i).first()
    await expect(alwaysSection).toBeVisible()
    // There should be an input or "Add Item" button nearby
    const addItemBtn = page.getByRole('button', { name: /Add.*item|New.*item/i }).first()
    await addItemBtn.click()
    // Type in the new item text
    const newItemInput = page.getByPlaceholder(/item.*text|new item/i).last()
    await newItemInput.fill('Passport')
    await page.keyboard.press('Enter')
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(page.getByText('Passport')).toBeVisible()
  })

  test('B5: switch to JSON editor mode and back', async ({ freshPage: page }) => {
    await setupWizardAndGoToQuestions(page)
    // Click "JSON" or "Edit as JSON" button
    const jsonBtn = page.getByRole('button', { name: /json|edit.*json/i }).first()
    await jsonBtn.click()
    // Should see a textarea with JSON content
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    const content = await textarea.inputValue()
    expect(content).toContain('"questions"')
    // Switch back to visual editor
    await page.getByRole('button', { name: /visual|form|back/i }).first().click()
    // Visual editor should be back
    await expect(page.getByText(/Questions|People/i)).toBeVisible()
  })
})

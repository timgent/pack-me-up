import type { Page } from '@playwright/test'

/**
 * Fill required age range and gender selects for the person at the given index.
 * ageRange and gender are required fields — the form won't submit without them.
 */
export async function fillPersonRequiredFields(page: Page, personIndex = 0) {
  await page.selectOption(`[name="people.${personIndex}.ageRange"]`, 'Adult')
  await page.selectOption(`[name="people.${personIndex}.gender"]`, 'prefer-not-to-say')
}

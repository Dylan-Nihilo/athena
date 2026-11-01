import { expect, type Page } from '@playwright/test';

export async function chooseOption(page: Page, label: string, option: string | RegExp) {
  await page.locator(`button[data-choice-label=${JSON.stringify(label)}]`).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
  await expect(page.locator('.choice-select-popover')).toHaveCount(0);
}

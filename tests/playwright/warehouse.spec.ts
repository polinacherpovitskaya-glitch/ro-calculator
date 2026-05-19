import { expect, test } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('warehouse e2e: login, edit qty, verify history', async ({ page }) => {
  const email = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;
  expect(email, 'E2E_USER is required').toBeTruthy();
  expect(password, 'E2E_PASSWORD is required').toBeTruthy();

  await page.goto(`${baseURL}/login`);
  await page.fill('input[type=email]', email!);
  await page.fill('input[type=password]', password!);
  await page.click('button[type=submit]');

  await page.goto(`${baseURL}/warehouse`);
  await expect(page.locator('h1')).toContainText('Склад');

  await page.locator('a[href^="/warehouse/"]').first().click();
  await expect(page.locator('input[type=number]').first()).toBeVisible();

  const qtyInput = page.locator('input[type=number]').first();
  const before = Number(await qtyInput.inputValue());
  await qtyInput.fill(String(before + 1));
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.locator('.history-entry').first()).toContainText('manual_edit');
});

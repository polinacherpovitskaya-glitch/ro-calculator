import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('settings e2e: admin can edit a JSON setting', async ({ page }) => {
  test.setTimeout(45_000);
  const email = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;
  expect(email, 'E2E_USER is required').toBeTruthy();
  expect(password, 'E2E_PASSWORD is required').toBeTruthy();

  await page.goto(`${baseURL}/login`);
  await page.fill('input[type=email]', email!);
  await page.fill('input[type=password]', password!);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.status() === 200),
    page.getByRole('button', { name: 'Войти' }).click(),
  ]);

  const key = `app_config.e2e_${Date.now()}`;
  await page.goto(`${baseURL}/settings`);
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await page.getByLabel('Ключ').fill(key);
  await page.locator('textarea').fill(JSON.stringify({ smoke: true, key }, null, 2));
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/settings/${encodeURIComponent(key)}`) && response.status() === 200),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  await expect(page.getByRole('button', { name: new RegExp(key) })).toBeVisible();
});

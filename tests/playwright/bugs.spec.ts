import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('bugs e2e: login, create bug, update status', async ({ page }) => {
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

  const stamp = Date.now();
  const title = `Block6 bug ${stamp}`;

  await page.goto(`${baseURL}/bugs`);
  await expect(page.getByRole('heading', { name: 'Баги' })).toBeVisible();
  await page.getByRole('button', { name: 'Новый баг' }).click();
  const editor = page.locator('.editor');
  await editor.getByLabel('Заголовок').fill(title);
  await editor.getByLabel('Описание').fill('E2E bug smoke');
  await editor.getByLabel('Страница').fill('e2e');
  await editor.getByLabel('Важность').selectOption('high');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/bugs') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  await page.waitForLoadState('networkidle');

  await expect(page.locator('tbody')).toContainText(title);
  await page.locator('.editor').getByLabel('Статус').selectOption('fixed');
  const [patchResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/bugs/') && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  expect(patchResponse.ok(), await patchResponse.text()).toBeTruthy();
  await expect(page.locator('.editor').getByLabel('Статус')).toHaveValue('fixed');
});

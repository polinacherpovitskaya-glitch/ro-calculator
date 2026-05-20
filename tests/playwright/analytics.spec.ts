import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('analytics e2e: reports open and render data containers', async ({ page }) => {
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

  await page.goto(`${baseURL}/analytics`);
  await expect(page.getByRole('heading', { name: 'Аналитика' })).toBeVisible();
  await expect(page.getByText('План выручка')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Выручка и маржа по месяцам' })).toBeVisible();

  await page.getByRole('button', { name: 'Клиенты' }).click();
  await expect(page.getByRole('heading', { name: 'Топ-клиенты' })).toBeVisible();

  await page.getByRole('button', { name: 'Статусы' }).click();
  await expect(page.getByRole('heading', { name: 'Динамика заказов по статусам' })).toBeVisible();

  await page.getByRole('button', { name: 'Загрузка' }).click();
  await expect(page.getByRole('heading', { name: 'Производственная загрузка' })).toBeVisible();

  await page.getByRole('button', { name: 'Типы' }).click();
  await expect(page.getByRole('heading', { name: 'Производственная загрузка по типам товара' })).toBeVisible();

  await page.getByRole('button', { name: 'Факт' }).click();
  await expect(page.getByRole('heading', { name: 'Фактическая маржа по заказам' })).toBeVisible();
});

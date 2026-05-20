import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('time tracking and payroll e2e: add hours and calculate payroll', async ({ page }) => {
  test.setTimeout(60_000);
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

  const employeesResponse = await page.request.get(`${baseURL}/api/employees?active=true`);
  expect(employeesResponse.ok()).toBeTruthy();
  const { employees } = (await employeesResponse.json()) as { employees: Array<{ id: number; name: string }> };
  const employee = employees[0];
  expect(employee).toBeTruthy();

  const stamp = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  await page.goto(`${baseURL}/time-tracking`);
  await expect(page.getByRole('heading', { name: 'Часы' })).toBeVisible();
  await page.locator('select').first().selectOption(String(employee.id));
  await page.getByLabel('Дата').fill(date);
  await page.getByLabel('Часы').fill('2');
  await page.getByLabel('Проект').fill(`E2E payroll ${stamp}`);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/time-entries') && response.status() === 201),
    page.getByRole('button', { name: 'Добавить' }).click(),
  ]);
  await expect(page.locator('tbody')).toContainText(`E2E payroll ${stamp}`);

  const now = new Date();
  await page.goto(`${baseURL}/payroll`);
  await expect(page.getByRole('heading', { name: 'Зарплаты' })).toBeVisible();
  await page.getByLabel('Год').fill(String(now.getFullYear()));
  await page.getByLabel('Месяц').fill(String(now.getMonth() + 1));
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/payroll/calculate') && response.status() === 200),
    page.getByRole('button', { name: 'Пересчитать всех' }).click(),
  ]);
  await expect(page.locator('tbody')).toContainText(employee.name);
  await expect(page.locator('tbody')).toContainText('₽');
});

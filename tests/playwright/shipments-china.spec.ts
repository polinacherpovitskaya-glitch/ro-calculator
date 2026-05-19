import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('shipments/china e2e: create receipt, receive, verify warehouse qty and history', async ({ page }) => {
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

  const itemsResponse = await page.request.get(`${baseURL}/api/warehouse/items`);
  expect(itemsResponse.ok()).toBeTruthy();
  const { items } = (await itemsResponse.json()) as { items: Array<{ id: number; name: string; qty: number }> };
  const target = items.find((item) => Number.isFinite(Number(item.qty)));
  expect(target, 'warehouse item is required').toBeTruthy();
  const beforeQty = Number(target!.qty);

  await page.goto(`${baseURL}/shipments/new`);
  await expect(page.getByRole('heading', { name: 'Новая приёмка' })).toBeVisible();
  await page.locator('label').filter({ hasText: 'Название' }).locator('input').first().fill(`E2E receipt ${Date.now()}`);
  await page.locator('tbody select').first().selectOption(String(target!.id));
  await page.locator('tbody input').nth(0).fill(`E2E ${target!.name}`);
  await page.locator('tbody input.number').nth(0).fill('2');
  await page.locator('tbody input.number').nth(1).fill('1');

  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/shipments') && response.request().method() === 'POST' && response.status() === 201),
    page.getByRole('button', { name: 'Создать' }).click(),
  ]);

  page.once('dialog', (dialog) => dialog.accept());
  const [receiveResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/receive')),
    page.getByRole('button', { name: 'Принять' }).click(),
  ]);
  expect(receiveResponse.status(), await receiveResponse.text()).toBe(200);

  const itemResponse = await page.request.get(`${baseURL}/api/warehouse/items/${target!.id}`);
  expect(itemResponse.ok()).toBeTruthy();
  const { item } = (await itemResponse.json()) as { item: { qty: number } };
  expect(Number(item.qty)).toBeGreaterThanOrEqual(beforeQty + 2);

  await page.goto(`${baseURL}/warehouse/history?type=receipt`);
  await expect(page.locator('tbody')).toContainText('receipt');
});

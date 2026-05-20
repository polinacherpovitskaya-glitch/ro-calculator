import { expect, test, type Page } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

async function login(page: Page) {
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
}

test('orders e2e: create, add items, recalc, reload, consume hardware', async ({ page }) => {
  await login(page);

  const stamp = Date.now();
  const orderName = `E2E order ${stamp}`;
  const clientName = `E2E client ${stamp}`;

  await page.goto(`${baseURL}/orders`);
  await expect(page.getByRole('heading', { name: 'Заказы' })).toBeVisible();
  await page.getByRole('link', { name: 'Новый заказ' }).click();
  await page.getByLabel('Название').fill(orderName);
  await page.getByLabel('Клиент').fill(clientName);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST' && response.status() === 201),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  await expect(page).toHaveURL(/\/orders\/\d+/);

  for (const name of [`Badge ${stamp}`, `Package ${stamp}`]) {
    await page.getByRole('button', { name: 'Добавить позицию' }).click();
    const dialog = page.locator('.modal');
    await dialog.getByLabel('Название').fill(name);
    await dialog.getByLabel('Количество').fill('2');
    await dialog.getByLabel('Цена').fill('150');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/items') && response.request().method() === 'POST' && response.status() === 201),
      dialog.getByRole('button', { name: 'Добавить' }).click(),
    ]);
  }

  await page.getByRole('button', { name: 'Расчет' }).click();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/orders/') && response.url().endsWith('/recalc') && response.status() === 200),
    page.getByRole('button', { name: 'Пересчитать' }).click(),
  ]);

  await page.reload();
  await expect(page.getByLabel('Название')).toHaveValue(orderName);
  await page.getByRole('button', { name: 'Позиции' }).click();
  await expect(page.locator('tbody')).toContainText(`Badge ${stamp}`);
  await expect(page.locator('tbody')).toContainText(`Package ${stamp}`);

  const warehouseName = `E2E hardware ${stamp}`;
  const createWarehouse = await page.request.post(`${baseURL}/api/warehouse/items`, {
    data: { id: stamp, name: warehouseName, qty: 3, unit: 'pcs' },
    headers: { 'Idempotency-Key': String(stamp) },
  });
  expect(createWarehouse.ok(), await createWarehouse.text()).toBeTruthy();

  await page.getByRole('button', { name: 'Списать фурнитуру' }).click();
  const consumeDialog = page.locator('.modal');
  await consumeDialog.getByLabel('Поиск склада').fill(warehouseName);
  await consumeDialog.getByRole('button', { name: 'Найти' }).click();
  await expect(consumeDialog.locator('tbody')).toContainText(warehouseName);
  await consumeDialog.locator('tbody input').first().fill('1');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/consume-hardware') && response.status() === 200),
    consumeDialog.getByRole('button', { name: 'Списать' }).click(),
  ]);

  const listWarehouse = await page.request.get(`${baseURL}/api/warehouse/items?search=${encodeURIComponent(warehouseName)}`);
  expect(listWarehouse.ok(), await listWarehouse.text()).toBeTruthy();
  const body = await listWarehouse.json();
  expect(Number(body.items[0].qty)).toBe(2);
});

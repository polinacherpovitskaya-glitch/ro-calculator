import { expect, test } from 'playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://ops-staging.recycleobject.ru';

test('molds/blanks/colors/marketplaces e2e: edit mold hardware and consume stock', async ({ page }) => {
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

  const stamp = Date.now();
  const itemId = Number(`6${String(stamp).slice(-11)}`);
  const moldId = Number(`5${String(stamp).slice(-11)}`);
  const itemName = `Block5 hardware ${stamp}`;
  const moldName = `Block5 mold ${stamp}`;

  const itemResponse = await page.request.post(`${baseURL}/api/warehouse/items`, {
    headers: { 'Idempotency-Key': `block5-item-${stamp}` },
    data: { id: itemId, name: itemName, sku: `B5-${stamp}`, qty: 10, category: 'e2e' },
  });
  expect(itemResponse.ok(), await itemResponse.text()).toBeTruthy();

  const moldResponse = await page.request.post(`${baseURL}/api/molds`, {
    headers: { 'Idempotency-Key': `block5-mold-${stamp}` },
    data: { id: moldId, name: moldName, type: 'e2e', usage_limit: 100 },
  });
  expect(moldResponse.ok(), await moldResponse.text()).toBeTruthy();

  await page.goto(`${baseURL}/molds`);
  await expect(page.getByRole('heading', { name: 'Молды' })).toBeVisible();
  await expect(page.getByRole('link', { name: moldName })).toBeVisible();
  await page.getByRole('link', { name: moldName }).click();
  await expect(page.getByRole('heading', { name: moldName })).toBeVisible();

  const hardwareSection = page.locator('section', { hasText: 'Фурнитура' });
  await hardwareSection.getByRole('button', { name: 'Добавить' }).click();
  await hardwareSection.locator('select').first().selectOption(String(itemId));
  await hardwareSection.locator('input.number').first().fill('2');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/molds/${moldId}/hardware`) && response.status() === 200),
    hardwareSection.getByRole('button', { name: 'Сохранить фурнитуру' }).click(),
  ]);

  page.once('dialog', (dialog) => dialog.accept());
  const useSection = page.locator('section', { hasText: 'Использование' });
  await page.getByLabel('Единиц').fill('2');
  const [useResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/molds/${moldId}/use`)),
    useSection.getByRole('button', { name: 'Зафиксировать' }).click(),
  ]);
  expect(useResponse.status(), await useResponse.text()).toBe(200);
  await expect(page.locator('header p').first()).toContainText('2 использований');

  const afterItemResponse = await page.request.get(`${baseURL}/api/warehouse/items/${itemId}`);
  expect(afterItemResponse.ok()).toBeTruthy();
  const { item } = (await afterItemResponse.json()) as { item: { qty: number } };
  expect(Number(item.qty)).toBeLessThan(10);

  await page.request.post(`${baseURL}/api/blanks/hardware`, {
    headers: { 'Idempotency-Key': `block5-blank-${stamp}` },
    data: { id: Number(`7${String(stamp).slice(-11)}`), name: `Block5 blank ${stamp}`, sku: `BH-${stamp}`, last_price: 1 },
  });
  await page.goto(`${baseURL}/blanks`);
  await expect(page.getByRole('heading', { name: 'Бланки' })).toBeVisible();
  const blanksResponse = await page.request.get(`${baseURL}/api/blanks/hardware?search=Block5%20blank%20${stamp}`);
  expect(blanksResponse.ok()).toBeTruthy();
  const { blanks } = (await blanksResponse.json()) as { blanks: Array<{ name: string }> };
  expect(blanks.some((blank) => blank.name === `Block5 blank ${stamp}`)).toBeTruthy();

  await page.request.post(`${baseURL}/api/colors`, {
    headers: { 'Idempotency-Key': `block5-color-${stamp}` },
    data: { id: Number(`9${String(stamp).slice(-11)}`), name: `Block5 color ${stamp}`, hex: '#224466' },
  });
  await page.goto(`${baseURL}/colors`);
  await expect(page.getByRole('heading', { name: 'Цвета' })).toBeVisible();
  const colorsResponse = await page.request.get(`${baseURL}/api/colors?search=Block5%20color%20${stamp}`);
  expect(colorsResponse.ok()).toBeTruthy();
  const { colors } = (await colorsResponse.json()) as { colors: Array<{ name: string }> };
  expect(colors.some((color) => color.name === `Block5 color ${stamp}`)).toBeTruthy();

  await page.request.post(`${baseURL}/api/marketplaces`, {
    headers: { 'Idempotency-Key': `block5-set-${stamp}` },
    data: {
      id: Number(`4${String(stamp).slice(-11)}`),
      name: `Block5 set ${stamp}`,
      marketplace: 'e2e',
      price: 10,
      currency: 'RUB',
      composition: [{ warehouse_item_id: itemId, qty: 1 }],
    },
  });
  await page.goto(`${baseURL}/marketplaces`);
  await expect(page.getByRole('heading', { name: 'Маркетплейсы' })).toBeVisible();
  await expect(page.locator('tbody')).toContainText(`Block5 set ${stamp}`);
});

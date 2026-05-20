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

test('work management e2e: create task, comment, checklist, close', async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const title = `E2E task ${stamp}`;

  await page.goto(`${baseURL}/tasks`);
  await expect(page.getByRole('heading', { name: 'Задачи' })).toBeVisible();
  await page.getByRole('button', { name: 'Новая задача' }).click();
  await page.locator('.editor').getByLabel('Название').fill(title);
  await page.locator('.editor').getByLabel('Описание').fill('E2E work-management smoke');

  const [createResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Сохранить' }).click(),
  ]);
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  await expect(page.locator('tbody')).toContainText(title);

  await page.locator('.editor input[placeholder="Комментарий"]').fill('Комментарий из smoke');
  const [commentResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/work/tasks/') && response.url().endsWith('/comments')),
    page.locator('.editor').getByRole('button', { name: 'Отправить' }).click(),
  ]);
  expect(commentResponse.ok(), await commentResponse.text()).toBeTruthy();
  await expect(page.locator('.editor')).toContainText('Комментарий из smoke');

  await page.locator('.editor input[placeholder="Новый пункт"]').fill('Проверить чек-лист');
  const [checklistResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/work/tasks/') && response.url().endsWith('/checklist')),
    page.locator('.editor').getByRole('button', { name: 'Добавить' }).click(),
  ]);
  expect(checklistResponse.ok(), await checklistResponse.text()).toBeTruthy();
  await expect(page.locator('.editor')).toContainText('Проверить чек-лист');

  const [completeResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/tasks/') && response.url().endsWith('/complete')),
    page.getByRole('button', { name: 'Закрыть' }).click(),
  ]);
  expect(completeResponse.ok(), await completeResponse.text()).toBeTruthy();
  await expect(page.locator('.editor').getByLabel('Статус')).toHaveValue('done');
});

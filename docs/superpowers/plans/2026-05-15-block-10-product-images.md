# Block 10 — Storage bucket `product-images` migration

> **REQUIRED:** мастер-плейбук + Block 6 (паттерн S3 + миграции вложений).

**Goal:** Перенести фото товаров из Supabase Storage bucket `product-images` в Selectel Object Storage. Обновить URL в БД (в `order_items.item_data`, `warehouse_items.photo_url`, `product_templates.data` — там, где встречаются ссылки на storage).

**Dependencies:** Block 9 (orders переехали) + Block 6 (S3 helper уже есть).

**Branch:** `block-10-product-images`

---

## File Structure

| File | Action |
|------|--------|
| `ops/scripts/migrate-storage-product-images.mjs` | Скачать из Supabase, залить в Selectel, обновить URL |
| `ops/api/src/routes/uploads.js` | (опц) общий endpoint для будущих upload'ов: `POST /api/uploads { kind: 'product-image', ... }` |
| `ops/api/test/uploads.test.js` | Tests |

Schema changes: **нет** — переиспользуем существующие поля photo_url.

---

## Task 1: Selectel bucket

**Manual:** Создать bucket `ro-ops-product-images` (приватный, ru-1). Использовать тот же service user `ops-app` что в Block 6, добавить bucket в его права.

Добавить в `/srv/ops/infra/.env`:
```
S3_BUCKET_PRODUCT_IMAGES=ro-ops-product-images
```

Расширить `ops/api/src/s3.js` — поддержка нескольких bucket'ов (передавать bucket name явно).

- [ ] Commit: `Extend S3 helper to support multiple buckets`

---

## Task 2: Migration script

**File:** `ops/scripts/migrate-storage-product-images.mjs`

```js
// Находит все URL вида https://....supabase.co/storage/v1/object/.../product-images/...
// в таблицах warehouse_items.photo_url, order_items.item_data->>'photo_url',
// product_templates.data, скачивает файлы, заливает в Selectel S3,
// обновляет URL в БД.

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { uploadObject } from '../api/src/s3.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const BUCKET = process.env.S3_BUCKET_PRODUCT_IMAGES;

function isSupabaseUrl(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/') && url.includes('product-images');
}

async function migrateUrl(originalUrl) {
  // Извлечь путь внутри Supabase bucket
  const m = originalUrl.match(/product-images\/(.+?)(?:\?|$)/);
  if (!m) return null;
  const sbKey = m[1];
  const { data, error } = await supabase.storage.from('product-images').download(sbKey);
  if (error) { console.error(`Download failed for ${sbKey}:`, error); return null; }
  const buffer = Buffer.from(await data.arrayBuffer());
  const newKey = `product-images/${sbKey}`;
  await uploadObject(newKey, buffer, data.type || 'application/octet-stream', BUCKET);
  return `selectel://${BUCKET}/${newKey}`;  // храним псевдо-URL, в API превращаем в presigned
}

async function main() {
  // 1. warehouse_items.photo_url
  const wItems = (await pool.query(
    `SELECT id, photo_url FROM warehouse_items WHERE photo_url LIKE '%supabase.co%product-images%'`
  )).rows;
  for (const i of wItems) {
    const newUrl = await migrateUrl(i.photo_url);
    if (newUrl) {
      await pool.query(`UPDATE warehouse_items SET photo_url = $1 WHERE id = $2`, [newUrl, i.id]);
      console.log(`✓ warehouse_items#${i.id}`);
    }
  }

  // 2. order_items.item_data->>'photo_url'
  const oItems = (await pool.query(
    `SELECT id, item_data FROM order_items WHERE item_data->>'photo_url' LIKE '%supabase.co%product-images%'`
  )).rows;
  for (const i of oItems) {
    const oldUrl = i.item_data.photo_url;
    const newUrl = await migrateUrl(oldUrl);
    if (newUrl) {
      const newData = { ...i.item_data, photo_url: newUrl };
      await pool.query(`UPDATE order_items SET item_data = $1 WHERE id = $2`, [newData, i.id]);
      console.log(`✓ order_items#${i.id}`);
    }
  }

  // 3. product_templates.data (TODO: walk JSON, find all photo_url, migrate)

  await pool.end();
  console.log('Product images migration complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] Commit: `Add product-images storage migration script`

---

## Task 3: API endpoint для presigned URL

Когда фронт хочет показать фото — он шлёт `GET /api/uploads/sign?key=...` и получает временный URL.

Альтернативно — на бэке преобразовывать `selectel://bucket/key` в presigned URL прямо в API ответах для `warehouse_items`, `order_items` и т.п.

Решение: добавить helper `signSelectelUrls(obj)` который рекурсивно обходит объект и заменяет `selectel://bucket/key` на presigned. Применять в response middleware.

- [ ] Commit: `Add Selectel URL signing in API responses`

---

## Task 4: Vue — отображение фото

Везде где есть `<img :src="item.photo_url">` — оно теперь работает, потому что бэк возвращает presigned URL.

- [ ] Проверить на staging: открыть warehouse item с фото, увидеть картинку.

---

## Task 5: Smoke + PR

- Manual smoke: 5 случайных warehouse_items, 5 order_items — открыть, увидеть фото.
- PR в main, merge.

## Acceptance Criteria

- [ ] Все `photo_url` в warehouse_items, order_items, product_templates — переведены на selectel://
- [ ] На staging фото показываются
- [ ] Скрипт идемпотентен (можно перезапустить)

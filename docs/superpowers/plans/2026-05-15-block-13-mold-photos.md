# Block 13 — Storage bucket `mold-photos` migration

> **REQUIRED:** мастер-плейбук + Blocks 6 и 10 (паттерн storage migration).

**Goal:** Перенести фото молдов из Supabase Storage `mold-photos` в Selectel Object Storage. Обновить `molds.photo_url`.

**Dependencies:** Block 5 (molds в Postgres) + Block 6/10 (S3 helper).

**Branch:** `block-13-mold-photos`

---

## File Structure

| File | Action |
|------|--------|
| `ops/scripts/migrate-storage-mold-photos.mjs` | Аналогично product-images |

---

## Task 1: Selectel bucket

Создать `ro-ops-mold-photos`, дать права service user, добавить в `.env`:
```
S3_BUCKET_MOLD_PHOTOS=ro-ops-mold-photos
```

---

## Task 2: Migration script

Та же логика что в Block 10, только bucket = `mold-photos`, таблица = `molds`, поле = `photo_url`.

```js
import { uploadObject } from '../api/src/s3.js';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const BUCKET = process.env.S3_BUCKET_MOLD_PHOTOS;

async function main() {
  const { rows } = await pool.query(
    `SELECT id, photo_url FROM molds WHERE photo_url LIKE '%supabase.co%mold-photos%'`
  );
  for (const m of rows) {
    const match = m.photo_url.match(/mold-photos\/(.+?)(?:\?|$)/);
    if (!match) continue;
    const sbKey = match[1];
    const { data, error } = await supabase.storage.from('mold-photos').download(sbKey);
    if (error) { console.error(`Skip ${m.id}:`, error.message); continue; }
    const buffer = Buffer.from(await data.arrayBuffer());
    const newKey = `mold-photos/${sbKey}`;
    await uploadObject(newKey, buffer, data.type, BUCKET);
    await pool.query(`UPDATE molds SET photo_url = $1 WHERE id = $2`, [`selectel://${BUCKET}/${newKey}`, m.id]);
    console.log(`✓ mold#${m.id}`);
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] Запустить локально на staging. Проверить что фото молдов отображаются на staging UI.
- [ ] Commit: `Add mold-photos storage migration`

---

## Task 3: PR + merge

## Acceptance Criteria

- [ ] Все mold.photo_url переведены на selectel://
- [ ] Фото отображаются на staging

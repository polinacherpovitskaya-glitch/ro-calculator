# Block 16 — Remaining settings Implementation Plan

> **REQUIRED:** мастер-плейбук + все предыдущие блоки.

**Goal:** Перенести оставшиеся ключи `settings` из Supabase, которые не были тронуты в предыдущих блоках. Конкретно: всё, кроме `productionCalendar`, `indirectCosts`, `productionPlan` (Block 8), `warehouseItems` snapshot (рудимент, не переносим), и `finance_*`/`wiki_*` (мы выбрасываем).

**Что обычно лежит в settings (исходя из спеки):**
- `companyInfo` — реквизиты, адрес, логотип
- `marketplaces_*` — настройки маркетплейсов
- `notification_*` — настройки уведомлений
- `app_config` — общие настройки приложения
- Прочее служебное

**Dependencies:** Blocks 1-15.

**Branch:** `block-16-settings`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/012_settings.sql` | Таблица `settings(key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ)` |
| `ops/api/src/routes/settings.js` | GET/PUT по ключу |
| `ops/scripts/refresh/10-settings.mjs` | Copy settings (с whitelist ключей) |
| `ops/web/src/views/SettingsView.vue` | Простой редактор JSON-ключей (для admin) |

---

## Task 1: SQL

```sql
-- 012_settings.sql
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  INTEGER REFERENCES auth_users(id) ON DELETE SET NULL
);

INSERT INTO app_meta (id, version) VALUES (1, '012-settings')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

---

## Task 2: API

- GET `/api/settings/:key`
- PUT `/api/settings/:key` (body: `{ value: ... }`)
- GET `/api/settings` (список всех ключей — admin only)

Авторизация: чтение — все авторизованные; запись — только admin.

- [ ] Commit: `Add settings API`

---

## Task 3: refresh

```js
// ops/scripts/refresh/10-settings.mjs
// Whitelist ключей, которые переносим. Всё остальное (finance_*, wiki_*, _legacy_*) пропускаем.

const WHITELIST = [
  'companyInfo',
  'marketplaces_config',
  'notification_settings',
  'app_config',
  'app_colors_default',
  // ... — расширять при обнаружении новых
];

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { data } = await supabase.from('settings').select('*');
  for (const row of data) {
    if (!WHITELIST.includes(row.key)) {
      console.log(`SKIP ${row.key}`);
      continue;
    }
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [row.key, row.value, row.updated_at || new Date().toISOString()]
    );
    console.log(`✓ ${row.key}`);
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] Запустить локально, проверить что все нужные настройки скопированы.
- [ ] Commit

---

## Task 4: Vue экран

`SettingsView.vue` — таблица всех ключей с их JSON-значениями. Возможность редактировать (JSON editor, например `vue-json-editor` или просто textarea с валидацией JSON).

Только для admin.

- [ ] Commit

---

## Task 5: PR + merge

К этому моменту Block 16 завершает Stage A. После merge — все 16 блоков в `main`, staging автодеплоится, все таблицы заполнены.

Затем идём в Stage B (см. отдельный plan).

## Acceptance Criteria

- [ ] Все whitelist'ed ключи settings скопированы
- [ ] На staging settings экран открывается, можно редактировать
- [ ] PR смержен
- [ ] **Это завершение Stage A.** В `ops/README.md` обновлён статус: «Stage A complete, готовы к Stage B».

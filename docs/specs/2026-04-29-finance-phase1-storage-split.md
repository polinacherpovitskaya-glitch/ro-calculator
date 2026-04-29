# Finance Phase 1 — Storage Split

## Goal
- Убрать самые болезненные finance-данные из `settings` JSON blobs.
- Перевести финансовый контур на явные таблицы, где есть нормальная история, связи и фильтрация.
- Сохранить текущий UI и бизнес-данные, не ломая рабочий контур во время миграции.

## Scope
Phase 1 покрывает только storage layer:
- `finance_workspace_json`
- `tochka_snapshot_json`
- `fintablo_snapshot_json`

В phase 1 мы не переписываем весь UI `Финансы`, а готовим нормальный backend-слой под него.

## Current Pain
Сейчас главная путаница не в Vercel, а в том, что финансовые данные размазаны по 3 слоям:
- `Supabase tables`
- `settings` JSON blobs
- `localStorage` fallback/cache

Критические JSON-blob ключи:
- `finance_workspace_json`
- `tochka_snapshot_json`
- `fintablo_snapshot_json`

Проблемы такого устройства:
- нет нормального query layer по операциям
- тяжело связывать удержания, переводы и payroll-выплаты
- сложно строить `ОПиУ / Рентабельность / Обязательства / Баланс`
- сложно обучать авторазнос не по snapshot, а по истории
- трудно расследовать рассинхрон и правки пользователя

## Target Model
Вместо blob-хранилища вводится 3 слоя:

### 1. Канонический финансовый ledger
- `finance_accounts`
- `finance_categories`
- `finance_directions`
- `finance_counterparties`
- `finance_transactions`
- `finance_transaction_links`
- `finance_rules`
- `finance_manual_decisions`

Это главный источник правды для пользователя и отчетов.

### 2. Bank ingestion staging
- `bank_sync_runs`
- `bank_accounts`
- `bank_transactions`

Это сырые данные из Точки и других банков, чтобы не смешивать `raw bank feed` и уже разнесенные бизнес-операции.

### 3. Legacy imports
- `legacy_finance_import_runs`
- `legacy_finance_transactions`

Это исторический слой для FinTablo, который нужен для long-tail анализа и постепенного auto-learning.

## New SQL
- Основная миграция: [migration_finance_phase1.sql](/private/tmp/ro-smoke-fix-main/migration_finance_phase1.sql)

## Mapping From Current JSON

### `finance_workspace_json`
| Current area | Target table |
| --- | --- |
| `sources[]` | `finance_sources` |
| `accounts[]` | `finance_accounts` |
| `categories[]` | `finance_categories` |
| `projects[]` / business directions | `finance_directions` |
| `profiles[]` | `finance_counterparties` |
| `transactions[]` / merged UI rows | `finance_transactions` |
| transfer/tax/charity/payroll relations | `finance_transaction_links` |
| auto rules / recurring logic | `finance_rules` |
| user confirmations / overrides | `finance_manual_decisions` |

### `tochka_snapshot_json`
| Current area | Target table |
| --- | --- |
| sync metadata | `bank_sync_runs` |
| raw bank accounts | `bank_accounts` |
| raw bank movements | `bank_transactions` |
| mapped business ops | `finance_transactions` |

### `fintablo_snapshot_json`
| Current area | Target table |
| --- | --- |
| import batch metadata | `legacy_finance_import_runs` |
| raw imported rows | `legacy_finance_transactions` |
| normalized operations | `finance_transactions` |

## Migration Order

### Step 1. Create tables
- Apply [migration_finance_phase1.sql](/private/tmp/ro-smoke-fix-main/migration_finance_phase1.sql)
- No UI changes yet

### Step 2. Dual-write
- Keep reading from current JSON blobs
- When finance UI saves:
  - continue saving to old JSON
  - also write into new relational tables

This reduces migration risk to near-zero.

### Step 3. Backfill historical data
- Backfill `finance_workspace_json` into ledger tables
- Backfill `tochka_snapshot_json` into bank staging + normalized ledger
- Backfill `fintablo_snapshot_json` into legacy import tables

### Step 4. Read switch
- New read path:
  - UI loads from relational tables
  - old JSON stays only as fallback/backup

### Step 5. Freeze old blobs
- Mark `finance_workspace_json`, `tochka_snapshot_json`, `fintablo_snapshot_json` as deprecated
- Keep them only for rollback window

## Priority Inside Phase 1

### P1
- `finance_accounts`
- `finance_transactions`
- `finance_transaction_links`
- `bank_accounts`
- `bank_transactions`
- `bank_sync_runs`

Why:
- These tables remove the biggest current chaos: operations still live as opaque snapshots.

### P2
- `finance_categories`
- `finance_directions`
- `finance_counterparties`
- `finance_rules`

Why:
- These stabilize classification and auto-learning.

### P3
- `finance_manual_decisions`
- `legacy_finance_import_runs`
- `legacy_finance_transactions`

Why:
- They improve explainability, auditability and long-history training.

## Risks If We Do Nothing
- finance UI keeps working, but:
  - grows more fragile with every new rule
  - remains hard to debug
  - blocks reliable `ОПиУ / Баланс / Обязательства`
  - keeps training auto-classification on flattened snapshots instead of stable history

## Risks During Migration
- duplicate operations if backfill and live sync use different dedupe keys
- stale JSON can overwrite a fresher relational row if dual-write is asymmetric
- transfer pairs / tax holds / charity holds can be lost if not mapped into `finance_transaction_links`

## Required Dedupe Keys

### Bank transactions
- unique key candidate:
  - `provider`
  - `external_id`

### Ledger transactions
- unique key candidate:
  - `legacy_tx_key`
  - fallback composite:
    - `source_id`
    - `account_id`
    - `occurred_on`
    - `amount`
    - normalized `description`

### Legacy FinTablo rows
- unique key candidate:
  - `import_run_id`
  - `legacy_transaction_id`

## Validation Checklist
- same account count before/after backfill
- same transaction count before/after backfill
- same visible review queue before/after backfill
- same transfer pairs, tax holds and charity holds before/after backfill
- smoke checks still pass:

```sh
node --check js/finance.js
node --check js/supabase.js
node --check js/app.js
node tests/finance-smoke.js
node tests/fintablo-smoke.js
```

## Recommended Next Implementation Step
- Add new relational helper functions in `js/supabase.js` for:
  - `loadFinanceAccounts`
  - `saveFinanceAccounts`
  - `loadFinanceTransactions`
  - `saveFinanceTransactions`
  - `loadBankTransactions`
  - `saveBankSyncRun`
- Keep current JSON path alive during dual-write window.

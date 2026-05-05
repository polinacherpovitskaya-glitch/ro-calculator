# Yandex Migration Readiness

Last updated: 2026-05-05

This file is the working checklist before moving write ownership from Supabase/Vercel paths to Yandex-side infrastructure. It is intentionally conservative: a module is not migration-ready just because it loads on `calc2`; it must save, reload, dedupe repeated actions and stay visible from all public entry points.

## Current Baseline

- Public entry points: `calc.recycleobject.ru`, `calc2.recycleobject.ru`, GitHub Pages reserve.
- Current deployed app version: `v332`.
- Current Yandex write-back smoke: green for service rows in `warehouse_items`, `shipments`, `china_purchases`, `molds`.
- Static audit: green for duplicate scripts, missing scripts, duplicate HTML ids and missing inline handler object methods.
- Data-path audit: 133 load/save/update/delete functions, 67 remote writers, 40 remote readers, 96 functions with fallback/local cache behavior.

## Readiness Matrix

| Module | Current Source | Yandex State | Risk | Next Gate |
| --- | --- | --- | --- | --- |
| Warehouse items | Supabase `warehouse_items` + local fallback + static bootstrap | Read works on `calc2`; proxy smoke can write service item | High | Verify quantity edit, add, delete, inventory and repeated save from `calc2`, then compare on `calc` |
| Warehouse reservations/project hardware | Supabase `warehouse_reservations` + `settings.projectHardwareState` + local fallback | Read works after recent fixes | Very high | Smoke collect/uncollect project hardware twice; final stock/reserve must equal one intentional action |
| Shipments / приемки | Supabase `shipments` + local fallback | Proxy smoke can write service shipment | High | Verify China receipt creates shipment once and receiving twice does not duplicate stock |
| China purchases | Supabase `china_purchases` + legacy `china_orders` + local fallback | Proxy smoke can write service purchase | High | Verify draft/edit/status/receive/delete from `calc2`, then reload on `calc` |
| Orders and order items | Supabase `orders`, `order_items`, `fintablo_imports` + local fallback | Main source still Supabase | Very high | Verify save/order status/delete/clone/idempotency before any write-source switch |
| Molds and blanks | Supabase `molds`, `hw_blanks`, `pkg_blanks`, `app_colors`, `marketplace_sets` + local fallback/templates | Proxy smoke can write mold; UI link preservation fixed | Medium-high | Verify attach stock hardware to mold, reload, calculate order, and preserve link instead of converting to custom |
| Time/payroll/employees/auth | Supabase `time_entries`, `employees`, `settings` + local fallback | Not ready for write-source switch | High | Verify employee login, time edit, previous-month filter, payroll half-month, auth session restore |
| Work/tasks/projects/bugs | Supabase work tables + JSON setting fallback + local fallback | Not ready for write-source switch | High | Verify task/project/comment/asset write parity and notification event dedupe |
| Finance / FinTablo | Supabase `settings` snapshots + local workspace | Keep as non-migration-critical for now | Medium | Fix visible finance error separately; do not remove external finance service yet |
| Monitoring | GitHub API + local cache | Independent of business data | Low | Keep as health dashboard; add write-back smoke status row if missing |

## Immediate Migration Order

1. Warehouse quantity/edit/add/delete/inventory because this is the employee-blocking path in Russia.
2. China purchases + shipments because these create stock movements and are business-critical.
3. Molds/blanks attachment because wrong stock links corrupt future deductions.
4. Orders/order items only after warehouse and China idempotency are proven.
5. Time/payroll/auth after operational stock flows are stable.
6. Finance last; keep FinTablo/service workflow until we are comfortable.

## Hard Rules

- A save that only succeeds locally is not a successful shared save.
- A repeated click must not double deduct, double receive, double create a shipment or double create a task.
- `calc` and `calc2` must converge to the same result after reload.
- Read-only fallback may help employees see data, but it must not pretend that a failed write was shared.
- Large photos and imported snapshots must not be part of the initial critical load for Russian users.

## Verification Commands

```sh
node scripts/audit-codebase-health.mjs
node scripts/audit-data-paths.mjs
node tests/version-smoke.js
node tests/order-flow-smoke.js
node tests/supabase-fallback-smoke.js
node tests/yandex-writeback-smoke.mjs
```

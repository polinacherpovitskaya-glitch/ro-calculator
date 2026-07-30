# Test Plan

## Active track — Exhaustive calculator audit, phase 1

**Source:** `docs/specs/2026-07-30-calculator-exhaustive-audit-phase1.md`
**Plan:** `docs/plans/2026-07-30-calculator-exhaustive-audit-phase1.md`

### Audit dimensions

Every row below must be checked across the applicable dimensions:

1. initial rendering and input constraints;
2. immediate state/calculation update;
3. authoritative price/cost source;
4. autosave and manual-save payload;
5. load and second save;
6. order list/detail and other consumer rendering;
7. negative, legacy and zero-value behavior.

### Field and consumer matrix

| Area | Representative scenarios | Required consumers |
| --- | --- | --- |
| Header | identity, manager, dates, notes, contacts, links, legal/bank fields | calculator, saved order, order detail |
| Purpose | commercial, leftovers, rework, stock sample | calculator, orders, detail, production and financial summaries |
| Discount | none, percent, fixed amount, comma input, over-limit input | pricing card, summary, saved snapshot, invoice/KP, plan-fact |
| Custom product | ordinary, stock mold, extra molds, complex design, NFC, delivery | cost breakdown, pricing, load, saved item, list/detail |
| Catalog blank | normal and NFC tiers, manual-price on/off | blanks catalog, calculator pricing, saved item, list/detail |
| Printing | multiple types, explicit/default delivery, removed row | product cost, pricing, invoice/KP, saved item |
| Colors/files | multiple colors, legacy single color, multiple attachments | calculator, saved item, order detail |
| Hardware | warehouse, China, custom China, custom Russia; global/per-product | pricing, load, saved item, order detail, later warehouse |
| Packaging | warehouse, China, custom China, custom Russia; global/per-product | pricing, load, saved item, order detail, later warehouse |
| Pendant | letters, multiple cords/carabiners, allocations and packaging | pricing, load, saved item, invoice/KP, later warehouse |
| Extra row | named/unnamed, positive/zero | pricing, saved item, invoice/KP |
| Lifecycle | autosave, manual save, refresh restore, load, resave, clone | saved data, history, list/detail, calculator |

### Price-provenance checks

- Settings-driven product components use the current `getProductionParams`
  values and documented defaults only.
- Blank/NFC cost and recommendation match the selected `Molds` tier.
- Warehouse purchase cost hydrates from current stock, while the linked blank
  tier is the preferred sale-price source.
- China rows retain selected catalog/manual CNY, weight, exchange-derived
  purchase price and delivery method after reload.
- Custom Russia rows retain manually entered RUB purchase/delivery values.
- Printing cost includes its entered purchase price and explicit/default
  delivery exactly once.
- Pendant letters and attachments match their blank and warehouse sources.
- A manual zero sell price remains zero and represents a free sale.

### Automated baseline — 2026-07-30

- [x] all `js/*.js` and `corporate-gift/*.js` syntax checks
- [x] `node scripts/audit-codebase-health.mjs`
- [x] `node scripts/audit-data-paths.mjs`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/pricing-canon-smoke.js`
- [x] `node tests/molds-smoke.js`
- [x] `node tests/warehouse-migration-smoke.js`
- [x] focused all-header save/load/resave regression
- [x] focused representative price-provenance regression
- [ ] headed browser render/save/load/resave pass
- [ ] cross-view parity pass

### Completed headed scenarios

- [x] full header create/save/load/resave fixture
- [x] custom NFC product render and full cost breakdown
- [x] calculator → board → order detail parity for quantity, revenue, cost,
      deadline and canonical net margin
- [x] 3K NFC blank recommendation matched the active blanks tier formula
- [x] manual resave kept one order id and one item row
- [ ] printing, colors/files, hardware, packaging, pendant, extras and discounts
- [ ] invoice/KP, plan-fact and production consumer parity

### Confirmed regressions fixed in pass 1

- [x] negative-offset deadline date shift
- [x] legal/bank fields hidden from order detail
- [x] half-cent money rounding down
- [x] order-detail item margin using gross instead of canonical net margin
- [x] stale 6.5% labels and ignored `commercialRate` setting

### Phase-1 exit gate

- All header fields and representative item-source fields survive both save
  cycles.
- Each representative price has an identified source and a numeric equality
  assertion.
- Calculator, saved snapshot and downstream consumer totals agree.
- Confirmed defects have a focused regression and surgical fix.
- Warehouse mutation remains pending until the C4 fixture/rollback gate.

## Completed track — Production calendar priority Gantt

**Source:** `docs/specs/2026-07-28-production-calendar-priority-gantt.md`
**Plan:** `docs/plans/2026-07-28-production-calendar-priority-gantt.md`

### In scope

- Four-person production capacity and nine-hour default shift.
- Priority propagation when one order uses one to four workers.
- Unified draggable order rows and Gantt timeline.
- Persisted order priority and `parallel_workers`.
- Explicit order navigation.
- Compact blocked/review sections.
- Removal of the separate queue, capacity chart, summary widgets, and calendar capacity settings.

### Automated checks

- `node tests/production-calendar-smoke.js`
- `node tests/production-floor-core-smoke.js`
- `node tests/order-flow-smoke.js`
- `node tests/settings-production-ui-smoke.js`
- `node tests/version-smoke.js`

### Required scenarios

1. A 36-hour order with four workers fills one nine-hour working day.
2. A lower-priority order cannot consume a worker while all four slots are assigned above it.
3. One-worker orders can run in parallel up to the four-person total.
4. Dragging a row changes `order_ids`, saves the plan, and recalculates dates.
5. Worker controls never save a value below 1 or above 4.
6. Weekends and production holidays remain excluded.
7. Blocked and review orders remain accessible but do not consume scheduled capacity.
8. The page contains no “36 ч в день”, separate launch queue, or editable capacity fields.

### Release gates

- [x] All focused checks pass.
- [x] All four version anchors match and exceed the refreshed `origin/main` version.
- [x] Every changed runtime asset has a new cache-bust suffix.
- [x] The diff contains no schema migration, deletion, or destructive data operation.

## Source
- Task: провести сквозной аудит order flows, colors, China/warehouse/ready goods и `corporate-gift`, исправить дефекты и оформить backlog улучшений.
- Plan file: `/Users/krollipolli/Documents/Github/RO calculator/docs/plans.md`
- Status file: `/Users/krollipolli/Documents/Github/RO calculator/docs/status.md`
- Related follow-up docs:
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/improvement-backlog.md`
  - `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`
- Repo context: vanilla JS SPA с модулями `app`, `orders`, `order-detail`, `china`, `warehouse`, `colors`, `supabase` и отдельным `corporate-gift/`.
- Last updated: 2026-03-30

## Validation Scope
- In scope: calculator order create/save/load/edit/clone, order list/detail/status changes, color reference и color persistence в item data, **полный складской цикл (добавление/списание/инвентаризация/приемка)** во всех окнах, warehouse reservations/deductions/returns/ready goods, China purchase/consolidation/receipt flows, `corporate-gift` form/render/submit boundary, order-related tasks/projects widgets как regression perimeter.
- Out of scope: bot/Telegram, analytics accuracy вне order regression paths, marketplaces sync, полноценное performance/load testing.
- Auth/data-security remediation теперь ведется отдельным execution track в `docs/auth-remediation-plan.md`; до его реализации audited scope нельзя считать полностью release-safe.

## Environment / Fixtures
- Data fixtures: минимум один product order, один order с warehouse hardware, один order с warehouse packaging, один order с pendant data, один sample order, один completed order, одна China purchase, непустой warehouse seed, рабочий `corporate-gift/config.json`.
- External dependencies: Supabase/localStorage data layer, браузер, при наличии реальная auth session, Google Apps Script endpoint или mock/intercept для `corporate-gift`.
- Setup assumptions: локальный запуск через `python3 -m http.server 4173`; browser audit через headed Playwright flow или эквивалентный живой браузер; если live auth недоступен, локальный/fallback coverage все равно обязателен и live gap фиксируется в `docs/status.md`.
- Build/deploy assumptions: публичный релиз приходит только из `origin/main` через GitHub Pages workflow; локальный `http.server` или `python3 -m http.server` служит только для smoke и не подтверждает сам по себе, что сайт уже обновился наружу.
- Regression artifact expectation: findings log в `docs/status.md`, плюс lightweight smoke scripts в `tests/`, если чистую бизнес-логику удастся изолировать в M1.
- Current reproducible harness: `node tests/order-flow-smoke.js` покрывает `Calculator` persistence (`china hardware/pkg + pendant + colors`), legacy pendant restore, warehouse packaging picker defaults (`assembly_speed` + selected id as string), project-warehouse reserve flow для packaging на обычном save, ready-goods rollback sync, `ready goods sales/writeoff/manual add`, warehouse manual stock adjustment + history trail, clamped partial-deduction behavior и shortage toast при `sample -> delivery`, partial reserve toast при `draft -> sample`, rollback после clamped deduction, sticky `project_hardware` checks после reload, shortage-safe toggle для `project_hardware` без fake-ready/over-return, отдельный блок `Собрано` для собранных заказов и auto-hide для `completed + собрано`, показ packaging внутри `Фурнитура и упаковка для проектов`, сохранение China shipment metadata, `Orders._syncWarehouseByStatus` и `order-detail` rendering для `colors[] / color_solution_attachment`; `node tests/auth-hardening-smoke.js` отдельно проверяет versioned auth hash path, legacy verifier compatibility, auto-upgrade legacy login в `v2`, `password_hash_version/password_rotated_at`, disabled-account restore boundary, permissions fallback без `employee_id`, security rendering и auth-backup export; `node tests/supabase-fallback-smoke.js` проверяет missing-table fallback для `sales_records` и aggressive local-cache cleanup path в `initSupabase`; `node tests/factual-smoke.js` держит regression на `План-факт` totals, чтобы скрытые salary/indirect строки non-admin не удваивали `ИТОГО`, а saved-plan total не расходился молча с пересчитанными статьями.

## Test Levels

### Unit / Logic
- Проверить `saveOrder` / `loadOrder` companion logic в `js/supabase.js`: stable item ids, dedupe/rewrite repair, local backup behavior, сохранение `calculator_data` и `item_data`.
- Проверить color normalization и migration: legacy `color_id`, `colors[]`, `color_solution_attachment`, а также безопасный рендер при отсутствии фото и ссылок.
- Проверить order demand helpers: `_collectWarehouseReservationDemand`, `_collectWarehouseDemand`, проектную demand-логику в `warehouse`, расчеты `moveOrderToReadyGoods`.
- Проверить `corporate-gift` input normalization: allowed alphabets, max letters, rainbow resolution, required-field validation, graceful fallback без `googleScriptUrl`.

### Integration
- Проверить `Calculator.saveOrder -> saveOrder -> Orders/OrderDetail` consistency для нового заказа, повторного сохранения, reload и clone.
- Проверить `Orders.onStatusChange` и `_syncWarehouseByStatus` на sample, production-like statuses, возвратах, partial reserve и списании.
- Проверить `OrderDetail -> ChinaPurchases` creation flow и дальнейший receipt linkage через shipments в склад.
- Проверить, что warehouse adjustments, ready-goods history loops и reservations остаются консистентными после edit, status rollback и completed orders.
- Проверить, что `order-detail` после фиксов продолжает показывать связанные tasks/projects/china meta без регрессии.
- Проверить, что `corporate-gift` submit payload содержит нормализованные данные букв/цветов и изображение подвеса, если preview доступен.
- Проверить, что `План-факт` после sync с `FinTablo` не ломает скрытие salary/indirect строк, не искажает totals для non-admin и честно показывает drift между saved plan total и пересчитанными статьями.

### End-to-End / Smoke
- Открыть root app и пройти маршруты `orders`, `colors`, `warehouse`, `china`, затем создать заказ из калькулятора с mix `product + hardware + packaging + pendant`.
- Сохранить order, перезагрузить, отредактировать, клонировать и проверить `order-detail`, историю изменений и meta badges.
- Перевести order через `sample -> in_production -> completed` или ближайшие реальные статусы и проверить резервы, списания, возвраты и ready goods effects.
- Создать закупку из `order-detail`, пройти консолидацию/приход на склад и проверить связанный остаток и историю.
- Пройти полный складской цикл: ручное добавление позиции, списание, инвентаризация (сверка/сохранение), приемка (включая China), и проверить, что количество отражается одинаково во всех окнах.
- Открыть `corporate-gift/`, собрать подвес, пройти обязательную валидацию и проверить submit boundary / success fallback.
- После каждой пачки фиксов повторять короткий regression loop по order create, status change, warehouse view, china view и ready goods.

## Negative / Edge Cases
- Пустое имя заказа должно авто-сгенерироваться без потери остальных полей.
- Edit заказа с заменой warehouse item или сменой qty не должен давать double deduction и не должен забывать вернуть старый остаток.
- Частичный резерв при нехватке остатка должен быть прозрачен в UI и не ломать дальнейшие списания.
- История склада при нехватке остатка должна писать фактически примененное списание, а не полный запрошенный delta.
- Rollback после clamped-списания должен возвращать только фактически списанное количество, а не полный спрос заказа.
- Инвентаризация должна показывать системное количество, а сохранение фактического должно менять склад без «невидимых» расхождений.
- Приемка должна менять количество на складе сразу после подтверждения и писать корректную историю.
- Legacy orders/items без `hardware_source`, `packaging_source`, `item_data` или color photo должны оставаться читаемыми.
- Duplicate `order_items` rows должны repair-иться безопасно на load без silent data loss.
- Откат статуса из consumed back в non-consumed должен возвращать stock ровно один раз.
- Disabled auth account не должен переживать refresh через stale `localStorage` session.
- Auth account без `employee_id` не должен получать все страницы через permissive fallback; при этом явные `pages[]` должны продолжать работать.
- Галочка `собрано` в `project_hardware` не должна пропадать после reload, если фурнитура уже списана и заказ все еще в tracked-statuses.
- Галочка `собрано` в `project_hardware` не должна отмечаться успешно, если списание clamped из-за нехватки остатка; при снятии галочки должен возвращаться только фактически списанный объем.
- Полностью собранный заказ не должен оставаться в активном блоке `к сборке`; он должен попадать в отдельный блок `Собрано`.
- Полностью собранный заказ со статусом `completed` не должен оставаться ни в `к сборке`, ни в `Собрано`; он должен скрываться автоматически.
- `corporate-gift` без `googleScriptUrl` не должен падать и должен иметь предсказуемое локальное поведение.
- `corporate-gift` с пустой или некорректной формой должен блокировать submit и фокусировать корректное поле.

## Acceptance Gates
- [x] `node scripts/audit-codebase-health.mjs`
- [x] `node scripts/audit-data-paths.mjs`
- [x] `node tests/warehouse-migration-smoke.js`
- [ ] `for f in js/*.js corporate-gift/*.js; do node --check "$f"; done`
- [ ] `python3 -m http.server 4173`
- [x] `node tests/order-flow-smoke.js`
- [x] Эквивалентный warehouse/ready-goods reproducible harness внутри `node tests/order-flow-smoke.js`
- [x] `node tests/auth-hardening-smoke.js`
- [x] `node tests/factual-smoke.js`
- [x] `node tests/supabase-fallback-smoke.js`
- [ ] Headed browser smoke для root app order flow
- [ ] Headed browser smoke для `corporate-gift/`
- [x] Browser-runtime auth sanity для legacy login upgrade, disabled restore и permissions fallback на локальном сервере
- [x] Browser-runtime warehouse sanity для sticky `project_hardware` checks, shortage-safe toggle, блока `Собрано` и auto-hide для `completed + собрано` на локальном сервере
- [ ] Live-session verification для `orders/china/warehouse/ready goods` или явный blocker, зафиксированный в `docs/status.md`
- [ ] Public deploy verification: latest GitHub Pages workflow run на `main` green и публичный `index.html` отдает ожидаемые cache-bust версии audited scripts

## Release / Demo Readiness
- [x] Main order creation/edit/reload/clone path работает end to end
- [x] Color selections и attachments переживают save/load/detail rendering
- [x] Warehouse reservations/deductions/returns предсказуемо ведут себя на статусных переходах
- [x] China flow и warehouse receipt воспроизводимы
- [x] Ready goods получает completed product orders без дублей
- [x] Ready goods `sales/writeoff/manual add` и ручная корректировка склада воспроизводимо проверяются smoke harness-ом
- [x] Missing-table fallback для `sales_records` воспроизводимо проверяется отдельно и не спамит повторными remote calls после деградации
- [x] Cold-boot cleanup path в `supabase.js` не падает на missing helper и переносит крупный cache в volatile memory
- [x] `project_hardware` больше не теряет checked-state после reload; shortage не дает ложный ready/over-return, собранные заказы видны в `Собрано`, а `completed + собрано` скрывается автоматически
- [x] `corporate-gift` demoable и на valid, и на invalid path
- [x] Новые и reset-auth credentials сохраняются через versioned hash path, а legacy accounts подсвечиваются до forced reset
- [x] Перед auth migration можно снять отдельный sanitized auth backup без выгрузки `password_plain`
- [x] `План-факт` не удваивает totals для non-admin при скрытых salary/indirect строках и не показывает silent drift между saved total и row breakdown
- [ ] В audited scope не осталось blocker-level known issue
- [x] Improvement backlog приоритизирован после фиксов
- [x] Auth/data-security remediation path документирован отдельно

## Command Matrix
```sh
node scripts/audit-codebase-health.mjs
node scripts/audit-data-paths.mjs
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
node tests/order-flow-smoke.js
node tests/warehouse-migration-smoke.js
node tests/auth-hardening-smoke.js
node tests/factual-smoke.js
node tests/supabase-fallback-smoke.js
curl -s 'https://api.github.com/repos/polinacherpovitskaya-glitch/ro-calculator/actions/runs?per_page=1'
curl -s 'https://polinacherpovitskaya-glitch.github.io/ro-calculator/' | rg 'js/supabase.js|js/app.js|js/order-detail.js|js/warehouse.js'
```

## Open Risks
- Live auth/data access может оказаться недоступным из текущей сессии, что ограничит финальное подтверждение на реальных данных.
- Значимая часть бизнес-логики живет в browser modules с плотной DOM/state связкой, поэтому часть coverage может остаться smoke-level, пока не появятся harnessable seams.
- `corporate-gift` использует `mode: 'no-cors'`, из-за чего endpoint-level success verification без mock/intercept косвенный.
- Dual-write `Supabase + localStorage` может маскировать divergence bugs, которые проявляются только после refresh или на другой машине.
- Даже после flow fixes и частичного `Phase 0` релиз остается условно-risky, пока не выполнены forced reset/storage migration и trusted auth path из `docs/auth-remediation-plan.md`.

## Deferred Coverage
- Полный auth/security review и role-based permission audit.
- Marketplaces и analytics verification вне прямых order regression paths.
- Load/performance testing для больших складских каталогов и длинной истории заказов.
- Отдельный Playwright test suite в формате test files, если его явно не попросят позже.

## Yandex DB cutover preflight — 2026-07-17

**Plan:** [`plans/2026-07-17-yandex-cutover-preflight.md`](plans/2026-07-17-yandex-cutover-preflight.md)

### In scope

- Формат и полнота `order_items.item_data` перед `TEXT -> JSONB`.
- Транзакционный backup, migration и точный rollback исходного TEXT.
- Контрольные financial fixtures: скидка, цвета, setup, legacy-печать, фурнитура, упаковка, подвес.
- New-stack save/reload через calc и calc2, photo upload/reload, Storage URL dry-run и Figma catalog publish.

### Required gates

- [x] `node tests/order-item-data-jsonb-preflight-smoke.mjs`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/supabase-fallback-smoke.js`
- [ ] Read-only production audit возвращает `safe: true` и `unsafeRows: 0` на release commit.
- [ ] Restore + migration + rollback пройдены на новой staging DB.
- [ ] Cold-session parity и save/reload/photo пройдены на staging для calc и calc2.
- [ ] Storage inventory и URL rewrite dry-run подписаны оператором.
- [ ] Figma staging-publish подтверждён без выключенных бланков и без пустых фото.
- [ ] После будущего cutover зелёны deploy, live smoke, Yandex static sync, Yandex mirror smoke и Yandex write-back smoke.

### Negative cases

- Double-encoded, пустой, JSON-array/scalar и невалидный `item_data` должны дать non-zero exit и не допустить SQL.
- Несовпадение ID/row count backup и live-таблицы должно откатить SQL-транзакцию.
- Любой JSONB не-object после ALTER должен откатить SQL-транзакцию.
- Потеря нового заказа, старое фото после reload или несоответствие финансовых цифр на staging — no-go для фриза.

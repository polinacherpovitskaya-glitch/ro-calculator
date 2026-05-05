# Test Plan

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

# Status

## Snapshot
- Current phase: M6 - pre-Yandex-migration global stabilization audit
- Plan file: `/Users/krollipolli/Documents/Github/RO calculator/docs/plans.md`
- Migration readiness file: `/Users/krollipolli/Documents/Github/RO calculator/docs/yandex-migration-readiness.md`
- Status: yellow
- Last updated: 2026-05-05

## Build / Deploy Source Of Truth
- Public deploy source: `origin/main` -> `.github/workflows/deploy-pages.yml` -> Vercel (`calc.recycleobject.ru`) + GitHub Pages reserve.
- Yandex mirror source: successful deploy workflow -> `.github/workflows/yandex-static-sync.yml` -> Yandex Object Storage (`calc2.recycleobject.ru`).
- Workflow behavior: checkout `main`, run repo-local verify gates, deploy to Vercel/GitHub Pages, sync Yandex mirror, then run live smoke, warehouse stress smoke, Yandex mirror smoke and Yandex write-back smoke.
- Local smoke source of truth: server must be started from `/Users/krollipolli/Documents/Github/RO calculator`; earlier confusion came from a stale server running out of `.codex/worktrees/...`.
- Latest verified public/Yandex release: `v332`, `js/app.js?v=332`, `js/warehouse.js?v=184`, commit `dc9a7d7`; deploy, live smoke, warehouse stress smoke, Yandex static sync, Yandex mirror smoke and Yandex write-back smoke completed successfully on 2026-05-05.

## Current Global Audit Baseline - 2026-05-05
- User request: spend a deep pass before the Yandex migration to find duplicated actions, double-writes, hidden data drift, load/performance risks and cross-module bugs.
- Codebase size from `scripts/audit-codebase-health.mjs`: 33 JS files, 31 test files, 9 workflow files, about 65k JS+HTML lines and 18k test lines.
- Static HTML baseline is clean: 35 script tags, 0 duplicate scripts, 0 missing script files, 0 duplicate HTML ids.
- Inline handler baseline is clean: 291 inline handlers, 289 object method references, 0 missing object methods.
- Version baseline is clean: `APP_VERSION`, `CURRENT_HTML_VERSION`, sidebar version and `js/version.json` all match `v332`.
- Risk counters to inspect during the long audit: 14 `prompt`, 36 `confirm`, 1 `alert`, 202 `console.error`, 3 `setInterval`, 28 `addEventListener`, 133 direct `localStorage` usages.
- Data-path baseline from `scripts/audit-data-paths.mjs`: 133 load/save/update/delete functions in `js/supabase.js`, 67 remote writers, 40 remote readers, 96 functions with fallback/local cache behavior, 26 remote tables and 46 local cache keys.
- First targeted warehouse audit package targets `v333`: fixed manual warehouse form quantity saves to compute deltas from latest shared stock, not stale rendered stock; added `tests/warehouse-migration-smoke.js` for stale qty, ready/unready idempotency and shipment repost delta.
- New CI gates added: `node scripts/audit-codebase-health.mjs` and `node scripts/audit-data-paths.mjs` run inside `Deploy GitHub Pages` verify; the health audit fails on hard static regressions, and the data-path audit updates the migration inventory report.
- Local validation passed after adding the gate: syntax check for `js/*.js` and `corporate-gift/*.js`, `version-smoke`, `order-flow-smoke`, `supabase-fallback-smoke`, `yandex-writeback-smoke`, `auth-hardening-smoke`, `factual-smoke`, `finance-smoke`, `fintablo-smoke`, `marketplaces-smoke`, `molds-smoke`, `molds-price-recovery-smoke`, `tasks-smoke`, `work-management-smoke`, `employee-auth-payroll-smoke`, `payroll-half-month-smoke`, `production-calendar-smoke`.

## Done
- Execution docs мигрированы с узкого `work-management rollout` на новый канонический поток: сквозной аудит заказов, цветов, Китая, склада и готовой продукции.
- Снята базовая repo-карта ключевых order flows: `js/app.js`, `js/orders.js`, `js/order-detail.js`, `js/warehouse.js`, `js/china.js`, `js/colors.js`, `js/supabase.js`, `corporate-gift/app.js`.
- Подтверждено, что в репозитории пока нет готового automated smoke harness для `order/warehouse/china` сценариев; существующий `tests/work-management-smoke.js` покрывает другой трек.
- Базовый syntax-check на `js/*.js` и `corporate-gift/*.js` проходит.
- Подтверждено, что `npx` доступен для будущего Playwright-driven browser audit.
- Поднят локальный browser audit на `python3 -m http.server 57218` и подтвержден рабочий auth bootstrap для воспроизводимого ручного прогона.
- Пройден основной order flow: создание заказа из калькулятора, сохранение, повторная загрузка и чтение из `order-detail` для product item с цветом и warehouse hardware.
- Исправлен blocker в `order-detail`: смена статуса из карточки заказа теперь запускает ту же складскую синхронизацию и перенос в ready goods, что и смена статуса из списка заказов.
- Убран битый импорт `js/dashboard.js` из `index.html`, который давал постоянный 404/console noise на загрузке приложения.
- `ready_goods` и `ready_goods_history` переведены на мягкий missing-table fallback: после первого обнаружения отсутствующих таблиц модуль работает локально и больше не спамит повторными сетевыми ошибками на каждом refresh в рамках одной browser session.
- В `corporate-gift` убрано битое подключение несуществующих `CyberionDemo` font files; страница теперь грузится без 404, empty-form validation отрабатывает, а safe submit path без внешнего POST проходит до thank-you экрана.
- Пройден live browser flow `order-detail -> China purchase -> consolidation -> shipment receipt -> warehouse -> order detail` на audit-заказе.
- Исправлен China blocker: создание закупки из карточки заказа больше не вызывает `loadChinaPurchase(undefined)` и действительно открывает новую форму.
- Исправлен China linkage bug: кнопка создания закупки из карточки заказа теперь корректно предзаполняет `order_id`, а не теряет привязку из-за гонки с `loadOrderOptions()`.
- Исправлен warehouse regression для China receipts: перепроведение/подтверждение приёмки больше не теряет `source/china_purchase_ids/china_box_status`, а связанная закупка корректно доходит до статуса `received`.
- Исправлен `order-detail -> China` UX/data gap: клик по строке закупки теперь открывает detail конкретной закупки, а не общий China dashboard.
- Исправлен completed-state drift для `project_hardware`: завершённый заказ больше не держит активный hardware reserve после финальной синхронизации статуса.
- Проверено клонирование audit-заказа: клон создаётся в `draft`, позиции и цветовые данные audit-элементов сохраняются.
- Исправлен calculator persistence gap: China-поля у `hardware` и `packaging`, а также данные wizard-а `pendant`, теперь переживают `save -> reload -> edit` без обнуления.
- Пройден live calculator flow `product + china hardware + china packaging + pendant` с повторной загрузкой заказа и последующим qty-edit; пересчёт после reload идёт из сохранённых `price_cny/weight_grams`.
- Исправлен rollback bug для `ready goods`: при выходе заказа из `completed` остатки готовой продукции теперь удаляются обратно из ready-goods stock и пишут историю возврата.
- Проверен полный цикл `delivery -> completed -> delivery -> completed` как из списка заказов, так и из `order-detail`; ready goods больше не залипают после rollback и не дублируются при повторном завершении.
- Пройден root-level nav smoke на свежем cache-bust билде: `orders -> colors -> warehouse -> china` открываются локально без новых error-level console messages.
- Добавлен reproducible smoke harness [`tests/order-flow-smoke.js`](/Users/krollipolli/Documents/Github/RO%20calculator/tests/order-flow-smoke.js): он ловит regression по `Calculator` persistence, legacy `pendant` restore, ready-goods rollback sync, сохранению China shipment metadata и статусной warehouse sync-логике.
- Подготовлен приоритизированный backlog улучшений в `/Users/krollipolli/Documents/Github/RO calculator/docs/improvement-backlog.md`.
- Подготовлен отдельный remediation-plan для auth/data-security риска в `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`.
- Приземлен первый Phase 0 containment для auth: `save/loadAuthAccounts` теперь scrub-ит `password_plain`, settings UI больше не показывает пароль в таблице, reset работает как one-time disclosure, а `restoreAuthenticatedUser()` больше не держит cached user живым при недоступном auth source.
- Автосоздание логинов для новых сотрудников и batch-подхват без логина временно отключены как осознанный security tradeoff до появления безопасного onboarding/reset path.
- Закрыт color persistence/detail gap: product items теперь показывают `colors[]` и `color_solution_attachment` в `order-detail`, а `tests/order-flow-smoke.js` проверяет save/load/detail rendering и legacy `color_id/color_name` fallback.
- Расширен reproducible warehouse regression harness: `tests/order-flow-smoke.js` теперь покрывает `ready goods` loops для `sales/writeoff`, `manual add`, историю ready-goods движений и ручную корректировку warehouse stock с history trail.
- Починена изоляция smoke harness: временные stub-ы `Warehouse` теперь возвращаются к оригинальным методам после сценариев, поэтому `manual adjustment` и последующие проверки больше не ловят ложные падения от межтестового загрязнения.
- Закрыт live-console gap на вкладке `Готовая продукция`: `sales_records` теперь использует тот же missing-table fallback, что и `ready_goods`, и после первого `PGRST205` переходит в local mode без повторных remote hits в рамках сессии.
- Добавлен узкий fallback smoke [`tests/supabase-fallback-smoke.js`](/Users/krollipolli/Documents/Github/RO%20calculator/tests/supabase-fallback-smoke.js), который проверяет `sales_records` missing-table path, session cache и отсутствие повторных remote вызовов после деградации в local fallback.
- Исправлен cold-boot warning в `initSupabase`: aggressive cleanup снова умеет переносить крупные local cache keys во `volatile` memory вместо падения на отсутствующем `_moveLocalStorageKeyToVolatileCache`.
- Проверен и зафиксирован канонический build path: публичный сайт уходит из `origin/main` через GitHub Pages workflow, а не из локального dev server; источник прошлой путаницы был в старом server cwd из другого worktree.
- Подтвержден public deploy после push: run `#138` зеленый, а публичный `index.html` отдает свежие cache-bust версии audit-fixed скриптов.
- Исправлен shortage/history drift в складе: `Warehouse.adjustStock` теперь пишет в history реально примененное изменение, помечает clamped-списания и не притворяется, что со склада ушло больше, чем там было.
- Исправлен status-sync gap для упаковки: при переходе заказа в consumed-статус теперь показывается явный toast, если упаковка списалась только частично из-за нехватки остатка.
- Smoke harness расширен на partial-deduction сценарий: `tests/order-flow-smoke.js` теперь ловит clamped warehouse history и shortage toast при `sample -> delivery`.
- Усилен credential path для новых и reset-паролей: `App.hashUserPassword` переведен на versioned `v2` verifier для новых записей, при этом legacy-логины продолжают проверяться через совместимый fallback.
- Settings `Логины` теперь явно показывает security-state аккаунта (`Legacy hash v1` / `Hash v2`) и умеет снимать отдельный sanitized `auth backup` перед forced reset или storage migration.
- Добавлен reproducible auth smoke [`tests/auth-hardening-smoke.js`](/Users/krollipolli/Documents/Github/RO%20calculator/tests/auth-hardening-smoke.js), который проверяет versioned hash verification, сохранение `password_hash_version/password_rotated_at`, security rendering и auth-backup export.
- Усилен auth session boundary: disabled account больше не переживает `refresh/restore`, legacy `v1` hash автоматически апгрейдится до `v2` при успешном логине, а fallback без `employee_id` больше не открывает все страницы по умолчанию.
- Закрыт `План-факт` totals regression после sync с `FinTablo`: скрытые salary/indirect строки для non-admin больше не удваивают `ИТОГО` в деталке, а новый [`tests/factual-smoke.js`](/Users/krollipolli/Documents/Github/RO%20calculator/tests/factual-smoke.js) ловит этот сценарий воспроизводимо.
- Закрыт второй `План-факт` drift: когда пересчитанные статьи расходились с сохраненным `total_cost_plan`, деталка больше не показывала ложный `ИТОГО`; теперь total опирается на сохраненный план заказа и честно помечает расхождение пересчета.
- Закрыт warehouse rollback drift для packaging: после clamped-списания при нехватке остатка rollback теперь возвращает на склад только фактически списанное количество, а не полный спрос заказа; одновременно `draft -> sample` снова предупреждает о частичном резерве упаковки.
- Починен `project_hardware` reload drift: галочки по собранной фурнитуре больше не сбрасываются на следующей загрузке; собранные, но еще не завершенные заказы уходят в блок `Собрано`, а `completed + собрано` скрывается со складской доски автоматически.
- Закрыт `project_hardware` shortage bug: галочка `собрано` больше не ставится ложно при нехватке остатка, stale clamped-state самоснимается при reconcile, а снятие галочки возвращает только фактически списанное количество вместо полного спроса.
- Закрыт packaging warehouse sync gap: упаковка со склада теперь идет в тот же `project_hardware` цикл, что и фурнитура, поэтому на обычном `save` она реально ставится в резерв, попадает в блок `Фурнитура и упаковка для проектов`, не списывается раньше времени и не теряет визуальный selected-state из-за string/number id drift в picker.

## In Progress
- M6 global stabilization audit before deeper Yandex migration: data paths, duplicate writes, fallback/write-back parity, performance/load behavior and high-risk UI flows.
- Продолжение Phase 0/1 для auth: forced reset/storage migration path, live verification и оставшиеся warehouse edge cases после shortage-safe toggle fix.
- Повторная live/browser проверка складских edge cases уже с зафиксированным deploy source, чтобы локальный smoke и публичный релиз больше не путались между собой.
- Повторная live/browser проверка `План-факт/FinTablo` perimeter после sync-fix и factual drift hotfix.
- Повторная live/browser проверка `warehouse/orders` perimeter после hardening partial reserve / rollback logic.
- Запуск warehouse end‑to‑end прогона: добавление, списание, инвентаризация, приемка во всех окнах (orders, order‑detail, warehouse, china, ready goods).
- Продолжение auth migration после закрытия restore/permissions gap: forced reset/storage move и clean login/logout flow уже на более реалистичном fixture path.
- Повторная near-live проверка `project_hardware` уже на реальных складских данных после sticky-check fix, shortage-safe toggle, блока `Собрано` и auto-hide для завершенных заказов.

## Next
- Use the module-by-module migration readiness matrix in `docs/yandex-migration-readiness.md` as the working order: warehouse -> China/shipments -> molds/blanks -> orders -> people/payroll -> finance.
- Run the full local verify set plus targeted static audits after every package; promote only green packages to `main`.
- Start the next functional sweep from `China` and warehouse receipts because the employee report says those tabs are still "мимо" on calc2.
- Закрыть первый незавершенный пункт M3: partial reserve, возврат и списание при нехватке warehouse hardware/packaging уже на live-click path.
- Выполнить M3b warehouse E2E audit и зафиксировать фактические расхождения (если есть).
- Дойти от частичного Phase 0 до forced reset/storage migration path из `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`.
- Перепроверить live browser perimeter для `warehouse/ready goods` на реальных кликах после расширения smoke coverage.
- Перепроверить tasks/projects regression perimeter и собрать финальный handoff по live gaps.
- Добить clean login/logout browser path уже без bootstrap existing-user session.
- Наблюдать live-поведение новых правил: shortage-safe toggle, `completed + собрано` скрывается автоматически, остальные собранные остаются в `Собрано`.

## Decisions Made
- Старый план заменен как source of truth, потому что пользовательский запрос сменил продуктовый фокус с задач/проектов на сквозной аудит order lifecycle.
- Work-management модули остаются в regression perimeter только там, где они входят в карточку заказа; отдельный rollout normalized schema не стартует первым milestone этого запроса.
- Browser audit будет строиться вокруг живого headed flow и локального сервера, потому что существующих e2e и smoke tests для order flows в репозитории нет.
- `corporate-gift/` включен в scope как отдельная воронка входа заказа, несмотря на отдельный backend contract через Google Sheets.
- High-severity auth/data-security риск ведется отдельным треком и не смешивается с точечными UI hotfixes; его канонический план лежит в `docs/auth-remediation-plan.md`.

## Assumptions In Force
- Первая волна охватывает `orders`, `calculator`, `order-detail`, `china`, `warehouse`, `colors`, `ready goods`, `corporate-gift`.
- На финальной фазе будет доступен хотя бы один безопасный способ воспроизвести auth/live browser session; если нет, live gaps фиксируются как blockers.
- Для order flow допустимо добавлять узкие smoke scripts без внедрения нового тестового framework.
- История предыдущего work-management rollout сохранена в audit log ниже и не теряется.

## Commands
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
node scripts/audit-codebase-health.mjs
node scripts/audit-data-paths.mjs
node tests/order-flow-smoke.js
node tests/warehouse-migration-smoke.js
node tests/auth-hardening-smoke.js
node tests/factual-smoke.js
node tests/supabase-fallback-smoke.js
python3 -m http.server 4173
curl -s 'https://api.github.com/repos/polinacherpovitskaya-glitch/ro-calculator/actions/runs?per_page=1'
curl -s 'https://polinacherpovitskaya-glitch.github.io/ro-calculator/' | rg 'js/supabase.js|js/app.js|js/order-detail.js|js/warehouse.js'
```

## Current Blockers
- Полноценный live auth path с реальными employee credentials все еще не подтвержден; однако browser-runtime clean-session checks для legacy login upgrade, disabled restore и permissions fallback уже добавлены и проходят локально.
- `corporate-gift` submit path использует `mode: 'no-cors'`, поэтому endpoint-level success/failure без mock или intercept наблюдается ограниченно.
- Auth risk снижен, но не снят: login/session model все еще client-side, а legacy remote payload с `password_plain` остается опасным, пока не пройдет полноценный scrub/migration path.
- Автосоздание логинов временно отключено; для новых сотрудников логины сейчас нужно заводить вручную до следующей фазы remediation.
- `factual/import` еще не прогнаны отдельным полным live loop на публичном билде после sync с `FinTablo`; сейчас закрыт подтвержденный totals-bug и добавлен узкий regression smoke.
- Локальный Playwright MCP в этой сессии флапает на launch timeout, поэтому свежий shortage-toggle hotfix подтвержден reproducible smoke coverage и будет дополнительно проверен по публичному билду после deploy.

## Audit Log
| Date | Milestone | Files | Commands | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-03-13 | WM-M1 | `js/work-management-core.js`, `js/supabase.js`, `migration_tasks_projects_mvp.sql`, `migration_missing_tables.sql`, `supabase_schema.sql` | `for f in js/*.js; do node --check "$f"; done` | pass | Перейти к UI и order integration |
| 2026-03-13 | WM-M2 | `js/tasks.js`, `js/projects.js`, `js/order-detail.js`, `js/app.js`, `js/settings.js`, `index.html`, `css/style.css`, `js/task-events.js` | `for f in js/*.js; do node --check "$f"; done` | pass | Добавить smoke checks и локальный page-load verify |
| 2026-03-13 | WM-M2 | `tests/work-management-smoke.js`, `.github/workflows/deploy-pages.yml` | `node tests/work-management-smoke.js` | pass | Подтвердить rollout на live schema/auth |
| 2026-03-13 | WM-M3 | локальный browser smoke | `python3 -m http.server 4173` + локальное открытие страницы | pass (page-load only) | Применить SQL и прогнать авторизованные сценарии |
| 2026-03-13 | WM-M3 | `js/supabase.js`, `js/app.js`, `index.html` | `node --check js/supabase.js && node --check js/app.js && node tests/work-management-smoke.js` | pass | Перепроверить браузер с cache-bust |
| 2026-03-13 | WM-M3 | browser smoke с `index.html?cb=2` | local auth bootstrap, create task, create project | pass (fallback mode) | Нужен SQL rollout на живой Supabase |
| 2026-03-14 | WM-M3 | `js/supabase.js`, `index.html`, `js/app.js` | live REST readback `work_*_json` + browser smoke на `v86` | pass | Нужен только rollout normalized tables |
| 2026-03-16 | Plan migration | `docs/plans.md`, `docs/status.md`, `docs/test-plan.md` | repo inspection + `for f in js/*.js corporate-gift/*.js; do node --check "$f"; done` | pass | Стартовать M1 audit matrix и harness |
| 2026-03-16 | Browser audit | `js/order-detail.js`, `index.html` | local server `57218` + browser create/save/reload/status flow | fail -> fixed | Перепроверить downstream flows и дописать findings |
| 2026-03-16 | Browser audit | `js/supabase.js`, `index.html` | browser ready-goods fallback repro + cache-bust reload | fail -> fixed | Пройти completed/rollback и China flows |
| 2026-03-16 | Browser audit | `corporate-gift/style.css`, `corporate-gift/app.js` | `corporate-gift` invalid submit + safe no-endpoint submit | fail -> fixed | Проверить endpoint-boundary и собрать backlog улучшений |
| 2026-03-16 | Browser audit | `js/order-detail.js`, `js/china.js`, `js/warehouse.js`, `index.html` | order-detail -> China create/consolidate/receipt flow + shipment repost | fail -> fixed | Пройти packaging/pendant и rollback flows |
| 2026-03-16 | Browser audit | `js/app.js`, `js/orders.js`, `js/order-detail.js`, `js/warehouse.js`, `index.html` | calculator `save -> reload -> edit` для china hw/pkg + pendant; completed rollback через orders и order-detail | fail -> fixed | Собрать воспроизводимый smoke harness |
| 2026-03-16 | Browser audit | fresh cache-bust UI perimeter | локальная навигация `orders -> colors -> warehouse -> china` + console error scan | pass | Перейти к harness и backlog улучшений |
| 2026-03-16 | Smoke harness | `tests/order-flow-smoke.js` | `node tests/order-flow-smoke.js` | pass | Перейти к improvement backlog и security remediation plan |
| 2026-03-16 | Auth containment | `js/supabase.js`, `js/settings.js`, `js/app.js`, `index.html` | `node --check js/app.js && node --check js/settings.js && node --check js/supabase.js && node tests/order-flow-smoke.js` | pass | Идти в forced reset/storage migration path |
| 2026-03-16 | Color rendering | `js/order-detail.js`, `tests/order-flow-smoke.js`, `index.html` | `node --check js/order-detail.js && node --check tests/order-flow-smoke.js && node tests/order-flow-smoke.js` | pass | Идти в warehouse deep regression и live gaps |
| 2026-03-16 | Warehouse harness depth | `tests/order-flow-smoke.js` | `node --check tests/order-flow-smoke.js && node tests/order-flow-smoke.js` | pass | Идти в live warehouse/ready-goods verification и remaining shortage edge cases |
| 2026-03-16 | Ready goods sales fallback | `js/supabase.js`, `index.html`, `tests/supabase-fallback-smoke.js` | `node --check js/supabase.js && node tests/supabase-fallback-smoke.js && node tests/order-flow-smoke.js` + local browser repro на `warehouse -> ready goods` | fail -> fixed | Идти в partial reserve live edges и auth migration |
| 2026-03-16 | Supabase cleanup cold boot | `js/supabase.js`, `index.html`, `tests/supabase-fallback-smoke.js` | browser cold boot на `?cb=cleanupfix` + `node tests/supabase-fallback-smoke.js` | fail -> fixed | Держать live perimeter и auth migration в следующем цикле |
| 2026-03-16 | Build source sanity | `.github/workflows/deploy-pages.yml`, `docs/*` | GitHub Actions API check + public site fetch | pass | Вернуться к M3 partial reserve / shortage flows |
| 2026-03-16 | Warehouse shortage integrity | `js/warehouse.js`, `js/orders.js`, `tests/order-flow-smoke.js` | `node --check js/warehouse.js && node --check js/orders.js && node --check tests/order-flow-smoke.js && node tests/order-flow-smoke.js` | fail -> fixed | Продолжить live warehouse edge cases и auth migration |
| 2026-03-16 | Auth hardening prep | `js/app.js`, `js/settings.js`, `index.html`, `tests/auth-hardening-smoke.js`, `.github/workflows/deploy-pages.yml` | `node --check js/app.js && node --check js/settings.js && node --check tests/auth-hardening-smoke.js && node tests/auth-hardening-smoke.js` | pass | Продолжить forced reset/storage migration без ночного lockout |
| 2026-03-17 | Factual totals integrity | `js/factual.js`, `tests/factual-smoke.js`, `index.html`, `.github/workflows/deploy-pages.yml` | `node --check js/factual.js && node --check tests/factual-smoke.js && node tests/factual-smoke.js` | fail -> fixed | Прогнать полный gate set и перепроверить public deploy |
| 2026-03-17 | Factual plan drift clarity | `js/factual.js`, `tests/factual-smoke.js`, `index.html` | live `#factual` audit + `node --check js/factual.js && node tests/factual-smoke.js` | fail -> fixed | Дождаться public deploy и повторить public factual pass |
| 2026-03-17 | Packaging rollback integrity | `js/orders.js`, `tests/order-flow-smoke.js`, `index.html` | `node --check js/orders.js && node --check tests/order-flow-smoke.js && node tests/order-flow-smoke.js` | fail -> fixed | Прогнать полный gate set и перепроверить local/public warehouse perimeter |
| 2026-03-17 | Auth restore boundary | `js/app.js`, `tests/auth-hardening-smoke.js`, `index.html` | `node --check js/app.js && node tests/auth-hardening-smoke.js` + browser runtime auth sanity on local server | fail -> fixed | Прогнать полный gate set, public deploy и идти в forced reset/storage migration |
| 2026-03-17 | Project hardware sticky checks | `js/warehouse.js`, `tests/order-flow-smoke.js`, `index.html` | `node --check js/warehouse.js && node tests/order-flow-smoke.js` + browser runtime warehouse sanity on local server | fail -> fixed | Перепроверить live project hardware data после auto-hide правила для `completed + собрано` |
| 2026-03-17 | Project hardware shortage toggle | `js/warehouse.js`, `tests/order-flow-smoke.js`, `index.html` | `node --check js/warehouse.js && node tests/order-flow-smoke.js` + full smoke gate set | fail -> fixed | Пушнуть публичный билд и проверить `warehouse.js?v=95` |
| 2026-03-17 | Packaging reserve + warehouse collection parity | `js/app.js`, `js/orders.js`, `js/warehouse.js`, `tests/order-flow-smoke.js`, `index.html` | `node --check js/app.js && node --check js/orders.js && node --check js/warehouse.js && node --check tests/order-flow-smoke.js && node tests/order-flow-smoke.js && node tests/work-management-smoke.js && node tests/auth-hardening-smoke.js && node tests/factual-smoke.js && node tests/supabase-fallback-smoke.js` | fail -> fixed | Пушнуть публичный билд и проверить `app.js?v=110`, `orders.js?v=61`, `warehouse.js?v=96` |
| 2026-05-05 | M6 global stabilization baseline | `scripts/audit-codebase-health.mjs`, `scripts/audit-data-paths.mjs`, `.github/workflows/deploy-pages.yml`, `docs/plans.md`, `docs/status.md`, `docs/test-plan.md`, `docs/yandex-migration-plan.md` | `node scripts/audit-codebase-health.mjs`; `node scripts/audit-data-paths.mjs`; full local smoke baseline; `node tests/yandex-writeback-smoke.mjs` | pass | Build module-by-module migration readiness matrix, then start China/warehouse write-flow audit |
| 2026-05-05 | Warehouse migration target pass | `js/warehouse.js`, `tests/warehouse-migration-smoke.js`, `tests/warehouse-stress-smoke.mjs`, `.github/workflows/deploy-pages.yml`, `index.html`, `js/app.js`, `js/version.json` | `node --check js/warehouse.js && node --check tests/warehouse-migration-smoke.js && node tests/warehouse-migration-smoke.js && node tests/order-flow-smoke.js && node tests/supabase-fallback-smoke.js && node tests/warehouse-stress-smoke.mjs --iterations=1` | pass | Deploy `v333` and verify live/Yandex smokes |

## Smoke / Demo Checklist
- [x] Root app стабильно грузится локально и дает пройти навигацию `orders -> colors -> warehouse -> china` без blocker-level runtime errors.
- [x] Основной калькулятор покрыт сценариями `product + hardware + packaging + pendant` с `save -> reload -> edit`.
- [x] Смена статусов заказа не дает рассинхрона по резервам, списаниям и возвратам.
- [x] `order-detail` корректно показывает связанные China/warehouse данные после фиксов.
- [x] Completed orders попадают в ready goods без дублей и пропусков.
- [x] `corporate-gift/` проходит happy path и failure path до submit boundary.
- [x] Improvement backlog подготовлен и приоритизирован после фиксов.
- [x] Auth/data-security remediation path зафиксирован отдельным документом.

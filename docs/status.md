# Status

## Snapshot
- Current phase: M4 - backlog improvements + auth/data-security remediation handoff
- Plan file: `/Users/krollipolli/Documents/Github/RO calculator/docs/plans.md`
- Status: yellow
- Last updated: 2026-03-16

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

## In Progress
- Продолжение Phase 0/1 для auth: forced reset/storage migration path, live verification и оставшиеся warehouse edge cases с нехваткой/partial reserve.

## Next
- Дойти от частичного Phase 0 до forced reset/storage migration path из `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`.
- Перепроверить live browser perimeter для `warehouse/ready goods` на реальных кликах после расширения smoke coverage.
- Добить edge cases по `partial reserve / нехватке остатка`, которые пока подтверждены не полностью.
- Перепроверить tasks/projects regression perimeter и собрать финальный handoff по live gaps.

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
node tests/order-flow-smoke.js
python3 -m http.server 4173
```

## Current Blockers
- Полноценный live auth path для ручного входа в этой сессии не подтвержден; текущий прогон держится на локальном bootstrap existing user session.
- `corporate-gift` submit path использует `mode: 'no-cors'`, поэтому endpoint-level success/failure без mock или intercept наблюдается ограниченно.
- Auth risk снижен, но не снят: login/session model все еще client-side, а legacy remote payload с `password_plain` остается опасным, пока не пройдет полноценный scrub/migration path.
- Автосоздание логинов временно отключено; для новых сотрудников логины сейчас нужно заводить вручную до следующей фазы remediation.

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

## Smoke / Demo Checklist
- [x] Root app стабильно грузится локально и дает пройти навигацию `orders -> colors -> warehouse -> china` без blocker-level runtime errors.
- [x] Основной калькулятор покрыт сценариями `product + hardware + packaging + pendant` с `save -> reload -> edit`.
- [x] Смена статусов заказа не дает рассинхрона по резервам, списаниям и возвратам.
- [x] `order-detail` корректно показывает связанные China/warehouse данные после фиксов.
- [x] Completed orders попадают в ready goods без дублей и пропусков.
- [x] `corporate-gift/` проходит happy path и failure path до submit boundary.
- [x] Improvement backlog подготовлен и приоритизирован после фиксов.
- [x] Auth/data-security remediation path зафиксирован отдельным документом.

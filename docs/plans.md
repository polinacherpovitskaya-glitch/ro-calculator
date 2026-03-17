# Plans

## Source
- Task: провести сквозной аудит сайта Recycle Object: проверить логику создания и изменения каждого заказа, сценарии цветов и комплектации, прохождение заказа через Китай, склад и готовую продукцию, пофиксить найденные проблемы и подготовить список улучшений.
- Canonical input: пользовательский запрос в чате от 2026-03-16 ("пройти по всему сайту, проверить логику создания каждого заказа, цветов, как это кладется на сайт, на склад, заберется со склада; выявить проблемы, пофиксить их и предложить улучшения").
- Repo context: vanilla JS SPA (`index.html` + `js/*`) с dual-write паттерном `Supabase + localStorage`, ключевыми модулями `app`, `orders`, `order-detail`, `china`, `warehouse`, `colors`, `supabase`, плюс отдельный `corporate-gift/` конструктор с отправкой в Google Sheets.
- Last updated: 2026-03-16

## Historical Context
- План мигрирован из предыдущего трека `work-management MVP`, потому что старый `docs/plans.md` перестал быть каноном под новый продуктовый запрос.
- Уже сделанные фичи задач/проектов не переоткрываются как отдельная product-задача; они остаются в регрессионном периметре только там, где затрагивают карточку заказа и связанные потоки.

## Derived Artifacts
- Improvement backlog: `/Users/krollipolli/Documents/Github/RO calculator/docs/improvement-backlog.md`
- Auth/data-security remediation track: `/Users/krollipolli/Documents/Github/RO calculator/docs/auth-remediation-plan.md`

## Assumptions
- Главный бизнес-периметр первой волны: `calculator -> orders -> order-detail -> china -> warehouse -> ready goods`, плюс справочник цветов и отдельный вход заказа через `corporate-gift/`.
- Маркетплейсы, аналитика, тайм-трек, импорт и бот не входят в первую волну, если только audit не покажет прямую регрессию от order flow.
- Фиксы делаются поверх текущего стека и текущего data-access слоя; без rewrite на новый framework и без смены роутинга.
- Для части финальных проверок понадобится действующая авторизованная сессия и реальные данные Supabase; если это недоступно, локальный/fallback прогон все равно обязателен, а live gaps фиксируются как blockers.
- `corporate-gift/` считается отдельной воронкой входа заказа, даже если сейчас он пишет не в основную `orders`, а во внешний Google Sheets endpoint.

## Validation Assumptions
- В корневом `package.json` нет готовых `lint/test/build` scripts, поэтому базовыми техническими gates считаются syntax-check JS, локальный HTTP server и browser-driven smoke.
- В `tests/` пока нет покрытий для order/warehouse/china flows; первая итерация должна добавить минимальный smoke harness или другой воспроизводимый механизм проверки, чтобы audit не был одноразовым ручным прогоном.
- Browser-аудит будет опираться на headed flow через Playwright tooling или эквивалентный живой браузер, а не на несуществующий сейчас e2e suite.

## Milestone Order
| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| M1 | Зафиксировать audit matrix и воспроизводимый harness | - | [x] |
| M2 | Прогнать и укрепить все точки создания и редактирования заказа | M1 | [x] |
| M3 | Прогнать downstream flows: статусы, Китай, склад, списания, готовая продукция | M1, M2 | [~] |
| M4 | Закрыть найденные дефекты, прогнать регрессию и собрать список улучшений | M2, M3 | [~] |
| M5 | Подтвердить результат на live-сессии и оформить handoff | M4 | [~] |

## M1. Зафиксировать audit matrix и воспроизводимый harness `[x]`
### Goal
- Все точки входа заказа, ключевые state transitions и зависимости на данные известны заранее, а сам audit можно повторить без повторной разведки по коду.

### Tasks
- [x] Составить inventory пользовательских путей: калькулятор, редактирование и клонирование заказа, inline edits в карточке заказа, смена статусов, создание закупки из карточки заказа, приход на склад, готовая продукция, `corporate-gift`.
- [x] Привязать каждый путь к конкретным файлам и функциям (`Calculator.saveOrder`, `loadOrder`, `Orders.onStatusChange`, `Warehouse.moveOrderToReadyGoods`, `ChinaPurchases`, `Colors`, `corporate-gift/app.js`).
- [x] Подготовить воспроизводимый audit harness: локальный server, browser route plan, перечень обязательных fixtures и формат журнала находок.
- [x] Добавить или хотя бы зафиксировать минимальный repo-local smoke coverage для чистой логики order/warehouse flows, чтобы найденные баги можно было быстро перепроверять.

### Definition of Done
- Есть конкретная audit matrix по страницам, сценариям, данным и expected results.
- Понятно, какие проверки автоматизируются, а какие остаются manual/live.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
```

### Known Risks
- Без auth/live fixtures часть финальных сценариев придется временно держать на локальном или fallback уровне.
- Значимая доля бизнес-логики зашита в DOM-driven модулях, поэтому harness придется собирать аккуратно, не ломая приложение.

### Stop-and-Fix Rule
- Если локальный app boot, базовая навигация или audit harness не воспроизводятся стабильно, сначала исправить это, а уже потом идти в бизнес-логику.

## M2. Прогнать и укрепить все точки создания и редактирования заказа `[x]`
### Goal
- Каждая точка входа заказа формирует консистентные `order/items/colors` данные и переживает цикл `save -> reload -> edit -> clone` без потерь и неожиданных расхождений.

### Tasks
- [x] Пройти основной калькулятор end-to-end для `product`, `hardware`, `packaging` и `pendant` сценариев, включая autosave, ручное сохранение, перезагрузку и повторное редактирование.
- [x] Проверить сохранение и отображение цветов: `colors[]`, `color_solution_attachment`, migration `color_id -> colors`, рендер в `order-detail`.
- [x] Проверить edit/clone/inline edit/history flows в `orders` и `order-detail`, включая обновление заголовка, позиций и истории изменений.
- [x] Пройти отдельный `corporate-gift` поток: валидация формы, SVG/PNG generation, submit payload, поведение при отсутствии `googleScriptUrl` и при ошибке отправки.
- [x] Починить blocker/high issues и сразу положить адресные regression checks для повторного прогона.

### Definition of Done
- Основные order entry points проходят без blocker-level потери данных и без критических UI breakages.
- Цветовые данные и вложения сохраняются и читаются обратно предсказуемо.
- `corporate-gift` ведет себя предсказуемо и на happy path, и на failure path.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
# После M1: node tests/order-flow-smoke.js
# После M1/M4: node tests/supabase-fallback-smoke.js
```

### Known Risks
- Dual-write между Supabase и local backup может скрывать баги, которые проявляются только после refresh или при смене устройства.
- `corporate-gift` использует `mode: 'no-cors'`, поэтому реальный endpoint success/failure без mock или intercept наблюдается ограниченно.

### Stop-and-Fix Rule
- Если save/load/edit/clone ломают данные заказа или colors state, остановиться на текущем потоке и довести его до стабильного повторяемого состояния.

## M3. Прогнать downstream flows: статусы, Китай, склад, списания, готовая продукция `[~]`
### Goal
- Смена статусов заказа и операционные страницы корректно двигают спрос, резервы, списания, возвраты и приход в готовую продукцию без двойных движений и silent drift.

### Tasks
- [x] Проверить `Orders.onStatusChange` и `_syncWarehouseByStatus` на переходах `sample`, production-like statuses, `delivery`, `completed` и обратных откатах.
- [ ] Проверить резерв, частичный резерв, возврат и списание для warehouse hardware и packaging, включая сценарии с нехваткой остатка.
- [x] Пройти China flows: создание закупки из `order-detail`, консолидация, приход на склад, связь с warehouse items и order meta badges.
- [x] Проверить `Warehouse.moveOrderToReadyGoods`, ручные складские корректировки и историю движений по completed orders.
- [x] Дофиксить найденные рассинхроны и добавить воспроизводимые checks там, где логику можно изолировать без тяжелого e2e.

### Definition of Done
- Нет очевидных double reserve, double deduction или пропавших движений на audited flows.
- Китай, склад и готовая продукция отображают order-linked состояние согласованно.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
# После M1: node tests/order-flow-smoke.js
```

### Known Risks
- Часть багов проявляется только на живых данных и реальных статусных переходах.
- Legacy orders могут содержать неполные `item_data`, `hardware_source` или `packaging_source`, которых нет в локальных happy-path примерах.

### Stop-and-Fix Rule
- Если найдено расхождение остатков, резерва или ready goods, не переходить дальше, пока не будет понятна причина и не появится воспроизводимая проверка на этот дефект.

## M4. Закрыть найденные дефекты, прогнать регрессию и собрать список улучшений `[~]`
### Goal
- Все найденные blocker/high defects закрыты или явно эскалированы, а повторный прогон подтверждает, что фиксы не сломали соседние потоки.

### Tasks
- [x] Повторять execution loop `исправить -> проверить -> зафиксировать статус -> идти дальше` после каждой пачки находок.
- [x] Перепроверить `orders`, `order-detail`, `china`, `warehouse`, `ready goods`, `colors`, `corporate-gift` после каждого критичного фикса.
- [ ] Убедиться, что связанные integrations (`tasks/projects` в карточке заказа, метаданные заказа, история изменений) не словили регрессию.
- [x] Подготовить backlog улучшений с приоритетом, ожидаемым эффектом, сложностью и отмеченными зависимостями.
- [x] Подготовить отдельный remediation plan для high-severity auth/data-security риска.
- [x] Обновить `docs/status.md` и `docs/test-plan.md` по реальным находкам, остаточным рискам и подтвержденным validation gates.

### Definition of Done
- Blocker/high issues в audited scope либо устранены, либо имеют явный blocker owner и понятную причину.
- Есть приоритизированный список улучшений, который можно брать в следующую итерацию без новой разведки.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
# После M1: node tests/order-flow-smoke.js
```

### Known Risks
- Серия точечных фиксов в stateful UI легко может дать побочную регрессию без дисциплины повторного прогона.
- Некоторые улучшения окажутся продуктово полезными, но не обязательными для текущего hardening и не должны размыть execution scope.

### Stop-and-Fix Rule
- Если новый фикс ломает соседний поток, откатить приоритет на регрессию и не накапливать новые находки поверх сломанной базы.

## M5. Подтвердить результат на live-сессии и оформить handoff `[~]`
### Goal
- Итог подтвержден на реальной или максимально приближенной живой сессии, а все внешние зависимости и остаточные blockers явно задокументированы.

### Tasks
- [ ] Прогнать browser audit на реальной авторизованной сессии и живых данных `orders/china/warehouse/ready goods`.
- [ ] Подтвердить `corporate-gift` submit behavior на реальном endpoint или через воспроизводимый mock/intercept.
- [x] Зафиксировать внешние blockers, если упремся в секреты, manual SQL, реальный endpoint или необратимые live actions.
- [ ] Подготовить короткий handoff: что пофикшено, что осталось риском, какие улучшения рекомендованы следующими.

### Definition of Done
- Live/browser audit завершен либо честно остановлен только на реальном внешнем blocker.
- Следующий запуск может продолжить работу, не восстанавливая контекст из чата.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
python3 -m http.server 4173
# Live browser audit на реальной сессии или явный blocker в docs/status.md
```

### Known Risks
- Понадобится auth/live access и, возможно, внешние endpoints, которыми нельзя безопасно управлять из любой сессии.
- Некоторые live-проверки могут требовать согласования, если они меняют реальные остатки или создают реальные записи.

### Stop-and-Fix Rule
- Если для продолжения нужен необратимый live action, секрет или ручная операция вне текущего доступа, остановиться, зафиксировать blocker и согласовать следующий шаг отдельно.

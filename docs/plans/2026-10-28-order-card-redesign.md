# План: новая карточка заказа

> Для исполнителей: задачи по порядку, шаги — чекбоксы. Спецификация — главный документ.

**Цель:** страница `#order-detail/<id>` без вкладок: шапка с лицом и причинами, полоска типа,
пять плиток, этапы с одной кнопкой, «Что делаем», «Как идёт», раскрывающиеся строки внизу.

**Архитектура:** логика вердикта, типа, этапов, часов и причин маржи — чистые функции в объекте
`OrderCardLogic` в начале `js/order-detail.js` (без DOM, тестируются в `vm`). Рисование — методы
`OrderDetail`, которые зовут эту логику и прежние функции (деньги, «Факт», тираж, склад, график,
задачи, Китай). Новых файлов в `js/` нет. Стили — классы `odc-*` в `css/style.css`.

**Спецификация:** `docs/specs/2026-10-28-order-card-redesign.md`

## Общие ограничения
- Вход только `OrderDetail.load(id)`; id `od-title`, `od-stats`, `od-tirage-slot`, `od-tab-info`,
  `od-tab-hardware`, `od-tab-items`, `od-tab-tasks`, `od-tab-china`, `od-delivery-schedule-card`,
  `od-real-cost-details` остаются (их рисуют прежние функции).
- Никаких `font-size` 10–13 px (тест `noSmallText` в `tests/order-flow-smoke.js`); базовый 16 px,
  подписи ≥ 14 px; кнопки и строки ≥ 44 px; на узком экране всё в столбик (flex-wrap).
- Зарплатные строки и «Косвенные», а также рубли у причин из зарплаты/косвенных — только при
  `OrderDetail._canSeeSalaryBreakdown()`. Итоговая реальная маржа и разница — всем.
- Без `prompt()`/`confirm()` в карточке. Без эмодзи в новых элементах (иконки — inline SVG).
- Тексты — русские, как в спецификации. Тесты меняем только осознанно, под новое поведение.
- Коммиты на задачу, сообщение с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: «Факт» отдаёт часы по этапам

**Files:** Modify `js/factual.js` (`_collectStageActuals`, `computeOrderRealCost`);
Test `tests/factual-real-cost-smoke.js`.

**Interfaces — Produces:** результат `Factual.computeOrderRealCost(orderId, options)` получает поля
- `stages`: массив из 4 элементов в порядке `casting, trim, assembly, packaging`:
  `{ key, label, planHours, factHours, salary, people: [{ name, hours }], firstDate, lastDate }`.
  `label` — из `HOUR_ROWS` по соответствию `casting→hours_production`, `trim→hours_trim`,
  `assembly→hours_assembly`, `packaging→hours_packaging` («Выливание», «Срезание», «Сборка»,
  «Упаковка»). `planHours` — те же плановые часы, что `_collectStageActuals` берёт в
  `planStageHours`. `factHours`/`salary` — как сейчас `stageHours`/`stageSalary` (с legacy-
  распределением). `people` — суммы часов по `entry.worker_name || entry.employee_name`,
  по убыванию часов, часы округлены до 0,01; `firstDate`/`lastDate` — min/max `entry.date`
  (строки `YYYY-MM-DD`) или `null`.
- `indirectPerHour`: число, тот же `params.indirectPerHour`, что идёт в косвенные.

- [ ] Тест: заказ с записями табеля на `casting` (2 человека, 2 даты) и `assembly` → `stages`
      длиной 4, правильные `factHours`, `people` по убыванию, даты; `indirectPerHour` > 0. Падает.
- [ ] Реализовать (аддитивно: прежние поля результата без изменений).
- [ ] `node tests/factual-real-cost-smoke.js`, `node tests/factual-smoke.js` — зелёные. Коммит.

---

### Task 2: логика карточки — `OrderCardLogic`

**Files:** Modify `js/order-detail.js` (новый `const OrderCardLogic = { ... }` перед `OrderDetail`);
Create `tests/order-card-smoke.js`; Modify `.github/workflows/deploy-pages.yml` (строка
`node tests/order-card-smoke.js` после `node tests/marketing-purpose-smoke.js`).

**Interfaces — Produces** (все чистые, даты — строки `YYYY-MM-DD`, `today` передаётся):
- `OrderCardLogic.formatDayMonth('2026-10-26') → '26 октября'` (родительный падеж месяцев).
- `OrderCardLogic.stages({ status, hasPrinting, hasHardware, hasPackaging })` →
  `{ list: [{ value, label, state }], next }`. Порядок значений: `draft`, `sample` (только если
  `status === 'sample'`), `production_casting`, `production_printing` (если `hasPrinting`),
  `production_hardware` (если `hasHardware`), `production_packaging` (если `hasPackaging`),
  `delivery`, `completed`. Подписи: «Черновик», «Образец», «Выливание», «Печать», «Сборка»,
  «Упаковка», «Доставка», «Готово». `state`: `done` до текущего, `current`, `todo` после. Статусы
  `production`, `in_production`, `calculated` считаются `production_casting`/`draft`.
  `next` — следующий элемент `{ value, label }` или `null` (у `completed`, `cancelled`).
- `OrderCardLogic.stageHoursRows(stages)` → строки для «Как идёт»: если у `trim` `planHours` 0,
  его часы, люди и даты сливаются в `casting` с подписью «Литьё и срезание»; этапы, где и план, и
  факт 0, не выводятся. Строка: `{ key, label, planHours, factHours, people, firstDate, lastDate }`.
- `OrderCardLogic.typeParts({ purpose, clientName, tirageLines, products, stockPrice })` →
  `[{ key, label, qty, how }]`, `key ∈ commercial|stock|partner|marketing|rework|b2c`. Правила —
  спецификация, п. 2. Подписи: «Коммерция», «Сток», «Партнёру», «Маркетинг», «Переделка брака»,
  «B2C». `how`: «по счёту клиенту» (+ « — <клиент>», если есть), «продаём сами со склада по
  5 900 ₽» (`formatRub`), «бесплатно» (+ « — <кому>»), «дарим» (+ « — <кому/зачем>»), у
  некоммерческого маркетинга «дарим, не продаём», у стока-образца «делаем на склад», у
  переделки «переделываем брак», у B2C «всё на склад готовой продукции». Доли с `qty` 0 не выводятся.
- `OrderCardLogic.stockLabel(row)` для строки из `OrderDetail._buildHardwareRows` (Task 3) →
  `{ tone: 'green'|'blue'|'red'|'gray', text }`: `ready` → «собрано, списано»; резерв ≥ нужного →
  «в резерве · на складе N»; свободно ≥ нужного → «есть на складе N»; иначе «не хватает N»
  (N = нужно − резерв − свободно, округлить вверх).
- `OrderCardLogic.health(input)` → `{ tone: 'green'|'yellow'|'red'|'gray', verdict, reasons }`.
  `input`: `{ status, purpose, today, deadlineStart, deadlineEnd, completedAt, hoursPlan,
  hoursFact, hasTimesheet, stageRows, stock: { shortageNames: string[] }, notesEmpty,
  paymentStatus, clientQty, partnerWithoutNote, timesheetStageLabel, statusStageLabel,
  marginPlan, marginNow }`. Правила и пороги — спецификация, «Вердикт». Вердикты: «Отменён»,
  «Черновик», «Пора запускать», «Горит», «Есть риски», «Идёт по плану», «Закрыт хорошо»,
  «Сдали, ждём деньги», «Сдали с опозданием», «Закрыт с вопросами», «Закрыт плохо». Причины — до 4,
  шаблоны: «Срок прошёл 26 октября.», «Часов по табелю 18 вместо 12,1.», «До срока 2 дн., а заказ
  ещё на этапе «Выливание».», «На складе не хватает: карабин, шнур.», «Нет ТЗ для цеха.»,
  «По табелю уже идёт «Сборка», а в статусе — «Выливание».», «Счёт клиенту не выставлен.»,
  «Не указано, кому уходит партнёрская доля.», «Оплачено 100 %.», «До срока 13 дн.», «По часам
  сделано 76 %.», «Старт по плану был 23 сентября, заказ ещё черновик.», «Сдали в срок.», «Сдали
  16 октября, срок был 8 октября — на 8 дн. позже.», «Деньги не пришли: «Передано в оплату».»,
  «В табель не внесли ни часа.», «Этап «Сборка» в табель не внесли.», «Маржа 12,1 % вместо
  30,1 %.». Числа — `ru-RU`, часы до 0,1.
- `OrderCardLogic.marginReasons({ realCost, stageRows, canSeeSalary })` →
  `{ planPct, nowPct, deltaPp, deltaRub, reasons: [{ text, rub }] }` (из `realCost.rows`,
  `realCost.marginPercent`, плановой маржи; до 3 причин по модулю ₽: этапы с |факт − план| ≥ 0,5 ч —
  «Сборка: 8 ч вместо 1,6», ₽ = Δч × (salary/factHours или 550) + Δч × indirectPerHour, у не-админа
  `rub: null`; статьи, где `used − plan` по модулю ≥ max(500 ₽, 2 % плана), кроме зарплатных и
  косвенных, — «<статья>: <факт> вместо <план>» с ₽).

- [ ] `tests/order-card-smoke.js`: загружает `js/calculator.js` и `js/order-detail.js` в `vm`
      (заглушки `document`, `App`, как в соседних смоуках) и проверяет на данных из макета:
      Лимон (срок 26.10, сегодня 28.10, табель 18 из 12,1, сборка 8 из 1,6, нет ТЗ, партнёр без
      «кому») → красное «Горит», причины начинаются с «Срок прошёл 26 октября.»; Миллениум
      (оплачено, срок через 13 дн., 8,5 из 11,2) → зелёное «Идёт по плану»; Аэрофлот (готово
      в срок, «Передано в оплату») → жёлтое «Сдали, ждём деньги»; Авиасейлс (marketing, готово на
      8 дн. позже, нет табеля) → жёлтое, причины про опоздание и табель; черновик со стартом в
      прошлом → «Пора запускать». `stages` для Лимона: Черновик done, Выливание current, без Печати,
      next «Сборка». `typeParts` для Лимона: Сток 30, Партнёру 50, Маркетинг 20; для marketing —
      одна доля «Маркетинг». `stageHoursRows` сливает срезание без плана. `stockLabel` — все 4
      случая. `formatDayMonth`. Падает.
- [ ] Реализовать `OrderCardLogic`. Смоук зелёный, `node tests/order-flow-smoke.js` зелёный. Коммит.

---

### Task 3: страница без вкладок

**Files:** Modify `index.html` (разметка `#page-order-detail`), `css/style.css` (классы `odc-*`),
`js/order-detail.js`, `tests/order-flow-smoke.js` (осознанно), `tests/partial-delivery-smoke.js`
(если трогаем строки, которые он ищет — «График сдачи», `updateOrderCalculatorData`,
`saveDeliverySchedule` — они остаются).

**Interfaces — Consumes:** `OrderCardLogic.*` (Task 2), `result.stages` / `indirectPerHour`
(Task 1). **Produces:**
- Разметка: `#od-head`, `#od-type`, `#od-stats` (плитки), `#od-panel` (раскрытие под плитками:
  деньги / оплата / склад), `#od-stages`, `#od-what`, `#od-progress`, `#od-more`. Внутри `#od-more`
  — строки-кнопки (`aria-expanded`) и под каждой контейнер: `#od-tab-items`, `#od-tab-info`,
  `#od-tab-tasks`, `#od-tab-china`. `#od-tab-hardware` — в `#od-panel` при раскрытии «Склада».
  `#od-tirage-slot` — в `#od-what` под составом. `#od-delivery-schedule-card` — в `#od-progress`
  при раскрытии строки «Сдаём …». Вкладок и `switchTab` нет (`switchTab` оставить пустой
  совместимой функцией, если её зовут снаружи — проверить `git grep switchTab`).
- `OrderDetail.load(id)`: рисует всё сразу из того, что есть; «Факт», склад готовой продукции,
  фурнитура, задачи, Китай дорисовываются по мере ответа (не ждать их до показа).
- `OrderDetail.renderHeader()` — шапка, лицо, вердикт, причины, полоска типа (через
  `OrderCardLogic.health` / `typeParts`); `renderStats()` — 5 плиток в `#od-stats`, плитки «Маржа»,
  «Оплата», «Склад» — `<button>`, раскрывают `#od-panel`; деньги в панели — выручка, «Отдаём
  бесплатно…», `renderRealCostDetails(...)` (id `od-real-cost-details`), `toggleRealCostDetails()`
  остаётся и открывает/закрывает именно эту панель; `renderStages()` — этапы и кнопка
  «Перевести на «…»»; `renderWhat()`; `renderProgress()`; `renderMore()`.
- `OrderDetail._buildHardwareRows()` → `Promise<rows>` — данные из нынешнего `renderHardwareTab`
  (вынести расчёт строк в этот метод; `renderHardwareTab` рисует таблицу из него, как раньше).
- `OrderDetail.changeStatus(targetStatus)`: без `prompt()`; без аргумента — раскрывает список
  этапов в меню «⋯»; с аргументом — проверка, запись, `_finishStatusTransition(..., managerName =
  App.getCurrentEmployeeName() || 'Неизвестный')`, перерисовка шапки, этапов, плиток и
  `loadTirageStock()`. `moveToNextStage()` зовёт `changeStatus(next.value)`.
- Оплата: выбор в `#od-panel` → `saveField('payment_status', value)`.
- ТЗ: `<textarea id="od-brief">` с `notes`; `onblur` → `saveField('notes', value)`, если изменилось.
- `saveField`: try/catch с тостом «Не сохранилось — проверьте связь и повторите» и без потери
  введённого; после успеха перерисовать затронутые блоки (шапку — для `order_name`, `client_name`,
  `manager_name`, дат; плитки — для `payment_status`; «Данные заказа» — если открыты).
- `_fieldRow`: значение в `onclick` безопасно (экранировать для атрибута, например через
  `data-value` и `this.dataset.value`), клик-редактирование снова работает.
- Убрать: кнопки вкладок, `renderProductionTab`, `renderFilesTab` и их поля, значок
  `#od-status-badge` (оставить пустой скрытый элемент, если на него смотрят снаружи).

- [ ] Обновить `tests/order-flow-smoke.js` под новое поведение: `changeStatus('completed')` вместо
      очереди `prompt`; `#od-tirage-slot` ищется в `#od-what`, а не в `#od-tab-info`; тексты
      `#od-stats` — новые плитки (Срок/Скорость/Склад/Маржа/Оплата; «ожидаем, если продадим 30 шт.»,
      «считаем по факту», «план X %» остаются подписями в «Марже» или в деньгах панели);
      клик-редактирование `_fieldRow` открывает поле. Тест падает до реализации.
- [ ] Реализовать. Проверить вручную в харнесе (`reference_calc_card_preview_and_smoke_harness`
      в памяти) или в `vm`: Лимон из `tests/order-flow-smoke.js` (`lemonOrderData`) рисуется без
      ошибок, все id на месте.
- [ ] `node --check js/*.js`; `node tests/order-flow-smoke.js`, `tests/order-card-smoke.js`,
      `tests/tirage-allocation-smoke.js`, `tests/partial-delivery-smoke.js`,
      `tests/factual-real-cost-smoke.js` — зелёные. Коммит.

---

### Task 4: версия, проверки, выкатка в PR

**Files:** `js/version.json`, `js/app.js`, `index.html` (4 якоря версии, `?v=` у
`js/order-detail.js`, `js/factual.js`, `js/app.js`, `css/style.css`).

- [ ] `git fetch origin main`, версия = main + 1 (сейчас v485). `node tests/version-smoke.js`.
- [ ] Весь шаг verify из `.github/workflows/deploy-pages.yml` локально — exit 0.
- [ ] Посмотреть карточку в браузере (харнес) на Лимоне и на закрытом заказе; поправить то, что
      выглядит не как в макете.
- [ ] PR: спецификация, план, код; в описании — что изменилось для менеджеров и что не входит.

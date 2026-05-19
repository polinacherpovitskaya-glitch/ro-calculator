# Warehouse Interaction Map — где склад трогает всё остальное

> **Цель документа:** иметь одну картину того, **где и как** позиции склада создаются, читаются, изменяются и удаляются по всей системе. Это основа для редизайна склада в Block 3 + всех зависимых блоков (4, 5, 9). Без этой карты мы повторим те же баги, что чинили последние полгода.

> **Идея:** во время миграции мы не «переносим как есть» **только для склада** — мы пользуемся моментом и наводим порядок. Это **исключение** из общего правила «переносим 1:1». Для остального (заказы, калькулятор) мы по-прежнему 1:1.

---

## 1. Канонический жизненный цикл позиции склада

```
┌─────────────────────────────────────────────────────────────────┐
│                  ИСТОЧНИКИ (qty UP)                              │
├─────────────────────────────────────────────────────────────────┤
│ A. Приёмка готового груза (shipment receive)                     │
│    Block 4: POST /api/shipments/:id/receive                      │
│    → warehouse_items.qty += received_qty                         │
│    → warehouse_history(type='receipt', shipment_id=...)          │
│                                                                  │
│ B. Приёмка Китай-закупки (china receive — частный случай A)     │
│    Block 4: POST /api/china/purchases/:id/receive                │
│    → создаёт shipment + сразу receive                            │
│                                                                  │
│ C. Возврат от заказа (если такое есть)                          │
│    Block 9: операция return_to_warehouse                         │
│    → warehouse_items.qty += returned                             │
│    → warehouse_history(type='return_to_warehouse', order_id=...) │
│                                                                  │
│ D. Ручное добавление новой позиции (admin add)                  │
│    Block 3: POST /api/warehouse/items                            │
│    → INSERT warehouse_items                                      │
│    → warehouse_history(type='manual_add', actor_id=...)          │
│                                                                  │
│ E. Ручная корректировка qty в плюс                              │
│    Block 3: PATCH /api/warehouse/items/:id { qty: +N }           │
│    → warehouse_items.qty = N                                     │
│    → warehouse_history(type='manual_edit', qty_change=+delta)    │
│                                                                  │
│ F. Инвентаризация (фактическое qty)                             │
│    Block 3: POST /api/warehouse/inventory-audit                  │
│    → для каждой позиции: warehouse_items.qty = factual           │
│    → warehouse_history(type='inventory_audit', audit_id=...)     │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │ warehouse_items.qty │
                        │   (текущий остаток) │
                        └─────────┬───────────┘
                                  │
                       ┌──────────┴──────────┐
                       │                     │
                       ▼                     ▼
        ┌──────────────────────┐  ┌─────────────────────────┐
        │  reservations        │  │  непосредственные       │
        │  (qty заблокировано) │  │  потребления (consume)  │
        └──────────┬───────────┘  └──────────┬──────────────┘
                   │                         │
                   │ release / consume       │
                   └────────────┬────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ПОТРЕБИТЕЛИ (qty DOWN)                          │
├─────────────────────────────────────────────────────────────────┤
│ 1. Списание под заказ                                            │
│    Block 9: POST /api/orders/:id/consume-hardware                │
│    → warehouse_items.qty -= consumed                             │
│    → warehouse_history(type='consume', order_id=...)             │
│    → если был reservation (source='order') — переходит в         │
│      status='consumed'                                           │
│                                                                  │
│ 2. Использование молда                                           │
│    Block 5: POST /api/molds/:id/use { units, order_id? }         │
│    → для каждой строки mold_hardware:                            │
│       warehouse_items.qty -= qty_per_use * units                 │
│       warehouse_history(type='consume', mold_id=..., order_id=...)│
│                                                                  │
│ 3. Marketplaces — продажа набора                                 │
│    Block 5: POST /api/marketplaces/:id/sell { qty }              │
│    → для каждого item в composition:                             │
│       warehouse_items.qty -= item.qty * sold_qty                 │
│       warehouse_history(type='consume', marketplace_set_id=...)  │
│                                                                  │
│ 4. Ручная корректировка qty в минус (списание брака и т.п.)     │
│    Block 3: PATCH /api/warehouse/items/:id { qty: -N }           │
│    → warehouse_history(type='manual_edit', qty_change=-delta)    │
│                                                                  │
│ 5. Инвентаризация в минус                                        │
│    Block 3: POST /api/warehouse/inventory-audit                  │
│    → warehouse_history(type='inventory_audit', ...)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Состояние резервов (state machine)

```
                  ┌──────────────────────────────┐
                  │                              │
                  ▼                              │
              ┌────────┐                         │
   create  ──►│ active │──── consume ──►┌────────────┐
              └───┬────┘                │ consumed   │
                  │                     └────────────┘
                  │ release
                  ▼
              ┌──────────┐
              │ released │
              └──────────┘
```

**Правила переходов:**
- `active` → `consumed`: при списании, `consumed_at = NOW()`, `qty` позиции уменьшается
- `active` → `released`: при отмене резерва, qty НЕ меняется
- `consumed`, `released` — финальные. Из них **нет переходов обратно** (если хочешь "вернуть резерв" — создавай новый)
- Срок жизни `active`: если order закрыт/отменён — резервы автоматически в `released` через cron-задачу (каждый час)
- Если order удалён (CASCADE) — резервы удаляются физически (через FK)

**В отличие от текущего хаоса:**
- Только **один** способ создать резерв
- Только **два** способа закрыть резерв (consume или release) — больше никаких
- НЕТ возможности «отредактировать qty активного резерва» — release + create new

---

## 3. Канонический справочник `warehouse_history.type`

**Только 5 значений** (вместо текущих 12+):

| type | Когда | Обязательные поля | qty_change |
|---|---|---|---|
| `receipt` | Приёмка груза | shipment_id, qty_change > 0 | + |
| `consume` | Любое списание (заказ/молд/маркет) | один из: order_id, mold_id, marketplace_set_id; qty_change < 0 | - |
| `inventory_audit` | Инвентаризация | audit_id, qty_before, qty_after, qty_change | +/- |
| `manual_edit` | Прямое редактирование qty или новая позиция | actor_id, qty_before, qty_after | +/- |
| `return` | Возврат на склад | order_id (если из заказа), qty_change > 0 | + |

**Старые типы → новые при миграции:**
- `addition`, `manual_add` → `manual_edit` с qty_change>0
- `deduction`, `writeoff` → `manual_edit` с qty_change<0
- `adjustment`, `inventory_adjustment`, `inventory_apply` → `inventory_audit`
- `from_order` → `consume` (с order_id)
- `mold_usage` → `consume` (с mold_id)
- `packaging`, `pendant`, `hardware` → `consume` (с order_id)
- `return_to_order` → `return` (с order_id)
- `extra_cost`, `import` → решить индивидуально или dropped (если редкий случай)

Это **значимое упрощение**. Логика отчётов теперь не про "о, у нас 12 типов с edge case'ами", а про "consume vs receipt vs inventory_audit".

---

## 4. Канонический справочник `warehouse_reservations.source`

**Только 2 значения** (вместо текущих 8+):

| source | Описание | Обязательные поля |
|---|---|---|
| `order` | Резерв под конкретный заказ | order_id |
| `manual` | Ручной резерв (admin отметил «эти 50 шт. зарезервированы под X») | note (что зарезервировано и кому) |

**Старые источники → новые:**
- `order_calc`, `project_hardware` → `order` (это всегда было одно и то же концептуально)
- `shipment` — это **бага**: shipment не создаёт reservation, это путаница. Удалить.
- `manual`, `existing` → `manual`
- `warehouse`, `cloned` — мусор, дропнуть

**Mold reservation:** молд НЕ создаёт reservation. Использование молда (mold use) делает **прямой consume**, не через резерв. Если нужно зарезервировать фурнитуру под будущий запуск молда — это рукотворная операция (source='manual' с note).

---

## 5. Файлы, которые читают/пишут склад (карта зависимостей)

| Файл (старый) | Что делает со складом | Куда переезжает |
|---|---|---|
| `js/warehouse.js` | UI: список, карточка, инвентаризация, журнал, резервы | `ops/api/src/routes/warehouse.js` + `ops/web/src/views/Warehouse*.vue` (Block 3) |
| `js/orders.js` | Создаёт резервы при сохранении заказа (source='order_calc'). Освобождает при удалении/отмене. | `ops/api/src/routes/orders.js` (Block 9) |
| `js/order-detail.js` | Главный потребитель: «project hardware ready» — переводит резерв в consumed. `_buildProjectHardwareStockTruth` — попытка вычислить state. | `ops/api/src/routes/orders.js` (consume-hardware) (Block 9) |
| `js/molds.js` | Привязка фурнитуры к молду + использование молда → consume. | `ops/api/src/routes/molds.js` (Block 5) |
| `js/calculator.js` | Читает warehouse для `last_price`. **Только чтение.** | `ops/api/src/calc/*` (Block 7) |
| `js/factual.js` | Читает warehouse для фактической себестоимости (3 точки). **Только чтение.** | `ops/api/src/calc/factual.ts` (Block 7) |
| `js/marketplaces.js` | Читает warehouse для отображения composition. (В будущем: списание при продаже.) | `ops/api/src/routes/marketplaces.js` (Block 5) |
| `js/tasks.js` | Читает warehouse для task assets (?). **Уточнить, нужно ли вообще.** | `ops/api/src/routes/tasks.js` (Block 11) |
| `api/bootstrap.js` (Vercel) | Прокачивает warehouseItems в bootstrap для быстрой загрузки | **Удаляется** (Block 1 уже имеет здоровый /api/warehouse/items) |
| `yandex/supabase-proxy/index.js` | Yandex proxy для warehouse + других таблиц | **Удаляется** в Stage D |

---

## 6. Инварианты (что ВСЕГДА должно быть истинно)

> **Каждый PR / каждое изменение должно сохранять эти инварианты. Если что-то их нарушает — это баг.**

### I1. Сумма active reservations ≤ qty
```sql
SELECT i.id, i.qty, COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0) AS reserved
FROM warehouse_items i
LEFT JOIN warehouse_reservations r ON r.item_id = i.id
GROUP BY i.id
HAVING i.qty < COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0);
```
Должен возвращать **0 строк**. Если нет — кто-то списал qty не сняв резерв, или создал резерв в обход API.

### I2. Сумма qty_change в history = текущий qty (с момента создания)
```sql
SELECT i.id, i.qty AS current_qty, COALESCE(SUM(h.qty_change), 0) AS history_sum
FROM warehouse_items i
LEFT JOIN warehouse_history h ON h.item_id = i.id
GROUP BY i.id, i.qty
HAVING i.qty != COALESCE(SUM(h.qty_change), 0);
```
Должен возвращать **0 строк**. Если есть расхождение — кто-то менял qty не записав в history (классический баг).

### I3. Каждое движение qty имеет actor
```sql
SELECT * FROM warehouse_history
WHERE actor_user_id IS NULL AND type != 'inventory_audit';
```
Должно быть пусто (кроме `inventory_audit` от системного процесса). Если есть — у нас аноним меняет склад.

### I4. Reservations указывают на существующие order_id
```sql
SELECT r.* FROM warehouse_reservations r
LEFT JOIN orders o ON o.id = r.order_id
WHERE r.source = 'order' AND r.status = 'active' AND (o.id IS NULL OR o.status IN ('closed','cancelled'));
```
Если есть строки — **орфанные резервы**. Order закрыт/отменён, а резерв всё ещё активен. → cron должен периодически чистить.

### I5. Order consume — атомарно
При вызове `POST /api/orders/:id/consume-hardware`:
- ЛИБО все items списались успешно (qty уменьшилось, history записан, reservations consumed)
- ЛИБО ничего не списалось (transaction rolled back)
- НЕТ промежуточного состояния

### I6. Idempotency на consume
Повторный вызов `consume-hardware` с тем же `Idempotency-Key` → не списывает повторно. Гарантировано через таблицу `idempotency_keys`.

### I7. Только один путь
Нет «локального кэша который потом синхронится». UI ВСЕГДА ждёт ответа API.

---

## 7. Классы багов, которые редизайн устраняет

| Класс бага | Причина в старой системе | Как фиксится в новой |
|---|---|---|
| **Двойное списание** | Кнопка нажата дважды, два запроса, оба прошли | Idempotency-Key на каждой мутации |
| **Фантомные резервы** | Order удалён, резерв остался `active`, фурнитура «зарезервирована в никуда» | FK с ON DELETE CASCADE + cron-чистка по I4 |
| **Stale qty в UI** | localStorage кэш разъехался с БД | Никакого localStorage. UI всегда читает свежее. |
| **«Project hardware ready» не помечается** | Состояние размазано между orders, reservations, history, settings.projectHardwareState | Состояние одно: `reservation.status`. UI читает только это. |
| **«После reload видны старые цифры»** | 5-уровневый fallback с разной свежестью | Один источник, один путь. Никаких bootstrap'ов на 30 минут устаревших. |
| **«Висит при сохранении»** | Каскад таймаутов на разных уровнях fallback | Прямой путь API → БД, ~30 мс p95. Если умерло — ошибка сразу. |
| **Списалось дважды** | Race condition между двумя пользователями или между resave и consume | Транзакции БД + idempotency |
| **Duplicate hardware rows** (commit 61cf522) | UI добавлял позиции дважды при перерасчёте | Композитный UNIQUE индекс на (order_id, item_id) если нужно |
| **Race condition на одновременных приёмках** | Несколько `receive` в параллель → qty считается с stale read | Транзакция с `SELECT FOR UPDATE` на затронутых items |
| **Resave заказа создаёт новые резервы вместо обновления старых** | source='order_calc' идея была, но логика её не везде применяет | Чистое API: PUT /orders/:id/reservations { items: [...] } перезаписывает atomically |
| **Resave заказа удаляет реальные движения qty из history** (commit ca2a910 "preserve order items") | Старая логика мерджила orderItems как часть payload | order_items хранятся отдельно, не пересоздаются |
| **Цена в blanks не та** (commit b63075a, 628a0e0) | Несколько мест хранят `last_price` отдельно — рассинхрон | Единая ссылка на warehouse_item.last_price. Кэширования копий нет. |
| **«Mold hardware links теряются на calc reload»** (commit c2511c9) | Calculator сохраняет orderItems обратно поверх привязок | Привязки хранятся в `mold_hardware`, никогда не в `order_items` |
| **«Приёмка создаёт пустую позицию»** (commit e93ca26 "Block weak auto-created receipt items") | Авто-создание warehouse item при приёмке без валидации | `shipment.receive` требует чтобы все items имели `warehouse_item_id` или явный `create_new=true` |

---

## 8. Изменения в плане миграции

### Что меняется vs. изначальный план

**Block 3 (Warehouse):**
- Не просто переносим структуру 1:1. Применяем **новую схему** (5 history types, 2 reservation sources).
- Скрипт `02-warehouse.mjs` копирует данные с **map'ингом старых типов на новые** (см. таблицу в разделе 3).
- Добавляем cron-задачу очистки orphan-резервов (Inv4).
- Добавляем интеграционные тесты на каждый инвариант I1-I7.

**Block 4 (Shipments + China):**
- `receive` операция использует новый history type='receipt' (вместо старых addition/manual_add).
- Транзакция с `SELECT FOR UPDATE` на затронутых items.
- Валидация: shipment_item должен иметь либо `warehouse_item_id`, либо явный flag `create_new` с обязательными полями.

**Block 5 (Molds):**
- `mold.use` НЕ создаёт reservation. Делает прямой consume с history type='consume', mold_id=..., order_id=... (если есть).
- mold_hardware привязки хранятся ТОЛЬКО в `mold_hardware` таблице, никогда не дублируются в order_items.

**Block 7 (Calculator):**
- Калькулятор и factual читают warehouse только для last_price. Это read-only. Никакой записи. Никаких ссылок «warehouse_item привязанный к order_item» — это data corruption, такие связи живут в `mold_hardware`, не в калькуляторе.

**Block 9 (Orders):**
- consume-hardware идемпотентен через Idempotency-Key.
- Резервы под заказ — единый flow: при PATCH /orders/:id (если изменился состав фурнитуры) — текущие резервы (status='active', source='order', order_id=...) удаляются и пересоздаются в одной транзакции.
- delete order → reservations CASCADE-удаляются (FK).
- close/cancel order → cron-задача переводит резервы в `released`.

**Stage B (Test):**
- Дополнительная проверка: запустить I1-I7 invariant queries на staging. Все должны вернуть 0 строк.

---

## 9. Чек-лист для каждого нового PR, касающегося склада

При любых изменениях в склад-логике:

- [ ] Использует ли код **только** транзакции (`withTransaction`) для multi-step операций?
- [ ] Есть ли `SELECT FOR UPDATE` на изменяемых items?
- [ ] Записывается ли запись в `warehouse_history` для каждого изменения qty?
- [ ] Используется ли один из канонических 5 history.type?
- [ ] Если создаётся reservation — source='order' или 'manual'?
- [ ] Если эндпойнт мутирующий — есть ли `Idempotency-Key`?
- [ ] Прошли ли I1-I7 invariants после операции (в тестах)?
- [ ] Если изменилась схема — обновлена ли миграция в Block 3?
- [ ] Обновлена ли эта карта (если появилась новая точка взаимодействия)?

---

## 10. Что НЕ меняется (остаётся как было)

- Калькулятор формулы (Block 7): 1:1, golden-master заставляет копейку-в-копейку
- Структура заказов: 1:1
- UI прайсингов в карточке заказа: 1:1
- Косвенные расходы и production calendar: 1:1
- Все остальное где **нет известных багов и нет взаимодействия со складом**

**Эта переделка — точечная.** Мы лечим конкретный больной модуль (warehouse + reservations + history + интеграция с orders/molds), не перестраивая весь дом.

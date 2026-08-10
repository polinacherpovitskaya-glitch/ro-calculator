# Надёжное сохранение калькулятора без VPN

**Дата:** 2026-08-10  
**Статус:** implementation ready  
**Область:** `calc.recycleobject.ru`, `calc2.recycleobject.ru`, Yandex platform API

## Проблема

Один клик «Сохранить» в калькуляторе сейчас выполняет серию независимых
`/api/compat/query`: чтение заказа, запись шапки, запись позиций, чтение
сохранённых позиций и отдельные удаления устаревших строк. При временном
сетевом сбое или timeout шапка заказа уже может быть записана, а позиции — нет.
Пользователь видит общую красную плашку и не может достоверно понять, сохранился
ли расчёт.

Оба production-домена уже используют российский
`https://api.recycleobject.ru`; исправление должно укрепить этот путь, а не
возвращать прямой доступ к зарубежному Supabase.

## Цель

Сохранение расчёта должно быть одной атомарной и идемпотентной операцией:

- заказ и его позиции фиксируются в одной транзакции;
- устаревшие позиции удаляются в той же транзакции;
- при ошибке ни одна часть нового снимка не становится видна;
- краткий `502/503/504` или сетевой обрыв безопасно повторяет тот же запрос с
  тем же `Idempotency-Key`;
- существующий статус production-заказа и soft-delete защита сохраняются;
- старый query-builder остаётся fallback для тестовых/legacy клиентов.

## Решение

1. Добавить `POST /api/compat/order-save` в Yandex API.
2. Под одной транзакцией и advisory locks для `orders` и `order_items`:
   - найти текущий заказ;
   - объединить `calculator_data`;
   - сохранить защищённый workflow status;
   - upsert текущих позиций;
   - удалить только отсутствующие в новом снимке позиции.
3. Добавить `PlatformClient.saveOrderSnapshot()` с одним стабильным
   `Idempotency-Key` на все retry попытки.
4. Переключить `saveOrder()` на атомарный путь, оставив текущую реализацию как
   совместимый fallback.
5. После успешной транзакции обновлять локальный backup и сбрасывать dirty flags.

## Инварианты

- `Calculator.saveOrder()`, `Calculator.toJSON()` и `Calculator.loadOrder()` не
  меняют публичные сигнатуры.
- Схемы `items`, `orders` и `order_items` не меняются; миграция БД не нужна.
- Существующий заказ со статусом `deleted` нельзя воскресить сохранением.
- Autosave со статусом `draft` не откатывает production status.
- Пустой входной список не удаляет существующие позиции без явного
  `allowEmptyItemsDelete`.

## Проверка

- API test: атомарный round-trip, cleanup stale items, status preservation,
  empty-items safety и idempotent replay.
- Browser-client smoke: повтор `503 -> 200` использует один idempotency key.
- Data-layer smoke: production `saveOrder()` выбирает atomic endpoint и корректно
  обновляет локальный backup.
- Existing calculator/order/version/Yandex deploy smokes остаются зелёными.
- После deploy оба домена показывают одну версию и API health остаётся `ok`.

## Вне области

- Переименование публичных Calculator/Warehouse API.
- Изменение DB schema или перенос оставшихся compat-таблиц.
- Косметическое скрытие красной плашки без устранения частичной записи.

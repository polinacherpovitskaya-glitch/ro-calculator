# План: согласованное сохранение пересчитанного заказа

Связанная спека: [`../specs/2026-07-17-order-save-consistency.md`](../specs/2026-07-17-order-save-consistency.md)

## 1. Зафиксировать причинный сценарий

- [x] Проверить путь ручного save и autosave до `saveOrder`.
- [x] Подтвердить, что автосейв имеет async-gap после формирования старого снимка.
- [x] Проверить, что отмена таймера не отменяет уже выполняющийся promise.

## 2. Последовательная запись

- [x] Добавить в `Calculator` очередь write-операций, устойчивую к ошибке предыдущей операции.
- [x] Добавить поколение, которым manual save и reset инвалидируют начатые autosave.
- [x] Направить autosave и manual save через очередь без изменения их публичных API.
- [x] Не обновлять local snapshot/UI от устаревшего autosave.
- [x] Проставлять fresh `updated_at` в локальный backup после успешного save.
- [x] Сохранять локальные `order_items` целиком, когда bootstrap старее локальной шапки.

## 3. Регрессии и релиз

- [x] Проверить, что уже начатый autosave записывается до manual, а manual — последним.
- [x] Проверить, что autosave, ожидавший подготовку файлов, отменяется после завершённого manual save.
- [x] Проверить, что calc2 bootstrap не заменяет новую маржу и позиции старым снимком.
- [x] Поднять версию приложения и cache-bust `app.js`.
- [x] Прогнать syntax, order-flow и version smoke.

Проверки:

```bash
node --check js/app.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
```

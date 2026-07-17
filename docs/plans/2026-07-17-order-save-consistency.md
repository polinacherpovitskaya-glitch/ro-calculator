# План: согласованное сохранение пересчитанного заказа

Связанная спека: [`../specs/2026-07-17-order-save-consistency.md`](../specs/2026-07-17-order-save-consistency.md)

## 1. Зафиксировать причинный сценарий

- [x] Проверить путь ручного save и autosave до `saveOrder`.
- [x] Подтвердить, что автосейв имеет async-gap после формирования старого снимка.
- [x] Проверить, что отмена таймера не отменяет уже выполняющийся promise.

## 2. Последовательная запись

- [ ] Добавить в `Calculator` очередь write-операций, устойчивую к ошибке предыдущей операции.
- [ ] Добавить поколение, которым manual save и reset инвалидируют начатые autosave.
- [ ] Направить autosave и manual save через очередь без изменения их публичных API.
- [ ] Не обновлять local snapshot/UI от устаревшего autosave.

## 3. Регрессии и релиз

- [ ] Проверить, что уже начатый autosave записывается до manual, а manual — последним.
- [ ] Проверить, что autosave, ожидавший подготовку файлов, отменяется после завершённого manual save.
- [ ] Поднять версию приложения и cache-bust `app.js`.
- [ ] Прогнать syntax, order-flow и version smoke.

Проверки:

```bash
node --check js/app.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
```

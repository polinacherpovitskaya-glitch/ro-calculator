# План: автовосстановление сохранения калькулятора

**Spec:** `docs/specs/2026-08-12-calculator-save-recovery.md`

## M1. Recovery orchestration `[x]`

- [x] Выделить один защищённый от параллельного запуска recovery-проход.
- [x] После успешной проверки базы автоматически синхронизировать dirty-заказы.
- [x] Удерживать recovery-цикл до удалённого подтверждения сохранения.
- [x] Перезапускать recovery после создания аварийной локальной копии.

## M2. Regression coverage `[x]`

- [x] Покрыть автоматическую синхронизацию после восстановления связи.
- [x] Проверить очистку dirty-флагов только после успешной удалённой записи.

## M3. Релиз `[x]`

- [x] Поднять четыре version anchor с актуального `origin/main`.
- [x] Обновить cache-bust изменённого `js/supabase.js`.
- [x] Запустить data-layer, save, order-flow и version smokes.

## Команды проверки

```sh
node tests/supabase-fallback-smoke.js
node tests/save-reliability-smoke.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
```

# План: автовосстановление сохранения калькулятора

**Spec:** `docs/specs/2026-08-12-calculator-save-recovery.md`

## M1. Recovery orchestration `[ ]`

- [ ] Выделить один защищённый от параллельного запуска recovery-проход.
- [ ] После успешной проверки базы автоматически синхронизировать dirty-заказы.
- [ ] Удерживать recovery-цикл до удалённого подтверждения сохранения.
- [ ] Перезапускать recovery после создания аварийной локальной копии.

## M2. Regression coverage `[ ]`

- [ ] Покрыть автоматическую синхронизацию после восстановления связи.
- [ ] Проверить очистку dirty-флагов только после успешной удалённой записи.

## M3. Релиз `[ ]`

- [ ] Поднять четыре version anchor с актуального `origin/main`.
- [ ] Обновить cache-bust изменённого `js/supabase.js`.
- [ ] Запустить data-layer, save, order-flow и version smokes.

## Команды проверки

```sh
node tests/supabase-fallback-smoke.js
node tests/save-reliability-smoke.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
```

# План: сквозная надёжность всех сохранений без VPN

**Spec:** `docs/specs/2026-08-10-all-save-reliability-audit.md`

## M1. Реестр и воспроизведение `[x]`

- [x] Найти все функции записи и прямые mutation-вызовы.
- [x] Разделить их на atomic order, compat query и storage transport.
- [x] Подтвердить, что compat/storage не повторяют краткий сбой.
- [x] Подтвердить concurrency gap до фиксации idempotency response.

## M2. Серверная идемпотентность `[ ]`

- [x] Атомарно резервировать одинаковые idempotency keys до мутации.
- [ ] Проверить одновременный replay с generated-id insert.
- [ ] Сохранить conflict-защиту ключа для другого method/path.

## M3. Общий mutation transport `[x]`

- [x] Повторять network error и `502/503/504` для compat query.
- [x] Сохранять один key на все попытки.
- [x] Не повторять `4xx`.
- [x] Добавить безопасный retry upload/remove.

## M4. Плашка и регрессии `[x]`

- [x] Не включать плашку, если повтор завершился успешно.
- [x] Включать её после исчерпанного connectivity failure.
- [x] Автоматически снимать после следующего успешного запроса.
- [x] Перепроверить atomic order, manual/autosave и order status flows.

## M5. Релиз `[ ]`

- [ ] Прогнать полный статический, API и браузерный набор.
- [ ] Получить следующую версию от свежего `origin/main` и обновить anchors.
- [ ] Запушить PR, пройти PostgreSQL CI и объединить.
- [ ] Дождаться API/static/live/mirror/write-back deploy workflows.
- [ ] Проверить версию, API/DB health и авторизованную страницу на обоих доменах.

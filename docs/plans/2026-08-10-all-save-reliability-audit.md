# План: сквозная надёжность всех сохранений без VPN

**Spec:** `docs/specs/2026-08-10-all-save-reliability-audit.md`

## M1. Реестр и воспроизведение `[x]`

- [x] Найти все функции записи и прямые mutation-вызовы.
- [x] Разделить их на atomic order, compat query и storage transport.
- [x] Подтвердить, что compat/storage не повторяют краткий сбой.
- [x] Подтвердить concurrency gap до фиксации idempotency response.

## M2. Серверная идемпотентность `[ ]`

- [ ] Сериализовать одинаковые idempotency keys до первого чтения кэша.
- [ ] Проверить одновременный replay с generated-id insert.
- [ ] Сохранить conflict-защиту ключа для другого method/path.

## M3. Общий mutation transport `[ ]`

- [ ] Повторять network error и `502/503/504` для compat query.
- [ ] Сохранять один key на все попытки.
- [ ] Не повторять `4xx`.
- [ ] Добавить безопасный retry upload/remove.

## M4. Плашка и регрессии `[ ]`

- [ ] Не включать плашку, если повтор завершился успешно.
- [ ] Включать её после исчерпанного connectivity failure.
- [ ] Автоматически снимать после следующего успешного запроса.
- [ ] Перепроверить atomic order, manual/autosave и order status flows.

## M5. Релиз `[ ]`

- [ ] Прогнать полный статический, API и браузерный набор.
- [ ] Получить следующую версию от свежего `origin/main` и обновить anchors.
- [ ] Запушить PR, пройти PostgreSQL CI и объединить.
- [ ] Дождаться API/static/live/mirror/write-back deploy workflows.
- [ ] Проверить версию, API/DB health и авторизованную страницу на обоих доменах.

# План: надёжное сохранение калькулятора без VPN

**Spec:** `docs/specs/2026-08-10-calculator-no-vpn-save.md`

## M1. Контракт `[ ]`

- [ ] Добавить атомарный `POST /api/compat/order-save`.
- [ ] Сохранить workflow/deleted status и объединение `calculator_data`.
- [ ] Синхронизировать позиции и stale cleanup в одной транзакции.
- [ ] Покрыть empty-items safety и idempotent replay API-тестами.

## M2. Browser transport `[ ]`

- [ ] Добавить `PlatformClient.saveOrderSnapshot()`.
- [ ] Повторять временный сбой с тем же `Idempotency-Key`.
- [ ] Покрыть `503 -> 200` regression smoke.

## M3. Calculator data layer `[ ]`

- [ ] Переключить production `saveOrder()` на atomic endpoint.
- [ ] Сохранить старый query-builder как fallback.
- [ ] Обновлять local backup/dirty flags только после полного успеха.
- [ ] Добавить data-layer regression smoke.

## M4. Релиз `[ ]`

- [ ] Обновить app version с `v439` до следующей версии по `origin/main`.
- [ ] Обновить cache-bust для изменённых production scripts.
- [ ] Запустить calculator, platform, API, version и Yandex smokes.
- [ ] Запушить PR и дождаться deploy + live smoke workflows.
- [ ] Проверить версию и health на обоих production-доменах.

## Команды проверки

```sh
node tests/platform-client-smoke.js
node tests/supabase-fallback-smoke.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
node tests/yandex-platform-shadow-smoke.js
node tests/yandex-api-deploy-smoke.js
```

API integration tests запускаются через существующий `ops/api` test harness с
локальной PostgreSQL из `TEST_DATABASE_URL`.

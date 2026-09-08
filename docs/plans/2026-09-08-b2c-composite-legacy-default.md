# План: автоматическое объединение существующих B2C-составов

Связанная спецификация:
[`docs/specs/2026-09-08-b2c-composite-legacy-default.md`](../specs/2026-09-08-b2c-composite-legacy-default.md)

## Реализация

- [x] Добавить трёхсоставную нормализацию: явное `true`, явное `false`, fallback
  по количеству пластиковых деталей.
- [x] Покрыть fallback и явный отказ regression-тестами.
- [x] Поднять версию и cache-bust.
- [ ] Выпустить и проверить production.

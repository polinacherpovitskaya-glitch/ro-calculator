# План: надёжный каталог бланков

Связанная спека: [`../specs/2026-07-17-blank-catalog-reliability.md`](../specs/2026-07-17-blank-catalog-reliability.md)

## 1. Единое управление каталогом

- [x] Добавить inline-галочку включения.
- [x] Сохранять статус вместе с весом и техпараметрами.
- [x] Группировать активные позиции по коллекциям, выключенные вынести в конец.

Проверка: `node tests/molds-smoke.js`

## 2. Каноническая публикация

- [x] Явно публиковать status/catalog_enabled/photo/size/weight/collection и цены активных позиций.
- [x] Полностью снимать inactive позиции, включая legacy prices.
- [x] Защитить контракт тестом.

Проверка: `node tests/molds-smoke.js`

## 3. Фото calc2 и Figma-плагин

- [x] Ожидать upload перед сохранением формы и использовать возвращённый URL.
- [x] Обновить tolerant parser Figma-плагина и проверить filter доступности.
- [x] Собрать обновляемый zip для повторного импорта.

Проверка: `node tests/molds-smoke.js && node /Users/krollipolli/Documents/Github/design/figma-plugin/tests/parsecatalog-smoke.js`

## 4. Релиз v391

- [x] Поднять версию во всех четырёх anchors и cache-bust `molds.js`/`supabase.js`.
- [x] Прогнать syntax, version и browser smoke локально; production-smoke — после merge.
- [ ] Открыть отдельный PR с документами и реализацией.

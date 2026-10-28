# План: калькулятор грузит свой код с сервера

Спецификация: [`docs/specs/2026-10-28-calc-assets-same-origin.md`](../specs/2026-10-28-calc-assets-same-origin.md)

- [x] В `tests/single-calculator-deploy-smoke.js` добавить: сборка не упоминает
      `storage.yandexcloud.net`; деплой проверяет `APP_VERSION`. Тест падает на текущем коде.
- [x] В `scripts/build-yandex-static.mjs` убрать `rewriteIndexForObjectStorage` и `STORAGE_ORIGIN`,
      копировать `index.html` как есть.
- [x] В `.github/workflows/yandex-static-sync.yml` в шаге «Verify published calculator version»
      после `js/version.json` скачать опубликованную страницу, взять ссылку на `js/app.js`
      (она должна быть относительной) и сравнить его `APP_VERSION` с ожидаемой версией.
- [x] Прогнать шаг проверки руками: на текущем живом сайте он падает
      («index.html must load js/app.js from this release, got: https://storage.yandexcloud.net/…»),
      на локальной копии исправленного релиза проходит.
- [x] Прогнать `tests/single-calculator-deploy-smoke.js`, `tests/bootstrap-guard-smoke.js`,
      `tests/bootstrap-pagination-smoke.js`, `tests/version-smoke.js`, `node --check` сборки.
- [ ] После мёржа: «Calculator static deploy» зелёный, живые смоуки зелёные, страница грузит
      `js/app.js` с сервера и показывает v482.

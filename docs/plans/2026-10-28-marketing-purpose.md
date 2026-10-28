# План: тип работ «Маркетинг»

Спецификация: [`docs/specs/2026-10-28-marketing-purpose.md`](../specs/2026-10-28-marketing-purpose.md)

- [ ] `tests/marketing-purpose-smoke.js`: `marketing` нормализуется в себя, некоммерческий, подписи
      и иконки всех типов, выручка 0 и затраты-расход у сводки, порядок в выпадающем списке,
      ручные списки в `js/production_load.js` знают `marketing`. Тест падает на текущем коде.
- [ ] `js/calculator.js`: `marketing` в `PRODUCTION_PURPOSES` (с `icon` у некоммерческих типов) и
      в `isNonCommercialProductionPurpose`.
- [ ] `index.html`: пункт «Маркетинг: подарки, промо, раздача» после «Сток / внутренний образец».
- [ ] `js/order-detail.js`, `js/orders.js`: подписи через `getProductionPurposeMeta`, «Расход на
      маркетинг» в карточке.
- [ ] `js/production_load.js`, `js/bonuses.js`, `ops/api/src/bonuses/calc.js`: маркетинг как сток;
      тест в `ops/api/test/bonuses-calc.test.js`.
- [ ] Смоук в `.github/workflows/deploy-pages.yml`, версия v483 в четырёх местах и `?v=` у
      изменённых скриптов; прогнать `version-smoke`, `order-flow-smoke`, `tirage-allocation-smoke`,
      `leftover-assembly-smoke`, новый смоук и тесты бонусов.
- [ ] После выката: перевести «авиасейлс подарки» (заказ 1791898260664) из `rework` в `marketing`
      с резервной копией строки.

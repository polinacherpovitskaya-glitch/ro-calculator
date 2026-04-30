# Pricing Canon — 2026-04-30

## Цель
- Убрать случайный drift между `Бланками`, общим `Калькулятором`, `Подвесами`, `ТПА`, публикацией каталога и order summary / plan-fact.
- Зафиксировать одну формулу цены и одну трактовку маржи для B2B-прайса на всем сайте.

## Канонические ставки
- Налог: `7%` от базы без НДС
- Коммерческий отдел: `6.5%` от базы без НДС
- Благотворительность: `1%` от базы без НДС
- НДС: `5%` сверху, отдельно от базы и отдельно от чистой маржи

## Канонические производственные настройки
- `indirect_costs_monthly = 1_900_000`
- `cutting_speed = 300`
- `indirect_cost_mode = all`
- Доставка каталожного молда по умолчанию: `3000 ₽`

## Основная формула

### Цена без НДС
```text
keep_rate = 1 - tax_rate - commercial_rate - charity_rate - target_margin
price_wo_vat = cost / keep_rate
```

### Цена с НДС
```text
price_with_vat = price_wo_vat * (1 + vat_rate)
```

### Чистая маржа
```text
net_retention_rate = 1 - tax_rate - commercial_rate - charity_rate
earned = price_wo_vat * net_retention_rate - cost
margin_pct = earned / price_wo_vat
```

## Канонические тиры для бланков
- `10 шт -> 65%`
- `50 шт -> 60%`
- `100 шт -> 55%`
- `300 шт -> 50%`
- `500 шт -> 45%`
- `1000 шт -> 40%`
- `3000+ шт -> 35%`

## Поверхности, которые обязаны считать одинаково
- `js/molds.js`
  - каталог бланков
  - inline price hints
  - `publishCatalog()` для сайта и Figma
- `js/calculator.js`
  - кастомные заказы
  - blank-derived строки в основном калькуляторе
  - hardware / packaging target pricing
  - order summary / findirector / plan-fact поля
- `js/app.js`
  - unified pricing card
  - КП / коммерческое предложение
- `js/pendant.js`
  - подвесы и буквенные blank tiers
- `js/tpa.js`
  - TPA/XPM pricing view
- `js/factual.js`
  - plan-fact строки `налоги / коммерческий / благотворительность`
  - прибыль по заказу и по факту денег

## Осознанные исключения
- `js/marketplaces.js` живет по отдельной B2C-логике и не обязан копировать B2B-канон 1:1.
- Для маркетплейсов и интернет-магазина важен отдельный набор ставок канала, поэтому этот модуль надо сверять отдельно, а не насильно подгонять под бланки/кастомные заказы.

## Источник правды в коде
- Общий retention helper: `/Users/krollipolli/Documents/Github/RO calculator/js/calculator.js`
- Каталог бланков: `/Users/krollipolli/Documents/Github/RO calculator/js/molds.js`
- Seeds / defaults / shared normalization: `/Users/krollipolli/Documents/Github/RO calculator/js/supabase.js`
- Fresh setup schema: `/Users/krollipolli/Documents/Github/RO calculator/supabase-schema.sql`

## Аудит-гейт
- Скрипт: `/Users/krollipolli/Documents/Github/RO calculator/scripts/audit-pricing-surfaces.mjs`
- Он обязан падать, если в критичных поверхностях снова появляются старые формулы вида `6.5% * (1 + НДС)` или `1% * (1 + НДС)`.

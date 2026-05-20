# Analytics reports inventory

Block 15 ports the legacy analytics/factual reporting surface as read-only Ops API reports. The old `js/analytics.js` module is currently a redirect into `Factual.load()`, so the source of truth for the inventory is `js/factual.js`.

Known legacy caveat: the old screen mixes analytics with plan/fact editing and has known bugs. This block ports the read-only report surface 1:1 enough for staging validation; formula fixes stay out of scope until Stage D.

## Reports

| New report | Endpoint | Legacy reference | Notes |
| --- | --- | --- | --- |
| Summary cards | `GET /api/analytics/summary` | `Factual._renderGlobalStats()` | Order counts, plan revenue/cost/margin, fact revenue/cost/margin, plan hours, fact hours. |
| Revenue by month | `GET /api/analytics/revenue-by-month` | `Factual._renderGlobalStats()`, period filtering helpers | Month buckets from `orders.created_at`, excluding draft/cancelled orders. |
| Top clients | `GET /api/analytics/top-clients` | Order table grouping in factual dashboard | Groups by `orders.client_name`, sums planned revenue/margin. |
| Status dynamics | `GET /api/analytics/status-dynamics` | `Factual._getSection()`, `Factual._renderOrdersTable()` | Counts and revenue by order status/month. |
| Production load | `GET /api/analytics/production-load` | `Factual._getFactLoadHoursForPeriod()`, `Factual._isProductionLoadEntry()` | Uses Block 14 `time_entries` for factual hours, grouped by employee and stage. |
| Product types | `GET /api/analytics/product-types` | `Factual._buildPlanDataForOrder()` order-item aggregation | Uses `order_items.type` with quantity/revenue aggregation. |
| Factual margin | `GET /api/analytics/factual-margin` | `Factual._loadFactSummaries()`, `Factual._calcProfitability()` | Uses `order_factuals` joined to orders for closed/factual money. |

## Out of scope for Block 15

- Editing order factuals.
- Rewriting old plan/fact formulas.
- Adding marketplace-specific analytics beyond the data already represented in order items.
- Fixing known legacy analytics bugs.

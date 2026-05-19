# Calc engine layout

This directory is the migration target for the legacy calculator logic from the browser-only app. The first implementation goal is golden-master parity with the saved Supabase order snapshots, not formula redesign.

## Public API

`calcOrder(input: OrderInput): OrderOutput`

- Source: `js/calculator.js#getOrderLiveCalculatorSnapshot`.
- Normalizes legacy order rows into products, hardware, packaging, extra costs, and pendants.
- Runs per-line cost calculators, production load, and order summary.
- Must preserve snapshot semantics: saved `calculator_data` and item snapshots are expected outputs; API save must not auto-recalculate.

`calcProduct(input: ProductInput, params: ProductionParams): ProductCostOutput`

- Source: `js/calculator.js#calculateItemCost`.
- Computes per-unit product cost and batch hours.
- Cost components: production salary, indirect, plastic, mold amortization, design, cutting, NFC tag/programming, printing, delivery, built-in hardware, and built-in assembly.
- Mold rule: blank mold amortizes over 4500 units; custom mold amortizes over order quantity. In-stock custom base mold removes the paid base mold, extra molds are additive.
- Printing supports both `printings[]` and legacy `printing_qty` / `printing_price_per_unit`.

`calcHardware(input: HardwareInput, params: ProductionParams): HardwareCostOutput`

- Source: `js/calculator.js#calculateHardwareCost`.
- Computes purchase + delivery + assembly salary and optional indirect.
- Indirect is applied only when `indirectCostMode === 'all'`.

`calcPackaging(input: PackagingInput, params: ProductionParams): PackagingCostOutput`

- Source: `js/calculator.js#calculatePackagingCost`.
- Same structure as hardware: purchase + delivery + packaging salary + optional indirect.

`calcPendant(input: PendantInput, params: ProductionParams): PendantCostOutput`

- Source: `js/calculator.js#calculatePendantCost`, with duplicated UI pricing helpers in `js/pendant.js`.
- Computes countable letter elements, letter blank cost, cord/carabiner purchase, delivery, assembly, indirect, print cost, total cost, sell price, revenue, and assembly hours.
- Letter blank IDs are legacy constants `30` and `31`. Tier quantities currently differ between files: `calculator.js` uses `[50, 100, 300, 500, 1000, 3000]`, while `pendant.js` fallback includes `10`. This is a Block 7 pricing-unification risk and must move into `pricing.ts`.

`calcProductionLoad(input: OrderLinesWithResults, params: ProductionParams): ProductionLoadOutput`

- Source: `js/calculator.js#calculateProductionLoad`.
- Sums plastic-zone hours, packaging hours, and hardware/assembly hours.
- Plastic load uses `params.plasticHours`; packaging load uses `params.packagingHours` and includes hardware/assembly.
- Returns total hours, load percentages, and estimated worker-days for one, two, and three workers.

`calcOrderSummary(input: OrderLinesWithResults, params: ProductionParams): OrderSummaryOutput`

- Source: `js/calculator.js#calculateOrderSummary`.
- Sums net revenue before VAT, discount, earned amount, VAT, total with VAT, and margin percent.
- Extra costs increase revenue and earned amount after net retention.
- Discounts reduce both revenue and earned amount by `discount * netRevenueRetentionRate`.

`calcFinancialDirectorData(input: OrderLinesWithResults, params: ProductionParams): FinancialDirectorOutput`

- Source: `js/calculator.js#calculateFinDirectorData`.
- Produces the planned cost buckets used by factual/finance views: salary, indirect, hardware purchase/delivery, NFC, packaging purchase/delivery, design, printing, plastic, molds, delivery, taxes, commercial, charity, revenue, VAT view, discount, and total costs.
- Must reuse the same cost outputs as `calcOrder`; this is one of the main defenses against margin drift.

`calcFactual(plan: PlanInput, factual: FactualInput): FactualOutput`

- Source: `js/factual.js`, especially `_buildPlan`, `_applyCurrentPlanMaterialTotals`, `_applyDerivedFacts`, and `_calculateResult`.
- Builds plan rows from saved item snapshots when present; falls back to live product cost calculation only for missing legacy fields.
- Fact rows derive salaries from production stage time, indirect from fact hours times `params.indirectPerHour`, and money facts from FinTablo/import/manual fields.
- Result formula: revenue minus expenses; margin is `profit * 100 / revenue` when revenue exists.

`calcTpaLive(input: TpaInput): TpaOutput`

- Source: `js/tpa.js#calculateScenario`.
- Computes small-machine scenario for XPM-17:
  - `piecesPerHour = cavities * openingsPerHour`
  - `hoursTotal = quantity / piecesPerHour * wasteFactor`
  - per-unit runtime = plastic + FOT + indirect + setup
  - total per unit = runtime + mold amortization
  - sell without VAT = rounded-to-5 `totalPerUnit / keepRate`
  - sell with VAT uses current VAT rate, default `0.05`
- Technical and economic verdict helpers should stay pure but are secondary to golden-master order parity.

## Shared Internal Functions

`calcNumber(value, fallback)`

- Source: `js/calculator.js#calcNumber`.
- Accepts strings with spaces, NBSP, commas, currency-like extra chars, and returns a finite number or fallback.
- New TypeScript boundary should validate/coerce once and pass numbers internally. Avoid repeating implicit `parseFloat(event.target.value)`.

`getProductionParams(settings)`

- Source: `js/calculator.js#getProductionParams` and `js/indirect_costs.js#_getWorkloadHours`.
- Derived values:
  - `totalHoursAll = workers_count * hours_per_worker`
  - `workLoadHours = totalHoursAll * work_load_ratio`
  - `plasticHours = workLoadHours * plastic_injection_ratio`
  - `packagingHours = workLoadHours * packaging_ratio`
  - `indirectPerHour = indirect_costs_monthly / (indirectCostMode === 'all' ? workLoadHours : plasticHours)`
- Keeps tax, VAT, charity, target margin, delivery, printing delivery, and waste factor settings.

`pricing.ts`

- Must become the only place for sell-price math.
- Sources to merge:
  - `js/calculator.js#calculateTargetPrice`
  - `js/calculator.js#calculateActualMargin`
  - `js/calculator.js#calculateOrderDiscount`
  - `js/calculator.js#getKeepRateForTargetMargin`
  - `js/pendant.js` letter blank fallback pricing and attachment sell-price helpers
  - B2B/blank pricing fixes from BUG class N.
- Required functions:
  - `costPrice(input)` for cost-only surfaces.
  - `retailPrice(cost, params, quantityOrTier)` for standard net revenue price.
  - `b2bPrice(cost, params, quantityOrTier)` once B2B source fields are identified.
  - `actualMargin(sellPrice, costPerUnit, params)`.
  - `orderDiscount(baseRevenue, discount, params)`.

`colors.ts`

- Source: `js/colors.js` for the color catalog UI and `js/calculator.js` color attachment helpers.
- Calculation dependency is limited: item color choices and attachments are snapshot data. Attachment compression/serialization belongs outside pure financial formulas unless API must accept legacy color attachments.

`indirect.ts`

- Source: `js/indirect_costs.js`.
- Monthly indirect total is fixed costs plus indirect salary share unless user override exists.
- The calculator consumes only the effective monthly total via `settings.indirect_costs_monthly` and derives `indirectPerHour`.

## Snapshot Conversion

Golden fixtures are exported as:

- `order`: raw Supabase `orders` row.
- `items`: raw Supabase `order_items` rows.
- `factuals`: raw Supabase `order_factuals` rows.
- `expected`: saved totals from order columns first, then `calculator_data` fallback.
- `summary`: coverage hints for fixture selection.

`fixtureToInput()` for golden-master tests must parse:

- `order.calculator_data`
- `order.items_snapshot`
- `order.hardware_snapshot`
- `order.packaging_snapshot`
- each `order_items.item_data`
- factual `factual_data`

The new engine should compare against saved output fields first. If a legacy snapshot is incomplete, the test runner should record the missing field explicitly instead of silently recalculating an expected value.

## Bug-Class Constraints

- L, duplicate saves: calc module is pure; orders API mutations in Block 9 must require `Idempotency-Key` and explicit save/recalc commands.
- M, numeric coercion: all public inputs must pass runtime validation. Internals take `number`, not `number | string`.
- N, pricing inconsistency: no module except `pricing.ts` may invent sell-price, margin, discount, B2B, or blank-tier math.
- O, stale assets: the Vue SPA build already uses Vite hashed assets; calc code must not depend on global script load order.
- U, margin drift: save endpoints must persist snapshots and must not auto-recalculate from current warehouse/pricing data.

## Fixture Gaps

The current Supabase data set used for Task 1 had no active calculator orders matching "simple: 1-2 product lines without molds/hardware". It also had no detectable B2B legal fields in `orders`. Current fixtures still cover 24 real orders, including factuals, pendants, molds/hardware, NFC, and complex orders. Add simple/B2B fixtures later if the legacy data source exposes suitable orders or fields.

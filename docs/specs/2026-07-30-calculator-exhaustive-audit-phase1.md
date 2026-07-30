# Exhaustive calculator audit, phase 1 — 2026-07-30

## Problem

The calculator has accumulated several data and pricing paths: custom products,
catalog blanks, NFC, printing, warehouse/China/custom hardware and packaging,
pendants, discounts, non-commercial work, order autosave, order reload and
downstream order views. Existing smoke tests cover important regressions, but
there is no current field-by-field audit proving where every visible value
comes from and that the same value survives the full order lifecycle.

The recent NFC discrepancy also showed that a locally correct-looking
calculator value can drift from the catalog that owns the price.

## Goal

- Create a repeatable audit matrix for every calculator input and output.
- Record the authoritative source for every cost and recommended/sell price.
- Verify the first lifecycle slice:
  `render -> edit -> recalculate -> autosave/manual save -> load -> resave`.
- Verify parity between the calculator, saved order data, order list, order
  detail, production load, financial summary and customer invoice/KP wherever
  a value is consumed.
- Prepare the next warehouse slice without performing irreversible live stock
  movements during phase 1.

## Phase 1 scope

### Order header

- Name, client, manager and both deadline fields.
- Production purpose and leftover-assembly fields.
- Notes, delivery address, Telegram, CRM and FinTablo links.
- Legal entity and banking requisites.
- Discount mode/value and calculated discount totals.

### Product rows

- Custom and catalog-blank modes.
- Name, quantity, production speed, weight, mold flags and extra molds.
- NFC tag/programming, client delivery, multiple printings.
- Multiple colors and color-solution attachments.
- Per-item hardware and packaging.
- Clone, remove, collapsed summary and more than six products.

### Other calculator rows

- Order-level hardware: warehouse, China and custom Russia/China.
- Order-level packaging: warehouse, China and custom Russia/China.
- Extra income/cost rows.
- Pendant builder persistence and calculated attachments.

### Calculated outputs

- Per-line cost breakdowns and target prices.
- Unified pricing card and manually edited sell prices.
- Revenue, VAT, discount, margin and earned amount.
- Production hours/load and FinDirector breakdown.
- Saved financial snapshot and live recalculation parity.
- Customer invoice and KP payload.

## Price-source contract

| Value | Authoritative source | Required fallback |
| --- | --- | --- |
| Production rates, taxes, VAT, indirect costs, mold/design/NFC/delivery defaults | current global settings via `getProductionParams()` | documented code default only where the setting is absent |
| Catalog blank cost and recommendation | selected blank tier from `Molds.allMolds[id].tiers[tierQty]` / the same catalog formula | calculator formula using the same tier inputs |
| Catalog blank manual price | `custom_prices[tierQty]` only when `use_manual_prices` is active | live catalog formula |
| Warehouse hardware/packaging purchase cost | current `warehouse_items.price_per_unit` | saved line price only when current warehouse data is unavailable |
| Warehouse hardware/packaging sale price | linked active blank record for the matching warehouse item and tier | calculated target price |
| China hardware/packaging purchase and delivery | selected China item/manual CNY price, weight, exchange and delivery method | saved CNY/weight/method on reload |
| Custom Russia hardware/packaging | manually entered RUB purchase and delivery values | none |
| Printing | manually entered purchase price and delivery per printing row | configured printing delivery default |
| Pendant letters | linked blank tier / pendant catalog calculation | current calculator formula |
| Pendant attachments | selected warehouse entries and their current purchase/assembly data | saved attachment values when the directory is unavailable |
| Final sell prices | explicit calculator sell price or the row's current recommendation | zero is a deliberate free sale, never an implicit recommendation |

## Acceptance criteria

1. Every field in scope has a matrix row with render, save/load and consumer
   assertions.
2. Automated baseline checks pass on the exact `origin/main` audit base.
3. A focused regression check covers all order-header fields through
   save/load/resave and verifies that no field silently disappears.
4. Representative custom, blank/NFC, hardware, packaging, printing, pendant,
   discount and purpose scenarios have recorded price provenance.
5. Calculator totals match the saved financial snapshot and downstream
   rendering for the same fixture.
6. Any confirmed defect is fixed surgically with a regression before the phase
   is marked complete.
7. Live writes are limited to explicitly identifiable, recoverable audit
   records; stock mutation is deferred to the warehouse phase.

## Non-goals

- No database migration or order-item schema change.
- No broad rewrite of `js/app.js`, `js/calculator.js` or `js/warehouse.js`.
- No unrelated redesign of calculator UI.
- No destructive manipulation of real orders or warehouse stock.
- No claim that warehouse reserve/write-off behavior is complete until the
  dedicated warehouse phase has passed.


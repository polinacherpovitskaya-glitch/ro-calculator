# NFC blank price parity — 2026-07-30

## Problem

For a 3,000-unit NFC blank order, the calculator pricing card does not match
the 3K column on the `Бланки` page. The directory calculates cost for each
catalog tier and applies the current flat 40% net margin, while the calculator
still uses the old 50-unit reference cost and the retired tier-margin ladder.
It can also read historical `custom_prices` even when manual pricing is off.

## Goal

- Make the calculator's blank cost and recommended price match the selected
  catalog tier on the `Бланки` page.
- Use the same tier quantity, setup cost, NFC operations, order-processing
  allocation, hardware allocation, and flat 40% margin as the blank directory.
- Apply `custom_prices` and `custom_margins` only when the blank has an active
  manual-price override.
- Cover the 3,000-unit NFC regression with an automated smoke test.

## Non-goals

- No database migration or mold-data rewrite.
- No changes to saved order item schemas or cross-module method signatures.
- No redesign of the calculator or blank-directory UI.
- No change to intentional standalone-letter versus assembled-pendant pricing.

## Acceptance criteria

1. A formula-priced NFC blank at 3,000 units shows the same per-unit cost in
   the calculator and in `Molds.allMolds[id].tiers[3000].cost`.
2. Its calculator recommendation equals the blank directory's 3K sell price.
3. Dormant historical prices do not appear as manual prices in the calculator.
4. Explicit manual prices continue to work when `use_manual_prices` is true.
5. Relevant smoke tests and the four-anchor version check pass.

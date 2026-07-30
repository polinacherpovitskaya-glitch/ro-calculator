# Exhaustive calculator audit, phase 1 implementation plan

- [x] Refresh `origin/main` and create a clean audit branch/worktree at `v429`.
- [x] Preserve the historical audit and add the new 2026-07-30 calculator track.
- [x] Record the calculator field inventory and price-source contract.
- [x] Run the initial syntax, health, data-path, order, pricing, molds and
      warehouse-migration smoke baseline.
- [x] Add focused persistence coverage for every order-header field.
- [x] Add focused price-provenance coverage for one representative row of each
      product/hardware/packaging/printing/pendant source.
- [x] Run the local headed browser matrix for render, edit, calculation,
      save, reload and resave.
- [x] Compare the same fixture in calculator, orders list, order detail,
      production load, FinDirector, invoice and KP.
- [x] Fix each confirmed first-pass defect with a regression.
- [x] Refresh from `origin/main`, bump the four version anchors and changed
      runtime cache-bust suffixes if runtime code changes.
- [x] Run the focused and broad regression gates and document the exact result.
- [ ] Ship the phase-1 package and verify both production mirrors if a runtime
      fix is required.

## First-pass results

- Header save/load/resave is covered both through the calculator harness and
  the real `saveOrder` data layer.
- The headed custom NFC fixture completed `create → autosave → manual save →
  orders board → order detail → calculator reload → resave` without duplicate
  orders or lost item fields.
- The 3K `NFC Звезда` blank showed the same calculated tier recommendation as
  the blanks pricing formula; dormant manual prices stay ignored unless the
  manual-pricing flag is active.
- Confirmed and fixed:
  - calendar-only deadlines shifting one day in negative UTC offsets;
  - saved legal and bank data being invisible in order detail;
  - half-cent floating-point values rounding down;
  - product cards showing gross margin under the same label as canonical net
    margin;
  - stale 6.5% commercial-rate copy and settings rates being ignored by
    FinDirector and plan-fact;
  - slow catalog bootstrap overwriting a valid local calculator draft;
  - color edits and comma-decimal sale prices not recalculating immediately;
  - failed shared-database saves keeping large order items only in volatile
    memory, so a reload could lose the item composition;
  - order detail omitting printings, extra rows and locally saved pendant data;
  - KP rounding money to tens and emitting unsupported emoji glyphs to PDF;
  - plan-fact dropping the full pendant cost breakdown;
  - order summary, non-commercial loss and FinDirector multiplying rounded
    per-unit costs instead of using exact batch totals;
  - FinDirector omitting explicit printing on pendant letters.
- A synthetic reversible warehouse lifecycle passed
  `stock → reserve → resave → consume → rollback → draft release`, including
  idempotency and movement history. No production stock was mutated.

## Release validation

- Refreshed `origin/main` remained at `v429`; this package targets `v430`.
- Passed all JavaScript syntax checks plus version, order-flow,
  Supabase-fallback, pricing-canon, molds, factual, finance,
  warehouse-migration, active-order recalculation, pendant, partial-delivery,
  production-load/publish, pricing-surface, code-health and data-path checks.
- Ops calculator TypeScript build and typecheck passed. The focused 49-test
  pricing/live-calc/plan-fact suite passed. The full ops suite additionally
  requires its PostgreSQL fixture on `127.0.0.1:5433`; those 24 integration
  cases were not available in this local environment.

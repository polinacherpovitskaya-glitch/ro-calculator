# Calc 2 Calculator Audit Fixes

**Date:** 2026-05-18
**Type:** Design spec (sub-project of calc2 UX overhaul)
**Status:** Brainstormed, ready for implementation plan
**Target release:** Single push, version bump to the next sequential version (likely `v370` if the warehouse-IA-cleanup spec lands first as `v369`; otherwise `v369`).

## Context

Sub-project of the broader calc2 UX overhaul started 2026-05-15. Prior sub-projects:

- 2026-05-15 menu cleanup — **merged to main as v368** ([`docs/specs/2026-05-15-calc2-menu-cleanup.md`](2026-05-15-calc2-menu-cleanup.md)).
- 2026-05-15 warehouse IA cleanup — queued for Codex on branch `calc2-warehouse-ia-cleanup`, bumps to v369.

The Calculator page was redesigned in April 2026 ([`docs/specs/2026-04-02-calculator-ux-redesign.md`](2026-04-02-calculator-ux-redesign.md)) with progressive disclosure: three numbered sections (①②③), collapsible item cards, hidden rare fields. An audit on 2026-05-18 confirmed the redesign is **85% shipped and stable**. 15+ commits since April are all logic/pricing fixes (no visual regressions). The audit surfaced 7 concrete UX issues — all 7 are in scope of this spec.

Calculator is the core daily tool. Constraint: do not change pricing logic, item schema, or cross-module APIs that orders/KP/Pendant/Warehouse rely on.

## Goals

- Ship fixes for all 7 audit findings as one push.
- No changes to `Calculator.recalculate()`, `Calculator.toJSON()`, item schema, or any cross-module API.
- No changes to pricing, blanks, NFC, or any business logic.
- Preserve the 3-section structure (it works).

## Non-goals

- Not touching `Pendant`, `KP`, `Orders`, `Warehouse`, `Finance` modules.
- Not renaming any hardcoded element IDs (`calc-order-name`, `calc-items-container`, `calc-items-add-row`, etc.).
- Not refactoring `js/calculator.js` (1906 lines, stable).
- Not changing the underlying mold/color picker fetch logic — only how the result is rendered when it fails.
- No DB or migration changes.

## Disposition per audit finding

### Fix 1 — Pendant-from-letters always discoverable (HIGH)

**Problem:** The "или подвес из букв" button is only shown in the empty-state block (`calc-items-add-row` when `items.length === 0`). Once items exist, the empty state is hidden and the pendant entry point disappears. To add a pendant to an existing order, the user has to remember it's a feature and navigate elsewhere.

**Fix:** In the persistent add-row that is visible when items exist (the "+ Добавить изделие" button area around `index.html:408`), add an inline secondary action "или подвес из букв" next to the primary button. Same handler as the empty-state version. Result: pendant entry point is always one click away whether the calculator is empty or full.

### Fix 2 — Picker dropdowns auto-scroll into view (MEDIUM)

**Problem:** Mold and color pickers render with `position: absolute; max-height: 300px` from inline styles in `renderItemBlock()`. If a picker opens below the fold, the user has to manually scroll to see the options. No `scrollIntoView` is called.

**Fix:** When a picker opens, call `pickerEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })` so the open panel is brought into view. Additionally, add a CSS rule that flips the picker above its trigger if it would otherwise overflow the viewport bottom: detect `getBoundingClientRect().bottom > window.innerHeight` and toggle a `.picker-above` class that uses `bottom: 100%; top: auto;`. Pure UI behavior — no fetch or data change.

### Fix 3 — Calculator footer adopts new section styling (MEDIUM)

**Problem:** The footer block (totals + discount toggle + action buttons) at `index.html:442+` still uses the legacy `.card` class, breaking visual continuity with the three new `.calc-section` blocks above it.

**Fix:** Wrap the footer in `<div class="calc-section calc-section-footer">` with an unnumbered header reading "Итог". Add CSS rule for `.calc-section-footer` mirroring `.calc-section` styling minus the number-badge variant. Result: a fourth visual block that matches the three sections in spacing, border, and header weight.

### Fix 4 — Loading state for opening an existing order (MEDIUM)

**Problem:** When the user navigates to an existing order via `App.navigate('calculator', false, orderId)`, the fetch is silent. There's no feedback until items render — feels frozen on slow networks.

**Fix:** In the order-loading flow (the entry point that handles `loadOrder` for the calculator), render a loader overlay inside `calc-items-container` while the fetch is in flight. Loader = centered spinner + text "Загружаем заказ…". Remove once items array has been populated and the first render completes. Implement as a CSS class `.calc-loader` toggled via a small helper, not a fragile setTimeout. Show only when there's an active order load (not on empty calculator opens).

### Fix 5 — Item card summary truncates long product names (LOW)

**Problem:** When an item card is collapsed, the summary row shows the product name without a max-width or ellipsis. Names over ~80 characters overflow the header row visually.

**Fix:** Add to `.item-card-summary .item-name` (or the equivalent class in `css/style.css` near line 6650): `max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`. Add `title="{name}"` attribute in the render so hover reveals the full string. CSS-only; no JS change.

### Fix 6 — KP button visually distinct from Save (LOW)

**Problem:** "Сбросить", "Скачать КП", and "💾 Сохранить" in the page header all look identical (grey outlines). The user may not register КП as a separate primary action.

**Fix:** Update the three header buttons (`index.html` lines ~281-282) to:
- "Сохранить" → `btn btn-primary` (filled blue, primary action)
- "Скачать КП" → `btn btn-outline-primary` with prefix icon 📄 (clearly secondary, but related to a download action)
- "Сбросить" → `btn btn-outline-muted` (tertiary, low-visual-weight)

If `btn-outline-primary` or `btn-outline-muted` don't exist, add them to `css/style.css` following the existing `btn-primary` / `btn-outline` pattern.

### Fix 7 — Picker fetch failures show retry, not dead text (MEDIUM)

**Problem:** When the mold or color picker fetch throws, the catch block renders plain red text via inline style (`app.js` lines 1692 and 1764: `<p style="color:var(--red)">...`). The user gets an error message but no way to recover except refreshing the whole page.

**Fix:** Replace the inline red text with a small error card that contains: warning icon, brief message ("Не удалось загрузить молды"), and a "Попробовать снова" button. The retry button re-invokes the same fetch (re-renders the picker fragment). Apply the same pattern to both mold (line 1692) and color (line 1764) error branches. Failure mode is now actionable.

## Code changes

All in one commit chain on branch `calc2-calculator-audit-fixes`, version bumped at the end:

### `index.html`
- Around line 281-282: update header button classes per Fix 6.
- Around line 408: extend `calc-items-add-row` with the inline "или подвес из букв" link per Fix 1.
- Around line 442+: wrap the footer block in `<div class="calc-section calc-section-footer">` per Fix 3.
- Bump version anchors (`id="app-version"`, `CURRENT_HTML_VERSION`).
- Bump `?v=` cache-bust on `js/app.js` and any other modified script.

### `js/app.js`
- In `renderItemBlock()` around line 1692: replace the mold picker catch-block's inline red text with the new error card + retry button (Fix 7).
- In `renderItemBlock()` around line 1755-1764: same pattern for color picker (Fix 7).
- In the picker-open handlers (the functions that respond to user clicking the mold/color trigger to open the dropdown): after rendering the panel, call `panelEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })` and add the viewport-overflow flip-above check (Fix 2).
- In the order-loading flow that runs when the calculator opens an existing order: wrap the fetch in show-loader / hide-loader calls (Fix 4).
- Locate `const APP_VERSION = '...'` and bump.

### `css/style.css`
- Add `.calc-section-footer` rule (Fix 3).
- Add `.item-card-summary .item-name` ellipsis rules (Fix 5).
- Add `.calc-loader` and any spinner styling (Fix 4).
- Add `.btn-outline-primary` and `.btn-outline-muted` if they don't already exist (Fix 6).
- Add `.picker-above` rule for the viewport-flip behavior (Fix 2).

### `js/version.json`
- Bump from current version to the next sequential one. If `calc2-warehouse-ia-cleanup` lands first as v369, this becomes v370. If it lands second, this becomes v369. The plan instructs the implementer to take the current main HEAD's version and add 1.

### Tests
- `tests/version-smoke.js` — must pass after bump.
- `tests/live-site-smoke.mjs` — should pass unchanged (no DOM selectors for buttons we're restyling, no router changes).
- No new smoke tests in this spec — each fix is small enough that manual smoke (Task 8) covers it. If a fix later proves regression-prone, smoke can be added in a follow-up.

## Backwards compat & rollback

- No URL changes. No data changes. No DB changes.
- No cross-module API signature changes. `Calculator.recalculate()`, `Calculator.toJSON()`, item schema, and all hardcoded element IDs are untouched.
- Rollback: `git revert` the merge commit. Risk: low — the changes are CSS/HTML/render-helpers; the actual save/load/pricing pipelines are not modified.

## Testing

### Automated
- `node tests/version-smoke.js` — passes after version bump.
- `node tests/live-site-smoke.mjs` — passes (existing assertions reference Calculator's data/save APIs, not the visual elements being restyled).

### Manual smoke (before merge)
1. Empty calculator: empty state visible, "+ Добавить изделие" and "или подвес из букв" both clickable (Fix 1 baseline).
2. Calculator with one item: the same "+ Добавить изделие" plus inline "или подвес из букв" both visible in the persistent add-row (Fix 1 new behavior).
3. Open mold picker on the last item card (near page bottom): picker auto-scrolls into view; if it would overflow, it flips above (Fix 2).
4. Same for color picker (Fix 2).
5. Open an existing order: brief spinner appears in `calc-items-container`, then items render (Fix 4).
6. Calculator footer visually matches the three numbered sections — same padding, border, header weight, no "old card" feel (Fix 3).
7. Header buttons: "Сохранить" is the primary filled blue, "Скачать КП" is outline-primary with 📄, "Сбросить" is muted outline (Fix 6).
8. Add an item with an artificially long name (paste 200 chars into product name): collapsed summary truncates with ellipsis, hover shows the full name (Fix 5).
9. Simulate a picker fetch failure (DevTools → Network → block warehouse_items): error card with retry button appears; clicking retry re-fetches and renders the picker (Fix 7).
10. Cross-module regression checks (must still work identically):
    - Save the order — order saves, KP downloads correctly (`KPGenerator.generate` still receives the same shape).
    - Open the same order in `#orders` board — appears with correct totals.
    - Open a different page (`#warehouse`) and come back — calculator state restores.

### Both mirrors
After deploy: open `https://calc.recycleobject.ru/#calculator` and `https://calc2.recycleobject.ru/#calculator`, run smoke checks 1-7 on each.

## Out of scope (follow-up sub-projects)

- Larger refactor of `js/calculator.js` (split into smaller files).
- Pendant-from-letters internal UX (the `Pendant` module itself) — only the entry point visibility is changed here.
- KP generation UX — only the trigger button styling is changed here.
- Picker performance improvements (debouncing, prefetch, etc.).
- Auto-save status indicator — `scheduleAutosave()` exists but its UI feedback is out of scope.
- Mobile-specific calculator layout.

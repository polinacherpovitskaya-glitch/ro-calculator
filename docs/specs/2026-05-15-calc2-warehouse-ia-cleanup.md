# Calc 2 Warehouse IA Cleanup

**Date:** 2026-05-15
**Type:** Design spec (sub-project 2 of broader calc2 UX overhaul)
**Status:** Brainstormed, ready for implementation plan
**Target release:** Single push, version `v368` → `v369` (after the menu-cleanup spec lands as `v368`)

## Context

Sub-project 2 of the calc2 UX overhaul started 2026-05-15. Sub-project 1 (sidebar IA cleanup) is in [`docs/specs/2026-05-15-calc2-menu-cleanup.md`](2026-05-15-calc2-menu-cleanup.md).

The Warehouse page (`#warehouse`) currently has 4 toolbar buttons + 6 tabs. Two toolbar buttons duplicate two tab labels:

- "📦 Приёмка из Китая" (top button) and "Приёмки из Китая" (tab) — same destination (`Warehouse.setView('shipments')`).
- "☑ Провести инвентаризацию" (top button) and "☑ Инвентаризация" (tab) — **different functions**, identical label. Top button calls `Warehouse.showAudit()` (opens audit form / starts a new audit). Tab calls `Warehouse.setView('inventory')` (switches to the inventory list view, showing past audits). Same name, very different behavior — primary source of confusion in this module.

Per Polina's brain-dump on 2026-05-15: "сверху почему-то есть кнопка приёмки из Китая, снизу есть приёмки из Китая ... Проверить инвентаризацию здесь: инвентаризация там. В общем, всё супер неудобно". The Warehouse module is also her "самая большая проблема" — ~8000 lines of `js/warehouse.js`, 11 Supabase tables, 9 modules cross-reference its API. So this spec is **deliberately small** — only IA cleanup, no behavior changes.

## Goals

- Remove the two duplicate toolbar buttons.
- Inside the Inventory tab, surface a primary "+ Новая инвентаризация" CTA so users don't need a top button to start an audit.
- Result: top toolbar shrinks from 4 buttons to 2; tab labels remain unique; "start a new audit" is one click from the Inventory tab instead of a separate top-bar shortcut.

## Non-goals

- Not touching the China receipt form (`showNewShipmentForm`, `editShipment`, `saveShipment`, `recalcShipment`).
- Not touching the audit form (`showAudit`, `renderAuditTable`, `submitAudit`, `_loadAuditDraft`, `_updateAuditSummary`).
- Not trimming the 8 stats cards.
- Not touching filters (Категория / Наличие / Сортировка / Поиск).
- Not changing fonts, spacing, or row-click behavior (cross-cutting UX polish is a separate sub-project; will be informed by real Женя/Тая feedback).
- Not touching any other tab content (Таблица, Фурнитура для проектов, 📦 Готовая продукция, История движений).
- No data migration. No Supabase schema changes. No table renames.
- No changes to cross-module APIs (`Warehouse.getAvailableQty`, `buildPickerOptions`, `handlePickerSelect`, etc., consumed by `orders.js`, `china.js`, `marketplaces.js`, `molds.js`, `production_plan.js`).

## Disposition per UI element

| Element | Decision | Rationale |
|---|---|---|
| Top button "📦 Приёмка из Китая" (`index.html:1910`) | **Remove** | Duplicates the Shipments tab. Tab content already has "+ Новая приёмка" inline. |
| Top button "↕ Импорт CSV" (`index.html:1911`) | Keep | Unique action, no duplicate. |
| Top button "☑ Провести инвентаризацию" (`index.html:1912`) | **Remove** | Duplicates the Inventory tab label and creates the "same name, different function" confusion. Replaced by inline CTA. |
| Top button "+ Новая позиция" (`index.html:1913`) | Keep | Unique primary action for the Table view. |
| 6 tabs (Таблица, Фурнитура для проектов, Приёмки из Китая, 📦 Готовая продукция, ☑ Инвентаризация, История движений) | Keep all unchanged | Names, order, and `data-tab` slugs stay. |
| `renderInventoryView()` populated state (`js/warehouse.js:1488`) | **Add primary "+ Новая инвентаризация" button** at top of the audit-cards list. Calls `Warehouse.showAudit()`. | Provides the entry point that the removed top button used to provide, in the place where the user is already looking for it. |
| `renderInventoryView()` empty state (`js/warehouse.js:1479`) | Keep existing button "☑ Провести первую инвентаризацию" | The empty-state copy is intentionally different ("первую"); no change needed. |
| 8 stats cards | Keep all unchanged | Out of scope; trimming is a separate decision. |
| Filters card | Keep unchanged | Out of scope. |

## Code changes

All in one commit, version bumped to `v369`:

### `index.html`
- Line 1910: remove the entire `<button>` for "📦 Приёмка из Китая".
- Line 1912: remove the entire `<button>` for "☑ Провести инвентаризацию".
- Lines 1909-1914 — the `<div class="flex gap-8">` toolbar should end up containing only:
  - "↕ Импорт CSV" → `Warehouse.showImport()`
  - "+ Новая позиция" → `Warehouse.showAddForm()`

### `js/warehouse.js`
- In `renderInventoryView()` around line 1488, change the populated-state HTML so it prepends a primary action button before the audit list:

  Before:
  ```js
  container.innerHTML = `<div class="wh-inventory-list">
      ${audits.map(...).join('')}
  </div>`;
  ```

  After:
  ```js
  container.innerHTML = `
      <div style="margin-bottom:12px;">
          <button class="btn btn-primary" onclick="Warehouse.showAudit()">+ Новая инвентаризация</button>
      </div>
      <div class="wh-inventory-list">
          ${audits.map(...).join('')}
      </div>`;
  ```

- No other changes. `showAudit()`, `showImport()`, `showAddForm()`, `setView()`, `editShipment()`, `submitAudit()`, and all internal helpers untouched.

### Version anchors (4 places, same pattern as menu-cleanup spec)
- `js/version.json`: `v368` → `v369`.
- `js/app.js`: locate `const APP_VERSION = '...'` (currently line 5) and bump to `v369`.
- `index.html` line 10: `const CURRENT_HTML_VERSION = 'v369';`.
- `index.html` line 190 area: sidebar `<span id="app-version">v369</span>`.
- Bump `?v=` cache-bust suffixes on `js/warehouse.js` script tag.

### Tests
- `tests/version-smoke.js` — must pass after the bump.
- `tests/warehouse-migration-smoke.js` — verifies data behavior, not UI selectors. Spot-check; expected to pass unchanged.
- `tests/live-site-smoke.mjs` — verified clean: only references `Warehouse.setView('shipments', { force: true })` via the JS API at line 315, no DOM selector asserts the removed buttons. No update needed.

## Backwards compat & rollback

- No URL changes (no hash routes added or removed).
- No data changes (no rows touched in any Supabase table).
- No API changes (cross-module callers of `Warehouse.*` see the same surface).
- Rollback: `git revert` the cleanup commit. Risk: zero — pure UI removal + inline button addition.
- Both `calc.recycleobject.ru` and `calc2.recycleobject.ru` deploy from `main`, so both pick up the cleanup simultaneously.

## Testing

### Automated
- `node tests/version-smoke.js` — passes.
- `node tests/warehouse-migration-smoke.js` — passes (data invariants unchanged).
- `node tests/live-site-smoke.mjs` — passes (after any text-assertion updates).

### Manual smoke (before merge)
1. Top toolbar shows exactly 2 buttons: "↕ Импорт CSV" and "+ Новая позиция".
2. Click tab "Приёмки из Китая" — list of shipments + "+ Новая приёмка" button at top (unchanged).
3. Click tab "☑ Инвентаризация" with at least one past audit — list of audit cards + new "+ Новая инвентаризация" button at the top of the list.
4. Click "+ Новая инвентаризация" — audit form opens (identical to old top-button behavior).
5. Click tab "☑ Инвентаризация" with no past audits — empty state with "☑ Провести первую инвентаризацию" button (unchanged).
6. Cross-module regression: open an order, open the hardware picker — picker still pulls warehouse stock and shows availability identically.
7. Both mirrors (`calc.recycleobject.ru`, `calc2.recycleobject.ru`) show `v369` in the sidebar.
8. Other 4 tabs (Таблица, Фурнитура для проектов, 📦 Готовая продукция, История движений) load and behave identically to before.

## Out of scope (follow-up sub-projects)

Each becomes its own design → plan → implementation cycle.

- Workflow improvements to the China receipt form (`showNewShipmentForm`, `editShipment`) — wait for concrete feedback from Женя/Тая.
- Workflow improvements to the audit form (`showAudit`, `renderAuditTable`) — same trigger.
- Stats card trimming (8 → fewer) — needs Polina's signal on which are worth keeping.
- Cross-cutting UX polish: larger fonts, less cramped rows, inline-expand for warehouse table rows. Will roll up multiple modules at once.
- Settings dedup audit (already on the queue from menu-cleanup spec).
- Other Warehouse tab redesigns (Готовая продукция, Фурнитура для проектов, История движений) — only if specific complaints surface.
- Investigation: clarify what Polina meant by "поле Китай отдельное" and "слева какие-то импорты" in her brain-dump — neither was visible on the Warehouse page itself; might be on `#china` page or a different module.

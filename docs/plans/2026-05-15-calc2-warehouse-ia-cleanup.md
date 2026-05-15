# Calc 2 Warehouse IA Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 2 duplicate toolbar buttons on the Warehouse page and add a primary "+ Новая инвентаризация" CTA inside the Inventory tab — pure IA cleanup, no behavior changes.

**Architecture:** Vanilla JS, no bundler. Edit `index.html` (toolbar markup) and `js/warehouse.js` (one renderer to add a button). Bump 4 version anchors. Existing smoke tests cover regression. Single push, version `v368` → `v369`.

**Tech Stack:** vanilla JS, plain HTML, Node + Playwright smokes, GitHub Actions deploy to Vercel + Yandex Object Storage.

**Spec:** [`docs/specs/2026-05-15-calc2-warehouse-ia-cleanup.md`](../specs/2026-05-15-calc2-warehouse-ia-cleanup.md).

**Branch:** `calc2-warehouse-ia-cleanup` (already created from `main`, spec already committed).

**Sequencing note:** This sub-project is independent of the prior menu-cleanup branch (`calc2-menu-cleanup`). Both branched off `main`. If menu-cleanup lands first and bumps to `v368`, this plan lands `v369`. If they land in the opposite order, swap the version numbers in Task 3 (the spec assumes menu-cleanup-first).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `index.html` | Warehouse page-header toolbar; version anchors | Modify — drop 2 `<button>` elements; bump version placeholders |
| `js/warehouse.js` | Inventory tab renderer (`renderInventoryView`); module-level constant for `?v=` cache-bust | Modify — prepend "+ Новая инвентаризация" button to populated-state HTML |
| `js/app.js` | `APP_VERSION` constant | Modify — bump version |
| `js/version.json` | Version anchor for cache-busting | Modify — bump |
| `tests/version-smoke.js` | Cross-version invariant check | No edit — must pass after bump |
| `tests/warehouse-migration-smoke.js` | Warehouse data invariants | No edit — should pass unchanged |
| `tests/live-site-smoke.mjs` | Live e2e | No edit — verified at line 315 there are no DOM selectors for the removed buttons |

No new files.

---

## Task 1: Remove the 2 duplicate top-toolbar buttons

Pure HTML deletion. Both buttons' functions remain reachable via the existing tabs (Приёмки из Китая) and the new inline CTA from Task 2 (Инвентаризация).

**Files:**
- Modify: `index.html` lines 1907-1915 (page-warehouse `<div class="page-header">` block)

- [ ] **Step 1: Open `index.html` and locate the warehouse page-header**

Find the block at lines 1907-1915. It currently reads:

```html
<div class="page-header">
    <h1>Склад фурнитуры</h1>
    <div class="flex gap-8">
        <button class="btn btn-outline" onclick="Warehouse.setView('shipments')" style="background:rgba(251,191,36,0.1);border-color:rgba(251,191,36,0.5);color:#92400e;font-weight:600;">&#128230; Приёмка из Китая</button>
        <button class="btn btn-outline" onclick="Warehouse.showImport()">&#8645; Импорт CSV</button>
        <button class="btn btn-outline" onclick="Warehouse.showAudit()">&#9745; Провести инвентаризацию</button>
        <button class="btn btn-primary" onclick="Warehouse.showAddForm()">+ Новая позиция</button>
    </div>
</div>
```

- [ ] **Step 2: Replace it with the cleaned version**

Delete the "Приёмка из Китая" button (line 1910) and the "Провести инвентаризацию" button (line 1912). The block becomes:

```html
<div class="page-header">
    <h1>Склад фурнитуры</h1>
    <div class="flex gap-8">
        <button class="btn btn-outline" onclick="Warehouse.showImport()">&#8645; Импорт CSV</button>
        <button class="btn btn-primary" onclick="Warehouse.showAddForm()">+ Новая позиция</button>
    </div>
</div>
```

- [ ] **Step 3: Manual smoke**

Reload the warehouse page locally (e.g. `python3 -m http.server 8000` then `http://localhost:8000/#warehouse`). Verify:
- Top toolbar shows exactly 2 buttons: "↕ Импорт CSV" and "+ Новая позиция".
- The Shipments tab still works — click it, see the shipments list with "+ Новая приёмка" button (already inside the tab content, untouched).
- The Inventory tab still works — click it, see the audit list (no top button to start a new audit yet — that's added in Task 2).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Remove duplicate top toolbar buttons on Warehouse page

Drops "Приёмка из Китая" (duplicates Shipments tab) and
"Провести инвентаризацию" (duplicates Inventory tab label while
opening a different function — biggest source of confusion).
Top toolbar now has only Импорт CSV and + Новая позиция.

Inventory entry-point CTA is added inside the Inventory tab in the
next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add "+ Новая инвентаризация" CTA inside the Inventory tab

JS-only change. Touches one function: `renderInventoryView()` populated-state branch.

**Files:**
- Modify: `js/warehouse.js` line 1488 (inside `renderInventoryView`, populated branch)

- [ ] **Step 1: Open `js/warehouse.js` and locate `renderInventoryView`**

Find the function starting at line 1464. The relevant block is at lines 1488-1494:

```js
container.innerHTML = `<div class="wh-inventory-list">
    ${audits.map((audit, index) => this._renderInventoryAuditCard(
        audit,
        index === 0,
        mutationContexts.get(Number(audit && audit.id || 0)) || null
    )).join('')}
</div>`;
```

- [ ] **Step 2: Prepend the new action button**

Replace the block with:

```js
container.innerHTML = `
    <div style="margin-bottom:12px;">
        <button class="btn btn-primary" onclick="Warehouse.showAudit()">+ Новая инвентаризация</button>
    </div>
    <div class="wh-inventory-list">
        ${audits.map((audit, index) => this._renderInventoryAuditCard(
            audit,
            index === 0,
            mutationContexts.get(Number(audit && audit.id || 0)) || null
        )).join('')}
    </div>`;
```

The empty-state branch (lines 1478-1485) is left untouched — it already has its own "☑ Провести первую инвентаризацию" button, intentionally worded with "первую" for the first-time experience.

- [ ] **Step 3: Manual smoke (populated state)**

In the browser, navigate to `#warehouse`, click the "☑ Инвентаризация" tab. With at least one past audit:
- Top of the inventory area shows a primary button "+ Новая инвентаризация".
- Click it — the audit form opens (same as the old top-button behavior).
- Cancel/close the form — return to the inventory list, button still there.

- [ ] **Step 4: Manual smoke (empty state)**

If you can reach a Supabase environment with no audits in `warehouse_history` (or a local stub), verify the empty state still shows "Инвентаризаций пока нет" + "☑ Провести первую инвентаризацию" button (unchanged). If you can't easily reach an empty state, confirm by reading lines 1478-1485 that the empty branch is unchanged.

- [ ] **Step 5: Commit**

```bash
git add js/warehouse.js
git commit -m "$(cat <<'EOF'
Add inline + Новая инвентаризация CTA inside Inventory tab

Replaces the removed top-bar shortcut with an in-context action
button at the top of the audit-cards list. Calls the same
Warehouse.showAudit() the old top button used. Empty-state copy
("первую инвентаризацию") is intentionally unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bump version `v368` → `v369`

Four anchors must be updated in sync (enforced by `tests/version-smoke.js`). Same pattern as the menu-cleanup spec.

**Files:**
- Modify: `js/version.json`
- Modify: `js/app.js` (locate `const APP_VERSION = '...'`, currently line 5)
- Modify: `index.html` (locate `const CURRENT_HTML_VERSION = '...'` early bootstrap; locate sidebar `<span id="app-version">`)
- Modify: `index.html` (cache-bust `?v=` suffix on `<script src="js/warehouse.js?v=...">`)

- [ ] **Step 1: Update `js/version.json`**

Replace contents with:

```json
{
  "version": "v369"
}
```

(If menu-cleanup landed first, the file is already at `v368`. If it didn't, the file may show `v367` — bump from whatever the current value is.)

- [ ] **Step 2: Update `APP_VERSION` in `js/app.js`**

Find `const APP_VERSION = '...'` (currently line 5). Set:

```js
const APP_VERSION = 'v369';
```

- [ ] **Step 3: Update `CURRENT_HTML_VERSION` in `index.html`**

Find `const CURRENT_HTML_VERSION = '...'` (currently line 10). Set:

```js
const CURRENT_HTML_VERSION = 'v369';
```

- [ ] **Step 4: Update sidebar version placeholder in `index.html`**

Find `<span id="app-version">` (currently line 190). Set:

```html
<span>Калькулятор <span id="app-version">v369</span></span>
```

- [ ] **Step 5: Bump `?v=` cache-bust on warehouse script**

In `index.html`, find the `<script src="js/warehouse.js?v=N">` tag and bump `N` by 1 (so the browser refetches the modified file). The other modified file is `index.html` itself, which is non-cacheable per the Yandex sync workflow — no per-script bump needed for it.

- [ ] **Step 6: Run version smoke**

```bash
node tests/version-smoke.js
```

Expected: passes — all four version anchors are now `v369`. If it fails, the failure message will name which anchor is mismatched; fix that one.

- [ ] **Step 7: Commit**

```bash
git add js/version.json js/app.js index.html
git commit -m "$(cat <<'EOF'
Bump version v368 -> v369

Final commit of the warehouse IA cleanup. Bumps all 4 version
anchors in sync (js/version.json, APP_VERSION, CURRENT_HTML_VERSION,
sidebar placeholder) plus warehouse.js cache-bust suffix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Push, verify deploy, run regression smokes

- [ ] **Step 1: Run warehouse migration smoke locally**

```bash
node tests/warehouse-migration-smoke.js
```

Expected: passes. This smoke is data-shaped, so the IA changes shouldn't affect it. If it fails, the failure is unrelated to this work — investigate before pushing.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin calc2-warehouse-ia-cleanup
```

- [ ] **Step 3: Open PR or fast-merge to main**

Per Polina's flow: open a PR for review, or fast-merge to `main` if approved offline. Don't force-push to main.

- [ ] **Step 4: Watch CI on the merge commit**

GitHub Actions runs in this order:
1. `Deploy GitHub Pages` → Vercel
2. `Yandex static sync` → Yandex Object Storage
3. `Live site smoke` → Playwright against `calc.recycleobject.ru`
4. `Yandex mirror smoke` → Playwright against `calc2.recycleobject.ru`

All four must go green. If any fails, fix forward (don't revert blindly).

- [ ] **Step 5: Manual end-to-end verification on both mirrors**

Open `https://calc.recycleobject.ru/#warehouse` and `https://calc2.recycleobject.ru/#warehouse`:

1. Both mirrors show `v369` in the sidebar version placeholder.
2. Top toolbar has exactly 2 buttons: "↕ Импорт CSV" and "+ Новая позиция".
3. Tab "Приёмки из Китая" — list of past shipments + "+ Новая приёмка" button (unchanged).
4. Tab "☑ Инвентаризация" with at least one past audit — "+ Новая инвентаризация" button at the top + audit list below.
5. Click "+ Новая инвентаризация" — audit form opens identically to before.
6. Tab "☑ Инвентаризация" with no past audits (if findable) — empty-state with "☑ Провести первую инвентаризацию" (unchanged).
7. Other 4 tabs (Таблица, Фурнитура для проектов, 📦 Готовая продукция, История движений) load identically to before.
8. Open an order on `#orders`, use the hardware picker — picker pulls warehouse stock and shows availability identically (cross-module regression check).
9. The 8 stats cards all show real values (not zeros, not stale).

- [ ] **Step 6: Mark plan complete**

This task is "done" when both mirrors show `v369`, all 9 manual checks above pass, and CI is green. Notify Polina with: "Warehouse IA cleanup live, v369. Top bar shrunk from 4 to 2, Inventory tab has the new + Новая инвентаризация CTA. Зеркала зелёные."

---

## Self-Review

**Spec coverage:**
- "Remove top button Приёмка из Китая" → Task 1 Step 2.
- "Remove top button Провести инвентаризацию" → Task 1 Step 2.
- "Add primary + Новая инвентаризация in Inventory tab populated state" → Task 2 Step 2.
- "Empty-state button unchanged" → Task 2 Step 4.
- "Bump version in 4 places" → Task 3 Steps 1-4.
- "Bump cache-bust on warehouse.js script tag" → Task 3 Step 5.
- "Run version-smoke, warehouse-migration-smoke" → Task 3 Step 6, Task 4 Step 1.
- "Manual smoke checklist (8 items)" → Task 4 Step 5 (extends to 9 with the cross-module picker check).
- "No behavior, data, API changes" → confirmed — no JS function bodies are altered, only `renderInventoryView` HTML output is prepended.
- "Both mirrors verify" → Task 4 Step 5.

**Placeholder scan:** No "TBD"/"TODO" / vague directives. All steps have exact code or commands.

**Type/symbol consistency:**
- `Warehouse.showAudit()` — referenced consistently as the function called by both the (removed) top button and the new inline button.
- `Warehouse.showImport()`, `Warehouse.showAddForm()`, `Warehouse.setView('shipments')` — referenced as existing functions, not modified.
- Version `v369` used consistently across Tasks 1-4. The "menu-cleanup landed first" assumption is stated explicitly in the header.
- No new symbols introduced that aren't defined in the codebase.

Plan ready for execution.

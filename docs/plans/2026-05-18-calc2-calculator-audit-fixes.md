# Calc 2 Calculator Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 7 calculator UX fixes from the 2026-05-18 audit as one push.

**Architecture:** Vanilla JS, no bundler. Edit `index.html` (header buttons, add-row, footer wrap), `js/app.js` (picker handlers, loadOrder, picker error fallbacks), `css/style.css` (calc-section-footer, ellipsis, loader, button variants, picker-above). Bump 4 version anchors. Existing smokes cover regression.

**Tech Stack:** vanilla JS, plain HTML/CSS, Node + Playwright smokes, GitHub Actions deploy.

**Spec:** [`docs/specs/2026-05-18-calc2-calculator-audit-fixes.md`](../specs/2026-05-18-calc2-calculator-audit-fixes.md).

**Branch:** `calc2-calculator-audit-fixes` (already created from `origin/main`, spec already committed as `50879e0`).

**Version sequencing:** Bump from whatever `js/version.json` shows on `origin/main` at execution time. Menu-cleanup landed as v368. If warehouse-IA-cleanup lands before this branch, base is v369 → this becomes v370. If this branch lands first, base is v368 → this becomes v369. Tasks below say "next version" — the implementer reads current and adds 1.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `index.html` | Header buttons, items add-row, footer wrap, version anchors | Modify across tasks 1, 2, 4, 8 |
| `css/style.css` | New utility classes for footer/loader/ellipsis/buttons/picker-above | Modify across tasks 2, 3, 4, 5, 6 |
| `js/app.js` | Picker handlers, loadOrder loader, picker error fallback, APP_VERSION | Modify across tasks 5, 6, 7, 8 |
| `js/version.json` | Version anchor | Modify in task 8 |
| `tests/version-smoke.js` | Cross-version invariant | No edit — must pass |
| `tests/live-site-smoke.mjs` | Live e2e | No edit — verified to use API selectors, not changed DOM |

No new files.

---

## Task 1: Fix 1 — Pendant-from-letters link in persistent add-row

Smallest, safest change. Adds a secondary inline link to the existing add-row so the pendant entry point is always discoverable.

**Files:**
- Modify: `index.html` around line 408 (the `calc-items-add-row` block visible when items exist)

- [ ] **Step 1: Locate the persistent add-row in `index.html`**

Find the block at lines ~405-412 (search for `calc-items-add-row`). It currently contains a "+ Добавить изделие" button and possibly an existing pendant link only inside the empty-state branch nearby.

- [ ] **Step 2: Add the secondary pendant link**

Inside `calc-items-add-row`, immediately after the "+ Добавить изделие" button, add:

```html
<a href="javascript:void(0)" onclick="Pendant.addPendantToCalculator()" class="calc-pendant-link" style="margin-left:12px;font-size:13px;color:var(--text-secondary);text-decoration:underline;">или подвес из букв</a>
```

(Use the same handler name that the empty-state version calls. If the empty-state uses a different handler, e.g. `Calculator.addPendant()`, use that one — read the empty-state markup at lines ~395-400 and copy its `onclick` exactly.)

- [ ] **Step 3: Manual smoke**

Reload `#calculator`. Empty state: pendant link still works as before. Add one item: pendant link is now also visible in the add-row alongside "+ Добавить изделие". Click it — pendant flow opens.

- [ ] **Step 4: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add index.html
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Surface pendant-from-letters link in persistent add-row

Previously the "или подвес из букв" entry point lived only in the
empty-state add-row, so users with existing items couldn't easily
add a pendant. Adds the same link to the always-visible add-row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fix 6 — Header button hierarchy

Make Сохранить primary, КП outline-primary, Сбросить muted. Pure CSS class swap, may need 2 new btn variants.

**Files:**
- Modify: `index.html` lines ~281-282 (the page-header action buttons)
- Modify: `css/style.css` (add `.btn-outline-primary` and `.btn-outline-muted` if missing)

- [ ] **Step 1: Verify which btn classes exist**

```bash
grep -nE "\.btn-(primary|outline|outline-primary|outline-muted)\s*\{" /tmp/ro-calc-calculator-fixes/css/style.css
```

Expected: `.btn-primary` and `.btn-outline` exist. `.btn-outline-primary` and `.btn-outline-muted` may not.

- [ ] **Step 2: Add missing CSS variants**

In `css/style.css`, find the existing `.btn-outline` rule. After it, add (only the ones missing):

```css
.btn-outline-primary {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
}
.btn-outline-primary:hover {
    background: var(--accent);
    color: white;
}
.btn-outline-muted {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
}
.btn-outline-muted:hover {
    background: var(--bg-muted);
}
```

- [ ] **Step 3: Update header buttons in `index.html`**

Find lines ~281-282 (the calculator page-header buttons). They currently look something like:

```html
<button class="btn btn-outline" onclick="Calculator.reset()">Сбросить</button>
<button class="btn btn-outline" onclick="KP.download()">Скачать КП</button>
<button class="btn btn-outline" onclick="Calculator.save()">💾 Сохранить</button>
```

(Exact handlers/text may differ; preserve them.) Replace the classes only:

```html
<button class="btn btn-outline-muted" onclick="Calculator.reset()">Сбросить</button>
<button class="btn btn-outline-primary" onclick="KP.download()">📄 Скачать КП</button>
<button class="btn btn-primary" onclick="Calculator.save()">💾 Сохранить</button>
```

- [ ] **Step 4: Manual smoke**

Reload `#calculator`. Header now has clear visual hierarchy: Сохранить is filled blue, Скачать КП is blue outline with 📄 icon, Сбросить is muted/grey outline.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add index.html css/style.css
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Give calculator header buttons a clear hierarchy

Save is the primary action (filled blue), KP download is secondary
(outline-primary with file icon), Reset is tertiary (muted). Replaces
the previous all-identical-grey trio that made KP look like a Save
variant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Fix 5 — Item card summary name ellipsis

CSS-only. Adds max-width + ellipsis to the collapsed item card's name field.

**Files:**
- Modify: `css/style.css` around line 6650 (`.item-card-summary` rules) or wherever the summary classes live

- [ ] **Step 1: Locate the summary CSS**

```bash
grep -n "item-card-summary\|item-name" /tmp/ro-calc-calculator-fixes/css/style.css | head -10
```

Identify the rule that styles the name span inside `.item-card-summary`. If a dedicated `.item-name` rule doesn't exist, target via descendant selector.

- [ ] **Step 2: Add ellipsis rules**

Add (or extend) in `css/style.css`:

```css
.item-card-summary .item-name {
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
}
```

- [ ] **Step 3: Add `title` attribute in the JS render**

Find the render function that emits the summary HTML (search `item-card-summary` in `js/app.js`). The element that contains the product name should have `title="${name}"` so hover reveals the full string. Example before:

```js
`<span class="item-name">${escape(item.product_name)}</span>`
```

After:

```js
`<span class="item-name" title="${escape(item.product_name)}">${escape(item.product_name)}</span>`
```

(Use the existing escape helper used elsewhere in the same render function.)

- [ ] **Step 4: Manual smoke**

Add or edit an item. In product name, paste 200 characters of text. Collapse the card. Summary shows truncated name with ellipsis; hovering shows the full name in browser tooltip.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add css/style.css js/app.js
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Truncate long product names in collapsed item summary

Adds max-width + ellipsis to .item-card-summary .item-name and a
title attribute so the full name is visible on hover. Prevents
80+ char product names from overflowing the card header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fix 3 — Footer adopts .calc-section styling

Wrap the footer block in the same visual container as the three numbered sections above it.

**Files:**
- Modify: `index.html` around line 442+ (the totals/discount/buttons block)
- Modify: `css/style.css` — add `.calc-section-footer` rule

- [ ] **Step 1: Locate the existing footer block**

In `index.html` find the block starting around line 442. It will look something like:

```html
<div class="card" style="margin-top:24px;...">
    <!-- totals, discount toggle, action buttons -->
</div>
```

- [ ] **Step 2: Wrap in calc-section structure**

Replace the outer wrapper with the matched-style structure:

```html
<div class="calc-section calc-section-footer">
    <div class="calc-section-header">
        <h3 class="calc-section-title">Итог</h3>
    </div>
    <div class="calc-section-body">
        <!-- existing totals, discount toggle, action buttons content -->
    </div>
</div>
```

(Preserve all existing inner content — totals markup, discount toggle, action buttons. Only swap the outer wrapper and the header.)

- [ ] **Step 3: Add CSS rule for footer variant**

In `css/style.css` near the `.calc-section` rule (search `.calc-section\s*{`), add:

```css
.calc-section-footer {
    margin-top: 24px;
}
.calc-section-footer .calc-section-header {
    /* no number badge, just the title */
    padding-left: 16px;
}
.calc-section-footer .calc-section-title {
    /* match the other section titles */
}
```

(If `.calc-section-header` already has padding, you may not need to override. Trial in browser and adjust.)

- [ ] **Step 4: Manual smoke**

Reload `#calculator`. The footer now visually matches the three numbered sections above it: same border, same padding, same header weight. There is no number badge (it's a summary block, not an input section).

- [ ] **Step 5: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add index.html css/style.css
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Wrap calculator footer in .calc-section styling

Footer (totals + discount + actions) now uses the same .calc-section
container as the three numbered sections above. Drops the legacy
.card wrapper that broke visual continuity. No content/logic changes
inside — just the outer structure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Fix 2 — Picker scrollIntoView + flip-above

JS-only behavior added at picker open time. Plus a CSS class for the above-trigger position.

**Files:**
- Modify: `js/app.js` — find the picker-open handlers
- Modify: `css/style.css` — add `.picker-above` rule

- [ ] **Step 1: Locate picker-open handlers**

The mold picker is rendered in `renderItemBlock()` around line 1692. The color picker around line 1755. Find the function that responds to user clicking the trigger to open the dropdown. It likely toggles a visible class on the picker element, e.g. `pickerEl.classList.add('is-open')` or `pickerEl.style.display = 'block'`.

Grep helpers:

```bash
grep -nE "picker.*open|mold-picker|color-picker" /tmp/ro-calc-calculator-fixes/js/app.js | head -15
```

- [ ] **Step 2: Add scrollIntoView and flip logic after open**

In each picker-open handler, immediately after the code that makes the picker visible, add:

```js
// Auto-scroll picker into view; flip above trigger if it would overflow.
const rect = pickerEl.getBoundingClientRect();
const viewportBottom = window.innerHeight;
if (rect.bottom > viewportBottom) {
    pickerEl.classList.add('picker-above');
} else {
    pickerEl.classList.remove('picker-above');
}
pickerEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
```

- [ ] **Step 3: Add `.picker-above` CSS rule**

In `css/style.css`, near the picker styles (search for the existing mold/color picker class), add:

```css
.picker-above {
    bottom: 100% !important;
    top: auto !important;
    margin-bottom: 4px;
}
```

- [ ] **Step 4: Manual smoke**

Open `#calculator`, add at least 3 items so the last one is near or below the fold. Expand the bottom item. Click to open the mold picker — picker is brought into view and, if it would overflow, opens upward. Same for color picker.

- [ ] **Step 5: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add js/app.js css/style.css
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Bring picker dropdowns into view when opened

Mold and color picker dropdowns now scrollIntoView({block:'nearest'})
on open, and flip above the trigger when they would overflow the
viewport bottom. Fixes the "picker opens off-screen below the fold"
issue on the last item card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Fix 4 — Loading spinner when opening an existing order

Show a loader inside `calc-items-container` while `Calculator.loadOrder(orderId)` runs.

**Files:**
- Modify: `js/app.js` — `Calculator.loadOrder` around line 5470
- Modify: `css/style.css` — add `.calc-loader` styles

- [ ] **Step 1: Add CSS for the loader**

In `css/style.css`, add:

```css
.calc-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-muted);
    font-size: 14px;
}
.calc-loader-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--bg-muted);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: calc-loader-spin 0.8s linear infinite;
    margin-bottom: 12px;
}
@keyframes calc-loader-spin {
    to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Patch `Calculator.loadOrder` to show/hide the loader**

In `js/app.js` line ~5470, locate:

```js
async loadOrder(orderId) {
    const data = await loadOrder(orderId);
    // ... existing rendering logic
}
```

Wrap the fetch in show/hide loader calls:

```js
async loadOrder(orderId) {
    const itemsContainer = document.getElementById('calc-items-container');
    if (itemsContainer) {
        itemsContainer.innerHTML = `
            <div class="calc-loader">
                <div class="calc-loader-spinner"></div>
                <div>Загружаем заказ…</div>
            </div>`;
    }
    try {
        const data = await loadOrder(orderId);
        // ... existing rendering logic that fills items into itemsContainer
        return data;
    } catch (err) {
        if (itemsContainer) {
            itemsContainer.innerHTML = `<div class="calc-loader" style="color:var(--red)">Не удалось загрузить заказ. Перезагрузите страницу.</div>`;
        }
        throw err;
    }
}
```

(Preserve the existing rendering code that runs after the fetch — it will replace the loader content naturally when it writes to `itemsContainer`.)

- [ ] **Step 3: Manual smoke**

Open `#orders`, click any existing order to navigate to its calculator. Briefly see the spinner + "Загружаем заказ…" text; then items render. Open a fresh `#calculator` (no order ID) — no spinner appears (loader only fires when there's an orderId).

- [ ] **Step 4: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add js/app.js css/style.css
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Show loader spinner while opening an existing order

Calculator.loadOrder now renders a centered spinner + "Загружаем
заказ…" text inside calc-items-container while the Supabase fetch
is in flight. On error, shows a red recovery message. Fresh calc
opens (no orderId) are unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Fix 7 — Picker fetch failures show retry card

Replace the inline red `<p>` in picker catch blocks with a small actionable error card.

**Files:**
- Modify: `js/app.js` lines 1692 and 1764 (mold and color picker catch blocks)

- [ ] **Step 1: Read both catch blocks to confirm structure**

```bash
sed -n '1680,1710p' /tmp/ro-calc-calculator-fixes/js/app.js
sed -n '1750,1770p' /tmp/ro-calc-calculator-fixes/js/app.js
```

Both blocks currently look like:

```js
try {
    // ... fetch + render picker HTML
} catch (err) {
    console.error('[renderItemBlock] Mold picker error:', err);
    moldPickerHtml = '<p style="color:var(--red);...">...</p>';
}
```

- [ ] **Step 2: Define a small helper for the error card**

Near the top of `renderItemBlock()` (or just above the try/catch), define:

```js
const pickerErrorCard = (label, retryHandler) => `
    <div class="picker-error-card" style="padding:12px;border:1px solid var(--red);background:rgba(239,68,68,0.05);border-radius:6px;color:var(--text-primary);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;">⚠</span>
            <span style="font-weight:600;">${label}</span>
        </div>
        <button class="btn btn-outline" onclick="${retryHandler}">Попробовать снова</button>
    </div>`;
```

- [ ] **Step 3: Use the helper in both catch blocks**

For the mold picker (line ~1692):

```js
} catch (err) {
    console.error('[renderItemBlock] Mold picker error:', err);
    moldPickerHtml = pickerErrorCard('Не удалось загрузить молды', `Calculator.refreshItemPicker(${idx}, 'mold')`);
}
```

For the color picker (line ~1764):

```js
} catch (err) {
    console.error('[renderItemBlock] Color picker error:', err);
    colorPickerHtml = pickerErrorCard('Не удалось загрузить цвета', `Calculator.refreshItemPicker(${idx}, 'color')`);
}
```

- [ ] **Step 4: Add `Calculator.refreshItemPicker(idx, kind)` helper**

In the Calculator object, add a small method:

```js
refreshItemPicker(idx, kind) {
    // Re-render just this item block so the picker is re-attempted.
    this.renderItemBlock(idx);
},
```

(If `renderItemBlock` is a top-level function rather than a method, call it directly. Read the actual signature and adapt.)

- [ ] **Step 5: Manual smoke**

In DevTools → Network, block requests to `warehouse_items` (or similar Supabase URL the mold picker fetches). Reload `#calculator`, add an item. The mold picker shows the error card with a Попробовать снова button. Unblock the request, click the button — picker re-fetches and renders normally. Same for color picker (block colors table fetch).

- [ ] **Step 6: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add js/app.js
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Make picker fetch failures actionable with retry

Replace the inline red <p> in mold and color picker catch blocks
with a small error card that shows a Попробовать снова button.
Button calls Calculator.refreshItemPicker(idx, kind) which
re-renders the item block to re-attempt the fetch. Users now have
a clear recovery path instead of needing to refresh the page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Version bump

Bump version anchors in sync. Read current main version first.

**Files:**
- Modify: `js/version.json`
- Modify: `js/app.js` — `const APP_VERSION = '...'`
- Modify: `index.html` — `CURRENT_HTML_VERSION` and `<span id="app-version">`

- [ ] **Step 1: Read current version on main**

```bash
git -C /tmp/ro-calc-calculator-fixes fetch origin main
git -C /tmp/ro-calc-calculator-fixes show origin/main:js/version.json
```

Note the version (e.g. `v368` or `v369` depending on warehouse-IA-cleanup landing order). Call this `<NEW>` = read-value + 1.

- [ ] **Step 2: Update `js/version.json`**

```json
{
  "version": "<NEW>"
}
```

- [ ] **Step 3: Update `APP_VERSION` in `js/app.js`**

Find `const APP_VERSION = '...'` (line 5). Set to `<NEW>`.

- [ ] **Step 4: Update `CURRENT_HTML_VERSION` in `index.html`**

Find `const CURRENT_HTML_VERSION = '...'` (line 10). Set to `<NEW>`.

- [ ] **Step 5: Update sidebar version placeholder in `index.html`**

Find `<span id="app-version">` (line 190). Set inner text to `<NEW>`.

- [ ] **Step 6: Bump `?v=` cache-bust on modified scripts**

In `index.html`, bump `?v=N` on `js/app.js` by 1.

- [ ] **Step 7: Run version smoke**

```bash
cd /tmp/ro-calc-calculator-fixes && node tests/version-smoke.js
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git -C /tmp/ro-calc-calculator-fixes add js/version.json js/app.js index.html
git -C /tmp/ro-calc-calculator-fixes commit -m "$(cat <<'EOF'
Bump version to <NEW>

Final commit of the calculator audit fixes series. Bumps all four
version anchors in sync (js/version.json, APP_VERSION,
CURRENT_HTML_VERSION, sidebar placeholder) plus app.js cache-bust.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Push, verify deploy, run regression smokes

- [ ] **Step 1: Run live-site smoke locally (optional — runs against live URL)**

```bash
cd /tmp/ro-calc-calculator-fixes && node tests/live-site-smoke.mjs
```

Expected: passes (no DOM selectors for the buttons/elements we restyled; assertions are API-shaped).

- [ ] **Step 2: Push the branch**

```bash
git -C /tmp/ro-calc-calculator-fixes push -u origin calc2-calculator-audit-fixes
```

- [ ] **Step 3: Open PR or fast-merge to main**

Per Polina's flow. Don't force-push to main.

- [ ] **Step 4: Watch CI on the merge commit**

Workflows in order: `Deploy GitHub Pages` (Vercel) → `Yandex static sync` → `Live site smoke` → `Yandex mirror smoke`. All four must go green.

- [ ] **Step 5: Manual end-to-end verification on both mirrors**

Open `https://calc.recycleobject.ru/#calculator` and `https://calc2.recycleobject.ru/#calculator`:

1. Both mirrors show new version in sidebar.
2. Empty calculator: empty-state with pendant link visible (Fix 1 baseline).
3. Add one item: persistent add-row now also shows "или подвес из букв" (Fix 1 new).
4. Open mold picker on last item near page bottom: auto-scrolls into view; flips above if overflowing (Fix 2).
5. Same for color picker (Fix 2).
6. Open an existing order from `#orders`: spinner shows briefly, then items render (Fix 4).
7. Footer (Итог) visually matches the three sections above — same border, padding, header style (Fix 3).
8. Header buttons: Сохранить filled blue, Скачать КП outline-primary with 📄, Сбросить muted (Fix 6).
9. Item with 200-char product name: collapsed summary truncates with ellipsis, hover shows full name (Fix 5).
10. Simulate picker fetch failure via DevTools network blocking: error card with retry button (Fix 7).

Cross-module regression checks:
11. Save an order — order saves, KP downloads correctly.
12. Open same order in `#orders` board — totals match.
13. Switch to `#warehouse` and back — calculator state restored.

- [ ] **Step 6: Mark plan complete**

Done when both mirrors show new version, 13 manual checks pass, CI green. Notify Polina: "Calculator audit fixes live, <NEW>. 7 fixes shipped. Зеркала зелёные."

---

## Self-Review

**Spec coverage:**
- Fix 1 (pendant always-visible) → Task 1.
- Fix 2 (picker scrollIntoView + flip) → Task 5.
- Fix 3 (footer .calc-section) → Task 4.
- Fix 4 (order loader) → Task 6.
- Fix 5 (item name ellipsis) → Task 3.
- Fix 6 (header button hierarchy) → Task 2.
- Fix 7 (picker retry card) → Task 7.
- Version bump → Task 8.
- Deploy verify → Task 9.

**Placeholder scan:** Steps that say "If a dedicated `.item-name` rule doesn't exist, target via descendant selector" or "use the existing escape helper used elsewhere" are intentional — the engineer must read the live code to find the actual symbol. Not a placeholder for design intent. `<NEW>` in Task 8 is explicitly explained as a computed value (current main version + 1).

**Type/symbol consistency:**
- `Calculator.loadOrder`, `Calculator.refreshItemPicker`, `Calculator.save`, `Calculator.reset` — all referenced consistently.
- `Calculator.refreshItemPicker(idx, kind)` is defined in Task 7 Step 4 and called from Task 7 Step 3.
- `pickerErrorCard(label, retryHandler)` helper is defined in Task 7 Step 2 and used in Step 3.
- `.calc-section`, `.calc-section-footer`, `.calc-section-header`, `.calc-section-title`, `.calc-section-body` — consistent across Task 4.
- `.calc-loader`, `.calc-loader-spinner`, `@keyframes calc-loader-spin` — consistent in Task 6.
- `.picker-above` defined in Task 5 Step 3, used in Task 5 Step 2.
- `.btn-outline-primary`, `.btn-outline-muted` defined in Task 2 Step 2, used in Step 3.

Plan ready for execution.

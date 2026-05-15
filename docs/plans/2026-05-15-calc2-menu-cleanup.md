# Calc 2 Menu Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up Calc 2 sidebar from 18 to 15 items in 5 visual groups, relocate TPA live calculator and Monitoring into Settings tabs, hard-delete the Knowledge Base, and reserve an AmoCRM "Лиды" placeholder slot — all in one push, version `v367` → `v368`.

**Architecture:** Vanilla JS application (no bundler, no package.json). All UI lives in a single `index.html` plus a flat set of `js/*.js` modules loaded as script tags. Routing is hash-based via `App.navigate(page)` in `js/app.js`. Settings is a single page with horizontal tab strip; tabs render their bodies on demand via `Settings.switchTab(tab)`. Tests are Node + Playwright smokes under `tests/`, run with `node tests/<name>.js` (or `.mjs`). Deployment is push-to-`main` → GitHub Actions deploys to Vercel (`calc.recycleobject.ru`) and Yandex Object Storage (`calc2.recycleobject.ru`); `js/version.json` is the cache-bust anchor.

**Tech Stack:** vanilla JS, plain HTML/CSS, Supabase (data), Node + Playwright (smokes), GitHub Actions (CI/CD).

**Spec:** [`docs/specs/2026-05-15-calc2-menu-cleanup.md`](../specs/2026-05-15-calc2-menu-cleanup.md).

**Branch:** `calc2-menu-cleanup` (already created, spec already committed).

---

## File Structure

Files touched, in order of first appearance below:

| File | Responsibility | Action |
|---|---|---|
| `index.html` | Sidebar markup, Settings tabs, page containers | Modify — rewrite sidebar, add Лиды page, add 2 Settings tabs, drop wiki script, bump version placeholders |
| `js/app.js` | Routing, page registry, version constant | Modify — page list, redirects, leads case, APP_VERSION |
| `js/tpa.js` | TPA module (1092 lines) | Modify — extract `mount()`, trim to ~250-300 lines |
| `js/monitoring.js` | Monitoring module | Modify — wrap in `mount()` export |
| `js/settings.js` | Settings tab orchestration + label map | Modify — add 2 tab cases, remove wiki/monitoring label-map drift |
| `js/wiki.js` | Knowledge Base module | **Delete** |
| `js/supabase.js` | Data layer | Modify — drop wikiState key + functions |
| `js/version.json` | Version anchor | Modify — bump |
| `tests/wiki-smoke.js` | Wiki unit smoke | **Delete** |
| `tests/live-site-smoke.mjs` | Live e2e smoke | Modify — page list, monitoring/tpa expectations, leads check, redirect checks |

No new files are created.

---

## Task 1: Add "Лиды" placeholder page and route

Purely additive. After this task the sidebar has 19 items (old 18 + Лиды) — the rest of the cleanup happens in later tasks. App is fully runnable at every commit.

**Files:**
- Modify: `index.html` (sidebar entry, new `<div id="page-leads">`)
- Modify: `js/app.js` (lines 100-101 `ALL_PAGES`, line 1112+ routing switch)

- [ ] **Step 1: Add `leads` to `ALL_PAGES`**

In `js/app.js` at lines 100-101, change:

```js
ALL_PAGES: [
    'calculator', 'orders', 'factual',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki', 'gantt', 'tpa',
    'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
],
```

to:

```js
ALL_PAGES: [
    'calculator', 'orders', 'factual', 'leads',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki', 'gantt', 'tpa',
    'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
],
```

- [ ] **Step 2: Add `leads` to `canAccess` visibility (always allowed like bugs/wiki)**

In `js/app.js` around line 120-121, after the `wiki` line add:

```js
if (page === 'leads') return true;
```

- [ ] **Step 3: Add routing case for `leads`**

In `js/app.js` near line 1112 (the routing switch with `case 'monitoring': Monitoring.load(); break;`), add before `case 'settings'`:

```js
case 'leads':
    // Placeholder page — static HTML inside index.html, no JS module yet.
    // AmoCRM integration sub-project will replace this with real lead-listing logic.
    break;
```

- [ ] **Step 4: Add sidebar entry for Лиды in `index.html`**

In `index.html` inside `<nav class="sidebar-nav">` (around lines 193-264), after the Калькулятор `<a>` block (around line 200), insert:

```html
<a href="#leads" data-page="leads">
    <span class="nav-icon">&#128229;</span>
    <span>Лиды</span>
</a>
```

(`&#128229;` is 📥. Placed right after Калькулятор — final position determined in Task 6 when the whole sidebar is rewritten.)

- [ ] **Step 5: Add the Лиды page container in `index.html`**

In `index.html` inside `<main class="main-content">` (after `<!-- ========== CALCULATOR ========== -->` block, find a sensible insertion point — alongside other page containers), add:

```html
<!-- ========== ЛИДЫ (AmoCRM placeholder) ========== -->
<div id="page-leads" class="page">
    <div class="page-header">
        <h1>Лиды</h1>
    </div>
    <div class="card" style="max-width:640px;margin:48px auto;text-align:center;padding:32px">
        <div style="display:inline-block;background:rgba(59,130,246,0.12);color:#2563eb;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;margin-bottom:16px">СКОРО</div>
        <h2 style="margin-bottom:12px">Интеграция с AmoCRM</h2>
        <p style="font-size:15px;color:#666;line-height:1.6;max-width:480px;margin:0 auto">
            Здесь будут все входящие лиды из AmoCRM. Из каждого можно будет одним кликом открыть калькулятор и сразу сформировать заказ.
        </p>
        <p style="font-size:13px;color:#999;margin-top:16px">
            В работе — отдельный спек на интеграцию по API.
        </p>
    </div>
</div>
```

- [ ] **Step 6: Manual smoke check**

Open `index.html` locally (e.g. `python3 -m http.server 8000` or via Vercel preview). Navigate to `#leads`. Expected: badge "СКОРО" and the two paragraphs render. Sidebar shows Лиды (right after Калькулятор for now). All other pages still load.

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js
git commit -m "$(cat <<'EOF'
Add Лиды placeholder page for upcoming AmoCRM integration

Static page at #leads showing a "СКОРО" badge and short explanation.
Added to ALL_PAGES and canAccess so the route is reachable. Sidebar
entry is inserted next to Калькулятор as a temporary position; the
full sidebar regrouping happens in a later commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `TPA.mount()` and add "Расчёт ТПА" Settings tab

Both the old `#tpa` page and the new Settings tab work after this task (forward-compatible refactor).

**Files:**
- Modify: `js/tpa.js` (add `mount()` export, do NOT remove other code yet)
- Modify: `index.html` (new tab in Settings tab strip; new tab content container)
- Modify: `js/settings.js` (add case to `switchTab`)

- [ ] **Step 1: Identify the TPA live calculator UI inside `js/tpa.js`**

Read `js/tpa.js` start-to-end. Find the function that renders the live cost calculator form (input fields for material weight, run time, etc. plus the live-computed cost output). Note the function name and any DOM ids it expects. This is what `mount()` will reuse.

- [ ] **Step 2: Add `mount(container)` to `TPA`**

At the end of `js/tpa.js`, in the existing `TPA` namespace block (or attach to `window.TPA` if that's the pattern), add:

```js
TPA.mount = function(container) {
    if (!container) return;
    // Render the live calculator UI into `container` instead of TPA's
    // top-level page. Reuses the existing render function — replace
    // <RENDER_FN_NAME> with the actual name identified in Step 1.
    container.innerHTML = '';
    TPA.<RENDER_FN_NAME>(container);
};
```

If the existing render function writes into a fixed DOM id (e.g. `tpa-calc-form`), refactor it to accept a `container` argument and append to that. The old `TPA.load()` continues to call it with the legacy id so `#tpa` keeps working.

- [ ] **Step 3: Add new tab to Settings tab strip in `index.html`**

In `index.html` around line 2757 (the `<div class="tabs">` block inside `#page-settings`), after the "Производство" tab insert:

```html
<div class="tab" data-tab="tpa" onclick="Settings.switchTab('tpa')">🧮 Расчёт ТПА</div>
```

- [ ] **Step 4: Add the tab content container in `index.html`**

After the production tab content block (around line 2858, before `<div id="settings-tab-indirect">`), insert:

```html
<div id="settings-tab-tpa" class="settings-tab-content" style="display:none">
    <div class="card">
        <h3 style="margin-bottom:16px">Быстрый расчёт ТПА</h3>
        <div id="settings-tpa-host"></div>
    </div>
</div>
```

- [ ] **Step 5: Wire `TPA.mount()` into `Settings.switchTab`**

In `js/settings.js`, locate `Settings.switchTab`. Find where it handles per-tab activation (e.g. a switch on `tab` name). Add:

```js
if (tab === 'tpa') {
    const host = document.getElementById('settings-tpa-host');
    if (host && typeof TPA !== 'undefined' && typeof TPA.mount === 'function') {
        TPA.mount(host);
    }
}
```

Insert this so it fires whenever the tpa tab is activated. If `switchTab` has a single per-tab activation function map, follow the existing pattern.

- [ ] **Step 6: Manual smoke**

Reload site. Navigate to `#settings`, click "🧮 Расчёт ТПА" tab. Expected: the live calculator form renders inside the tab body and computes correctly. Then navigate to `#tpa` directly — expected: legacy TPA page still works exactly as before.

- [ ] **Step 7: Commit**

```bash
git add js/tpa.js js/settings.js index.html
git commit -m "$(cat <<'EOF'
Expose TPA.mount() and surface live calculator as Settings tab

Adds Settings "🧮 Расчёт ТПА" tab that mounts the existing TPA live
calculator inline. The legacy #tpa page stays intact for now;
trimming happens in a later commit. Forward-compatible refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract `Monitoring.mount()` and add "Мониторинг" Settings tab

Same pattern as Task 2 but for Monitoring.

**Files:**
- Modify: `js/monitoring.js` (add `mount()` export)
- Modify: `index.html` (new tab at end of Settings strip; new tab content container)
- Modify: `js/settings.js` (add case to `switchTab`)

- [ ] **Step 1: Identify Monitoring's top-level render entry**

Read `js/monitoring.js`. Locate `Monitoring.load()` and the function it calls that paints the page. Note where it expects to write (likely `document.getElementById('page-monitoring')` or similar).

- [ ] **Step 2: Add `Monitoring.mount(container)`**

At the end of `js/monitoring.js` add:

```js
Monitoring.mount = function(container) {
    if (!container) return;
    container.innerHTML = '';
    // Reuse the render flow; if the existing render targets a fixed DOM
    // id, refactor it to accept an optional container argument and fall
    // back to the legacy id otherwise. Old #monitoring page keeps working.
    Monitoring.<RENDER_FN_NAME>(container);
};
```

- [ ] **Step 3: Add Settings tab in `index.html`**

In the Settings tabs strip, AFTER the "Бэкап" tab (around line 2761), insert:

```html
<div class="tab" data-tab="monitoring" onclick="Settings.switchTab('monitoring')">📈 Мониторинг</div>
```

- [ ] **Step 4: Add tab content container**

After the existing `<div id="settings-tab-backup">` block (around line 3489+), insert:

```html
<div id="settings-tab-monitoring" class="settings-tab-content" style="display:none">
    <div id="settings-monitoring-host"></div>
</div>
```

- [ ] **Step 5: Wire `Monitoring.mount()` in `Settings.switchTab`**

In `js/settings.js`, alongside the TPA hook from Task 2:

```js
if (tab === 'monitoring') {
    const host = document.getElementById('settings-monitoring-host');
    if (host && typeof Monitoring !== 'undefined' && typeof Monitoring.mount === 'function') {
        Monitoring.mount(host);
    }
}
```

- [ ] **Step 6: Manual smoke**

Navigate to `#settings`, click "📈 Мониторинг" tab. Expected: monitoring workflows list renders inside the tab. Then navigate to `#monitoring` directly — expected: legacy monitoring page still works.

- [ ] **Step 7: Commit**

```bash
git add js/monitoring.js js/settings.js index.html
git commit -m "$(cat <<'EOF'
Expose Monitoring.mount() and surface as Settings tab

Adds Settings "📈 Мониторинг" tab that mounts the existing Monitoring
panel inline. Legacy #monitoring page still works; sidebar entry is
removed in a later commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add hash redirects for `#tpa`, `#monitoring`, `#wiki`

Old bookmarks degrade gracefully into the new destinations. Redirects are client-side, applied in the routing switch in `js/app.js`.

**Files:**
- Modify: `js/app.js` (routing switch at lines 1093, 1103, 1112)

- [ ] **Step 1: Replace `case 'tpa':` to redirect into Settings**

In `js/app.js` line 1093, replace:

```js
case 'tpa': TPA.load(); break;
```

with:

```js
case 'tpa':
    App.navigate('settings', false);
    setTimeout(() => Settings.switchTab('tpa'), 100);
    break;
```

(The `setTimeout` mirrors the existing pattern for `indirect-costs` at line ~1109.)

- [ ] **Step 2: Replace `case 'wiki':` to redirect to Calculator**

In `js/app.js` line 1103, replace:

```js
case 'wiki': Wiki.load(); break;
```

with:

```js
case 'wiki':
    App.navigate('calculator', false);
    break;
```

(Wiki module deletion happens in Task 7; for now this still works because Wiki object still exists but is never invoked.)

- [ ] **Step 3: Replace `case 'monitoring':` to redirect into Settings**

In `js/app.js` line 1112, replace:

```js
case 'monitoring': Monitoring.load(); break;
```

with:

```js
case 'monitoring':
    App.navigate('settings', false);
    setTimeout(() => Settings.switchTab('monitoring'), 100);
    break;
```

- [ ] **Step 4: Manual smoke — all three redirects**

Visit `#tpa` — land on `#settings` with "Расчёт ТПА" tab active.
Visit `#monitoring` — land on `#settings` with "Мониторинг" tab active.
Visit `#wiki` — land on `#calculator`.
Visit `#projects` — still opens the Projects page (untouched).

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "$(cat <<'EOF'
Redirect legacy #tpa/#monitoring/#wiki to new homes

#tpa -> #settings + Расчёт ТПА tab.
#monitoring -> #settings + Мониторинг tab.
#wiki -> #calculator (page deleted in upcoming commit).
#projects untouched (Tasks still depends on projects table).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add `.sidebar-group-label` CSS

Standalone tiny CSS change so Task 6's sidebar rewrite has the styling ready.

**Files:**
- Modify: `index.html` (inside the existing `<style>` block — search for `.sidebar-nav a {` and add the new rule nearby)

- [ ] **Step 1: Locate `.sidebar-nav` styles**

In `index.html` grep for `.sidebar-nav a` and identify the surrounding CSS block.

- [ ] **Step 2: Add `.sidebar-group-label` rule**

Add adjacent to the sidebar styles:

```css
.sidebar-group-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 12px 14px 4px;
    font-weight: 600;
}
.sidebar-group-label:first-child {
    padding-top: 4px;
}
```

- [ ] **Step 3: Manual smoke**

Reload — sidebar should look unchanged (no `.sidebar-group-label` elements exist yet, the rule is dormant).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Add .sidebar-group-label CSS for upcoming sidebar regrouping

Style is dormant until Task 6 inserts the actual group labels in the
sidebar markup. Splitting CSS from markup change keeps the regrouping
commit focused.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite sidebar to Variant B (grouped, 15 items)

This is the visible cleanup. Removes sidebar entries for ТПА, Проекты, База знаний, Мониторинг. Adds group headers. Reorders the remaining items per the spec.

**Files:**
- Modify: `index.html` (`<nav class="sidebar-nav">` block lines 192-265)

- [ ] **Step 1: Replace the entire `<nav class="sidebar-nav">` block**

In `index.html`, replace lines 192-265 (the existing `<nav class="sidebar-nav"> ... </nav>`) with:

```html
<nav class="sidebar-nav">
    <div class="sidebar-group-label">Каждый день</div>
    <a href="#tasks" data-page="tasks">
        <span class="nav-icon">&#9745;</span>
        <span>Задачи</span>
    </a>
    <a href="#leads" data-page="leads">
        <span class="nav-icon">&#128229;</span>
        <span>Лиды</span>
    </a>
    <a href="#calculator" data-page="calculator">
        <span class="nav-icon">&#9998;</span>
        <span>Калькулятор</span>
    </a>
    <a href="#orders" data-page="orders">
        <span class="nav-icon">&#9776;</span>
        <span>Заказы</span>
    </a>

    <div class="sidebar-group-label">Производство</div>
    <a href="#gantt" data-page="gantt">
        <span class="nav-icon">&#128197;</span>
        <span>Производственный календарь</span>
    </a>
    <a href="#warehouse" data-page="warehouse">
        <span class="nav-icon">&#128230;</span>
        <span>Склад</span>
    </a>
    <a href="#china" data-page="china">
        <span class="nav-icon">&#127464;&#127475;</span>
        <span>Китай</span>
    </a>
    <a href="#timetrack" data-page="timetrack">
        <span class="nav-icon">&#9201;</span>
        <span>Часы</span>
    </a>

    <div class="sidebar-group-label">Справочники</div>
    <a href="#molds" data-page="molds">
        <span class="nav-icon">&#9670;</span>
        <span>Бланки</span>
    </a>
    <a href="#colors" data-page="colors">
        <span class="nav-icon">&#127912;</span>
        <span>Цвета</span>
    </a>

    <div class="sidebar-group-label">Деньги и аналитика</div>
    <a href="#marketplaces" data-page="marketplaces">
        <span class="nav-icon">&#128722;</span>
        <span>B2C продажи</span>
    </a>
    <a href="#factual" data-page="factual">
        <span class="nav-icon">&#9646;</span>
        <span>Аналитика</span>
    </a>
    <a href="#import" data-page="import">
        <span class="nav-icon">&#128176;</span>
        <span>Финансы</span>
    </a>

    <div class="sidebar-group-label">Служебное</div>
    <a href="#bugs" data-page="bugs">
        <span class="nav-icon">&#128027;</span>
        <span>Баги</span>
    </a>
    <a href="#settings" data-page="settings">
        <span class="nav-icon">&#9881;</span>
        <span>Настройки</span>
    </a>
</nav>
```

This removes entries for `tpa`, `projects`, `wiki`, `monitoring` from the sidebar. (Their routes still work — see Task 4.)

- [ ] **Step 2: Manual smoke**

Reload. Sidebar shows 5 group labels and 15 nav entries. Each link routes correctly. Visit `#projects` directly — Projects page still renders (code still in bundle).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Regroup sidebar into 5 visual sections, drop 4 menu entries

Sidebar: 18 -> 15 items in 5 groups (Каждый день, Производство,
Справочники, Деньги и аналитика, Служебное). Drops menu entries
for ТПА, Проекты, База знаний, Мониторинг. ТПА and Мониторинг
are reachable via Settings tabs; #wiki redirects to #calculator;
#projects still works directly (Tasks depends on projects table).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Hard-delete Wiki module and its data

Removes `js/wiki.js`, all references, the supabase `app_state` row, and the related smoke test.

**Files:**
- Delete: `js/wiki.js`
- Delete: `tests/wiki-smoke.js`
- Modify: `index.html` (drop script tag at line 3569)
- Modify: `js/app.js` (remove `wiki` from `ALL_PAGES`, `DEFAULT_PAGES`, `canAccess`; remove routing case)
- Modify: `js/settings.js` (remove `wiki: 'База знаний'` from label map at line 923)
- Modify: `js/supabase.js` (remove `wikiState` key, remove load/save functions for `knowledge_wiki_json`)
- Supabase: delete the `app_state` row where `key = 'knowledge_wiki_json'`

- [ ] **Step 1: Update `tests/live-site-smoke.mjs` page list**

In `tests/live-site-smoke.mjs` around lines 517-518, find:

```js
'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki', 'gantt', 'tpa',
'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
```

Remove `'wiki'` from this list. (Also remove `'tpa'` and `'monitoring'` if the smoke iterates these as standalone pages — they're now Settings tabs, not top-level pages.)

Examine the iterator above this list to understand what it does with each page. If it assumes `App.navigate(page)` lands on a top-level page, then `tpa` and `monitoring` must be removed since they redirect now.

- [ ] **Step 2: Delete the per-module smoke**

```bash
rm tests/wiki-smoke.js
```

- [ ] **Step 3: Delete the module**

```bash
rm js/wiki.js
```

- [ ] **Step 4: Drop script tag in `index.html`**

Remove line 3569 (`<script src="js/wiki.js?v=4"></script>`).

- [ ] **Step 5: Remove `wiki` from `js/app.js`**

At lines 100-101, remove `'wiki'` from `ALL_PAGES`:

```js
ALL_PAGES: [
    'calculator', 'orders', 'factual', 'leads',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'gantt', 'tpa',
    'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
],
```

At line 105, remove `'wiki'` from `DEFAULT_PAGES`:

```js
DEFAULT_PAGES: ['orders', 'timetrack', 'tasks', 'bugs', 'projects'],
```

At line 120, remove the line `if (page === 'wiki') return true;`.

The `case 'wiki':` redirect from Task 4 stays (so bookmarks still degrade gracefully).

- [ ] **Step 6: Remove wiki from settings.js label map**

In `js/settings.js` at line ~923, find the label map:

```js
tasks: 'Задачи', bugs: 'Баги', projects: 'Проекты', wiki: 'База знаний', gantt: 'Производственный календарь', import: 'Импорт',
```

Remove `wiki: 'База знаний',` from the line. Keep `projects` (page still works).

- [ ] **Step 7: Remove wiki state from `js/supabase.js`**

At line 375, remove `wikiState: 'ro_calc_wiki_state',` from the `LOCAL_KEYS` object.

Around lines 5581-5610, identify the function(s) that load/save `knowledge_wiki_json`. There are two surfaces:
- A loader that reads `app_state` where `key='knowledge_wiki_json'` (lines ~5585-5595).
- A saver that writes `key='knowledge_wiki_json'` (lines ~5605-5615).

Delete both functions outright. Also grep the rest of `supabase.js` for any callers and remove the call sites — Wiki is the only caller, and `wiki.js` is already gone.

```bash
grep -n "wiki\|wikiState\|knowledge_wiki" js/supabase.js
```

Expected after deletion: zero matches.

- [ ] **Step 8: Delete the Supabase row**

Open Supabase SQL editor, run:

```sql
DELETE FROM app_state WHERE key = 'knowledge_wiki_json';
```

Confirm one row deleted. (If using the Yandex proxy: same query through that route.) Snapshot this action in commit message body for traceability.

- [ ] **Step 9: Run smokes**

```bash
node tests/version-smoke.js
node tests/live-site-smoke.mjs
```

Expected: both pass. `wiki-smoke.js` doesn't exist anymore so it can't fail. The live smoke now iterates the trimmed page list.

If `live-site-smoke.mjs` fails on a step that referenced wiki/tpa/monitoring, fix the assertion to match new behavior:
- For `#tpa` and `#monitoring`: assert the redirect lands on `#settings` with the right tab active.
- For `#wiki`: assert the redirect lands on `#calculator`.

- [ ] **Step 10: Commit**

```bash
git add index.html js/app.js js/settings.js js/supabase.js js/wiki.js js/version.json tests/live-site-smoke.mjs tests/wiki-smoke.js
# (js/wiki.js and tests/wiki-smoke.js are tracked as deletions)
git commit -m "$(cat <<'EOF'
Hard-delete Knowledge Base module and its data

Removes js/wiki.js, tests/wiki-smoke.js, all in-app references
(ALL_PAGES, DEFAULT_PAGES, canAccess, label map), and the
LOCAL_KEYS.wikiState + load/save functions in js/supabase.js.

Supabase: deleted app_state row where key='knowledge_wiki_json'.

The #wiki hash redirect to #calculator stays for legacy bookmarks.
Tests: updated live-site-smoke page list; wiki-smoke removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Trim `js/tpa.js` to live calculator only

Removes the parts of TPA that were previously rendered as a full page (logs, history, archive — whatever currently lives there besides the live calc). Target size: ~250-300 lines from the current 1092.

**Files:**
- Modify: `js/tpa.js`
- Modify: `js/app.js` (remove `tpa` from `ALL_PAGES`)
- Modify: `index.html` (drop the `#page-tpa` section if it exists)

- [ ] **Step 1: Inventory what's inside `js/tpa.js`**

Read the file end-to-end. Identify:
- The live calculator render function (kept).
- Any data-loading from Supabase / logs / archive (removed unless the live calc needs it).
- Event handlers and helpers (keep only those used by the live calc).
- Anything writing to `#page-tpa` top-level DOM (removed; the calc now only renders inside Settings host).

Sketch what stays before deleting — write a one-paragraph note in your scratchpad of "kept symbols" and "removed symbols".

- [ ] **Step 2: Delete non-calculator code**

Edit `js/tpa.js`: delete all functions, state objects, and Supabase calls that are not used by the live calculator. `TPA.load()` (the legacy entry) can be removed or stubbed — the routing case already redirects away.

Target the file at 250-300 lines after this cleanup.

- [ ] **Step 3: Drop `tpa` from `ALL_PAGES`**

In `js/app.js` lines 100-101, remove `'tpa'`:

```js
ALL_PAGES: [
    'calculator', 'orders', 'factual', 'leads',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'gantt',
    'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
],
```

At line 118, remove `if (page === 'tpa') page = 'calculator';` (no longer needed).

The redirect `case 'tpa':` stays — bookmarks land in Settings.

- [ ] **Step 4: Remove `#page-tpa` from `index.html` if present**

Grep for `id="page-tpa"`. If found, delete the entire `<div id="page-tpa" class="page">...</div>` block. The script tag for `js/tpa.js` stays (Settings tab uses it).

- [ ] **Step 5: Manual smoke**

Reload. Navigate to `#settings` → Расчёт ТПА tab. Live calculator renders and computes. Navigate to `#tpa` — redirects to Settings as expected.

- [ ] **Step 6: Run live smoke**

```bash
node tests/live-site-smoke.mjs
```

Expected: passes. The smoke no longer iterates `tpa` as a top-level page.

- [ ] **Step 7: Commit**

```bash
git add js/tpa.js js/app.js index.html
git commit -m "$(cat <<'EOF'
Trim TPA to live calculator only

Removes log/history/archive features and the top-level #page-tpa
container. js/tpa.js shrinks from ~1092 to ~270 lines. TPA now only
exists as the "Расчёт ТПА" Settings tab via TPA.mount(); #tpa redirect
from Task 4 keeps old bookmarks working.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Hide Monitoring and Projects from top-level page registry; clean loose ends

Monitoring stays in code (used by Settings tab) but is removed from `ALL_PAGES` since it's no longer a sidebar page. Projects code stays in bundle (per spec) but `DEFAULT_PAGES` is cleaned. Also removes the now-redundant special-case filter in `settings.js:1204`.

**Files:**
- Modify: `js/app.js`
- Modify: `js/settings.js`

- [ ] **Step 1: Remove `monitoring` from `ALL_PAGES`**

In `js/app.js` lines 100-101:

```js
ALL_PAGES: [
    'calculator', 'orders', 'factual', 'leads',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'gantt',
    'import', 'warehouse', 'marketplaces', 'china', 'settings',
],
```

Remove the line `if (page === 'monitoring') return true;` at line 121. The redirect case from Task 4 stays.

- [ ] **Step 2: Remove `projects` from `DEFAULT_PAGES`**

`DEFAULT_PAGES` should now read:

```js
DEFAULT_PAGES: ['orders', 'timetrack', 'tasks', 'bugs'],
```

(The `projects` key in `ALL_PAGES` stays since the page is still in the bundle and the route still works. Removing from DEFAULT_PAGES just means new users don't see it as a default-visible page — which is correct.)

- [ ] **Step 3: Remove the monitoring filter in `js/settings.js`**

At line ~1204, find:

```js
container.innerHTML = App.ALL_PAGES.filter(page => page !== 'monitoring').map(page => {
```

Replace with:

```js
container.innerHTML = App.ALL_PAGES.map(page => {
```

The filter was a workaround for monitoring being in `ALL_PAGES` but not user-facing. Now that monitoring is out of `ALL_PAGES`, the filter is dead weight.

- [ ] **Step 4: Manual smoke**

Reload. Open Settings → Сотрудники (or wherever the page-visibility config UI is — find the renderer that used the filter). Confirm the list of pages displayed matches the new `ALL_PAGES`. No `monitoring` appears. No regression.

- [ ] **Step 5: Run smokes**

```bash
node tests/version-smoke.js
node tests/live-site-smoke.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add js/app.js js/settings.js
git commit -m "$(cat <<'EOF'
Remove monitoring from page registry, drop redundant filter

Monitoring no longer appears in App.ALL_PAGES (only reachable through
Settings tab + #monitoring redirect). Removed canAccess special-case
and the page-visibility filter in settings.js that was working around
it. Also dropped 'projects' from DEFAULT_PAGES — page is still in
bundle but new users don't get it as default-visible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Bump version `v367` → `v368`

Four places must be updated in sync — enforced by `tests/version-smoke.js`.

**Files:**
- Modify: `js/version.json`
- Modify: `js/app.js` (line 5)
- Modify: `index.html` (lines 10, 190)

- [ ] **Step 1: Update `js/version.json`**

```json
{
  "version": "v368"
}
```

- [ ] **Step 2: Update `APP_VERSION` in `js/app.js`**

Line 5:

```js
const APP_VERSION = 'v368';
```

- [ ] **Step 3: Update `CURRENT_HTML_VERSION` in `index.html`**

Line 10:

```js
const CURRENT_HTML_VERSION = 'v368';
```

- [ ] **Step 4: Update sidebar version placeholder**

Line 190:

```html
<span>Калькулятор <span id="app-version">v368</span></span>
```

- [ ] **Step 5: Bump cache-bust suffixes on any `?v=` query strings whose files changed**

In `index.html` find script tags for files we modified (`js/app.js`, `js/tpa.js`, `js/monitoring.js`, `js/settings.js`, `js/supabase.js`). Bump each `?v=` query string by 1 (e.g. `?v=3` → `?v=4`).

- [ ] **Step 6: Run version smoke**

```bash
node tests/version-smoke.js
```

Expected: all assertions pass. If any fail, fix the mismatched location.

- [ ] **Step 7: Run full smoke**

```bash
node tests/live-site-smoke.mjs
```

(This runs against a live deployed origin by default. Either point it at a local server via `RO_LIVE_URL=http://localhost:8000 node tests/live-site-smoke.mjs`, or accept that this smoke verifies post-deploy. For pre-deploy verification, the manual smokes from earlier tasks should already cover the changes.)

- [ ] **Step 8: Commit**

```bash
git add js/version.json js/app.js index.html
git commit -m "$(cat <<'EOF'
Bump version v367 -> v368

Final commit of the menu cleanup series. Bumps all four version
anchors in sync (js/version.json, APP_VERSION, CURRENT_HTML_VERSION,
sidebar placeholder) plus ?v= cache-bust suffixes on modified scripts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Push and verify deploy

- [ ] **Step 1: Push branch**

```bash
git push -u origin calc2-menu-cleanup
```

- [ ] **Step 2: Open PR or merge to main**

Per Polina's normal flow: open a PR for review, or fast-merge to `main` if approved offline. Don't force-push to main.

- [ ] **Step 3: Watch CI workflows on the merge commit**

GitHub Actions runs (in this order):
1. `Deploy GitHub Pages` — deploys to Vercel
2. `Yandex static sync` — uploads to Yandex Object Storage
3. `Live site smoke` — Playwright against `calc.recycleobject.ru`
4. `Yandex mirror smoke` — Playwright against `calc2.recycleobject.ru`

All four must go green. If any fail, fix forward (don't revert blindly).

- [ ] **Step 4: Manual end-to-end verification**

Open both URLs and verify (matches spec § Testing):

1. `https://calc.recycleobject.ru/` — sidebar shows 5 groups + 15 items including Лиды.
2. `https://calc2.recycleobject.ru/` — same. Both show `v368` in the version placeholder.
3. Click "Лиды" — "СКОРО" placeholder renders.
4. Visit `https://calc2.recycleobject.ru/#tpa` — lands on Settings → Расчёт ТПА tab, live calculator works.
5. Visit `#monitoring` — lands on Settings → Мониторинг tab.
6. Visit `#wiki` — lands on Calculator.
7. Visit `#projects` — Projects page renders.
8. Tasks page (`#tasks`) — open, filter by a project, open a task linked to a project — no regression.
9. Settings: every existing tab still works (smoke-click Производство, Косв. расходы, Расходы, Ценообразование, Сотрудники, Логины, Сессии, Реквизиты, Тайминг, Бэкап).

- [ ] **Step 5: Mark plan complete**

This task is "done" when both mirrors show `v368` and the 9 manual checks above pass. Notify Polina with a summary of changed lines and any oddities encountered.

---

## Self-Review

**Spec coverage:** Walked each spec section.
- Disposition per module: Tasks 1-9 cover all 5 dispositions (Лиды add, TPA move, Wiki delete, Projects hide, Monitoring move).
- New sidebar IA (Variant B 5 groups): Task 6.
- Settings tab additions: Tasks 2, 3.
- AmoCRM "Лиды" placeholder: Task 1.
- URL routing & redirects: Task 4.
- Code changes per file (`index.html`, `js/app.js`, `js/wiki.js`, `js/tpa.js`, `js/monitoring.js`, `js/settings.js`, `js/supabase.js`, `js/version.json`): covered by Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
- Supabase data deletion: Task 7 Step 8.
- Testing (live-site-smoke, yandex-mirror-smoke, manual smoke checklist): Task 7 Step 1 (live smoke update), Task 11 Steps 3-4 (full verification).
- Backwards compat & rollback: Task 4 (redirects); revert via `git revert` of the merge commit, plus restoring `knowledge_wiki_json` from snapshot if needed.

**Placeholder scan:** Plan contains `<RENDER_FN_NAME>` placeholders in Tasks 2 and 3 — these are intentional (the engineer must inspect the existing module to find the actual render-fn name; we can't pre-determine it without reading the live code). All other steps have concrete code or commands.

**Type/symbol consistency:**
- `TPA.mount`, `Monitoring.mount` — defined Tasks 2, 3, called Tasks 2, 3 (Settings hook).
- `Settings.switchTab` — used Tasks 2, 3, 4 with same signature `(tab: string)`.
- `App.navigate` — used Task 4 with signature `(page, false)` — matches existing usage at app.js:1108.
- `ALL_PAGES` mutations: Task 1 adds `leads`; Task 7 removes `wiki`; Task 8 removes `tpa`; Task 9 removes `monitoring`. Final list documented in Task 9 Step 1.
- `DEFAULT_PAGES`: Task 7 removes `wiki`; Task 9 removes `projects`. Final: `['orders', 'timetrack', 'tasks', 'bugs']`.
- Hash route names match across redirects and routing cases.

No drift detected. Plan ready for execution.

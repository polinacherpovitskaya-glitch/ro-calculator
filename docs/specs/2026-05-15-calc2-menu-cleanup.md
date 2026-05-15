# Calc 2 Menu Cleanup & IA

**Date:** 2026-05-15
**Type:** Design spec (sub-project of broader calc2 UX overhaul)
**Status:** Brainstormed, ready for implementation plan
**Target release:** Single push, bumps `js/version.json` to `v368`

## Context

Calc 2 left sidebar has accumulated 18 menu items. Several are unused, others should live elsewhere. This is the first sub-project of a larger UX overhaul — its purpose is to clean information architecture so subsequent per-page redesigns happen on a clear map.

Out of scope here, but planned as separate sub-projects: Warehouse redo, Production calendar redo, Hours module split, Settings dedup audit, AmoCRM API integration, per-page inline-expansion fixes.

## Goals

- Reduce sidebar from 18 items to 15 (14 real + 1 AmoCRM placeholder).
- Group remaining items into 5 visual sections so users can scan quickly.
- Move two utility pages (TPA live calculator, Monitoring) into Settings tabs.
- Hard-delete the unused Knowledge Base page including its data.
- Reserve a visible slot in the sidebar for the upcoming AmoCRM "Лиды" integration.
- Ship as one push, single version bump.

## Non-goals

- Not touching any kept page's internals (Calculator, Orders, Tasks, etc. stay exactly as they are).
- Not reorganizing existing 10 Settings tabs — only appending 2 new ones.
- Not dropping the `projects` Supabase table (Tasks depends on `project_id`).
- Not implementing AmoCRM integration — only adding the empty placeholder page.
- Not fixing per-page UX issues that came up in the brain-dump (inline expansion, font size, etc.) — those are separate sub-projects.

## Disposition per module

| Module | Decision | Why |
|---|---|---|
| Задачи, Калькулятор, Заказы, Бланки, Цвета, Финансы, Баги | Keep as-is | Used daily, no menu-level changes needed |
| Производственный календарь, Аналитика, Часы, Склад, B2C продажи, Китай, Настройки | Keep in menu | Each has its own redesign sub-project later |
| **ТПА XPM-17** | Move live calculator into Settings as tab "🧮 Расчёт ТПА"; drop the rest | Page mostly unused; only the live cost calculator has standalone value |
| **Проекты** | Remove from menu; keep `projects.js` in bundle and `#projects` route working | `projects` table is foreign-keyed by `tasks.project_id`; we can't safely drop it without first migrating Tasks. Future sub-project handles deeper cleanup. |
| **База знаний** | Hard-delete: remove `wiki.js`, menu entry, and the `knowledge_wiki_json` row in Supabase `app_state` | Stored as single JSON blob (not a dedicated table). Notion import was broken; rebuilding later from scratch is cheaper than salvaging. |
| **Мониторинг** | Move into Settings as tab "📈 Мониторинг"; keep `monitoring.js` intact, mount inside the tab | Code is healthy and self-contained; just not menu-worthy |
| **Лиды (AmoCRM)** | NEW menu entry pointing to a placeholder page that says "Скоро" | Reserves IA slot so AmoCRM integration sub-project doesn't disturb the map again |

## New sidebar IA

Five visual groups with quiet uppercase headers, no collapsibles (flat hierarchy with separators):

```
КАЖДЫЙ ДЕНЬ
  ☑  Задачи              #tasks
  📥 Лиды                #leads        (placeholder, badge "Скоро")
  ✎  Калькулятор          #calculator
  ☰  Заказы              #orders

ПРОИЗВОДСТВО
  📅 Производственный календарь  #gantt
  📦 Склад                #warehouse
  🇨🇳 Китай                #china
  ⏱  Часы                #timetrack

СПРАВОЧНИКИ
  ◆  Бланки              #molds
  🎨 Цвета                #colors

ДЕНЬГИ И АНАЛИТИКА
  🛍 B2C продажи          #marketplaces
  ▮  Аналитика            #factual
  💰 Финансы              #import          (slug stays #import; renaming is out of scope)

СЛУЖЕБНОЕ
  🐛 Баги                #bugs
  ⚙  Настройки            #settings
```

Group headers are presentation-only (`<div class="sidebar-group-label">`), not nav links. The grouping is fixed; no per-user collapse state.

The `Финансы` slug remains `#import` for now — renaming touches existing bookmarks and is unrelated to this cleanup; can be addressed in the future Finance sub-project if needed.

## Settings tabs

Existing 10 tabs stay in place. Append 2 new ones at logical positions:

```
Производство · 🧮 Расчёт ТПА · Косв. расходы · Расходы · Ценообразование ·
Сотрудники · Логины · Сессии · Реквизиты · ⏱ Тайминг · Бэкап · 📈 Мониторинг
```

- **🧮 Расчёт ТПА** is placed after Производство since it's a production utility.
- **📈 Мониторинг** is placed at the end alongside Бэкап since both are system utilities.
- Tab strip uses `flex-wrap` (already in CSS); at narrow widths the strip wraps to two rows.
- Each tab has its own `<div id="settings-tab-<slug>" class="settings-tab-content">` container.

## AmoCRM "Лиды" placeholder

A static page with no functionality:

- A "Скоро" badge at the top.
- One-paragraph explanation: leads from AmoCRM will appear here, with one-click conversion to an order via the calculator.
- A note that an integration spec is in progress.
- No mock data — empty content is honest and avoids confusion.

Route: `#leads`. Page id: `page-leads`. No `js/leads.js` is created — the page is a static `<div id="page-leads" class="page">` in `index.html` containing the badge and copy. The existing hash-routing switch in `app.js` activates it like any other page. The AmoCRM sub-project later replaces the static content with real lead-listing logic.

## URL routing & redirects

| Old URL | Behavior |
|---|---|
| `#tpa` | Redirect to `#settings`, activate tab `tpa` |
| `#monitoring` | Redirect to `#settings`, activate tab `monitoring` |
| `#wiki` | Redirect to `#calculator` (page deleted) |
| `#projects` | Continue to work as today (module still in bundle, just hidden from menu) |
| `#leads` | NEW — opens the placeholder page |

Implementation uses the existing hash-routing switch in `js/app.js`. The redirects rewrite `location.hash` and re-dispatch — they do not preserve the original hash in history.

Deep-linking to a specific Settings tab needs to be supported (e.g. `#settings` with subsequent tab activation). The existing `Settings.switchTab` already handles tab activation; the redirect calls `Settings.switchTab(<tab>)` after navigating to `#settings`.

## Code changes

All in one commit, version bumped to `v368`:

### `index.html`

- Rewrite `<nav class="sidebar-nav">` (lines 192-265 currently) to the new grouped structure with `<div class="sidebar-group-label">` separators.
- Remove sidebar entries for `tpa`, `projects`, `wiki`, `monitoring`.
- Add `<a>` for `leads` in the "Каждый день" group.
- In `<div id="page-settings">` (line 2751+), insert 2 new `<div class="tab">` entries: `tpa` after `production`, `monitoring` after `backup`.
- Add 2 new `<div id="settings-tab-tpa" class="settings-tab-content">` and `<div id="settings-tab-monitoring" class="settings-tab-content">` containers in the settings section.
- Add new `<div id="page-leads" class="page">` with placeholder content.
- Remove `<script src="js/wiki.js?v=4">` (line 3569).
- Keep `<script>` tags for `tpa.js`, `projects.js`, `monitoring.js` (they're still needed).
- Bump cache-busting `?v=` suffixes on changed scripts.

### `js/app.js`

- `ALL_PAGES` (line ~100): remove `wiki`; add `leads`. Keep `projects`, `tpa`, `monitoring` (their pages still exist or are referenced).
- `DEFAULT_PAGES` (line ~105): remove `projects`, `wiki`.
- Visibility helpers (lines ~120-121): remove the `if (page === 'wiki') return true;` line; review `monitoring` similarly (the special-case may no longer be needed once it's a Settings tab).
- Hash-routing switch (line ~1100): add redirect cases for `#tpa`, `#monitoring`, `#wiki`; add `#leads` case; remove `#wiki` case.

### `js/wiki.js`

- **Delete** the entire file.

### `js/tpa.js`

- Reduce to ~250-300 lines: keep only the live calculator UI/logic.
- Export a `mount(container)` function that the Settings tab calls to render the calculator into its container.
- Remove anything related to logs, history, archive, or other former TPA-page features.

### `js/monitoring.js`

- Wrap existing logic in a `mount(container)` export so Settings tab can call it.
- No business logic changes.

### `js/settings.js`

- Add `tpa` and `monitoring` cases to `switchTab`.
- On first activation of each, call `TPA.mount(container)` / `Monitoring.mount(container)`.
- Label map (line ~923 — `tasks: 'Задачи', bugs: 'Баги', projects: 'Проекты', wiki: 'База знаний', ...`): remove the `wiki:` entry. Keep `projects:` because the route still works. Do not add `tpa` or `monitoring` (they are no longer top-level pages, they live inside Settings tabs).
- Special-case filter at line 1204 (`filter(page => page !== 'monitoring')`): remove the filter. Once `monitoring` is gone from `ALL_PAGES`, the filter becomes redundant.

### `js/supabase.js`

- Remove `LOCAL_KEYS.wikiState`.
- Remove the load/save functions that read/write `knowledge_wiki_json` (around lines 5581-5610).
- Remove any related fallback paths.

### `js/version.json`

- `v367` → `v368`.

### Supabase data

- Delete the row in `app_state` where `key = 'knowledge_wiki_json'`. Done via a one-off SQL run, not a numbered migration file (single-row cleanup doesn't warrant a migration).
- `projects` table: untouched.

## Backwards compat & rollback

- `calc.recycleobject.ru` and `calc2.recycleobject.ru` deploy from the same `main` branch, so both get the same changes simultaneously. No per-mirror branching.
- Rollback path: `git revert` the cleanup commit. The wiki blob in `app_state` is the only piece of data that gets deleted — if rollback is needed and Polina wants the wiki content back, restore from the latest Supabase snapshot in `deploy/supabase-snapshots/`.
- All redirects are client-side hash redirects, so existing browser bookmarks degrade gracefully: TPA/Monitoring bookmarks land on the right Settings tab; Wiki bookmarks land on Calculator.

## Testing

- **`live-site-smoke.yml`**: existing workflow. Verify it still passes — checks that `js/version.json` matches the deployed bundle.
- **`yandex-mirror-smoke.yml`**: existing. Verifies calc2 mirror is in sync.
- **Manual smoke** (one-page test plan, before merge):
  1. Sidebar shows 5 groups with the listed items.
  2. Clicking "Лиды" shows the "Скоро" placeholder.
  3. Visiting `#tpa` lands on Settings → Расчёт ТПА tab with live calculator working.
  4. Visiting `#monitoring` lands on Settings → Мониторинг tab.
  5. Visiting `#wiki` lands on Calculator.
  6. Visiting `#projects` opens the Projects page as before.
  7. Tasks page still works — filtering by project, opening tasks linked to projects, creating tasks with `project_id`.
  8. Existing Settings tabs all still work (regression check).
- **Both mirrors**: load `calc.recycleobject.ru` and `calc2.recycleobject.ru`, confirm `v368` shows up bottom of sidebar and behavior matches.

## Out of scope (follow-up sub-projects)

These are explicitly NOT part of this spec, each becomes its own design → plan → implementation cycle:

- AmoCRM API integration — fills the "Лиды" placeholder.
- Tasks migration to remove `project_id`, then drop the `projects` table.
- Removing `projects.js` from the bundle once the page is confirmed unused for a sprint.
- Settings dedup audit (Polina flagged "повторяющиеся штуки" — separate pass).
- Each big-redo module (Warehouse, Production calendar, Hours, China IA).
- Per-page UX fixes (inline-expansion across Молды/B2C/Аналитика/Заказы; font size increase site-wide).
- Renaming `Финансы` slug from `#import` to `#finance`.

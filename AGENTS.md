# Agent Guide — Recycle Object Calculator (calc / calc2)

Read this before starting any task in this repo. It captures conventions that aren't obvious from the code and project rules that have caused real bugs when ignored.

## What this app is

Single-page vanilla JS app. Two production mirrors deployed from the same `main` branch:

- `calc.recycleobject.ru` — Vercel, talks to Supabase directly.
- `calc2.recycleobject.ru` — Yandex Object Storage, talks to Supabase via Yandex API Gateway + Cloud Function proxy.

No bundler. No `package.json`. Modules in `js/*.js` loaded as `<script>` tags from `index.html`. State + persistence via Supabase. See [`docs/deploy-domain.md`](docs/deploy-domain.md) and [`docs/yandex-migration-plan.md`](docs/yandex-migration-plan.md).

There is also a **public, read-only производственная витрина цеха** at `calc2.recycleobject.ru/floor/` — a standalone static page in [`production-floor/`](production-floor/) that mirrors the internal `#gantt` calendar for shop-floor staff. It renders a curated snapshot published by [`scripts/production-floor-publish.mjs`](scripts/production-floor-publish.mjs) (built field-by-field from an allowlist — no prices/margins/PII/keys), using [`js/production-core.js`](js/production-core.js) — the shared scheduling engine extracted from `js/gantt.js` so the витрина and `#gantt` compute identical numbers. It is NOT part of the SPA: don't bump the 4 version anchors for changes confined to `production-floor/`. Deploy rides the Yandex static sync (`scripts/build-yandex-static.mjs` copies the page and publishes the snapshot into `floor/`).

## Version bump rule — READ THIS

**Every shipped change must bump the app version.** The version lives in **four** places and they must stay in sync (enforced by `tests/version-smoke.js`):

1. `js/version.json` — `{"version": "vN"}`
2. `js/app.js` — `const APP_VERSION = 'vN'` (around line 5)
3. `index.html` — `const CURRENT_HTML_VERSION = 'vN'` (around line 10)
4. `index.html` — `<span id="app-version">vN</span>` (around line 190)

Also bump the `?v=N` cache-bust suffix on any `<script src="js/foo.js?v=N">` tag whose underlying file changed.

### How to pick the next version number (avoid collisions)

When multiple branches are in flight, two PRs can both target the same version and one will lose. Always read `main` immediately before bumping:

```bash
git fetch origin main
git show origin/main:js/version.json
# Take that vN, set NEW=v(N+1), use NEW in all 4 places.
```

If between your bump commit and your push another branch lands on `main` and raises the version, **redo the bump** with a fresh `(current main + 1)` and commit `Bump version vX -> vY` on top of the previous bump. Never push a version `<=` current `main`.

### What to do when your push triggers a deploy

After push (PR merge to `main`), watch these CI workflows in order:

1. `Deploy GitHub Pages` (Vercel)
2. `Yandex static sync`
3. `Live site smoke`
4. `Yandex mirror smoke`

All four must go green. Both mirrors should then show the new `vN` in the sidebar. If a workflow fails, **fix forward** — don't revert blindly.

## Specs and plans

Convention used throughout calc2:

- Designs (specs) live in [`docs/specs/YYYY-MM-DD-<topic>.md`](docs/specs).
- Implementation plans live in [`docs/plans/YYYY-MM-DD-<topic>.md`](docs/plans).
- Filenames use the creation date.
- Each branch's PR ships one spec + one plan + the implementation. Don't bundle multiple unrelated sub-projects into one PR.

If you're implementing a plan, the plan file in `docs/plans/` has checkbox steps you can tick off as you go (`- [ ]` → `- [x]`).

## Cross-module API rules

These functions and identifiers are consumed by other modules. **Renaming or changing their signatures requires coordination** — don't do it as part of a UX-scoped change:

- `Calculator.recalculate()`, `Calculator.toJSON()`, `Calculator.loadOrder(orderId)` — called by Pendant, KP, Orders, Finance.
- `Warehouse.getAvailableQty()`, `Warehouse.buildPickerOptions()`, `Warehouse.handlePickerSelect()`, `Warehouse.setView(view)` — called by Orders, China, Molds, Marketplaces, Production plan.
- The `items` array schema in Calculator state is the order-items DB schema. Changing fields requires a migration plus updating Calculator save/load + KP generation.
- Hardcoded DOM IDs (`calc-order-name`, `calc-items-container`, `calc-items-add-row`, `page-warehouse`, `wh-content`, `wh-shipments-list`, `page-settings`, sidebar `<a data-page="...">`, etc.) — renaming any of these silently breaks routing, save flows, or smoke tests.

If a redesign genuinely needs to change one of the above, surface it in the spec as a **scope boundary** and split the migration into a dedicated sub-project.

## Branching, commits, PRs

- Branch from `origin/main`, not from another in-flight feature branch.
- One sub-project = one branch = one PR. If a sub-project must run after another (version sequencing or shared spec), say so explicitly in the spec.
- Commits in spec-then-plan-then-implementation order. Each plan task is typically one commit.
- Pre-commit hooks run; don't `--no-verify`.
- Don't force-push to `main`. Don't amend already-pushed commits.

### Commit messages

Imperative one-line summary, optional body explaining "why" not "what". End each commit with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

(Or the equivalent for whichever agent is running.)

## Tests

Tests are Node + Playwright smokes in `tests/`. Run individually with `node tests/<name>.js` (or `.mjs`).

Key smokes:

- `tests/version-smoke.js` — enforces the 4-anchor version invariant above.
- `tests/live-site-smoke.mjs` — Playwright e2e against `calc.recycleobject.ru` (configurable via `RO_LIVE_URL`).
- `tests/yandex-mirror-smoke.mjs` — same for `calc2.recycleobject.ru`.
- `tests/warehouse-migration-smoke.js`, `tests/warehouse-stress-smoke.mjs`, `tests/order-flow-smoke.js` — warehouse / order regression coverage.
- Per-module smokes: `tests/molds-smoke.js`, `tests/factual-smoke.js`, `tests/marketplaces-smoke.js`, `tests/tasks-smoke.js`, `tests/finance-smoke.js`, etc.

Run `node tests/version-smoke.js` before pushing any version-bump commit.

## External integrations

- **FinTablo** — used for finance (via API, `scripts/fintablo-sync.mjs`). We do not rebuild this in-house.
- **Точка bank** — `scripts/tochka-sync.mjs` runs as a separate sync job.
- **AmoCRM** — planned integration, not yet implemented. Placeholder `#leads` page exists in the menu cleanup.

## What not to do without asking first

- Don't drop Supabase tables in a single commit. Schema changes need a documented migration.
- Don't rewrite `js/calculator.js`, `js/warehouse.js`, or `js/app.js` end-to-end. They are large and well-trafficked; surgical edits only unless the spec explicitly authorizes a rewrite.
- Don't introduce new top-level dependencies / new files in `js/` without coordinating — there's no bundler, every script tag is hand-maintained in `index.html`.
- Don't change the smoke test selectors to make them pass — fix the underlying behavior or update the assertion intentionally.

## When in doubt

Read the spec file linked from the plan you're executing. Specs explicitly call out goals, non-goals, and out-of-scope follow-ups. If the spec says "out of scope", it's out of scope even if you spot related improvements while editing.

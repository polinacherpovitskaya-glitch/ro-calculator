# ops/web UX Pass — Backlog

**Created:** 2026-05-20
**Owner:** Polina
**Status:** Parked backlog — execute AFTER the 1:1 migration port lands in `ops/web`.

## Why this exists

The migration off Supabase+Vercel onto the `ops/` stack (see `docs/superpowers/specs/2026-05-15-ops-redesign-design.md`) is an explicit **1:1 functional port**. Its Non-Goals state verbatim: *"Не переписываем UI/UX. Структура страниц и логика — как сейчас, только на новом стеке."* Calculator and Orders are *"Critical 1:1 / бит-в-бит"*.

Consequence: `ops/web` (Vue 3 SPA) faithfully reproduces the **old frontend's UX problems** — duplicate buttons, cards that scroll the page to the bottom on click, small fonts, cluttered information architecture. These were never fixed by the migration because fixing them was deliberately out of scope (correctness and data-locality came first).

This backlog captures the UX work that was scoped during the 2026-05-15…18 sessions on the old `js/` frontend, **re-targeted at `ops/web`**. Do NOT implement these on the old `js/` frontend (it is retired at cutover). Do NOT inject them into the migration blocks (that breaks the migration's 1:1 / bit-for-bit / auto-merge discipline). Run this as its own initiative once the relevant `ops/web` views exist.

Each item should go through the normal brainstorm → spec → plan cycle when picked up. Two items already have full specs (see references) that need re-targeting from `js/` to the Vue views.

## Cross-cutting principles (apply to every view)

1. **Inline expansion, never scroll-to-bottom.** When a user clicks a card / row / pencil-edit, the detail panel opens inline directly under the clicked item. Today (and in the 1:1 port) clicking jumps the page to the bottom — Polina's #1 recurring complaint across Бланки, B2C, Orders, Analytics, Warehouse. Use accordion/expand-under-row by default; reserve modals/side-panels only when detail genuinely doesn't fit.
2. **Larger type, less density.** Old UI uses 10–14px labels and cramped rows; people misread under production speed. Default to a larger base font and more vertical padding; clearer typographic hierarchy. When a redesign keeps the old density, flag it explicitly.

## Per-module backlog

Mapping is old `js/` page → `ops/web` view(s). "Source": (P) = Polina stated pain, (A) = audit finding.

| Module | ops/web view(s) | Items | Source | Priority |
|---|---|---|---|---|
| **Warehouse** | `WarehouseListView`, `WarehouseItemView`, `WarehouseHistoryView`, `InventoryAuditView` | Remove duplicate toolbar buttons ("Приёмка из Китая", "Провести инвентаризацию"); inline "+ Новая инвентаризация" CTA in the Inventory view; resolve scattered imports + inventory-in-two-places IA; **never lose data/features** (highest-risk surface). Full detail spec: `docs/specs/2026-05-15-calc2-warehouse-ia-cleanup.md` (on closed branch `calc2-warehouse-ia-cleanup`). | P | High |
| **Calculator** | `OrderEditorView` | 7 audit findings: pendant-from-letters always discoverable (not only empty state); picker dropdowns scroll into view / flip when below fold; footer (totals+discount) uses same section styling; loading feedback when opening an order; ellipsis on long product names in collapsed cards; КП button visually distinct from Save; picker load errors show a retry. Full detail spec: `docs/specs/2026-05-18-calc2-calculator-audit-fixes.md` (on closed branch `calc2-calculator-audit-fixes`). | A | Medium |
| **Production calendar + launch queue** | `GanttView`, `ProductionCalendarView`, `ProductionPlanView` | Queue is "нечитаемая"; drag-drop right/left/down is broken. Biggest UX redo. Rethink the whole interaction. | P | High |
| **Hours / payroll** | *(no view yet in `ops/web` — gap to build)* | Split base hours vs overtime per employee as distinct totals; tiered rates (Женя 1–15h / 15–30h; Тая overtime); employee count must be variable (no hardcoding two people). See `memory project_employees`. | P | Medium |
| **Analytics** | *(no `factual`/analytics view yet — gap)* | Trim to what's actually used; inline-expand fix; larger font. | P | Medium |
| **Бланки / Молды** | `BlanksView`, `MoldsListView`, `MoldView` | Good overall — small fix: pencil-edit opens inline, not scroll-to-bottom. | P | Low |
| **Цвета** | `ColorsView` | Keep (used by external client site + calculator color picker). Add usage analytics — most popular colors. | P | Low |
| **B2C продажи** | `MarketplacesView` | Inline-expand under the product instead of jumping to bottom. | P | Low |
| **Китай** | `ChinaPurchasesView`, `ChinaPurchaseView`, `ChinaCatalogView`, `ShipmentsListView`, `ShipmentView` | "до коробки" reads like a new entity in the wrong place; "новая закупка" is mis-styled as a toggle. Clarify IA — what is a box vs a purchase vs a summary/list. | P | Medium |
| **Settings** | *(no settings view yet — gap)* | Audit for duplicates. Also: the menu cleanup moved the TPA live calculator and Monitoring into Settings tabs — carry that IA into `ops/web` settings. | P | Low |
| **Лиды (AmoCRM)** | `PlaceholderView` / new | Feature, not just UX: pull incoming leads via AmoCRM API, convert lead → order via the calculator (OrderEditorView). Depends on AmoCRM API access. See `memory project_external_integrations`. | P | Feature |

## Information-architecture decisions to carry into ops/web

The menu cleanup (merged to old frontend as `docs/specs/2026-05-15-calc2-menu-cleanup.md`) made IA decisions that should be reflected in `ops/web` navigation rather than porting the old 18-item flat menu:

- **Group the nav** into 5 sections: Каждый день / Производство / Справочники / Деньги и аналитика / Служебное.
- **Remove from nav:** База знаний (delete), Мониторинг (→ Settings tab), ТПА (→ Settings "Расчёт ТПА" utility), Проекты (hidden — note: `ops/web` currently has `ProjectsListView`; decide whether Projects should be surfaced at all, since Polina considers it unused).
- **Reserve** a "Лиды" nav slot for the AmoCRM feature.

> NB: `ops/web` already builds some modules Polina wanted de-emphasized (e.g., `ProjectsListView`) and is missing some she uses (no analytics/hours/settings/leads views found as of 2026-05-20). Reconcile this when the UX pass starts.

## Suggested sequencing (when unparked)

1. Cross-cutting inline-expansion + type-scale pass (touches many views; do as shared component conventions first).
2. Warehouse (highest daily pain + risk).
3. Production calendar + launch queue.
4. Hours/payroll (also needs the view built).
5. Calculator audit fixes (OrderEditorView).
6. China IA clarification.
7. Analytics, Бланки, Цвета, B2C, Settings polish.
8. AmoCRM leads (separate feature track, needs API access).

## References

- Migration design / Non-Goals: `docs/superpowers/specs/2026-05-15-ops-redesign-design.md`
- Migration playbook: `docs/superpowers/plans/2026-05-15-MIGRATION-PLAYBOOK.md`
- Menu cleanup spec (merged): `docs/specs/2026-05-15-calc2-menu-cleanup.md`
- Warehouse IA spec (closed branch `calc2-warehouse-ia-cleanup`): `docs/specs/2026-05-15-calc2-warehouse-ia-cleanup.md`
- Calculator audit spec (closed branch `calc2-calculator-audit-fixes`): `docs/specs/2026-05-18-calc2-calculator-audit-fixes.md`
- Agent conventions: `AGENTS.md`

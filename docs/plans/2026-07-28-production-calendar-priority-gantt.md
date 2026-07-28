# Plan — Production calendar priority Gantt

**Spec:** `docs/specs/2026-07-28-production-calendar-priority-gantt.md`
**Created:** 2026-07-28
**Status:** In progress

## Milestone 1 — Lock the product contract

- [x] Describe the unified queue-and-Gantt interaction.
- [x] Define the four-person production limit and worker allocation rules.
- [x] Mark the old queue, workshop summary, statistics, settings controls, and 36-hours chart for removal.
- [x] Preserve production holidays, order navigation, deadlines, readiness, and persisted priority.

**Gate:** The spec distinguishes person-hours from elapsed production time and keeps data/API compatibility.

## Milestone 2 — Make scheduling capacity deterministic

- [ ] Default production capacity to four people working nine hours per day.
- [ ] Cap both total production slots and per-order allocation at four people.
- [ ] Stop hidden legacy `active_workers_count` overrides from changing the calendar.
- [ ] Add regression coverage for a four-person order blocking the following priority item.

**Gate:** A 36-person-hour order assigned to four workers occupies one working day, and the next order starts on the next available working day.

## Milestone 3 — Replace the split interface with one priority Gantt

- [ ] Remove the separate launch queue, current-workshop summary, statistic cards, and capacity histogram.
- [ ] Render draggable order rows directly beside their Gantt bars.
- [ ] Add an inline 1–4 worker control and an explicit order-open button to every row.
- [ ] Keep blocked and review orders visible in a compact unscheduled section.
- [ ] Remove editable team-size and shift-duration controls from Settings while retaining production holidays.
- [ ] Add responsive styling and keep row/timeline alignment stable.

**Gate:** Reordering a row and changing its worker count saves the production plan and immediately recalculates all following dates.

## Milestone 4 — Validate and ship safely

- [ ] Update the production calendar smoke tests for the new contract.
- [ ] Run focused production, order-flow, settings, and version smoke tests.
- [ ] Fetch `origin/main`, choose a collision-free version, and update all four version anchors.
- [ ] Update cache-bust suffixes for every changed runtime asset.
- [ ] Review the final diff for accidental data/schema changes.

**Gate:** All focused tests pass, version anchors agree, and no destructive migration or data deletion is included.

## Rollback

This release changes only frontend code and scheduling defaults. The saved plan keeps the existing `order_ids`, `manual_start_dates`, and `parallel_workers` fields. Rolling back the deployment restores the prior interface without a database restore.

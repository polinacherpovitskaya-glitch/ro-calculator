# Plan — Production calendar priority Gantt

**Spec:** `docs/specs/2026-07-28-production-calendar-priority-gantt.md`
**Created:** 2026-07-28
**Status:** Complete

## Milestone 1 — Lock the product contract

- [x] Describe the unified queue-and-Gantt interaction.
- [x] Define the four-person production limit and worker allocation rules.
- [x] Mark the old queue, workshop summary, statistics, settings controls, and 36-hours chart for removal.
- [x] Preserve production holidays, order navigation, deadlines, readiness, and persisted priority.

**Gate:** The spec distinguishes person-hours from elapsed production time and keeps data/API compatibility.

## Milestone 2 — Make scheduling capacity deterministic

- [x] Default production capacity to four people working nine hours per day.
- [x] Cap both total production slots and per-order allocation at four people.
- [x] Stop hidden legacy `active_workers_count` overrides from changing the calendar.
- [x] Add regression coverage for a four-person order blocking the following priority item.

**Gate:** A 36-person-hour order assigned to four workers occupies one working day, and the next order starts on the next available working day.

## Milestone 3 — Replace the split interface with one priority Gantt

- [x] Remove the separate launch queue, current-workshop summary, statistic cards, and capacity histogram.
- [x] Render draggable order rows directly beside their Gantt bars.
- [x] Add an inline 1–4 worker control and an explicit order-open button to every row.
- [x] Keep blocked and review orders visible in a compact unscheduled section.
- [x] Remove editable team-size and shift-duration controls from Settings while retaining production holidays.
- [x] Add responsive styling and keep row/timeline alignment stable.

**Gate:** Reordering a row and changing its worker count saves the production plan and immediately recalculates all following dates.

## Milestone 4 — Validate and ship safely

- [x] Update the production calendar smoke tests for the new contract.
- [x] Run focused production, order-flow, settings, and version smoke tests.
- [x] Fetch `origin/main`, choose a collision-free version, and update all four version anchors.
- [x] Update cache-bust suffixes for every changed runtime asset.
- [x] Review the final diff for accidental data/schema changes.

**Gate:** All focused tests pass, version anchors agree, and no destructive migration or data deletion is included.

## Rollback

This release changes only frontend code and scheduling defaults. The saved plan keeps the existing `order_ids`, `manual_start_dates`, and `parallel_workers` fields. Rolling back the deployment restores the prior interface without a database restore.

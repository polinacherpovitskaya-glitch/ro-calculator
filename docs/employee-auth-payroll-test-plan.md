# Employee Auth Payroll Test Plan

## Source
- Task: перепроектировать логику `сотрудники + логины + часы + зарплата`, не потеряв уже сданные часы и закрыв реальные payroll-кейсы для hourly employee, semimonth salary threshold и management-to-production allocation.
- Plan file: `/private/tmp/ro-codex-push-sync.U4fKIO/docs/employee-auth-payroll-plan.md`
- Status file: `/private/tmp/ro-codex-push-sync.U4fKIO/docs/employee-auth-payroll-status.md`
- Related current regression doc: `/private/tmp/ro-codex-push-sync.U4fKIO/docs/auth-remediation-plan.md`
- Last updated: 2026-03-17

## Validation Scope
- In scope:
  - employee/auth identity mapping;
  - employee status semantics and editability;
  - login issuance/reset/disable as part of employee card;
  - preservation of historical time entries;
  - semimonth payroll logic for salary-covered hours;
  - hour-based indirect-to-production allocation for hybrid manager/producer;
  - regression safety for existing hourly employees.
- Out of scope in first wave:
  - full backend auth redesign beyond already documented hardening track;
  - accounting/tax compliance outside current product fields;
  - performance/load testing.

## Critical Fixtures
- `Женя`: active hourly production employee with current time entries.
- `Тая`: production employee with:
  - monthly net salary `70 000`;
  - monthly employer cost `89 862`;
  - included hours per month `120`;
  - included hours per semimonth `60`;
  - overtime `500 ₽/час`;
  - weekend/holiday `750 ₽/час`.
- `Лёша`: management employee with monthly employer cost `180 000` and a mix of:
  - zero production hours month;
  - order-linked production hours month;
  - internal хозяйственные production hours month.
- `Женя Г`: inactive or fired employee with historical hours and ambiguous auth linkage.
- At least one legacy time entry without perfect modern metadata, to verify migration safety.

## Test Levels

### Logic / Unit
- Verify canonical identity resolution:
  - prefer `employee_id`;
  - fallback to normalized name only when unambiguous;
  - unresolved conflicts stay unresolved, not auto-merged.
- Verify employee status rules:
  - `active` stays selectable;
  - `paused/inactive` hidden from new work assignment by default;
  - `fired` keeps history but blocks new login/work.
- Verify payroll profile math:
  - hourly employees unchanged;
  - semimonth threshold uses two independent buckets;
  - weekend/holiday rates bypass or override regular overtime as intended;
  - Lyosha indirect allocation only moves cost for actual production hours.
- Verify historical-hour preservation:
  - migration/backfill never drops entries;
  - unresolved worker mappings are surfaced explicitly.

### Integration
- `Settings -> Employee card`:
  - open employee;
  - inspect status;
  - enable/disable login;
  - issue/reset credentials;
  - save pages;
  - verify derived auth state.
- `Settings -> Employees/Logins migration`:
  - conflict employee detected;
  - manual exception preserved;
  - no silent overwrite of another login.
  - audit panel highlights orphan logins, orphan historical hours and employee/login mismatches;
  - safe relink appears only for exact matches and refuses to attach if employee already has another login.
- `TimeTrack -> Payroll`:
  - each employee is grouped into fixed semimonth rows `1-15` and `16-конец`;
  - first-half payout for Taya after 59, 60, 61 regular hours;
  - second-half payout resets threshold and repeats logic;
  - fixed salary itself does not appear in the hours payout table; only overtime/weekend/holiday extras do;
  - weekend/holiday rows pay correctly.
- `TimeTrack -> Daily status`:
  - only production employees appear in `Отчеты за сегодня`;
  - management users with time entries do not appear there.
- `TimeTrack -> Legacy import`:
  - first-half March 2026 legacy rows are imported automatically once;
  - `Женя Г` dates already entered manually are skipped to avoid duplicates.
- `TimeTrack -> Existing entry edit`:
  - open existing row;
  - change project/date/stage/hours;
  - save without deleting the row first;
  - confirm updated payload keeps the same `id`.
- `Indirect costs / plan-fact`:
  - Lyosha with zero production hours remains fully indirect;
  - Lyosha with production hours moves proportional cost to production buckets;
  - existing plan-fact totals do not drift unexpectedly.

### End-to-End / Smoke
- Open settings and confirm one employee-centric path:
  - employee status;
  - login access;
  - payroll profile.
- Issue a new login from employee card for a new person without manually inventing username/password.
- Reset access for an existing employee and confirm latest credentials display/flow still works.
- Add/view time entries for:
  - active employee;
  - inactive/fired historical employee;
  - Taya first-half and second-half cases;
  - Lyosha production and non-production cases.
- Open payroll summary and confirm:
  - hourly case unchanged;
  - Taya uses `60 + 60`;
  - Lyosha reallocates only factual production share.

## Negative Cases
- Two employees with similar names must not be auto-merged if `employee_id` evidence conflicts.
- Disabling login must not delete or hide historical hours.
- Re-activating an employee must not create a duplicate auth account.
- Safe relink must not bind a login to an employee who already has another account.
- A fired employee must stay visible in historical reports.
- Taya's overtime must not wait until `121st` hour of the whole month; it must start after `60th` regular hour in the current half.
- Taya's fixed semimonth salary must not be double-counted in the hours payout table.
- Weekend and holiday hours must not consume the regular `60-hour` bucket incorrectly, unless product rules explicitly say so.
- Lyosha's cost must not remain stuck at static `50%` after hours-based allocation is introduced.
- Existing hourly employees must not suddenly acquire salary-covered hours because of shared defaults.

## Acceptance Gates
- [ ] `for f in js/*.js; do node --check "$f"; done`
- [x] `node tests/auth-hardening-smoke.js`
- [x] `node tests/employee-auth-payroll-smoke.js`
- [x] `node tests/payroll-half-month-smoke.js`
- [x] `employee-auth-payroll-smoke` covers audit export and safe relink for exact-match orphan login
- [ ] `python3 -m http.server 4173`
- [ ] Manual smoke: `settings -> employee card -> access -> timetrack -> payroll`
- [ ] Regression smoke for `План-факт` / indirect costs if Lyosha allocation touches those modules

## Release / Demo Readiness
- [x] One employee card is the canonical place to understand status, access and pay rules.
- [ ] Historical hours remain visible after migration.
- [ ] New employee onboarding does not require manual username/password invention.
- [ ] `Женя Г`-type conflict is explainable from data, not hidden in separate lists.
- [x] `Логины` показывают audit summary и дают export для manual migration map.
- [x] Taya semimonth payroll can be shown for first and second salary payout separately.
- [x] Lyosha indirect-vs-production split is driven by real hours, not a magic localStorage percentage.
- [ ] Existing hourly payroll is unchanged for employees outside the redesign.

## Command Matrix
```sh
for f in js/*.js; do node --check "$f"; done
rg -n "FIRED_DATES|auth_accounts_json|employee_id|worker_name|pay_base_hours_month|ro_production_shares" js/*.js
node tests/auth-hardening-smoke.js
node tests/employee-auth-payroll-smoke.js
node tests/payroll-half-month-smoke.js
python3 -m http.server 4173
```

## Open Risks
- Semimonth payroll may require explicit UI for "current half-month" to stay understandable during live payout.
- Historical time entries without `employee_id` may require a manual exception queue.
- Lyosha allocation may affect `План-факт` and indirect reports more broadly than the settings/timetrack perimeter.
- If status semantics are not clarified early, operator confusion can survive even after data migration.

import assert from 'node:assert/strict';
import { buildMonthLoad } from '../scripts/production-floor-publish.mjs';

// Deterministic: fix today mid-month so working-day pace is stable.
const today = new Date(2026, 6, 9); // 9 July 2026 (Thu)
const holidays = new Set();
const settings = { workers_count: '3.5', hours_per_worker: '168', work_load_ratio: '0.71' };
const te = [
  { date: '2026-07-01', hours: 8 }, { date: '2026-07-03', hours: 10 },
  { date: '2026-07-08', hours: 6 }, { date: '2026-06-30', hours: 99 }, // previous month — excluded
];

const m = buildMonthLoad(settings, te, today, holidays);
assert.equal(m.plan_hours, 417.48, 'plan_hours = 3.5*168*0.71');
assert.equal(m.closed, 24, 'closed = only July entries (8+10+6)');
assert.equal(m.remaining, 393.48, 'remaining = plan_hours - closed');
assert.equal(m.pct, 6, 'pct = round(24/417.48*100)');
assert.ok(m.expected_by_today > 0 && m.expected_by_today < m.plan_hours, 'expected_by_today between 0 and plan_hours');
assert.ok(['ahead', 'on_track', 'behind'].includes(m.status), 'status is one of the three');
assert.equal(m.month_label, 'Июль', 'month label is the current month');

// No settings -> null (widget hidden).
assert.equal(buildMonthLoad({}, te, today, holidays), null, 'no settings -> null');

// Ahead / behind classification around the pace line.
const bal = buildMonthLoad(settings, [], today, holidays);
assert.equal(bal.closed, 0, 'no entries -> 0 closed');
assert.equal(bal.status, 'behind', 'zero closed mid-month -> behind');

console.log('floor-month-load-smoke: OK');

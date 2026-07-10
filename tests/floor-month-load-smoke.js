import assert from 'node:assert/strict';
import { buildMonthLoad } from '../scripts/production-floor-publish.mjs';

const r = x => Math.round(x * 100) / 100;

// Deterministic: fix today mid-month so working-day pace is stable.
const today = new Date(2026, 6, 9); // 9 July 2026 (Thu)
const holidays = new Set();
const settings = { workers_count: '3.5', hours_per_worker: '168', work_load_ratio: '0.71' }; // capacity 417.48
const te = [
  { date: '2026-07-01', hours: 8 }, { date: '2026-07-03', hours: 10 },
  { date: '2026-07-08', hours: 6 }, { date: '2026-06-30', hours: 99 }, // previous month — excluded
];
const soldHours = 190; // planned hours of confirmed pipeline

const m = buildMonthLoad(settings, te, soldHours, today, holidays);
assert.equal(m.capacity, 417.48, 'capacity = 3.5*168*0.71');
assert.equal(m.sold, 190, 'sold = pipeline planned hours passed in');
assert.equal(m.closed, 24, 'closed = only July entries (8+10+6)');
assert.equal(m.sold_pct, Math.round(190 / 417.48 * 100), 'sold_pct = sold/capacity');
assert.equal(m.closed_pct, Math.round(24 / 417.48 * 100), 'closed_pct = closed/capacity');
assert.equal(m.free, 227.48, 'free = capacity - sold (under-booked)');
assert.equal(m.overbooked, 0, 'not overbooked when sold < capacity');
assert.equal(m.sold_remaining, 166, 'sold_remaining = sold - closed');
assert.equal(m.month_label, 'Июль', 'month label is the current month');
assert.ok(['ahead', 'on_track', 'behind'].includes(m.status), 'status is one of the three');

// Overbooked case: sold > capacity.
const ob = buildMonthLoad(settings, te, 600, today, holidays);
assert.equal(ob.free, 0, 'no free capacity when overbooked');
assert.equal(ob.overbooked, r(600 - 417.48), 'overbooked = sold - capacity');

// No settings -> null (widget hidden).
assert.equal(buildMonthLoad({}, te, soldHours, today, holidays), null, 'no settings -> null');

console.log('floor-month-load-smoke: OK');

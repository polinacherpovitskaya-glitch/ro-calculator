const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'production_load.js'), 'utf8');

assert.match(source, /pl-seg\.pl-remaining\{background:#388bfd/, 'remaining work segment must be blue');
assert.match(source, /const bookedPct = _clampLoad\(roLoadNum\(view\.scheduledPct\)/, 'blue segment must use booked workload');
assert.match(source, /const remainingPct = _clampLoad\(bookedPct - donePct/, 'blue segment must begin after fact');
assert.match(source, /осталось по заказам \$\{_hrsLoad\(remainingHours\)\} ч/, 'legend must expose remaining order hours without hover');
assert.match(source, /pl-seg pl-remaining/, 'renderer must insert the blue segment into the track');

console.log('production-load-bar-render-smoke: OK');

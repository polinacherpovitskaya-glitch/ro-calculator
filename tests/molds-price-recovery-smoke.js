const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const supabaseJs = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

const latestBaselineSection = supabaseJs.split('const LEGACY_HISTORICAL_BLANK_PRICE_BASELINES')[0];

assert.match(
    supabaseJs,
    /const MOLDS_DATA_VERSION = 11;/,
    'MOLDS_DATA_VERSION should be bumped for the blank-price recovery patch',
);

assert.match(
    latestBaselineSection,
    /'Бланк сердце': Object\.freeze\(\{ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 \}\)/,
    'Latest blank baseline must contain restored 2026-03-26 prices for heart blanks',
);

assert.match(
    latestBaselineSection,
    /'Карабин': Object\.freeze\(\{ 50: 690, 100: 570, 300: 470, 500: 390, 1000: 350, 3000: 290 \}\)/,
    'Latest blank baseline must contain restored 2026-03-26 prices for carabiners',
);

assert.match(
    latestBaselineSection,
    /'Новый кардхолдер': Object\.freeze\(\{ 50: 1060, 100: 880, 300: 760, 500: 690, 1000: 620, 3000: 585 \}\)/,
    'Latest blank baseline must contain restored 2026-03-26 prices for the new cardholder',
);

assert.match(
    supabaseJs,
    /Smart merge: only push local records that are missing in Supabase\./,
    'loadMolds should no longer overwrite existing Supabase blank prices from browser-local cache',
);

assert.match(
    supabaseJs,
    /if \(!sbExists\) \{/,
    'Local mold merge must only upsert records that are absent in Supabase',
);

console.log('molds price recovery smoke passed');

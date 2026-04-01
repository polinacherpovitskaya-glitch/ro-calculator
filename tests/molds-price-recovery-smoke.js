const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const supabaseJs = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const moldsJs = fs.readFileSync(path.join(root, 'js', 'molds.js'), 'utf8');

const latestBaselineSection = supabaseJs.split('const LEGACY_HISTORICAL_BLANK_PRICE_BASELINES')[0];

assert.match(
    supabaseJs,
    /const MOLDS_DATA_VERSION = 12;/,
    'MOLDS_DATA_VERSION should be bumped for the manual blank-price deletion fix',
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

assert.match(
    moldsJs,
    /disable_historical_blank_price_recovery: false/,
    'Mold editor should persist the manual blank-price recovery flag',
);

assert.match(
    moldsJs,
    /if \(!Object\.keys\(mold\.custom_prices\)\.length\) \{\s*mold\.disable_historical_blank_price_recovery = true;\s*\}/,
    'Saving a blank with all prices cleared should mark historical recovery as disabled',
);

const context = vm.createContext({
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    setTimeout,
    clearTimeout,
    localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {},
        clear() {},
        key() { return null; },
        get length() { return 0; },
    },
    window: {},
    document: {},
    supabase: { createClient() { return {}; } },
    Blob: function Blob() {},
    atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
    App: { toast() {} },
});
context.window = context;

vm.runInContext(supabaseJs, context, { filename: 'js/supabase.js' });

const recovered = vm.runInContext(`_withHistoricalBlankPriceRecovery({
    name: 'Шар',
    custom_prices: {},
    disable_historical_blank_price_recovery: false,
})`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(recovered.mold.custom_prices)),
    { 50: 2365, 100: 2030, 300: 1760, 500: 1600, 1000: 1450, 3000: 1075 },
    'Historical recovery should still restore baseline prices when no manual opt-out is set',
);

const preservedEmpty = vm.runInContext(`_withHistoricalBlankPriceRecovery({
    name: 'Шар',
    custom_prices: {},
    disable_historical_blank_price_recovery: true,
})`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(preservedEmpty.mold.custom_prices)),
    {},
    'Historical recovery must not re-add prices that the user manually cleared',
);

console.log('molds price recovery smoke passed');

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
    /const MOLDS_DATA_VERSION = 15;/,
    'MOLDS_DATA_VERSION should be bumped for the historical blank-price cleanup',
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
    /disable_historical_blank_price_recovery:\s*!!mold\.disable_historical_blank_price_recovery/,
    'Mold editor should persist the manual blank-price recovery flag',
);

assert.match(
    moldsJs,
    /disable_historical_blank_price_recovery:\s*!useManualPrices/,
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

const recoveredSeed = vm.runInContext(`_applyAutomaticMoldRepairs({
    name: 'Шар',
    custom_prices: { 50: 2365, 100: 2030, 300: 1760, 500: 1600, 1000: 1450, 3000: 1075 },
    custom_margins: {},
    disable_historical_blank_price_recovery: false,
})`, context);
assert.equal(
    recoveredSeed.changed,
    true,
    'Automatic mold repairs should strip auto-seeded catalog prices from blanks',
);
assert.deepEqual(
    JSON.parse(JSON.stringify(recoveredSeed.mold.custom_prices)),
    {},
    'Historical catalog seed should no longer survive as custom blank prices',
);
assert.equal(
    recoveredSeed.mold.use_manual_prices,
    false,
    'Historical catalog seed should no longer force the blank into manual pricing mode',
);
assert.equal(
    recoveredSeed.mold.disable_historical_blank_price_recovery,
    true,
    'Historical catalog seed cleanup should mark the blank as explicitly formula-driven',
);

const preservedEmpty = vm.runInContext(`_applyAutomaticMoldRepairs({
    name: 'Шар',
    custom_prices: {},
    disable_historical_blank_price_recovery: true,
})`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(preservedEmpty.mold.custom_prices)),
    {},
    'Historical recovery must not re-add prices that the user manually cleared',
);

const templateMirror = vm.runInContext(`_moldToTemplate({
    name: 'NFC Квадрат',
    category: 'blank',
    custom_prices: { 50: 1250, 100: 890 },
    custom_margins: {},
    disable_historical_blank_price_recovery: false,
    use_manual_prices: false,
})`, context);
assert.equal(
    templateMirror.use_manual_prices,
    false,
    'Template mirror must not expose auto-seeded catalog prices as manual overrides',
);

const nfcCleanup = vm.runInContext(`_withUnexpectedNfcHardwareCleanup({
    name: 'Карабин',
    category: 'blank',
    hw_name: 'NFC метка',
    hw_price_per_unit: 6.22,
    hw_delivery_total: 14,
    hw_speed: 120,
    hw_source: 'warehouse',
    hw_warehouse_item_id: 55,
    hw_warehouse_sku: 'NFC',
})`, context);
assert.equal(nfcCleanup.changed, true, 'Unexpected NFC hardware should be stripped from non-NFC molds');
assert.deepEqual(
    JSON.parse(JSON.stringify(nfcCleanup.mold)),
    {
        name: 'Карабин',
        category: 'blank',
        hw_name: '',
        hw_price_per_unit: 0,
        hw_delivery_total: 0,
        hw_speed: null,
        hw_source: 'custom',
        hw_warehouse_item_id: null,
        hw_warehouse_sku: '',
    },
    'Unexpected NFC cleanup should reset the hardware fields back to empty custom values',
);

const nfcNamedMold = vm.runInContext(`_withUnexpectedNfcHardwareCleanup({
    name: 'NFC Камушек',
    category: 'nfc',
    hw_name: 'NFC',
    hw_price_per_unit: 6.22,
})`, context);
assert.equal(nfcNamedMold.changed, false, 'Named NFC molds must keep their NFC hardware');

const parsedFragmented = vm.runInContext(`_parseStoredMoldRow({
    id: 123,
    name: 'Бланк сердце',
    mold_data: [
        '{\"name\":\"Бланк сердце\",\"category\":\"blank\",\"hw_name\":\"NFC метка\"}',
        { custom_prices: { 50: 550 } },
        { photo_url: 'https://example.com/heart.jpg' }
    ],
    updated_at: '2026-04-21T00:00:00.000Z',
})`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(parsedFragmented)),
    {
        id: 123,
        name: 'Бланк сердце',
        category: 'blank',
        hw_name: 'NFC метка',
        custom_prices: { 50: 550 },
        photo_url: 'https://example.com/heart.jpg',
        updated_at: '2026-04-21T00:00:00.000Z',
    },
    'Fragmented mold_data arrays should merge into a normal mold object instead of looking empty',
);

console.log('molds price recovery smoke passed');

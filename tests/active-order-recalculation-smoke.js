const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
const context = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, Set });
vm.runInContext(`${source}\nglobalThis.__activeOrderTest = { getItemSetupHours, calculateItemCost, getOrderLiveCalculatorSnapshot };`, context, {
    filename: 'js/calculator.js',
});

const { getItemSetupHours, calculateItemCost, getOrderLiveCalculatorSnapshot } = context.__activeOrderTest;
assert.equal(
    context.getProductionParams({}).setupHoursCustom,
    1,
    'the production default for a custom mold is one hour when no legacy setting is stored',
);
const params = {
    setupHoursBlank: 0.5,
    setupHoursCustom: 1,
    wasteFactor: 1,
    fotPerHour: 100,
    indirectPerHour: 0,
    indirectCostMode: 'all',
    plasticCostPerKg: 0,
    moldBaseCost: 0,
    cuttingSpeed: 0,
    nfcWriteSpeed: 0,
    nfcTagCost: 0,
    taxRate: 0,
    charityRate: 0,
    commercialRate: 0,
    vatRate: 0,
    plasticHours: 100,
    packagingHours: 100,
};

assert.equal(
    getItemSetupHours({ is_blank_mold: true, colors: [{ id: 1 }, { id: 2 }] }, params),
    1,
    'blank has only 0.5 h for each distinct colour',
);
assert.equal(
    getItemSetupHours({ is_blank_mold: false, extra_molds: 2, colors: [{ id: 1 }, { id: 2 }] }, params),
    4,
    'custom has 1 h for each of three forms plus 0.5 h for each colour',
);
assert.equal(
    getItemSetupHours({ is_blank_mold: false, base_mold_in_stock: true, colors: [{ id: 1 }, { id: 2 }] }, params),
    1,
    'a repeated custom mold from stock has no form setup but still needs each colour change',
);
assert.equal(
    getItemSetupHours({ is_blank_mold: false, base_mold_in_stock: true, extra_molds: 2, colors: [{ id: 1 }, { id: 2 }] }, params),
    3,
    'stock base mold skips setup while each additional new mold adds one hour',
);
assert.equal(
    getItemSetupHours({ is_blank_mold: false, setup_hours_override: 0.75, colors: [{ id: 1 }, { id: 2 }] }, params),
    1.5,
    'an explicit legacy setup override remains unchanged',
);

const cost = calculateItemCost({
    quantity: 100,
    pieces_per_hour: 100,
    weight_grams: 0,
    is_blank_mold: false,
    extra_molds: 2,
    colors: [{ id: 1 }, { id: 2 }],
}, params);
assert.equal(cost.hoursPlastic, 5, 'production hours include four setup hours plus one runtime hour');

const templates = [{
    id: 9,
    name: 'Catalog blank',
    pph_actual: 33,
    weight_grams: 20,
    cost_cny: 800,
    cny_rate: 12.5,
    delivery_cost: 3000,
    mold_count: 1,
}];
const snapshot = getOrderLiveCalculatorSnapshot({}, [{
    item_type: 'product',
    template_id: 9,
    product_name: 'Custom with an old catalog link',
    is_blank_mold: false,
    quantity: 80,
    pieces_per_hour: 80,
    weight_grams: 12,
    sell_price_item: 100,
}, {
    item_type: 'product',
    template_id: 9,
    is_blank_mold: true,
    quantity: 80,
    pieces_per_hour: 1,
    weight_grams: 1,
    sell_price_item: 100,
}], params, templates);

assert.equal(snapshot.products[0].pieces_per_hour, 80, 'custom item keeps its own productivity');
assert.equal(snapshot.products[0].is_blank_mold, false, 'custom item remains custom');
assert.equal(snapshot.products[1].pieces_per_hour, 33, 'real blank uses the current catalog productivity');
assert.equal(snapshot.products[1].weight_grams, 20, 'real blank uses the current catalog weight');

console.log('active-order-recalculation-smoke: OK');

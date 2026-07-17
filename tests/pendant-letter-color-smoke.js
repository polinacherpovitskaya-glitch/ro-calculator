import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'js', 'calculator.js'), 'utf8');
const letterBlank = {
    id: 30,
    pph_actual: 100,
    weight_grams: 10,
    cost_cny: 0,
    cny_rate: 0,
    delivery_cost: 0,
    mold_count: 1,
    hw_name: '',
    hw_price_per_unit: 0,
    hw_delivery_total: 0,
    hw_speed: 0,
};
const sandbox = {
    console, Math, Date, JSON, Number, String, Array, Object, Set,
    Molds: { allMolds: [letterBlank] },
    App: { templates: [letterBlank] },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'js/calculator.js' });

const actual = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    const params = {
        wasteFactor: 1.1,
        setupHoursBlank: 0.5,
        setupHoursCustom: 2,
        fotPerHour: 100,
        indirectPerHour: 0,
        indirectCostMode: 'all',
        plasticCostPerKg: 0,
        moldBaseCost: 0,
        cuttingSpeed: 300,
        taxRate: 0,
        charityRate: 0,
        commercialRate: 0,
        vatRate: 0,
    };
    const coloured = {
        quantity: 50,
        elements: [
            { char: 'E', color: 'Белый' },
            { char: 'L', color: 'Белый' },
            { char: 'E', color: 'Красный' },
            { char: 'M', color: 'Белый' },
            { char: 'E', color: 'Белый' },
            { char: 'N', color: 'Белый' },
            { char: 'T', color: 'Белый' },
        ],
        cords: [],
        carabiners: [],
        _totalSellPerUnit: 100,
    };
    const oneColour = {
        ...coloured,
        elements: coloured.elements.map(element => ({ char: element.char })),
    };
    return {
        coloured: {
            metrics: getPendantLetterBlankMetrics(350, params, coloured),
            result: calculatePendantCost(coloured, params),
        },
        oneColour: getPendantLetterBlankMetrics(350, params, oneColour),
    };
})())`, sandbox));

assert.deepEqual(
    actual.coloured.metrics.colorGroups.map(group => ({ color: group.color, quantity: group.quantity })),
    [{ color: 'Белый', quantity: 300 }, { color: 'Красный', quantity: 50 }],
    'letters must be batched by their actual colour, not by the full pendant quantity',
);
assert.equal(actual.coloured.metrics.hoursPlastic, 4.85, 'two colour batches receive two 0.5 h setups');
assert.equal(actual.coloured.metrics.hoursCutting, 1.28);
assert.equal(actual.coloured.metrics.hoursPlasticZone, 6.13);
assert.equal(actual.coloured.result.hoursPlasticZone, 6.13, 'pendant load must include all colour batches');
assert.equal(actual.coloured.result.totalCost, 612.5, 'cost must use summed colour batches, not a rounded average');
assert.equal(actual.oneColour.hoursPlastic, 4.35, 'legacy no-colour pendants stay one conservative batch');
assert.equal(actual.oneColour.hoursPlasticZone, 5.63, 'actual batch hours must not be scaled down from a price tier');

console.log('pendant-letter-color-smoke: OK');

import assert from 'node:assert/strict';
import { buildRecalculationPlan, loadEngine, resolveLegacyBlankTemplateAliases, templateFromMoldRow } from '../scripts/recalculate-active-orders.mjs';

const templates = [{ id: 10, pph_actual: 50, weight_grams: 12 }];
const orders = [{
    id: 1,
    status: 'sample',
    total_hours_plan: 1,
    total_revenue: 1000,
    total_margin: 100,
    calculator_data: JSON.stringify({ discount_mode: 'percent', discount_value: 10 }),
}];
const itemRows = [{
    id: 101,
    order_id: 1,
    item_number: 1,
    item_data: JSON.stringify({
        item_type: 'product', template_id: 10, is_blank_mold: true,
        pieces_per_hour: 20, weight_grams: 3, quantity: 100, sell_price_item: 10,
    }),
}, {
    id: 102,
    order_id: 1,
    item_number: 2,
    item_data: JSON.stringify({
        item_type: 'product', template_id: 10, is_blank_mold: false,
        pieces_per_hour: 80, weight_grams: 30, quantity: 100, sell_price_item: 10,
    }),
}];

const engine = {
    getProductionParams() {
        return {
            setupHoursBlank: 0.5, setupHoursCustom: 1, indirectPerHour: 100,
            taxRate: 0, commercialRate: 0, charityRate: 0, vatRate: 0.05,
        };
    },
    getOrderLiveCalculatorSnapshot(order, items, params, currentTemplates) {
        const catalog = new Map(currentTemplates.map(template => [String(template.id), template]));
        const products = items.map(item => {
            const template = catalog.get(String(item.template_id));
            const next = { ...item };
            if (next.is_blank_mold && template) {
                next.pieces_per_hour = template.pph_actual;
                next.weight_grams = template.weight_grams;
            }
            next.result = {
                costTotal: next.is_blank_mold ? 11 : 22,
                costFot: 1, costIndirect: 2, costPlastic: 3, costMoldAmortization: 4,
                costDesign: 0, costCutting: 0, costCuttingIndirect: 0, costNfcTag: 0,
                costNfcProgramming: 0, costNfcIndirect: 0, costBuiltinAssembly: 0,
                costBuiltinAssemblyIndirect: 0, costBuiltinHw: 0, costBuiltinHwIndirect: 0,
                costPrinting: 0, costDelivery: 1, hoursPlastic: 2, hoursCutting: 0,
                hoursNfc: 0, hoursAssemblyZone: 0,
            };
            return next;
        });
        return {
            products, hardwareItems: [], packagingItems: [], pendantItems: [],
            summary: { grossRevenue: 2000, discountAmount: 200, discountPercent: 10, totalRevenue: 1800, totalEarned: 720, marginPercent: 40, totalWithVat: 1890 },
            load: { totalHours: 12, hoursPlasticTotal: 12, hoursPackagingTotal: 0, hoursHardwareTotal: 0, plasticLoadPercent: 12 },
            revenue: 1800, marginPercent: 40, hours: 12,
        };
    },
};

const plan = buildRecalculationPlan({ orders, itemRows, settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z' });
assert.equal(plan.orders.length, 1);
assert.equal(plan.after.hours, 12);
assert.equal(plan.after.revenue, 1000, 'a saved commercial sale amount is not repriced');
assert.equal(plan.after.margin, -80, 'margin uses the saved sale amount and recalculated production cost');
assert.equal(plan.before.hours, 1, 'the report retains the pre-recalculation header totals');
assert.equal(plan.before.revenue, 1000, 'the report retains pre-recalculation revenue');
assert.equal(plan.before.margin, 100, 'the report retains pre-recalculation margin');

const [blank, custom] = plan.orders[0].itemPatches.map(entry => JSON.parse(entry.patch.item_data));
assert.equal(blank.pieces_per_hour, 50, 'only the explicit blank receives the current catalog PPH');
assert.equal(blank.weight_grams, 12, 'only the explicit blank receives the catalog weight');
assert.equal(custom.pieces_per_hour, 80, 'custom keeps its own PPH even with template_id');
assert.equal(custom.weight_grams, 30, 'custom keeps its own weight even with template_id');
assert.equal(plan.orders[0].headerPatch.total_cost, 1080);
assert.equal(plan.orders[0].headerPatch.total_margin, -80);
assert.equal(plan.orders[0].headerPatch.margin_percent, -8);

const zeroRevenueDraftPlan = buildRecalculationPlan({
    orders: [{ ...orders[0], id: 6, status: 'draft', total_revenue: 0, total_margin: 0 }],
    itemRows: itemRows.map(row => ({ ...row, id: row.id + 500, order_id: 6 })),
    settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z',
});
assert.equal(zeroRevenueDraftPlan.after.revenue, 1800, 'an unsaved zero-revenue draft is filled from its explicit line prices');

const emptyDraftPlan = buildRecalculationPlan({
    orders: [{ id: 2, status: 'draft', total_hours_plan: 0, total_revenue: 0, total_margin: 0, calculator_data: '{}' }],
    itemRows: [{ id: 201, order_id: 2, item_number: 1, item_data: JSON.stringify({ item_type: 'product' }) }],
    settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z',
});
assert.equal(emptyDraftPlan.orders.length, 0, 'an untouched technical draft row is never saved as a zeroed calculation');
assert.deepEqual(emptyDraftPlan.skipped, [{ id: 2, reason: 'empty_draft' }], 'the dry-run explicitly reports skipped empty drafts');

const emptyHeaderDraftPlan = buildRecalculationPlan({
    orders: [{ id: 3, status: 'draft', total_hours_plan: 0, total_revenue: 0, total_margin: 0, calculator_data: '{}' }],
    itemRows: [], settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z',
});
assert.deepEqual(emptyHeaderDraftPlan.skipped, [{ id: 3, reason: 'empty_draft' }], 'an untouched draft header without items is also left intact');

const emptyBlankChoicePlan = buildRecalculationPlan({
    orders: [{ id: 4, status: 'draft', total_hours_plan: 0, total_revenue: 0, total_margin: 0, calculator_data: '{}' }],
    itemRows: [{ id: 401, order_id: 4, item_number: 1, item_data: JSON.stringify({ item_type: 'product', is_blank_mold: true }) }],
    settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z',
});
assert.deepEqual(emptyBlankChoicePlan.skipped, [{ id: 4, reason: 'empty_draft' }], 'a default blank toggle without an actual blank remains an untouched draft');

const unlinkedBlankDraftPlan = buildRecalculationPlan({
    orders: [{ id: 5, status: 'draft', total_hours_plan: 4, total_revenue: 0, total_margin: -100, calculator_data: '{}' }],
    itemRows: [{ id: 501, order_id: 5, item_number: 1, item_data: JSON.stringify({ item_type: 'product', is_blank_mold: true, product_name: 'Unknown blank', quantity: 10, pieces_per_hour: 15 }) }],
    settings: {}, templates, engine, nowIso: '2026-07-17T12:00:00.000Z',
});
assert.deepEqual(unlinkedBlankDraftPlan.skipped, [{ id: 5, reason: 'blank_without_catalog_template' }], 'a meaningful blank without a catalogue link stays untouched for manual correction');

const aliases = resolveLegacyBlankTemplateAliases([{ id: 31, name: 'Буквы', pph_actual: 120, weight_grams: 10 }]);
assert.equal(aliases.find(template => template.id === 30)?.pph_actual, 120, 'the retired Latin-letter ID resolves to the current letter blank only in memory');

const cardholderAliases = resolveLegacyBlankTemplateAliases([{ id: 15, name: 'Новый кардхолдер', pph_actual: 18, weight_grams: 30 }]);
assert.equal(cardholderAliases.find(template => template.id === 18)?.pph_actual, 18, 'the removed “Картхолдер нью” resolves only in memory to its live replacement');

const repairedCatalogTemplate = templateFromMoldRow({
    id: 99,
    mold_data: [
        '{"name":"legacy catalog row","pph_actual":42,"weight_grams":3}',
        { template_url: 'duplicate legacy suffix' },
    ],
});
assert.equal(repairedCatalogTemplate.id, 99, 'catalog row ID still comes from its table row');
assert.equal(repairedCatalogTemplate.pph_actual, 42, 'known non-JSON catalog suffix is safely ignored');

const letterTemplate = {
    id: 30,
    pph_actual: 100,
    weight_grams: 10,
    cost_cny: 0,
    cny_rate: 0,
    delivery_cost: 0,
    mold_count: 1,
};
const liveEngine = loadEngine();
liveEngine.setCatalog([letterTemplate]);
const pendantSnapshot = liveEngine.getOrderLiveCalculatorSnapshot({}, [{
    id: 501,
    item_type: 'pendant',
    quantity: 50,
    item_data: JSON.stringify({
        elements: [
            { char: 'E', color: 'white' }, { char: 'L', color: 'white' },
            { char: 'E', color: 'red' }, { char: 'M', color: 'white' },
            { char: 'E', color: 'white' }, { char: 'N', color: 'white' },
            { char: 'T', color: 'white' },
        ],
        cords: [], carabiners: [], _totalSellPerUnit: 100,
    }),
}], {
    wasteFactor: 1.1, setupHoursBlank: 0.5, fotPerHour: 100,
    indirectPerHour: 0, indirectCostMode: 'all', plasticCostPerKg: 0,
    moldBaseCost: 0, cuttingSpeed: 300, taxRate: 0, charityRate: 0,
    commercialRate: 0, vatRate: 0,
}, [letterTemplate]);
assert.equal(
    pendantSnapshot.pendantItems[0].result.hoursPlasticZone,
    6.13,
    'CLI engine must receive catalogue blanks before recalculating pendant letters',
);

console.log('recalculate-active-orders-smoke: OK');

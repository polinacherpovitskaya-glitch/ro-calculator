import assert from 'node:assert/strict';
import { buildRecalculationPlan } from '../scripts/recalculate-active-orders.mjs';

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
        return { setupHoursBlank: 0.5, setupHoursCustom: 2, indirectPerHour: 100 };
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
assert.equal(plan.after.revenue, 1800);
assert.equal(plan.after.margin, 720);

const [blank, custom] = plan.orders[0].itemPatches.map(entry => JSON.parse(entry.patch.item_data));
assert.equal(blank.pieces_per_hour, 50, 'only the explicit blank receives the current catalog PPH');
assert.equal(blank.weight_grams, 12, 'only the explicit blank receives the catalog weight');
assert.equal(custom.pieces_per_hour, 80, 'custom keeps its own PPH even with template_id');
assert.equal(custom.weight_grams, 30, 'custom keeps its own weight even with template_id');
assert.equal(plan.orders[0].headerPatch.total_margin, 720);
assert.equal(plan.orders[0].headerPatch.margin_percent, 40);

console.log('recalculate-active-orders-smoke: OK');

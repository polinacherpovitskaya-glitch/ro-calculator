const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const context = vm.createContext({ console, Math, Number, String, Object, Array, JSON, Set });
vm.runInContext(`${read('js/calculator.js')}\nglobalThis.__purpose = {
    normalizeProductionPurpose,
    isNonCommercialProductionPurpose,
    getProductionPurposeMeta,
    applyProductionPurposeToOrderSummary,
};`, context, { filename: 'calculator.js' });
const engine = context.__purpose;

// «Маркетинг» — свой тип, а не «Клиентский заказ» по умолчанию.
assert.equal(engine.normalizeProductionPurpose('marketing'), 'marketing');
assert.equal(engine.normalizeProductionPurpose(' Marketing '), 'marketing');
assert.equal(engine.isNonCommercialProductionPurpose('marketing'), true, 'gifts and promo are not sold');
const marketing = engine.getProductionPurposeMeta('marketing');
assert.equal(marketing.label, 'Маркетинг: подарки, промо, раздача');
assert.equal(marketing.shortLabel, 'Маркетинг');
assert.equal(marketing.icon, '✦');

// Подписи прежних некоммерческих типов не поменялись: их теперь берут из одного места.
const rework = engine.getProductionPurposeMeta('rework');
const stock = engine.getProductionPurposeMeta('stock_sample');
assert.equal(`${rework.icon} ${rework.shortLabel}`, '↻ Переделка брака');
assert.equal(`${rework.icon} ${rework.label}`, '↻ Переделка брака');
assert.equal(`${stock.icon} ${stock.shortLabel}`, '▦ Сток / образец');
assert.equal(`${stock.icon} ${stock.label}`, '▦ Сток / внутренний образец');

// Выручки нет, все затраты — расход; тираж не размечается.
const summary = { totalRevenue: 50000, grossRevenue: 50000, marginPercent: 30, stockQty: 10, freeQty: 5 };
const items = [{ quantity: 50, result: { costTotal: 886.62 } }];
const hardware = [{ qty: 50, result: { costPerUnit: 25.47 } }];
const spent = engine.applyProductionPurposeToOrderSummary(summary, 'marketing', items, hardware, [], []);
assert.equal(spent.productionPurpose, 'marketing');
assert.equal(spent.totalRevenue, 0);
assert.equal(spent.marginPercent, 0);
assert.equal(spent.stockQty, 0);
assert.equal(spent.freeQty, 0);
assert.equal(spent.totalEarned, -45604.5, 'the whole cost is the marketing spend');

// В калькуляторе маркетинг стоит рядом с «Клиентский заказ» и «Сток».
const html = read('index.html');
const selectStart = html.indexOf('id="calc-production-purpose"');
assert.ok(selectStart > 0, 'the purpose select exists');
const select = html.slice(selectStart, html.indexOf('</select>', selectStart));
const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(values, ['commercial', 'stock_sample', 'marketing', 'leftover_assembly', 'rework']);
assert.match(select, /<option value="marketing">Маркетинг: подарки, промо, раздача<\/option>/);

// Списки, написанные руками, знают маркетинг.
const productionLoad = read('js/production_load.js');
assert.match(productionLoad, /\['rework', 'stock_sample', 'marketing'\]\.includes/, 'production load fallback list');
assert.match(productionLoad, /purpose === 'marketing'/, 'production load treats marketing as non-commercial');
assert.match(read('js/order-detail.js'), /Расход на маркетинг/, 'order card names the marketing spend');
assert.doesNotMatch(read('js/orders.js'), /purpose === 'rework' \?/, 'order badges read labels from PRODUCTION_PURPOSES');
assert.match(read('js/bonuses.js'), /o\.purpose === 'marketing'/, 'bonuses page marks marketing orders');

console.log('marketing purpose smoke: ok');

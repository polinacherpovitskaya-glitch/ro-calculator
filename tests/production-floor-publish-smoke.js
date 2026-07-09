// Smoke for scripts/production-floor-publish.mjs — the PUBLIC production снимок.
// The headline assertion is the LEAK TEST: no price/cost/margin/PII/key ever
// reaches the published JSON. Also checks structure and number parity.

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-floor-'));

execFileSync('node', ['scripts/production-floor-publish.mjs'], {
    cwd: root,
    env: {
        ...process.env,
        RO_FLOOR_FIXTURE: 'tests/fixtures/production-floor-publish-fixture.json',
        RO_FLOOR_OUT_DIR: out,
    },
    stdio: 'inherit',
});

const plan = JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'));
const orderFiles = fs.readdirSync(path.join(out, 'orders')).filter(f => f.endsWith('.json'));
const orders = Object.fromEntries(orderFiles.map(f => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(out, 'orders', f), 'utf8'))]));
const allText = JSON.stringify(plan) + '\n' + orderFiles.map(f => fs.readFileSync(path.join(out, 'orders', f), 'utf8')).join('\n');

// ---- LEAK TEST: sentinel values from the fixture must NOT appear anywhere ----
const SENTINELS = ['9997771', '1112223', '8885559', '63.57', '7712345678', '40702810900000012345', '@secretclient', '4242', '6006', '1276.5', '4804', '51515'];
for (const s of SENTINELS) {
    assert.ok(!allText.includes(s), `LEAK: sentinel "${s}" (money/PII) appeared in the public snapshot`);
}
// ---- LEAK TEST: no money/PII/key field words, no secrets ----
const FORBIDDEN = /price|cost|margin|revenue|sell|target|profit|purchase|price_cny|\binn\b|bank|legal|telegram|delivery_address|calculator_data|_snapshot|себестоим|маржа|выручк/i;
assert.ok(!FORBIDDEN.test(allText), `LEAK: forbidden money/PII token matched in the public snapshot`);
assert.ok(!/eyJhbGci|supabase\.co|apigw\.yandexcloud/i.test(allText), 'LEAK: a key/url appeared in the public snapshot');

// ---- STRUCTURE: plan.json ----
for (const k of ['generated_at', 'in_shop_count', 'daily_capacity_hours', 'worker_slots', 'hours_per_person', 'summary', 'calendar', 'queue', 'blocked']) {
    assert.ok(k in plan, `plan.json missing "${k}"`);
}
assert.ok(Array.isArray(plan.calendar.days) && plan.calendar.days.length > 0, 'plan.calendar.days must be non-empty');
assert.ok(plan.calendar.days.every(d => 'date' in d && 'weekday' in d && 'nonworking' in d), 'calendar days must carry date/weekday/nonworking');

// ---- STRUCTURE: every order file ----
const ORDER_KEYS = ['name', 'client', 'quantity', 'colors', 'stages', 'calendar_segments', 'deadline', 'deadline_state', 'weight_grams', 'nfc', 'note', 'photo_url', 'items'];
for (const [id, ord] of Object.entries(orders)) {
    for (const k of ORDER_KEYS) assert.ok(k in ord, `order ${id}.json missing "${k}"`);
    assert.ok(Array.isArray(ord.stages) && ord.stages.length === 3, `order ${id} must expose 3 stages`);
    assert.ok(ord.stages.every(s => 'label' in s && 'plan' in s && 'fact' in s && 'remaining' in s), `order ${id} stages need label/plan/fact/remaining`);
}

// ---- PARITY: numbers match buildProductionModel on the same fixture ----
assert.equal(plan.daily_capacity_hours, 16, 'daily capacity = 2 workers x 8h');
assert.equal(plan.in_shop_count, 2, 'in-shop count = active workers');
assert.equal(plan.queue.length, 1, 'only the ready order (501) is scheduled');
assert.equal(plan.queue[0].order_id, 501, 'queue[0] = order 501');
assert.deepEqual(plan.queue[0].hours, { plan: 24, fact: 9, remaining: 16 }, 'queue[0] hours match model (24 plan, 9 fact, 16 remaining)');
assert.ok(['in_progress', 'queue'].includes(plan.queue[0].group), 'queue entry must carry a group');
assert.ok('stage_label' in plan.queue[0], 'queue entry must carry stage_label');
assert.equal(plan.summary.blocked_count, 1, 'order 502 is blocked');
assert.equal(plan.blocked.length, 1, 'blocked list has one entry');
assert.equal(plan.blocked[0].order_id, 502, 'blocked entry is 502');
assert.equal(plan.blocked[0].state, 'blocked', '502 state = blocked');
assert.ok(/Кита[йя]/i.test(plan.blocked[0].reason), '502 blocked reason mentions China');

// ---- Формы в пути: только in_transit, без денег ----
assert.ok(Array.isArray(plan.mold_transit), 'plan.mold_transit must be an array');
assert.equal(plan.mold_transit.length, 1, 'only the in_transit purchase is shown');
assert.equal(plan.mold_transit[0].name, 'Молды купер 2шт + варежка', 'transit name from purchase_name');
assert.deepEqual(plan.mold_transit[0].items, ['Форма ТПА', 'Молд купер'], 'transit items are names only');
assert.equal(plan.mold_transit[0].stage_label, 'Летит', 'stage from last status_history entry');
assert.ok(!JSON.stringify(plan.mold_transit).includes('qty'), 'no qty/price fields leak into transit board');

// ---- Фото-примеры извлечены в файлы, ссылки относительные, base64 не утёк ----
const withPhotos = Object.values(orders).find(o => o.photos && o.photos.length);
assert.ok(withPhotos, 'at least one order must expose extracted photos');
assert.ok(withPhotos.photos.every(u => /^photos\//.test(u)), 'photo urls must be relative photos/*');
assert.ok(!/data:image/i.test(allText), 'no base64 image data may appear in JSON');
assert.ok(fs.existsSync(path.join(out, withPhotos.photos[0])), 'extracted photo file must exist on disk');

// ---- КАЖДАЯ публикуемая фото-ссылка относительна (никаких внешних хостов вроде supabase) ----
const photoUrls = [];
plan.queue.forEach(q => { if (q.thumb_url) photoUrls.push(q.thumb_url); });
for (const o of Object.values(orders)) {
    if (o.photo_url) photoUrls.push(o.photo_url);
    (o.photos || []).forEach(u => photoUrls.push(u));
    (o.items || []).forEach(it => { if (it.thumb_url) photoUrls.push(it.thumb_url); });
}
photoUrls.forEach(u => assert.ok(/^photos\//.test(u), `photo url must be relative photos/*, got: ${u}`));

// ---- queue card carries состав so production sees фурнитура/цвета without opening ----
assert.deepEqual(plan.queue[0].hardware, ['Шнур джут'], 'queue card lists фурнитура');
assert.deepEqual(plan.queue[0].packaging, ['Крафт-коробка'], 'queue card lists упаковка');
assert.ok(Array.isArray(plan.queue[0].products) && plan.queue[0].products.includes('Ваза Волна'), 'queue card lists изделие(s)');

// ---- CONTENT: order 501 exposes the real production fields ("показываем то, что реально есть") ----
const o501 = orders['501'];
assert.equal(o501.quantity, 170, 'order 501 quantity = product 120 + pendant 50 (extra_cost excluded)');
assert.equal(o501.weight_grams, 480, 'order 501 weight');
assert.ok(o501.colors.some(c => c.name === 'Терракот' && /img\/colors\/010\.png$/.test(c.swatch_url || '')), 'order 501 colour resolved (name + swatch image)');
assert.ok(o501.nfc && o501.nfc.is_nfc === true && o501.nfc.programming === true, 'order 501 NFC flags');
assert.ok(/Матовый/.test(o501.note || ''), 'order 501 note (примечание для цеха)');
assert.equal(o501.items.length, 4, 'order 501 состав has 4 lines (extra_cost excluded)');
assert.ok(!o501.items.some(i => i.name === 'Доставка'), 'extra_cost line must not appear in состав');
assert.deepEqual(o501.items.map(i => i.kind).sort(), ['hardware', 'packaging', 'product', 'product'], 'состав: 2 изделия (product+pendant) + фурнитура + упаковка');
const molding501 = o501.stages.find(s => s.stage === 'molding');
assert.deepEqual({ plan: molding501.plan, fact: molding501.fact, remaining: molding501.remaining }, { plan: 8, fact: 9, remaining: 0 }, 'order 501 Литьё: 8 план / 9 факт / готово');

fs.rmSync(out, { recursive: true, force: true });
console.log('production floor publish smoke checks passed');

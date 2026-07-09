// =============================================
// Recycle Object — Production floor public snapshot publisher
//
// Builds the PUBLIC, read-only production витрина snapshot:
//   <out>/plan.json           — очередь, календарь, мощность, блокеры
//   <out>/orders/<id>.json    — карточка заказа (фото/цвет/кол-во/состав/этапы)
//
// SECURITY BOUNDARY: this output is served to anyone with the URL. Every
// published field is copied by name from an explicit allowlist — raw DB rows
// and raw item_data blobs are NEVER spread into output. No prices, costs,
// margins, client PII, or keys ever leave this file.
//
// Numbers come from buildProductionModel() (js/production-core.js), the SAME
// engine the in-app #gantt calendar uses — so the витрина matches it exactly.
//
// Usage:
//   node scripts/production-floor-publish.mjs                 # live: read Supabase (anon)
//   RO_FLOOR_FIXTURE=path.json node ...                       # offline: read a fixture
//   RO_FLOOR_OUT_DIR=deploy/floor-public node ...             # output dir (default)
// =============================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.resolve(ROOT, process.env.RO_FLOOR_OUT_DIR || 'deploy/floor-public');
const FIXTURE = process.env.RO_FLOOR_FIXTURE ? path.resolve(ROOT, process.env.RO_FLOOR_FIXTURE) : '';

// Mirrors Gantt.LOADABLE_STATUSES (js/gantt.js) and buildProductionSchedule's filter.
const LOADABLE_STATUSES = ['sample', 'production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'delivery', 'in_production'];
const STATUS_LABELS = {
    sample: 'Образец', production_casting: 'Литьё', production_printing: 'Печать',
    production_hardware: 'Сборка', production_packaging: 'Упаковка',
    in_production: 'В производстве', delivery: 'Отгрузка',
};
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // Date.getDay() index
const STAGE_LABELS = { molding: 'Литьё', assembly: 'Сборка', packaging: 'Упаковка' };

// Статусы, означающие «заказ реально идёт в цехе сейчас» (vs готов и ждёт слот).
const IN_PROGRESS_STATUSES = new Set(['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery']);
function queueGroup(status) { return IN_PROGRESS_STATUSES.has(String(status)) ? 'in_progress' : 'queue'; }

// Product-like line types (изделия) vs фурнитура/упаковка; extra_cost is a
// cost line, not a physical item, so it never appears in состав or counts.
const PRODUCT_TYPES = new Set(['product', 'pendant']);
const isExtraLine = it => String(it.item_type) === 'extra_cost';
const isProductLike = it => PRODUCT_TYPES.has(String(it.item_type || 'product'));

// Colour swatches / photos live under the calc2 asset root (img/colors/NNN.png).
const ASSET_BASE = (process.env.RO_FLOOR_ASSET_BASE || 'https://calc2.recycleobject.ru/').replace(/\/+$/, '') + '/';
const assetUrl = p => (!p ? null : (/^https?:\/\//i.test(p) ? p : ASSET_BASE + String(p).replace(/^\/+/, '')));

// ---------- tiny date helpers (local, DST/UTC-safe) ----------
function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function parseHolidaySet(settings) {
    const raw = String((settings && settings.production_holidays) || '').trim();
    if (!raw) return new Set();
    return new Set(raw.split(/[\s,;]+/).map(v => v.trim()).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)));
}
function isNonWorking(d, holidaySet) {
    const wd = d.getDay();
    return wd === 0 || wd === 6 || holidaySet.has(isoLocal(d));
}

// ---------- JSON blob helpers ----------
function parseMaybe(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
}

// ---------- Supabase (anon REST — mirrors scripts/export-supabase-snapshot.mjs) ----------
function extractConst(name) {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8');
    const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
    return m ? m[1] : '';
}
const SUPABASE_URL = (process.env.SUPABASE_URL || extractConst('SUPABASE_URL')).replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || extractConst('SUPABASE_ANON_KEY');

async function restAll(table, select = '*') {
    const pageSize = 1000;
    const out = [];
    for (let offset = 0; ; offset += pageSize) {
        const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${offset}`;
        const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } });
        if (!res.ok) throw new Error(`Supabase REST ${table} -> HTTP ${res.status}`);
        const rows = await res.json();
        out.push(...rows);
        if (!Array.isArray(rows) || rows.length < pageSize) break;
    }
    return out;
}

async function loadData() {
    if (FIXTURE) {
        const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
        return {
            allOrders: raw.allOrders || raw.orders || [],
            orderItems: raw.orderItems || raw.order_items || [],
            settings: raw.settings || {},
            rawPlanState: raw.planState || raw.plan_state || parseMaybe((raw.settings || {}).production_plan_state_json) || {},
            timeEntries: raw.timeEntries || raw.time_entries || [],
            employees: raw.employees || [],
            chinaPurchases: raw.chinaPurchases || raw.china_purchases || [],
            appColors: raw.appColors || raw.app_colors || [],
            molds: raw.molds || [], hwBlanks: raw.hwBlanks || raw.hw_blanks || [], pkgBlanks: raw.pkgBlanks || raw.pkg_blanks || [],
        };
    }
    const [allOrders, orderItems, settingsRows, timeEntries, employees, chinaPurchases, appColors, molds, hwBlanks, pkgBlanks] = await Promise.all([
        restAll('orders'), restAll('order_items'), restAll('settings'),
        restAll('time_entries'), restAll('employees'), restAll('china_purchases'),
        restAll('app_colors'), restAll('molds'), restAll('hw_blanks'), restAll('pkg_blanks'),
    ]);
    // settings is a key/value store
    const settings = {};
    (settingsRows || []).forEach(row => {
        if (row && 'key' in row) { const parsed = parseMaybe(row.value); settings[row.key] = parsed != null ? parsed : row.value; }
    });
    return {
        allOrders: (allOrders || []).filter(o => o.status !== 'deleted'),
        orderItems: orderItems || [], settings,
        rawPlanState: parseMaybe(settings.production_plan_state_json) || {},
        timeEntries: timeEntries || [], employees: employees || [], chinaPurchases: chinaPurchases || [],
        appColors: appColors || [], molds: molds || [], hwBlanks: hwBlanks || [], pkgBlanks: pkgBlanks || [],
    };
}

// ---------- flatten order_items (item_data blob merged onto the row, like the app's loader) ----------
function flattenItems(rawItems) {
    return (rawItems || []).map(row => {
        const parsed = parseMaybe(row.item_data) || {};
        return {
            ...parsed,
            id: row.id,
            order_id: row.order_id,
            item_number: row.item_number,
            template_id: row.template_id != null ? row.template_id : parsed.template_id,
            product_name: row.product_name || parsed.product_name || '',
            quantity: row.quantity != null ? row.quantity : parsed.quantity,
            item_type: parsed.item_type || 'product',
        };
    });
}

// ---------- mirror Gantt.applyLoadedData assembly ----------
function normalizePlanState(state) {
    const raw = state && typeof state === 'object' ? state : {};
    const manual_start_dates = {};
    const parallel_workers = {};
    Object.entries(raw.manual_start_dates || {}).forEach(([id, value]) => {
        const s = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) manual_start_dates[String(id)] = s;
    });
    Object.entries(raw.parallel_workers || {}).forEach(([id, value]) => {
        const n = Math.round(Number(value) || 0);
        if (n >= 1) parallel_workers[String(id)] = n;
    });
    const active = Number(raw.active_workers_count);
    return {
        order_ids: Array.isArray(raw.order_ids) ? raw.order_ids : [],
        manual_start_dates,
        active_workers_count: active > 0 ? Math.round(active * 100) / 100 : null,
        parallel_workers,
    };
}
function getEffectivePlanningSettings(settings, planState) {
    const next = { ...(settings || {}) };
    const override = Number(planState?.active_workers_count || 0);
    if (override > 0) next.planning_workers_count = override;
    return next;
}
function orderTotalHours(o) {
    return (Number(o?.production_hours_plastic) || 0) + (Number(o?.production_hours_hardware) || 0) + (Number(o?.production_hours_packaging) || 0);
}
function buildOrderedOrders(allOrders, planState) {
    const priorityIds = (planState.order_ids || []).map(Number).filter(Number.isFinite);
    const pos = new Map(priorityIds.map((id, i) => [id, i]));
    return (allOrders || [])
        .filter(o => o && LOADABLE_STATUSES.includes(o.status) && orderTotalHours(o) > 0)
        .map((o, i) => ({ ...o, production_priority: pos.has(Number(o.id)) ? pos.get(Number(o.id)) : 1000 + i }))
        .sort((a, b) => Number(a.production_priority || 0) - Number(b.production_priority || 0));
}

// ---------- run the shared model in a bare vm (same pattern as tests/production-floor-core-smoke.js) ----------
function makeVm() {
    const ctx = vm.createContext({ console, Math, Intl, JSON, Array, Object, String, Number, Boolean, RegExp, Set, Map, Date });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'calculator.js'), 'utf8'), ctx, { filename: 'js/calculator.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'production-core.js'), 'utf8'), ctx, { filename: 'js/production-core.js' });
    return ctx;
}
function runModel(ctx, data) { ctx.__data = data; return vm.runInContext('buildProductionModel(__data)', ctx); }
function runSlots(ctx, settings) { ctx.__settings = settings; return vm.runInContext('buildProductionWorkerSlots(__settings)', ctx); }

// ---------- colour resolution ----------
function buildColorIndex(appColors) {
    // app_colors carry a name + a swatch image (color_data.photo_url), not a hex.
    const byId = new Map(); const byName = new Map();
    const norm = s => String(s || '').trim().toLowerCase();
    (appColors || []).forEach(row => {
        const cd = parseMaybe(row.color_data) || {};
        const name = row.name || cd.name || '';
        const rec = { name: name || null, photo_url: cd.photo_url || null };
        if (row.id != null) byId.set(String(row.id), rec);
        if (name) byName.set(norm(name), rec);
    });
    return { byId, byName, norm };
}
function resolveColor(idx, { id, name }) {
    let found = null;
    if (id != null && idx.byId.has(String(id))) found = idx.byId.get(String(id));
    if (!found && name && idx.byName.has(idx.norm(name))) found = idx.byName.get(idx.norm(name));
    return { name: name || found?.name || null, photo_url: found?.photo_url || null };
}
function itemColors(item, idx) {
    const out = []; const seen = new Set();
    const push = (name, swatch) => {
        if (!name && !swatch) return;
        const key = String(name || swatch).toLowerCase();
        if (seen.has(key)) return; seen.add(key);
        out.push({ name: name || null, swatch_url: swatch || null });
    };
    const arr = parseMaybe(item.colors);
    if (Array.isArray(arr)) {
        arr.forEach(c => {
            if (c == null) return;
            const r = (typeof c === 'object') ? resolveColor(idx, { id: c.id, name: c.name }) : resolveColor(idx, { id: c });
            push(r.name, assetUrl(r.photo_url));
        });
    }
    if (item.color_id != null || item.color_name) { const r = resolveColor(idx, { id: item.color_id, name: item.color_name }); push(r.name, assetUrl(r.photo_url)); }
    return out;
}

// ---------- photo (best-effort, safe: only public http(s) urls, never data:/supabase blobs) ----------
function httpUrlIn(obj) {
    if (!obj) return null;
    for (const v of Object.values(obj)) {
        if (typeof v === 'string' && /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v)) return v;
    }
    return null;
}
function resolvePhoto(item, data) {
    const tid = item.template_id;
    if (tid != null) {
        for (const table of [data.molds, data.hwBlanks, data.pkgBlanks]) {
            const row = (table || []).find(r => String(r.id) === String(tid));
            if (row) { const u = httpUrlIn(parseMaybe(row.mold_data || row.blank_data) || {}); if (u) return u; }
        }
    }
    const att = item.color_solution_attachment;
    if (typeof att === 'string' && /^https?:\/\//i.test(att)) return att;
    return null;
}

// ---------- items curation (allowlist) ----------
function curateItems(orderId, flatItems, idx, data) {
    const rows = (flatItems || []).filter(it => Number(it.order_id) === Number(orderId) && !isExtraLine(it));
    const kindOf = t => (t === 'hardware' ? 'hardware' : t === 'packaging' ? 'packaging' : 'product');
    return rows.map(it => {
        const kind = kindOf(it.item_type);
        const out = { kind, name: String(it.product_name || ''), quantity: Number(it.quantity) || 0, thumb_url: kind === 'product' ? resolvePhoto(it, data) : null };
        if (kind === 'product') out.colors = itemColors(it, idx);
        return out;
    });
}

// ---------- deadline state (working-day buffer, matches #gantt semantics) ----------
function deadlineState(deadlineEnd, lastDateISO, holidaySet) {
    if (!deadlineEnd) return { state: null, buffer: null };
    const dl = parseISO(deadlineEnd);
    const last = parseISO(lastDateISO) || startOfToday();
    if (!dl) return { state: null, buffer: null };
    let a = last, b = dl, sign = 1;
    if (b < a) { a = dl; b = last; sign = -1; }
    let working = 0;
    for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (!isNonWorking(d, holidaySet)) working++;
    const buffer = working * sign;
    const state = buffer < 0 ? 'late' : buffer <= 2 ? 'tight' : 'buffer';
    return { state, buffer };
}

// ---------- calendar ----------
function orderCells(schedule) {
    const byDate = new Map();
    (schedule || []).forEach(s => {
        const m = byDate.get(s.date) || {};
        m[s.phase] = (m[s.phase] || 0) + (Number(s.hours) || 0);
        byDate.set(s.date, m);
    });
    const cells = {};
    byDate.forEach((m, date) => {
        let best = null, bh = -Infinity;
        for (const [ph, h] of Object.entries(m)) if (h > bh) { bh = h; best = ph; }
        cells[date] = best;
    });
    return cells;
}
function calendarWindow(queue, holidaySet) {
    const today = startOfToday();
    const end = addDays(today, 55); // 8 weeks ahead so the page can page week-by-week
    const days = [];
    for (let d = new Date(today); d <= end; d = addDays(d, 1)) {
        days.push({ date: isoLocal(d), weekday: WEEKDAYS[d.getDay()], nonworking: isNonWorking(d, holidaySet) });
    }
    return { mode: 'week', range_start: days[0]?.date || isoLocal(today), range_end: days[days.length - 1]?.date || isoLocal(end), days };
}

function stagesFromQueue(q) {
    return (q.phases || []).map(p => ({
        stage: p.name, label: p.label || STAGE_LABELS[p.name] || p.name,
        plan: Number(p.total) || 0, fact: Number(p.actual) || 0, remaining: Number(p.remaining) || 0,
    }));
}
function stagesFromOrder(o) {
    const mk = (stage, plan, fact) => ({ stage, label: STAGE_LABELS[stage], plan: Number(plan) || 0, fact: Number(fact) || 0, remaining: Math.max((Number(plan) || 0) - (Number(fact) || 0), 0) });
    return [
        mk('molding', o.production_hours_plastic, o.actual_hours_molding),
        mk('assembly', o.production_hours_hardware, o.actual_hours_assembly),
        mk('packaging', o.production_hours_packaging, o.actual_hours_packaging),
    ];
}

// ---------- public object builders (ALLOWLIST — every field named explicitly) ----------
function productSummary(orderId, flatItems, idx) {
    const products = (flatItems || []).filter(it => Number(it.order_id) === Number(orderId) && isProductLike(it) && !isExtraLine(it));
    const quantity = products.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const colors = []; const seen = new Set();
    products.forEach(it => itemColors(it, idx).forEach(c => { const k = String(c.name || c.swatch_url).toLowerCase(); if (!seen.has(k)) { seen.add(k); colors.push(c); } }));
    const first = products[0] || {};
    const weight = Number(first.weight_grams) || null;
    const nfc = (first.is_nfc === true || first.is_nfc === 1 || first.is_nfc === '1') ? { is_nfc: true, programming: !!first.nfc_programming } : null;
    const thumb = first.template_id != null || first.color_solution_attachment ? resolvePhoto(first, PUB.data) : null;
    return { quantity, colors, weight, nfc, thumb };
}

// module-scope holder so productSummary can reach data.molds for photos
const PUB = { data: null };

function toPublicPlan(ctx, model, slots, data, idx, holidaySet, queueById) {
    const inShop = Math.round(Number(slots.workersCount) || 0);
    const queue = model.queue.map(q => {
        const dates = (q.schedule || []).map(s => s.date).sort();
        const ds = deadlineState(q.deadlineEnd, dates[dates.length - 1], holidaySet);
        const ps = productSummary(q.orderId, data.flatItems, idx);
        const items = curateItems(q.orderId, data.flatItems, idx, data);
        return {
            order_id: q.orderId, name: q.orderName, client: q.clientName,
            start_date: dates[0] || null, deadline: q.deadlineEnd || null,
            deadline_state: ds.state, deadline_buffer_days: ds.buffer,
            hours: { plan: Number(q.plannedTotalHours) || 0, fact: Number(q.actualTotalHours) || 0, remaining: Number(q.remainingTotalHours) || 0 },
            status: q.status || null,
            stage_label: STATUS_LABELS[q.status] || '',
            group: queueGroup(q.status),
            thumb_url: ps.thumb, colors: ps.colors, quantity: ps.quantity,
            products: items.filter(i => i.kind === 'product').map(i => i.name),
            hardware: items.filter(i => i.kind === 'hardware').map(i => i.name),
            packaging: items.filter(i => i.kind === 'packaging').map(i => i.name),
        };
    });
    let late = 0, tight = 0;
    queue.forEach(q => { if (q.deadline_state === 'late') late++; else if (q.deadline_state === 'tight') tight++; });
    const blocked = [...model.blocked, ...model.review].map(o => ({
        order_id: o.id, name: o.order_name || '', client: o.client_name || '',
        state: o.production_ready_state, reason: o.production_blocked_reason || '',
    }));
    const cal = calendarWindow(model.queue, holidaySet);
    cal.rows = model.queue
        .map(q => ({ order_id: q.orderId, name: q.orderName, client: q.clientName, cells: orderCells(q.schedule) }))
        .filter(r => Object.keys(r.cells).length > 0);
    return {
        generated_at: new Date().toISOString(),
        in_shop_count: inShop,
        daily_capacity_hours: Number(model.dailyCapacity) || 0,
        worker_slots: (slots.slotHours || []).length,
        hours_per_person: Number(slots.hoursPerDay) || 0,
        summary: {
            queue_count: queue.length,
            queue_hours_remaining: Math.round(queue.reduce((s, q) => s + q.hours.remaining, 0) * 100) / 100,
            late_count: late, tight_count: tight,
            first_overload_date: model.overload.firstOverloadDate || '',
            first_overload_hours: Number(model.overload.firstOverloadHours) || 0,
            blocked_count: model.blocked.length, review_count: model.review.length,
        },
        calendar: cal,
        queue,
        blocked,
    };
}

function toPublicOrder(orderId, model, data, idx, holidaySet, queueById, enrichedById) {
    const q = queueById.get(Number(orderId));
    const o = enrichedById.get(Number(orderId)) || {};
    const raw = (data.allOrders || []).find(r => Number(r.id) === Number(orderId)) || {};
    const status = q ? q.status : o.status || raw.status;
    const deadline = (q ? q.deadlineEnd : o.deadline_end) || raw.deadline_end || null;
    const dates = q ? (q.schedule || []).map(s => s.date).sort() : [];
    const ds = deadlineState(deadline, dates[dates.length - 1], holidaySet);
    const ps = productSummary(orderId, data.flatItems, idx);
    return {
        order_id: Number(orderId),
        name: (q ? q.orderName : o.order_name) || raw.order_name || '',
        client: (q ? q.clientName : o.client_name) || raw.client_name || '',
        status, status_label: STATUS_LABELS[status] || status || '',
        deadline, deadline_state: ds.state, deadline_buffer_days: ds.buffer,
        blocked_reason: o.production_blocked_reason || null,
        quantity: ps.quantity, weight_grams: ps.weight, colors: ps.colors,
        nfc: ps.nfc, photo_url: ps.thumb,
        note: String(raw.notes || o.notes || '') || null,
        items: curateItems(orderId, data.flatItems, idx, data),
        stages: q ? stagesFromQueue(q) : stagesFromOrder(o),
        calendar_segments: q ? Object.entries(orderCells(q.schedule)).map(([date, stage]) => ({ date, stage })) : [],
        calendar_days: q ? calendarWindow([q], holidaySet).days : [],
    };
}

// ---------- main ----------
async function main() {
    const data = await loadData();
    data.flatItems = flattenItems(data.orderItems);
    PUB.data = data;

    const planState = normalizePlanState(data.rawPlanState);
    const effectiveSettings = getEffectivePlanningSettings(data.settings, planState);
    const orderedOrders = buildOrderedOrders(data.allOrders, planState);
    const holidaySet = parseHolidaySet(effectiveSettings);

    const ctx = makeVm();
    const model = runModel(ctx, {
        orders: orderedOrders,
        orderItems: data.flatItems,
        planState,
        settings: effectiveSettings,
        timeEntries: data.timeEntries,
        employees: data.employees,
        chinaPurchases: data.chinaPurchases,
    });
    const slots = runSlots(ctx, effectiveSettings);

    const idx = buildColorIndex(data.appColors);
    const queueById = new Map(model.queue.map(q => [Number(q.orderId), q]));
    const enrichedById = new Map((model.orders || []).map(o => [Number(o.id), o]));

    const plan = toPublicPlan(ctx, model, slots, data, idx, holidaySet, queueById);

    const orderIds = new Set([
        ...model.queue.map(q => Number(q.orderId)),
        ...model.blocked.map(o => Number(o.id)),
        ...model.review.map(o => Number(o.id)),
    ]);
    const orders = [...orderIds].map(id => toPublicOrder(id, model, data, idx, holidaySet, queueById, enrichedById));

    // Write atomically-ish: build everything, then write.
    fs.mkdirSync(path.join(OUT_DIR, 'orders'), { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify(plan));
    for (const ord of orders) fs.writeFileSync(path.join(OUT_DIR, 'orders', `${ord.order_id}.json`), JSON.stringify(ord));

    console.log(`production-floor-publish: wrote plan.json (${plan.queue.length} in queue, ${plan.blocked.length} blocked) + ${orders.length} order files to ${OUT_DIR}`);
}

main().catch(err => {
    // On failure, do NOT overwrite the last good snapshot — just fail loudly.
    console.error('production-floor-publish FAILED:', err && err.stack ? err.stack : err);
    process.exit(1);
});

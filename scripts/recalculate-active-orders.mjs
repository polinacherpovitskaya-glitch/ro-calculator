#!/usr/bin/env node
// Recalculate saved order headers from the same calculator engine used in the UI.
// Defaults to dry-run. `--apply` is deliberately explicit and creates a private
// backup before the first write; `--rollback <backup.json>` restores that backup.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export const ACTIVE_STATUSES = [
    'sample', 'production', 'production_casting', 'production_printing',
    'production_hardware', 'production_packaging', 'in_production', 'delivery',
];
export const DRAFT_STATUSES = ['draft', 'calculated'];

function parseArgs(argv) {
    const result = { scope: 'active', apply: false, report: false, rollback: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--apply') result.apply = true;
        else if (arg === '--report') result.report = true;
        else if (arg === '--scope') result.scope = argv[++i] || '';
        else if (arg === '--rollback') result.rollback = argv[++i] || '';
        else if (arg === '--help' || arg === '-h') result.help = true;
        else throw new Error(`Неизвестный аргумент: ${arg}`);
    }
    if (!['active', 'drafts'].includes(result.scope)) {
        throw new Error('--scope принимает только active или drafts');
    }
    if (result.rollback && result.apply) throw new Error('--rollback нельзя сочетать с --apply');
    return result;
}

function printHelp() {
    console.log(`Использование:
  node scripts/recalculate-active-orders.mjs --scope active
  node scripts/recalculate-active-orders.mjs --scope active --report
  node scripts/recalculate-active-orders.mjs --scope active --apply
  node scripts/recalculate-active-orders.mjs --rollback /private/tmp/ro-active-order-recalculation-....json

По умолчанию выполняется только dry-run. --report добавляет контрольный список
заказов (ID и показатели до/после, без названий и клиентов). Scope active —
образцы и production; scope drafts подготовлен для второй волны и не запускается
автоматически.`);
}

function parseJsonObject(value, context) {
    if (value === null || value === undefined || value === '') return {};
    if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('ожидался JSON-объект');
        }
        return parsed;
    } catch (error) {
        throw new Error(`${context}: неразбираемый JSON (${error.message})`);
    }
}

// The database previously contained a few legacy nested snapshots. Hydrate them
// for calculation without changing their nested structure on disk.
export function hydrateItemForCalculation(row) {
    const outer = parseJsonObject(row?.item_data, `позиция ${row?.id ?? '?'}`);
    let nested = {};
    if (outer.item_data !== undefined && outer.item_data !== null && outer.item_data !== '') {
        nested = parseJsonObject(outer.item_data, `вложенная позиция ${row?.id ?? '?'}`);
    }
    const merged = { ...nested, ...outer };
    Object.entries(row || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined) merged[key] = value;
    });
    return merged;
}

function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function round2(value) {
    return Math.round(numberOrZero(value) * 100) / 100;
}

function assertFinite(value, label) {
    if (!Number.isFinite(Number(value))) throw new Error(`${label}: результат не является числом`);
}

// A few legacy catalog rows were saved as a valid JSON object followed by an
// accidental `,[object Object]` suffix. The calculator itself only needs the
// valid catalog object. Recover that known, non-semantic suffix here so one
// broken unused row cannot block a read-only preflight; any other malformed
// JSON still stops the recalculation.
function parseCatalogMoldData(value, context) {
    // PostgREST returns the same legacy corruption as a JSON array in the
    // current API: the complete object is the first string and the following
    // values are accidental appended objects. The first value already contains
    // all catalogue fields, so prefer it rather than stringifying the array.
    if (Array.isArray(value) && typeof value[0] === 'string') {
        return parseJsonObject(value[0], context);
    }
    try {
        return parseJsonObject(value, context);
    } catch (error) {
        const raw = typeof value === 'string' ? value.trim() : '';
        const marker = raw.indexOf(',[object Object]');
        const suffix = marker >= 0 ? raw.slice(marker) : '';
        if (marker > 0 && /^(,\[object Object\])+$/u.test(suffix)) {
            return parseJsonObject(raw.slice(0, marker), context);
        }
        throw error;
    }
}

export function templateFromMoldRow(row) {
    const mold = parseCatalogMoldData(row?.mold_data, `бланк ${row?.id ?? '?'}`);
    const min = numberOrZero(mold.pph_min || mold.pieces_per_hour_min);
    const max = numberOrZero(mold.pph_max || mold.pieces_per_hour_max);
    const average = min > 0 && max > 0 ? Math.round((min + max) / 2) : (min || max || 0);
    return {
        ...mold,
        id: row.id,
        pph_actual: numberOrZero(mold.pph_actual || mold.pieces_per_hour_actual),
        pieces_per_hour_actual: numberOrZero(mold.pph_actual || mold.pieces_per_hour_actual),
        pieces_per_hour_avg: numberOrZero(mold.pieces_per_hour_avg || average),
    };
}

function validateProductSafety(item, templateById) {
    if (String(item.item_type || 'product').toLowerCase() !== 'product') return;
    const pph = numberOrZero(item.pieces_per_hour);
    if (!(pph > 0)) throw new Error(`позиция ${item.id}: нет производительности шт/ч`);
    if (!item.is_blank_mold) return;
    if (item.template_id === null || item.template_id === undefined || item.template_id === '') {
        throw new Error(`позиция ${item.id}: бланк без template_id нельзя безопасно обновить`);
    }
    const template = templateById.get(String(item.template_id));
    if (!template) throw new Error(`позиция ${item.id}: бланк отсутствует в текущем каталоге`);
    const currentPph = numberOrZero(template.pph_actual || template.pieces_per_hour_actual || template.pieces_per_hour_avg);
    if (!(currentPph > 0)) throw new Error(`позиция ${item.id}: у бланка нет действующей нормы шт/ч`);
}

function productPayloadPatch(item) {
    const result = item.result || {};
    return {
        product_name: item.product_name || '',
        quantity: numberOrZero(item.quantity),
        pieces_per_hour: numberOrZero(item.pieces_per_hour),
        weight_grams: numberOrZero(item.weight_grams),
        is_blank_mold: !!item.is_blank_mold,
        blank_mold_total_cost: numberOrZero(item.blank_mold_total_cost),
        builtin_assembly_name: item.builtin_assembly_name || '',
        builtin_assembly_speed: numberOrZero(item.builtin_assembly_speed),
        builtin_hw_name: item.builtin_hw_name || '',
        builtin_hw_price: numberOrZero(item.builtin_hw_price),
        builtin_hw_delivery_total: numberOrZero(item.builtin_hw_delivery_total),
        builtin_hw_speed: numberOrZero(item.builtin_hw_speed),
        cost_fot: numberOrZero(result.costFot),
        cost_indirect: numberOrZero(result.costIndirect),
        cost_plastic: numberOrZero(result.costPlastic),
        cost_mold_amortization: numberOrZero(result.costMoldAmortization),
        cost_design: numberOrZero(result.costDesign),
        cost_cutting: numberOrZero(result.costCutting),
        cost_cutting_indirect: numberOrZero(result.costCuttingIndirect),
        cost_nfc_tag: numberOrZero(result.costNfcTag),
        cost_nfc_programming: numberOrZero(result.costNfcProgramming),
        cost_nfc_indirect: numberOrZero(result.costNfcIndirect),
        cost_builtin_assembly: numberOrZero(result.costBuiltinAssembly),
        cost_builtin_assembly_indirect: numberOrZero(result.costBuiltinAssemblyIndirect),
        cost_builtin_hw: numberOrZero(result.costBuiltinHw),
        cost_builtin_hw_indirect: numberOrZero(result.costBuiltinHwIndirect),
        cost_printing: numberOrZero(result.costPrinting),
        cost_delivery: numberOrZero(result.costDelivery),
        cost_total: numberOrZero(result.costTotal),
        hours_plastic: numberOrZero(result.hoursPlastic),
        hours_cutting: numberOrZero(result.hoursCutting),
        hours_nfc: numberOrZero(result.hoursNfc),
        hours_assembly: numberOrZero(result.hoursAssemblyZone),
    };
}

function itemPayloadPatch(item) {
    const type = String(item.item_type || 'product').trim().toLowerCase();
    if (type === 'product') return productPayloadPatch(item);
    if (type === 'hardware') {
        return {
            cost_total: numberOrZero(item.result?.costPerUnit),
            hours_hardware: numberOrZero(item.result?.hoursHardware),
        };
    }
    if (type === 'packaging') {
        return {
            cost_total: numberOrZero(item.result?.costPerUnit),
            hours_packaging: numberOrZero(item.result?.hoursPackaging),
        };
    }
    if (type === 'pendant') {
        return {
            cost_total: numberOrZero(item.result?.costPerUnit),
            sell_price_item: numberOrZero(item.result?.sellPerUnit),
            hours_plastic: numberOrZero(item.result?.hoursPlasticZone),
            hours_assembly: numberOrZero(item.result?.assemblyHours),
            hours_packaging: numberOrZero(item.result?.packagingHours),
        };
    }
    return {};
}

function makeHeaderPatch(order, snapshot, nowIso) {
    const summary = snapshot.summary || {};
    const load = snapshot.load || {};
    const calculatorData = {
        ...parseJsonObject(order.calculator_data, `заказ ${order.id}`),
        status: order.status,
        gross_revenue_plan: round2(summary.grossRevenue),
        discount_amount_plan: round2(summary.discountAmount),
        discount_percent_plan: round2(summary.discountPercent),
        total_revenue_plan: round2(summary.totalRevenue),
        total_cost_plan: round2(summary.totalRevenue - summary.totalEarned),
        total_margin_plan: round2(summary.totalEarned),
        margin_percent_plan: round2(summary.marginPercent),
        total_with_vat_plan: round2(summary.totalWithVat),
        total_hours_plan: round2(load.totalHours),
        production_hours_plastic: round2(load.hoursPlasticTotal),
        production_hours_packaging: round2(load.hoursPackagingTotal),
        production_hours_hardware: round2(load.hoursHardwareTotal),
        production_load_percent: round2(load.plasticLoadPercent),
        updated_at: nowIso,
    };
    return {
        total_hours_plan: calculatorData.total_hours_plan,
        production_hours_plastic: calculatorData.production_hours_plastic,
        production_hours_packaging: calculatorData.production_hours_packaging,
        production_hours_hardware: calculatorData.production_hours_hardware,
        total_cost: calculatorData.total_cost_plan,
        total_revenue: calculatorData.total_revenue_plan,
        total_margin: calculatorData.total_margin_plan,
        margin_percent: calculatorData.margin_percent_plan,
        calculator_data: JSON.stringify(calculatorData),
        updated_at: nowIso,
    };
}

function aggregateHeader(rows, next = false) {
    return rows.reduce((acc, row) => {
        const source = next ? row.headerPatch : row;
        acc.orders += 1;
        acc.hours += numberOrZero(source.total_hours_plan);
        acc.revenue += numberOrZero(source.total_revenue);
        acc.margin += numberOrZero(source.total_margin);
        return acc;
    }, { orders: 0, hours: 0, revenue: 0, margin: 0 });
}

// Pure planning step: it has no network calls and is used by the smoke test.
export function buildRecalculationPlan({ orders, itemRows, settings, templates, engine, nowIso = new Date().toISOString() }) {
    const templateById = new Map((templates || []).map(template => [String(template.id), template]));
    // Pendant letters resolve their blank source through the same catalogue as
    // the browser. The VM has no app bootstrap, so inject it explicitly before
    // calculating any order rather than falling back to stale element prices.
    if (typeof engine.setCatalog === 'function') engine.setCatalog(templates || []);
    const params = engine.getProductionParams(settings || {});
    const plan = [];

    for (const rawOrder of orders || []) {
        const rawItems = (itemRows || []).filter(row => String(row.order_id) === String(rawOrder.id));
        if (!rawItems.length) throw new Error(`заказ ${rawOrder.id}: нет позиций, пересчёт остановлен`);
        const order = { ...parseJsonObject(rawOrder.calculator_data, `заказ ${rawOrder.id}`), ...rawOrder };
        const items = rawItems.map(hydrateItemForCalculation);
        items.forEach(item => validateProductSafety(item, templateById));
        const snapshot = engine.getOrderLiveCalculatorSnapshot(order, items, params, templates || []);

        [snapshot.revenue, snapshot.marginPercent, snapshot.hours, snapshot.summary?.totalEarned].forEach((value, index) => {
            assertFinite(value, `заказ ${rawOrder.id}, показатель ${index + 1}`);
        });

        const calculatedById = new Map();
        [...snapshot.products, ...snapshot.hardwareItems, ...snapshot.packagingItems, ...snapshot.pendantItems]
            .forEach(item => calculatedById.set(String(item.id), item));

        const itemPatches = rawItems.map(rawItem => {
            const calculated = calculatedById.get(String(rawItem.id));
            if (!calculated) return { id: rawItem.id, patch: null, unchanged: true };
            const outer = parseJsonObject(rawItem.item_data, `позиция ${rawItem.id}`);
            const payload = { ...outer, ...itemPayloadPatch(calculated) };
            const nextCost = numberOrZero(payload.cost_total);
            return {
                id: rawItem.id,
                unchanged: false,
                patch: {
                    item_data: JSON.stringify(payload),
                    cost_total: nextCost,
                    updated_at: nowIso,
                },
            };
        });

        plan.push({
            id: rawOrder.id,
            status: rawOrder.status,
            before: {
                hours: round2(rawOrder.total_hours_plan),
                revenue: round2(rawOrder.total_revenue),
                margin: round2(rawOrder.total_margin),
                marginPercent: round2(rawOrder.margin_percent),
            },
            headerPatch: makeHeaderPatch(order, snapshot, nowIso),
            itemPatches,
            snapshot: {
                hours: round2(snapshot.hours),
                revenue: round2(snapshot.revenue),
                marginPercent: round2(snapshot.marginPercent),
            },
        });
    }
    return {
        orders: plan,
        before: aggregateHeader(orders || []),
        after: aggregateHeader(plan, true),
        params: {
            setupHoursBlank: numberOrZero(params.setupHoursBlank),
            setupHoursCustom: numberOrZero(params.setupHoursCustom),
            indirectPerHour: round2(params.indirectPerHour),
        },
    };
}

export function loadEngine() {
    const source = fs.readFileSync(path.join(repoRoot, 'js', 'calculator.js'), 'utf8');
    const sandbox = {
        console, Math, Date, JSON, Number, String, Array, Object, Set,
        App: { templates: [] },
        Molds: { allMolds: [] },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nglobalThis.__recalculationEngine = { getProductionParams, getOrderLiveCalculatorSnapshot };`, sandbox, {
        filename: 'js/calculator.js',
    });
    return {
        ...sandbox.__recalculationEngine,
        setCatalog(templates) {
            const catalog = Array.isArray(templates) ? templates : [];
            sandbox.App.templates = catalog;
            sandbox.Molds.allMolds = catalog;
        },
    };
}

function loadSupabaseConfig() {
    const source = fs.readFileSync(path.join(repoRoot, 'js', 'supabase.js'), 'utf8');
    const url = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
    const key = source.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
    if (!url || !key) throw new Error('Не удалось прочитать публичную конфигурацию Supabase');
    return { url, key };
}

function createRestClient({ url, key }) {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    return async function rest(table, { method = 'GET', query = {}, body = undefined } = {}) {
        const endpoint = new URL(`/rest/v1/${table}`, url);
        Object.entries(query).forEach(([name, value]) => endpoint.searchParams.set(name, value));
        const response = await fetch(endpoint, {
            method,
            headers: { ...headers, Prefer: method === 'GET' ? 'return=representation' : 'return=representation' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`${method} ${table}: ${response.status} ${text}`);
        return text ? JSON.parse(text) : [];
    };
}

async function loadRemoteRows(rest, scope) {
    const statuses = scope === 'active' ? ACTIVE_STATUSES : DRAFT_STATUSES;
    const orders = await rest('orders', {
        query: {
            select: 'id,status,updated_at,calculator_data,total_hours_plan,production_hours_plastic,production_hours_packaging,production_hours_hardware,total_cost,total_revenue,total_margin,margin_percent',
            status: `in.(${statuses.join(',')})`,
            order: 'id.asc',
        },
    });
    if (!orders.length) return { orders: [], itemRows: [], settings: {}, templates: [] };
    const itemRows = await rest('order_items', {
        query: {
            select: 'id,order_id,item_number,template_id,product_name,quantity,unit_price,sell_price_item,sell_price_printing,total_price,cost_total,item_data,created_at,updated_at',
            order_id: `in.(${orders.map(order => order.id).join(',')})`,
            order: 'order_id.asc,item_number.asc',
        },
    });
    const [settingsRows, moldRows] = await Promise.all([
        rest('settings', { query: { select: 'key,value' } }),
        rest('molds', { query: { select: 'id,mold_data' } }),
    ]);
    return {
        orders,
        itemRows,
        settings: Object.fromEntries(settingsRows.map(row => [row.key, row.value])),
        templates: moldRows.map(templateFromMoldRow),
    };
}

function writeBackup({ scope, source }) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join('/private/tmp', `ro-active-order-recalculation-${scope}-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
        created_at: new Date().toISOString(),
        scope,
        orders: source.orders,
        itemRows: source.itemRows,
    }, null, 2), { mode: 0o600 });
    fs.chmodSync(backupPath, 0o600);
    return backupPath;
}

async function applyPlan(rest, plan, backupPath) {
    for (const orderPlan of plan.orders) {
        for (const item of orderPlan.itemPatches) {
            if (!item.patch) continue;
            await rest('order_items', { method: 'PATCH', query: { id: `eq.${item.id}` }, body: item.patch });
        }
        await rest('orders', { method: 'PATCH', query: { id: `eq.${orderPlan.id}` }, body: orderPlan.headerPatch });
        const [saved] = await rest('orders', {
            query: { select: 'id,total_hours_plan,total_revenue,total_margin,margin_percent', id: `eq.${orderPlan.id}` },
        });
        const actual = saved || {};
        const expected = orderPlan.headerPatch;
        for (const key of ['total_hours_plan', 'total_revenue', 'total_margin', 'margin_percent']) {
            if (Math.abs(numberOrZero(actual[key]) - numberOrZero(expected[key])) > 0.01) {
                throw new Error(`заказ ${orderPlan.id}: проверка ${key} не пройдена; backup: ${backupPath}`);
            }
        }
    }
}

async function rollback(rest, backupPath) {
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    if (!Array.isArray(backup.orders) || !Array.isArray(backup.itemRows)) throw new Error('Файл backup имеет неверный формат');
    for (const item of backup.itemRows) {
        await rest('order_items', {
            method: 'PATCH',
            query: { id: `eq.${item.id}` },
            body: { item_data: item.item_data, cost_total: item.cost_total, updated_at: item.updated_at },
        });
    }
    for (const order of backup.orders) {
        await rest('orders', {
            method: 'PATCH',
            query: { id: `eq.${order.id}` },
            body: {
                calculator_data: order.calculator_data,
                total_hours_plan: order.total_hours_plan,
                production_hours_plastic: order.production_hours_plastic,
                production_hours_packaging: order.production_hours_packaging,
                production_hours_hardware: order.production_hours_hardware,
                total_cost: order.total_cost,
                total_revenue: order.total_revenue,
                total_margin: order.total_margin,
                margin_percent: order.margin_percent,
                updated_at: order.updated_at,
            },
        });
    }
    return { orders: backup.orders.length, items: backup.itemRows.length };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) return printHelp();
    const rest = createRestClient(loadSupabaseConfig());
    if (args.rollback) {
        const restored = await rollback(rest, args.rollback);
        console.log(JSON.stringify({ mode: 'rollback', ...restored }, null, 2));
        return;
    }

    const source = await loadRemoteRows(rest, args.scope);
    const plan = buildRecalculationPlan({ ...source, engine: loadEngine() });
    const report = {
        mode: args.apply ? 'apply' : 'dry-run',
        scope: args.scope,
        statuses: args.scope === 'active' ? ACTIVE_STATUSES : DRAFT_STATUSES,
        setup_norms: plan.params,
        before: plan.before,
        after: plan.after,
        changed_items: plan.orders.reduce((sum, order) => sum + order.itemPatches.filter(item => item.patch).length, 0),
    };
    if (args.report) {
        report.orders = plan.orders.map(order => ({
            id: order.id,
            status: order.status,
            before: order.before,
            after: order.snapshot,
        }));
    }
    if (!args.apply) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    const backupPath = writeBackup({ scope: args.scope, source });
    await applyPlan(rest, plan, backupPath);
    console.log(JSON.stringify({ ...report, backup: backupPath, verified: true }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(`Пересчёт остановлен: ${error.message}`);
        process.exitCode = 1;
    });
}

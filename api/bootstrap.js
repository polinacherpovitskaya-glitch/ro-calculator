const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';

const SUPABASE_HEADERS = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
};

const SETTINGS_KEYS = {
    factualSnapshots: 'factual_month_snapshots_json',
};

const ALLOWED_KEYS = new Set([
    'orders',
    'timeEntries',
    'employees',
    'factualSnapshots',
    'warehouseItems',
]);

async function fetchSupabaseJson(path) {
    const response = await fetch(`${SUPABASE_URL}${path}`, { headers: SUPABASE_HEADERS });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = new Error(`Supabase ${response.status} for ${path}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }
    return response.json();
}

async function loadOrders() {
    return fetchSupabaseJson('/rest/v1/orders?select=*&order=created_at.desc');
}

async function loadTimeEntries() {
    return fetchSupabaseJson('/rest/v1/time_entries?select=*&order=date.desc');
}

async function loadEmployees() {
    return fetchSupabaseJson('/rest/v1/employees?select=*&order=name.asc');
}

async function loadWarehouseItems() {
    return fetchSupabaseJson('/rest/v1/warehouse_items?select=*&order=name.asc');
}

async function loadFactualSnapshots() {
    const rows = await fetchSupabaseJson(`/rest/v1/settings?select=value&key=eq.${encodeURIComponent(SETTINGS_KEYS.factualSnapshots)}&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.value) return {};
    try {
        return JSON.parse(rows[0].value);
    } catch (error) {
        return {};
    }
}

const LOADERS = {
    orders: loadOrders,
    timeEntries: loadTimeEntries,
    employees: loadEmployees,
    factualSnapshots: loadFactualSnapshots,
    warehouseItems: loadWarehouseItems,
};

function parseRequestedKeys(req) {
    const raw = String(req.query?.keys || '').trim();
    if (!raw) return ['orders'];
    return raw
        .split(',')
        .map(key => key.trim())
        .filter(key => ALLOWED_KEYS.has(key));
}

module.exports = async function handler(req, res) {
    const keys = [...new Set(parseRequestedKeys(req))];
    if (!keys.length) {
        res.status(400).json({ ok: false, error: 'No valid keys requested' });
        return;
    }

    const data = {};
    const errors = {};

    await Promise.all(keys.map(async (key) => {
        try {
            data[key] = await LOADERS[key]();
        } catch (error) {
            errors[key] = {
                message: error?.message || 'Unknown bootstrap error',
                status: error?.status || null,
            };
        }
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=600');
    res.status(200).json({
        ok: Object.keys(data).length > 0,
        data,
        errors,
    });
};

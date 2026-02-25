// =============================================
// Recycle Object — Supabase Client & Data Layer
// =============================================

// Supabase config
const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';

let supabaseClient = null;

function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('Supabase not configured. Running in local/demo mode.');
        return null;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
}

function isSupabaseReady() {
    return supabaseClient !== null;
}

// =============================================
// LOCAL STORAGE FALLBACK
// When Supabase is not configured, use localStorage
// =============================================

const LOCAL_KEYS = {
    settings: 'ro_calc_settings',
    templates: 'ro_calc_templates',
    orders: 'ro_calc_orders',
    orderItems: 'ro_calc_order_items',
    imports: 'ro_calc_imports',
    molds: 'ro_calc_molds',
    timeEntries: 'ro_calc_time_entries',
    tasks: 'ro_calc_tasks',
    chinaPurchases: 'ro_calc_china_purchases',
    vacations: 'ro_calc_vacations',
    employees: 'ro_calc_employees',
    orderFactuals: 'ro_calc_order_factuals',
    warehouseItems: 'ro_calc_warehouse_items',
    warehouseReservations: 'ro_calc_warehouse_reservations',
    warehouseHistory: 'ro_calc_warehouse_history',
    shipments: 'ro_calc_shipments',
    colors: 'ro_calc_colors',
};

// Data version — increment to trigger NON-DESTRUCTIVE migration
// NEVER delete user data! Only add missing fields to existing molds
const MOLDS_DATA_VERSION = 8; // v8: custom_prices per mold (replaces custom_margins)
const MOLDS_VERSION_KEY = 'ro_calc_molds_version';

function checkMoldsVersion() {
    const stored = parseInt(localStorage.getItem(MOLDS_VERSION_KEY)) || 0;
    if (stored < MOLDS_DATA_VERSION) {
        // Auto-backup before migration
        try {
            if (typeof Settings !== 'undefined' && Settings.autoBackup) {
                Settings.autoBackup('pre-migration-v' + MOLDS_DATA_VERSION);
            }
        } catch (e) { /* Settings may not be loaded yet */ }
        // NON-DESTRUCTIVE: migrate existing data, don't delete it
        const existing = getLocal(LOCAL_KEYS.molds);
        if (existing && existing.length > 0) {
            // Add missing fields to each mold (preserve user data like photos, PPH)
            const defaults = getDefaultMolds();
            const migrated = existing.map(m => {
                const def = defaults.find(d => d.id === m.id);
                // Ensure collection field exists (added in v4)
                if (!m.collection && def) {
                    m.collection = def.collection || '';
                }
                // Fill PPH from reference table if user hasn't set them (v6)
                // Only fill if both min and max are 0 or missing
                if ((!m.pph_min || m.pph_min === 0) && (!m.pph_max || m.pph_max === 0) && def) {
                    if (def.pph_min > 0) m.pph_min = def.pph_min;
                    if (def.pph_max > 0) m.pph_max = def.pph_max;
                }
                // Ensure hw fields exist (added in v3)
                if (m.hw_name === undefined) m.hw_name = '';
                if (m.hw_price_per_unit === undefined) m.hw_price_per_unit = 0;
                if (m.hw_delivery_total === undefined) m.hw_delivery_total = 0;
                if (m.hw_speed === undefined) m.hw_speed = null;
                if (m.hw_source === undefined) m.hw_source = 'custom';
                if (m.hw_warehouse_item_id === undefined) m.hw_warehouse_item_id = null;
                if (m.hw_warehouse_sku === undefined) m.hw_warehouse_sku = '';
                // Ensure photo field exists (added in v36)
                if (m.photo_url === undefined) m.photo_url = '';
                // Ensure category field
                if (!m.category) m.category = 'blank';
                // Ensure custom_margins field exists (added in v7)
                if (m.custom_margins === undefined) m.custom_margins = {};
                // Ensure custom_prices field exists (added in v8)
                if (m.custom_prices === undefined) m.custom_prices = {};
                return m;
            });
            setLocal(LOCAL_KEYS.molds, migrated);
            console.log('Molds migrated to version', MOLDS_DATA_VERSION, '(preserved', migrated.length, 'records)');
        }
        // If no existing data, getDefaultMolds() will be used by loadMolds()
        localStorage.setItem(MOLDS_VERSION_KEY, String(MOLDS_DATA_VERSION));
    }
}

function getLocal(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || null;
    } catch (e) { return null; }
}

function setLocal(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// =============================================
// SETTINGS
// =============================================

async function loadSettings() {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('key, value');
        if (error) {
            console.error('loadSettings error:', error);
            // Fallback to localStorage, not just defaults
            return getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
        }
        if (data && data.length > 0) {
            const defaults = getDefaultSettings();
            const numericKeys = new Set(Object.keys(defaults));
            const obj = {};
            data.forEach(r => {
                // Parse numeric values back to numbers (Supabase TEXT column returns strings)
                if (numericKeys.has(r.key) && typeof defaults[r.key] === 'number') {
                    obj[r.key] = parseFloat(r.value) || 0;
                } else {
                    obj[r.key] = r.value ?? '';
                }
            });
            // Ensure all default keys exist
            Object.keys(defaults).forEach(k => {
                if (obj[k] === undefined) obj[k] = defaults[k];
            });
            // Cache to localStorage for offline/backup
            setLocal(LOCAL_KEYS.settings, obj);
            return obj;
        }
        // Supabase empty — seed from localStorage or defaults, then return
        const local = getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
        console.log('Supabase settings empty, seeding from local...');
        await saveAllSettings(local);
        return local;
    }
    return getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
}

async function saveSetting(key, value) {
    // Always save to localStorage (dual-write)
    const s = getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
    s[key] = value;
    setLocal(LOCAL_KEYS.settings, s);

    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ key, value: String(value ?? ''), updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) console.error('saveSetting error:', error);
    }
}

async function saveAllSettings(settingsObj) {
    // Always save to localStorage (dual-write for safety)
    setLocal(LOCAL_KEYS.settings, settingsObj);

    if (isSupabaseReady()) {
        // Convert ALL values to strings for Supabase TEXT column
        const rows = Object.entries(settingsObj).map(([key, value]) => ({
            key, value: String(value ?? ''), updated_at: new Date().toISOString()
        }));
        const { error } = await supabaseClient
            .from('settings')
            .upsert(rows, { onConflict: 'key' });
        if (error) console.error('saveAllSettings error:', error);
    }
}

function getDefaultSettings() {
    return {
        fot_per_hour: 550,
        indirect_costs_monthly: 1913265,
        cutting_speed: 180,
        plastic_cost_per_kg: 250,
        nfc_write_speed: 350,
        workers_count: 3.5,
        hours_per_worker: 189,
        work_load_ratio: 0.8,
        plastic_injection_ratio: 0.7,
        packaging_ratio: 0.3,
        mold_base_cost: 20000,
        design_cost: 8500,
        nfc_tag_cost: 10,
        vat_rate: 0.05,
        tax_rate: 0.06,
        margin_target: 0.40,
        delivery_cost_moscow: 2000,
        printing_delivery_cost: 1500,
        mp_commission: 0.05,
        mp_logistics: 0.06,
        mp_storage_ratio: 0.32,
        mp_acquiring: 0.065,
        waste_factor: 1.1,
    };
}

// =============================================
// PRODUCT TEMPLATES
// =============================================

async function loadTemplates() {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('product_templates')
            .select('*')
            .order('category')
            .order('name');
        if (error) { console.error('loadTemplates error:', error); return getDefaultTemplates(); }
        if (data && data.length > 0) {
            return data;
        }
        // Supabase empty — seed from molds/defaults
        console.log('Supabase templates empty, seeding from local molds...');
        const localTemplates = _getLocalTemplates();
        // Seed Supabase in background
        if (localTemplates.length > 0) {
            supabaseClient.from('product_templates').insert(localTemplates)
                .then(({ error: e }) => { if (e) console.error('Seed templates error:', e); });
        }
        return localTemplates;
    }
    return _getLocalTemplates();
}

function _getLocalTemplates() {
    // In localStorage mode, always derive templates from molds (source of truth)
    const molds = getLocal(LOCAL_KEYS.molds);
    if (molds && molds.length > 0) {
        return molds.map(m => _moldToTemplate(m));
    }
    return getDefaultTemplates();
}

function getDefaultTemplates() {
    // Auto-generate from default molds (blanks catalog is the source of truth)
    const molds = getDefaultMolds();
    return molds.map(m => _moldToTemplate(m));
}

/** Convert a mold object to a template object (single source of truth) */
function _moldToTemplate(m) {
    const pMin = m.pph_min || 0;
    const pMax = m.pph_max || 0;
    const pAvg = (pMin > 0 && pMax > 0) ? Math.round((pMin + pMax) / 2) : (pMin || pMax || 0);
    const display = pMin === 0 ? '—' : (pMin === pMax ? String(pMin) : `${pMin}-${pMax}`);
    return {
        id: m.id,
        name: m.name,
        category: m.category === 'nfc' ? 'blank' : (m.category || 'blank'),
        collection: m.collection || '',
        photo_url: m.photo_url || '',
        pieces_per_hour_display: display,
        pieces_per_hour_min: pMin,
        pieces_per_hour_max: pMax,
        pieces_per_hour_avg: pAvg,
        weight_grams: m.weight_grams,
        // Built-in hardware (e.g. mirror, magnet, ring)
        hw_name: m.hw_name || '',
        hw_price_per_unit: m.hw_price_per_unit || 0,
        hw_delivery_total: m.hw_delivery_total || 0,
        hw_speed: m.hw_speed || 0,
        // Per-mold custom margins (overrides standard tier margins)
        custom_margins: m.custom_margins || {},
        // Per-mold custom prices (absolute sell prices per tier)
        custom_prices: m.custom_prices || {},
    };
}

/** Rebuild App.templates from molds (called after mold save) */
function refreshTemplatesFromMolds(molds) {
    App.templates = molds.map(m => _moldToTemplate(m));
}

// =============================================
// ORDERS
// =============================================

// Known columns in Supabase tables (must match schema exactly)
const _ORDER_COLS = new Set([
    'id', 'order_name', 'client_name', 'status',
    'deadline', 'deadline_start', 'deadline_end',
    'delivery_address', 'telegram', 'crm_link', 'fintablo_link',
    'client_legal_name', 'client_inn', 'client_legal_address',
    'client_bank_name', 'client_bank_account', 'client_bank_bik',
    'payment_status', 'total_hours_plan',
    'production_hours_plastic', 'production_hours_packaging', 'production_hours_hardware',
    'total_cost', 'total_revenue', 'total_margin', 'margin_percent',
    'calculator_data', 'items_snapshot', 'hardware_snapshot', 'packaging_snapshot',
    'manager_name', 'owner_name', 'notes',
    'created_at', 'updated_at', 'deleted_at',
]);

const _ITEM_COLS = new Set([
    'id', 'order_id', 'item_number', 'template_id', 'product_name',
    'quantity', 'unit_price', 'sell_price_item', 'sell_price_printing',
    'total_price', 'cost_total', 'item_data',
    'created_at', 'updated_at',
]);

// Map code fields to schema fields (where names differ)
const _ORDER_FIELD_MAP = {
    total_revenue_plan: 'total_revenue',
    total_cost_plan: 'total_cost',
    total_margin_plan: 'total_margin',
    margin_percent_plan: 'margin_percent',
};

/**
 * Filter object to only known DB columns + store ALL data as JSON backup
 */
function _filterForDB(obj, knownCols, jsonCol, fieldMap) {
    const filtered = {};
    const fullData = {};

    for (const [key, val] of Object.entries(obj)) {
        if (val === undefined) continue;
        fullData[key] = val;

        // Map field name if needed (e.g. total_revenue_plan → total_revenue)
        const mappedKey = fieldMap && fieldMap[key] ? fieldMap[key] : key;

        if (knownCols.has(mappedKey)) {
            filtered[mappedKey] = val;
        }
    }

    // Store full data as JSON in the designated column
    if (jsonCol) {
        filtered[jsonCol] = JSON.stringify(fullData);
    }

    return filtered;
}

async function saveOrder(order, items) {
    if (isSupabaseReady()) {
        // Generate ID for new orders (Supabase BIGINT PK has no auto-increment)
        let orderId = order.id;
        if (!orderId) {
            orderId = Date.now();
            order.id = orderId;
        }

        // Filter order to known columns + store full data in calculator_data
        const orderData = _filterForDB(order, _ORDER_COLS, 'calculator_data', _ORDER_FIELD_MAP);
        orderData.updated_at = new Date().toISOString();

        // Try update first if order exists, otherwise insert
        const { data: existing } = await supabaseClient
            .from('orders').select('id').eq('id', orderId).maybeSingle();

        if (existing) {
            // Update existing order
            const { id: _id, ...updateFields } = orderData;
            const { error } = await supabaseClient
                .from('orders')
                .update(updateFields)
                .eq('id', orderId);
            if (error) { console.error('updateOrder error:', error); return null; }
        } else {
            // Insert new order
            orderData.created_at = orderData.created_at || new Date().toISOString();
            const { error } = await supabaseClient
                .from('orders')
                .insert(orderData);
            if (error) { console.error('insertOrder error:', error); return null; }
        }

        // Delete old items and insert new
        await supabaseClient.from('order_items').delete().eq('order_id', orderId);
        if (items.length > 0) {
            const rows = items.map((item, i) => {
                const filtered = _filterForDB(item, _ITEM_COLS, 'item_data', null);
                filtered.order_id = orderId;
                filtered.id = item.id || (Date.now() + i + 1);
                return filtered;
            });
            const { error } = await supabaseClient.from('order_items').insert(rows);
            if (error) console.error('insertOrderItems error:', error);
        }

        // Also save to localStorage as backup (full data, no filtering)
        _saveOrderLocally({ ...order, id: orderId }, items);

        return orderId;
    } else {
        // Local storage
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        let orderId = order.id;
        if (orderId) {
            const idx = orders.findIndex(o => o.id === orderId);
            if (idx >= 0) {
                // Merge: keep existing fields, overwrite with new values (skip undefined)
                const existing = orders[idx];
                const merged = { ...existing };
                for (const [key, val] of Object.entries(order)) {
                    if (val !== undefined) merged[key] = val;
                }
                merged.updated_at = new Date().toISOString();
                orders[idx] = merged;
            }
        } else {
            orderId = Date.now();
            orders.push({ ...order, id: orderId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        setLocal(LOCAL_KEYS.orders, orders);

        const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
        const filtered = allItems.filter(i => i.order_id !== orderId);
        const newItems = items.map((item, idx) => ({ ...item, id: Date.now() + idx, order_id: orderId }));
        setLocal(LOCAL_KEYS.orderItems, [...filtered, ...newItems]);

        return orderId;
    }
}

/** Save order to localStorage (used as backup when Supabase is primary) */
function _saveOrderLocally(order, items) {
    try {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === order.id);
        if (idx >= 0) {
            const existing = orders[idx];
            const merged = { ...existing };
            for (const [key, val] of Object.entries(order)) {
                if (val !== undefined) merged[key] = val;
            }
            merged.updated_at = new Date().toISOString();
            orders[idx] = merged;
        } else {
            orders.push({ ...order, created_at: order.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        setLocal(LOCAL_KEYS.orders, orders);

        const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
        const filtered = allItems.filter(i => i.order_id !== order.id);
        const newItems = items.map((item, i) => ({ ...item, id: item.id || (Date.now() + i), order_id: order.id }));
        setLocal(LOCAL_KEYS.orderItems, [...filtered, ...newItems]);
    } catch (e) { console.warn('Local backup save error:', e); }
}

async function loadOrders(filters = {}) {
    if (isSupabaseReady()) {
        let query = supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
        if (filters.status) {
            query = query.eq('status', filters.status);
        } else {
            query = query.neq('status', 'deleted');
        }
        if (filters.limit) query = query.limit(filters.limit);
        const { data, error } = await query;
        if (error) { console.error('loadOrders error:', error); return []; }

        // One-time migration: if Supabase empty but localStorage has orders, push them up
        if ((!data || data.length === 0) && !filters.status) {
            const localOrders = getLocal(LOCAL_KEYS.orders) || [];
            const activeLocal = localOrders.filter(o => o.status !== 'deleted');
            if (activeLocal.length > 0) {
                console.log('Migrating', activeLocal.length, 'orders from localStorage to Supabase...');
                for (const order of localOrders) {
                    try {
                        const filtered = _filterForDB(order, _ORDER_COLS, 'calculator_data', _ORDER_FIELD_MAP);
                        await supabaseClient.from('orders').upsert(filtered, { onConflict: 'id' });
                    } catch (e) { console.warn('Order migration error:', e); }
                }
                // Also migrate order items
                const localItems = getLocal(LOCAL_KEYS.orderItems) || [];
                if (localItems.length > 0) {
                    try {
                        const filteredItems = localItems.map(item => {
                            const f = _filterForDB(item, _ITEM_COLS, 'item_data', null);
                            f.id = f.id || Date.now() + Math.floor(Math.random() * 10000);
                            return f;
                        });
                        await supabaseClient.from('order_items').insert(filteredItems);
                    } catch (e) { console.warn('Items migration error:', e); }
                }
                return activeLocal.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        }

        // Restore full data from calculator_data JSON for each order
        return (data || []).map(order => {
            if (order.calculator_data) {
                try {
                    const extras = JSON.parse(order.calculator_data);
                    const merged = { ...extras, ...order };
                    if (merged.total_revenue !== undefined) merged.total_revenue_plan = merged.total_revenue;
                    if (merged.total_cost !== undefined) merged.total_cost_plan = merged.total_cost;
                    if (merged.total_margin !== undefined) merged.total_margin_plan = merged.total_margin;
                    if (merged.margin_percent !== undefined) merged.margin_percent_plan = merged.margin_percent;
                    return merged;
                } catch (e) { /* ignore */ }
            }
            return order;
        });
    }
    let orders = getLocal(LOCAL_KEYS.orders) || [];
    // Fix orders with missing status (bug from v40e autosave)
    let needsSave = false;
    orders.forEach(o => {
        if (!o.status) { o.status = 'draft'; needsSave = true; }
    });
    if (needsSave) setLocal(LOCAL_KEYS.orders, orders);

    if (filters.status) {
        orders = orders.filter(o => o.status === filters.status);
    } else {
        // By default, exclude deleted orders
        orders = orders.filter(o => o.status !== 'deleted');
    }
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.limit) orders = orders.slice(0, filters.limit);
    return orders;
}

async function loadOrder(orderId) {
    // Coerce string ID to number (select values are always strings, but IDs are Date.now() numbers)
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) orderId = Number(orderId);
    if (isSupabaseReady()) {
        const { data: order, error: e1 } = await supabaseClient
            .from('orders').select('*').eq('id', orderId).single();
        if (e1) { console.error('loadOrder error:', e1); return null; }

        // Restore full order data from calculator_data JSON
        let fullOrder = { ...order };
        if (order.calculator_data) {
            try {
                const extras = JSON.parse(order.calculator_data);
                fullOrder = { ...extras, ...order }; // DB columns take priority
                // Reverse-map schema fields back to code fields
                if (fullOrder.total_revenue !== undefined) fullOrder.total_revenue_plan = fullOrder.total_revenue;
                if (fullOrder.total_cost !== undefined) fullOrder.total_cost_plan = fullOrder.total_cost;
                if (fullOrder.total_margin !== undefined) fullOrder.total_margin_plan = fullOrder.total_margin;
                if (fullOrder.margin_percent !== undefined) fullOrder.margin_percent_plan = fullOrder.margin_percent;
            } catch (e) { /* ignore parse errors */ }
        }

        const { data: rawItems, error: e2 } = await supabaseClient
            .from('order_items').select('*').eq('order_id', orderId).order('item_number');
        if (e2) { console.error('loadOrderItems error:', e2); return null; }

        // Restore full item data from item_data JSON
        const items = (rawItems || []).map(item => {
            if (item.item_data) {
                try {
                    const extras = JSON.parse(item.item_data);
                    return { ...extras, ...item }; // DB columns take priority
                } catch (e) { /* ignore */ }
            }
            return item;
        });

        return { order: fullOrder, items };
    }
    const orders = getLocal(LOCAL_KEYS.orders) || [];
    const order = orders.find(o => o.id === orderId);
    const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
    const items = allItems.filter(i => i.order_id === orderId).sort((a, b) => a.item_number - b.item_number);
    return order ? { order, items } : null;
}

async function updateOrderStatus(orderId, status) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) console.error('updateOrderStatus error:', error);
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            orders[idx].status = status;
            orders[idx].updated_at = new Date().toISOString();
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
}

async function updateOrderFields(orderId, updates) {
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) orderId = Number(orderId);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) console.error('updateOrderFields error:', error);
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            Object.assign(orders[idx], updates, { updated_at: new Date().toISOString() });
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
}

async function deleteOrder(orderId) {
    // Soft delete — mark as deleted, keep data for recovery
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'deleted', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) console.error('deleteOrder error:', error);
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            orders[idx].status = 'deleted';
            orders[idx].deleted_at = new Date().toISOString();
            orders[idx].updated_at = new Date().toISOString();
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
}

async function restoreOrder(orderId) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'draft', deleted_at: null, updated_at: new Date().toISOString() })
            .eq('id', orderId);
        if (error) console.error('restoreOrder error:', error);
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            orders[idx].status = 'draft';
            orders[idx].deleted_at = null;
            orders[idx].updated_at = new Date().toISOString();
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
}

async function permanentDeleteOrder(orderId) {
    if (isSupabaseReady()) {
        await supabaseClient.from('order_items').delete().eq('order_id', orderId);
        const { error } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (error) console.error('permanentDeleteOrder error:', error);
    } else {
        const orders = (getLocal(LOCAL_KEYS.orders) || []).filter(o => o.id !== orderId);
        setLocal(LOCAL_KEYS.orders, orders);
        const items = (getLocal(LOCAL_KEYS.orderItems) || []).filter(i => i.order_id !== orderId);
        setLocal(LOCAL_KEYS.orderItems, items);
    }
}

// =============================================
// FINTABLO IMPORTS
// =============================================

async function saveFintabloImport(importData) {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('fintablo_imports')
            .insert(importData)
            .select('id')
            .single();
        if (error) { console.error('saveFintabloImport error:', error); return null; }
        return data.id;
    }
    const imports = getLocal(LOCAL_KEYS.imports) || [];
    const id = Date.now();
    imports.push({ ...importData, id, import_date: new Date().toISOString() });
    setLocal(LOCAL_KEYS.imports, imports);
    return id;
}

async function loadFintabloImports(orderId) {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('fintablo_imports')
            .select('*')
            .eq('order_id', orderId)
            .order('import_date', { ascending: false });
        if (error) { console.error('loadFintabloImports error:', error); return []; }
        return data;
    }
    const imports = getLocal(LOCAL_KEYS.imports) || [];
    return imports.filter(i => i.order_id === orderId);
}

// =============================================
// ORDER FACTUALS (Plan vs Fact data)
// =============================================

async function loadFactual(orderId) {
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) orderId = Number(orderId);
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('order_factuals')
            .select('*')
            .eq('order_id', orderId)
            .single();
        if (error && error.code !== 'PGRST116') console.error('loadFactual error:', error);
        return data || null;
    }
    const all = getLocal(LOCAL_KEYS.orderFactuals) || [];
    return all.find(f => f.order_id === orderId) || null;
}

async function saveFactual(orderId, factData) {
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) orderId = Number(orderId);
    const record = { ...factData, order_id: orderId, updated_at: new Date().toISOString() };
    if (isSupabaseReady()) {
        // Check if exists
        const existing = await loadFactual(orderId);
        if (existing) {
            const { error } = await supabaseClient
                .from('order_factuals')
                .update(record)
                .eq('order_id', orderId);
            if (error) console.error('saveFactual update error:', error);
        } else {
            const { error } = await supabaseClient
                .from('order_factuals')
                .insert(record);
            if (error) console.error('saveFactual insert error:', error);
        }
    } else {
        const all = getLocal(LOCAL_KEYS.orderFactuals) || [];
        const idx = all.findIndex(f => f.order_id === orderId);
        if (idx >= 0) {
            all[idx] = record;
        } else {
            record.id = Date.now();
            all.push(record);
        }
        setLocal(LOCAL_KEYS.orderFactuals, all);
    }
}

// =============================================
// TIME ENTRIES (employee time tracking)
// =============================================

async function loadTimeEntries() {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('time_entries')
            .select('*')
            .order('date', { ascending: false });
        if (error) { console.error('loadTimeEntries error:', error); return []; }
        return data;
    }
    return getLocal(LOCAL_KEYS.timeEntries) || [];
}

async function saveTimeEntry(entry) {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('time_entries')
            .insert(entry)
            .select('id')
            .single();
        if (error) { console.error('saveTimeEntry error:', error); return null; }
        return data.id;
    }
    const entries = getLocal(LOCAL_KEYS.timeEntries) || [];
    const id = Date.now();
    entries.push({ ...entry, id, created_at: new Date().toISOString() });
    setLocal(LOCAL_KEYS.timeEntries, entries);
    return id;
}

async function deleteTimeEntry(entryId) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient.from('time_entries').delete().eq('id', entryId);
        if (error) console.error('deleteTimeEntry error:', error);
    } else {
        const entries = (getLocal(LOCAL_KEYS.timeEntries) || []).filter(e => e.id !== entryId);
        setLocal(LOCAL_KEYS.timeEntries, entries);
    }
}

// =============================================
// MOLDS (extended product templates with cost data)
// =============================================

async function loadMolds() {
    // Check if molds data version changed — force reset cached data
    checkMoldsVersion();
    // Molds are stored in localStorage as extended template objects
    return getLocal(LOCAL_KEYS.molds) || getDefaultMolds();
}

async function saveMold(mold) {
    const molds = await loadMolds();
    if (mold.id) {
        const idx = molds.findIndex(m => m.id === mold.id);
        if (idx >= 0) {
            molds[idx] = { ...mold, updated_at: new Date().toISOString() };
        }
    } else {
        mold.id = Date.now();
        mold.created_at = new Date().toISOString();
        mold.updated_at = new Date().toISOString();
        molds.push(mold);
    }
    setLocal(LOCAL_KEYS.molds, molds);
    return mold.id;
}

async function deleteMold(moldId) {
    const molds = (await loadMolds()).filter(m => m.id !== moldId);
    setLocal(LOCAL_KEYS.molds, molds);
}

function getDefaultMolds() {
    const CNY_RATE = 12.5;
    const simpleCostCNY = 800;
    const complexCostCNY = 1000;
    const nfcCostCNY = 1200;
    const deliveryCost = 8000; // ~100$ доставка

    // Helper to create a mold entry
    const m = (id, name, cat, pMin, pMax, pAct, weight, complexity, costCny, opts = {}) => ({
        id, name, category: cat, collection: opts.collection || '', status: opts.status || 'active',
        pph_min: pMin, pph_max: pMax, pph_actual: pAct, weight_grams: weight,
        complexity, cost_cny: costCny, cny_rate: CNY_RATE, delivery_cost: deliveryCost,
        cost_rub: costCny * CNY_RATE + deliveryCost, mold_count: opts.mold_count || 1,
        hw_name: opts.hw_name || '', hw_price_per_unit: opts.hw_price || 0,
        hw_delivery_total: opts.hw_delivery || 0, hw_speed: opts.hw_speed || null,
        client: opts.client || '', notes: opts.notes || '',
        total_orders: opts.orders || 0, total_units_produced: opts.produced || 0,
        custom_margins: {}, custom_prices: {},
    });

    return [
        // === Бланки простые ===
        m(1,  'Бланк прямоугольник',       'blank', 50,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 12, produced: 5400 }),
        m(2,  'Бланк круг',                'blank', 45,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 8, produced: 3200 }),
        m(3,  'Бланк сердце',              'blank', 45,  55,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 6, produced: 2100 }),
        m(4,  'Бланк цветок',              'blank', 40,  50,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(5,  'Бланк треугольник',          'blank', 50,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(6,  'Бланк квадрат',             'blank', 50,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(7,  'Бланк тэг',                 'blank', 150, 200, null, 5,  'simple', simpleCostCNY, { collection: 'Бланки', orders: 15, produced: 12000, notes: 'Самый быстрый, маленький тег' }),
        m(8,  'Бланк конверт',             'blank', 40,  50,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),

        // === Формы с фурнитурой ===
        m(9,  'Карабин',                    'blank', 35,  45,  null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары', hw_speed: 120, orders: 10, produced: 4500, notes: 'Быстрая сборка' }),
        m(10, 'Отельный',                   'blank', 30,  40,  null, 30, 'simple', simpleCostCNY, { collection: 'Аксессуары', orders: 3, produced: 900 }),
        m(11, 'Зеркало-клякса',             'blank', 12,  15,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', hw_name: 'Зеркало', hw_price: 0, hw_speed: 60, orders: 3, produced: 600, notes: 'Нужно зеркало приклеить' }),
        m(12, 'Подставка под телефон',       'blank', 12,  18,  null, 40, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 3, produced: 600, notes: 'Тяжёлый, долго остывает' }),

        // === Аксессуары / формы ===
        m(13, 'Гребень',                    'blank', 12,  18,  null, 25, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 4, produced: 1200, notes: 'Сложная форма, тонкие зубья' }),
        m(14, 'Картхолдер',                 'blank', 15,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 5, produced: 1500 }),
        m(15, 'Новый кардхолдер',           'blank', 15,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 1, produced: 200, notes: 'Новая версия' }),
        m(16, 'Открывашка',                 'blank', 18,  25,  null, 25, 'simple', simpleCostCNY, { collection: 'Аксессуары', orders: 4, produced: 1000 }),
        m(17, 'Смайл',                      'blank', 12,  15,  null, 30, 'simple', simpleCostCNY, { collection: 'Фигурки', orders: 2, produced: 500 }),
        m(18, 'Бейдж',                      'blank', 40,  50,  null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары' }),
        m(19, 'Смотка',                     'blank', 25,  30,  null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары' }),
        m(20, 'Чехол для зажигалки',        'blank', 15,  20,  null, 20, 'complex', complexCostCNY, { collection: 'Аксессуары' }),
        m(21, 'Мыльница',                   'blank', 12,  18,  null, 30, 'complex', complexCostCNY, { collection: 'Для дома' }),
        m(22, 'Медаль',                     'blank', 35,  45,  null, 30, 'simple', simpleCostCNY, { collection: 'Фигурки' }),

        // === Спорт ===
        m(23, 'Ласты для плавания',          'blank', 25,  30,  null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),
        m(24, 'Беговые кроссовки',           'blank', 20,  25,  null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),
        m(25, 'Ракетка для тенниса',         'blank', 25,  30,  null, 25, 'simple', simpleCostCNY, { collection: 'Спорт', orders: 3, produced: 900 }),
        m(26, 'Падл ракетка',               'blank', 25,  30,  null, 25, 'simple', simpleCostCNY, { collection: 'Спорт' }),
        m(27, 'Велосипед',                  'blank', 15,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),

        // === Бусины ===
        m(28, 'Бусины большие',             'blank', 80,  100, null, 10, 'simple', simpleCostCNY, { collection: 'Бусины', orders: 7, produced: 8000 }),
        m(29, 'Бусины маленькие',           'blank', 70,  90,  null, 5,  'simple', simpleCostCNY, { collection: 'Бусины', orders: 7, produced: 6000 }),

        // === Буквы ===
        m(30, 'Буква из алфавита (лат.)',    'blank', 100, 120, null, 10, 'simple', simpleCostCNY, { collection: 'Буквы' }),
        m(31, 'Буква из алфавита (кир.)',    'blank', 100, 120, null, 10, 'simple', simpleCostCNY, { collection: 'Буквы' }),

        // === Фигурки / сувениры ===
        m(32, 'Шар',                        'blank', 15,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Фигурки' }),
        m(33, 'Маленькая елочка',            'blank', 40,  50,  null, 15, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(34, 'Большой конь',               'blank', 10,  15,  null, 40, 'complex', complexCostCNY, { collection: 'Фигурки' }),
        m(35, 'Маленькая снежинка',          'blank', 50,  60,  null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(36, 'Большой дракон',             'blank', 10,  15,  null, 40, 'complex', complexCostCNY, { collection: 'Фигурки', orders: 2, produced: 300, notes: 'Детализированная форма' }),
        m(37, 'Маленький цветочек',          'blank', 50,  60,  null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(38, 'Маленький конь',             'blank', 35,  45,  null, 15, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(39, 'Маленькое сердечко',          'blank', 50,  60,  null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),

        // === NFC ===
        m(40, 'NFC Звезда',                 'nfc', 20,  25,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', orders: 3, produced: 800, notes: '3-частный молд, вставка NFC чипа' }),
        m(41, 'NFC Квадрат',                'nfc', 20,  25,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', notes: '3-частный молд' }),
        m(42, 'NFC Сердце',                 'nfc', 10,  13,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', orders: 2, produced: 400, notes: '3-частный молд, медленный' }),
        m(43, 'NFC Камушек',                'nfc', 18,  22,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', notes: '3-частный молд' }),
    ];
}

// =============================================
// EMPLOYEES (Сотрудники — для Telegram-бота и учёта времени)
// =============================================

async function loadEmployees() {
    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient.from('employees').select('*').order('name');
        if (!error && data) return data;
    }
    return getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
}

async function saveEmployee(employee) {
    if (isSupabaseReady()) {
        if (employee.id) {
            const { error } = await supabaseClient.from('employees').update(employee).eq('id', employee.id);
            if (error) console.error('saveEmployee error:', error);
        } else {
            const { data, error } = await supabaseClient.from('employees').insert(employee).select('id').single();
            if (error) console.error('saveEmployee error:', error);
            if (data) employee.id = data.id;
        }
        return employee.id;
    }
    const employees = getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
    if (employee.id) {
        const idx = employees.findIndex(e => e.id === employee.id);
        if (idx >= 0) employees[idx] = { ...employee, updated_at: new Date().toISOString() };
    } else {
        employee.id = Date.now();
        employee.created_at = new Date().toISOString();
        employee.updated_at = new Date().toISOString();
        employees.push(employee);
    }
    setLocal(LOCAL_KEYS.employees, employees);
    return employee.id;
}

async function deleteEmployee(employeeId) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient.from('employees').delete().eq('id', employeeId);
        if (error) console.error('deleteEmployee error:', error);
    } else {
        const employees = (getLocal(LOCAL_KEYS.employees) || []).filter(e => e.id !== employeeId);
        setLocal(LOCAL_KEYS.employees, employees);
    }
}

function getDefaultEmployees() {
    return [
        { id: 1, name: 'Алина', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false },
        { id: 2, name: 'Элина', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false },
        { id: 3, name: 'Аня', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false },
        { id: 4, name: 'Глеб', role: 'production', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false },
        { id: 5, name: 'Полина', role: 'management', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: true },
        { id: 6, name: 'Никита', role: 'management', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: true },
    ];
}

// =============================================
// TASKS (Task Tracker — ex Notion To-do)
// =============================================

async function loadTasks() {
    return getLocal(LOCAL_KEYS.tasks) || [];
}

async function saveTasks(tasks) {
    setLocal(LOCAL_KEYS.tasks, tasks);
}

// =============================================
// CHINA ORDERS (Заказы в Китае)
// =============================================

async function loadChinaOrders() {
    return getLocal(LOCAL_KEYS.chinaOrders) || [];
}

async function saveChinaOrders(orders) {
    setLocal(LOCAL_KEYS.chinaOrders, orders);
}

// =============================================
// VACATIONS (Календарь отпусков)
// =============================================

async function loadVacations() {
    return getLocal(LOCAL_KEYS.vacations) || [];
}

async function saveVacations(vacations) {
    setLocal(LOCAL_KEYS.vacations, vacations);
}

// =============================================
// WAREHOUSE (Склад фурнитуры)
// =============================================

async function loadWarehouseItems() {
    return getLocal(LOCAL_KEYS.warehouseItems) || [];
}

async function saveWarehouseItem(item) {
    const items = await loadWarehouseItems();
    if (item.id) {
        const idx = items.findIndex(i => i.id === item.id);
        if (idx >= 0) {
            items[idx] = { ...item, updated_at: new Date().toISOString() };
        } else {
            item.updated_at = new Date().toISOString();
            items.push(item);
        }
    } else {
        item.id = Date.now();
        item.created_at = new Date().toISOString();
        item.updated_at = new Date().toISOString();
        items.push(item);
    }
    setLocal(LOCAL_KEYS.warehouseItems, items);
    return item.id;
}

async function saveWarehouseItems(items) {
    setLocal(LOCAL_KEYS.warehouseItems, items);
}

async function deleteWarehouseItem(itemId) {
    const items = (await loadWarehouseItems()).filter(i => i.id !== itemId);
    setLocal(LOCAL_KEYS.warehouseItems, items);
}

async function loadWarehouseReservations() {
    return getLocal(LOCAL_KEYS.warehouseReservations) || [];
}

async function saveWarehouseReservations(reservations) {
    setLocal(LOCAL_KEYS.warehouseReservations, reservations);
}

async function loadWarehouseHistory() {
    return getLocal(LOCAL_KEYS.warehouseHistory) || [];
}

async function saveWarehouseHistory(history) {
    setLocal(LOCAL_KEYS.warehouseHistory, history);
}

// =============================================
// SHIPMENTS (Приёмки из Китая)
// =============================================

async function loadShipments() {
    return getLocal(LOCAL_KEYS.shipments) || [];
}

async function saveShipment(shipment) {
    const shipments = await loadShipments();
    if (shipment.id) {
        const idx = shipments.findIndex(s => s.id === shipment.id);
        if (idx >= 0) {
            shipments[idx] = { ...shipment, updated_at: new Date().toISOString() };
        } else {
            shipment.updated_at = new Date().toISOString();
            shipments.push(shipment);
        }
    } else {
        shipment.id = Date.now();
        shipment.created_at = new Date().toISOString();
        shipment.updated_at = new Date().toISOString();
        shipments.push(shipment);
    }
    setLocal(LOCAL_KEYS.shipments, shipments);
    return shipment.id;
}

async function deleteShipment(shipmentId) {
    const shipments = (await loadShipments()).filter(s => s.id !== shipmentId);
    setLocal(LOCAL_KEYS.shipments, shipments);
}

// =============================================
// CHINA PURCHASES
// =============================================

async function saveChinaPurchase(purchase) {
    const purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    let purchaseId = purchase.id;
    if (purchaseId) {
        const idx = purchases.findIndex(p => p.id === purchaseId);
        if (idx >= 0) purchases[idx] = { ...purchase, updated_at: new Date().toISOString() };
    } else {
        purchaseId = Date.now();
        purchases.push({
            ...purchase,
            id: purchaseId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    }
    setLocal(LOCAL_KEYS.chinaPurchases, purchases);
    return purchaseId;
}

async function loadChinaPurchases(filters = {}) {
    let purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    if (filters.status) purchases = purchases.filter(p => p.status === filters.status);
    if (filters.delivery_type) purchases = purchases.filter(p => p.delivery_type === filters.delivery_type);
    if (filters.order_id) purchases = purchases.filter(p => p.order_id === filters.order_id);
    purchases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.limit) purchases = purchases.slice(0, filters.limit);
    return purchases;
}

async function loadChinaPurchase(purchaseId) {
    const purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    return purchases.find(p => p.id === purchaseId) || null;
}

async function updateChinaPurchaseStatus(purchaseId, status, note) {
    const purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return;
    purchase.status = status;
    purchase.status_history = purchase.status_history || [];
    purchase.status_history.push({ status, date: new Date().toISOString(), note: note || '' });
    purchase.updated_at = new Date().toISOString();
    setLocal(LOCAL_KEYS.chinaPurchases, purchases);
}

async function deleteChinaPurchase(purchaseId) {
    const purchases = (getLocal(LOCAL_KEYS.chinaPurchases) || []).filter(p => p.id !== purchaseId);
    setLocal(LOCAL_KEYS.chinaPurchases, purchases);
}

// =============================================
// COLORS (Справочник цветов)
// =============================================

const COLORS_DATA_VERSION = 2; // v2: real photos + correct names from Yandex Disk
const COLORS_VERSION_KEY = 'ro_colors_version';

function checkColorsVersion() {
    const stored = parseInt(localStorage.getItem(COLORS_VERSION_KEY) || '0');
    if (stored < COLORS_DATA_VERSION) {
        // Reset colors to new defaults (with photos)
        setLocal(LOCAL_KEYS.colors, getDefaultColors());
        console.log('Colors reset to version', COLORS_DATA_VERSION, 'with photos');
    }
    localStorage.setItem(COLORS_VERSION_KEY, String(COLORS_DATA_VERSION));
}

async function loadColors() {
    checkColorsVersion();
    return getLocal(LOCAL_KEYS.colors) || getDefaultColors();
}

async function saveColor(color) {
    const colors = await loadColors();
    if (color.id) {
        const idx = colors.findIndex(c => c.id === color.id);
        if (idx >= 0) {
            colors[idx] = { ...color, updated_at: new Date().toISOString() };
        }
    } else {
        color.id = Date.now();
        color.created_at = new Date().toISOString();
        color.updated_at = new Date().toISOString();
        colors.push(color);
    }
    setLocal(LOCAL_KEYS.colors, colors);
    return color.id;
}

async function saveColors(colors) {
    setLocal(LOCAL_KEYS.colors, colors);
}

async function deleteColor(colorId) {
    const colors = (await loadColors()).filter(c => c.id !== colorId);
    setLocal(LOCAL_KEYS.colors, colors);
}

function getDefaultColors() {
    const now = new Date().toISOString();
    const p = (n) => 'img/colors/' + n + '.png'; // photo path helper
    return [
        { id: 1,  number: '001', name: 'Красный',              photo_url: p('001'), notes: '', created_at: now, updated_at: now },
        { id: 2,  number: '002', name: 'Красный мрамор',       photo_url: p('002'), notes: '', created_at: now, updated_at: now },
        { id: 3,  number: '003', name: 'Коралловый',           photo_url: p('003'), notes: '', created_at: now, updated_at: now },
        { id: 4,  number: '004', name: 'Оранжевый',            photo_url: p('004'), notes: '', created_at: now, updated_at: now },
        { id: 5,  number: '005', name: 'Огненный мрамор',      photo_url: p('005'), notes: '', created_at: now, updated_at: now },
        { id: 6,  number: '006', name: 'Бордовый',             photo_url: p('006'), notes: '', created_at: now, updated_at: now },
        { id: 7,  number: '007', name: 'Янтарный',             photo_url: p('007'), notes: '', created_at: now, updated_at: now },
        { id: 8,  number: '008', name: 'Медовый мрамор',       photo_url: p('008'), notes: '', created_at: now, updated_at: now },
        { id: 9,  number: '009', name: 'Жёлтый',               photo_url: p('009'), notes: '', created_at: now, updated_at: now },
        { id: 10, number: '010', name: 'Перламутровый',        photo_url: p('010'), notes: '', created_at: now, updated_at: now },
        { id: 11, number: '011', name: 'Дымчатый',             photo_url: p('011'), notes: '', created_at: now, updated_at: now },
        { id: 12, number: '012', name: 'Белый',                photo_url: p('012'), notes: '', created_at: now, updated_at: now },
        { id: 13, number: '013', name: 'Светло-серый',         photo_url: p('013'), notes: '', created_at: now, updated_at: now },
        { id: 14, number: '014', name: 'Золотистый',           photo_url: p('014'), notes: '', created_at: now, updated_at: now },
        { id: 15, number: '015', name: 'Чёрное золото',        photo_url: p('015'), notes: '', created_at: now, updated_at: now },
        { id: 16, number: '016', name: 'Фуксия мрамор',       photo_url: p('016'), notes: '', created_at: now, updated_at: now },
        { id: 17, number: '017', name: 'Лиловый',              photo_url: p('017'), notes: '', created_at: now, updated_at: now },
        { id: 18, number: '018', name: 'Малиновый',            photo_url: p('018'), notes: '', created_at: now, updated_at: now },
        { id: 19, number: '019', name: 'Фуксия',               photo_url: p('019'), notes: '', created_at: now, updated_at: now },
        { id: 20, number: '020', name: 'Розовый',              photo_url: p('020'), notes: '', created_at: now, updated_at: now },
        { id: 21, number: '021', name: 'Фиолетовый мрамор',   photo_url: p('021'), notes: '', created_at: now, updated_at: now },
        { id: 22, number: '022', name: 'Ирис',                 photo_url: p('022'), notes: '', created_at: now, updated_at: now },
        { id: 23, number: '023', name: 'Сиреневый',            photo_url: p('023'), notes: '', created_at: now, updated_at: now },
        { id: 24, number: '024', name: 'Лавандовый',           photo_url: p('024'), notes: '', created_at: now, updated_at: now },
        { id: 25, number: '025', name: 'Мятный мрамор',        photo_url: p('025'), notes: '', created_at: now, updated_at: now },
        { id: 26, number: '026', name: 'Мятный',               photo_url: p('026'), notes: '', created_at: now, updated_at: now },
        { id: 27, number: '027', name: 'Бирюзовый мрамор',    photo_url: p('027'), notes: '', created_at: now, updated_at: now },
        { id: 28, number: '028', name: 'Оливковый мрамор',    photo_url: p('028'), notes: '', created_at: now, updated_at: now },
        { id: 29, number: '029', name: 'Индиго',               photo_url: p('029'), notes: '', created_at: now, updated_at: now },
        { id: 30, number: '030', name: 'Синий мрамор',         photo_url: p('030'), notes: '', created_at: now, updated_at: now },
        { id: 31, number: '031', name: 'Синий',                photo_url: p('031'), notes: '', created_at: now, updated_at: now },
        { id: 32, number: '032', name: 'Голубой мрамор',       photo_url: p('032'), notes: '', created_at: now, updated_at: now },
        { id: 33, number: '033', name: 'Океан',                photo_url: p('033'), notes: '', created_at: now, updated_at: now },
        { id: 34, number: '034', name: 'Салатовый',            photo_url: p('034'), notes: '', created_at: now, updated_at: now },
        { id: 35, number: '045', name: 'Лайм',                photo_url: p('045'), notes: '', created_at: now, updated_at: now },
        { id: 36, number: '036', name: 'Изумрудный',           photo_url: p('036'), notes: '', created_at: now, updated_at: now },
        { id: 37, number: '037', name: 'Хаки',                 photo_url: p('037'), notes: '', created_at: now, updated_at: now },
        { id: 38, number: '038', name: 'Оливковый',            photo_url: p('038'), notes: '', created_at: now, updated_at: now },
        { id: 39, number: '039', name: 'Чёрный',               photo_url: p('039'), notes: '', created_at: now, updated_at: now },
    ];
}

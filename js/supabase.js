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
    authAccounts: 'ro_calc_auth_accounts',
    authActivity: 'ro_calc_auth_activity',
    authSessions: 'ro_calc_auth_sessions',
    orderFactuals: 'ro_calc_order_factuals',
    warehouseItems: 'ro_calc_warehouse_items',
    warehouseReservations: 'ro_calc_warehouse_reservations',
    warehouseHistory: 'ro_calc_warehouse_history',
    shipments: 'ro_calc_shipments',
    colors: 'ro_calc_colors',
    hwBlanks: 'ro_calc_hw_blanks',
    pkgBlanks: 'ro_calc_pkg_blanks',
    marketplaceSets: 'ro_calc_marketplace_sets',
    productionPlan: 'ro_calc_production_plan',
    projectHardwareState: 'ro_calc_project_hardware_state',
};

// Data version — increment to trigger NON-DESTRUCTIVE migration
// NEVER delete user data! Only add missing fields to existing molds
const MOLDS_DATA_VERSION = 9; // v9: буквы (id 30,31) — добавлены hw_name/hw_price/hw_speed
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
                // v9: Update letter blanks (id 30, 31) with hw_* fields
                if ((m.id === 30 || m.id === 31) && !m.hw_name) {
                    m.hw_name = 'Фурнитура';
                    m.hw_price_per_unit = 1;
                    m.hw_speed = 60;
                }
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
            // Legacy normalization: old baseline used 189h/worker, now standard is 168h (21*8).
            if ((obj.hours_per_worker || 0) === 189) obj.hours_per_worker = 168;
            // Cache to localStorage for offline/backup
            setLocal(LOCAL_KEYS.settings, obj);
            return obj;
        }
        // Supabase empty — seed from localStorage or defaults, then return
        const local = getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
        if ((local.hours_per_worker || 0) === 189) local.hours_per_worker = 168;
        console.log('Supabase settings empty, seeding from local...');
        await saveAllSettings(local);
        return local;
    }
    const local = getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
    if ((local.hours_per_worker || 0) === 189) local.hours_per_worker = 168;
    return local;
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
        hours_per_worker: 168,
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
        indirect_cost_mode: 'production',
        // China catalog delivery rates & surcharges
        china_cny_rate: 12.5,
        china_usd_rate: 90,
        china_delivery_avia_fast: 38,
        china_delivery_avia: 33,
        china_delivery_auto: 4.8,
        china_item_surcharge: 0.035,    // +3.5% (вывод + крипта)
        china_delivery_surcharge: 0.10, // +10% (вывод + курс)
        production_holidays: '',
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
        // Keep mold economics on template so calculator can match "Бланки" себестоимость
        cost_cny: m.cost_cny || 0,
        cny_rate: m.cny_rate || 0,
        delivery_cost: m.delivery_cost || 0,
        mold_count: m.mold_count || 1,
        complexity: m.complexity || 'simple',
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
    checkMoldsVersion();
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('molds').select('*').order('name');
            if (error) console.error('loadMolds error:', error);
            if (data && data.length > 0) {
                const molds = data.map(row => {
                    if (row.mold_data) {
                        try {
                            const parsed = typeof row.mold_data === 'string' ? JSON.parse(row.mold_data) : row.mold_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.molds, molds);
                return molds;
            }
            // Migration
            const local = getLocal(LOCAL_KEYS.molds) || getDefaultMolds();
            if (local.length > 0) {
                console.log('Migrating', local.length, 'molds to Supabase...');
                for (const m of local) {
                    try {
                        await supabaseClient.from('molds').upsert({
                            id: m.id || Date.now(), name: m.name || '', mold_data: JSON.stringify(m),
                            created_at: m.created_at || new Date().toISOString(), updated_at: m.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('Mold migration error:', e); }
                }
                return local;
            }
            return getDefaultMolds();
        } catch(e) {
            console.error('loadMolds exception:', e);
            return getLocal(LOCAL_KEYS.molds) || getDefaultMolds();
        }
    }
    return getLocal(LOCAL_KEYS.molds) || getDefaultMolds();
}

async function saveMold(mold) {
    if (!mold.id) { mold.id = Date.now(); mold.created_at = new Date().toISOString(); }
    mold.updated_at = new Date().toISOString();
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('molds').upsert({
                id: mold.id, name: mold.name || '', mold_data: JSON.stringify(mold),
                created_at: mold.created_at || new Date().toISOString(), updated_at: mold.updated_at,
            }, { onConflict: 'id' });
            if (error) console.error('saveMold error:', error);
        } catch(e) { console.error('saveMold exception:', e); }
    }
    const molds = getLocal(LOCAL_KEYS.molds) || [];
    const idx = molds.findIndex(m => m.id === mold.id);
    if (idx >= 0) molds[idx] = mold; else molds.push(mold);
    setLocal(LOCAL_KEYS.molds, molds);
    return mold.id;
}

async function deleteMold(moldId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('molds').delete().eq('id', moldId);
            if (error) console.error('deleteMold error:', error);
        } catch(e) { console.error('deleteMold exception:', e); }
    }
    const molds = (getLocal(LOCAL_KEYS.molds) || []).filter(m => m.id !== moldId);
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
        m(30, 'Буква из алфавита (лат.)',    'blank', 100, 120, null, 10, 'simple', simpleCostCNY, { collection: 'Буквы', hw_name: 'Фурнитура', hw_price: 1, hw_speed: 60 }),
        m(31, 'Буква из алфавита (кир.)',    'blank', 100, 120, null, 10, 'simple', simpleCostCNY, { collection: 'Буквы', hw_name: 'Фурнитура', hw_price: 1, hw_speed: 60 }),

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
        if (!error && data && data.length > 0) return data;
        if (!error && data && data.length === 0) {
            // Seed default employees for fresh databases
            const defaults = getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
            try {
                await supabaseClient.from('employees').upsert(defaults, { onConflict: 'id' });
            } catch (e) {
                console.error('loadEmployees seed error:', e);
            }
            return defaults;
        }
    }
    return getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
}

async function saveEmployee(employee) {
    if (isSupabaseReady()) {
        if (!employee.id) {
            employee.id = Date.now();
        }
        const payload = {
            ...employee,
            updated_at: new Date().toISOString(),
            created_at: employee.created_at || new Date().toISOString(),
        };
        const { error } = await supabaseClient
            .from('employees')
            .upsert(payload, { onConflict: 'id' });
        if (error) {
            console.error('saveEmployee error:', error);
            return null;
        }
        // Keep local mirror updated for fallback and faster UI render
        const local = getLocal(LOCAL_KEYS.employees) || [];
        const idx = local.findIndex(e => e.id === employee.id);
        if (idx >= 0) local[idx] = { ...local[idx], ...employee, updated_at: new Date().toISOString() };
        else local.push({ ...employee, created_at: employee.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
        setLocal(LOCAL_KEYS.employees, local);
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

// =============================================
// AUTH ACCOUNTS (employee login/password mapping)
// =============================================

async function loadAuthAccounts() {
    const fallback = getLocal(LOCAL_KEYS.authAccounts) || [];
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'auth_accounts_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || [];
                setLocal(LOCAL_KEYS.authAccounts, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadAuthAccounts error:', e);
        }
    }
    return fallback;
}

async function saveAuthAccounts(accounts) {
    const payload = Array.isArray(accounts) ? accounts : [];
    setLocal(LOCAL_KEYS.authAccounts, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'auth_accounts_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveAuthAccounts error:', error);
    }
}

// =============================================
// AUTH ACTIVITY (audit trail for logins/navigation)
// =============================================

async function loadAuthActivity() {
    const fallback = getLocal(LOCAL_KEYS.authActivity) || [];
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'auth_activity_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || [];
                setLocal(LOCAL_KEYS.authActivity, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadAuthActivity error:', e);
        }
    }
    return fallback;
}

async function saveAuthActivity(events) {
    const payload = Array.isArray(events) ? events : [];
    setLocal(LOCAL_KEYS.authActivity, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'auth_activity_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveAuthActivity error:', error);
    }
}

async function appendAuthActivity(event) {
    const list = await loadAuthActivity();
    list.unshift({
        id: Date.now() + Math.floor(Math.random() * 1000),
        at: new Date().toISOString(),
        ...event,
    });
    const trimmed = list.slice(0, 800);
    await saveAuthActivity(trimmed);
}

// =============================================
// AUTH SESSIONS (time spent in app)
// =============================================

async function loadAuthSessions() {
    const fallback = getLocal(LOCAL_KEYS.authSessions) || [];
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'auth_sessions_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || [];
                setLocal(LOCAL_KEYS.authSessions, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadAuthSessions error:', e);
        }
    }
    return fallback;
}

async function saveAuthSessions(sessions) {
    const payload = Array.isArray(sessions) ? sessions : [];
    setLocal(LOCAL_KEYS.authSessions, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'auth_sessions_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveAuthSessions error:', error);
    }
}

// =============================================
// PRODUCTION PLAN (manual order/ranking state)
// =============================================

async function loadProductionPlanState() {
    const fallback = getLocal(LOCAL_KEYS.productionPlan) || { order_ids: [] };
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'production_plan_state_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || { order_ids: [] };
                setLocal(LOCAL_KEYS.productionPlan, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadProductionPlanState error:', e);
        }
    }
    return fallback;
}

async function saveProductionPlanState(state) {
    const payload = state && typeof state === 'object' ? state : { order_ids: [] };
    setLocal(LOCAL_KEYS.productionPlan, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'production_plan_state_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveProductionPlanState error:', error);
    }
}

// =============================================
// PROJECT HARDWARE PREP STATE (checkboxes)
// =============================================

async function loadProjectHardwareState() {
    const fallback = getLocal(LOCAL_KEYS.projectHardwareState) || { checks: {} };
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'project_hardware_state_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || { checks: {} };
                setLocal(LOCAL_KEYS.projectHardwareState, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadProjectHardwareState error:', e);
        }
    }
    return fallback;
}

async function saveProjectHardwareState(state) {
    const payload = state && typeof state === 'object' ? state : { checks: {} };
    if (!payload.checks || typeof payload.checks !== 'object') payload.checks = {};
    setLocal(LOCAL_KEYS.projectHardwareState, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'project_hardware_state_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveProjectHardwareState error:', error);
    }
}

async function appendAuthSession(session) {
    const list = await loadAuthSessions();
    list.unshift(session);
    await saveAuthSessions(list.slice(0, 2500));
}

async function updateAuthSession(sessionId, patch) {
    const list = await loadAuthSessions();
    const idx = list.findIndex(s => String(s.id) === String(sessionId));
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    await saveAuthSessions(list);
}

function getDefaultEmployees() {
    return [
        { id: 1, name: 'Алина', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
        { id: 2, name: 'Элина', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
        { id: 3, name: 'Аня', role: 'office', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
        { id: 4, name: 'Глеб', role: 'production', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: false, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
        { id: 5, name: 'Полина', role: 'management', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: true, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
        { id: 6, name: 'Никита', role: 'management', daily_hours: 8, telegram_id: null, telegram_username: '', reminder_hour: 17, reminder_minute: 30, timezone_offset: 3, is_active: true, tasks_required: true, pay_base_salary_month: 0, pay_base_hours_month: 176, pay_overtime_hour_rate: 0, pay_weekend_hour_rate: 0, pay_holiday_hour_rate: 0 },
    ];
}

// =============================================
// TASKS (Task Tracker — ex Notion To-do)
// =============================================

async function loadTasks() {
    if (isSupabaseReady()) {
        try {
            const { data } = await supabaseClient.from('app_tasks').select('*').eq('id', 1).maybeSingle();
            if (data && data.tasks_data) {
                const parsed = typeof data.tasks_data === 'string' ? JSON.parse(data.tasks_data) : data.tasks_data;
                setLocal(LOCAL_KEYS.tasks, parsed);
                return parsed;
            }
            const local = getLocal(LOCAL_KEYS.tasks) || [];
            if (local.length > 0) {
                console.log('Migrating tasks to Supabase...');
                await supabaseClient.from('app_tasks').upsert({ id: 1, tasks_data: JSON.stringify(local), updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return local;
            }
            return [];
        } catch(e) { console.error('loadTasks exception:', e); return getLocal(LOCAL_KEYS.tasks) || []; }
    }
    return getLocal(LOCAL_KEYS.tasks) || [];
}

async function saveTasks(tasks) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('app_tasks').upsert({ id: 1, tasks_data: JSON.stringify(tasks), updated_at: new Date().toISOString() }, { onConflict: 'id' });
            if (error) console.error('saveTasks error:', error);
        } catch(e) { console.error('saveTasks exception:', e); }
    }
    setLocal(LOCAL_KEYS.tasks, tasks);
}

// =============================================
// CHINA ORDERS (Заказы в Китае)
// =============================================

async function loadChinaOrders() {
    if (isSupabaseReady()) {
        try {
            const { data } = await supabaseClient.from('china_orders').select('*').eq('id', 1).maybeSingle();
            if (data && data.orders_data) {
                const parsed = typeof data.orders_data === 'string' ? JSON.parse(data.orders_data) : data.orders_data;
                setLocal(LOCAL_KEYS.chinaOrders, parsed);
                return parsed;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.chinaOrders) || [];
            if (local.length > 0) {
                console.log('Migrating china orders to Supabase...');
                await supabaseClient.from('china_orders').upsert({ id: 1, orders_data: JSON.stringify(local), updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return local;
            }
            return [];
        } catch(e) { console.error('loadChinaOrders exception:', e); return getLocal(LOCAL_KEYS.chinaOrders) || []; }
    }
    return getLocal(LOCAL_KEYS.chinaOrders) || [];
}

async function saveChinaOrders(orders) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('china_orders').upsert({ id: 1, orders_data: JSON.stringify(orders), updated_at: new Date().toISOString() }, { onConflict: 'id' });
            if (error) console.error('saveChinaOrders error:', error);
        } catch(e) { console.error('saveChinaOrders exception:', e); }
    }
    setLocal(LOCAL_KEYS.chinaOrders, orders);
}

// =============================================
// VACATIONS (Календарь отпусков)
// =============================================

async function loadVacations() {
    if (isSupabaseReady()) {
        try {
            const { data } = await supabaseClient.from('app_vacations').select('*').eq('id', 1).maybeSingle();
            if (data && data.vacations_data) {
                const parsed = typeof data.vacations_data === 'string' ? JSON.parse(data.vacations_data) : data.vacations_data;
                setLocal(LOCAL_KEYS.vacations, parsed);
                return parsed;
            }
            const local = getLocal(LOCAL_KEYS.vacations) || [];
            if (local.length > 0) {
                console.log('Migrating vacations to Supabase...');
                await supabaseClient.from('app_vacations').upsert({ id: 1, vacations_data: JSON.stringify(local), updated_at: new Date().toISOString() }, { onConflict: 'id' });
                return local;
            }
            return [];
        } catch(e) { console.error('loadVacations exception:', e); return getLocal(LOCAL_KEYS.vacations) || []; }
    }
    return getLocal(LOCAL_KEYS.vacations) || [];
}

async function saveVacations(vacations) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('app_vacations').upsert({ id: 1, vacations_data: JSON.stringify(vacations), updated_at: new Date().toISOString() }, { onConflict: 'id' });
            if (error) console.error('saveVacations error:', error);
        } catch(e) { console.error('saveVacations exception:', e); }
    }
    setLocal(LOCAL_KEYS.vacations, vacations);
}

// =============================================
// WAREHOUSE (Склад фурнитуры) — Supabase + localStorage
// v45: Cloud sync between computers
// =============================================

async function loadWarehouseItems() {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('warehouse_items').select('*').order('name');
            if (error) { console.error('loadWarehouseItems error:', error); }

            if (data && data.length > 0) {
                // Restore full data from item_data JSON
                const items = data.map(row => {
                    if (row.item_data) {
                        try {
                            const parsed = typeof row.item_data === 'string' ? JSON.parse(row.item_data) : row.item_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                // Update localStorage backup
                setLocal(LOCAL_KEYS.warehouseItems, items);
                return items;
            }

            // One-time migration: localStorage → Supabase
            const local = getLocal(LOCAL_KEYS.warehouseItems) || [];
            if (local.length > 0) {
                console.log('Migrating', local.length, 'warehouse items to Supabase...');
                for (const item of local) {
                    try {
                        await supabaseClient.from('warehouse_items').upsert({
                            id: item.id || Date.now(),
                            name: item.name || '',
                            sku: item.sku || '',
                            category: item.category || '',
                            item_data: JSON.stringify(item),
                            created_at: item.created_at || new Date().toISOString(),
                            updated_at: item.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('WH item migration error:', e); }
                }
                return local;
            }
            return [];
        } catch(e) {
            console.error('loadWarehouseItems exception:', e);
            return getLocal(LOCAL_KEYS.warehouseItems) || [];
        }
    }
    return getLocal(LOCAL_KEYS.warehouseItems) || [];
}

async function saveWarehouseItem(item) {
    if (!item.id) {
        item.id = Date.now();
        item.created_at = new Date().toISOString();
    }
    item.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = {
                id: item.id,
                name: item.name || '',
                sku: item.sku || '',
                category: item.category || '',
                item_data: JSON.stringify(item),
                created_at: item.created_at || new Date().toISOString(),
                updated_at: item.updated_at,
            };
            const { error } = await supabaseClient
                .from('warehouse_items').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveWarehouseItem error:', error);
        } catch(e) { console.error('saveWarehouseItem exception:', e); }
    }

    // localStorage backup
    const items = getLocal(LOCAL_KEYS.warehouseItems) || [];
    const idx = items.findIndex(i => i.id === item.id);
    if (idx >= 0) items[idx] = item; else items.push(item);
    setLocal(LOCAL_KEYS.warehouseItems, items);

    return item.id;
}

async function saveWarehouseItems(items) {
    if (isSupabaseReady()) {
        try {
            const rows = items.map(item => ({
                id: item.id || Date.now(),
                name: item.name || '',
                sku: item.sku || '',
                category: item.category || '',
                item_data: JSON.stringify(item),
                created_at: item.created_at || new Date().toISOString(),
                updated_at: item.updated_at || new Date().toISOString(),
            }));
            const { error } = await supabaseClient
                .from('warehouse_items').upsert(rows, { onConflict: 'id' });
            if (error) console.error('saveWarehouseItems error:', error);
        } catch(e) { console.error('saveWarehouseItems exception:', e); }
    }
    setLocal(LOCAL_KEYS.warehouseItems, items);
}

async function deleteWarehouseItem(itemId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient
                .from('warehouse_items').delete().eq('id', itemId);
            if (error) console.error('deleteWarehouseItem error:', error);
        } catch(e) { console.error('deleteWarehouseItem exception:', e); }
    }
    const items = (getLocal(LOCAL_KEYS.warehouseItems) || []).filter(i => i.id !== itemId);
    setLocal(LOCAL_KEYS.warehouseItems, items);
}

async function loadWarehouseReservations() {
    if (isSupabaseReady()) {
        try {
            const { data } = await supabaseClient
                .from('warehouse_reservations').select('*').eq('id', 1).maybeSingle();
            if (data && data.reservations_data) {
                const parsed = typeof data.reservations_data === 'string'
                    ? JSON.parse(data.reservations_data) : data.reservations_data;
                setLocal(LOCAL_KEYS.warehouseReservations, parsed);
                return parsed;
            }
            // Migration
            const local = getLocal(LOCAL_KEYS.warehouseReservations) || [];
            if (local.length > 0) {
                console.log('Migrating warehouse reservations to Supabase...');
                await supabaseClient.from('warehouse_reservations').upsert({
                    id: 1, reservations_data: JSON.stringify(local), updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
                return local;
            }
            return [];
        } catch(e) {
            console.error('loadWarehouseReservations exception:', e);
            return getLocal(LOCAL_KEYS.warehouseReservations) || [];
        }
    }
    return getLocal(LOCAL_KEYS.warehouseReservations) || [];
}

async function saveWarehouseReservations(reservations) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('warehouse_reservations').upsert({
                id: 1, reservations_data: JSON.stringify(reservations), updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
            if (error) console.error('saveWarehouseReservations error:', error);
        } catch(e) { console.error('saveWarehouseReservations exception:', e); }
    }
    setLocal(LOCAL_KEYS.warehouseReservations, reservations);
}

async function loadWarehouseHistory() {
    if (isSupabaseReady()) {
        try {
            const { data } = await supabaseClient
                .from('warehouse_history').select('*').eq('id', 1).maybeSingle();
            if (data && data.history_data) {
                const parsed = typeof data.history_data === 'string'
                    ? JSON.parse(data.history_data) : data.history_data;
                setLocal(LOCAL_KEYS.warehouseHistory, parsed);
                return parsed;
            }
            // Migration
            const local = getLocal(LOCAL_KEYS.warehouseHistory) || [];
            if (local.length > 0) {
                console.log('Migrating warehouse history to Supabase...');
                await supabaseClient.from('warehouse_history').upsert({
                    id: 1, history_data: JSON.stringify(local), created_at: new Date().toISOString()
                }, { onConflict: 'id' });
                return local;
            }
            return [];
        } catch(e) {
            console.error('loadWarehouseHistory exception:', e);
            return getLocal(LOCAL_KEYS.warehouseHistory) || [];
        }
    }
    return getLocal(LOCAL_KEYS.warehouseHistory) || [];
}

async function saveWarehouseHistory(history) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('warehouse_history').upsert({
                id: 1, history_data: JSON.stringify(history), created_at: new Date().toISOString()
            }, { onConflict: 'id' });
            if (error) console.error('saveWarehouseHistory error:', error);
        } catch(e) { console.error('saveWarehouseHistory exception:', e); }
    }
    setLocal(LOCAL_KEYS.warehouseHistory, history);
}

// =============================================
// SHIPMENTS (Приёмки из Китая)
// =============================================

async function loadShipments() {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('shipments').select('*').order('created_at', { ascending: false });
            if (error) console.error('loadShipments error:', error);
            if (data && data.length > 0) {
                const shipments = data.map(row => {
                    if (row.shipment_data) {
                        try {
                            const parsed = typeof row.shipment_data === 'string' ? JSON.parse(row.shipment_data) : row.shipment_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.shipments, shipments);
                return shipments;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.shipments) || [];
            if (local.length > 0) {
                console.log('Migrating', local.length, 'shipments to Supabase...');
                for (const s of local) {
                    try {
                        await supabaseClient.from('shipments').upsert({
                            id: s.id || Date.now(), shipment_data: JSON.stringify(s),
                            created_at: s.created_at || new Date().toISOString(), updated_at: s.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('Shipment migration error:', e); }
                }
                return local;
            }
            return [];
        } catch(e) {
            console.error('loadShipments exception:', e);
            return getLocal(LOCAL_KEYS.shipments) || [];
        }
    }
    return getLocal(LOCAL_KEYS.shipments) || [];
}

async function saveShipment(shipment) {
    if (!shipment.id) {
        shipment.id = Date.now();
        shipment.created_at = new Date().toISOString();
    }
    shipment.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: shipment.id, shipment_data: JSON.stringify(shipment), created_at: shipment.created_at, updated_at: shipment.updated_at };
            const { error } = await supabaseClient.from('shipments').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveShipment error:', error);
        } catch(e) { console.error('saveShipment exception:', e); }
    }

    // localStorage backup
    const shipments = getLocal(LOCAL_KEYS.shipments) || [];
    const idx = shipments.findIndex(s => s.id === shipment.id);
    if (idx >= 0) shipments[idx] = shipment; else shipments.push(shipment);
    setLocal(LOCAL_KEYS.shipments, shipments);
    return shipment.id;
}

async function deleteShipment(shipmentId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('shipments').delete().eq('id', shipmentId);
            if (error) console.error('deleteShipment error:', error);
        } catch(e) { console.error('deleteShipment exception:', e); }
    }
    const shipments = (getLocal(LOCAL_KEYS.shipments) || []).filter(s => s.id !== shipmentId);
    setLocal(LOCAL_KEYS.shipments, shipments);
}

// =============================================
// CHINA PURCHASES
// =============================================

async function saveChinaPurchase(purchase) {
    let purchaseId = purchase.id;
    if (!purchaseId) {
        purchaseId = Date.now();
        purchase = { ...purchase, id: purchaseId, created_at: new Date().toISOString() };
    }
    purchase.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = {
                id: purchaseId, status: purchase.status || 'draft',
                purchase_data: JSON.stringify(purchase),
                created_at: purchase.created_at || new Date().toISOString(),
                updated_at: purchase.updated_at,
            };
            const { error } = await supabaseClient.from('china_purchases').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveChinaPurchase error:', error);
        } catch(e) { console.error('saveChinaPurchase exception:', e); }
    }

    // localStorage backup
    const purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    const idx = purchases.findIndex(p => p.id === purchaseId);
    if (idx >= 0) purchases[idx] = purchase; else purchases.push(purchase);
    setLocal(LOCAL_KEYS.chinaPurchases, purchases);
    return purchaseId;
}

async function loadChinaPurchases(filters = {}) {
    let purchases;
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('china_purchases').select('*').order('created_at', { ascending: false });
            if (error) console.error('loadChinaPurchases error:', error);
            if (data && data.length > 0) {
                purchases = data.map(row => {
                    if (row.purchase_data) {
                        try {
                            const parsed = typeof row.purchase_data === 'string' ? JSON.parse(row.purchase_data) : row.purchase_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.chinaPurchases, purchases);
            } else {
                // Migration from localStorage
                const local = getLocal(LOCAL_KEYS.chinaPurchases) || [];
                if (local.length > 0) {
                    console.log('Migrating', local.length, 'china purchases to Supabase...');
                    for (const p of local) {
                        try {
                            await supabaseClient.from('china_purchases').upsert({
                                id: p.id || Date.now(), status: p.status || 'draft',
                                purchase_data: JSON.stringify(p),
                                created_at: p.created_at || new Date().toISOString(),
                                updated_at: p.updated_at || new Date().toISOString(),
                            }, { onConflict: 'id' });
                        } catch(e) { console.warn('ChinaPurchase migration error:', e); }
                    }
                    purchases = local;
                } else {
                    purchases = [];
                }
            }
        } catch(e) {
            console.error('loadChinaPurchases exception:', e);
            purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
        }
    } else {
        purchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
    }

    // Apply filters client-side
    if (filters.status) purchases = purchases.filter(p => p.status === filters.status);
    if (filters.delivery_type) purchases = purchases.filter(p => p.delivery_type === filters.delivery_type);
    if (filters.order_id) purchases = purchases.filter(p => p.order_id === filters.order_id);
    purchases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.limit) purchases = purchases.slice(0, filters.limit);
    return purchases;
}

async function loadChinaPurchase(purchaseId) {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('china_purchases').select('*').eq('id', purchaseId).maybeSingle();
            if (error) console.error('loadChinaPurchase error:', error);
            if (data && data.purchase_data) {
                try {
                    const parsed = typeof data.purchase_data === 'string' ? JSON.parse(data.purchase_data) : data.purchase_data;
                    return { ...parsed, id: data.id };
                } catch(e) { /* fallthrough */ }
            }
            if (data) return data;
        } catch(e) { console.error('loadChinaPurchase exception:', e); }
    }
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

    if (isSupabaseReady()) {
        try {
            const row = {
                id: purchaseId, status: purchase.status,
                purchase_data: JSON.stringify(purchase),
                updated_at: purchase.updated_at,
            };
            const { error } = await supabaseClient.from('china_purchases').upsert(row, { onConflict: 'id' });
            if (error) console.error('updateChinaPurchaseStatus error:', error);
        } catch(e) { console.error('updateChinaPurchaseStatus exception:', e); }
    }
}

async function deleteChinaPurchase(purchaseId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('china_purchases').delete().eq('id', purchaseId);
            if (error) console.error('deleteChinaPurchase error:', error);
        } catch(e) { console.error('deleteChinaPurchase exception:', e); }
    }
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
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('app_colors').select('*').order('name');
            if (error) console.error('loadColors error:', error);
            if (data && data.length > 0) {
                const colors = data.map(row => {
                    if (row.color_data) {
                        try {
                            const parsed = typeof row.color_data === 'string' ? JSON.parse(row.color_data) : row.color_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.colors, colors);
                return colors;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.colors) || getDefaultColors();
            if (local.length > 0) {
                console.log('Migrating', local.length, 'colors to Supabase...');
                for (const c of local) {
                    try {
                        await supabaseClient.from('app_colors').upsert({
                            id: c.id || Date.now(), name: c.name || '', color_data: JSON.stringify(c),
                            created_at: c.created_at || new Date().toISOString(), updated_at: c.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('Color migration error:', e); }
                }
                return local;
            }
            return getDefaultColors();
        } catch(e) {
            console.error('loadColors exception:', e);
            return getLocal(LOCAL_KEYS.colors) || getDefaultColors();
        }
    }
    return getLocal(LOCAL_KEYS.colors) || getDefaultColors();
}

async function saveColor(color) {
    if (!color.id) {
        color.id = Date.now();
        color.created_at = new Date().toISOString();
    }
    color.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: color.id, name: color.name || '', color_data: JSON.stringify(color), created_at: color.created_at, updated_at: color.updated_at };
            const { error } = await supabaseClient.from('app_colors').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveColor error:', error);
        } catch(e) { console.error('saveColor exception:', e); }
    }

    // localStorage backup
    const colors = getLocal(LOCAL_KEYS.colors) || getDefaultColors();
    const idx = colors.findIndex(c => c.id === color.id);
    if (idx >= 0) colors[idx] = color; else colors.push(color);
    setLocal(LOCAL_KEYS.colors, colors);
    return color.id;
}

async function saveColors(colors) {
    if (isSupabaseReady()) {
        try {
            const rows = colors.map(c => ({
                id: c.id || Date.now(), name: c.name || '', color_data: JSON.stringify(c),
                updated_at: c.updated_at || new Date().toISOString(),
            }));
            const { error } = await supabaseClient.from('app_colors').upsert(rows, { onConflict: 'id' });
            if (error) console.error('saveColors error:', error);
        } catch(e) { console.error('saveColors exception:', e); }
    }
    setLocal(LOCAL_KEYS.colors, colors);
}

async function deleteColor(colorId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('app_colors').delete().eq('id', colorId);
            if (error) console.error('deleteColor error:', error);
        } catch(e) { console.error('deleteColor exception:', e); }
    }
    const colors = (getLocal(LOCAL_KEYS.colors) || []).filter(c => c.id !== colorId);
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

// =============================================
// HARDWARE BLANKS (Справочник бланков фурнитуры)
// =============================================

async function loadHwBlanks() {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('hw_blanks').select('*').order('name');
            if (error) console.error('loadHwBlanks error:', error);
            if (data && data.length > 0) {
                const blanks = data.map(row => {
                    if (row.blank_data) {
                        try {
                            const parsed = typeof row.blank_data === 'string' ? JSON.parse(row.blank_data) : row.blank_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.hwBlanks, blanks);
                return blanks;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.hwBlanks) || getDefaultHwBlanks();
            if (local.length > 0) {
                console.log('Migrating', local.length, 'hw blanks to Supabase...');
                for (const b of local) {
                    try {
                        await supabaseClient.from('hw_blanks').upsert({
                            id: b.id || Date.now(), name: b.name || '',
                            blank_data: JSON.stringify(b),
                            created_at: b.created_at || new Date().toISOString(),
                            updated_at: b.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('HwBlank migration error:', e); }
                }
                return local;
            }
            return getDefaultHwBlanks();
        } catch(e) {
            console.error('loadHwBlanks exception:', e);
            return getLocal(LOCAL_KEYS.hwBlanks) || getDefaultHwBlanks();
        }
    }
    return getLocal(LOCAL_KEYS.hwBlanks) || getDefaultHwBlanks();
}

async function saveHwBlank(blank) {
    if (!blank.id) {
        blank.id = Date.now();
        blank.created_at = new Date().toISOString();
    }
    blank.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: blank.id, name: blank.name || '', blank_data: JSON.stringify(blank), created_at: blank.created_at, updated_at: blank.updated_at };
            const { error } = await supabaseClient.from('hw_blanks').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveHwBlank error:', error);
        } catch(e) { console.error('saveHwBlank exception:', e); }
    }

    const blanks = getLocal(LOCAL_KEYS.hwBlanks) || [];
    const idx = blanks.findIndex(b => b.id === blank.id);
    if (idx >= 0) blanks[idx] = blank; else blanks.push(blank);
    setLocal(LOCAL_KEYS.hwBlanks, blanks);
    return blank.id;
}

async function deleteHwBlank(blankId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('hw_blanks').delete().eq('id', blankId);
            if (error) console.error('deleteHwBlank error:', error);
        } catch(e) { console.error('deleteHwBlank exception:', e); }
    }
    const blanks = (getLocal(LOCAL_KEYS.hwBlanks) || []).filter(b => b.id !== blankId);
    setLocal(LOCAL_KEYS.hwBlanks, blanks);
}

function getDefaultHwBlanks() {
    const now = new Date().toISOString();
    return [
        { id: 1, name: 'Карабин', price_cny: 3, delivery_per_unit: 2, assembly_speed: 120, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 2, name: 'Цепочка 45 см', price_cny: 5, delivery_per_unit: 3, assembly_speed: 60, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 3, name: 'Цепочка 60 см', price_cny: 6, delivery_per_unit: 3, assembly_speed: 60, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 4, name: 'Кольцо соединительное', price_cny: 1, delivery_per_unit: 1, assembly_speed: 180, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 5, name: 'Брелочная цепочка', price_cny: 4, delivery_per_unit: 2, assembly_speed: 90, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 6, name: 'Шнурок вощёный', price_cny: 2, delivery_per_unit: 1, assembly_speed: 90, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 7, name: 'Булавка для броши', price_cny: 2, delivery_per_unit: 1, assembly_speed: 120, photo_url: '', notes: '', created_at: now, updated_at: now },
        { id: 8, name: 'Магнит', price_cny: 3, delivery_per_unit: 2, assembly_speed: 120, photo_url: '', notes: 'Неодимовый магнит', created_at: now, updated_at: now },
    ];
}

// =============================================
// PACKAGING BLANKS (Справочник бланков упаковки)
// =============================================

async function loadPkgBlanks() {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('pkg_blanks').select('*').order('name');
            if (error) console.error('loadPkgBlanks error:', error);
            if (data && data.length > 0) {
                const blanks = data.map(row => {
                    if (row.blank_data) {
                        try {
                            const parsed = typeof row.blank_data === 'string' ? JSON.parse(row.blank_data) : row.blank_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.pkgBlanks, blanks);
                return blanks;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.pkgBlanks) || getDefaultPkgBlanks();
            if (local.length > 0) {
                console.log('Migrating', local.length, 'pkg blanks to Supabase...');
                for (const b of local) {
                    try {
                        await supabaseClient.from('pkg_blanks').upsert({
                            id: b.id || Date.now(), name: b.name || '',
                            blank_data: JSON.stringify(b),
                            created_at: b.created_at || new Date().toISOString(),
                            updated_at: b.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('PkgBlank migration error:', e); }
                }
                return local;
            }
            return getDefaultPkgBlanks();
        } catch(e) {
            console.error('loadPkgBlanks exception:', e);
            return getLocal(LOCAL_KEYS.pkgBlanks) || getDefaultPkgBlanks();
        }
    }
    return getLocal(LOCAL_KEYS.pkgBlanks) || getDefaultPkgBlanks();
}

async function savePkgBlank(blank) {
    if (!blank.id) {
        blank.id = Date.now();
        blank.created_at = new Date().toISOString();
    }
    blank.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: blank.id, name: blank.name || '', blank_data: JSON.stringify(blank), created_at: blank.created_at, updated_at: blank.updated_at };
            const { error } = await supabaseClient.from('pkg_blanks').upsert(row, { onConflict: 'id' });
            if (error) console.error('savePkgBlank error:', error);
        } catch(e) { console.error('savePkgBlank exception:', e); }
    }

    const blanks = getLocal(LOCAL_KEYS.pkgBlanks) || [];
    const idx = blanks.findIndex(b => b.id === blank.id);
    if (idx >= 0) blanks[idx] = blank; else blanks.push(blank);
    setLocal(LOCAL_KEYS.pkgBlanks, blanks);
    return blank.id;
}

async function deletePkgBlank(blankId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('pkg_blanks').delete().eq('id', blankId);
            if (error) console.error('deletePkgBlank error:', error);
        } catch(e) { console.error('deletePkgBlank exception:', e); }
    }
    const blanks = (getLocal(LOCAL_KEYS.pkgBlanks) || []).filter(b => b.id !== blankId);
    setLocal(LOCAL_KEYS.pkgBlanks, blanks);
}

function getDefaultPkgBlanks() {
    const now = new Date().toISOString();
    return [
        { id: 1, name: 'Мешочек бархат (S)', price_per_unit: 15, delivery_per_unit: 2, photo_url: '', notes: '7×9 см', created_at: now, updated_at: now },
        { id: 2, name: 'Мешочек бархат (M)', price_per_unit: 20, delivery_per_unit: 3, photo_url: '', notes: '10×12 см', created_at: now, updated_at: now },
        { id: 3, name: 'Мешочек бархат (L)', price_per_unit: 25, delivery_per_unit: 3, photo_url: '', notes: '12×16 см', created_at: now, updated_at: now },
        { id: 4, name: 'Коробочка картонная (S)', price_per_unit: 25, delivery_per_unit: 5, photo_url: '', notes: '5×5×3 см', created_at: now, updated_at: now },
        { id: 5, name: 'Коробочка картонная (M)', price_per_unit: 35, delivery_per_unit: 5, photo_url: '', notes: '8×8×4 см', created_at: now, updated_at: now },
        { id: 6, name: 'Пакет зип-лок', price_per_unit: 5, delivery_per_unit: 1, photo_url: '', notes: '10×15 см', created_at: now, updated_at: now },
        { id: 7, name: 'Транспортная упаковка', price_per_unit: 10, delivery_per_unit: 3, photo_url: '', notes: 'Пупырка + пакет', created_at: now, updated_at: now },
    ];
}

// =============================================
// MARKETPLACE SETS (Наборы для маркетплейсов)
// =============================================

async function loadMarketplaceSets() {
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('marketplace_sets').select('*').order('name');
            if (error) console.error('loadMarketplaceSets error:', error);
            if (data && data.length > 0) {
                const sets = data.map(row => {
                    if (row.set_data) {
                        try {
                            const parsed = typeof row.set_data === 'string' ? JSON.parse(row.set_data) : row.set_data;
                            return { ...parsed, id: row.id };
                        } catch(e) { /* fallthrough */ }
                    }
                    return row;
                });
                setLocal(LOCAL_KEYS.marketplaceSets, sets);
                return sets;
            }
            // Migration from localStorage
            const local = getLocal(LOCAL_KEYS.marketplaceSets) || [];
            if (local.length > 0) {
                console.log('Migrating', local.length, 'marketplace sets to Supabase...');
                for (const s of local) {
                    try {
                        await supabaseClient.from('marketplace_sets').upsert({
                            id: s.id || Date.now(), name: s.name || '',
                            set_data: JSON.stringify(s),
                            created_at: s.created_at || new Date().toISOString(),
                            updated_at: s.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('MarketplaceSet migration error:', e); }
                }
                return local;
            }
            return [];
        } catch(e) {
            console.error('loadMarketplaceSets exception:', e);
            return getLocal(LOCAL_KEYS.marketplaceSets) || [];
        }
    }
    return getLocal(LOCAL_KEYS.marketplaceSets) || [];
}

async function saveMarketplaceSet(mset) {
    if (!mset.id) {
        mset.id = Date.now();
        mset.created_at = new Date().toISOString();
    }
    mset.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: mset.id, name: mset.name || '', set_data: JSON.stringify(mset), created_at: mset.created_at, updated_at: mset.updated_at };
            const { error } = await supabaseClient.from('marketplace_sets').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveMarketplaceSet error:', error);
        } catch(e) { console.error('saveMarketplaceSet exception:', e); }
    }

    const sets = getLocal(LOCAL_KEYS.marketplaceSets) || [];
    const idx = sets.findIndex(s => s.id === mset.id);
    if (idx >= 0) sets[idx] = mset; else sets.push(mset);
    setLocal(LOCAL_KEYS.marketplaceSets, sets);
    return mset.id;
}

async function deleteMarketplaceSet(setId) {
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('marketplace_sets').delete().eq('id', setId);
            if (error) console.error('deleteMarketplaceSet error:', error);
        } catch(e) { console.error('deleteMarketplaceSet exception:', e); }
    }
    const sets = (getLocal(LOCAL_KEYS.marketplaceSets) || []).filter(s => s.id !== setId);
    setLocal(LOCAL_KEYS.marketplaceSets, sets);
}

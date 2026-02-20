// =============================================
// Recycle Object — Supabase Client & Data Layer
// =============================================

// Supabase config — REPLACE with your project values
const SUPABASE_URL = ''; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = ''; // public anon key

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
};

// Data version — increment to force cache reset for molds
const MOLDS_DATA_VERSION = 2; // v2: updated cny_rate=12.5, delivery=8000, amort by 4500
const MOLDS_VERSION_KEY = 'ro_calc_molds_version';

function checkMoldsVersion() {
    const stored = parseInt(localStorage.getItem(MOLDS_VERSION_KEY)) || 0;
    if (stored < MOLDS_DATA_VERSION) {
        localStorage.removeItem(LOCAL_KEYS.molds);
        localStorage.setItem(MOLDS_VERSION_KEY, String(MOLDS_DATA_VERSION));
        console.log('Molds cache reset to version', MOLDS_DATA_VERSION);
    }
}

function getLocal(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || null;
    } catch { return null; }
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
        if (error) { console.error('loadSettings error:', error); return getDefaultSettings(); }
        const obj = {};
        data.forEach(r => { obj[r.key] = r.value; });
        return obj;
    }
    return getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
}

async function saveSetting(key, value) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) console.error('saveSetting error:', error);
    } else {
        const s = getLocal(LOCAL_KEYS.settings) || getDefaultSettings();
        s[key] = value;
        setLocal(LOCAL_KEYS.settings, s);
    }
}

async function saveAllSettings(settingsObj) {
    if (isSupabaseReady()) {
        const rows = Object.entries(settingsObj).map(([key, value]) => ({
            key, value, updated_at: new Date().toISOString()
        }));
        const { error } = await supabaseClient
            .from('settings')
            .upsert(rows, { onConflict: 'key' });
        if (error) console.error('saveAllSettings error:', error);
    } else {
        setLocal(LOCAL_KEYS.settings, settingsObj);
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
        return data;
    }
    return getLocal(LOCAL_KEYS.templates) || getDefaultTemplates();
}

function getDefaultTemplates() {
    return [
        { id: 1, name: 'Прямоугольник-бланк', category: 'blank', pieces_per_hour_display: '60', pieces_per_hour_min: 60, pieces_per_hour_max: 60, weight_grams: 20 },
        { id: 2, name: 'Кружок-бланк', category: 'blank', pieces_per_hour_display: '45-60', pieces_per_hour_min: 45, pieces_per_hour_max: 60, weight_grams: 20 },
        { id: 3, name: 'Сердце-бланк', category: 'blank', pieces_per_hour_display: '45-60', pieces_per_hour_min: 45, pieces_per_hour_max: 60, weight_grams: 20 },
        { id: 4, name: 'Отельный ромбик', category: 'blank', pieces_per_hour_display: '40', pieces_per_hour_min: 40, pieces_per_hour_max: 40, weight_grams: 30 },
        { id: 5, name: 'Карабин', category: 'blank', pieces_per_hour_display: '40-45', pieces_per_hour_min: 40, pieces_per_hour_max: 45, weight_grams: 20 },
        { id: 6, name: 'Гребень', category: 'blank', pieces_per_hour_display: '15-20', pieces_per_hour_min: 15, pieces_per_hour_max: 20, weight_grams: 25 },
        { id: 7, name: 'Картхолдер', category: 'blank', pieces_per_hour_display: '20', pieces_per_hour_min: 20, pieces_per_hour_max: 20, weight_grams: 30 },
        { id: 8, name: 'Зеркало-клякса', category: 'blank', pieces_per_hour_display: '15', pieces_per_hour_min: 15, pieces_per_hour_max: 15, weight_grams: 30 },
        { id: 9, name: 'Смайл', category: 'blank', pieces_per_hour_display: '15', pieces_per_hour_min: 15, pieces_per_hour_max: 15, weight_grams: 30 },
        { id: 10, name: 'Тег с лого', category: 'blank', pieces_per_hour_display: '200', pieces_per_hour_min: 200, pieces_per_hour_max: 200, weight_grams: 5 },
        { id: 11, name: 'Открывашка', category: 'blank', pieces_per_hour_display: '20-25', pieces_per_hour_min: 20, pieces_per_hour_max: 25, weight_grams: 25 },
        { id: 12, name: 'НФС-звезда', category: 'blank', pieces_per_hour_display: '25', pieces_per_hour_min: 25, pieces_per_hour_max: 25, weight_grams: 30 },
        { id: 13, name: 'НФС-сердце', category: 'blank', pieces_per_hour_display: '13', pieces_per_hour_min: 13, pieces_per_hour_max: 13, weight_grams: 30 },
        { id: 14, name: 'Подставка для телефона', category: 'blank', pieces_per_hour_display: '15-20', pieces_per_hour_min: 15, pieces_per_hour_max: 20, weight_grams: 40 },
        { id: 15, name: 'Дракон', category: 'blank', pieces_per_hour_display: '15', pieces_per_hour_min: 15, pieces_per_hour_max: 15, weight_grams: 40 },
        { id: 16, name: 'Бусины большие', category: 'blank', pieces_per_hour_display: '100', pieces_per_hour_min: 100, pieces_per_hour_max: 100, weight_grams: 10 },
        { id: 17, name: 'Бусины маленькие', category: 'blank', pieces_per_hour_display: '80', pieces_per_hour_min: 80, pieces_per_hour_max: 80, weight_grams: 5 },
        { id: 18, name: 'Ракетка теннис/падел', category: 'blank', pieces_per_hour_display: '30', pieces_per_hour_min: 30, pieces_per_hour_max: 30, weight_grams: 25 },
        { id: 19, name: 'Новый кардхолдер', category: 'blank', pieces_per_hour_display: '20', pieces_per_hour_min: 20, pieces_per_hour_max: 20, weight_grams: 30 },
    ];
}

// =============================================
// ORDERS
// =============================================

async function saveOrder(order, items) {
    if (isSupabaseReady()) {
        // Upsert order
        let orderId = order.id;
        if (orderId) {
            const { error } = await supabaseClient
                .from('orders')
                .update({ ...order, updated_at: new Date().toISOString() })
                .eq('id', orderId);
            if (error) { console.error('updateOrder error:', error); return null; }
        } else {
            const { data, error } = await supabaseClient
                .from('orders')
                .insert({ ...order })
                .select('id')
                .single();
            if (error) { console.error('insertOrder error:', error); return null; }
            orderId = data.id;
        }

        // Delete old items and insert new
        await supabaseClient.from('order_items').delete().eq('order_id', orderId);
        if (items.length > 0) {
            const rows = items.map(item => ({ ...item, order_id: orderId }));
            const { error } = await supabaseClient.from('order_items').insert(rows);
            if (error) console.error('insertOrderItems error:', error);
        }
        return orderId;
    } else {
        // Local storage
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        let orderId = order.id;
        if (orderId) {
            const idx = orders.findIndex(o => o.id === orderId);
            if (idx >= 0) orders[idx] = { ...order, updated_at: new Date().toISOString() };
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

async function loadOrders(filters = {}) {
    if (isSupabaseReady()) {
        let query = supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.limit) query = query.limit(filters.limit);
        const { data, error } = await query;
        if (error) { console.error('loadOrders error:', error); return []; }
        return data;
    }
    let orders = getLocal(LOCAL_KEYS.orders) || [];
    if (filters.status) orders = orders.filter(o => o.status === filters.status);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.limit) orders = orders.slice(0, filters.limit);
    return orders;
}

async function loadOrder(orderId) {
    if (isSupabaseReady()) {
        const { data: order, error: e1 } = await supabaseClient
            .from('orders').select('*').eq('id', orderId).single();
        if (e1) { console.error('loadOrder error:', e1); return null; }
        const { data: items, error: e2 } = await supabaseClient
            .from('order_items').select('*').eq('order_id', orderId).order('item_number');
        if (e2) { console.error('loadOrderItems error:', e2); return null; }
        return { order, items };
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

async function deleteOrder(orderId) {
    if (isSupabaseReady()) {
        const { error } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (error) console.error('deleteOrder error:', error);
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

    return [
        { id: 1, name: 'Прямоугольник-бланк', category: 'blank', status: 'active', pph_min: 60, pph_max: 60, pph_actual: null, weight_grams: 20, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 12, total_units_produced: 5400 },
        { id: 2, name: 'Кружок-бланк', category: 'blank', status: 'active', pph_min: 45, pph_max: 60, pph_actual: null, weight_grams: 20, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 8, total_units_produced: 3200 },
        { id: 3, name: 'Сердце-бланк', category: 'blank', status: 'active', pph_min: 45, pph_max: 60, pph_actual: null, weight_grams: 20, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 6, total_units_produced: 2100 },
        { id: 4, name: 'Отельный ромбик', category: 'blank', status: 'active', pph_min: 40, pph_max: 40, pph_actual: null, weight_grams: 30, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 3, total_units_produced: 900 },
        { id: 5, name: 'Карабин', category: 'blank', status: 'active', pph_min: 40, pph_max: 45, pph_actual: null, weight_grams: 20, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: 120, client: '', notes: 'Быстрая сборка', total_orders: 10, total_units_produced: 4500 },
        { id: 6, name: 'Гребень', category: 'blank', status: 'active', pph_min: 15, pph_max: 20, pph_actual: null, weight_grams: 25, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: 'Сложная форма, тонкие зубья', total_orders: 4, total_units_produced: 1200 },
        { id: 7, name: 'Картхолдер', category: 'blank', status: 'active', pph_min: 20, pph_max: 20, pph_actual: null, weight_grams: 30, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 5, total_units_produced: 1500 },
        { id: 8, name: 'Зеркало-клякса', category: 'blank', status: 'active', pph_min: 15, pph_max: 15, pph_actual: null, weight_grams: 30, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: 60, client: '', notes: 'Нужно зеркало приклеить', total_orders: 3, total_units_produced: 600 },
        { id: 9, name: 'Смайл', category: 'blank', status: 'active', pph_min: 15, pph_max: 15, pph_actual: null, weight_grams: 30, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 2, total_units_produced: 500 },
        { id: 10, name: 'Тег с лого', category: 'blank', status: 'active', pph_min: 200, pph_max: 200, pph_actual: null, weight_grams: 5, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: 'Самый быстрый, маленький тег', total_orders: 15, total_units_produced: 12000 },
        { id: 11, name: 'Открывашка', category: 'blank', status: 'active', pph_min: 20, pph_max: 25, pph_actual: null, weight_grams: 25, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 4, total_units_produced: 1000 },
        { id: 12, name: 'НФС-звезда', category: 'nfc', status: 'active', pph_min: 25, pph_max: 25, pph_actual: null, weight_grams: 30, complexity: 'nfc_triple', cost_cny: nfcCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: nfcCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '3-частный молд, вставка NFC чипа', total_orders: 3, total_units_produced: 800 },
        { id: 13, name: 'НФС-сердце', category: 'nfc', status: 'active', pph_min: 13, pph_max: 13, pph_actual: null, weight_grams: 30, complexity: 'nfc_triple', cost_cny: nfcCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: nfcCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '3-частный молд, медленный', total_orders: 2, total_units_produced: 400 },
        { id: 14, name: 'Подставка для телефона', category: 'blank', status: 'active', pph_min: 15, pph_max: 20, pph_actual: null, weight_grams: 40, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: 'Тяжёлый, долго остывает', total_orders: 3, total_units_produced: 600 },
        { id: 15, name: 'Дракон', category: 'custom', status: 'active', pph_min: 15, pph_max: 15, pph_actual: null, weight_grams: 40, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: 'Детализированная форма', total_orders: 2, total_units_produced: 300 },
        { id: 16, name: 'Бусины большие', category: 'blank', status: 'active', pph_min: 100, pph_max: 100, pph_actual: null, weight_grams: 10, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 7, total_units_produced: 8000 },
        { id: 17, name: 'Бусины маленькие', category: 'blank', status: 'active', pph_min: 80, pph_max: 80, pph_actual: null, weight_grams: 5, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 7, total_units_produced: 6000 },
        { id: 18, name: 'Ракетка теннис/падел', category: 'blank', status: 'active', pph_min: 30, pph_max: 30, pph_actual: null, weight_grams: 25, complexity: 'simple', cost_cny: simpleCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: simpleCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: '', total_orders: 3, total_units_produced: 900 },
        { id: 19, name: 'Новый кардхолдер', category: 'blank', status: 'active', pph_min: 20, pph_max: 20, pph_actual: null, weight_grams: 30, complexity: 'complex', cost_cny: complexCostCNY, cny_rate: CNY_RATE, delivery_cost: deliveryCost, cost_rub: complexCostCNY * CNY_RATE + deliveryCost, hw_speed: null, client: '', notes: 'Новая версия', total_orders: 1, total_units_produced: 200 },
    ];
}

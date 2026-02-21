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
    tasks: 'ro_calc_tasks',
    chinaOrders: 'ro_calc_china_orders',
    chinaDeliveries: 'ro_calc_china_deliveries',
    vacations: 'ro_calc_vacations',
    employees: 'ro_calc_employees',
    orderFactuals: 'ro_calc_order_factuals',
};

// Data version — increment to force cache reset for molds
const MOLDS_DATA_VERSION = 4; // v4: collections + new tiers (3000 instead of 5000)
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
    // Auto-generate from default molds (blanks catalog is the source of truth)
    const molds = getDefaultMolds();
    return molds.map(m => {
        const pMin = m.pph_min || 0;
        const pMax = m.pph_max || 0;
        const display = pMin === 0 ? '—' : (pMin === pMax ? String(pMin) : `${pMin}-${pMax}`);
        return {
            id: m.id,
            name: m.name,
            category: 'blank',
            pieces_per_hour_display: display,
            pieces_per_hour_min: pMin,
            pieces_per_hour_max: pMax,
            weight_grams: m.weight_grams,
        };
    });
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
// ORDER FACTUALS (Plan vs Fact data)
// =============================================

async function loadFactual(orderId) {
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
    });

    return [
        // === Бланки простые ===
        m(1,  'Бланк прямоугольник',       'blank', 60,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 12, produced: 5400 }),
        m(2,  'Бланк круг',                'blank', 45,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 8, produced: 3200 }),
        m(3,  'Бланк сердце',              'blank', 45,  60,  null, 20, 'simple', simpleCostCNY, { collection: 'Бланки', orders: 6, produced: 2100 }),
        m(4,  'Бланк цветок',              'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(5,  'Бланк треугольник',          'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(6,  'Бланк квадрат',             'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),
        m(7,  'Бланк тэг',                 'blank', 200, 200, null, 5,  'simple', simpleCostCNY, { collection: 'Бланки', orders: 15, produced: 12000, notes: 'Самый быстрый, маленький тег' }),
        m(8,  'Бланк конверт',             'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Бланки' }),

        // === Формы с фурнитурой ===
        m(9,  'Карабин',                    'blank', 40,  45,  null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары', hw_speed: 120, orders: 10, produced: 4500, notes: 'Быстрая сборка' }),
        m(10, 'Отельный',                   'blank', 40,  40,  null, 30, 'simple', simpleCostCNY, { collection: 'Аксессуары', orders: 3, produced: 900 }),
        m(11, 'Зеркало-клякса',             'blank', 15,  15,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', hw_name: 'Зеркало', hw_price: 0, hw_speed: 60, orders: 3, produced: 600, notes: 'Нужно зеркало приклеить' }),
        m(12, 'Подставка под телефон',       'blank', 15,  20,  null, 40, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 3, produced: 600, notes: 'Тяжёлый, долго остывает' }),

        // === Аксессуары / формы ===
        m(13, 'Гребень',                    'blank', 15,  20,  null, 25, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 4, produced: 1200, notes: 'Сложная форма, тонкие зубья' }),
        m(14, 'Картхолдер',                 'blank', 20,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 5, produced: 1500 }),
        m(15, 'Новый кардхолдер',           'blank', 20,  20,  null, 30, 'complex', complexCostCNY, { collection: 'Аксессуары', orders: 1, produced: 200, notes: 'Новая версия' }),
        m(16, 'Открывашка',                 'blank', 20,  25,  null, 25, 'simple', simpleCostCNY, { collection: 'Аксессуары', orders: 4, produced: 1000 }),
        m(17, 'Смайл',                      'blank', 15,  15,  null, 30, 'simple', simpleCostCNY, { collection: 'Фигурки', orders: 2, produced: 500 }),
        m(18, 'Бейдж',                      'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары' }),
        m(19, 'Смотка',                     'blank', 0,   0,   null, 20, 'simple', simpleCostCNY, { collection: 'Аксессуары' }),
        m(20, 'Чехол для зажигалки',        'blank', 0,   0,   null, 20, 'complex', complexCostCNY, { collection: 'Аксессуары' }),
        m(21, 'Мыльница',                   'blank', 0,   0,   null, 30, 'complex', complexCostCNY, { collection: 'Для дома' }),
        m(22, 'Медаль',                     'blank', 0,   0,   null, 30, 'simple', simpleCostCNY, { collection: 'Фигурки' }),

        // === Спорт ===
        m(23, 'Ласты для плавания',          'blank', 0,   0,   null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),
        m(24, 'Беговые кроссовки',           'blank', 0,   0,   null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),
        m(25, 'Ракетка для тенниса',         'blank', 30,  30,  null, 25, 'simple', simpleCostCNY, { collection: 'Спорт', orders: 3, produced: 900 }),
        m(26, 'Падл ракетка',               'blank', 0,   0,   null, 25, 'simple', simpleCostCNY, { collection: 'Спорт' }),
        m(27, 'Велосипед',                  'blank', 0,   0,   null, 30, 'complex', complexCostCNY, { collection: 'Спорт' }),

        // === Бусины ===
        m(28, 'Бусины большие',             'blank', 100, 100, null, 10, 'simple', simpleCostCNY, { collection: 'Бусины', orders: 7, produced: 8000 }),
        m(29, 'Бусины маленькие',           'blank', 80,  80,  null, 5,  'simple', simpleCostCNY, { collection: 'Бусины', orders: 7, produced: 6000 }),

        // === Буквы ===
        m(30, 'Буква из алфавита (лат.)',    'blank', 0,   0,   null, 10, 'simple', simpleCostCNY, { collection: 'Буквы' }),
        m(31, 'Буква из алфавита (кир.)',    'blank', 0,   0,   null, 10, 'simple', simpleCostCNY, { collection: 'Буквы' }),

        // === Фигурки / сувениры ===
        m(32, 'Шар',                        'blank', 0,   0,   null, 30, 'complex', complexCostCNY, { collection: 'Фигурки' }),
        m(33, 'Маленькая елочка',            'blank', 0,   0,   null, 15, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(34, 'Большой конь',               'blank', 0,   0,   null, 40, 'complex', complexCostCNY, { collection: 'Фигурки' }),
        m(35, 'Маленькая снежинка',          'blank', 0,   0,   null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(36, 'Большой дракон',             'blank', 15,  15,  null, 40, 'complex', complexCostCNY, { collection: 'Фигурки', orders: 2, produced: 300, notes: 'Детализированная форма' }),
        m(37, 'Маленький цветочек',          'blank', 0,   0,   null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(38, 'Маленький конь',             'blank', 0,   0,   null, 15, 'simple', simpleCostCNY, { collection: 'Фигурки' }),
        m(39, 'Маленькое сердечко',          'blank', 0,   0,   null, 10, 'simple', simpleCostCNY, { collection: 'Фигурки' }),

        // === NFC ===
        m(40, 'NFC Звезда',                 'nfc', 25,  25,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', orders: 3, produced: 800, notes: '3-частный молд, вставка NFC чипа' }),
        m(41, 'NFC Квадрат',                'nfc', 0,   0,   null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', notes: '3-частный молд' }),
        m(42, 'NFC Сердце',                 'nfc', 13,  13,  null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', orders: 2, produced: 400, notes: '3-частный молд, медленный' }),
        m(43, 'NFC Камушек',                'nfc', 0,   0,   null, 30, 'nfc_triple', nfcCostCNY, { collection: 'NFC', notes: '3-частный молд' }),
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

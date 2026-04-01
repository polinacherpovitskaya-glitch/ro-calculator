// =============================================
// Recycle Object — Supabase Client & Data Layer
// =============================================

// Supabase config
const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';

let supabaseClient = null;
let supabaseAccessWarningShown = false;

function _isSupabaseAccessError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();
    return message.includes('invalid api key')
        || message.includes('jwt')
        || message.includes('unauthorized')
        || code === '401';
}

function _hasSupabaseAccessProblem() {
    if (supabaseAccessWarningShown) return true;
    if (typeof window !== 'undefined') return !!window.__roSupabaseAccessProblem;
    return false;
}

function _markSupabaseAccessProblem(error) {
    if (supabaseAccessWarningShown) return;
    supabaseAccessWarningShown = true;
    if (typeof window !== 'undefined') {
        window.__roSupabaseAccessProblem = String(error?.message || error || 'shared database unavailable');
    }
    console.error('[Supabase] Shared database unavailable, falling back to local browser data:', error);
}

function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('Supabase not configured. Running in local/demo mode.');
        return null;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // In shared-db mode localStorage is only a cache, so compact it aggressively on boot.
    _cleanupLocalStorage({ aggressive: true });
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
    chinaOrders: 'ro_calc_china_orders',
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
    readyGoods: 'ro_calc_ready_goods_stock',
    readyGoodsHistory: 'ro_calc_ready_goods_history',
    salesRecords: 'ro_calc_sales_records',
    wikiState: 'ro_calc_wiki_state',
    indirectCosts: 'ro_calc_indirect_costs',
    workAreas: 'ro_calc_work_areas',
    workProjects: 'ro_calc_work_projects',
    workTasks: 'ro_calc_work_tasks_v2',
    bugReports: 'ro_calc_bug_reports',
    taskComments: 'ro_calc_task_comments',
    workAssets: 'ro_calc_work_assets',
    taskChecklistItems: 'ro_calc_task_checklist_items',
    taskWatchers: 'ro_calc_task_watchers',
    workActivity: 'ro_calc_work_activity',
    workTemplatesV2: 'ro_calc_work_templates_v2',
    taskNotificationEvents: 'ro_calc_task_notification_events',
    deletedMoldIds: 'ro_calc_deleted_mold_ids',
};

const NON_CRITICAL_LOCAL_CACHE_KEYS = new Set([
    LOCAL_KEYS.chinaPurchases,
    LOCAL_KEYS.authActivity,
    LOCAL_KEYS.authSessions,
    LOCAL_KEYS.productionPlan,
    LOCAL_KEYS.projectHardwareState,
    LOCAL_KEYS.warehouseHistory,
    LOCAL_KEYS.shipments,
    LOCAL_KEYS.readyGoods,
    LOCAL_KEYS.readyGoodsHistory,
    LOCAL_KEYS.salesRecords,
    LOCAL_KEYS.workProjects,
    LOCAL_KEYS.workTasks,
    LOCAL_KEYS.bugReports,
    LOCAL_KEYS.taskComments,
    LOCAL_KEYS.workAssets,
    LOCAL_KEYS.taskChecklistItems,
    LOCAL_KEYS.taskWatchers,
    LOCAL_KEYS.workActivity,
    LOCAL_KEYS.workTemplatesV2,
    LOCAL_KEYS.taskNotificationEvents,
]);

const WORK_SETTINGS_KEYS = {
    areas: 'work_areas_json',
    projects: 'work_projects_json',
    tasks: 'work_tasks_json',
    bug_reports: 'bug_reports_json',
    task_comments: 'work_task_comments_json',
    work_assets: 'work_assets_json',
    task_checklist_items: 'work_task_checklist_items_json',
    task_watchers: 'work_task_watchers_json',
    work_activity: 'work_activity_json',
    work_templates: 'work_templates_json',
    task_notification_events: 'work_task_notification_events_json',
};

const WORK_TABLE_ON_CONFLICT = {
    task_watchers: 'task_id,user_id',
};

const OPTIONAL_WORK_MODULE_TABLES = new Set([
    'bug_reports',
]);

const _missingOptionalWorkTables = new Set();

const _volatileLocalCache = new Map();

// Data version — increment to trigger NON-DESTRUCTIVE migration
// NEVER delete user data! Only add missing fields to existing molds
const MOLDS_DATA_VERSION = 12; // v12: уважать ручное удаление custom_prices у бланков и не восстанавливать их обратно автоматически
const MOLDS_VERSION_KEY = 'ro_calc_molds_version';

// Latest known manual sell prices from the exported blanks catalog.
// Source: /Users/krollipolli/Downloads/molds_2026-03-26.csv
const HISTORICAL_BLANK_PRICE_BASELINE = Object.freeze({
    'NFC Звезда': Object.freeze({ 50: 1250, 100: 890, 300: 880, 500: 645, 1000: 570, 3000: 510 }),
    'NFC Камушек': Object.freeze({ 50: 1250, 100: 890, 300: 880, 500: 645, 1000: 570, 3000: 510 }),
    'NFC Квадрат': Object.freeze({ 50: 1250, 100: 890, 300: 880, 500: 645, 1000: 570, 3000: 510 }),
    'NFC Сердце': Object.freeze({ 50: 1250, 100: 890, 300: 880, 500: 645, 1000: 570, 3000: 510 }),
    'Беговые кроссовки': Object.freeze({ 50: 890, 100: 630, 300: 550, 500: 515, 1000: 455, 3000: 410 }),
    'Бирка': Object.freeze({ 50: 770, 100: 640, 300: 550, 500: 500, 1000: 450, 3000: 380 }),
    'Бланк квадрат': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Бланк конверт': Object.freeze({ 50: 890, 100: 630, 300: 630, 500: 515, 1000: 455, 3000: 410 }),
    'Бланк круг': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Бланк прямоугольник': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Бланк сердце': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Бланк треугольник': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Бланк тэг': Object.freeze({ 50: 150, 100: 150, 300: 60, 500: 60, 1000: 60, 3000: 60 }),
    'Бланк тэг Recycle object': Object.freeze({ 50: 60, 100: 60, 300: 60, 500: 60, 1000: 60, 3000: 60 }),
    'Бланк цветок': Object.freeze({ 50: 550, 100: 550, 300: 390, 500: 320, 1000: 290, 3000: 245 }),
    'Большой дракон': Object.freeze({ 50: 1350, 100: 1120, 300: 970, 500: 880, 1000: 800, 3000: 780 }),
    'Большой конь': Object.freeze({ 50: 1350, 100: 1120, 300: 970, 500: 880, 1000: 800, 3000: 780 }),
    'Буква из алфавита / смайлы': Object.freeze({ 50: 250, 100: 250, 300: 250, 500: 180, 1000: 180, 3000: 160 }),
    'Бусины большие': Object.freeze({ 50: 295, 100: 245, 300: 185, 500: 150, 1000: 135, 3000: 125 }),
    'Бусины маленькие': Object.freeze({ 50: 340, 100: 285, 300: 215, 500: 170, 1000: 155, 3000: 145 }),
    'Велосипед': Object.freeze({ 50: 890, 100: 630, 300: 630, 500: 525, 1000: 465, 3000: 415 }),
    'Волчок': Object.freeze({ 50: 1705, 100: 1220, 300: 775, 500: 570, 1000: 505, 3000: 450 }),
    'Гребень': Object.freeze({ 50: 1160, 100: 960, 300: 860, 500: 860, 1000: 860, 3000: 770 }),
    'Зеркало-клякса': Object.freeze({ 50: 3625, 100: 2590, 300: 1650, 500: 1210, 1000: 1070, 3000: 955 }),
    'Змея': Object.freeze({ 50: 2130, 100: 1525, 300: 970, 500: 710, 1000: 630, 3000: 565 }),
    'Карабин': Object.freeze({ 50: 690, 100: 570, 300: 470, 500: 390, 1000: 350, 3000: 290 }),
    'Картхолдер': Object.freeze({ 50: 1060, 100: 880, 300: 760, 500: 690, 1000: 620, 3000: 585 }),
    'Ключ': Object.freeze({ 50: 470, 100: 390, 300: 325, 500: 290, 1000: 240, 3000: 200 }),
    'Ласты для плавания': Object.freeze({ 50: 890, 100: 630, 300: 630, 500: 630, 1000: 545, 3000: 485 }),
    'Лошадь большая': Object.freeze({ 50: 2130, 100: 1520, 300: 970, 500: 710, 1000: 630, 3000: 560 }),
    'Маленькая елочка': Object.freeze({ 50: 555, 100: 460, 300: 345, 500: 280, 1000: 255, 3000: 230 }),
    'Маленькая снежинка': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
    'Маленький конь': Object.freeze({ 50: 610, 100: 510, 300: 385, 500: 305, 1000: 280, 3000: 255 }),
    'Маленький цветочек': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
    'Маленькое сердечко': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
    'Медаль': Object.freeze({ 50: 1040, 100: 860, 300: 710, 500: 590, 1000: 530, 3000: 325 }),
    'Мыльница': Object.freeze({ 50: 1490, 100: 1240, 300: 930, 500: 745, 1000: 680, 3000: 620 }),
    'Новый кардхолдер': Object.freeze({ 50: 1060, 100: 880, 300: 760, 500: 690, 1000: 620, 3000: 585 }),
    'Отельный': Object.freeze({ 50: 960, 100: 680, 300: 520, 500: 430, 1000: 390, 3000: 325 }),
    'Открывашка': Object.freeze({ 50: 1070, 100: 890, 300: 770, 500: 700, 1000: 630, 3000: 520 }),
    'Падл ракетка': Object.freeze({ 50: 1030, 100: 730, 300: 560, 500: 555, 1000: 460, 3000: 410 }),
    'Подставка под телефон': Object.freeze({ 50: 1120, 100: 1120, 300: 970, 500: 880, 1000: 800, 3000: 660 }),
    'Ракетка для тенниса': Object.freeze({ 50: 1030, 100: 730, 300: 560, 500: 520, 1000: 460, 3000: 410 }),
    'Смайл': Object.freeze({ 50: 2975, 100: 2125, 300: 1355, 500: 995, 1000: 875, 3000: 785 }),
    'Смотка': Object.freeze({ 50: 750, 100: 750, 300: 750, 500: 550, 1000: 485, 3000: 435 }),
    'Тюльпан': Object.freeze({ 50: 1715, 100: 1225, 300: 780, 500: 575, 1000: 505, 3000: 455 }),
    'Чехол для зажигалки': Object.freeze({ 50: 890, 100: 890, 300: 890, 500: 820, 1000: 725, 3000: 645 }),
    'Шар': Object.freeze({ 50: 2365, 100: 2030, 300: 1760, 500: 1600, 1000: 1450, 3000: 1075 }),
});

// Legacy prices from the earlier export that should be upgraded in-place.
const LEGACY_HISTORICAL_BLANK_PRICE_BASELINES = Object.freeze([
    Object.freeze({
        'NFC Звезда': Object.freeze({ 50: 990, 100: 825, 300: 620, 500: 495, 1000: 450, 3000: 415 }),
        'NFC Камушек': Object.freeze({ 50: 990, 100: 825, 300: 620, 500: 495, 1000: 450, 3000: 415 }),
        'NFC Квадрат': Object.freeze({ 50: 990, 100: 825, 300: 620, 500: 495, 1000: 450, 3000: 415 }),
        'NFC Сердце': Object.freeze({ 50: 990, 100: 825, 300: 620, 500: 495, 1000: 450, 3000: 415 }),
        'Беговые кроссовки': Object.freeze({ 50: 790, 100: 660, 300: 495, 500: 395, 1000: 360, 3000: 330 }),
        'Бланк квадрат': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Бланк конверт': Object.freeze({ 50: 790, 100: 660, 300: 495, 500: 395, 1000: 360, 3000: 330 }),
        'Бланк круг': Object.freeze({ 50: 475, 100: 400, 300: 300, 500: 240, 1000: 220, 3000: 200 }),
        'Бланк прямоугольник': Object.freeze({ 50: 475, 100: 400, 300: 300, 500: 240, 1000: 220, 3000: 200 }),
        'Бланк сердце': Object.freeze({ 50: 475, 100: 400, 300: 300, 500: 240, 1000: 220, 3000: 200 }),
        'Бланк треугольник': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Бланк тэг Recycle object': Object.freeze({ 50: 60, 100: 60, 300: 60, 500: 60, 1000: 60, 3000: 60 }),
        'Бланк тэг без надписи': Object.freeze({ 50: 185, 100: 155, 300: 120, 500: 95, 1000: 85, 3000: 80 }),
        'Бланк цветок': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Большой дракон': Object.freeze({ 50: 1500, 100: 1250, 300: 940, 500: 750, 1000: 685, 3000: 625 }),
        'Большой конь': Object.freeze({ 50: 1500, 100: 1250, 300: 940, 500: 750, 1000: 685, 3000: 625 }),
        'Буква из алфавита (кир.)': Object.freeze({ 50: 340, 100: 285, 300: 215, 500: 170, 1000: 155, 3000: 145 }),
        'Буква из алфавита (лат.)': Object.freeze({ 50: 340, 100: 285, 300: 215, 500: 170, 1000: 155, 3000: 145 }),
        'Бусины большие': Object.freeze({ 50: 295, 100: 245, 300: 185, 500: 150, 1000: 135, 3000: 125 }),
        'Бусины маленькие': Object.freeze({ 50: 340, 100: 285, 300: 215, 500: 170, 1000: 155, 3000: 145 }),
        'Велосипед': Object.freeze({ 50: 805, 100: 670, 300: 505, 500: 405, 1000: 365, 3000: 335 }),
        'Гребень': Object.freeze({ 50: 1485, 100: 1235, 300: 930, 500: 745, 1000: 675, 3000: 620 }),
        'Карабин': Object.freeze({ 50: 560, 100: 465, 300: 350, 500: 280, 1000: 255, 3000: 235 }),
        'Картхолдер нью': Object.freeze({ 50: 1130, 100: 945, 300: 710, 500: 565, 1000: 515, 3000: 475 }),
        'Ласты для плавания': Object.freeze({ 50: 940, 100: 785, 300: 590, 500: 470, 1000: 430, 3000: 395 }),
        'Маленькая елочка': Object.freeze({ 50: 555, 100: 460, 300: 345, 500: 280, 1000: 255, 3000: 230 }),
        'Маленькая снежинка': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Маленький конь': Object.freeze({ 50: 610, 100: 510, 300: 385, 500: 305, 1000: 280, 3000: 255 }),
        'Маленький цветочек': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Маленькое сердечко': Object.freeze({ 50: 465, 100: 385, 300: 290, 500: 235, 1000: 210, 3000: 195 }),
        'Медаль': Object.freeze({ 50: 630, 100: 525, 300: 395, 500: 315, 1000: 290, 3000: 265 }),
        'Мыльница': Object.freeze({ 50: 1490, 100: 1240, 300: 930, 500: 745, 1000: 680, 3000: 620 }),
        'Отельный': Object.freeze({ 50: 630, 100: 525, 300: 395, 500: 315, 1000: 290, 3000: 265 }),
        'Открывашка': Object.freeze({ 50: 1005, 100: 835, 300: 630, 500: 505, 1000: 460, 3000: 420 }),
        'Падл ракетка': Object.freeze({ 50: 845, 100: 705, 300: 530, 500: 425, 1000: 385, 3000: 355 }),
        'Подставка под телефон': Object.freeze({ 50: 1275, 100: 1060, 300: 795, 500: 640, 1000: 580, 3000: 530 }),
        'Ракетка для тенниса': Object.freeze({ 50: 795, 100: 665, 300: 500, 500: 400, 1000: 365, 3000: 335 }),
        'Смотка': Object.freeze({ 50: 840, 100: 700, 300: 525, 500: 420, 1000: 380, 3000: 350 }),
        'Чехол для зажигалки': Object.freeze({ 50: 1250, 100: 1040, 300: 780, 500: 625, 1000: 570, 3000: 520 }),
    }),
]);

const HISTORICAL_BLANK_PRICE_ALIASES = Object.freeze({
    'Бланк тэг без надписи': 'Бланк тэг',
    'Картхолдер нью': 'Новый кардхолдер',
    'Буква из алфавита (кир.)': 'Буква из алфавита / смайлы',
    'Буква из алфавита (лат.)': 'Буква из алфавита / смайлы',
});

const LEGACY_HISTORICAL_BLANK_PRICE_ALIASES = Object.freeze({
    'Бланк тэг': 'Бланк тэг без надписи',
    'Новый кардхолдер': 'Картхолдер нью',
});

function _cloneHistoricalBlankPrices(prices) {
    const out = {};
    Object.entries(prices || {}).forEach(([qty, value]) => {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) out[String(qty)] = num;
    });
    return out;
}

function _getHistoricalBlankCustomPrices(name) {
    const key = HISTORICAL_BLANK_PRICE_ALIASES[name] || name;
    return _cloneHistoricalBlankPrices(HISTORICAL_BLANK_PRICE_BASELINE[key]);
}

function _getLegacyHistoricalBlankCustomPrices(name) {
    const key = LEGACY_HISTORICAL_BLANK_PRICE_ALIASES[name] || name;
    return LEGACY_HISTORICAL_BLANK_PRICE_BASELINES.map((baseline) => _cloneHistoricalBlankPrices(baseline[key]));
}

function _isExactHistoricalPriceMatch(left, right) {
    const leftMap = _cloneHistoricalBlankPrices(left);
    const rightMap = _cloneHistoricalBlankPrices(right);
    const keys = ['50', '100', '300', '500', '1000', '3000'];
    return keys.every((qty) => (Number(leftMap[qty]) || 0) === (Number(rightMap[qty]) || 0));
}

function _isSubsetHistoricalPriceMatch(currentPrices, baselinePrices) {
    const current = _cloneHistoricalBlankPrices(currentPrices);
    const baseline = _cloneHistoricalBlankPrices(baselinePrices);
    const entries = Object.entries(current);
    if (entries.length === 0) return false;
    return entries.every(([qty, value]) => (Number(baseline[qty]) || 0) === (Number(value) || 0));
}

function _mergeHistoricalBlankCustomPrices(currentPrices, name) {
    const historical = _getHistoricalBlankCustomPrices(name);
    const current = _cloneHistoricalBlankPrices(currentPrices);
    if (!Object.keys(historical).length) return current;
    if (!Object.keys(current).length) return historical;

    const legacyMatches = _getLegacyHistoricalBlankCustomPrices(name).some((legacy) => (
        Object.keys(legacy).length > 0
        && (_isExactHistoricalPriceMatch(current, legacy) || _isSubsetHistoricalPriceMatch(current, legacy))
    ));
    if (legacyMatches) return historical;

    const merged = { ...current };
    Object.entries(historical).forEach(([qty, value]) => {
        const existing = Number(merged[qty]);
        if (!(Number.isFinite(existing) && existing > 0)) merged[qty] = value;
    });
    return merged;
}

function _isHistoricalBlankPriceRecoveryDisabled(mold) {
    return !!(mold && mold.disable_historical_blank_price_recovery);
}

function _withHistoricalBlankPriceRecovery(mold) {
    if (!mold || typeof mold !== 'object') {
        return { mold, changed: false };
    }
    if (_isHistoricalBlankPriceRecoveryDisabled(mold)) {
        return { mold, changed: false };
    }
    const before = _cloneHistoricalBlankPrices(mold.custom_prices);
    const after = _mergeHistoricalBlankCustomPrices(before, mold.name);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (!changed) return { mold, changed: false };
    return {
        mold: { ...mold, custom_prices: after },
        changed: true,
    };
}

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
                if (m.disable_historical_blank_price_recovery === undefined) {
                    m.disable_historical_blank_price_recovery = false;
                }
                m.custom_prices = _mergeHistoricalBlankCustomPrices(m.custom_prices, m.name);
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
        const raw = localStorage.getItem(key);
        if (raw != null) return JSON.parse(raw) || null;
    } catch (e) { /* ignore */ }
    return _volatileLocalCache.has(key) ? _volatileLocalCache.get(key) : null;
}

function _moveLocalStorageKeyToVolatileCache(key) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return 0;
        let parsed = raw;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            // Keep raw payload if it is not valid JSON.
        }
        _volatileLocalCache.set(key, parsed);
        localStorage.removeItem(key);
        return raw.length * 2;
    } catch (e) {
        return 0;
    }
}

function setLocal(key, data) {
    let payload = '';
    try {
        payload = JSON.stringify(data);
    } catch (e) {
        console.error('[setLocal] JSON stringify error for key:', key, e);
        return;
    }
    try {
        localStorage.setItem(key, payload);
        _volatileLocalCache.delete(key);
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.error('[setLocal] QuotaExceeded for key:', key, 'Attempting cleanup...');
            _cleanupLocalStorage({ aggressive: isSupabaseReady(), preserveKeys: [key] });
            try {
                localStorage.setItem(key, payload);
                _volatileLocalCache.delete(key);
            } catch (e2) {
                console.error('[setLocal] Still no space after cleanup for key:', key);
                _volatileLocalCache.set(key, data);
                if (isSupabaseReady() && !_hasSupabaseAccessProblem() && NON_CRITICAL_LOCAL_CACHE_KEYS.has(key)) {
                    console.warn('[setLocal] Skipping non-critical local cache because Supabase is available:', key);
                    return;
                }
                App.toast('Хранилище заполнено. Перейдите в Настройки для очистки.');
            }
        } else {
            console.error('[setLocal] Error:', e);
        }
    }
}

function _estimateLocalStorageBytes() {
    try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i) || '';
            const value = localStorage.getItem(key) || '';
            total += (key.length + value.length) * 2;
        }
        return total;
    } catch (e) {
        return 0;
    }
}

function _cleanupLocalStorage(options = {}) {
    const aggressive = !!options.aggressive;
    const preserveKeys = new Set(options.preserveKeys || []);
    // 1. Trim auth activity & sessions (keep last 50 entries each)
    ['ro_calc_auth_activity', 'ro_calc_auth_sessions'].forEach(key => {
        try {
            const arr = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(arr) && arr.length > 50) {
                localStorage.setItem(key, JSON.stringify(arr.slice(-50)));
                console.log('[cleanup] Trimmed', key, 'from', arr.length, 'to 50');
            }
        } catch (e) { /* ignore */ }
    });

    // 2. Trim order_items if they take too much space (> 1MB)
    try {
        const raw = localStorage.getItem('ro_calc_order_items');
        if (raw && raw.length > 500000) { // > ~1MB in UTF-16
            const items = JSON.parse(raw);
            if (Array.isArray(items)) {
                // Strip bulky item_data JSON blobs, keep only essential fields
                const slim = items.map(i => {
                    const copy = { ...i };
                    delete copy.item_data; // stored as JSON blob, very large
                    return copy;
                });
                const slimStr = JSON.stringify(slim);
                if (slimStr.length < raw.length * 0.7) {
                    localStorage.setItem('ro_calc_order_items', slimStr);
                    console.log('[cleanup] Stripped item_data from order_items, saved',
                        Math.round((raw.length - slimStr.length) * 2 / 1024), 'KB');
                }
            }
        }
    } catch (e) { /* ignore */ }

    // 4. Trim auto-backups aggressively if they became too large.
    try {
        const raw = localStorage.getItem('ro_calc_auto_backups');
        if (raw && raw.length > 150000) {
            const backups = JSON.parse(raw);
            if (Array.isArray(backups) && backups.length > 1) {
                localStorage.setItem('ro_calc_auto_backups', JSON.stringify(backups.slice(0, 1)));
                console.log('[cleanup] Trimmed auto backups from', backups.length, 'to 1');
            }
        }
    } catch (e) { /* ignore */ }

    // 5. If Supabase is available and storage is still near browser limits,
    // drop non-critical mirrors that can be reloaded from the backend.
    try {
        if (isSupabaseReady() && _estimateLocalStorageBytes() > 4.5 * 1024 * 1024) {
            const purgeKeys = [
                'ro_calc_auto_backups',
                LOCAL_KEYS.workActivity,
                LOCAL_KEYS.taskNotificationEvents,
                LOCAL_KEYS.workAssets,
                LOCAL_KEYS.taskComments,
                LOCAL_KEYS.taskChecklistItems,
                LOCAL_KEYS.taskWatchers,
                LOCAL_KEYS.workTasks,
                LOCAL_KEYS.workProjects,
                LOCAL_KEYS.chinaPurchases,
                LOCAL_KEYS.warehouseHistory,
                LOCAL_KEYS.shipments,
                LOCAL_KEYS.readyGoodsHistory,
                LOCAL_KEYS.salesRecords,
                LOCAL_KEYS.authActivity,
                LOCAL_KEYS.authSessions,
            ];
            purgeKeys.forEach(key => {
                if (_estimateLocalStorageBytes() <= 3.5 * 1024 * 1024) return;
                if (localStorage.getItem(key)) {
                    localStorage.removeItem(key);
                    console.log('[cleanup] Removed non-critical cache', key);
                }
            });
        }
    } catch (e) { /* ignore */ }

    // 6. Trim settings if oversized (> 200KB) — remove backup_data blobs
    try {
        const raw = localStorage.getItem('ro_calc_settings');
        if (raw && raw.length > 100000) {
            const settings = JSON.parse(raw);
            if (settings && typeof settings === 'object') {
                let cleaned = false;
                // Remove old backup data stored inside settings
                ['backup_data', 'last_backup', 'auto_backup_data'].forEach(k => {
                    if (settings[k] && JSON.stringify(settings[k]).length > 10000) {
                        delete settings[k];
                        cleaned = true;
                    }
                });
                if (cleaned) {
                    localStorage.setItem('ro_calc_settings', JSON.stringify(settings));
                    console.log('[cleanup] Stripped backup blobs from settings');
                }
            }
        }
    } catch (e) { /* ignore */ }

    if (!aggressive) return;

    // 4. When Supabase is available, localStorage is only a cache.
    // Move the biggest remote-backed datasets to in-memory cache for this session.
    try {
        const candidates = Object.values(LOCAL_KEYS)
            .filter(key => !preserveKeys.has(key))
            .map(key => {
                const raw = localStorage.getItem(key);
                return raw ? { key, size: raw.length } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.size - a.size);

        let freed = 0;
        candidates.forEach(({ key, size }, index) => {
            if (size < 10_000) return;
            if (freed > 1_500_000 && index > 2) return;
            freed += _moveLocalStorageKeyToVolatileCache(key);
            console.log('[cleanup] Moved cache key to memory:', key, `(~${Math.round(size * 2 / 1024)} KB)`);
        });
    } catch (e) {
        console.warn('[cleanup] Aggressive remote-cache cleanup failed:', e);
    }
}

function _getDeletedMoldIds() {
    const list = getLocal(LOCAL_KEYS.deletedMoldIds) || [];
    return [...new Set(list
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0))];
}

function _setDeletedMoldIds(ids) {
    setLocal(LOCAL_KEYS.deletedMoldIds, [...new Set((ids || [])
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0))]);
}

function _markMoldDeleted(moldId) {
    const next = _getDeletedMoldIds();
    next.push(Number(moldId));
    _setDeletedMoldIds(next);
}

function _clearDeletedMold(moldId) {
    const next = _getDeletedMoldIds().filter(id => id !== Number(moldId));
    _setDeletedMoldIds(next);
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
            if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
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
        planning_workers_count: 2,
        planning_hours_per_day: 8,
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
    // The blanks catalog (`molds`) is the single source of truth.
    // `product_templates` is only a legacy mirror and may lag behind edits.
    try {
        const molds = await loadMolds();
        return refreshTemplatesFromMolds(molds);
    } catch (e) {
        console.warn('loadTemplates fallback to local templates:', e);
        return _getLocalTemplates();
    }
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
    const templates = (molds || []).map(m => _moldToTemplate(m));
    App.templates = templates;
    setLocal(LOCAL_KEYS.templates, templates);
    return templates;
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

function _buildStableOrderItemId(orderId, item, index = 0) {
    const numericOrderId = Number(orderId) || 0;
    const numericItemNumber = Number(item?.item_number);
    const safeItemNumber = Number.isFinite(numericItemNumber) ? numericItemNumber : index;
    return (numericOrderId * 1000) + safeItemNumber;
}

function _normalizeOrderId(orderId) {
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) return Number(orderId);
    return orderId;
}

function _mergeOrderRecord(existingOrder, incomingOrder, options = {}) {
    const merged = { ...(existingOrder || {}) };
    Object.entries(incomingOrder || {}).forEach(([key, value]) => {
        if (value !== undefined) merged[key] = value;
    });
    if (existingOrder?.status === 'deleted' && !options.allowDeletedOverride) {
        merged.status = 'deleted';
        merged.deleted_at = existingOrder.deleted_at || merged.deleted_at || new Date().toISOString();
    }
    merged.updated_at = new Date().toISOString();
    return merged;
}

function _upsertOrderLocally(order, options = {}) {
    const normalizedId = _normalizeOrderId(order?.id);
    if (!normalizedId) return null;

    const orders = getLocal(LOCAL_KEYS.orders) || [];
    const idx = orders.findIndex(existing => String(existing.id) === String(normalizedId));
    const nowIso = new Date().toISOString();
    const incoming = { ...(order || {}), id: normalizedId };

    if (idx >= 0) {
        orders[idx] = _mergeOrderRecord(orders[idx], incoming, options);
    } else {
        orders.push({
            ...incoming,
            created_at: incoming.created_at || nowIso,
            updated_at: nowIso,
        });
    }

    setLocal(LOCAL_KEYS.orders, orders);
    return idx >= 0 ? orders[idx] : orders[orders.length - 1];
}

function _removeOrderLocally(orderId) {
    const normalizedId = _normalizeOrderId(orderId);
    const orders = (getLocal(LOCAL_KEYS.orders) || []).filter(order => String(order.id) !== String(normalizedId));
    setLocal(LOCAL_KEYS.orders, orders);

    const items = (getLocal(LOCAL_KEYS.orderItems) || []).filter(item => String(item.order_id) !== String(normalizedId));
    setLocal(LOCAL_KEYS.orderItems, items);
}

function _clearEditingOrderReference(orderId) {
    const normalizedId = _normalizeOrderId(orderId);
    if (!normalizedId) return;

    let currentEditingId = null;
    if (typeof App !== 'undefined' && App && App.editingOrderId != null) {
        currentEditingId = _normalizeOrderId(App.editingOrderId);
    } else {
        try {
            currentEditingId = _normalizeOrderId(localStorage.getItem('ro_calc_editing_order_id'));
        } catch (e) {
            currentEditingId = null;
        }
    }

    if (String(currentEditingId) !== String(normalizedId)) return;

    if (typeof Calculator !== 'undefined' && Calculator && typeof Calculator.resetForm === 'function') {
        Calculator.resetForm();
        return;
    }

    if (typeof Calculator !== 'undefined' && Calculator) {
        clearTimeout(Calculator._autosaveTimer);
        Calculator._isDirty = false;
        Calculator._autosaving = false;
        Calculator._currentOrderStatus = 'draft';
    }
    if (typeof App !== 'undefined' && App) {
        App.editingOrderId = null;
    }
    try {
        localStorage.removeItem('ro_calc_editing_order_id');
    } catch (e) { /* ignore */ }
}

function _getOrderItemDedupKey(item) {
    const type = item && item.item_type ? item.item_type : 'product';
    const itemNumber = Number(item?.item_number) || 0;
    return `${type}:${itemNumber}`;
}

function _getOrderItemFreshness(item) {
    return String(item?.updated_at || item?.created_at || '');
}

function _dedupeOrderItems(items, orderId = null) {
    const byKey = new Map();
    (items || []).forEach(item => {
        const key = _getOrderItemDedupKey(item);
        const existing = byKey.get(key);
        if (!existing || _getOrderItemFreshness(item) >= _getOrderItemFreshness(existing)) {
            byKey.set(key, item);
        }
    });
    const deduped = [...byKey.values()].sort((a, b) => (Number(a.item_number) || 0) - (Number(b.item_number) || 0));
    if (orderId && deduped.length !== (items || []).length) {
        console.warn('[loadOrder] Deduped duplicated order_items rows', {
            orderId,
            before: (items || []).length,
            after: deduped.length,
        });
    }
    return deduped;
}

async function _rewriteOrderItems(orderId, items) {
    orderId = _normalizeOrderId(orderId);
    const nowIso = new Date().toISOString();
    const normalized = (items || []).map((item, index) => ({
        ...item,
        id: item.id || _buildStableOrderItemId(orderId, item, index + 1),
        order_id: orderId,
        created_at: item.created_at || nowIso,
        updated_at: nowIso,
    }));

    if (isSupabaseReady()) {
        const { error: deleteError } = await supabaseClient
            .from('order_items')
            .delete()
            .eq('order_id', orderId);
        if (deleteError) {
            console.error('rewriteOrderItems delete error:', deleteError);
            return false;
        }

        if (normalized.length > 0) {
            const rows = normalized.map((item, index) => {
                const filtered = _filterForDB(item, _ITEM_COLS, 'item_data', null);
                filtered.order_id = orderId;
                filtered.id = item.id || _buildStableOrderItemId(orderId, item, index + 1);
                filtered.created_at = item.created_at || nowIso;
                filtered.updated_at = nowIso;
                return filtered;
            });
            const { error: insertError } = await supabaseClient
                .from('order_items')
                .insert(rows);
            if (insertError) {
                console.error('rewriteOrderItems insert error:', insertError);
                return false;
            }
        }
    }

    const localItems = getLocal(LOCAL_KEYS.orderItems) || [];
    const filtered = localItems.filter(item => String(item.order_id) !== String(orderId));
    setLocal(LOCAL_KEYS.orderItems, [...filtered, ...normalized]);
    return true;
}

async function saveOrder(order, items) {
    if (isSupabaseReady()) {
        // Generate ID for new orders (Supabase BIGINT PK has no auto-increment)
        let orderId = _normalizeOrderId(order.id);
        if (!orderId) {
            orderId = Date.now();
            order.id = orderId;
        }

        // Filter order to known columns + store full data in calculator_data
        const orderData = _filterForDB(order, _ORDER_COLS, 'calculator_data', _ORDER_FIELD_MAP);
        orderData.updated_at = new Date().toISOString();

        // Try update first if order exists, otherwise insert
        const { data: existing, error: existingError } = await supabaseClient
            .from('orders').select('id,status,deleted_at').eq('id', orderId).maybeSingle();
        if (existingError && existingError.code !== 'PGRST116') {
            console.error('saveOrder lookup error:', existingError);
        }

        const localBackupOrder = { ...order, id: orderId };

        if (existing) {
            if (existing.status === 'deleted') {
                orderData.status = 'deleted';
                orderData.deleted_at = existing.deleted_at || orderData.deleted_at || new Date().toISOString();
                localBackupOrder.status = 'deleted';
                localBackupOrder.deleted_at = existing.deleted_at || localBackupOrder.deleted_at || orderData.deleted_at;
            }
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
        const { error: deleteItemsError } = await supabaseClient
            .from('order_items')
            .delete()
            .eq('order_id', orderId);
        if (deleteItemsError) {
            console.error('deleteOrderItems error:', deleteItemsError);
            return null;
        }
        if (items.length > 0) {
            const nowIso = new Date().toISOString();
            const rows = items.map((item, i) => {
                const filtered = _filterForDB(item, _ITEM_COLS, 'item_data', null);
                filtered.order_id = orderId;
                filtered.id = item.id || _buildStableOrderItemId(orderId, item, i + 1);
                filtered.created_at = item.created_at || nowIso;
                filtered.updated_at = nowIso;
                return filtered;
            });
            const { error } = await supabaseClient.from('order_items').insert(rows);
            if (error) {
                console.error('insertOrderItems error:', error);
                return null;
            }
        }

        // Also save to localStorage as backup (full data, no filtering)
        _saveOrderLocally(localBackupOrder, items);

        return orderId;
    } else {
        // Local storage
        let orderId = _normalizeOrderId(order.id);
        if (orderId) {
            _upsertOrderLocally({ ...order, id: orderId });
        } else {
            orderId = Date.now();
            _upsertOrderLocally({ ...order, id: orderId });
        }

        const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
        const filtered = allItems.filter(i => String(i.order_id) !== String(orderId));
        const nowIso = new Date().toISOString();
        const newItems = items.map((item, idx) => ({
            ...item,
            id: item.id || _buildStableOrderItemId(orderId, item, idx + 1),
            order_id: orderId,
            created_at: item.created_at || nowIso,
            updated_at: nowIso,
        }));
        setLocal(LOCAL_KEYS.orderItems, [...filtered, ...newItems]);

        return orderId;
    }
}

/** Save order to localStorage (used as backup when Supabase is primary) */
function _saveOrderLocally(order, items) {
    try {
        const normalizedOrderId = _normalizeOrderId(order?.id);
        _upsertOrderLocally({ ...order, id: normalizedOrderId });

        const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
        const filtered = allItems.filter(i => String(i.order_id) !== String(normalizedOrderId));
        const nowIso = new Date().toISOString();
        const newItems = items.map((item, i) => ({
            ...item,
            id: item.id || _buildStableOrderItemId(normalizedOrderId, item, i + 1),
            order_id: normalizedOrderId,
            created_at: item.created_at || nowIso,
            updated_at: nowIso,
        }));
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

        const dedupedRawItems = _dedupeOrderItems(rawItems || [], orderId);
        let repairedDuplicates = false;
        if (dedupedRawItems.length !== (rawItems || []).length) {
            repairedDuplicates = await _rewriteOrderItems(orderId, dedupedRawItems);
        }

        // Restore full item data from item_data JSON
        const items = dedupedRawItems.map(item => {
            if (item.item_data) {
                try {
                    const extras = JSON.parse(item.item_data);
                    return { ...extras, ...item }; // DB columns take priority
                } catch (e) { /* ignore */ }
            }
            return item;
        });

        return { order: fullOrder, items, repaired_duplicates: repairedDuplicates };
    }
    const normalizedOrderId = _normalizeOrderId(orderId);
    const orders = getLocal(LOCAL_KEYS.orders) || [];
    const order = orders.find(o => String(_normalizeOrderId(o.id)) === String(normalizedOrderId));
    const allItems = getLocal(LOCAL_KEYS.orderItems) || [];
    const orderItems = allItems.filter(i => String(_normalizeOrderId(i.order_id)) === String(normalizedOrderId));
    const dedupedItems = _dedupeOrderItems(
        orderItems,
        normalizedOrderId
    );
    let repairedDuplicates = false;
    if (order && dedupedItems.length !== orderItems.length) {
        repairedDuplicates = await _rewriteOrderItems(normalizedOrderId, dedupedItems);
    }
    return order ? { order, items: dedupedItems, repaired_duplicates: repairedDuplicates } : null;
}

async function loadOrderItemsByOrderIds(orderIds = []) {
    const ids = [...new Set((orderIds || [])
        .map(id => Number(id))
        .filter(id => Number.isFinite(id) && id > 0))];
    if (ids.length === 0) return [];

    if (isSupabaseReady()) {
        const { data, error } = await supabaseClient
            .from('order_items')
            .select('*')
            .in('order_id', ids)
            .order('order_id')
            .order('item_number');
        if (error) {
            console.error('loadOrderItemsByOrderIds error:', error);
            return [];
        }
        return (data || []).map(item => {
            if (item.item_data) {
                try {
                    const extras = JSON.parse(item.item_data);
                    return { ...extras, ...item };
                } catch (e) { /* ignore */ }
            }
            return item;
        });
    }

    return (getLocal(LOCAL_KEYS.orderItems) || [])
        .filter(item => ids.includes(Number(item.order_id)))
        .sort((a, b) => {
            if (Number(a.order_id) !== Number(b.order_id)) {
                return Number(a.order_id) - Number(b.order_id);
            }
            return Number(a.item_number || 0) - Number(b.item_number || 0);
        });
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
    orderId = _normalizeOrderId(orderId);
    const nowIso = new Date().toISOString();
    // Soft delete — mark as deleted, keep data for recovery
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'deleted', deleted_at: nowIso, updated_at: nowIso })
            .eq('id', orderId);
        if (error) {
            console.error('deleteOrder error:', error);
            return;
        }
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            orders[idx].status = 'deleted';
            orders[idx].deleted_at = nowIso;
            orders[idx].updated_at = nowIso;
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
    _upsertOrderLocally({ id: orderId, status: 'deleted', deleted_at: nowIso }, { allowDeletedOverride: true });
    _clearEditingOrderReference(orderId);
}

async function restoreOrder(orderId) {
    orderId = _normalizeOrderId(orderId);
    const nowIso = new Date().toISOString();
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: 'draft', deleted_at: null, updated_at: nowIso })
            .eq('id', orderId);
        if (error) {
            console.error('restoreOrder error:', error);
            return;
        }
    } else {
        const orders = getLocal(LOCAL_KEYS.orders) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx >= 0) {
            orders[idx].status = 'draft';
            orders[idx].deleted_at = null;
            orders[idx].updated_at = nowIso;
            setLocal(LOCAL_KEYS.orders, orders);
        }
    }
    _upsertOrderLocally({ id: orderId, status: 'draft', deleted_at: null }, { allowDeletedOverride: true });
}

async function permanentDeleteOrder(orderId) {
    orderId = _normalizeOrderId(orderId);
    if (isSupabaseReady()) {
        const { error: itemsError } = await supabaseClient.from('order_items').delete().eq('order_id', orderId);
        if (itemsError) {
            console.error('permanentDeleteOrder items error:', itemsError);
            return;
        }
        const { error } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (error) {
            console.error('permanentDeleteOrder error:', error);
            return;
        }
    } else {
        _removeOrderLocally(orderId);
        _clearEditingOrderReference(orderId);
        return;
    }
    _removeOrderLocally(orderId);
    _clearEditingOrderReference(orderId);
}

// =============================================
// FINTABLO IMPORTS
// =============================================

async function saveFintabloImport(importData) {
    const record = {
        ...importData,
        id: importData.id || Date.now(),
        import_date: importData.import_date || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    const shouldReplaceExisting = record.source === 'api' && !!record.raw_data?.dealId;
    const matchesExistingImport = (row) => {
        if (!shouldReplaceExisting || !row) return false;
        const merged = _mergePayloadRow(row, 'import_data');
        return Number(merged.order_id) === Number(record.order_id)
            && String(merged.source || '') === String(record.source || '')
            && String(merged.raw_data?.dealId || '') === String(record.raw_data?.dealId || '');
    };
    const applyLocalRecord = () => {
        const imports = getLocal(LOCAL_KEYS.imports) || [];
        const idx = shouldReplaceExisting ? imports.findIndex(matchesExistingImport) : -1;
        if (idx >= 0) imports[idx] = { ...imports[idx], ...record };
        else imports.push(record);
        setLocal(LOCAL_KEYS.imports, imports);
    };
    if (isSupabaseReady()) {
        try {
            let existingRaw = null;
            if (shouldReplaceExisting) {
                const existingResp = await supabaseClient
                    .from('fintablo_imports')
                    .select('*')
                    .eq('order_id', record.order_id)
                    .order('import_date', { ascending: false });
                if (!existingResp.error) {
                    existingRaw = (existingResp.data || []).find(matchesExistingImport) || null;
                }
            }

            if (existingRaw) {
                let updateError = null;
                if (Object.prototype.hasOwnProperty.call(existingRaw, 'import_data')) {
                    ({ error: updateError } = await supabaseClient
                        .from('fintablo_imports')
                        .update({
                            import_data: record,
                            period_from: record.period_from || record.period_start || null,
                            period_to: record.period_to || record.period_end || null,
                            import_date: record.import_date,
                            updated_at: record.updated_at,
                        })
                        .eq('id', existingRaw.id));
                } else {
                    ({ error: updateError } = await supabaseClient
                        .from('fintablo_imports')
                        .update(record)
                        .eq('id', existingRaw.id));
                }
                if (!updateError) {
                    applyLocalRecord();
                    return existingRaw.id;
                }
            }

            const { data, error } = await supabaseClient
                .from('fintablo_imports')
                .insert(record)
                .select('id')
                .single();
            if (!error && data) {
                applyLocalRecord();
                return data.id;
            }
            const fallbackPayload = {
                id: record.id,
                order_id: record.order_id,
                import_data: record,
                period_from: record.period_from || record.period_start || null,
                period_to: record.period_to || record.period_end || null,
                import_date: record.import_date,
                created_at: record.created_at || record.import_date,
                updated_at: record.updated_at,
            };
            const fallback = await supabaseClient
                .from('fintablo_imports')
                .insert(fallbackPayload)
                .select('id')
                .single();
            if (!fallback.error && fallback.data) {
                applyLocalRecord();
                return fallback.data.id;
            }
            console.warn('saveFintabloImport Supabase error, falling back to localStorage:', fallback.error || error);
        } catch (e) {
            console.warn('saveFintabloImport Supabase exception, falling back to localStorage:', e);
        }
    }
    applyLocalRecord();
    return record.id;
}

function _parseJsonObject(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (_) { return null; }
    }
    return (typeof value === 'object' && !Array.isArray(value)) ? value : null;
}

function _mergePayloadRow(row, payloadKey) {
    if (!row || typeof row !== 'object') return row;
    const payload = _parseJsonObject(row[payloadKey]);
    return payload ? { ...payload, ...row } : row;
}

async function loadFintabloImports(orderId) {
    const localImports = (getLocal(LOCAL_KEYS.imports) || []).filter(i => i.order_id === orderId);
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('fintablo_imports')
                .select('*')
                .eq('order_id', orderId)
                .order('import_date', { ascending: false });
            if (!error && data && data.length > 0) return data.map(row => _mergePayloadRow(row, 'import_data'));
            if (error) console.warn('loadFintabloImports Supabase error, falling back to localStorage:', error);
        } catch (e) {
            console.warn('loadFintabloImports Supabase exception, falling back to localStorage:', e);
        }
    }
    return localImports;
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
            .maybeSingle();
        if (error && error.code !== 'PGRST116') console.error('loadFactual error:', error);
        if (data) return _mergePayloadRow(data, 'factual_data');
    }
    const all = getLocal(LOCAL_KEYS.orderFactuals) || [];
    return all.find(f => f.order_id === orderId) || null;
}

async function saveFactual(orderId, factData) {
    if (typeof orderId === 'string' && /^\d+$/.test(orderId)) orderId = Number(orderId);
    const record = { ...factData, id: factData.id || Date.now(), order_id: orderId, updated_at: new Date().toISOString() };
    if (isSupabaseReady()) {
        const { data: existingRaw, error: existingError } = await supabaseClient
            .from('order_factuals')
            .select('*')
            .eq('order_id', orderId)
            .maybeSingle();
        if (existingError && existingError.code !== 'PGRST116') {
            console.error('saveFactual lookup error:', existingError);
        }
        const useJsonPayload = !!(existingRaw && Object.prototype.hasOwnProperty.call(existingRaw, 'factual_data'));

        if (existingRaw) {
            let error = null;
            if (useJsonPayload) {
                ({ error } = await supabaseClient
                    .from('order_factuals')
                    .update({ factual_data: record, updated_at: record.updated_at })
                    .eq('order_id', orderId));
            } else {
                ({ error } = await supabaseClient
                    .from('order_factuals')
                    .update(record)
                    .eq('order_id', orderId));
                if (error) {
                    ({ error } = await supabaseClient
                        .from('order_factuals')
                        .update({ factual_data: record, updated_at: record.updated_at })
                        .eq('order_id', orderId));
                }
            }
            if (error) console.error('saveFactual update error:', error);
        } else {
            let { error } = await supabaseClient
                .from('order_factuals')
                .insert(record);
            if (error) {
                ({ error } = await supabaseClient
                    .from('order_factuals')
                    .insert({
                        id: record.id,
                        order_id: orderId,
                        factual_data: record,
                        created_at: factData.created_at || record.updated_at,
                        updated_at: record.updated_at,
                    }));
            }
            if (error) console.error('saveFactual insert error:', error);
        }
    }
    // ALWAYS write to localStorage (dual-write)
    const all = getLocal(LOCAL_KEYS.orderFactuals) || [];
    const idx = all.findIndex(f => f.order_id === orderId);
    if (idx >= 0) {
        all[idx] = record;
    } else {
        record.id = record.id || Date.now();
        all.push(record);
    }
    setLocal(LOCAL_KEYS.orderFactuals, all);
}

// =============================================
// TIME ENTRIES (employee time tracking)
// =============================================

// Transform Supabase row → web UI entry format
function _timeEntryFromDb(row) {
    if (!row) return row;
    const e = { ...row };
    // Supabase columns → web UI aliases
    e.worker_name = e.employee_name || '';
    e.description = e.task_description || '';
    // Extract project_name from meta JSON inside task_description
    const metaMatch = String(e.task_description || '').match(/^\[meta\](\{.*?\})\[\/meta\]/);
    if (metaMatch) {
        try {
            const parsed = JSON.parse(metaMatch[1]);
            if (parsed && parsed.project) e.project_name = parsed.project;
        } catch (_) {}
    }
    if (!e.project_name) e.project_name = '';
    return e;
}

// Transform web UI entry → Supabase row format
function _timeEntryToDb(entry) {
    const row = {
        id: entry.id || (Date.now() + Math.floor(Math.random() * 1000)),
        employee_id: entry.employee_id || null,
        employee_name: entry.worker_name || entry.employee_name || '',
        date: entry.date,
        hours: entry.hours,
        task_description: entry.description || entry.task_description || '',
        order_id: entry.order_id || null,
        notes: entry.notes || null,
    };
    // Inject project_name into task_description meta if present
    if (entry.project_name) {
        const metaMatch = row.task_description.match(/^\[meta\](\{.*?\})\[\/meta\](.*)/s);
        if (metaMatch) {
            try {
                const parsed = JSON.parse(metaMatch[1]);
                parsed.project = entry.project_name;
                row.task_description = `[meta]${JSON.stringify(parsed)}[/meta]${metaMatch[2]}`;
            } catch (_) {
                // fallback: prepend project as meta
                const payload = JSON.stringify({ project: entry.project_name });
                row.task_description = `[meta]${payload}[/meta] ${row.task_description}`.trim();
            }
        } else {
            // No meta prefix — add one with project
            const payload = JSON.stringify({ project: entry.project_name });
            row.task_description = `[meta]${payload}[/meta] ${row.task_description}`.trim();
        }
    }
    return row;
}

async function loadTimeEntries() {
    const fallback = getLocal(LOCAL_KEYS.timeEntries) || [];
    if (isSupabaseReady()) {
        try {
            const timeoutMs = Number(window.__RO_REMOTE_LOAD_TIMEOUT_MS) > 0 ? Number(window.__RO_REMOTE_LOAD_TIMEOUT_MS) : 5000;
            const result = await Promise.race([
                supabaseClient
                    .from('time_entries')
                    .select('*')
                    .order('date', { ascending: false }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
            ]);
            const { data, error } = result || {};
            if (error) {
                console.error('loadTimeEntries error:', error);
                return fallback;
            }
            return (data || []).map(_timeEntryFromDb);
        } catch (err) {
            console.warn('loadTimeEntries timeout/error, using local:', err);
        }
    }
    return fallback;
}

async function saveTimeEntry(entry) {
    if (isSupabaseReady()) {
        const dbRow = _timeEntryToDb(entry);
        const { id: dbId, ...updateRow } = dbRow;
        const query = entry && entry.id
            ? supabaseClient
                .from('time_entries')
                .update(updateRow)
                .eq('id', entry.id)
                .select('id')
                .single()
            : supabaseClient
                .from('time_entries')
                .insert(dbRow)
                .select('id')
                .single();
        const { data, error } = await query;
        if (error) { console.error('saveTimeEntry error:', error); return null; }
        return data.id;
    }
    const entries = getLocal(LOCAL_KEYS.timeEntries) || [];
    if (entry && entry.id) {
        const idx = entries.findIndex(e => String(e.id) === String(entry.id));
        if (idx >= 0) {
            entries[idx] = { ...entries[idx], ...entry, updated_at: new Date().toISOString() };
            setLocal(LOCAL_KEYS.timeEntries, entries);
            return entry.id;
        }
    }
    const id = entry?.id || Date.now();
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
    const deletedIds = new Set(_getDeletedMoldIds());
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient.from('molds').select('*').order('name');
            if (error) {
                console.error('loadMolds error:', error);
                if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
            }

            // Parse Supabase rows
            const _parseMoldRow = (row) => {
                if (row.mold_data) {
                    try {
                        const parsed = typeof row.mold_data === 'string' ? JSON.parse(row.mold_data) : row.mold_data;
                        return { ...parsed, id: row.id };
                    } catch(e) { /* fallthrough */ }
                }
                return row;
            };
            if (deletedIds.size > 0) {
                try {
                    const { error: deleteError } = await supabaseClient
                        .from('molds')
                        .delete()
                        .in('id', Array.from(deletedIds));
                    if (deleteError) console.warn('loadMolds deleted-id sync error:', deleteError);
                } catch (e) {
                    console.warn('loadMolds deleted-id sync exception:', e);
                }
            }

            const rawSupabaseMolds = (data || [])
                .map(_parseMoldRow)
                .filter(mold => !deletedIds.has(Number(mold.id)));

            const repairedSupabaseMolds = [];
            rawSupabaseMolds.forEach(mold => {
                const recovered = _withHistoricalBlankPriceRecovery(mold);
                if (recovered.changed) repairedSupabaseMolds.push(recovered.mold);
            });
            const supabaseMolds = rawSupabaseMolds.map(mold => _withHistoricalBlankPriceRecovery(mold).mold);
            if (repairedSupabaseMolds.length > 0) {
                try {
                    await supabaseClient.from('molds').upsert(
                        repairedSupabaseMolds.map(mold => ({
                            id: mold.id,
                            name: mold.name || '',
                            mold_data: JSON.stringify(mold),
                            created_at: mold.created_at || new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })),
                        { onConflict: 'id' }
                    );
                    console.log('[Molds] Restored historical custom_prices for', repairedSupabaseMolds.length, 'records');
                } catch (e) {
                    console.warn('Historical mold price repair error:', e);
                }
            }

            // Smart merge: only push local records that are missing in Supabase.
            // Existing Supabase molds stay authoritative, because browser-local
            // caches previously overwrote shared manual pricing for blanks.
            const localMolds = (getLocal(LOCAL_KEYS.molds) || [])
                .filter(mold => !deletedIds.has(Number(mold.id)))
                .map(mold => _withHistoricalBlankPriceRecovery(mold).mold);
            if (localMolds.length > 0) {
                const sbMap = new Map(supabaseMolds.map(m => [m.id, m]));
                let pushed = 0;
                for (const local of localMolds) {
                    if (!local.id) continue;
                    const sbExists = sbMap.has(local.id);
                    if (!sbExists) {
                        try {
                            await supabaseClient.from('molds').upsert({
                                id: local.id, name: local.name || '', mold_data: JSON.stringify(local),
                                created_at: local.created_at || new Date().toISOString(),
                                updated_at: local.updated_at || new Date().toISOString(),
                            }, { onConflict: 'id' });
                            pushed++;
                        } catch(e) { console.warn('Mold merge error:', e); }
                    }
                }
                if (pushed > 0) {
                    console.log(`[Molds] Smart-merged ${pushed} local records to Supabase`);
                    // Re-fetch merged data
                    const { data: refreshed } = await supabaseClient.from('molds').select('*').order('name');
                    if (refreshed && refreshed.length > 0) {
                        const merged = refreshed.map(_parseMoldRow);
                        setLocal(LOCAL_KEYS.molds, merged);
                        return merged;
                    }
                }
            }

            if (supabaseMolds.length > 0) {
                setLocal(LOCAL_KEYS.molds, supabaseMolds);
                return supabaseMolds;
            }

            // Supabase truly empty — seed from localStorage or defaults
            const seedData = (localMolds.length > 0 ? localMolds : getDefaultMolds())
                .filter(mold => !deletedIds.has(Number(mold.id)));
            console.log('Seeding', seedData.length, 'molds to Supabase...');
            for (const m of seedData) {
                try {
                    await supabaseClient.from('molds').upsert({
                        id: m.id || Date.now(), name: m.name || '', mold_data: JSON.stringify(m),
                        created_at: m.created_at || new Date().toISOString(), updated_at: m.updated_at || new Date().toISOString(),
                    }, { onConflict: 'id' });
                } catch(e) { console.warn('Mold seed error:', e); }
            }
            setLocal(LOCAL_KEYS.molds, seedData);
            return seedData;
        } catch(e) {
            console.error('loadMolds exception:', e);
            if (_isSupabaseAccessError(e)) _markSupabaseAccessProblem(e);
            const localMolds = (getLocal(LOCAL_KEYS.molds) || getDefaultMolds())
                .filter(mold => !deletedIds.has(Number(mold.id)))
                .map(mold => _withHistoricalBlankPriceRecovery(mold).mold);
            return localMolds;
        }
    }
    return (getLocal(LOCAL_KEYS.molds) || getDefaultMolds())
        .filter(mold => !deletedIds.has(Number(mold.id)))
        .map(mold => _withHistoricalBlankPriceRecovery(mold).mold);
}

// Upload base64 mold photo to Supabase Storage, return public URL
async function uploadMoldPhoto(moldId, base64DataUrl) {
    if (!isSupabaseReady() || !base64DataUrl || !base64DataUrl.startsWith('data:')) return base64DataUrl;
    try {
        // Convert base64 to Blob
        const [header, b64] = base64DataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: mime });

        const ext = mime === 'image/png' ? 'png' : 'jpg';
        const path = `molds/${moldId}.${ext}`;

        // Upload (upsert to overwrite existing)
        const { error } = await supabaseClient.storage
            .from('product-images')
            .upload(path, blob, { contentType: mime, upsert: true });

        if (error) {
            console.error('uploadMoldPhoto error:', error);
            return base64DataUrl; // fallback to base64
        }

        // Get public URL
        const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
        return data?.publicUrl || base64DataUrl;
    } catch (e) {
        console.error('uploadMoldPhoto exception:', e);
        return base64DataUrl;
    }
}

async function saveMold(mold) {
    if (!mold.id) { mold.id = Date.now(); mold.created_at = new Date().toISOString(); }
    mold.updated_at = new Date().toISOString();
    _clearDeletedMold(mold.id);

    // Upload photo to Storage if it's base64 (instead of storing huge data URI in JSON)
    if (mold.photo_url && mold.photo_url.startsWith('data:')) {
        mold.photo_url = await uploadMoldPhoto(mold.id, mold.photo_url);
    }

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
    refreshTemplatesFromMolds(molds);
    return mold.id;
}

async function deleteMold(moldId) {
    _markMoldDeleted(moldId);
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('molds').delete().eq('id', moldId);
            if (error) console.error('deleteMold error:', error);
        } catch(e) { console.error('deleteMold exception:', e); }
    }
    const molds = (getLocal(LOCAL_KEYS.molds) || []).filter(m => m.id !== moldId);
    setLocal(LOCAL_KEYS.molds, molds);
    refreshTemplatesFromMolds(molds);
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
        custom_margins: {}, custom_prices: _getHistoricalBlankCustomPrices(name),
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

// Supabase employees table known columns (strip unknown fields to avoid upsert errors)
const SUPABASE_EMPLOYEE_COLS = new Set([
    'id', 'name', 'role', 'daily_hours', 'telegram_id', 'telegram_username',
    'reminder_hour', 'reminder_minute', 'timezone_offset', 'is_active',
    'tasks_required', 'pay_base_salary_month', 'pay_base_hours_month',
    'pay_overtime_hour_rate', 'pay_weekend_hour_rate', 'pay_holiday_hour_rate',
    'created_at', 'updated_at',
]);

function _supabaseEmployeePayload(employee) {
    const out = {};
    for (const k of Object.keys(employee)) {
        if (SUPABASE_EMPLOYEE_COLS.has(k)) out[k] = employee[k];
    }
    return out;
}

// =============================================
// EMPLOYEE EXTRA DATA (salary split, fired_date — synced via Supabase settings)
// Fields that Supabase employees table doesn't have as columns.
// =============================================
const EMP_EXTRA_KEY = 'ro_employee_extra'; // localStorage key
const EMP_EXTRA_SUPABASE_KEY = 'employee_extra_json'; // settings table key

function _getEmpExtra() {
    return JSON.parse(localStorage.getItem(EMP_EXTRA_KEY) || '{}');
}

function _setEmpExtra(data) {
    localStorage.setItem(EMP_EXTRA_KEY, JSON.stringify(data));
}

async function _loadEmpExtraFromSupabase() {
    if (!isSupabaseReady()) return;
    try {
        const { data, error } = await supabaseClient
            .from('settings').select('value')
            .eq('key', EMP_EXTRA_SUPABASE_KEY).maybeSingle();
        if (!error && data && data.value) {
            const parsed = JSON.parse(data.value);
            // Merge: Supabase wins over local
            const local = _getEmpExtra();
            const merged = { ...local, ...parsed };
            _setEmpExtra(merged);
            return merged;
        }
    } catch (e) { console.error('loadEmpExtra error:', e); }
    return _getEmpExtra();
}

async function _saveEmpExtraToSupabase() {
    const data = _getEmpExtra();
    if (!isSupabaseReady()) return;
    try {
        await supabaseClient.from('settings').upsert({
            key: EMP_EXTRA_SUPABASE_KEY,
            value: JSON.stringify(data),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
    } catch (e) { console.error('saveEmpExtra error:', e); }
}

// Get extra fields for one employee
function getEmployeeExtra(empId) {
    const all = _getEmpExtra();
    return all[String(empId)] || {};
}

// Save extra fields for one employee
async function saveEmployeeExtra(empId, fields) {
    const all = _getEmpExtra();
    all[String(empId)] = { ...(all[String(empId)] || {}), ...fields };
    _setEmpExtra(all);
    await _saveEmpExtraToSupabase();
}

// Merge extra data into employee objects after loading
function _mergeEmpExtra(employees) {
    const extra = _getEmpExtra();
    const defaults = getDefaultEmployees();
    const defaultMap = {};
    defaults.forEach(d => { defaultMap[String(d.id)] = d; });

    employees.forEach(emp => {
        const ex = extra[String(emp.id)];
        const def = defaultMap[String(emp.id)];
        // Priority: extra (user-saved) > existing on employee > defaults
        emp.pay_white_salary = (ex && ex.pay_white_salary !== undefined) ? ex.pay_white_salary : (emp.pay_white_salary ?? (def ? def.pay_white_salary : 0));
        emp.pay_black_salary = (ex && ex.pay_black_salary !== undefined) ? ex.pay_black_salary : (emp.pay_black_salary ?? (def ? def.pay_black_salary : 0));
        emp.fired_date = (ex && ex.fired_date) ? ex.fired_date : (emp.fired_date || null);
        emp.payroll_profile = (ex && ex.payroll_profile) ? ex.payroll_profile : (emp.payroll_profile || (def ? def.payroll_profile : null));
        emp.pay_base_hours_semimonth = (ex && ex.pay_base_hours_semimonth !== undefined)
            ? ex.pay_base_hours_semimonth
            : (emp.pay_base_hours_semimonth ?? (def ? def.pay_base_hours_semimonth : 0));
        if (def && String(emp.id) === '1772800698338' && Number(emp.pay_base_hours_month) === 176) {
            emp.pay_base_hours_month = def.pay_base_hours_month;
        }
        // Recalc base salary
        emp.pay_base_salary_month = (emp.pay_white_salary || 0) + (emp.pay_black_salary || 0);
    });

    // Add missing employees from defaults
    const existingIds = new Set(employees.map(e => String(e.id)));
    defaults.forEach(d => {
        if (!existingIds.has(String(d.id))) {
            const ex = extra[String(d.id)];
            if (ex) Object.assign(d, ex);
            employees.push(d);
        }
    });

    return employees;
}

// Fired dates for employees
const FIRED_DATES = {
    '1772801066913': '2026-03-15', // Женя Г (Голубенкова)
    '1741700004000': '2026-03-15', // Женя Максименкова
    '1741700009000': '2026-04-01', // Аня Шатран
    '1741700001000': '2025-12-01', // Сергей М
};

// Seed default extra data — re-seed on version change
function _seedDefaultEmpExtra() {
    const SEED_KEY = 'ro_emp_extra_seeded_v5'; // bump to re-seed payroll profile defaults
    if (localStorage.getItem(SEED_KEY)) return;
    const defaults = getDefaultEmployees();
    const extra = _getEmpExtra();
    defaults.forEach(d => {
        const key = String(d.id);
        // Always overwrite with latest defaults
        extra[key] = {
            pay_white_salary: d.pay_white_salary || 0,
            pay_black_salary: d.pay_black_salary || 0,
            fired_date: FIRED_DATES[key] || null,
            payroll_profile: d.payroll_profile || null,
            pay_base_hours_semimonth: d.pay_base_hours_semimonth || 0,
        };
    });
    _setEmpExtra(extra);
    localStorage.setItem(SEED_KEY, '1');
}

async function loadEmployees() {
    try {
        _seedDefaultEmpExtra();
        // Load extra data from Supabase (with timeout to avoid hanging)
        if (isSupabaseReady()) {
            try {
                await Promise.race([
                    _loadEmpExtraFromSupabase(),
                    new Promise((_, rej) => setTimeout(() => rej('timeout'), 5000))
                ]);
            } catch (e) { console.warn('loadEmpExtra timeout/error, using local:', e); }
        }
        if (isSupabaseReady()) {
            const { data, error } = await supabaseClient.from('employees').select('*').order('name');
            if (!error && data && data.length > 0) {
                const merged = _mergeEmpExtra(data);
                setLocal(LOCAL_KEYS.employees, merged);
                return merged;
            }
            if (!error && data && data.length === 0) {
                const defaults = getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
                try {
                    const filtered = defaults.map(d => _supabaseEmployeePayload(d));
                    await supabaseClient.from('employees').upsert(filtered, { onConflict: 'id' });
                } catch (e) {
                    console.error('loadEmployees seed error:', e);
                }
                return _mergeEmpExtra(defaults);
            }
            if (error) console.error('loadEmployees supabase error:', error);
        }
    } catch (err) {
        console.error('loadEmployees exception:', err);
    }
    const emps = getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
    return _mergeEmpExtra(emps);
}

async function saveEmployee(employee) {
    if (!employee.id) employee.id = Date.now();

    // Always save extra fields (white/black salary, fired_date) to settings JSON
    await saveEmployeeExtra(employee.id, {
        pay_white_salary: employee.pay_white_salary || 0,
        pay_black_salary: employee.pay_black_salary || 0,
        fired_date: employee.fired_date || null,
        payroll_profile: employee.payroll_profile || null,
        pay_base_hours_semimonth: employee.pay_base_hours_semimonth || 0,
    });

    if (isSupabaseReady()) {
        const payload = _supabaseEmployeePayload({
            ...employee,
            updated_at: new Date().toISOString(),
            created_at: employee.created_at || new Date().toISOString(),
        });
        const { error } = await supabaseClient
            .from('employees')
            .upsert(payload, { onConflict: 'id' });
        if (error) {
            console.error('saveEmployee error:', error);
            return null;
        }
        // Keep local mirror updated
        const local = getLocal(LOCAL_KEYS.employees) || [];
        const idx = local.findIndex(e => String(e.id) === String(employee.id));
        if (idx >= 0) local[idx] = { ...local[idx], ...employee, updated_at: new Date().toISOString() };
        else local.push({ ...employee, created_at: employee.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
        setLocal(LOCAL_KEYS.employees, local);
        return employee.id;
    }
    const employees = getLocal(LOCAL_KEYS.employees) || getDefaultEmployees();
    if (employee.id) {
        const idx = employees.findIndex(e => String(e.id) === String(employee.id));
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

function sanitizeAuthAccount(account) {
    if (!account || typeof account !== 'object') return account;
    const sanitized = { ...account };
    delete sanitized.password_plain;
    return sanitized;
}

async function loadAuthAccounts() {
    const fallback = (getLocal(LOCAL_KEYS.authAccounts) || []).map(sanitizeAuthAccount);
    if (isSupabaseReady()) {
        try {
            const timeoutMs = Number(window.__RO_REMOTE_LOAD_TIMEOUT_MS) > 0 ? Number(window.__RO_REMOTE_LOAD_TIMEOUT_MS) : 5000;
            const result = await Promise.race([
                supabaseClient
                    .from('settings')
                    .select('value')
                    .eq('key', 'auth_accounts_json')
                    .maybeSingle(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
            ]);
            const { data, error } = result || {};
            if (!error && data && data.value) {
                const parsed = (JSON.parse(data.value) || []).map(sanitizeAuthAccount);
                setLocal(LOCAL_KEYS.authAccounts, parsed);
                return parsed;
            }
        } catch (e) {
            console.warn('loadAuthAccounts timeout/error, using local:', e);
        }
    }
    return fallback;
}

async function saveAuthAccounts(accounts) {
    const payload = (Array.isArray(accounts) ? accounts : []).map(sanitizeAuthAccount);
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
    const trimmed = list.slice(0, 200);
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
                const parsed = (JSON.parse(data.value) || []).slice(-200);
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
    const payload = (Array.isArray(sessions) ? sessions : []).slice(-200);
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

// =============================================
// KNOWLEDGE BASE / INTERNAL WIKI
// =============================================

async function loadWikiState() {
    const fallback = getLocal(LOCAL_KEYS.wikiState) || null;
    if (isSupabaseReady()) {
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', 'knowledge_wiki_json')
                .maybeSingle();
            if (!error && data && data.value) {
                const parsed = JSON.parse(data.value) || null;
                if (parsed) setLocal(LOCAL_KEYS.wikiState, parsed);
                return parsed;
            }
        } catch (e) {
            console.error('loadWikiState error:', e);
        }
    }
    return fallback;
}

async function saveWikiState(state) {
    const payload = state && typeof state === 'object' ? state : null;
    if (!payload) return null;
    setLocal(LOCAL_KEYS.wikiState, payload);
    if (isSupabaseReady()) {
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'knowledge_wiki_json',
                value: JSON.stringify(payload),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
        if (error) console.error('saveWikiState error:', error);
    }
    return payload;
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
    // w=белая(нетто), b=чёрная. pay_base_salary_month = w + b (для расчёта ставки/час)
    const e = (id, name, role, opts = {}) => ({
        id, name, role, daily_hours: opts.hours || 8, telegram_id: null, telegram_username: '',
        reminder_hour: 17, reminder_minute: 30, timezone_offset: 3,
        is_active: opts.active !== undefined ? opts.active : true,
        tasks_required: opts.tasks || false,
        pay_white_salary: opts.w || 0,
        pay_black_salary: opts.b || 0,
        pay_base_salary_month: (opts.w || 0) + (opts.b || 0),
        pay_base_hours_month: opts.baseHours || 176,
        payroll_profile: opts.payroll || (((opts.w || 0) + (opts.b || 0)) > 0 ? 'salary_monthly' : 'hourly'),
        pay_base_hours_semimonth: opts.halfHours || 0,
        pay_overtime_hour_rate: opts.ot || 0,
        pay_weekend_hour_rate: opts.we || 0, pay_holiday_hour_rate: opts.ho || 0,
    });
    // ЗП из FinTablo справочника сотрудников (Mar 2026).
    // Белая = через трудовой (нетто на руки), чёрная = наличные/переводы.
    // Налоги (НДФЛ + взносы) рассчитываются автоматически от белой части.
    // Итого FinTablo: Фикс 1 544 945₽, Взносы 77 172₽, НДФЛ 50 806₽, Итого 1 672 923₽
    return [
        // Производство
        e(1772800698338, 'Тая', 'production', { w: 40000, b: 30000, hours: 6, baseHours: 120, halfHours: 60, payroll: 'salary_semimonth_threshold', ot: 500, we: 750, ho: 750 }),
        // Панкина Таисия — Оператор лазерного станка. Фикс 70к, белая 40к + чёрная 30к
        e(1772801066913, 'Женя Г', 'production', { w: 0, b: 0, payroll: 'hourly', ot: 500, we: 750, ho: 750, active: false }),
        // Голубенкова Евгения — Сотрудник производства. Уволена 15.03.2026
        e(1741700001000, 'Сергей М', 'production', { payroll: 'hourly', ot: 500, we: 750, ho: 750, active: false }),

        // Управление
        e(5, 'Полина', 'management', { w: 0, b: 350000, tasks: true }),
        // Черповицкая Полина — Директор. Фикс 350к, весь чёрный
        e(1772827635013, 'Леша', 'management', { w: 0, b: 180000, payroll: 'management_salary_with_production_allocation' }),
        // Маркелов Алексей — Начальник производства. 180к чёрный. 50% производство

        // Офис / Коммерция
        e(1741700004000, 'Женя Максименкова', 'office', { w: 100000, b: 65000, active: false }),
        // Максименкова Евгения — Операционный директор. Фикс 165к: белая 100к + чёрная 65к. Уволена 15.03.2026
        e(3, 'Аня', 'office', { w: 0, b: 100000 }),
        // Овчаренко Анна — Коммерческий директор. 100к чёрный
        e(1741700005000, 'Виолетта', 'office', { w: 0, b: 95745 }),
        // Сорокина Виолетта — Креативный директор. 95 745 чёрный
        e(1, 'Алина', 'office', { w: 100000, b: 50000 }),
        // Семенова Алина — Менеджер проектов. Фикс 150к: белая 100к + чёрная 50к
        e(1741700003000, 'Борис', 'office', { w: 60000, b: 60000 }),
        // Журавлев Борис — Дизайнер. Фикс 120к: белая 60к + чёрная 60к
        e(2, 'Элина', 'office', { w: 40000, b: 40000 }),
        // Кемайкина Элина — Менеджер проектов. Фикс 80к: белая 40к + чёрная 40к
        e(1741700006000, 'Бухгалтер (ИП Соболева)', 'office', { w: 0, b: 38000 }),
        // ИП Соболева — Бухгалтер. 38к (ИП, налоги сам)
        e(1741700002000, 'Анастасия', 'office', { w: 0, b: 80000 }),
        // Юрасик Анастасия — Операционный менеджер. 80к чёрный
        e(1741700009000, 'Аня Шатран', 'office', { w: 0, b: 40000, active: false }),
        // Шатран Анна — Менеджер проектов (Маркетплейс). 40к чёрный. Уволена 01.04.2026
        e(1741700007000, 'Ксения', 'office', { w: 0, b: 55000 }),
        // Звездина Ксения — SMM менеджер. 55к чёрный
        e(1741700008000, 'Екатерина', 'office', { w: 0, b: 21200 }),
        // Кирлан Екатерина — 21 200 чёрный
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
    const normalizeWarehouseItem = (item) => {
        if (!item || typeof item !== 'object') return item;
        const normalized = { ...item };
        const numericId = Number(normalized.id || 0);
        if (Number.isFinite(numericId) && numericId > 0) {
            normalized.id = numericId;
        }
        const linkedOrderId = Number(normalized.linked_order_id || 0);
        if (Number.isFinite(linkedOrderId) && linkedOrderId > 0) {
            normalized.linked_order_id = linkedOrderId;
        } else if (String(normalized.linked_order_id || '').trim() === '') {
            normalized.linked_order_id = '';
        }
        return normalized;
    };

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
                            return normalizeWarehouseItem({ ...parsed, id: row.id });
                        } catch(e) { /* fallthrough */ }
                    }
                    return normalizeWarehouseItem(row);
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
                    const normalizedItem = normalizeWarehouseItem(item);
                    try {
                        await supabaseClient.from('warehouse_items').upsert({
                            id: normalizedItem.id || Date.now(),
                            name: normalizedItem.name || '',
                            sku: normalizedItem.sku || '',
                            category: normalizedItem.category || '',
                            item_data: JSON.stringify(normalizedItem),
                            created_at: normalizedItem.created_at || new Date().toISOString(),
                            updated_at: normalizedItem.updated_at || new Date().toISOString(),
                        }, { onConflict: 'id' });
                    } catch(e) { console.warn('WH item migration error:', e); }
                }
                return local.map(normalizeWarehouseItem);
            }
            return [];
        } catch(e) {
            console.error('loadWarehouseItems exception:', e);
            return (getLocal(LOCAL_KEYS.warehouseItems) || []).map(normalizeWarehouseItem);
        }
    }
    return (getLocal(LOCAL_KEYS.warehouseItems) || []).map(normalizeWarehouseItem);
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
    const normalizedItemId = String(item.id || '').trim();
    const normalizedItemIdNum = Number(item.id || 0);
    const idx = items.findIndex(i => {
        const currentId = String(i && i.id || '').trim();
        if (currentId && currentId === normalizedItemId) return true;
        const currentIdNum = Number(i && i.id || 0);
        return Number.isFinite(currentIdNum)
            && Number.isFinite(normalizedItemIdNum)
            && currentIdNum > 0
            && normalizedItemIdNum > 0
            && currentIdNum === normalizedItemIdNum;
    });
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
    const normalizedItemId = String(itemId || '').trim();
    const normalizedItemIdNum = Number(itemId || 0);
    const items = (getLocal(LOCAL_KEYS.warehouseItems) || []).filter(i => {
        const currentId = String(i && i.id || '').trim();
        if (currentId && currentId === normalizedItemId) return false;
        const currentIdNum = Number(i && i.id || 0);
        if (
            Number.isFinite(currentIdNum)
            && Number.isFinite(normalizedItemIdNum)
            && currentIdNum > 0
            && normalizedItemIdNum > 0
            && currentIdNum === normalizedItemIdNum
        ) {
            return false;
        }
        return true;
    });
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
                const { blanks: deduped, duplicateIds } = _dedupeHwBlanks(blanks);
                if (duplicateIds.length > 0) {
                    await _deleteHwBlankIds(duplicateIds);
                }
                setLocal(LOCAL_KEYS.hwBlanks, deduped);
                return deduped;
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
                const { blanks: deduped } = _dedupeHwBlanks(local);
                setLocal(LOCAL_KEYS.hwBlanks, deduped);
                return deduped;
            }
            return getDefaultHwBlanks();
        } catch(e) {
            console.error('loadHwBlanks exception:', e);
            const fallback = getLocal(LOCAL_KEYS.hwBlanks) || getDefaultHwBlanks();
            const { blanks: deduped } = _dedupeHwBlanks(fallback);
            setLocal(LOCAL_KEYS.hwBlanks, deduped);
            return deduped;
        }
    }
    const fallback = getLocal(LOCAL_KEYS.hwBlanks) || getDefaultHwBlanks();
    const { blanks: deduped } = _dedupeHwBlanks(fallback);
    setLocal(LOCAL_KEYS.hwBlanks, deduped);
    return deduped;
}

async function saveHwBlank(blank) {
    const localBlanks = getLocal(LOCAL_KEYS.hwBlanks) || [];
    const warehouseItemId = Number(blank.warehouse_item_id || 0);
    const sameWarehouseItem = warehouseItemId > 0
        ? localBlanks
            .filter(b => _isWarehouseHwBlank(b) && Number(b.warehouse_item_id || 0) === warehouseItemId && Number(b.id) !== Number(blank.id || 0))
            .sort(_compareHwBlankFreshnessDesc)
        : [];
    let duplicateIds = [];

    if (!blank.id && sameWarehouseItem.length > 0) {
        const primary = sameWarehouseItem[0];
        blank.id = primary.id;
        blank.created_at = primary.created_at || new Date().toISOString();
        duplicateIds = sameWarehouseItem.slice(1).map(b => b.id).filter(Boolean);
    } else {
        duplicateIds = sameWarehouseItem.map(b => b.id).filter(Boolean);
    }

    if (!blank.id) {
        blank.id = Date.now();
        blank.created_at = new Date().toISOString();
    } else if (!blank.created_at) {
        const existing = localBlanks.find(b => Number(b.id) === Number(blank.id));
        if (existing?.created_at) blank.created_at = existing.created_at;
    }
    blank.updated_at = new Date().toISOString();

    if (isSupabaseReady()) {
        try {
            const row = { id: blank.id, name: blank.name || '', blank_data: JSON.stringify(blank), created_at: blank.created_at, updated_at: blank.updated_at };
            const { error } = await supabaseClient.from('hw_blanks').upsert(row, { onConflict: 'id' });
            if (error) console.error('saveHwBlank error:', error);
            if (duplicateIds.length > 0) {
                await _deleteHwBlankIds(duplicateIds);
            }
        } catch(e) { console.error('saveHwBlank exception:', e); }
    }

    let blanks = getLocal(LOCAL_KEYS.hwBlanks) || [];
    if (duplicateIds.length > 0) {
        const duplicateSet = new Set(duplicateIds.map(Number));
        blanks = blanks.filter(b => !duplicateSet.has(Number(b.id)));
    }
    const idx = blanks.findIndex(b => b.id === blank.id);
    if (idx >= 0) blanks[idx] = blank; else blanks.push(blank);
    const { blanks: deduped } = _dedupeHwBlanks(blanks);
    setLocal(LOCAL_KEYS.hwBlanks, deduped);
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

function _isWarehouseHwBlank(blank) {
    if (!blank) return false;
    if (blank.hw_form_source) return blank.hw_form_source === 'warehouse';
    return !!blank.warehouse_item_id;
}

function _hwBlankFreshness(blank) {
    return Date.parse(blank?.updated_at || blank?.created_at || '') || Number(blank?.id || 0) || 0;
}

function _compareHwBlankFreshnessDesc(a, b) {
    return _hwBlankFreshness(b) - _hwBlankFreshness(a);
}

function _dedupeHwBlanks(blanks) {
    const winners = new Map();
    const duplicateIds = [];

    (Array.isArray(blanks) ? blanks : []).forEach(blank => {
        if (!blank || !blank.id) return;
        const isWarehouse = _isWarehouseHwBlank(blank);
        const key = isWarehouse && Number(blank.warehouse_item_id || 0) > 0
            ? `warehouse:${Number(blank.warehouse_item_id)}`
            : `id:${Number(blank.id)}`;
        const current = winners.get(key);
        if (!current) {
            winners.set(key, blank);
            return;
        }
        if (_compareHwBlankFreshnessDesc(blank, current) > 0) {
            duplicateIds.push(blank.id);
            return;
        }
        duplicateIds.push(current.id);
        winners.set(key, blank);
    });

    return {
        blanks: Array.from(winners.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru')),
        duplicateIds,
    };
}

async function _deleteHwBlankIds(blankIds) {
    const ids = [...new Set((blankIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return;
    if (isSupabaseReady()) {
        try {
            const { error } = await supabaseClient.from('hw_blanks').delete().in('id', ids);
            if (error) console.error('delete duplicate hw_blanks error:', error);
        } catch (e) {
            console.error('delete duplicate hw_blanks exception:', e);
        }
    }
    const remaining = (getLocal(LOCAL_KEYS.hwBlanks) || []).filter(b => !ids.includes(Number(b.id)));
    setLocal(LOCAL_KEYS.hwBlanks, remaining);
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

// =============================================
// READY GOODS (Готовая продукция)
// =============================================

function _isSupabaseMissingTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'PGRST205'
        || message.includes("Could not find the table 'public.");
}

const READY_GOODS_SETTINGS_KEYS = Object.freeze({
    ready_goods: 'ready_goods_stock_json',
    ready_goods_history: 'ready_goods_history_json',
    sales_records: 'ready_goods_sales_records_json',
});

const READY_GOODS_SOURCE_SHARED = 'shared-settings';
const READY_GOODS_SOURCE_LOCAL = 'local-cache';
const READY_GOODS_SOURCE_UNAVAILABLE = 'shared-unavailable';

const _readyGoodsSourceStatus = {
    ready_goods: { source: READY_GOODS_SOURCE_UNAVAILABLE, detail: 'bootstrap', updated_at: null },
    ready_goods_history: { source: READY_GOODS_SOURCE_UNAVAILABLE, detail: 'bootstrap', updated_at: null },
    sales_records: { source: READY_GOODS_SOURCE_UNAVAILABLE, detail: 'bootstrap', updated_at: null },
};

function _cloneReadyGoodsPayload(value) {
    if (Array.isArray(value)) return value.map(item => (item && typeof item === 'object') ? { ...item } : item);
    if (value && typeof value === 'object') return { ...value };
    return value;
}

function _normalizeReadyGoodsPayload(value, fallbackValue = []) {
    if (Array.isArray(fallbackValue)) return Array.isArray(value) ? value : _cloneReadyGoodsPayload(fallbackValue);
    if (fallbackValue && typeof fallbackValue === 'object') return (value && typeof value === 'object') ? value : _cloneReadyGoodsPayload(fallbackValue);
    return value == null ? fallbackValue : value;
}

function _setReadyGoodsSourceStatus(storeKey, source, detail) {
    if (!storeKey) return;
    _readyGoodsSourceStatus[storeKey] = {
        source: source || READY_GOODS_SOURCE_LOCAL,
        detail: detail || '',
        updated_at: new Date().toISOString(),
    };
}

function getReadyGoodsSourceStatus() {
    return {
        ready_goods: { ..._readyGoodsSourceStatus.ready_goods },
        ready_goods_history: { ..._readyGoodsSourceStatus.ready_goods_history },
        sales_records: { ..._readyGoodsSourceStatus.sales_records },
    };
}

async function _loadReadyGoodsStore(storeKey, localKey, fallbackValue = []) {
    const safeFallback = _cloneReadyGoodsPayload(fallbackValue);
    if (isSupabaseReady() && !_hasSupabaseAccessProblem()) {
        const remote = await _loadJsonSetting(READY_GOODS_SETTINGS_KEYS[storeKey], null);
        if (remote !== null) {
            const normalized = _normalizeReadyGoodsPayload(remote, safeFallback);
            setLocal(localKey, normalized);
            _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_SHARED, 'remote');
            return normalized;
        }

        const seedPayload = _cloneReadyGoodsPayload(safeFallback);
        await _saveJsonSetting(READY_GOODS_SETTINGS_KEYS[storeKey], seedPayload);
        if (!_hasSupabaseAccessProblem()) {
            _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_SHARED, 'seeded-empty');
            setLocal(localKey, seedPayload);
            return seedPayload;
        } else {
            _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_UNAVAILABLE, 'shared-unavailable');
            return _cloneReadyGoodsPayload(safeFallback);
        }
    }

    _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_UNAVAILABLE, isSupabaseReady() ? 'shared-unavailable' : 'shared-required');
    return _cloneReadyGoodsPayload(safeFallback);
}

async function _saveReadyGoodsStore(storeKey, localKey, payload, fallbackValue = []) {
    const normalized = _normalizeReadyGoodsPayload(payload, fallbackValue);
    if (isSupabaseReady() && !_hasSupabaseAccessProblem()) {
        await _saveJsonSetting(READY_GOODS_SETTINGS_KEYS[storeKey], normalized);
        if (!_hasSupabaseAccessProblem()) {
            setLocal(localKey, normalized);
            _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_SHARED, 'remote');
        } else {
            _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_UNAVAILABLE, 'shared-unavailable');
            throw new Error('READY_GOODS_SHARED_UNAVAILABLE');
        }
        return normalized;
    }

    _setReadyGoodsSourceStatus(storeKey, READY_GOODS_SOURCE_UNAVAILABLE, isSupabaseReady() ? 'shared-unavailable' : 'shared-required');
    throw new Error('READY_GOODS_SHARED_UNAVAILABLE');
}

async function loadReadyGoods() {
    return _loadReadyGoodsStore('ready_goods', LOCAL_KEYS.readyGoods, []);
}

async function saveReadyGoods(items) {
    await _saveReadyGoodsStore('ready_goods', LOCAL_KEYS.readyGoods, items, []);
}

async function loadReadyGoodsHistory() {
    return _loadReadyGoodsStore('ready_goods_history', LOCAL_KEYS.readyGoodsHistory, []);
}

async function saveReadyGoodsHistory(history) {
    await _saveReadyGoodsStore('ready_goods_history', LOCAL_KEYS.readyGoodsHistory, history, []);
}

// =============================================
// SALES RECORDS (Записи продаж)
// =============================================

async function loadSalesRecords() {
    return _loadReadyGoodsStore('sales_records', LOCAL_KEYS.salesRecords, []);
}

async function saveSalesRecords(records) {
    await _saveReadyGoodsStore('sales_records', LOCAL_KEYS.salesRecords, records, []);
}

// =============================================
// INDIRECT COSTS (monthly breakdown)
// =============================================

function loadIndirectCostsData() {
    return getLocal(LOCAL_KEYS.indirectCosts) || {};
}

function saveIndirectCostsData(data) {
    setLocal(LOCAL_KEYS.indirectCosts, data);
}

// =============================================
// WORK MANAGEMENT (Projects / Tasks / Areas)
// =============================================

let _workBootstrapPromise = null;

function _workCore() {
    return (typeof WorkManagementCore !== 'undefined') ? WorkManagementCore : null;
}

function _toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function _mergeLocalEntityRow(localKey, row, keyField) {
    const list = getLocal(localKey) || [];
    const idx = list.findIndex(item => String(item?.[keyField]) === String(row?.[keyField]));
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    setLocal(localKey, list);
    return row;
}

function _bulkMergeLocalEntityRows(localKey, rows, keyField) {
    const list = getLocal(localKey) || [];
    const next = list.slice();
    (rows || []).forEach(row => {
        const idx = next.findIndex(item => String(item?.[keyField]) === String(row?.[keyField]));
        if (idx >= 0) next[idx] = { ...next[idx], ...row };
        else next.push(row);
    });
    setLocal(localKey, next);
    return next;
}

function _removeLocalEntityRow(localKey, matchFn) {
    const list = getLocal(localKey) || [];
    const next = list.filter(item => !matchFn(item));
    setLocal(localKey, next);
    return next;
}

function _sortRows(rows, field, ascending) {
    return (rows || []).slice().sort((a, b) => {
        const av = a?.[field];
        const bv = b?.[field];
        if (av === bv) return 0;
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        const cmp = String(av).localeCompare(String(bv), 'ru', { numeric: true });
        return ascending ? cmp : -cmp;
    });
}

function _mergeWorkRows(existingRows, incomingRows, conflictKey) {
    const keys = String(conflictKey || 'id')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    const next = Array.isArray(existingRows) ? existingRows.slice() : [];
    (incomingRows || []).forEach(row => {
        const idx = next.findIndex(item => keys.every(key => String(item?.[key]) === String(row?.[key])));
        if (idx < 0) {
            next.push(row);
            return;
        }
        const current = next[idx] || {};
        const currentUpdatedAt = Date.parse(String(current.updated_at || current.created_at || '')) || 0;
        const incomingUpdatedAt = Date.parse(String(row?.updated_at || row?.created_at || '')) || 0;
        next[idx] = incomingUpdatedAt >= currentUpdatedAt
            ? { ...current, ...row }
            : { ...row, ...current };
    });
    return next;
}

let _workModuleRemoteAvailable = null;

function _workSettingsKey(table) {
    return WORK_SETTINGS_KEYS[table] || null;
}

function _workOnConflictKey(table) {
    return WORK_TABLE_ON_CONFLICT[table] || 'id';
}

function _isOptionalWorkModuleTable(table) {
    return OPTIONAL_WORK_MODULE_TABLES.has(table);
}

function _rememberOptionalWorkTableMissing(table) {
    if (_isOptionalWorkModuleTable(table)) _missingOptionalWorkTables.add(table);
}

function _clearOptionalWorkTableMissing(table) {
    if (_isOptionalWorkModuleTable(table)) _missingOptionalWorkTables.delete(table);
}

function _shouldSkipOptionalWorkTableRemote(table) {
    return _isOptionalWorkModuleTable(table) && _missingOptionalWorkTables.has(table);
}

function _isWorkModuleMissingTableError(error) {
    return _isSupabaseMissingTableError(error);
}

function _markWorkModuleRemoteUnavailable(error) {
    if (_workModuleRemoteAvailable === false) return;
    const message = String(error?.message || error || '').toLowerCase();
    if (message.includes('timeout')) {
        _workModuleRemoteAvailable = false;
        console.warn('Work management remote timed out. Using local fallback for this module.', error);
        return;
    }
    if (_isSupabaseAccessError(error)) {
        _workModuleRemoteAvailable = false;
        _markSupabaseAccessProblem(error);
        console.warn('Work management remote is unavailable because Supabase access failed. Using local fallback for this module.');
        return;
    }
    if (_isWorkModuleMissingTableError(error)) {
        _workModuleRemoteAvailable = false;
        console.warn('Work management tables are not available in Supabase yet. Using local fallback for this module.');
    }
}

function _canUseWorkModuleRemote() {
    return isSupabaseReady() && !_hasSupabaseAccessProblem() && _workModuleRemoteAvailable !== false;
}

function _remoteTimeoutMs(kind = 'load') {
    const fallback = kind === 'write' ? 5000 : 5000;
    const key = kind === 'write' ? '__RO_REMOTE_WRITE_TIMEOUT_MS' : '__RO_REMOTE_LOAD_TIMEOUT_MS';
    if (typeof window !== 'undefined') {
        const value = Number(window[key]);
        if (Number.isFinite(value) && value > 0) return value;
    }
    return fallback;
}

function _remoteTimeoutError(label, timeoutMs) {
    const error = new Error(`timeout (${label}, ${timeoutMs}ms)`);
    error.code = 'timeout';
    error.timeoutMs = timeoutMs;
    error.operation = label;
    return error;
}

async function _withRemoteTimeout(kind, label, executor) {
    const timeoutMs = _remoteTimeoutMs(kind);
    return Promise.race([
        Promise.resolve().then(executor),
        new Promise((_, reject) => setTimeout(() => reject(_remoteTimeoutError(label, timeoutMs)), timeoutMs)),
    ]);
}

async function _loadJsonSetting(settingKey, fallbackValue) {
    const fallback = fallbackValue === undefined ? null : fallbackValue;
    if (!isSupabaseReady() || !settingKey) return fallback;
    try {
        const { data, error } = await _withRemoteTimeout('load', `load setting ${settingKey}`, () => supabaseClient
            .from('settings')
            .select('value')
            .eq('key', settingKey)
            .maybeSingle());
        if (error) {
            console.error(`load setting ${settingKey} error:`, error);
            if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
            return fallback;
        }
        if (!data || !data.value) return fallback;
        return JSON.parse(data.value);
    } catch (error) {
        console.error(`load setting ${settingKey} exception:`, error);
        if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
        return fallback;
    }
}

async function _saveJsonSetting(settingKey, value) {
    if (!isSupabaseReady() || !settingKey) return value;
    try {
        const { error } = await _withRemoteTimeout('write', `save setting ${settingKey}`, () => supabaseClient
            .from('settings')
            .upsert({
                key: settingKey,
                value: JSON.stringify(value),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' }));
        if (error) {
            console.error(`save setting ${settingKey} error:`, error);
            if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
        }
    } catch (error) {
        console.error(`save setting ${settingKey} exception:`, error);
        if (_isSupabaseAccessError(error)) _markSupabaseAccessProblem(error);
    }
    return value;
}

async function _loadWorkTableRows(table, localKey, orderBy, ascending) {
    const settingsKey = _workSettingsKey(table);
    const conflictKey = _workOnConflictKey(table);
    let remoteTableMissing = _shouldSkipOptionalWorkTableRemote(table);
    if (_canUseWorkModuleRemote() && !remoteTableMissing) {
        try {
            let query = supabaseClient.from(table).select('*');
            if (orderBy) query = query.order(orderBy, { ascending: !!ascending });
            const { data, error } = await query;
            if (!error && Array.isArray(data)) {
                _workModuleRemoteAvailable = true;
                _clearOptionalWorkTableMissing(table);
                if (data.length === 0 && settingsKey) {
                    const stagedRows = await _loadJsonSetting(settingsKey, []);
                    if (Array.isArray(stagedRows) && stagedRows.length > 0) {
                        await _upsertWorkTableRows(table, localKey, stagedRows, _workOnConflictKey(table));
                        const hydrated = orderBy ? _sortRows(stagedRows, orderBy, ascending) : stagedRows;
                        setLocal(localKey, hydrated);
                        return hydrated;
                    }
                }
                setLocal(localKey, data);
                return data;
            }
            if (error) {
                if (_isWorkModuleMissingTableError(error) && _isOptionalWorkModuleTable(table)) {
                    remoteTableMissing = true;
                    _rememberOptionalWorkTableMissing(table);
                } else {
                    _markWorkModuleRemoteUnavailable(error);
                    if (!_isWorkModuleMissingTableError(error)) console.error(`load ${table} error:`, error);
                }
            }
        } catch (e) {
            console.error(`load ${table} exception:`, e);
        }
    }
    const local = getLocal(localKey) || [];
    if (settingsKey && isSupabaseReady()) {
        const remoteFallback = await _loadJsonSetting(settingsKey, null);
        if (Array.isArray(remoteFallback)) {
            if (remoteFallback.length === 0 && local.length > 0) {
                await _saveJsonSetting(settingsKey, local);
                return orderBy ? _sortRows(local, orderBy, ascending) : local;
            }
            const mergedFallback = local.length > 0
                ? _mergeWorkRows(remoteFallback, local, conflictKey)
                : remoteFallback;
            if (local.length > 0 && remoteTableMissing) {
                await _saveJsonSetting(settingsKey, mergedFallback);
            }
            setLocal(localKey, mergedFallback);
            return orderBy ? _sortRows(mergedFallback, orderBy, ascending) : mergedFallback;
        }
        if (local.length > 0 || remoteTableMissing) {
            await _saveJsonSetting(settingsKey, local);
        }
    }
    return orderBy ? _sortRows(local, orderBy, ascending) : local;
}

async function _upsertWorkTableRows(table, localKey, rows, onConflict) {
    const payload = Array.isArray(rows) ? rows : [rows];
    if (payload.length === 0) return [];
    const conflictKey = onConflict || _workOnConflictKey(table);
    const settingsKey = _workSettingsKey(table);
    let remoteTableMissing = _shouldSkipOptionalWorkTableRemote(table);
    if (_canUseWorkModuleRemote() && !remoteTableMissing) {
        try {
            const { error } = await _withRemoteTimeout('write', `upsert ${table}`, () => supabaseClient
                .from(table)
                .upsert(payload, { onConflict: conflictKey }));
            if (error) {
                if (_isWorkModuleMissingTableError(error) && _isOptionalWorkModuleTable(table)) {
                    remoteTableMissing = true;
                    _rememberOptionalWorkTableMissing(table);
                } else {
                    _markWorkModuleRemoteUnavailable(error);
                    if (!_isWorkModuleMissingTableError(error)) console.error(`upsert ${table} error:`, error);
                }
            } else {
                _workModuleRemoteAvailable = true;
                _clearOptionalWorkTableMissing(table);
            }
    } catch (e) {
        console.error(`upsert ${table} exception:`, e);
        _markWorkModuleRemoteUnavailable(e);
    }
    }
    if (conflictKey && conflictKey !== 'id') {
        const keys = conflictKey.split(',').map(part => part.trim()).filter(Boolean);
        const list = getLocal(localKey) || [];
        const next = list.slice();
        payload.forEach(row => {
            const idx = next.findIndex(item => keys.every(key => String(item?.[key]) === String(row?.[key])));
            if (idx >= 0) next[idx] = { ...next[idx], ...row };
            else next.push(row);
        });
        setLocal(localKey, next);
        if ((!_canUseWorkModuleRemote() || remoteTableMissing) && settingsKey) {
            const staged = await _loadJsonSetting(settingsKey, []);
            const mergedFallback = Array.isArray(staged) ? _mergeWorkRows(staged, next, conflictKey) : next;
            await _saveJsonSetting(settingsKey, mergedFallback);
        }
        return payload;
    }
    const merged = _bulkMergeLocalEntityRows(localKey, payload, 'id');
    if ((!_canUseWorkModuleRemote() || remoteTableMissing) && settingsKey) {
        const staged = await _loadJsonSetting(settingsKey, []);
        const mergedFallback = Array.isArray(staged) ? _mergeWorkRows(staged, merged, conflictKey) : merged;
        await _saveJsonSetting(settingsKey, mergedFallback);
    }
    return payload;
}

async function _deleteWorkTableRow(table, localKey, rowId) {
    const settingsKey = _workSettingsKey(table);
    if (_canUseWorkModuleRemote()) {
        try {
            const { error } = await _withRemoteTimeout('write', `delete ${table}`, () => supabaseClient.from(table).delete().eq('id', rowId));
            if (error) {
                _markWorkModuleRemoteUnavailable(error);
                if (!_isWorkModuleMissingTableError(error)) console.error(`delete ${table} error:`, error);
            } else {
                _workModuleRemoteAvailable = true;
            }
        } catch (e) {
            console.error(`delete ${table} exception:`, e);
            _markWorkModuleRemoteUnavailable(e);
        }
    }
    const next = _removeLocalEntityRow(localKey, item => String(item?.id) === String(rowId));
    if (!_canUseWorkModuleRemote() && settingsKey) await _saveJsonSetting(settingsKey, next);
}

function _buildEmployeeMaps(employees, authAccounts) {
    const core = _workCore();
    const normalize = core ? core.normalizeText : (value => String(value || '').trim().toLowerCase());
    const byName = new Map();
    const byLogin = new Map();
    (employees || []).forEach(emp => {
        byName.set(normalize(emp.name), emp);
    });
    (authAccounts || []).forEach(account => {
        const employee = (employees || []).find(emp => String(emp.id) === String(account.employee_id));
        if (employee && account.username) {
            byLogin.set(normalize(account.username), employee);
        }
    });
    return { byName, byLogin };
}

function _resolveEmployeeToken(token, employeeMaps) {
    const core = _workCore();
    const normalize = core ? core.normalizeText : (value => String(value || '').trim().toLowerCase());
    const normalized = normalize(token);
    if (!normalized) return null;
    if (employeeMaps.byName.has(normalized)) return employeeMaps.byName.get(normalized);
    if (employeeMaps.byLogin.has(normalized)) return employeeMaps.byLogin.get(normalized);
    for (const employee of employeeMaps.byName.values()) {
        const empName = normalize(employee.name);
        if (empName.includes(normalized) || normalized.includes(empName)) return employee;
    }
    return null;
}

function _resolvePersonFromPayload(personId, personName, employeesById) {
    const employee = personId != null ? employeesById.get(String(personId)) : null;
    return employee ? employee.name : (personName || '');
}

async function loadWorkAreas() {
    const core = _workCore();
    let areas = await _loadWorkTableRows('areas', LOCAL_KEYS.workAreas, 'name', true);
    if (areas.length > 0) return areas;
    const seeds = (core?.AREA_SEEDS || []).map(seed => ({
        id: seed.id,
        slug: seed.slug,
        name: seed.name,
        color: seed.color || '#6b7280',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));
    if (seeds.length > 0) {
        await _upsertWorkTableRows('areas', LOCAL_KEYS.workAreas, seeds, 'id');
        areas = await _loadWorkTableRows('areas', LOCAL_KEYS.workAreas, 'name', true);
    }
    return areas;
}

function findAreaBySlug(slug, areas) {
    const core = _workCore();
    const normalize = core ? core.normalizeText : (value => String(value || '').trim().toLowerCase());
    return (areas || []).find(area => normalize(area.slug) === normalize(slug)) || null;
}

async function loadWorkTemplatesV2() {
    const core = _workCore();
    let templates = await _loadWorkTableRows('work_templates', LOCAL_KEYS.workTemplatesV2, 'name', true);
    if (templates.length > 0) return templates;
    const areas = await loadWorkAreas();
    const seeded = (core?.TEMPLATE_SEEDS || []).map((seed, index) => ({
        id: 9200 + index + 1,
        kind: seed.kind,
        name: seed.name,
        title: seed.title || seed.name,
        project_type: seed.project_type || null,
        description: seed.description || '',
        default_priority: seed.default_priority || 'normal',
        suggested_area_id: findAreaBySlug(seed.suggested_area_slug, areas)?.id || null,
        checklist_items: seed.checklist_items || [],
        suggested_subtasks: seed.suggested_subtasks || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));
    if (seeded.length > 0) {
        await _upsertWorkTableRows('work_templates', LOCAL_KEYS.workTemplatesV2, seeded, 'id');
        templates = await _loadWorkTableRows('work_templates', LOCAL_KEYS.workTemplatesV2, 'name', true);
    }
    return templates;
}

async function saveWorkTemplate(template) {
    const core = _workCore();
    const nowIso = new Date().toISOString();
    const existing = template?.id
        ? (await _loadWorkTableRows('work_templates', LOCAL_KEYS.workTemplatesV2, 'name', true))
            .find(item => String(item.id) === String(template.id))
        : null;
    const checklistItems = Array.isArray(template?.checklist_items)
        ? template.checklist_items
        : String(template?.checklist_items || '')
            .split('\n')
            .map(item => String(item || '').trim())
            .filter(Boolean);
    const suggestedSubtasks = Array.isArray(template?.suggested_subtasks)
        ? template.suggested_subtasks
        : String(template?.suggested_subtasks || '')
            .split('\n')
            .map(item => String(item || '').trim())
            .filter(Boolean);
    const row = {
        id: template?.id || core.generateEntityId(),
        kind: 'task',
        name: String(template?.name || existing?.name || '').trim(),
        title: String(template?.title || existing?.title || '').trim(),
        project_type: null,
        description: String(template?.description || existing?.description || '').trim(),
        default_priority: template?.default_priority || existing?.default_priority || 'normal',
        suggested_area_id: _toNumberOrNull(template?.suggested_area_id ?? existing?.suggested_area_id),
        checklist_items: checklistItems,
        suggested_subtasks: suggestedSubtasks,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
    };
    if (!row.name) throw new Error('Укажите название шаблона');
    if (!row.title) throw new Error('Укажите название задачи в шаблоне');
    await _upsertWorkTableRows('work_templates', LOCAL_KEYS.workTemplatesV2, row, 'id');
    return row;
}

async function deleteWorkTemplate(templateId) {
    await _deleteWorkTableRow('work_templates', LOCAL_KEYS.workTemplatesV2, templateId);
}

async function loadWorkProjects() {
    return _loadWorkTableRows('projects', LOCAL_KEYS.workProjects, 'updated_at', false);
}

async function loadWorkProject(projectId) {
    const list = await loadWorkProjects();
    return list.find(project => String(project.id) === String(projectId)) || null;
}

async function loadWorkTasks() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('tasks', LOCAL_KEYS.workTasks, 'updated_at', false);
}

async function loadBugReports() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, 'updated_at', false);
}

async function loadTaskComments() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('task_comments', LOCAL_KEYS.taskComments, 'created_at', true);
}

async function loadWorkAssets() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('work_assets', LOCAL_KEYS.workAssets, 'created_at', true);
}

async function loadTaskChecklistItems() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('task_checklist_items', LOCAL_KEYS.taskChecklistItems, 'sort_index', true);
}

async function loadTaskWatchers() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('task_watchers', LOCAL_KEYS.taskWatchers, 'task_id', true);
}

async function loadWorkActivity() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('work_activity', LOCAL_KEYS.workActivity, 'created_at', false);
}

async function loadTaskNotificationEvents() {
    await ensureWorkManagementBootstrap();
    return _loadWorkTableRows('task_notification_events', LOCAL_KEYS.taskNotificationEvents, 'created_at', false);
}

async function appendWorkActivity(entry) {
    const core = _workCore();
    const row = {
        id: entry.id || core.generateEntityId(),
        task_id: _toNumberOrNull(entry.task_id),
        project_id: _toNumberOrNull(entry.project_id),
        order_id: _toNumberOrNull(entry.order_id),
        author_id: _toNumberOrNull(entry.author_id),
        author_name: entry.author_name || '',
        activity_type: entry.activity_type || 'note',
        message: entry.message || '',
        metadata: entry.metadata || {},
        created_at: entry.created_at || new Date().toISOString(),
        updated_at: entry.updated_at || new Date().toISOString(),
    };
    await _upsertWorkTableRows('work_activity', LOCAL_KEYS.workActivity, row, 'id');
    return row;
}

async function appendTaskNotificationEvent(event) {
    const core = _workCore();
    const row = {
        id: event.id || core.generateEntityId(),
        task_id: _toNumberOrNull(event.task_id),
        project_id: _toNumberOrNull(event.project_id),
        event_type: event.event_type || '',
        payload: event.payload || {},
        created_at: event.created_at || new Date().toISOString(),
        processed_at: event.processed_at || null,
    };
    await _upsertWorkTableRows('task_notification_events', LOCAL_KEYS.taskNotificationEvents, row, 'id');
    return row;
}

async function saveWorkProject(project, actor) {
    const core = _workCore();
    const nowIso = new Date().toISOString();
    const existing = project?.id ? await loadWorkProject(project.id) : null;
    const employees = await loadEmployees();
    const employeesById = new Map((employees || []).map(emp => [String(emp.id), emp]));
    const orders = await loadOrders({});
    const order = (orders || []).find(item => String(item.id) === String(project.linked_order_id || existing?.linked_order_id || ''));
    const ownerId = _toNumberOrNull(project.owner_id ?? existing?.owner_id);
    const createdById = _toNumberOrNull(project.created_by ?? existing?.created_by ?? actor?.id ?? App?.currentEmployeeId);
    const row = {
        id: project.id || core.generateEntityId(),
        title: String(project.title || existing?.title || '').trim(),
        type: String(project.type || existing?.type || 'Другое').trim(),
        owner_id: ownerId,
        owner_name: _resolvePersonFromPayload(ownerId, project.owner_name || existing?.owner_name || '', employeesById),
        linked_order_id: _toNumberOrNull(project.linked_order_id ?? existing?.linked_order_id),
        linked_order_name: order?.order_name || project.linked_order_name || existing?.linked_order_name || '',
        area_id: _toNumberOrNull(project.area_id ?? existing?.area_id),
        start_date: project.start_date || existing?.start_date || null,
        due_date: project.due_date || existing?.due_date || null,
        launch_at: project.launch_at || existing?.launch_at || null,
        status: project.status || existing?.status || 'active',
        brief: project.brief || existing?.brief || '',
        goal: project.goal || existing?.goal || '',
        result_summary: project.result_summary || existing?.result_summary || '',
        created_by: createdById,
        created_by_name: _resolvePersonFromPayload(createdById, project.created_by_name || existing?.created_by_name || actor?.name || App?.getCurrentEmployeeName?.() || '', employeesById),
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
    };
    await _upsertWorkTableRows('projects', LOCAL_KEYS.workProjects, row, 'id');

    const authorName = actor?.name || App?.getCurrentEmployeeName?.() || row.created_by_name || 'Система';
    if (!existing) {
        await appendWorkActivity({
            project_id: row.id,
            order_id: row.linked_order_id,
            author_id: actor?.id || App?.currentEmployeeId || null,
            author_name: authorName,
            activity_type: 'project_created',
            message: `Создан проект «${row.title}».`,
        });
    } else {
        const changedFields = [];
        ['title', 'type', 'status', 'due_date', 'launch_at', 'owner_id', 'linked_order_id', 'area_id'].forEach(field => {
            if (String(existing[field] ?? '') !== String(row[field] ?? '')) changedFields.push(field);
        });
        if (changedFields.length > 0) {
            await appendWorkActivity({
                project_id: row.id,
                order_id: row.linked_order_id,
                author_id: actor?.id || App?.currentEmployeeId || null,
                author_name: authorName,
                activity_type: 'project_updated',
                message: `Обновлён проект «${row.title}».`,
                metadata: { changed_fields: changedFields },
            });
        }
    }
    return row;
}

async function saveTaskComment(comment) {
    const core = _workCore();
    const employees = await loadEmployees();
    const employee = (employees || []).find(item => String(item.id) === String(comment.author_id || App?.currentEmployeeId || ''));
    const mentions = Array.isArray(comment.mentions)
        ? comment.mentions
        : core.extractMentionedEmployeeIds(comment.body, employees);
    const row = {
        id: comment.id || core.generateEntityId(),
        task_id: _toNumberOrNull(comment.task_id),
        author_id: _toNumberOrNull(comment.author_id ?? App?.currentEmployeeId),
        author_name: comment.author_name || employee?.name || App?.getCurrentEmployeeName?.() || '',
        body: String(comment.body || '').trim(),
        mentions: mentions,
        created_at: comment.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    await _upsertWorkTableRows('task_comments', LOCAL_KEYS.taskComments, row, 'id');

    const tasks = getLocal(LOCAL_KEYS.workTasks) || [];
    const task = tasks.find(item => String(item.id) === String(row.task_id));
    await appendWorkActivity({
        task_id: row.task_id,
        project_id: task?.project_id || null,
        order_id: task?.order_id || null,
        author_id: row.author_id,
        author_name: row.author_name,
        activity_type: 'comment_added',
        message: 'Добавлен комментарий.',
        metadata: { comment_id: row.id },
    });

    return row;
}

async function saveWorkAsset(asset) {
    const core = _workCore();
    const employees = await loadEmployees();
    const employee = (employees || []).find(item => String(item.id) === String(asset.created_by || App?.currentEmployeeId || ''));
    const row = {
        id: asset.id || core.generateEntityId(),
        task_id: _toNumberOrNull(asset.task_id),
        project_id: _toNumberOrNull(asset.project_id),
        kind: asset.kind || 'link',
        title: asset.title || '',
        url: asset.url || '',
        file_name: asset.file_name || '',
        file_type: asset.file_type || '',
        file_size: asset.file_size || 0,
        data_url: asset.data_url || '',
        preview_meta: asset.preview_meta || {},
        created_by: _toNumberOrNull(asset.created_by ?? App?.currentEmployeeId),
        created_by_name: asset.created_by_name || employee?.name || App?.getCurrentEmployeeName?.() || '',
        created_at: asset.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    await _upsertWorkTableRows('work_assets', LOCAL_KEYS.workAssets, row, 'id');

    const tasks = getLocal(LOCAL_KEYS.workTasks) || [];
    const task = row.task_id ? tasks.find(item => String(item.id) === String(row.task_id)) : null;
    await appendWorkActivity({
        task_id: row.task_id,
        project_id: row.project_id || task?.project_id || null,
        order_id: task?.order_id || null,
        author_id: row.created_by,
        author_name: row.created_by_name,
        activity_type: 'asset_added',
        message: row.kind === 'file' ? 'Добавлен файл.' : 'Добавлена ссылка.',
        metadata: { asset_id: row.id, kind: row.kind },
    });

    return row;
}

async function deleteWorkAsset(assetId) {
    await _deleteWorkTableRow('work_assets', LOCAL_KEYS.workAssets, assetId);
}

async function saveBugReport(report, options = {}) {
    await ensureWorkManagementBootstrap();
    const existing = (getLocal(LOCAL_KEYS.bugReports) || []).find(item =>
        String(item.task_id || '') === String(report?.task_id || '')
    );
    const row = {
        id: _toNumberOrNull(report.id) || existing?.id || Date.now() + Math.floor(Math.random() * 1000),
        task_id: _toNumberOrNull(report.task_id),
        title: String(report.title || existing?.title || '').trim(),
        section_key: String(report.section_key || existing?.section_key || '').trim(),
        section_name: String(report.section_name || existing?.section_name || '').trim(),
        subsection_key: String(report.subsection_key || existing?.subsection_key || '').trim(),
        subsection_name: String(report.subsection_name || existing?.subsection_name || '').trim(),
        page_route: String(report.page_route || existing?.page_route || '').trim(),
        page_url: String(report.page_url || existing?.page_url || '').trim(),
        app_version: String(report.app_version || existing?.app_version || '').trim(),
        browser: String(report.browser || existing?.browser || '').trim(),
        os: String(report.os || existing?.os || '').trim(),
        viewport: String(report.viewport || existing?.viewport || '').trim(),
        steps_to_reproduce: String(report.steps_to_reproduce || existing?.steps_to_reproduce || '').trim(),
        expected_result: String(report.expected_result || existing?.expected_result || '').trim(),
        actual_result: String(report.actual_result || existing?.actual_result || '').trim(),
        severity: String(report.severity || existing?.severity || 'medium').trim() || 'medium',
        codex_prompt: String(report.codex_prompt ?? existing?.codex_prompt ?? ''),
        codex_status: String(report.codex_status || existing?.codex_status || 'pending'),
        codex_result: String(report.codex_result ?? existing?.codex_result ?? ''),
        codex_error: String(report.codex_error ?? existing?.codex_error ?? ''),
        submitted_by: _toNumberOrNull(report.submitted_by ?? existing?.submitted_by),
        submitted_by_name: String(report.submitted_by_name || existing?.submitted_by_name || '').trim(),
        created_at: existing?.created_at || report.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    if (!row.task_id) throw new Error('Bug report must be linked to task_id');

    await _upsertWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, row, 'id');

    if (!options.skipActivity) {
        const authorId = options.actor_id ?? App?.currentEmployeeId ?? row.submitted_by;
        const authorName = options.actor_name || App?.getCurrentEmployeeName?.() || row.submitted_by_name || 'Система';
        if (!existing) {
            await appendWorkActivity({
                task_id: row.task_id,
                project_id: null,
                order_id: null,
                author_id: authorId,
                author_name: authorName,
                activity_type: 'bug_report_created',
                message: 'Создан баг-репорт.',
                metadata: { bug_report_id: row.id, severity: row.severity },
            });
        } else if (existing.codex_status !== row.codex_status && row.codex_status) {
            await appendWorkActivity({
                task_id: row.task_id,
                project_id: null,
                order_id: null,
                author_id: authorId,
                author_name: authorName,
                activity_type: 'bug_codex_status_changed',
                message: `Статус Codex обновлён: ${existing.codex_status || '—'} → ${row.codex_status}.`,
                metadata: { bug_report_id: row.id, codex_status: row.codex_status },
            });
        }
    }

    return row;
}

async function saveTaskChecklistItem(item) {
    const core = _workCore();
    const existingItems = getLocal(LOCAL_KEYS.taskChecklistItems) || [];
    const existing = item.id ? existingItems.find(entry => String(entry.id) === String(item.id)) : null;
    const forTask = existingItems.filter(entry => String(entry.task_id) === String(item.task_id));
    const nextSort = forTask.reduce((max, entry) => Math.max(max, Number(entry.sort_index) || 0), 0) + 100;
    const row = {
        id: item.id || core.generateEntityId(),
        task_id: _toNumberOrNull(item.task_id),
        title: String(item.title || '').trim(),
        is_done: !!item.is_done,
        sort_index: item.sort_index != null ? Number(item.sort_index) : (existing?.sort_index ?? nextSort),
        assignee_id: _toNumberOrNull(item.assignee_id),
        created_at: existing?.created_at || item.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    await _upsertWorkTableRows('task_checklist_items', LOCAL_KEYS.taskChecklistItems, row, 'id');
    return row;
}

async function deleteTaskChecklistItem(itemId) {
    await _deleteWorkTableRow('task_checklist_items', LOCAL_KEYS.taskChecklistItems, itemId);
}

async function saveTaskWatchers(taskId, userIds) {
    const targetTaskId = _toNumberOrNull(taskId);
    const deduped = [...new Set((userIds || []).map(id => _toNumberOrNull(id)).filter(Boolean))];
    const existing = getLocal(LOCAL_KEYS.taskWatchers) || [];
    const remaining = existing.filter(item => String(item.task_id) !== String(targetTaskId));
    const nextRows = deduped.map(userId => ({
        task_id: targetTaskId,
        user_id: userId,
        created_at: new Date().toISOString(),
    }));

    if (_canUseWorkModuleRemote()) {
        try {
            const { error: deleteError } = await supabaseClient.from('task_watchers').delete().eq('task_id', targetTaskId);
            if (deleteError) {
                _markWorkModuleRemoteUnavailable(deleteError);
                if (!_isWorkModuleMissingTableError(deleteError)) console.error('delete task_watchers error:', deleteError);
            } else {
                _workModuleRemoteAvailable = true;
            }
            if (nextRows.length > 0) {
                const { error } = await supabaseClient.from('task_watchers').upsert(nextRows, { onConflict: 'task_id,user_id' });
                if (error) {
                    _markWorkModuleRemoteUnavailable(error);
                    if (!_isWorkModuleMissingTableError(error)) console.error('upsert task_watchers error:', error);
                } else {
                    _workModuleRemoteAvailable = true;
                }
            }
        } catch (e) {
            console.error('save task_watchers exception:', e);
        }
    }
    const next = [...remaining, ...nextRows];
    setLocal(LOCAL_KEYS.taskWatchers, next);
    if (!_canUseWorkModuleRemote()) await _saveJsonSetting(_workSettingsKey('task_watchers'), next);
    return nextRows;
}

function _taskSortIndexForSave(task, existingTask, allTasks) {
    if (task.sort_index != null && task.sort_index !== '') return Number(task.sort_index) || 0;
    if (existingTask?.sort_index != null) return Number(existingTask.sort_index) || 0;
    const sameAssignee = (allTasks || []).filter(item =>
        String(item.assignee_id || '') === String(task.assignee_id || '')
        && String(item.parent_task_id || '') === String(task.parent_task_id || '')
    );
    return sameAssignee.reduce((max, item) => Math.max(max, Number(item.sort_index) || 0), 0) + 100;
}

function _taskOrderName(task, orders, projects) {
    const directOrder = (orders || []).find(order => String(order.id) === String(task.order_id || ''));
    if (directOrder) return directOrder.order_name || '';
    const project = (projects || []).find(item => String(item.id) === String(task.project_id || ''));
    if (project && project.linked_order_name) return project.linked_order_name;
    return '';
}

async function saveWorkTask(task, options = {}) {
    const core = _workCore();
    const nowIso = new Date().toISOString();
    const allTasks = getLocal(LOCAL_KEYS.workTasks) || [];
    const existing = task?.id ? allTasks.find(item => String(item.id) === String(task.id)) : null;
    const employees = await loadEmployees();
    const employeesById = new Map((employees || []).map(emp => [String(emp.id), emp]));
    const orders = await loadOrders({});
    const projects = await loadWorkProjects();
    const project = (projects || []).find(item => String(item.id) === String(task.project_id || existing?.project_id || ''));
    const reporterId = _toNumberOrNull(task.reporter_id ?? existing?.reporter_id ?? App?.currentEmployeeId);
    const assigneeId = _toNumberOrNull(task.assignee_id ?? existing?.assignee_id);
    const reviewerId = _toNumberOrNull(task.reviewer_id ?? existing?.reviewer_id);
    const row = {
        id: task.id || core.generateEntityId(),
        title: String(task.title || existing?.title || '').trim(),
        description: task.description || existing?.description || '',
        status: task.status || existing?.status || 'incoming',
        priority: task.priority || existing?.priority || 'normal',
        reporter_id: reporterId,
        reporter_name: _resolvePersonFromPayload(reporterId, task.reporter_name || existing?.reporter_name || App?.getCurrentEmployeeName?.() || '', employeesById),
        assignee_id: assigneeId,
        assignee_name: _resolvePersonFromPayload(assigneeId, task.assignee_name || existing?.assignee_name || '', employeesById),
        reviewer_id: reviewerId,
        reviewer_name: _resolvePersonFromPayload(reviewerId, task.reviewer_name || existing?.reviewer_name || '', employeesById),
        area_id: _toNumberOrNull(task.area_id ?? existing?.area_id ?? project?.area_id),
        order_id: _toNumberOrNull(task.order_id ?? existing?.order_id ?? null),
        order_name: '',
        project_id: _toNumberOrNull(task.project_id ?? existing?.project_id),
        project_title: project?.title || task.project_title || existing?.project_title || '',
        china_purchase_id: _toNumberOrNull(task.china_purchase_id ?? existing?.china_purchase_id),
        warehouse_item_id: _toNumberOrNull(task.warehouse_item_id ?? existing?.warehouse_item_id),
        primary_context_kind: task.primary_context_kind || existing?.primary_context_kind || 'area',
        due_date: task.due_date || existing?.due_date || null,
        due_time: task.due_time || existing?.due_time || null,
        waiting_for_text: task.waiting_for_text || existing?.waiting_for_text || '',
        sort_index: _taskSortIndexForSave(task, existing, allTasks),
        parent_task_id: _toNumberOrNull(task.parent_task_id ?? existing?.parent_task_id),
        completed_at: existing?.completed_at || null,
        cancelled_at: existing?.cancelled_at || null,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
    };

    row.order_name = _taskOrderName(row, orders, projects);
    row.primary_context_kind = core.ensurePrimaryContextKind(row, project);
    if (row.status === 'done') {
        row.completed_at = existing?.completed_at || nowIso;
        row.cancelled_at = null;
    } else if (row.status === 'cancelled') {
        row.cancelled_at = existing?.cancelled_at || nowIso;
        row.completed_at = null;
    } else {
        row.completed_at = null;
        row.cancelled_at = null;
    }

    await _upsertWorkTableRows('tasks', LOCAL_KEYS.workTasks, row, 'id');

    if (!options.skipActivity) {
        const authorId = options.actor_id ?? App?.currentEmployeeId ?? reporterId;
        const authorName = options.actor_name || App?.getCurrentEmployeeName?.() || row.reporter_name || 'Система';
        if (!existing) {
            await appendWorkActivity({
                task_id: row.id,
                project_id: row.project_id,
                order_id: row.order_id,
                author_id: authorId,
                author_name: authorName,
                activity_type: 'task_created',
                message: `Создана задача «${row.title}».`,
            });
        } else {
            if (existing.status !== row.status) {
                const activityType = row.status === 'review'
                    ? 'task_sent_to_review'
                    : row.status === 'done'
                        ? 'task_completed'
                        : row.status === 'cancelled'
                            ? 'task_cancelled'
                            : 'status_changed';
                await appendWorkActivity({
                    task_id: row.id,
                    project_id: row.project_id,
                    order_id: row.order_id,
                    author_id: authorId,
                    author_name: authorName,
                    activity_type: activityType,
                    message: `Статус изменён: ${core.getTaskStatusLabel(existing.status)} → ${core.getTaskStatusLabel(row.status)}.`,
                });
            }
            if (String(existing.assignee_id || '') !== String(row.assignee_id || '')) {
                await appendWorkActivity({
                    task_id: row.id,
                    project_id: row.project_id,
                    order_id: row.order_id,
                    author_id: authorId,
                    author_name: authorName,
                    activity_type: 'assignee_changed',
                    message: `Исполнитель изменён: ${existing.assignee_name || '—'} → ${row.assignee_name || '—'}.`,
                });
            }
            if (String(existing.due_date || '') !== String(row.due_date || '') || String(existing.due_time || '') !== String(row.due_time || '')) {
                await appendWorkActivity({
                    task_id: row.id,
                    project_id: row.project_id,
                    order_id: row.order_id,
                    author_id: authorId,
                    author_name: authorName,
                    activity_type: 'due_changed',
                    message: 'Срок задачи обновлён.',
                });
            }
            if (existing.priority !== row.priority) {
                await appendWorkActivity({
                    task_id: row.id,
                    project_id: row.project_id,
                    order_id: row.order_id,
                    author_id: authorId,
                    author_name: authorName,
                    activity_type: 'priority_changed',
                    message: `Приоритет изменён: ${existing.priority || '—'} → ${row.priority || '—'}.`,
                });
            }
        }
    }

    return row;
}

async function deleteWorkTask(taskId) {
    const targetId = _toNumberOrNull(taskId);
    const childTasks = (getLocal(LOCAL_KEYS.workTasks) || []).filter(item => String(item.parent_task_id || '') === String(targetId));
    for (const child of childTasks) {
        await deleteWorkTask(child.id);
    }
    let bugReportsTableMissing = false;
    if (_canUseWorkModuleRemote()) {
        try {
            const responses = await Promise.all([
                supabaseClient.from('bug_reports').delete().eq('task_id', targetId),
                supabaseClient.from('task_comments').delete().eq('task_id', targetId),
                supabaseClient.from('work_assets').delete().eq('task_id', targetId),
                supabaseClient.from('task_checklist_items').delete().eq('task_id', targetId),
                supabaseClient.from('task_watchers').delete().eq('task_id', targetId),
                supabaseClient.from('work_activity').delete().eq('task_id', targetId),
            ]);
            const firstError = responses
                .map(item => item?.error)
                .find(error => error && !(_isWorkModuleMissingTableError(error) && String(error?.message || '').includes('bug_reports')));
            const optionalBugError = responses
                .map(item => item?.error)
                .find(error => error && _isWorkModuleMissingTableError(error) && String(error?.message || '').includes('bug_reports'));
            if (optionalBugError) bugReportsTableMissing = true;
            if (firstError) {
                _markWorkModuleRemoteUnavailable(firstError);
                if (!_isWorkModuleMissingTableError(firstError)) console.error('deleteWorkTask cascade error:', firstError);
            } else {
                _workModuleRemoteAvailable = true;
            }
        } catch (e) {
            console.error('deleteWorkTask cascade exception:', e);
        }
    }
    _removeLocalEntityRow(LOCAL_KEYS.bugReports, item => String(item.task_id) === String(targetId));
    _removeLocalEntityRow(LOCAL_KEYS.taskComments, item => String(item.task_id) === String(targetId));
    _removeLocalEntityRow(LOCAL_KEYS.workAssets, item => String(item.task_id) === String(targetId));
    _removeLocalEntityRow(LOCAL_KEYS.taskChecklistItems, item => String(item.task_id) === String(targetId));
    _removeLocalEntityRow(LOCAL_KEYS.taskWatchers, item => String(item.task_id) === String(targetId));
    _removeLocalEntityRow(LOCAL_KEYS.workActivity, item => String(item.task_id) === String(targetId));
    if (!_canUseWorkModuleRemote() || bugReportsTableMissing) {
        await _saveJsonSetting(_workSettingsKey('bug_reports'), getLocal(LOCAL_KEYS.bugReports) || []);
    }
    if (!_canUseWorkModuleRemote()) {
        await _saveJsonSetting(_workSettingsKey('task_comments'), getLocal(LOCAL_KEYS.taskComments) || []);
        await _saveJsonSetting(_workSettingsKey('work_assets'), getLocal(LOCAL_KEYS.workAssets) || []);
        await _saveJsonSetting(_workSettingsKey('task_checklist_items'), getLocal(LOCAL_KEYS.taskChecklistItems) || []);
        await _saveJsonSetting(_workSettingsKey('task_watchers'), getLocal(LOCAL_KEYS.taskWatchers) || []);
        await _saveJsonSetting(_workSettingsKey('work_activity'), getLocal(LOCAL_KEYS.workActivity) || []);
    }
    await _deleteWorkTableRow('tasks', LOCAL_KEYS.workTasks, targetId);
}

async function _findOrCreateLegacyProject(projectTitle, linkedOrderId, assignee, areas, actor) {
    const core = _workCore();
    const title = String(projectTitle || '').trim();
    if (!title) return null;
    const existingProjects = await loadWorkProjects();
    const normalize = core.normalizeText;
    const found = existingProjects.find(project =>
        normalize(project.title) === normalize(title)
        && String(project.linked_order_id || '') === String(linkedOrderId || '')
    );
    if (found) return found;
    const inferredArea = findAreaBySlug(core.inferAreaSlugFromText(`${title} ${assignee || ''}`), areas);
    return saveWorkProject({
        title,
        type: 'Другое',
        owner_id: assignee?.id || null,
        owner_name: assignee?.name || assignee || '',
        linked_order_id: linkedOrderId || null,
        area_id: inferredArea?.id || null,
        status: 'active',
        brief: '',
        goal: '',
        result_summary: '',
    }, actor);
}

async function migrateLegacyTasksToWorkModule() {
    const core = _workCore();
    const existingTasks = await _loadWorkTableRows('tasks', LOCAL_KEYS.workTasks, 'updated_at', false);
    if (existingTasks.length > 0) return existingTasks;

    const legacyTasks = await loadTasks();
    if (!Array.isArray(legacyTasks) || legacyTasks.length === 0) return [];

    const areas = await loadWorkAreas();
    const orders = await loadOrders({});
    const employees = await loadEmployees();
    const authAccounts = await loadAuthAccounts();
    const employeeMaps = _buildEmployeeMaps(employees, authAccounts);
    const ordersById = new Map((orders || []).map(order => [String(order.id), order]));
    const migrationActor = {
        id: App?.currentEmployeeId || null,
        name: App?.getCurrentEmployeeName?.() || 'Миграция',
    };

    for (const legacyTask of legacyTasks) {
        const legacyAssignees = String(legacyTask.assignee || '')
            .split(',')
            .map(token => token.trim())
            .filter(Boolean);
        const assigneeEmployee = legacyAssignees.length > 0
            ? _resolveEmployeeToken(legacyAssignees[0], employeeMaps)
            : null;
        const watcherIds = legacyAssignees
            .slice(1)
            .map(token => _resolveEmployeeToken(token, employeeMaps))
            .filter(Boolean)
            .map(employee => employee.id);
        const deadline = core.parseLegacyDeadline(legacyTask.deadline);
        const orderId = _toNumberOrNull(legacyTask.order_id);
        const order = orderId != null ? ordersById.get(String(orderId)) : null;
        const project = legacyTask.project
            ? await _findOrCreateLegacyProject(legacyTask.project, orderId, assigneeEmployee || legacyAssignees[0] || '', areas, migrationActor)
            : null;
        const areaSlug = project
            ? null
            : core.inferAreaSlugFromText(`${legacyTask.title || ''} ${legacyTask.project || ''} ${legacyTask.description || ''}`);
        const area = areaSlug ? findAreaBySlug(areaSlug, areas) : findAreaBySlug('general', areas);

        const taskRow = await saveWorkTask({
            id: _toNumberOrNull(legacyTask.id) || core.generateEntityId(),
            title: legacyTask.title || 'Без названия',
            description: legacyTask.description || '',
            status: core.mapLegacyTaskStatus(legacyTask.status),
            priority: 'normal',
            reporter_id: null,
            reporter_name: 'Legacy import',
            assignee_id: assigneeEmployee?.id || null,
            assignee_name: assigneeEmployee?.name || legacyAssignees[0] || '',
            reviewer_id: null,
            reviewer_name: '',
            area_id: area?.id || findAreaBySlug('general', areas)?.id || null,
            order_id: orderId,
            order_name: order?.order_name || legacyTask.order_name || '',
            project_id: project?.id || null,
            project_title: project?.title || legacyTask.project || '',
            primary_context_kind: orderId ? 'order' : (project?.id ? 'project' : 'area'),
            due_date: deadline.due_date,
            due_time: deadline.due_time,
            waiting_for_text: '',
            completed_at: core.mapLegacyTaskStatus(legacyTask.status) === 'done' ? (legacyTask.updated_at || new Date().toISOString()) : null,
            cancelled_at: core.mapLegacyTaskStatus(legacyTask.status) === 'cancelled' ? (legacyTask.updated_at || new Date().toISOString()) : null,
            created_at: legacyTask.created_at || new Date().toISOString(),
            updated_at: legacyTask.updated_at || legacyTask.created_at || new Date().toISOString(),
        }, {
            skipActivity: true,
            actor_name: migrationActor.name,
            actor_id: migrationActor.id,
        });

        if (watcherIds.length > 0) {
            await saveTaskWatchers(taskRow.id, watcherIds);
        }

        await appendWorkActivity({
            task_id: taskRow.id,
            project_id: taskRow.project_id,
            order_id: taskRow.order_id,
            author_id: migrationActor.id,
            author_name: migrationActor.name,
            activity_type: 'legacy_import',
            message: 'Задача перенесена из старого модуля задач.',
            metadata: { legacy_task_id: legacyTask.id },
            created_at: taskRow.created_at,
            updated_at: taskRow.updated_at,
        });
    }

    return _loadWorkTableRows('tasks', LOCAL_KEYS.workTasks, 'updated_at', false);
}

async function ensureWorkManagementBootstrap() {
    if (_workBootstrapPromise) return _workBootstrapPromise;
    _workBootstrapPromise = (async () => {
        await loadWorkAreas();
        await loadWorkTemplatesV2();
        await migrateLegacyTasksToWorkModule();
        return true;
    })();
    return _workBootstrapPromise;
}

async function loadWorkBundle() {
    await ensureWorkManagementBootstrap();
    const [
        areas,
        projects,
        tasks,
        bugReports,
        comments,
        assets,
        checklistItems,
        watchers,
        activity,
        templates,
    ] = await Promise.all([
        loadWorkAreas(),
        loadWorkProjects(),
        _loadWorkTableRows('tasks', LOCAL_KEYS.workTasks, 'updated_at', false),
        _loadWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, 'updated_at', false),
        _loadWorkTableRows('task_comments', LOCAL_KEYS.taskComments, 'created_at', true),
        _loadWorkTableRows('work_assets', LOCAL_KEYS.workAssets, 'created_at', true),
        _loadWorkTableRows('task_checklist_items', LOCAL_KEYS.taskChecklistItems, 'sort_index', true),
        _loadWorkTableRows('task_watchers', LOCAL_KEYS.taskWatchers, 'task_id', true),
        _loadWorkTableRows('work_activity', LOCAL_KEYS.workActivity, 'created_at', false),
        loadWorkTemplatesV2(),
    ]);
    return { areas, projects, tasks, bugReports, comments, assets, checklistItems, watchers, activity, templates };
}

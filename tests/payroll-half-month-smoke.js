const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id = '') {
    let innerHTML = '';
    const element = {
        id,
        value: '',
        textContent: '',
        style: {},
        options: [],
        children: [],
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        focus() {},
        scrollIntoView() {},
        appendChild(child) {
            this.children.push(child);
            if (child && Object.prototype.hasOwnProperty.call(child, 'value')) {
                this.options.push(child);
            }
            return child;
        },
        remove(index) {
            this.options.splice(index, 1);
        },
    };
    Object.defineProperty(element, 'innerHTML', {
        get() {
            return innerHTML;
        },
        set(value) {
            innerHTML = String(value || '');
            if (innerHTML.includes('<option')) {
                element.options = [];
                const regex = /<option(?:\s+value="([^"]*)")?[^>]*>(.*?)<\/option>/g;
                let match;
                while ((match = regex.exec(innerHTML))) {
                    element.options.push({
                        value: match[1] || '',
                        textContent: match[2] || '',
                    });
                }
            }
        },
    });
    Object.defineProperty(element, 'selectedIndex', {
        get() {
            const idx = this.options.findIndex(option => String(option.value) === String(this.value));
            return idx >= 0 ? idx : 0;
        },
    });
    return element;
}

function createDocument() {
    const elements = new Map();
    return {
        createElement(tagName) {
            const el = createElement(tagName);
            el.tagName = String(tagName || '').toUpperCase();
            return el;
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
    };
}

function createStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
    };
}

function createContext() {
    const document = createDocument();
    const localStorage = createStorage();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Intl,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        document,
        localStorage,
        App: {
            settings: { fot_per_hour: 0, production_holidays: '' },
            isAdmin() { return true; },
            toast() {},
            formatDate(value) { return value; },
        },
        confirm: () => true,
        loadTimeEntries: async () => [],
        loadEmployees: async () => [],
        loadOrders: async () => [],
        saveTimeEntry: async (entry) => {
            context.__savedEntry = JSON.parse(JSON.stringify(entry));
            context.__savedEntries.push(JSON.parse(JSON.stringify(entry)));
            return entry.id || 1;
        },
        deleteTimeEntry: async () => {},
    };
    context.window = context;
    context.__savedEntry = null;
    context.__savedEntries = [];
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function currentMonthDate(day) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function smokeSemimonthPayroll(context) {
    vm.runInContext(`
        TimeTrack.entries = [
            { worker_name: 'Тая', employee_id: 1, date: '${currentMonthDate(2)}', hours: 30 },
            { worker_name: 'Тая', employee_id: 1, date: '${currentMonthDate(10)}', hours: 31 },
            { worker_name: 'Тая', employee_id: 1, date: '${currentMonthDate(18)}', hours: 35 },
            { worker_name: 'Тая', employee_id: 1, date: '${currentMonthDate(24)}', hours: 30 },
            { worker_name: 'Женя', employee_id: 2, date: '${currentMonthDate(3)}', hours: 10 },
        ];
        TimeTrack.employees = [
            {
                id: 1,
                name: 'Тая',
                role: 'production',
                is_active: true,
                payroll_profile: 'salary_semimonth_threshold',
                pay_base_salary_month: 70000,
                pay_base_hours_month: 120,
                pay_base_hours_semimonth: 60,
                pay_overtime_hour_rate: 500,
                pay_weekend_hour_rate: 750,
                pay_holiday_hour_rate: 750,
            },
            {
                id: 2,
                name: 'Женя',
                role: 'production',
                is_active: false,
                payroll_profile: 'hourly',
                pay_base_salary_month: 0,
                pay_overtime_hour_rate: 500,
                pay_weekend_hour_rate: 750,
                pay_holiday_hour_rate: 750,
            }
        ];
        TimeTrack.isWeekend = () => false;
        TimeTrack.parseHolidaySet = () => new Set();
    `, context);

    const result = vm.runInContext(`TimeTrack.calculateProductionPayrollForCurrentMonth()`, context);
    const tayaFirst = result.rows.find(row => row.employeeName === 'Тая' && row.periodKey === 'first');
    const tayaSecond = result.rows.find(row => row.employeeName === 'Тая' && row.periodKey === 'second');
    const jenyaFirst = result.rows.find(row => row.employeeName === 'Женя' && row.periodKey === 'first');
    const jenyaSecond = result.rows.find(row => row.employeeName === 'Женя' && row.periodKey === 'second');

    assert.equal(result.rows.length, 4);

    assert.ok(tayaFirst, 'Тая first-half row should exist');
    assert.equal(tayaFirst.inBaseHours, 60);
    assert.equal(tayaFirst.overtimeHours, 1);
    assert.equal(Math.round(tayaFirst.totalPay), 500);

    assert.ok(tayaSecond, 'Тая second-half row should exist');
    assert.equal(tayaSecond.inBaseHours, 60);
    assert.equal(tayaSecond.overtimeHours, 5);
    assert.equal(Math.round(tayaSecond.totalPay), 2500);

    assert.ok(jenyaFirst, 'Женя first-half row should exist');
    assert.equal(jenyaFirst.inBaseHours, 0);
    assert.equal(jenyaFirst.overtimeHours, 10);
    assert.equal(Math.round(jenyaFirst.totalPay), 5000);

    assert.ok(jenyaSecond, 'Женя second-half row should exist');
    assert.equal(jenyaSecond.overtimeHours, 0);
    assert.equal(Math.round(jenyaSecond.totalPay), 0);
}

function smokeDailyStatusAndCanonicalGrouping(context) {
    const today = '2026-03-20';
    vm.runInContext(`
        TimeTrack.getCurrentReportDate = () => '${today}';
        TimeTrack.entries = [
            { id: 1, employee_id: 10, worker_name: 'Тая', project_name: 'Проект А', date: '${today}', hours: 3, description: '' },
            { id: 2, employee_id: 11, worker_name: 'Женя', project_name: 'Проект Б', date: '${today}', hours: 4, description: '' },
            { id: 3, employee_id: 12, worker_name: 'Леша', project_name: 'Проект В', date: '${today}', hours: 2, description: '' },
        ];
        TimeTrack.employees = [
            { id: 10, name: 'Тая', role: 'production', is_active: true, daily_hours: 8, payroll_profile: 'salary_semimonth_threshold' },
            { id: 11, name: 'Женя Г', role: 'production', is_active: true, daily_hours: 8, payroll_profile: 'hourly' },
            { id: 12, name: 'Леша', role: 'management', is_active: true, daily_hours: 8, payroll_profile: 'management_salary_with_production_allocation' },
        ];
        TimeTrack.renderDailyStatus();
    `, context);
    const html = vm.runInContext(`document.getElementById('tt-daily-status-content').innerHTML`, context);
    assert.match(html, /Тая/);
    assert.match(html, /Женя Г/);
    assert.doesNotMatch(html, /Леша/);
}

async function smokeMoscowDateAndLegacyRepair(context) {
    vm.runInContext(`
        App.settings.production_holidays = '2026-03-23';
        TimeTrack.getCurrentReportDate = function(baseDate = new Date()) {
            return this.getTodayYMD(baseDate);
        };
        TimeTrack.entries = [{
            id: 501,
            employee_id: 10,
            worker_name: 'Тая',
            project_name: 'Проект А',
            date: '2026-03-21',
            created_at: '2026-03-20T20:30:00Z',
            hours: 8,
            description: ''
        }];
        TimeTrack.employees = [{
            id: 10,
            name: 'Тая',
            role: 'production',
            is_active: true,
            timezone_offset: 3,
            daily_hours: 8,
            payroll_profile: 'hourly'
        }];
    `, context);

    assert.equal(
        vm.runInContext(`TimeTrack.getTodayYMD(new Date('2026-03-20T22:30:00Z'), 3)`, context),
        '2026-03-21'
    );
    assert.equal(
        vm.runInContext(`TimeTrack.getCurrentReportDate(new Date('2026-03-21T10:00:00Z'))`, context),
        '2026-03-21'
    );
    assert.equal(
        vm.runInContext(`TimeTrack.getLegacyBuggyTodayYMD(new Date('2026-03-20T20:30:00Z'), 3)`, context),
        '2026-03-21'
    );
    assert.equal(
        vm.runInContext(`TimeTrack.getLegacyBuggyTodayYMDWithHostOffset(new Date('2026-03-20T18:30:00Z'), 3, 180)`, context),
        '2026-03-21'
    );
    assert.equal(
        vm.runInContext(`Array.from(TimeTrack.getLegacyBuggyDateCandidates(new Date('2026-03-20T18:30:00Z'), 3)).sort().join(',')`, context),
        '2026-03-20,2026-03-21'
    );

    const repaired = await vm.runInContext(`TimeTrack.repairLegacyTimezoneShiftedEntries()`, context);
    assert.equal(repaired, 1);
    assert.equal(context.__savedEntries.at(-1).date, '2026-03-20');

    context.__savedEntries = [];
    vm.runInContext(`
        TimeTrack.entries = [{
            id: 502,
            employee_id: 10,
            worker_name: 'Тая',
            project_name: 'Проект Б',
            date: '2026-03-21',
            created_at: '2026-03-20T18:30:00Z',
            hours: 2,
            description: ''
        }];
    `, context);
    const repairedBotShift = await vm.runInContext(`TimeTrack.repairLegacyTimezoneShiftedEntries()`, context);
    assert.equal(repairedBotShift, 1);
    assert.equal(context.__savedEntries.at(-1).date, '2026-03-20');
}

async function smokeLegacyFirstHalfImport(context) {
    context.__savedEntry = null;
    context.__savedEntries = [];
    vm.runInContext(`
        TimeTrack.entries = [
            { id: 500, employee_id: 11, worker_name: 'Женя', project_name: 'Уже внесено', date: '2026-03-10', hours: 1, description: '' }
        ];
        TimeTrack.employees = [
            { id: 10, name: 'Тая', role: 'production', is_active: true, payroll_profile: 'salary_semimonth_threshold' },
            { id: 11, name: 'Женя Г', role: 'production', is_active: true, payroll_profile: 'hourly' },
            { id: 12, name: 'Леша', role: 'management', is_active: true, payroll_profile: 'management_salary_with_production_allocation' }
        ];
    `, context);

    const imported = await vm.runInContext(`TimeTrack.backfillLegacyFirstHalfEntries()`, context);
    assert.equal(imported, 16);
    assert.equal(context.__savedEntries.length, 16);
    assert.equal(context.localStorage.getItem('ro_tt_legacy_import_2026_03_first_half_v1'), '1');
    assert.equal(context.__savedEntries.some(entry => entry.worker_name === 'Леша'), false);
    assert.equal(context.__savedEntries.some(entry => entry.worker_name === 'Женя Г'), true);
    assert.equal(context.__savedEntries.some(entry => entry.worker_name === 'Тая' && entry.date === '2026-03-10' && entry.project_name === 'мтс воркшоп'), true);
    assert.equal(context.__savedEntries.some(entry => entry.worker_name === 'Тая' && entry.date === '2026-03-10' && entry.project_name === 'броши пушкинкий'), true);
}

async function smokeEditEntry(context) {
    vm.runInContext(`
        TimeTrack.entries = [{
            id: 77,
            employee_id: 2,
            worker_name: 'Женя',
            project_name: 'Старый проект',
            order_id: 555,
            hours: 3,
            date: '${currentMonthDate(5)}',
            description: TimeTrack.buildDescriptionWithMeta('assembly', 'Сборка', 'Старый комментарий', 'Старый проект'),
        }];
        TimeTrack.employees = [{
            id: 2,
            name: 'Женя',
            role: 'production',
            is_active: false,
            payroll_profile: 'hourly',
            pay_overtime_hour_rate: 500,
        }];
        const worker = document.getElementById('tt-worker-name');
        const project = document.getElementById('tt-project-select');
        worker.options = [{ value: '', textContent: '-- Выберите --' }];
        project.options = [
            { value: '', textContent: '-- Выберите проект --' },
            { value: '__general', textContent: 'Общие работы (сайка, МП, интернет-магазин)' },
            { value: '555', textContent: 'Старый проект' },
            { value: '777', textContent: 'Новый проект' }
        ];
        document.getElementById('tt-stage').value = 'assembly';
    `, context);

    vm.runInContext(`TimeTrack.editEntry(77)`, context);
    assert.equal(vm.runInContext(`document.getElementById('tt-manual-title').textContent`, context), 'Редактировать запись');
    assert.equal(vm.runInContext(`document.getElementById('tt-worker-name').value`, context), 'Женя');
    assert.equal(vm.runInContext(`document.getElementById('tt-project-select').value`, context), '555');

    vm.runInContext(`
        document.getElementById('tt-project-select').value = '777';
        document.getElementById('tt-hours').value = '4.5';
        document.getElementById('tt-date').value = '${currentMonthDate(6)}';
        document.getElementById('tt-stage').value = 'packaging';
        document.getElementById('tt-description').value = 'Исправили проект';
    `, context);

    await vm.runInContext(`TimeTrack.saveEntry()`, context);
    assert.equal(context.__savedEntry.id, 77);
    assert.equal(context.__savedEntry.employee_id, 2);
    assert.equal(context.__savedEntry.order_id, 777);
    assert.equal(context.__savedEntry.project_name, 'Новый проект');
    assert.equal(context.__savedEntry.hours, 4.5);
    assert.equal(context.__savedEntry.date, currentMonthDate(6));
    assert.equal(vm.runInContext(`TimeTrack.editingEntryId`, context), null);
}

async function smokeWeekendManualSaveKeepsDate(context) {
    context.__savedEntry = null;
    context.__savedEntries = [];
    context.loadOrders = async () => [];

    vm.runInContext(`
        App.settings.production_holidays = '';
        TimeTrack.entries = [];
        TimeTrack.employees = [{
            id: 9,
            name: 'Тая',
            role: 'production',
            is_active: true,
            payroll_profile: 'hourly',
            pay_overtime_hour_rate: 500,
        }];
        document.getElementById('tt-worker-name').value = 'Тая';
        document.getElementById('tt-project-select').value = '__general';
        document.getElementById('tt-project-select').options = [
            { value: '', textContent: '-- Выберите проект --' },
            { value: '__general', textContent: 'Общие работы (сайка, МП, интернет-магазин)' }
        ];
        document.getElementById('tt-hours').value = '8';
        document.getElementById('tt-date').value = '2026-03-21';
        document.getElementById('tt-stage').value = 'casting';
        document.getElementById('tt-description').value = 'Отчёт, отправленный в субботу';
        TimeTrack.editingEntryId = null;
        TimeTrack.load = async () => {};
    `, context);

    await vm.runInContext(`TimeTrack.saveEntry()`, context);
    assert.ok(context.__savedEntry, 'saveTimeEntry should be called');
    assert.equal(context.__savedEntry.date, '2026-03-21');
    assert.equal(context.__savedEntry.worker_name, 'Тая');
    assert.equal(context.__savedEntry.hours, 8);
}

async function smokeProjectSelectIncludesSamplesAndProduction(context) {
    context.loadOrders = async () => [
        { id: 101, order_name: 'ЭндоСтарс', client_name: 'Алина', status: 'production_printing' },
        { id: 102, order_name: 'Образец A', client_name: 'Клиент', status: 'sample' },
        { id: 103, order_name: 'Черновик B', client_name: 'Клиент', status: 'draft' },
    ];

    await vm.runInContext(`TimeTrack.populateProjectSelect()`, context);

    const options = vm.runInContext(`
        Array.from(document.getElementById('tt-project-select').options).map(option => ({
            value: String(option.value),
            textContent: String(option.textContent)
        }))
    `, context);

    assert.equal(options.some(option => option.value === '101' && /ЭндоСтарс/.test(option.textContent)), true);
    assert.equal(options.some(option => option.value === '102' && /Образец A/.test(option.textContent)), true);
    assert.equal(options.some(option => option.value === '103'), false);
}

async function main() {
    const context = createContext();
    runScript(context, 'js/timetrack.js');
    smokeSemimonthPayroll(context);
    smokeDailyStatusAndCanonicalGrouping(context);
    await smokeMoscowDateAndLegacyRepair(context);
    await smokeLegacyFirstHalfImport(context);
    await smokeEditEntry(context);
    await smokeWeekendManualSaveKeepsDate(context);
    await smokeProjectSelectIncludesSamplesAndProduction(context);
    console.log('payroll half-month smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

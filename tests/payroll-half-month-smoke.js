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

function createContext() {
    const document = createDocument();
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
        App: {
            settings: { fot_per_hour: 0, production_holidays: '' },
            isAdmin() { return true; },
            toast() {},
        },
        confirm: () => true,
        loadTimeEntries: async () => [],
        loadEmployees: async () => [],
        loadOrders: async () => [],
        saveTimeEntry: async (entry) => {
            context.__savedEntry = JSON.parse(JSON.stringify(entry));
            return entry.id || 1;
        },
        deleteTimeEntry: async () => {},
    };
    context.window = context;
    context.__savedEntry = null;
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

async function main() {
    const context = createContext();
    runScript(context, 'js/timetrack.js');
    smokeSemimonthPayroll(context);
    await smokeEditEntry(context);
    console.log('payroll half-month smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

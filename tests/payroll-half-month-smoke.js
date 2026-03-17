const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id = '') {
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
    };
}

function createDocument() {
    const elements = new Map();
    return {
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
        },
    };
    context.window = context;
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
                is_active: true,
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
    const taya = result.rows.find(row => row.employeeName === 'Тая');
    const jenya = result.rows.find(row => row.employeeName === 'Женя');

    assert.ok(taya, 'Тая row should exist');
    assert.equal(taya.inBaseHours, 120);
    assert.equal(taya.overtimeHours, 6);
    assert.equal(Math.round(taya.totalPay), 73000);
    assert.equal(taya.halfBreakdown.length, 2);
    assert.equal(Math.round(taya.halfBreakdown[0].totalPay), 35500);
    assert.equal(Math.round(taya.halfBreakdown[1].totalPay), 37500);

    assert.ok(jenya, 'Женя row should exist');
    assert.equal(jenya.inBaseHours, 0);
    assert.equal(jenya.overtimeHours, 10);
    assert.equal(Math.round(jenya.totalPay), 5000);
}

function main() {
    const context = createContext();
    runScript(context, 'js/timetrack.js');
    smokeSemimonthPayroll(context);
    console.log('payroll half-month smoke checks passed');
}

main();

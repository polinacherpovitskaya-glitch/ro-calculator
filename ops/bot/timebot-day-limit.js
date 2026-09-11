// Sanity check on the hours a single day can hold.
//
// Independent of duplicate detection on purpose: whatever the reason a day
// ends up with an impossible total — a repeated report, a mistyped number, a
// multi-day list stamped with one date — those hours flow into the timesheet
// and the payroll. On 2026-09-11 Тая's day reached 50h against a 6h norm and
// the bot answered "💪 Супер, записано!".

const ABSOLUTE_DAY_LIMIT = 24;
const DEFAULT_DAILY_HOURS = 8;

function round2(n) {
    return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function normalHours(employee) {
    const hours = parseFloat(employee?.daily_hours);
    return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_DAILY_HOURS;
}

/**
 * Decides what to do with the total a day would reach once the pending entries
 * are stored: 'ok' to save quietly, 'warn' to save but say something, 'block'
 * to refuse and keep the day as it is.
 */
function evaluateDayTotal(employee, dayTotal) {
    const total = round2(dayTotal);
    const norm = normalHours(employee);

    if (total > ABSOLUTE_DAY_LIMIT) {
        return {
            level: 'block',
            message:
                `Не записал: за день получилось бы ${total}ч, а в сутках столько не бывает.\n\n` +
                'Похоже, отчёт отправился несколько раз или где-то опечатка в часах. ' +
                'Проверь и отправь заново, а если часы уже записаны — напиши Полине.',
        };
    }

    if (total > norm * 2) {
        return {
            level: 'warn',
            message: `⚠️ За день уже ${total}ч при норме ${norm}ч — проверь, не записалось ли лишнее.`,
        };
    }

    return { level: 'ok', message: '' };
}

module.exports = {
    ABSOLUTE_DAY_LIMIT,
    DEFAULT_DAILY_HOURS,
    evaluateDayTotal,
};

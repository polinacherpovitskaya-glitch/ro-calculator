function formatYmdUtc(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLocalDate(timezoneOffset = 3, baseDate = new Date()) {
    const safeOffset = Number.isFinite(Number(timezoneOffset)) ? Number(timezoneOffset) : 3;
    return formatYmdUtc(new Date(baseDate.getTime() + safeOffset * 3600000));
}

function shiftYmd(dateStr, deltaDays) {
    const raw = String(dateStr || '').trim();
    if (!raw) return raw;
    const date = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return raw;
    date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
    return formatYmdUtc(date);
}

function isWeekendYmd(dateStr) {
    const raw = String(dateStr || '').trim();
    if (!raw) return false;
    const date = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    const day = date.getUTCDay();
    return day === 0 || day === 6;
}

function normalizeWorkDate(dateStr, holidaySet = new Set()) {
    let current = String(dateStr || '').trim();
    if (!current) return current;
    const holidays = holidaySet instanceof Set ? holidaySet : new Set();
    let guard = 0;
    while (current && (isWeekendYmd(current) || holidays.has(current))) {
        current = shiftYmd(current, -1);
        guard += 1;
        if (guard > 31) break;
    }
    return current;
}

module.exports = {
    formatYmdUtc,
    getLocalDate,
    shiftYmd,
    isWeekendYmd,
    normalizeWorkDate,
};

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Europe/Moscow';

function isValidTimezone(timezone) {
    const value = String(timezone || '').trim();
    if (!value) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        return true;
    } catch (_error) {
        return false;
    }
}

function normalizeTimezone(timezone, fallback = DEFAULT_TIMEZONE) {
    const value = String(timezone || '').trim();
    if (isValidTimezone(value)) return value;
    return isValidTimezone(fallback) ? fallback : 'UTC';
}

function localParts(date, timezone = DEFAULT_TIMEZONE) {
    const safeDate = date instanceof Date ? date : new Date(date);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: normalizeTimezone(timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    return Object.fromEntries(formatter.formatToParts(safeDate).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function localDateYmd(timezone = DEFAULT_TIMEZONE, baseDate = new Date()) {
    const parts = localParts(baseDate, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDateTime(timezone = DEFAULT_TIMEZONE, baseDate = new Date()) {
    const parts = localParts(baseDate, timezone);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function employeeTimezone(employee, fallback = DEFAULT_TIMEZONE) {
    return normalizeTimezone(employee?.timezone, fallback);
}

module.exports = {
    DEFAULT_TIMEZONE,
    employeeTimezone,
    isValidTimezone,
    localDateTime,
    localDateYmd,
    normalizeTimezone,
};

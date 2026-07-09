const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    employeeTimezone,
    isValidTimezone,
    localDateTime,
    localDateYmd,
    normalizeTimezone,
} = require('../timezone');
const { getLocalDate, normalizeWorkDate, shiftYmd } = require('../timebot-date-utils');

test('isValidTimezone accepts IANA timezones', () => {
    assert.equal(isValidTimezone('Europe/Moscow'), true);
    assert.equal(isValidTimezone('America/Argentina/Buenos_Aires'), true);
});

test('isValidTimezone rejects empty and invalid values', () => {
    assert.equal(isValidTimezone(''), false);
    assert.equal(isValidTimezone('Europe/Nowhere'), false);
});

test('normalizeTimezone falls back to the configured default', () => {
    assert.equal(normalizeTimezone('Europe/Moscow'), 'Europe/Moscow');
    assert.equal(normalizeTimezone('bad-zone', 'UTC'), 'UTC');
});

test('normalizeTimezone falls back to UTC when fallback is invalid too', () => {
    assert.equal(normalizeTimezone('bad-zone', 'also-bad'), 'UTC');
});

test('localDateYmd uses the employee timezone rather than UTC date', () => {
    const baseDate = new Date('2026-05-19T22:30:00.000Z');
    assert.equal(localDateYmd('Europe/Moscow', baseDate), '2026-05-20');
    assert.equal(localDateYmd('America/Argentina/Buenos_Aires', baseDate), '2026-05-19');
});

test('localDateTime returns stable local wall clock text', () => {
    const baseDate = new Date('2026-05-19T21:05:06.000Z');
    assert.equal(localDateTime('Europe/Moscow', baseDate), '2026-05-20 00:05:06');
});

test('employeeTimezone reads employee timezone with fallback', () => {
    assert.equal(employeeTimezone({ timezone: 'Asia/Yerevan' }, 'UTC'), 'Asia/Yerevan');
    assert.equal(employeeTimezone({ timezone: '' }, 'UTC'), 'UTC');
    assert.equal(employeeTimezone(null, 'UTC'), 'UTC');
});

test('getLocalDate remains backward-compatible with numeric offsets', () => {
    const baseDate = new Date('2026-05-19T22:30:00.000Z');
    assert.equal(getLocalDate(3, baseDate), '2026-05-20');
    assert.equal(getLocalDate(-3, baseDate), '2026-05-19');
});

test('getLocalDate accepts IANA timezone strings', () => {
    const baseDate = new Date('2026-05-19T22:30:00.000Z');
    assert.equal(getLocalDate('Europe/Moscow', baseDate), '2026-05-20');
    assert.equal(getLocalDate('America/Argentina/Buenos_Aires', baseDate), '2026-05-19');
});

test('date utilities still normalize weekends and shifts', () => {
    assert.equal(shiftYmd('2026-05-20', -1), '2026-05-19');
    assert.equal(normalizeWorkDate('2026-05-17'), '2026-05-15');
});

const assert = require('node:assert/strict');
const path = require('node:path');

const { _tipHtml } = require(path.join(__dirname, '..', 'js', 'production_load.js'));

const rows = [
    { orderId: 101, name: 'Первый очень длинный заказ без сокращения', hours: 109 },
    { orderId: 102, name: 'Второй заказ', hours: 30 },
    { orderId: 103, name: 'Третий заказ', hours: 18 },
    { orderId: 104, name: 'Четвёртый заказ', hours: 9.5 },
    { orderId: 105, name: 'Пятый заказ', hours: 8.5 },
    { orderId: 106, name: 'Шестой заказ', hours: 7.5 },
    { orderId: 107, name: 'Седьмой заказ', hours: 6.5 },
    { orderId: 108, name: 'Восьмой заказ', hours: 5.5 },
    { orderId: 109, name: 'Девятый заказ', hours: 4.5 },
    { name: 'вне заказов (сток, образцы…)', hours: 3 },
];

const html = _tipHtml('Сделано · 202 ч', rows);

rows.forEach(row => {
    assert.ok(html.includes(row.name), `Tooltip must include the full row name: ${row.name}`);
});
assert.doesNotMatch(html, /ещё\s+\d+…/, 'Tooltip must not collapse rows into an “ещё N…” summary');
assert.match(html, /data-order-id="101"/, 'An order row must carry its order ID for navigation');
assert.match(html, /class="row pl-tip-order"/, 'An order row must be an interactive control');
assert.doesNotMatch(
    html.match(/вне заказов[^]*$/)?.[0] || '',
    /data-order-id=/,
    'Work outside an order must remain informational rather than link to a fake order',
);

console.log('production-load-tooltip-smoke: OK');

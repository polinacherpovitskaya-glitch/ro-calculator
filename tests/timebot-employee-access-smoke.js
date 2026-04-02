const assert = require('node:assert/strict');

const {
    pickActiveLinkedEmployee,
    pickAnyLinkedEmployee,
    buildInactiveBindingMessage,
} = require('../bot/timebot-employee-access');

const rows = [
    { id: 1, name: 'Женя Г', is_active: false },
    { id: 2, name: 'Тая', is_active: true },
];

assert.equal(pickActiveLinkedEmployee(rows)?.id, 2, 'active employee should win over inactive binding');
assert.equal(pickAnyLinkedEmployee(rows)?.id, 1, 'first linked employee should be returned as fallback');
assert.match(
    buildInactiveBindingMessage({ name: 'Женя Г' }),
    /неактивному профилю «Женя Г»/u,
    'inactive binding message should mention linked employee name'
);

console.log('timebot employee access smoke checks passed');

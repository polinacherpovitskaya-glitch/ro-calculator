const assert = require('node:assert/strict');
const path = require('node:path');

const core = require(path.join(__dirname, '..', 'js', 'work-management-core.js'));

const deadline = core.parseLegacyDeadline('February 13, 2026 → February 16, 2026');
assert.equal(deadline.due_date, '2026-02-16');
assert.equal(deadline.due_time, null);

assert.equal(core.mapLegacyTaskStatus('Not started'), 'incoming');
assert.equal(core.mapLegacyTaskStatus('In progress'), 'in_progress');
assert.equal(core.mapLegacyTaskStatus('Done'), 'done');
assert.equal(core.mapLegacyTaskStatus('Cancelled'), 'cancelled');

assert.equal(core.inferAreaSlugFromText('Нужно подготовить дизайн баннера и макета'), 'design');
assert.equal(core.inferAreaSlugFromText('Проверить коробки и остатки на складе'), 'warehouse');
assert.equal(core.inferAreaSlugFromText('Настроить новую страницу сайта'), 'website');

assert.equal(core.ensurePrimaryContextKind({ project_id: 1, primary_context_kind: 'project' }), 'project');
assert.equal(core.ensurePrimaryContextKind({ order_id: 2, primary_context_kind: 'order' }), 'order');
assert.equal(core.ensurePrimaryContextKind({ area_id: 9107, primary_context_kind: 'area' }), 'area');
assert.equal(core.ensurePrimaryContextKind({ project_id: 1, primary_context_kind: 'order' }), 'project');

const mentions = core.extractMentionedEmployeeIds(
    'Нужно согласовать с @Анна Мирная и потом передать @Полина Черповицкая',
    [
        { id: 1, name: 'Полина Черповицкая' },
        { id: 2, name: 'Анна Мирная' },
        { id: 3, name: 'Ксения' },
    ],
);
assert.deepEqual(mentions, [1, 2]);

console.log('work-management smoke checks passed');

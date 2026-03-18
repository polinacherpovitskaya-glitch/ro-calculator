const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WorkManagementCore = require(path.join(__dirname, '..', 'js', 'work-management-core.js'));

const context = {
    console,
    WorkManagementCore,
    App: {
        currentEmployeeId: 7,
        currentPage: 'tasks',
    },
    window: {},
    document: {},
    setTimeout,
    clearTimeout,
};

vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tasks.js'), 'utf8');
vm.runInContext(`${source}\nthis.Tasks = Tasks;`, context);

const Tasks = context.Tasks;
const ids = list => Array.from(list, task => task.id);
Tasks.bundle = {
    tasks: [
        { id: 1, title: 'Входящая', assignee_id: 7, reporter_id: 5, status: 'in_progress', priority: 'normal', due_date: '2026-03-19', sort_index: 100 },
        { id: 2, title: 'Исходящая', assignee_id: 5, reporter_id: 7, status: 'planned', priority: 'normal', due_date: '2026-03-20', sort_index: 200 },
        { id: 3, title: 'Готовая входящая', assignee_id: 7, reporter_id: 5, status: 'done', priority: 'normal', due_date: '2026-03-18', sort_index: 300 },
        { id: 4, title: 'Отмененная исходящая', assignee_id: 5, reporter_id: 7, status: 'cancelled', priority: 'normal', due_date: '2026-03-18', sort_index: 400 },
    ],
    comments: [],
    projects: [],
    areas: [],
};
Tasks.orders = [];
Tasks.employees = [
    { id: 5, name: 'Полина' },
    { id: 7, name: 'Женя Г' },
];
Tasks.filters = {
    search: '',
    status: '',
    priority: '',
    assignee_id: '',
    reporter_id: '',
    project_id: '',
    order_id: '',
    area_id: '',
    due: '',
    mine: false,
    awaiting_review: false,
    waiting_only: false,
};

Tasks.scope = 'my';
Tasks.myMode = 'assigned';
let assigned = Tasks.filteredTasks();
assert.deepEqual(ids(assigned), [1, 3]);

Tasks.myMode = 'outgoing';
let outgoing = Tasks.filteredTasks();
assert.deepEqual(ids(outgoing), [2, 4]);

Tasks.myMode = 'all';
let allMy = Tasks.filteredTasks();
assert.deepEqual(ids(allMy), [1, 2, 3, 4]);

const groups = Tasks.splitTasksByCompletion(allMy);
assert.deepEqual(ids(groups.active), [1, 2]);
assert.deepEqual(ids(groups.completed), [3, 4]);
assert.equal(Tasks.activeTasksCount(Tasks.bundle.tasks), 2);
assert.equal(Tasks.completedTasksCount(Tasks.bundle.tasks), 2);

Tasks.scope = 'all';
Tasks.myMode = 'assigned';
assert.match(Tasks.renderCompletedSection(groups.completed), /Готовые и отмененные задачи/);

console.log('tasks smoke checks passed');

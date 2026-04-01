const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BugReportCore = require(path.join(__dirname, '..', 'js', 'bug-report-core.js'));
const WorkManagementCore = require(path.join(__dirname, '..', 'js', 'work-management-core.js'));

const inferred = BugReportCore.inferSectionFromRoute('#order-detail/145');
assert.equal(inferred.key, 'orders');

const title = BugReportCore.buildBugTaskTitle({
    title: 'не сохраняется дедлайн',
    section_key: 'orders',
    section_name: 'Заказы',
    subsection_key: 'detail',
    subsection_name: 'Карточка заказа',
});
assert.match(title, /^\[Баг\] Заказы \/ Карточка заказа — не сохраняется дедлайн$/);

const prompt = BugReportCore.buildCodexPrompt({
    task: { title },
    report: {
        title: 'не сохраняется дедлайн',
        section_key: 'orders',
        section_name: 'Заказы',
        subsection_key: 'detail',
        subsection_name: 'Карточка заказа',
        page_route: '#order-detail/145',
        page_url: 'https://example.com/#order-detail/145',
        app_version: 'v92',
        browser: 'Chrome',
        os: 'macOS',
        viewport: '1512x982',
        severity: 'high',
        actual_result: 'После сохранения дата исчезает из формы.',
        expected_result: 'Дата должна сохраняться и оставаться в карточке.',
        steps_to_reproduce: '1. Открыть заказ.\n2. Поставить дедлайн.\n3. Нажать сохранить.',
        submitted_by_name: 'Полина',
    },
    assets: [
        { kind: 'file', title: 'screenshot-1.png', url: 'https://example.com/a.png' },
    ],
    repoPath: '/Users/krollipolli/Documents/Github/RO calculator',
});

assert.match(prompt, /Рабочий репозиторий: \/Users\/krollipolli\/Documents\/Github\/RO calculator/);
assert.match(prompt, /Серьезность: Высокий/);
assert.match(prompt, /Маршрут \/ hash: #order-detail\/145/);
assert.match(prompt, /Вложения:/);
assert.match(prompt, /screenshot-1\.png/);

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(indexHtml, /id="quick-bug-report-btn"/);
assert.match(indexHtml, /quick-bug-report-btn__label">Баг</);

const bugsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'bugs.js'), 'utf8');
assert.doesNotMatch(bugsJs, /App\?\.\s*currentPage === 'bugs'/);
assert.match(bugsJs, /openQuickReport\(preset = \{\}\)/);
assert.match(bugsJs, /submittingPrefixes:\s*new Set\(\)/);
assert.match(bugsJs, /promptReady:\s*reports\.filter\(entry => this\.promptText\(entry\.report\)\)\.length/);
assert.match(bugsJs, /id="\$\{prefix\}-submit"/);
assert.match(bugsJs, /if \(this\.submittingPrefixes\.has\(prefix\)\) return;/);
assert.match(bugsJs, /button\.textContent = isSubmitting \? 'Отправляем…' : 'Отправить баг'/);
assert.match(bugsJs, /draftStorageKey\(\)/);
assert.match(bugsJs, /draftTtlMs\(\)/);
assert.match(bugsJs, /localStorage\.setItem\(this\.draftStorageKey\(\)/);
assert.match(bugsJs, /closeQuickReport\(options = \{\}\)/);
assert.match(bugsJs, /closeTask\(taskId\)/);
assert.match(bugsJs, /window\.BugReports = BugReports/);

const context = {
    console,
    BugReportCore,
    WorkManagementCore,
    loadWorkBundle: async () => ({}),
    loadEmployees: async () => ([]),
    saveWorkTask: async (task) => task,
    saveBugReport: async (row) => row,
    saveWorkAsset: async (row) => row,
    isSupabaseReady: () => false,
    supabaseClient: {},
    TaskEvents: { emit: async () => {} },
    App: {
        currentEmployeeId: 7,
        currentUser: { id: 'user-7', role: 'admin' },
        settings: {},
        getCurrentEmployeeName() { return 'Женя Г'; },
        toast(message) { context.__lastToast = message; },
        navigate(...args) { context.__navigateArgs = args; },
    },
    window: {
        location: {
            hash: '#bugs',
            href: 'https://example.com/#bugs',
        },
    },
    document: {
        getElementById() { return null; },
    },
    localStorage: {
        _store: new Map(),
        getItem(key) { return this._store.has(key) ? this._store.get(key) : null; },
        setItem(key, value) { this._store.set(key, String(value)); },
        removeItem(key) { this._store.delete(key); },
    },
    navigator: {
        userAgent: 'Chrome',
        clipboard: { writeText: () => Promise.resolve() },
    },
    FileReader: function FileReader() {},
    setTimeout,
    clearTimeout,
};
context.window.BugReports = null;
vm.createContext(context);
vm.runInContext(`${bugsJs}\nthis.BugReports = BugReports;`, context);

const BugReports = context.BugReports;
BugReports.employees = [
    { id: 5, name: 'Полина' },
    { id: 7, name: 'Женя Г' },
];

assert.equal(BugReports.defaultBugAssigneeId(), 7);
context.App.settings = { bug_report_default_assignee_id: 5 };
assert.equal(BugReports.defaultBugAssigneeId(), 5);
context.App.settings = {};

context.loadWorkBundle = async () => ({
    tasks: [{
        id: 202,
        area_id: 9105,
        title: '[Баг] Склад / Инвентаризация — не видно новый баг в ленте',
        status: 'incoming',
        description: 'Проблема: новый баг не попадает в ленту багов.\n\nОжидалось: баг должен сразу отображаться.\n\nМаршрут / hash: #bugs',
        created_at: '2026-04-01T09:00:00.000Z',
        updated_at: '2026-04-01T09:00:00.000Z',
        priority: 'high',
        created_by_name: 'Полина',
    }],
    bugReports: [],
    assets: [],
});

(async () => {
    await BugReports.refreshData();
    assert.equal(BugReports.bundle.bugReports.length, 1);
    assert.equal(BugReports.bundle.bugReports[0].task_id, 202);
    assert.equal(BugReports.bundle.bugReports[0].section_key, 'warehouse');
    assert.equal(BugReports.bundle.bugReports[0].subsection_key, 'audit');
    assert.equal(BugReports.bundle.bugReports[0].severity, 'high');
})();

const openReport = {
    id: 11,
    task_id: 101,
    title: 'Пропадают задачи из багов',
    severity: 'medium',
    section_name: 'Задачи',
    subsection_name: 'Другое',
    page_route: '#tasks',
    actual_result: 'Баговая задача не видна в моих задачах.',
    submitted_by_name: 'Полина',
    created_at: '2026-03-23T10:00:00.000Z',
    codex_status: 'prompt_ready',
    codex_prompt: 'Исправь связку багов и задач',
};
const openTask = {
    id: 101,
    title: '[Баг] Задачи / Другое — пропадают задачи из багов',
    status: 'incoming',
};

const openCardHtml = BugReports.reportCardHtml({ report: openReport, task: openTask, assets: [] });
assert.match(openCardHtml, /BugReports\.closeTask\(101\)/);
assert.match(openCardHtml, />Готово</);
assert.match(openCardHtml, /BugReports\.openTask\(101\)/);
assert.match(openCardHtml, /Скопировать prompt/);

const closedCardHtml = BugReports.reportCardHtml({
    report: openReport,
    task: { ...openTask, status: 'done' },
    assets: [],
});
assert.doesNotMatch(closedCardHtml, /BugReports\.closeTask\(101\)/);

BugReports.bundle = {
    tasks: [openTask],
    bugReports: [openReport],
    assets: [],
};
let closeStatus = null;
let savedTask = null;
context.Tasks = {
    taskById: () => openTask,
    changeStatus: async (taskId, status) => {
        closeStatus = { taskId, status };
    },
};
context.saveWorkTask = async (task) => {
    savedTask = { ...task };
    return task;
};
BugReports.refreshData = async () => {
    closeStatus.refreshed = true;
};
BugReports.render = () => {
    closeStatus.rendered = true;
};

(async () => {
    await BugReports.closeTask(101);
    assert.deepEqual(closeStatus, {
        taskId: 101,
        status: 'done',
        refreshed: true,
        rendered: true,
    });
    assert.equal(context.__lastToast, 'Задача закрыта');

    closeStatus = null;
    savedTask = null;
    BugReports.bundle = {
        tasks: [openTask],
        bugReports: [openReport],
        assets: [],
    };
    context.Tasks = {
        taskById: () => null,
        changeStatus: async () => {
            throw new Error('fallback path should not call Tasks.changeStatus');
        },
        isOverdue: () => false,
        emitTaskEvents: async (saved, existing, previousOverdue, options) => {
            closeStatus = {
                savedStatus: saved.status,
                existingId: existing.id,
                previousOverdue,
                preserveSelection: options.preserveSelection,
            };
        },
    };
    BugReports.refreshData = async () => {
        closeStatus.refreshed = true;
    };
    BugReports.render = () => {
        closeStatus.rendered = true;
    };

    await BugReports.closeTask(101);
    assert.equal(savedTask.status, 'done');
    assert.deepEqual(closeStatus, {
        savedStatus: 'done',
        existingId: 101,
        previousOverdue: false,
        preserveSelection: false,
        refreshed: true,
        rendered: true,
    });
    assert.equal(context.__lastToast, 'Задача закрыта');

    console.log('bug report smoke checks passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});

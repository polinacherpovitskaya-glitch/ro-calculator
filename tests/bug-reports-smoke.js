const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BugReportCore = require(path.join(__dirname, '..', 'js', 'bug-report-core.js'));

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
assert.match(bugsJs, /id="\$\{prefix\}-submit"/);
assert.match(bugsJs, /if \(this\.submittingPrefixes\.has\(prefix\)\) return;/);
assert.match(bugsJs, /button\.textContent = isSubmitting \? 'Отправляем…' : 'Отправить баг'/);

console.log('bug report smoke checks passed');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createElement(id = '') {
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        dataset: {},
        disabled: false,
        className: '',
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        appendChild() {},
        remove() {},
        focus() {},
        click() {},
        setAttribute() {},
        getAttribute() { return null; },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
    };
}

function createDocument() {
    const elements = new Map();
    return {
        body: createElement('body'),
        createElement(tag) {
            return createElement(tag);
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        querySelectorAll() {
            return [];
        },
    };
}

function createContext() {
    const document = createDocument();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        setTimeout,
        clearTimeout,
        document,
        confirm: () => true,
        prompt: () => '',
        Blob,
        URL: {
            createObjectURL() { return 'blob:wiki'; },
            revokeObjectURL() {},
        },
        App: {
            toast() {},
            escHtml(value) { return String(value || ''); },
            getCurrentEmployeeName() { return 'Smoke'; },
            formatDate(value) { return String(value || ''); },
            todayLocalYMD() { return '2026-03-18'; },
        },
        loadWikiState: async () => null,
        saveWikiState: async () => {},
    };
    context.window = context;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function main() {
    const context = createContext();
    context.__savedWiki = null;
    context.saveWikiState = async (state) => {
        context.__savedWiki = clone(state);
        return state;
    };

    runScript(context, 'js/wiki.js');

    context.document.getElementById('wiki-root');
    await vm.runInContext('Wiki.load()', context);

    const rootHtml = String(context.document.getElementById('wiki-root').innerHTML || '');
    assert.match(rootHtml, /База знаний/);
    assert.match(rootHtml, /Быстрый старт/);
    assert.match(rootHtml, /Черновики переноса/);
    assert.equal(Array.isArray(context.__savedWiki.sections), true);
    assert.equal(Array.isArray(context.__savedWiki.articles), true);

    await vm.runInContext('Wiki.createArticle("warehouse")', context);
    context.document.getElementById('wiki-article-title').value = 'Регламент склада';
    context.document.getElementById('wiki-article-summary').value = 'Как вести резерв и списание';
    context.document.getElementById('wiki-article-section').value = 'warehouse';
    context.document.getElementById('wiki-article-tags').value = 'склад, резерв';
    context.document.getElementById('wiki-article-body').value = 'Первый абзац\nВторой абзац';
    await vm.runInContext('Wiki.saveSelectedArticle()', context);

    const savedArticle = context.__savedWiki.articles.find(article => article.title === 'Регламент склада');
    assert.equal(savedArticle.section_id, 'warehouse');
    assert.deepEqual(savedArticle.tags, ['склад', 'резерв']);
    assert.match(savedArticle.body, /Второй абзац/);

    context.document.getElementById('wiki-import-title').value = 'Импортированный черновик';
    context.document.getElementById('wiki-import-section').value = 'drafts';
    context.document.getElementById('wiki-import-body').value = 'Сырой текст из Notion';
    await vm.runInContext('Wiki.applyImportText()', context);

    const imported = context.__savedWiki.articles.find(article => article.title === 'Импортированный черновик');
    assert.equal(imported.section_id, 'drafts');
    assert.match(imported.body, /Notion/);

    console.log('wiki smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

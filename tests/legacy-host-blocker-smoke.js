const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDocument() {
    const listeners = new Map();
    return {
        title: 'Recycle Object',
        body: { innerHTML: '' },
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        getEventListener(type) {
            return listeners.get(type);
        },
    };
}

function createContext() {
    const document = createDocument();
    const location = {
        hostname: 'polinacherpovitskaya-glitch.github.io',
        hash: '#molds',
    };
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
        URL,
        setTimeout,
        clearTimeout,
        document,
        window: null,
        location,
    };
    context.window = context;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function main() {
    const context = createContext();
    runScript(context, 'js/app.js');

    assert.equal(vm.runInContext('App.shouldBlockLegacyHost()', context), true);
    assert.equal(
        vm.runInContext('App.getCanonicalAppUrl()', context),
        'https://calc.recycleobject.ru/#molds'
    );

    const domReady = context.document.getEventListener('DOMContentLoaded');
    assert.equal(typeof domReady, 'function', 'DOMContentLoaded handler should be registered');
    domReady();

    const html = String(context.document.body.innerHTML || '');
    assert.match(html, /Старый адрес закрыт/);
    assert.match(html, /Открыть рабочий калькулятор/);
    assert.match(html, /calc\.recycleobject\.ru/);
    assert.match(html, /Рабочий калькулятор переехал на новый адрес/);
    assert.equal(context.document.title, 'Recycle Object — новый адрес калькулятора');

    console.log('legacy host blocker smoke checks passed');
}

main();

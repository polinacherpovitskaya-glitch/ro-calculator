const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

function runtimeUrlFor(hostname) {
  const context = {
    console,
    window: {
      location: {
        protocol: 'https:',
        hostname,
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'js/supabase.js' });
  return vm.runInContext('_getSupabaseRuntimeUrl()', context);
}

assert.strictEqual(
  runtimeUrlFor('calc2.recycleobject.ru'),
  'https://d5dktgh0f2nqktmc326f.wnq2w1o5.apigw.yandexcloud.net',
);

assert.strictEqual(
  runtimeUrlFor('calc.recycleobject.ru'),
  'https://jbpmorruwjrxcieqlbmd.supabase.co',
);

console.log('yandex proxy runtime smoke checks passed');

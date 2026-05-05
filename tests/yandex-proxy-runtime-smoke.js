const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const proxy = require('../yandex/supabase-proxy');

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

(async () => {
  const response = await proxy.handler({
    httpMethod: 'OPTIONS',
    rawPath: '/rest/v1/settings',
    headers: {
      origin: 'https://calc2.recycleobject.ru',
      'access-control-request-headers': 'accept-profile,content-profile,x-retry-count',
    },
  });
  assert.strictEqual(response.statusCode, 204);
  assert.strictEqual(response.headers['Access-Control-Allow-Origin'], 'https://calc2.recycleobject.ru');
  const allowedHeaders = response.headers['Access-Control-Allow-Headers'];
  assert.match(allowedHeaders, /accept-profile/);
  assert.match(allowedHeaders, /content-profile/);
  assert.match(allowedHeaders, /x-retry-count/);

  const proxied = await proxy.handler({
    httpMethod: 'GET',
    rawPath: '/rest/v1/settings',
    rawQueryString: 'select=value&limit=1',
    headers: {
      origin: 'https://calc2.recycleobject.ru',
    },
  });
  assert.strictEqual(proxied.headers['Access-Control-Allow-Origin'], 'https://calc2.recycleobject.ru');
  assert.doesNotMatch(proxied.headers['Access-Control-Allow-Origin'], /,/);

  console.log('yandex proxy runtime smoke checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

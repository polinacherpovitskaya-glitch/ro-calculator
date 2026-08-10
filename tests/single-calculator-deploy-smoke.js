const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const staticDeploy = read('.github/workflows/yandex-static-sync.yml');
const platformSmoke = read('.github/workflows/yandex-mirror-smoke.yml');
const writebackSmoke = read('.github/workflows/yandex-writeback-smoke.yml');
const liveSmoke = read('.github/workflows/live-site-smoke.yml');
const deployGate = read('.github/workflows/deploy-pages.yml');
const dataRefresh = read('.github/workflows/calculator-data-refresh.yml');
const redirect = read('ops/calc2-redirect.html');
const staticBuilder = read('scripts/build-yandex-static.mjs');
const floorPublisher = read('scripts/production-floor-publish.mjs');

assert.match(staticDeploy, /^name: Calculator static deploy$/m);
assert.doesNotMatch(staticDeploy, /^\s*schedule:/m, 'application deploy must not run on a timer');
assert.doesNotMatch(staticDeploy, /\bmatrix:/, 'the full application must not deploy once per domain');
assert.match(staticDeploy, /RO_YANDEX_BUCKET:\s*calc\.recycleobject\.ru/);
assert.match(staticDeploy, /RO_RETIRED_BUCKET:\s*calc2\.recycleobject\.ru/);
assert.match(staticDeploy, /UPLOAD_PARALLELISM:\s*(?:[2-9]|[1-9]\d+)/, 'uploads must use bounded parallelism');
assert.match(staticDeploy, /xargs -0 -r -n 1 -P "\$UPLOAD_PARALLELISM"/, 'bundle uploads must run in parallel');
assert.match(staticDeploy, /cancel-in-progress:\s*false/, 'a started release must not be interrupted mid-upload');

const assetsUpload = staticDeploy.indexOf("! -path 'deploy/static-yandex/js/version.json'");
const htmlUpload = staticDeploy.indexOf("-name '*.html' -print0");
const versionUpload = staticDeploy.indexOf('upload_one deploy/static-yandex/js/version.json');
const versionVerify = staticDeploy.indexOf('Verify published calculator version');
assert.ok(assetsUpload >= 0 && assetsUpload < htmlUpload, 'assets/data must publish before HTML');
assert.ok(htmlUpload < versionUpload, 'HTML must publish before the version marker');
assert.ok(versionUpload < versionVerify, 'the completed release must be verified after its final marker');

for (const objectKey of ['index.html', '404.html', 'floor/index.html']) {
  assert.ok(staticDeploy.includes(objectKey), `calc2 redirect must cover ${objectKey}`);
}
assert.doesNotMatch(
  staticDeploy,
  /s3:\/\/\$\{RO_RETIRED_BUCKET\}\/\$\{rel\}/,
  'the full bundle must never upload to the retired bucket',
);

assert.match(redirect, /data-retired-host="calc2"/);
assert.match(redirect, /location\.replace\(target\.toString\(\)\)/);
assert.match(redirect, /https:\/\/calc\.recycleobject\.ru\//);
assert.doesNotMatch(redirect, /<script\s+src=/i, 'the retired host must not load application JavaScript');

assert.match(platformSmoke, /^name: Calculator platform smoke$/m);
assert.match(platformSmoke, /https:\/\/calc\.recycleobject\.ru\//);
assert.doesNotMatch(platformSmoke, /^\s*schedule:/m, 'platform smoke runs once after a release, not forever on a timer');
assert.match(platformSmoke, /- Calculator static deploy/);
assert.match(liveSmoke, /- Calculator static deploy/);
assert.match(writebackSmoke, /- Calculator static deploy/);
assert.match(writebackSmoke, /^\s*schedule:/m, 'write-back monitoring must remain independent from deployment');

assert.match(dataRefresh, /^name: Calculator data refresh$/m);
assert.match(dataRefresh, /^\s*schedule:/m, 'operational snapshots must remain fresh between application releases');
assert.match(dataRefresh, /find deploy\/static-yandex\/data deploy\/static-yandex\/floor/);
assert.match(dataRefresh, /xargs -0 -r -n 1 -P "\$UPLOAD_PARALLELISM"/);
assert.doesNotMatch(dataRefresh, /deploy\/static-yandex\/js\/version\.json/);
assert.doesNotMatch(dataRefresh, /calc2\.recycleobject\.ru/);
assert.match(dataRefresh, /group:\s*calculator-object-storage-write/);
assert.match(staticDeploy, /group:\s*calculator-object-storage-write/);

assert.match(staticBuilder, /RO_YANDEX_BUCKET \|\| 'calc\.recycleobject\.ru'/);
assert.match(floorPublisher, /RO_FLOOR_ASSET_BASE \|\| 'https:\/\/calc\.recycleobject\.ru\/'/);
assert.match(deployGate, /node tests\/single-calculator-deploy-smoke\.js/);

console.log('single-calculator-deploy-smoke: OK');

const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/yandex-migration-backup.yml', 'utf8');

assert.match(
    workflow,
    /sed 's#  output\/yandex-production-backup\/#  #'/,
    'download verification must rewrite source paths to downloaded basenames'
);
assert.match(
    workflow,
    /\(cd output\/yandex-production-backup\/verify && sha256sum -c SHA256SUMS\)/,
    'checksums must be evaluated inside the download verification directory'
);
assert.doesNotMatch(
    workflow,
    /cp output\/yandex-production-backup\/SHA256SUMS output\/yandex-production-backup\/verify\/SHA256SUMS/,
    'source-relative checksum paths must not be copied unchanged into the verification directory'
);

console.log('yandex backup workflow smoke checks passed');

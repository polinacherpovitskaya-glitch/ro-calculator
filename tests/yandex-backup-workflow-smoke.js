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
assert.match(
    workflow,
    /docker exec supabase-db pg_dump/,
    'rollback Supabase database must remain in the daily backup'
);
assert.match(
    workflow,
    /docker exec ro-platform-shadow-postgres[\s\S]*pg_dump/,
    'active Yandex database must be included in the daily backup'
);
assert.match(
    workflow,
    /\/home\/robot\/platform-backups\/daily/,
    'active Yandex database must keep an independently verified VM copy'
);
assert.match(
    workflow,
    /target-yandex-postgres-\*\.dump/,
    'active Yandex database must be uploaded and downloaded for verification'
);
assert.match(
    workflow,
    /yc storage bucket update "\$RO_YANDEX_BACKUP_BUCKET"[\s\S]*--versioning versioning-enabled/,
    'private backup bucket must have versioning enabled'
);
assert.match(
    workflow,
    /yc storage bucket update "\$RO_YANDEX_MEDIA_BUCKET"[\s\S]*--versioning versioning-enabled/,
    'production media bucket must have versioning enabled'
);
assert.match(
    workflow,
    /cutover\/\$\{RO_CUTOVER_STAMP\}/,
    'verified cutover bundle must use a permanent prefix outside daily rotation'
);
assert.match(
    workflow,
    /sha256sum -c FINAL-SHA256SUMS/g,
    'final cutover checksums must be verified before and after cloud upload'
);
assert.doesNotMatch(
    workflow,
    /docker\s+(?:rm|volume\s+rm)\b/,
    'backup workflow must never remove containers or volumes'
);

console.log('yandex backup workflow smoke checks passed');

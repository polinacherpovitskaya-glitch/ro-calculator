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
    /RO_YANDEX_LOCAL_BACKUP_RETENTION_DAYS:\s*7/,
    'VM copies must have an explicit seven-day local retention policy'
);
assert.match(
    workflow,
    /RO_YANDEX_MIN_FREE_BYTES:\s*2147483648/,
    'VM backup must reserve two GiB before creating a new dump'
);
assert.match(
    workflow,
    /find "\$REMOTE_TARGET_DIR" -maxdepth 1 -type f[\s\S]*-mtime "\+\$RETENTION_DAYS" -delete/,
    'VM rotation must stay scoped to expired target database copies'
);
assert.match(
    workflow,
    /available_bytes=.*df --output=avail -B1 "\$REMOTE_TARGET_DIR"/,
    'VM backup must measure free space after local rotation'
);
assert.match(
    workflow,
    /remote_target_tmp="\$\{REMOTE_TARGET_FILE\}\.partial"/,
    'VM backup must write through a uniquely scoped partial file'
);
assert.match(
    workflow,
    /cleanup_remote_backup[\s\S]*rm -f -- "\$remote_target_tmp"[\s\S]*trap cleanup_remote_backup EXIT/,
    'failed VM dumps must remove their partial and current-generation files'
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
assert.doesNotMatch(
    workflow,
    /storage s3(?:api)? (?:rm|delete-object)/,
    'backup workflow must preserve every cloud generation'
);

console.log('yandex backup workflow smoke checks passed');

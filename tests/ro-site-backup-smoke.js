const assert = require('node:assert/strict');
const fs = require('node:fs');

const script = fs.readFileSync('ops/infra/scripts/backup-ro-site-supabase.sh', 'utf8');
const restore = fs.readFileSync('ops/infra/scripts/restore-ro-site-supabase-drill.sh', 'utf8');
const service = fs.readFileSync('ops/infra/systemd/ro-site-backup.service', 'utf8');
const timer = fs.readFileSync('ops/infra/systemd/ro-site-backup.timer', 'utf8');
const envExample = fs.readFileSync('ops/infra/systemd/ro-site-backup.env.example', 'utf8');

assert.match(script, /set -euo pipefail/, 'backup must fail closed');
assert.match(script, /pg_dump[^\n]+-Fc/, 'database backup must use custom format');
assert.match(script, /storage_name="ro-site-storage-/, 'Storage bytes must be archived separately');
assert.match(script, /sha256sum -c/, 'downloaded artifacts must pass SHA-256 read-back');
assert.match(script, /storage s3 cp/, 'artifacts must be copied to Yandex Object Storage');
assert.match(script, /auth_users/, 'manifest must record Auth user counts');
assert.match(script, /storage_objects/, 'manifest must record Storage object counts');
assert.match(script, /-maxdepth 1/, 'local rotation must remain scoped to the backup directory');
assert.doesNotMatch(script, /storage s3 rm|docker\s+(?:rm|volume\s+rm)|dropdb/, 'backup must not remove remote or production state');

assert.match(service, /User=robot/, 'service must run as the unprivileged VM operator');
assert.match(service, /EnvironmentFile=\/home\/robot\/ro-site-backup\/backup\.env/, 'secrets and profile settings must stay outside Git');
assert.match(timer, /Persistent=true/, 'missed backups must run after the VM returns');
assert.match(timer, /RandomizedDelaySec=300/, 'backup start should avoid exact timer contention');
assert.match(envExample, /RO_SITE_STORAGE_DIR=\/home\/robot\/sb\/docker\/volumes\/storage/, 'example must point at the self-hosted Storage volume');
assert.doesNotMatch(envExample, /AKIA|YC[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\./, 'example must not contain credentials');

assert.match(restore, /codex_ro_site_restore_/, 'restore drill must be confined to a disposable database name');
assert.match(restore, /restore_role="\$\{RO_SITE_RESTORE_ROLE:-supabase_admin\}"/, 'Supabase vault restore requires the original superuser role');
assert.match(restore, /restore stats mismatch/, 'restore drill must compare database counts to the backup manifest');
assert.match(restore, /tar -tzf/, 'Storage archive must pass a non-destructive traversal');
assert.match(restore, /database already exists; refusing to overwrite/, 'restore drill must refuse to overwrite an existing database');
assert.doesNotMatch(restore, /dropdb|docker\s+(?:rm|volume\s+rm)/, 'restore drill must not delete databases, containers or volumes');

console.log('RO site backup smoke checks passed');

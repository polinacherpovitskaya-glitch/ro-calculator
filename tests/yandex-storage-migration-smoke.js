const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/yandex-storage-migration.yml'),
  'utf8',
);
const stage = fs.readFileSync(
  path.join(root, 'ops/scripts/storage/stage-supabase-storage.mjs'),
  'utf8',
);
const verify = fs.readFileSync(
  path.join(root, 'ops/scripts/storage/verify-yandex-storage.mjs'),
  'utf8',
);

assert.match(workflow, /ro-platform-media-b1gl59l77vb50ihub2nd/);
assert.match(workflow, /storage\.objects/);
assert.match(workflow, /--recursive/);
assert.match(workflow, /verify-yandex-storage\.mjs/);
assert.match(stage, /storage size mismatch/i);
assert.match(stage, /sha256/);
assert.match(verify, /checksum mismatch/i);
assert.match(verify, /objectCount/);

console.log('Yandex storage migration smoke: ok');

import assert from 'node:assert/strict';
import { rewriteJson } from '../ops/scripts/refresh/14-rewrite-storage-urls.mjs';

const nested = {
  id: 1,
  mold_data: JSON.stringify({
    glb_url: 'https://db.recycleobject.ru/storage/v1/object/public/site-content/molds-3d/mold-1.glb',
    photo_url: 'https://db.recycleobject.ru/storage/v1/object/public/mold-photos/mold%201.jpg?token=old',
    untouched: 'https://example.test/image.jpg',
  }),
  attachments: [
    {
      url: 'https://db.recycleobject.ru/storage/v1/object/sign/product-images/orders/photo.png?token=old',
    },
    {
      url: '/api/supabase/storage/v1/object/public/product-images/orders/legacy.png',
    },
  ],
};

const result = rewriteJson(nested);
assert.equal(result.replacements, 4);
assert.doesNotThrow(() => JSON.stringify(result.value));

const moldData = JSON.parse(result.value.mold_data);
assert.equal(
  moldData.glb_url,
  'https://api.recycleobject.ru/api/storage/public/site-content/molds-3d/mold-1.glb',
);
assert.equal(
  moldData.photo_url,
  'https://api.recycleobject.ru/api/storage/public/mold-photos/mold%201.jpg',
);
assert.equal(moldData.untouched, 'https://example.test/image.jpg');
assert.equal(
  result.value.attachments[0].url,
  'https://api.recycleobject.ru/api/storage/public/product-images/orders/photo.png',
);
assert.equal(
  result.value.attachments[1].url,
  'https://api.recycleobject.ru/api/storage/public/product-images/orders/legacy.png',
);

const clean = rewriteJson(result.value);
assert.equal(clean.replacements, 0, 'URL rewrite must be idempotent');
assert.deepEqual(clean.value, result.value);

console.log('storage URL rewrite smoke checks passed');

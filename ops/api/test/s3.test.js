import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { presignedGetUrl, signSelectelUrls, uploadObject } from '../src/s3.js';

process.env.S3_MOCK_DIR = process.env.S3_MOCK_DIR || path.join(os.tmpdir(), 'ro-ops-s3-test');

test('uploadObject accepts an explicit bucket without breaking mock storage', async () => {
  await uploadObject('product-images/example.txt', Buffer.from('hello'), 'text/plain', 'ro-ops-product-images');

  const url = await presignedGetUrl('selectel://ro-ops-product-images/product-images/example.txt');

  assert.equal(url, 'mock-s3://ro-ops-product-images/product-images/example.txt');
});

test('signSelectelUrls recursively signs selectel URLs and leaves other values intact', async () => {
  const signed = await signSelectelUrls({
    photo_url: 'selectel://ro-ops-product-images/product-images/a.png',
    nested: [{ url: 'https://example.test/keep.png' }, { url: 'selectel://ro-ops-product-images/product-images/b.png' }],
  });

  assert.equal(signed.photo_url, 'mock-s3://ro-ops-product-images/product-images/a.png');
  assert.equal(signed.nested[0].url, 'https://example.test/keep.png');
  assert.equal(signed.nested[1].url, 'mock-s3://ro-ops-product-images/product-images/b.png');
});

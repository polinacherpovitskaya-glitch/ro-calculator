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
  const createdAt = new Date('2026-01-02T03:04:05.000Z');
  const signed = await signSelectelUrls({
    created_at: createdAt,
    photo_url: 'selectel://ro-ops-product-images/product-images/a.png',
    nested: [{ url: 'https://example.test/keep.png' }, { url: 'selectel://ro-ops-product-images/product-images/b.png' }],
  });

  assert.equal(signed.created_at, createdAt);
  assert.equal(signed.photo_url, 'mock-s3://ro-ops-product-images/product-images/a.png');
  assert.equal(signed.nested[0].url, 'https://example.test/keep.png');
  assert.equal(signed.nested[1].url, 'mock-s3://ro-ops-product-images/product-images/b.png');
});

test('presignedGetUrl can use product-images endpoint when bucket is regional', async () => {
  const previous = {
    S3_MOCK_DIR: process.env.S3_MOCK_DIR,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ENDPOINT_PRODUCT_IMAGES: process.env.S3_ENDPOINT_PRODUCT_IMAGES,
    S3_BUCKET_PRODUCT_IMAGES: process.env.S3_BUCKET_PRODUCT_IMAGES,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  };

  try {
    delete process.env.S3_MOCK_DIR;
    process.env.S3_ENDPOINT = 'https://s3.ru-3.storage.selcloud.ru';
    process.env.S3_ENDPOINT_PRODUCT_IMAGES = 'https://s3.ru-1.storage.selcloud.ru';
    process.env.S3_BUCKET_PRODUCT_IMAGES = 'ro-ops-product-images';
    process.env.S3_ACCESS_KEY = 'test-access-key';
    process.env.S3_SECRET_KEY = 'test-secret-key';

    const url = await presignedGetUrl('selectel://ro-ops-product-images/product-images/a.png');

    assert.match(url, /^https:\/\/s3\.ru-1\.storage\.selcloud\.ru\//);
    assert.match(url, /product-images\/a\.png/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('presignedGetUrl can use mold-photos endpoint when bucket is regional', async () => {
  const previous = {
    S3_MOCK_DIR: process.env.S3_MOCK_DIR,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ENDPOINT_MOLD_PHOTOS: process.env.S3_ENDPOINT_MOLD_PHOTOS,
    S3_BUCKET_MOLD_PHOTOS: process.env.S3_BUCKET_MOLD_PHOTOS,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
  };

  try {
    delete process.env.S3_MOCK_DIR;
    process.env.S3_ENDPOINT = 'https://s3.ru-3.storage.selcloud.ru';
    process.env.S3_ENDPOINT_MOLD_PHOTOS = 'https://s3.ru-1.storage.selcloud.ru';
    process.env.S3_BUCKET_MOLD_PHOTOS = 'ro-ops-mold-photos';
    process.env.S3_ACCESS_KEY = 'test-access-key';
    process.env.S3_SECRET_KEY = 'test-secret-key';

    const url = await presignedGetUrl('selectel://ro-ops-mold-photos/mold-photos/a.png');

    assert.match(url, /^https:\/\/s3\.ru-1\.storage\.selcloud\.ru\//);
    assert.match(url, /mold-photos\/a\.png/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

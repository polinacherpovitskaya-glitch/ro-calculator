import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'node:fs/promises';
import path from 'node:path';

let client = null;
let clientKey = '';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is required`);
    error.code = 'S3_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

function getBucket(bucket = undefined) {
  return bucket || requireEnv('S3_BUCKET');
}

function mockPath(key) {
  return process.env.S3_MOCK_DIR ? path.join(process.env.S3_MOCK_DIR, key) : null;
}

function getClient() {
  const endpoint = requireEnv('S3_ENDPOINT');
  const accessKeyId = requireEnv('S3_ACCESS_KEY');
  const secretAccessKey = requireEnv('S3_SECRET_KEY');
  const region = process.env.S3_REGION || 'ru-1';
  const nextKey = `${endpoint}|${region}|${accessKeyId}`;

  if (!client || clientKey !== nextKey) {
    client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    clientKey = nextKey;
  }
  return client;
}

export async function uploadObject(key, body, contentType, bucket = undefined) {
  const target = mockPath(key);
  if (target) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return;
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(bucket),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
}

export async function deleteObject(key, bucket = undefined) {
  const target = mockPath(key);
  if (target) {
    await fs.rm(target, { force: true });
    return;
  }

  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(bucket), Key: key }));
}

function selectelParts(value) {
  const match = String(value).match(/^selectel:\/\/([^/]+)\/(.+)$/);
  return match ? { bucket: match[1], key: match[2] } : null;
}

export async function presignedGetUrl(key, expiresIn = 600, bucket = undefined) {
  if (/^(https?:|data:)/.test(key)) {
    return key;
  }
  const selectel = selectelParts(key);
  if (selectel) {
    if (mockPath(selectel.key)) {
      return `mock-s3://${selectel.bucket}/${selectel.key}`;
    }
    return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: selectel.bucket, Key: selectel.key }), { expiresIn });
  }
  if (key.startsWith('supabase://') && process.env.SUPABASE_URL) {
    const storageKey = key.replace('supabase://', '');
    return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/bug-attachments/${encodeURI(storageKey)}`;
  }
  if (key.startsWith('data-url://') || key.startsWith('legacy-work-asset://')) {
    return '';
  }
  if (mockPath(key)) {
    return `mock-s3://${key}`;
  }

  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(bucket), Key: key }), { expiresIn });
}

export async function signSelectelUrls(value, expiresIn = 600) {
  if (typeof value === 'string') {
    return value.startsWith('selectel://') ? presignedGetUrl(value, expiresIn) : value;
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date || typeof value.toJSON === 'function') return value;
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => signSelectelUrls(entry, expiresIn)));
  }
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, entry]) => [key, await signSelectelUrls(entry, expiresIn)])
  );
  return Object.fromEntries(entries);
}

export function selectelUrlSigningMiddleware(expiresIn = 600) {
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      signSelectelUrls(body, expiresIn)
        .then((signed) => json(signed))
        .catch(next);
      return res;
    };
    next();
  };
}

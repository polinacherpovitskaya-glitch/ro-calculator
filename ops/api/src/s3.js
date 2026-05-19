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

function getBucket() {
  return requireEnv('S3_BUCKET');
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

export async function uploadObject(key, body, contentType) {
  const target = mockPath(key);
  if (target) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return;
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
}

export async function deleteObject(key) {
  const target = mockPath(key);
  if (target) {
    await fs.rm(target, { force: true });
    return;
  }

  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function presignedGetUrl(key, expiresIn = 600) {
  if (/^(https?:|data:)/.test(key)) {
    return key;
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

  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn });
}

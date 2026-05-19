import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

export async function presignedGetUrl(key, expiresIn = 600) {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: getBucket(), Key: key }), { expiresIn });
}

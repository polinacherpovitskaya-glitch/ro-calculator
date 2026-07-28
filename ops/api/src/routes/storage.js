import { Router } from 'express';
import multer from 'multer';
import { deleteObject, downloadObject, presignedGetUrl, uploadObject } from '../s3.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
const LOGICAL_BUCKETS = new Set([
  'bug-attachments',
  'mold-photos',
  'product-images',
  'site-content',
  'work-assets',
]);
const PUBLIC_BUCKETS = new Set([
  'bug-attachments',
  'mold-photos',
  'product-images',
  'site-content',
]);

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function logicalBucket(raw) {
  const bucket = String(raw || '').trim();
  if (!LOGICAL_BUCKETS.has(bucket)) {
    const error = new Error('Неизвестное хранилище');
    error.status = 404;
    error.code = 'STORAGE_BUCKET_NOT_FOUND';
    throw error;
  }
  return bucket;
}

function objectPath(raw) {
  const value = String(raw || '').replace(/^\/+/, '');
  const parts = value.split('/');
  if (!value || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
    const error = new Error('Некорректный путь к файлу');
    error.status = 400;
    error.code = 'INVALID_STORAGE_PATH';
    throw error;
  }
  return parts.join('/');
}

function storageKey(bucket, path) {
  return `${bucket}/${path}`;
}

async function sendObject(res, bucket, path, { publicCache = false } = {}) {
  const object = await downloadObject(storageKey(bucket, path));
  res.type(object.contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set(
    'Cache-Control',
    publicCache ? (object.cacheControl || 'public, max-age=3600') : 'private, no-store',
  );
  return res.send(object.body);
}

router.get('/public/:bucket/*', asyncHandler(async (req, res) => {
  const bucket = logicalBucket(req.params.bucket);
  if (!PUBLIC_BUCKETS.has(bucket)) {
    return res.status(404).json({
      error: { code: 'STORAGE_OBJECT_NOT_FOUND', message: 'Файл не найден' },
    });
  }
  return sendObject(res, bucket, objectPath(req.params[0]), { publicCache: true });
}));

router.get('/download/:bucket/*', requireAuth, asyncHandler(async (req, res) => {
  const bucket = logicalBucket(req.params.bucket);
  return sendObject(res, bucket, objectPath(req.params[0]));
}));

router.post(
  '/:bucket/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const bucket = logicalBucket(req.params.bucket);
    const path = objectPath(req.body?.path);
    if (!req.file?.buffer) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'Файл обязателен' },
      });
    }
    const contentType = String(req.body?.contentType || req.file.mimetype || 'application/octet-stream');
    await uploadObject(storageKey(bucket, path), req.file.buffer, contentType);
    return res.json({
      data: {
        path,
        fullPath: storageKey(bucket, path),
      },
    });
  }),
);

router.post('/:bucket/remove', requireAuth, asyncHandler(async (req, res) => {
  const bucket = logicalBucket(req.params.bucket);
  const paths = (Array.isArray(req.body?.paths) ? req.body.paths : [])
    .map((path) => objectPath(path));
  for (const path of paths) {
    await deleteObject(storageKey(bucket, path));
  }
  return res.json({ data: paths.map((path) => ({ name: path })) });
}));

router.post('/signed-url', requireAuth, asyncHandler(async (req, res) => {
  const bucket = logicalBucket(req.body?.bucket);
  const path = objectPath(req.body?.path);
  const expiresIn = Math.max(60, Math.min(3600, Number(req.body?.expiresIn) || 600));
  const signedUrl = await presignedGetUrl(storageKey(bucket, path), expiresIn);
  return res.json({ data: { signedUrl } });
}));

router.use((error, req, res, next) => {
  if (!error?.status && error?.code !== 'LIMIT_FILE_SIZE') return next(error);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status;
  return res.status(status).json({
    error: {
      code: error.code || 'STORAGE_ERROR',
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой' : error.message,
    },
  });
});

export default router;

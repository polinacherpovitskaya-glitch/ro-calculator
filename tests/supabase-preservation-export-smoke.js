const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function serviceRoleJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ role: 'service_role' })}.fixture-signature`;
}

(async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/rest/v1/') {
      res.end(JSON.stringify({ swagger: '2.0', definitions: { products: { type: 'object' } } }));
      return;
    }
    if (req.url === '/rest/v1/products?select=*') {
      res.end(JSON.stringify([{ id: 2, name: 'B' }, { name: 'A', id: 1 }]));
      return;
    }
    if (req.url === '/auth/v1/admin/users?page=1&per_page=1000') {
      res.end(JSON.stringify({ users: [{ id: 'user-1', email: 'fixture@example.test' }] }));
      return;
    }
    if (req.url === '/storage/v1/bucket') {
      res.end(JSON.stringify([{ id: 'product-images', name: 'product-images', public: true }]));
      return;
    }
    if (req.url === '/storage/v1/object/list/product-images') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      if (payload.prefix === '') {
        res.end(JSON.stringify([{ id: 'object-1', name: 'sample.txt', metadata: { size: 7 } }]));
      } else {
        res.end('[]');
      }
      return;
    }
    if (req.url === '/storage/v1/object/authenticated/product-images/sample.txt') {
      res.setHeader('content-type', 'application/octet-stream');
      res.end('fixture');
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-preservation-export-'));
  try {
    const modulePath = path.join(__dirname, '..', 'scripts', 'cloud-consolidation', 'export-supabase-project.mjs');
    const { containedPath, exportProject, storageRelativePath } = await import(pathToFileURL(modulePath).href);
    const address = server.address();
    const result = await exportProject({
      baseUrl: `http://127.0.0.1:${address.port}`,
      serviceRoleKey: serviceRoleJwt(),
      outDir: outputRoot,
    });

    assert.equal(result.manifest.summary.tableCount, 1);
    assert.equal(result.manifest.summary.rowCount, 2);
    assert.equal(result.manifest.summary.authUserCount, 1);
    assert.equal(result.manifest.summary.objectCount, 1);
    assert.equal(result.manifest.summary.objectBytes, 7);
    assert.equal(
      fs.readFileSync(path.join(outputRoot, 'storage', 'product-images', 'sample.txt'), 'utf8'),
      'fixture',
    );
    const rows = JSON.parse(fs.readFileSync(path.join(outputRoot, 'tables', 'products.json'), 'utf8'));
    assert.deepEqual(rows.map((row) => row.id), [1, 2], 'rows must be canonical and stable');
    assert.match(fs.readFileSync(path.join(outputRoot, 'SHA256SUMS'), 'utf8'), /storage\/product-images\/sample\.txt/);
    assert.ok(requests.includes('GET /auth/v1/admin/users?page=1&per_page=1000'));
    assert.equal(storageRelativePath('bucket', '../escape.txt'), 'storage/bucket/%2E%2E/escape.txt');
    assert.throws(() => containedPath(outputRoot, '../escape.txt'), /outside export root/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }

  console.log('supabase preservation export smoke checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

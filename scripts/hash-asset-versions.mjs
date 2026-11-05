#!/usr/bin/env node
// Deploy-time cache-busting: rewrite `foo.js?v=N` / `foo.css?v=N` in HTML files
// to `?v=<content hash of that file>`.
//
// Assets are served with `immutable, max-age=1y`, so the query string is the
// only thing that makes browsers refetch. Using the commit SHA for every asset
// (the previous approach) re-downloaded all ~1.2 MB of scripts after every
// deploy, even when only one file changed — ~10s on a slow link. With content
// hashes only the files that actually changed get new URLs.
//
// Usage: node scripts/hash-asset-versions.mjs [fallbackVersion] [root]
// If a referenced file cannot be found, fallbackVersion (e.g. the commit SHA)
// is used so the URL still changes on every release.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const fallback = process.argv[2] || String(Date.now());
const root = resolve(process.argv[3] || '.');
const ASSET_RE = /([^"'\s()=]+\.(?:js|css))\?v=[0-9]+/g;

function findHtmlFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git') continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...findHtmlFiles(full));
        else if (name.endsWith('.html')) out.push(full);
    }
    return out;
}

const hashCache = new Map();
function hashFile(path) {
    if (!hashCache.has(path)) {
        hashCache.set(path, createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10));
    }
    return hashCache.get(path);
}

let hashed = 0;
let fallbacks = 0;
for (const htmlPath of findHtmlFiles(root)) {
    const source = readFileSync(htmlPath, 'utf8');
    const updated = source.replace(ASSET_RE, (match, assetPath) => {
        const cleanPath = assetPath.replace(/^\.\//, '');
        const candidates = cleanPath.startsWith('/')
            ? [join(root, cleanPath)]
            : [join(dirname(htmlPath), cleanPath), join(root, cleanPath)];
        const found = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile());
        if (found) {
            hashed += 1;
            return `${assetPath}?v=${hashFile(found)}`;
        }
        fallbacks += 1;
        return `${assetPath}?v=${fallback}`;
    });
    if (updated !== source) writeFileSync(htmlPath, updated);
}

console.log(`hash-asset-versions: ${hashed} content-hashed, ${fallbacks} fallback (${fallback})`);

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'js', 'version.json'), 'utf8'));

const appMatch = appJs.match(/const APP_VERSION = '(v\d+)'/);
assert.ok(appMatch, 'APP_VERSION not found in js/app.js');
const appVersion = appMatch[1];

const sidebarMatch = indexHtml.match(/id="app-version">(v\d+)</);
assert.ok(sidebarMatch, 'Sidebar app-version placeholder not found in index.html');
const sidebarVersion = sidebarMatch[1];

assert.equal(versionJson.version, appVersion, 'js/version.json must match APP_VERSION');
assert.equal(sidebarVersion, appVersion, 'index.html app-version placeholder must match APP_VERSION');

console.log(`version smoke checks passed (${appVersion})`);

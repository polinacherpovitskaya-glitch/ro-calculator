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
assert.ok(appJs.includes('ro_calc_max_seen_version'), 'App should remember the newest seen version to warn about stale tabs');
assert.match(appJs, /window\.location\.replace\(/, 'Update action should hard-navigate to bypass stale cached HTML');
assert.match(appJs, /searchParams\.set\('reload'/, 'Update action should add a cache-busting reload token');
assert.match(appJs, /dataset\.targetVersion/, 'Update banner should remember the exact remote version shown to the user');

const appScriptMatch = indexHtml.match(/<script src="js\/app\.js\?v=(\d+)"><\/script>/);
assert.ok(appScriptMatch, 'index.html must include a versioned js/app.js asset');
assert.equal(appScriptMatch[1], appVersion.replace(/^v/, ''), 'index.html js/app.js asset version must match APP_VERSION number');

const sidebarNav = indexHtml.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/);
assert.ok(sidebarNav, 'Sidebar nav not found in index.html');
const calculatorLinks = [...sidebarNav[1].matchAll(/data-page="calculator"/g)];
assert.equal(calculatorLinks.length, 1, 'Sidebar must contain exactly one calculator link');
const sidebarPages = [...sidebarNav[1].matchAll(/data-page="([^"]+)"/g)].map(match => match[1]);
const chinaIndex = sidebarPages.indexOf('china');
const bugsIndex = sidebarPages.indexOf('bugs');
const settingsIndex = sidebarPages.indexOf('settings');
assert.notEqual(chinaIndex, -1, 'Sidebar must contain china link');
assert.notEqual(bugsIndex, -1, 'Sidebar must contain bugs link');
assert.notEqual(settingsIndex, -1, 'Sidebar must contain settings link');
assert.ok(chinaIndex < bugsIndex, 'Sidebar bugs link must be below china');
assert.ok(bugsIndex < settingsIndex, 'Sidebar bugs link must be above settings');

console.log(`version smoke checks passed (${appVersion})`);

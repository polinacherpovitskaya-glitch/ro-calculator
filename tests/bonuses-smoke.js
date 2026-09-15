const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const bonuses = fs.readFileSync(path.join(root, 'js', 'bonuses.js'), 'utf8');

assert.match(html, /<a href="#bonuses" data-page="bonuses">/, 'sidebar link');
assert.match(html, /id="page-bonuses"/, 'page container');
assert.match(html, /id="bonuses-team"/, 'team block container');
assert.match(html, /id="bonuses-people"/, 'people block container');
assert.match(html, /<script src="js\/bonuses\.js\?v=\d+"><\/script>/, 'script tag');
assert.match(app, /isOwner\(\)\s*\{/, 'App.isOwner exists');
assert.match(app, /if \(page === 'bonuses'\) return this\.isOwner\(\);/, 'canAccess gates bonuses by owner');
assert.doesNotMatch(app, /ALL_PAGES: \[[^\]]*'bonuses'/, 'bonuses must not be grantable');
assert.match(app, /case 'bonuses': Bonuses\.load\(\); break;/, 'onPageEnter loads page');
assert.match(bonuses, /credentials: 'include'/, 'API calls carry session cookie');
assert.match(bonuses, /font-size:\s*1[6-9]px/, 'base font is large enough');

console.log('bonuses-smoke: OK');

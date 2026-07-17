const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '..', 'js', 'settings.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

assert.match(index, /id="set-pricing-load-summary"/, 'settings must explain the annual load used by pricing');
assert.match(index, /id="settings-sync-notice"/, 'settings must visibly preserve a local-versus-shared conflict');
assert.doesNotMatch(index, /id="set-plastic_injection_ratio"/, 'legacy plastic share must not be editable in the current production settings');
assert.doesNotMatch(index, /id="set-packaging_ratio"/, 'unused packaging share must not be editable in the current production settings');
assert.match(index, /id="set-waste_factor"/, 'waste factor remains editable because it affects hours and costs');
assert.match(settings, /getSeasonalPlanEditorState/, 'settings must resolve an effective seasonal plan');
assert.match(settings, /preserveVisibleSettingsOnRemoteRefresh/, 'open settings must preserve local values during a remote refresh');
assert.match(app, /preserveVisibleSettingsOnRemoteRefresh/, 'the app must use the settings preservation guard');

console.log('settings-production-ui-smoke: OK');

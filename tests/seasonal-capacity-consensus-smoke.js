import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'js', 'settings.js'), 'utf8');
const sandbox = { console, Math, JSON, Number, String, Array, Object, Set, Date };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'js/settings.js' });

const run = expression => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));

const balanced = run(`calculateSeasonalLoadConsensus({
    workersCount: 4, hoursPerWorker: 180, workLoadRatio: 0.6,
    quarterPercentages: [60, 60, 60, 60],
})`);
assert.equal(balanced.quarterCapacity, 2160);
assert.deepEqual(balanced.quarterHours, [1296, 1296, 1296, 1296]);
assert.equal(balanced.plannedHours, 5184);
assert.equal(balanced.annualPercent, 60);
assert.equal(balanced.validForSave, true, 'equal quarters should agree with the 60% annual consensus');

const inconsistent = run(`calculateSeasonalLoadConsensus({
    workersCount: 4, hoursPerWorker: 180, workLoadRatio: 0.6,
    quarterPercentages: [40, 60, 80, 90],
})`);
assert.equal(inconsistent.annualPercent, 67.5);
assert.equal(inconsistent.plannedHours, 5832);
assert.equal(inconsistent.differenceHours, 648);
assert.equal(inconsistent.requiredPercentSum, 240);
assert.equal(inconsistent.validForSave, false, '40/60/80/90 must not be stored as a 60% annual plan');

const incomplete = run(`calculateSeasonalLoadConsensus({
    workersCount: 4, hoursPerWorker: 180, workLoadRatio: 0.6,
    quarterPercentages: [40, null, 80, 90],
})`);
assert.equal(incomplete.validForSave, false, 'a partial seasonal plan must not be saved');

const legacy = run(`getSeasonalPercentagesFromSettings({
    seasonal_load_plan_json: JSON.stringify({ Q1: 864, Q2: 1296, Q3: 1728, Q4: 1944 }),
}, 2160)`);
assert.deepEqual(legacy, [40, 60, 80, 90], 'legacy saved hours should open as editable percentages');

const derived = run(`getSeasonalPlanEditorState({ work_load_ratio: 0.6 }, 2160)`);
assert.equal(derived.source, 'derived', 'blank seasonal JSON keeps the yearly coefficient as the effective plan');
assert.deepEqual(derived.percentages, [60, 60, 60, 60], 'blank seasonal fields must display the effective 60% quarter plan');

const explicit = run(`getSeasonalPlanEditorState({
    work_load_ratio: 0.6,
    seasonal_load_percent_json: JSON.stringify({ Q1: 40, Q2: 60, Q3: 80, Q4: 60 }),
}, 2160)`);
assert.equal(explicit.source, 'saved', 'a saved percentage plan must not be replaced by a fallback');
assert.deepEqual(explicit.percentages, [40, 60, 80, 60]);

console.log('seasonal-capacity-consensus-smoke: OK');

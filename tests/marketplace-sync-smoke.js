const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase.js'), 'utf8');
const functionStart = source.indexOf('async function saveMarketplaceSet(mset)');
const functionEnd = source.indexOf('\nasync function deleteMarketplaceSet', functionStart);

assert.ok(functionStart >= 0 && functionEnd > functionStart, 'saveMarketplaceSet source should be available');
const saveFunctionSource = source.slice(functionStart, functionEnd);

function createContext({ ready, outcomes }) {
    const localSets = [];
    const writes = [];
    const rows = [];
    let attempts = 0;
    const context = vm.createContext({
        console: { error() {} },
        Date,
        Error,
        JSON,
        Promise,
        setTimeout(callback) {
            callback();
            return 1;
        },
        LOCAL_KEYS: { marketplaceSets: 'marketplaceSets' },
        isSupabaseReady() { return ready; },
        getLocal() { return localSets.slice(); },
        setLocal(_key, value) {
            writes.push(JSON.parse(JSON.stringify(value)));
            localSets.splice(0, localSets.length, ...value);
        },
        supabaseClient: {
            from(table) {
                assert.equal(table, 'marketplace_sets');
                return {
                    async upsert(row, options) {
                        attempts += 1;
                        rows.push(JSON.parse(JSON.stringify(row)));
                        assert.equal(options.onConflict, 'id');
                        const outcome = outcomes.shift() ?? { error: null };
                        if (outcome.throw) throw outcome.throw;
                        return outcome;
                    },
                };
            },
        },
    });
    vm.runInContext(`${saveFunctionSource}\nglobalThis.saveMarketplaceSet = saveMarketplaceSet;`, context);
    return { context, localSets, rows, writes, getAttempts: () => attempts };
}

async function main() {
    const recovered = createContext({
        ready: true,
        outcomes: [{ error: { message: 'temporary outage' } }, { error: null }],
    });
    const recoveredId = await recovered.context.saveMarketplaceSet({ name: 'Снежинка' });
    assert.equal(recovered.getAttempts(), 2, 'a failed shared write should be retried once');
    assert.equal(recovered.rows[0].id, recovered.rows[1].id, 'retry should reuse the same id');
    assert.equal(recovered.localSets[0].id, recoveredId);
    assert.equal(recovered.writes.length, 1, 'local cache should update only after shared write confirmation');

    const failed = createContext({
        ready: true,
        outcomes: [{ error: { message: 'outage one' } }, { throw: new Error('outage two') }],
    });
    await assert.rejects(
        failed.context.saveMarketplaceSet({ name: 'Рукавички' }),
        /не записан в общую базу/i,
    );
    assert.equal(failed.getAttempts(), 2);
    assert.equal(failed.writes.length, 0, 'failed shared write must not look saved in local cache');

    const localOnly = createContext({ ready: false, outcomes: [] });
    await localOnly.context.saveMarketplaceSet({ name: 'Локальная разработка' });
    assert.equal(localOnly.getAttempts(), 0);
    assert.equal(localOnly.writes.length, 1, 'local-only mode should preserve the existing fallback');

    console.log('marketplace sync smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

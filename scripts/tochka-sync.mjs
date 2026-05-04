#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';
const TOCHKA_BASE_URL = 'https://enter.tochka.com/uapi/open-banking/v1.0';
const SETTINGS_KEY = 'tochka_snapshot_json';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'ro-calculator', 'tochka.env');

function parseArgs(argv) {
    const args = { days: 21, configPath: DEFAULT_CONFIG_PATH };
    for (let i = 2; i < argv.length; i += 1) {
        const value = argv[i];
        if (value === '--days' && argv[i + 1]) {
            args.days = Number(argv[i + 1]) || args.days;
            i += 1;
        } else if (value === '--config' && argv[i + 1]) {
            args.configPath = argv[i + 1];
            i += 1;
        }
    }
    return args;
}

async function loadEnvFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return raw
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .reduce((acc, line) => {
                const idx = line.indexOf('=');
                if (idx <= 0) return acc;
                const key = line.slice(0, idx).trim();
                const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
                acc[key] = value;
                return acc;
            }, {});
    } catch (_) {
        return {};
    }
}

function isoDate(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function shiftDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function maskAccount(accountId) {
    const raw = String(accountId || '').split('/')[0];
    if (raw.length <= 8) return raw;
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function pickAccountDisplayName(account) {
    const detailName = Array.isArray(account?.accountDetails)
        ? account.accountDetails.find(item => item?.name)?.name
        : '';
    const masked = maskAccount(account?.accountId);
    return detailName ? `${detailName} ${masked}` : `${account?.accountSubType || 'Account'} ${masked}`;
}

function balancePriority(balanceMap = {}) {
    return balanceMap.ClosingAvailable || balanceMap.Expected || balanceMap.OpeningAvailable || null;
}

function normalizeBalances(balanceRows) {
    const grouped = new Map();
    for (const row of balanceRows || []) {
        const accountId = String(row?.accountId || '');
        if (!accountId) continue;
        if (!grouped.has(accountId)) grouped.set(accountId, {});
        grouped.get(accountId)[String(row?.type || 'unknown')] = row?.Amount || null;
    }
    return grouped;
}

function normalizeTransaction(tx, statement, accountLookup) {
    const amount = Number(tx?.Amount?.amount || 0);
    const direction = String(tx?.creditDebitIndicator || '') === 'Debit' ? 'out' : 'in';
    const party = direction === 'in' ? (tx?.DebtorParty || {}) : (tx?.CreditorParty || {});
    const partyAccount = direction === 'in' ? (tx?.DebtorAccount || {}) : (tx?.CreditorAccount || {});
    const accountId = String(statement?.accountId || '');
    const account = accountLookup.get(accountId) || null;

    return {
        source: 'tochka',
        sourceKind: 'bank',
        accountId,
        accountLabel: account?.displayName || maskAccount(accountId),
        date: String(tx?.documentProcessDate || statement?.endDateTime || '').slice(0, 10),
        amount,
        currency: String(tx?.Amount?.currency || account?.currency || 'RUB'),
        direction,
        description: String(tx?.description || '').trim(),
        counterpartyName: String(party?.name || partyAccount?.identification || '').trim(),
        counterpartyInn: String(party?.inn || '').trim(),
        documentNumber: String(tx?.documentNumber || '').trim(),
        paymentId: String(tx?.paymentId || '').trim(),
        transactionId: String(tx?.transactionId || '').trim(),
        transactionTypeCode: String(tx?.transactionTypeCode || '').trim(),
        statementId: String(statement?.statementId || '').trim(),
    };
}

async function tochkaGet(token, pathname) {
    const response = await fetch(`${TOCHKA_BASE_URL}${pathname}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Tochka GET ${pathname} -> ${response.status}: ${body.slice(0, 200)}`);
    }
    return response.json();
}

async function tochkaPost(token, pathname, body) {
    const response = await fetch(`${TOCHKA_BASE_URL}${pathname}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Tochka POST ${pathname} -> ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.json();
}

async function initStatements(token, accounts, startDate, endDate) {
    const results = [];
    for (const account of accounts) {
        const payload = {
            Data: {
                Statement: {
                    accountId: account.accountId,
                    startDateTime: startDate,
                    endDateTime: endDate,
                },
            },
        };
        const response = await tochkaPost(token, '/statements', payload);
        const statement = response?.Data?.Statement || null;
        if (statement?.statementId) results.push(statement);
    }
    return results;
}

async function waitForReadyStatements(token, statementIds, attempts = 8, delayMs = 1500) {
    const wanted = new Set(statementIds);
    const collected = new Map();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await tochkaGet(token, '/statements');
        for (const statement of response?.Data?.Statement || []) {
            const statementId = String(statement?.statementId || '');
            if (!wanted.has(statementId)) continue;
            collected.set(statementId, statement);
        }
        const ready = [...wanted].every(id => String(collected.get(id)?.status || '') === 'Ready');
        if (ready) break;
        await delay(delayMs);
    }
    return [...collected.values()];
}

async function saveSnapshot(snapshot) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/settings?on_conflict=key`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify([{
            key: SETTINGS_KEY,
            value: JSON.stringify(snapshot),
            updated_at: new Date().toISOString(),
        }]),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Supabase save -> ${response.status}: ${body.slice(0, 200)}`);
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const fileEnv = await loadEnvFile(args.configPath);
    const token = process.env.TOCHKA_JWT || fileEnv.TOCHKA_JWT || '';
    const clientId = process.env.TOCHKA_CLIENT_ID || fileEnv.TOCHKA_CLIENT_ID || '';
    const days = Number(process.env.TOCHKA_DAYS || fileEnv.TOCHKA_DAYS || args.days || 21);

    if (!token) {
        throw new Error(`TOCHKA_JWT not found. Set env var or create ${args.configPath}`);
    }

    const endDate = isoDate(new Date());
    const startDate = isoDate(shiftDays(new Date(), -Math.max(1, days)));

    const [accountsResponse, balancesResponse] = await Promise.all([
        tochkaGet(token, '/accounts'),
        tochkaGet(token, '/balances'),
    ]);

    const rawAccounts = accountsResponse?.Data?.Account || [];
    const rawBalances = balancesResponse?.Data?.Balance || [];
    const balanceMap = normalizeBalances(rawBalances);

    const accounts = rawAccounts.map(account => {
        const accountId = String(account?.accountId || '');
        const accountBalances = balanceMap.get(accountId) || {};
        const primary = balancePriority(accountBalances);
        return {
            accountId,
            displayName: pickAccountDisplayName(account),
            customerCode: String(account?.customerCode || ''),
            currency: String(account?.currency || ''),
            accountType: String(account?.accountType || ''),
            accountSubType: String(account?.accountSubType || ''),
            status: String(account?.status || ''),
            statusUpdateDateTime: account?.statusUpdateDateTime || null,
            details: Array.isArray(account?.accountDetails) ? account.accountDetails : [],
            balances: accountBalances,
            currentBalance: primary ? Number(primary.amount || 0) : null,
            currentBalanceCurrency: primary?.currency || String(account?.currency || ''),
        };
    });

    const initRows = await initStatements(token, accounts, startDate, endDate);
    const readyStatements = await waitForReadyStatements(token, initRows.map(item => item.statementId));
    const readyStatementIds = new Set(readyStatements.filter(item => item?.status === 'Ready').map(item => item.statementId));
    const accountLookup = new Map(accounts.map(item => [String(item.accountId), item]));
    const transactions = readyStatements
        .filter(statement => readyStatementIds.has(statement.statementId))
        .flatMap(statement => (statement.Transaction || []).map(tx => normalizeTransaction(tx, statement, accountLookup)))
        .filter(tx => tx.amount > 0 || tx.description || tx.counterpartyName)
        .sort((a, b) => `${b.date || ''}${b.transactionId || ''}`.localeCompare(`${a.date || ''}${a.transactionId || ''}`));

    const snapshot = {
        provider: 'tochka',
        synced_at: new Date().toISOString(),
        client_id: clientId || null,
        window: { startDate, endDate, days },
        accounts,
        transactions,
        statementMeta: readyStatements.map(item => ({
            statementId: item.statementId,
            accountId: item.accountId,
            status: item.status,
            startDateTime: item.startDateTime,
            endDateTime: item.endDateTime,
            transactionCount: Array.isArray(item.Transaction) ? item.Transaction.length : 0,
        })),
        stats: {
            accountCount: accounts.length,
            transactionCount: transactions.length,
            readyStatementCount: readyStatementIds.size,
        },
    };

    await saveSnapshot(snapshot);

    const summary = {
        syncedAt: snapshot.synced_at,
        accounts: snapshot.stats.accountCount,
        transactions: snapshot.stats.transactionCount,
        window: snapshot.window,
        sampleAccounts: accounts.slice(0, 4).map(item => ({
            displayName: item.displayName,
            accountId: maskAccount(item.accountId),
            balance: item.currentBalance,
            currency: item.currentBalanceCurrency,
        })),
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});

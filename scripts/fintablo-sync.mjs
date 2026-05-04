#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';
const FINTABLO_BASE_URL = 'https://api.fintablo.ru/v1';
const SETTINGS_KEY = 'fintablo_snapshot_json';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'ro-calculator', 'fintablo.env');

function parseArgs(argv) {
    const args = {
        days: 1200,
        configPath: DEFAULT_CONFIG_PATH,
        dateFrom: '',
        dateTo: '',
    };
    for (let i = 2; i < argv.length; i += 1) {
        const value = argv[i];
        if (value === '--days' && argv[i + 1]) {
            args.days = Number(argv[i + 1]) || args.days;
            i += 1;
        } else if (value === '--config' && argv[i + 1]) {
            args.configPath = argv[i + 1];
            i += 1;
        } else if (value === '--date-from' && argv[i + 1]) {
            args.dateFrom = argv[i + 1];
            i += 1;
        } else if (value === '--date-to' && argv[i + 1]) {
            args.dateTo = argv[i + 1];
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

function businessDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function shiftDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function toFintabloDate(value) {
    const raw = String(value || '').trim();
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return `${raw.slice(8, 10)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}`;
    }
    return raw;
}

function parseFintabloDate(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return '';
    return `${match[3]}-${match[2]}-${match[1]}`;
}

function mapMoneybagType(type) {
    const value = String(type || '').toLowerCase();
    if (value === 'bank') return 'bank';
    if (value === 'card' || value === 'nal') return 'cash';
    return 'settlement';
}

async function fintabloGet(token, pathname, params = {}) {
    const url = new URL(`${FINTABLO_BASE_URL}${pathname}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value == null || value === '') return;
        url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`FinTablo GET ${pathname} -> ${response.status}: ${body.slice(0, 200)}`);
    }
    return response.json();
}

async function loadPaged(token, pathname, params = {}, pageSize = 500) {
    const all = [];
    let page = 1;
    while (true) {
        const response = await fintabloGet(token, pathname, {
            ...params,
            page,
            pageSize,
        });
        const items = Array.isArray(response?.items) ? response.items : [];
        all.push(...items);
        if (items.length < pageSize) break;
        page += 1;
    }
    return all;
}

function normalizeMoneybag(item) {
    return {
        moneybagId: String(item?.id || ''),
        id: `fintablo_${String(item?.id || '').trim()}`,
        displayName: String(item?.name || '').trim(),
        type: String(item?.type || '').trim(),
        sourceKind: mapMoneybagType(item?.type),
        number: String(item?.number || '').trim(),
        currency: String(item?.currency || 'RUB').trim(),
        balance: Number(item?.balance || 0),
        archived: !!item?.archived,
        hideInTotal: !!item?.hideInTotal,
        groupId: String(item?.groupId || '').trim(),
    };
}

function normalizeTransaction(item, moneybagMap) {
    const legacyMoneybagId = String(item?.moneybagId || '').trim();
    const moneybag = moneybagMap.get(legacyMoneybagId) || null;
    const group = String(item?.group || '').trim();
    const direction = group === 'income' ? 'in' : 'out';
    return {
        source: 'fintablo',
        sourceKind: moneybag?.sourceKind || 'cash',
        transactionId: `fintablo:${String(item?.id || '').trim()}`,
        legacyTransactionId: String(item?.id || '').trim(),
        accountId: moneybag?.id || `fintablo_${legacyMoneybagId}`,
        accountLabel: moneybag?.displayName || `FinTablo ${legacyMoneybagId}`,
        bankNumber: moneybag?.number || '',
        moneybagId: moneybag?.id || `fintablo_${legacyMoneybagId}`,
        legacyMoneybagId,
        date: parseFintabloDate(item?.date),
        amount: Math.abs(Number(item?.value || 0)),
        currency: moneybag?.currency || 'RUB',
        direction,
        group,
        description: String(item?.description || '').trim(),
        counterpartyName: '',
        counterpartyInn: '',
        partnerId: String(item?.partnerId || '').trim(),
        categoryId: String(item?.categoryId || '').trim(),
        directionId: item?.directionId == null ? '' : String(item.directionId).trim(),
        dealId: item?.dealId == null ? '' : String(item.dealId).trim(),
        parentId: String(item?.parentId || '').trim(),
        isPlan: !!item?.isPlan,
        factMonth: String(item?.factMonth || '').trim(),
    };
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
    const token = process.env.FINTABLO_API_KEY || fileEnv.FINTABLO_API_KEY || '';
    if (!token) {
        throw new Error(`FINTABLO_API_KEY not found. Set env var or create ${args.configPath}`);
    }

    const today = new Date();
    const endDate = args.dateTo || businessDate(today);
    const startDate = args.dateFrom || businessDate(shiftDays(today, -Math.max(1, args.days)));

    const [moneybagItems, transactionItems] = await Promise.all([
        loadPaged(token, '/moneybag', {}),
        loadPaged(token, '/transaction', {
            isPlan: 0,
            dateFrom: toFintabloDate(startDate),
            dateTo: toFintabloDate(endDate),
        }),
    ]);

    const accounts = moneybagItems.map(normalizeMoneybag);
    const moneybagMap = new Map(accounts.map(item => [item.moneybagId, item]));
    const transactions = transactionItems
        .map(item => normalizeTransaction(item, moneybagMap))
        .filter(item => item.date && item.amount > 0)
        .sort((a, b) => `${b.date}${b.transactionId}`.localeCompare(`${a.date}${a.transactionId}`));

    const snapshot = {
        provider: 'fintablo',
        synced_at: new Date().toISOString(),
        window: { startDate, endDate, days: args.dateFrom ? null : args.days },
        accounts,
        transactions,
        stats: {
            accountCount: accounts.length,
            transactionCount: transactions.length,
        },
    };

    await saveSnapshot(snapshot);

    process.stdout.write(`${JSON.stringify({
        syncedAt: snapshot.synced_at,
        window: snapshot.window,
        accounts: snapshot.stats.accountCount,
        transactions: snapshot.stats.transactionCount,
        sampleAccounts: accounts.slice(0, 6).map(item => ({
            id: item.id,
            name: item.displayName,
            hidden: item.hideInTotal,
            archived: item.archived,
        })),
    }, null, 2)}\n`);
}

main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});

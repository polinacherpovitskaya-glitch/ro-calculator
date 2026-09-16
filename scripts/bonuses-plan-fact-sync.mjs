#!/usr/bin/env node
// Синк плана и факта по деньгам для страницы «Бонусы» (по расписанию из
// GitHub Actions). Вся логика в ops/api/src/bonuses/fintablo.js, та же, что у
// кнопки «Обновить из Финтабло сейчас» на странице.
//
// Переменные окружения:
//   OPS_API_URL         (default https://api.recycleobject.ru)
//   OPS_BOT_TOKEN       обязателен для записи (роль bot или admin)
//   FINTABLO_API_KEY    если пуст, факт не синкается, только план
//   BONUS_PLAN_SHEET_ID / BONUS_PLAN_SHEET_GID   таблица плана
//   FINTABLO_DIRECTION  имя направления в Финтабло (default "Recycle Object")
// Флаги: --dry-run (ничего не пишет, печатает payload), --year 2026

import { pathToFileURL } from 'node:url';
import { runMoneySync, DEFAULT_SHEET_ID, DEFAULT_DIRECTION_NAME } from '../ops/api/src/bonuses/fintablo.js';

export {
    parseMoney, parseCsv, parsePlanCsv, tiersToPeriods, quarterOfDate, moneyQuarterWindow, MONEY_QUARTER_SHIFT_DAYS,
    directionTreeIds, sumIncomeByQuarter, buildPayload,
} from '../ops/api/src/bonuses/fintablo.js';

async function postSync(apiUrl, token, payload) {
    const response = await fetch(`${apiUrl}/api/bonuses/sync/team-money`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`API sync -> ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body.data;
}

export async function main(argv = process.argv, env = process.env) {
    const dryRun = argv.includes('--dry-run');
    const yearArg = argv[argv.indexOf('--year') + 1];
    const today = new Date().toISOString().slice(0, 10);
    const year = argv.includes('--year') && /^\d{4}$/.test(yearArg) ? Number(yearArg) : Number(today.slice(0, 4));
    const apiUrl = env.OPS_API_URL || 'https://api.recycleobject.ru';

    const { payload } = await runMoneySync({
        token: env.FINTABLO_API_KEY || '',
        year,
        today,
        sheetId: env.BONUS_PLAN_SHEET_ID || DEFAULT_SHEET_ID,
        gid: env.BONUS_PLAN_SHEET_GID || '0',
        directionName: env.FINTABLO_DIRECTION || DEFAULT_DIRECTION_NAME,
        log: (line) => console.log(line),
    });
    console.log(JSON.stringify(payload, null, 2));
    if (dryRun) return payload;
    if (!env.OPS_BOT_TOKEN) throw new Error('OPS_BOT_TOKEN не задан');
    const result = await postSync(apiUrl, env.OPS_BOT_TOKEN, payload);
    console.log(`Записано: ${JSON.stringify(result)}`);
    return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

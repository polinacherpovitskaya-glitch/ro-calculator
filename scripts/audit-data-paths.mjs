import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = 'js/supabase.js';
const outputDir = path.join(root, 'output', 'codebase-audit');
const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');

function lineOf(index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function findMatchingBrace(startIndex) {
  let depth = 0;
  let inString = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function extractFunctions() {
  const funcs = [];
  const re = /^\s*(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
  for (const match of source.matchAll(re)) {
    const openBrace = source.indexOf('{', match.index);
    const closeBrace = findMatchingBrace(openBrace);
    if (closeBrace < 0) continue;
    const name = match[2];
    if (!/^(load|save|delete|update|upsert|remove|create|sync)/.test(name)) continue;
    const body = source.slice(openBrace, closeBrace + 1);
    funcs.push({
      name,
      line: lineOf(match.index),
      kind: name.replace(/^([a-z]+).*/, '$1'),
      tables: unique([...body.matchAll(/\.from\(['"]([^'"]+)['"]\)/g)].map(row => row[1])),
      localKeys: unique([...body.matchAll(/LOCAL_KEYS\.([A-Za-z0-9_$]+)/g)].map(row => row[1])),
      settingKeys: unique([
        ...body.matchAll(/(?:const\s+)?[A-Z0-9_]*SETTINGS_KEY\s*=\s*['"]([^'"]+)['"]/g),
        ...body.matchAll(/saveSetting\(['"]([^'"]+)['"]/g),
        ...body.matchAll(/loadSetting\(['"]([^'"]+)['"]/g),
        ...body.matchAll(/_loadJsonSetting\(['"]([^'"]+)['"]/g),
        ...body.matchAll(/_saveJsonSetting\(['"]([^'"]+)['"]/g),
      ].map(row => row[1])),
      hasFallback: /\bfallback\b|catch\s*\(|getLocal\(|setLocal\(/.test(body),
      writesRemote: /\.upsert\(|\.insert\(|\.update\(|\.delete\(|saveSetting\(|_saveJsonSetting\(/.test(body),
      readsRemote: /\.select\(|loadSetting\(|_loadJsonSetting\(/.test(body),
      usesTimeout: /_withRemoteTimeout\(/.test(body),
    });
  }
  return funcs;
}

function moduleName(name) {
  const lower = name.toLowerCase();
  if (lower.includes('warehouse') || lower.includes('shipment') || lower.includes('readygoods') || lower.includes('salesrecords')) return 'warehouse';
  if (lower.includes('china')) return 'china';
  if (lower.includes('order') || lower.includes('fintablo')) return 'orders';
  if (lower.includes('mold') || lower.includes('blank') || lower.includes('color') || lower.includes('marketplace')) return 'catalog';
  if (lower.includes('finance') || lower.includes('bank') || lower.includes('tochka')) return 'finance';
  if (lower.includes('time') || lower.includes('employee') || lower.includes('auth') || lower.includes('vacation')) return 'people';
  if (lower.includes('work') || lower.includes('task') || lower.includes('project') || lower.includes('bug') || lower.includes('wiki')) return 'work';
  if (lower.includes('setting') || lower.includes('template') || lower.includes('production')) return 'settings';
  return 'other';
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const functions = extractFunctions().map(item => ({ ...item, module: moduleName(item.name) }));
  const modules = {};
  functions.forEach(fn => {
    if (!modules[fn.module]) {
      modules[fn.module] = {
        functions: 0,
        writers: 0,
        readers: 0,
        fallbackFunctions: 0,
        tables: new Set(),
        localKeys: new Set(),
        settingKeys: new Set(),
      };
    }
    const bucket = modules[fn.module];
    bucket.functions += 1;
    if (fn.writesRemote) bucket.writers += 1;
    if (fn.readsRemote) bucket.readers += 1;
    if (fn.hasFallback) bucket.fallbackFunctions += 1;
    fn.tables.forEach(value => bucket.tables.add(value));
    fn.localKeys.forEach(value => bucket.localKeys.add(value));
    fn.settingKeys.forEach(value => bucket.settingKeys.add(value));
  });

  const moduleRows = Object.entries(modules)
    .map(([name, row]) => ({
      module: name,
      functions: row.functions,
      writers: row.writers,
      readers: row.readers,
      fallbackFunctions: row.fallbackFunctions,
      tables: [...row.tables].sort(),
      localKeys: [...row.localKeys].sort(),
      settingKeys: [...row.settingKeys].sort(),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile,
    totals: {
      functions: functions.length,
      writers: functions.filter(fn => fn.writesRemote).length,
      readers: functions.filter(fn => fn.readsRemote).length,
      fallbackFunctions: functions.filter(fn => fn.hasFallback).length,
      remoteTables: unique(functions.flatMap(fn => fn.tables)).length,
      localKeys: unique(functions.flatMap(fn => fn.localKeys)).length,
      settingKeys: unique(functions.flatMap(fn => fn.settingKeys)).length,
    },
    modules: moduleRows,
    functions,
  };

  fs.writeFileSync(path.join(outputDir, 'data-paths.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Data Path Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Source: \`${sourceFile}\``,
    '',
    '## Totals',
    `- Load/save/update/delete functions: ${report.totals.functions}`,
    `- Remote writers: ${report.totals.writers}`,
    `- Remote readers: ${report.totals.readers}`,
    `- Functions with fallback/local cache behavior: ${report.totals.fallbackFunctions}`,
    `- Remote tables referenced: ${report.totals.remoteTables}`,
    `- Local cache keys referenced: ${report.totals.localKeys}`,
    `- JSON/settings keys referenced: ${report.totals.settingKeys}`,
    '',
    '## Modules',
    '| Module | Functions | Writers | Readers | Fallback | Tables | Local keys | Settings keys |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...moduleRows.map(row => [
      row.module,
      row.functions,
      row.writers,
      row.readers,
      row.fallbackFunctions,
      row.tables.join(', ') || '-',
      row.localKeys.join(', ') || '-',
      row.settingKeys.join(', ') || '-',
    ].map(value => String(value).replace(/\|/g, '\\|')).join(' | ')).map(row => `| ${row} |`),
    '',
    '## Write Functions',
    ...functions
      .filter(fn => fn.writesRemote || /^(save|delete|update|upsert|remove|create|sync)/.test(fn.name))
      .map(fn => `- ${fn.name} (${sourceFile}:${fn.line}) -> tables: ${fn.tables.join(', ') || '-'}; local: ${fn.localKeys.join(', ') || '-'}; settings: ${fn.settingKeys.join(', ') || '-'}; fallback: ${fn.hasFallback ? 'yes' : 'no'}`),
    '',
    'Full JSON report: `output/codebase-audit/data-paths.json`',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'data-paths.md'), md);
  console.log(md);
}

main();

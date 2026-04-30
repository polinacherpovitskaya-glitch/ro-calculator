import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const SURFACES = [
  'js/calculator.js',
  'js/molds.js',
  'js/app.js',
  'js/pendant.js',
  'js/tpa.js',
  'js/marketplaces.js',
  'index.html',
  'supabase-schema.sql',
];

const STALE_PATTERNS = [
  {
    label: 'commercial multiplied by VAT',
    pattern: /0\.065\s*\*\s*\(1\s*\+\s*[^)]+\)/g,
  },
  {
    label: 'charity multiplied by VAT',
    pattern: /charityRate[^;\n]*\*\s*\(1\s*\+\s*[^)]+\)|0\.01\s*\*\s*\(1\s*\+\s*[^)]+\)/g,
  },
  {
    label: 'old UI copy about charity/commercial with VAT',
    pattern: /благотворительности\s+с\s+НДС|коммерческ(?:ого|ий)\s+с\s+НДС/gi,
  },
];

const EXPECTED_SNIPPETS = [
  { file: 'js/calculator.js', snippet: 'function getNetRevenueRetentionRate(params)' },
  { file: 'js/molds.js', snippet: 'Цена без НДС = себест / (1 - налоги - коммерческий - благотворительность - target_net_margin)' },
  { file: 'index.html', snippet: 'Коммерческий отдел (6.5% от базы без НДС)' },
  { file: 'index.html', snippet: 'Налоги от выручки без НДС (7%)' },
  { file: 'index.html', snippet: 'Благотворительность (1% от базы без НДС)' },
  { file: 'supabase-schema.sql', snippet: "('indirect_costs_monthly', 1900000" },
  { file: 'supabase-schema.sql', snippet: "('cutting_speed', 300" },
  { file: 'supabase-schema.sql', snippet: "('tax_rate', 0.07" },
  { file: 'supabase-schema.sql', snippet: "('charity_rate', 0.01" },
];

function rel(file) {
  return path.join(ROOT, file);
}

function read(file) {
  return fs.readFileSync(rel(file), 'utf8');
}

let failed = false;

console.log('Pricing surface audit');
console.log(`Root: ${ROOT}`);

for (const file of SURFACES) {
  const source = read(file);
  console.log(`\n[scan] ${file}`);
  const hits = [];
  for (const rule of STALE_PATTERNS) {
    const matches = [...source.matchAll(rule.pattern)];
    if (matches.length > 0) {
      hits.push(`${rule.label} × ${matches.length}`);
    }
  }
  if (hits.length > 0) {
    failed = true;
    console.log(`  stale patterns: ${hits.join(', ')}`);
  } else {
    console.log('  stale patterns: none');
  }
}

for (const check of EXPECTED_SNIPPETS) {
  const source = read(check.file);
  const ok = source.includes(check.snippet);
  console.log(`[expect] ${check.file}: ${ok ? 'ok' : 'missing'} -> ${check.snippet}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nPricing surface audit failed');
  process.exit(1);
}

console.log('\nPricing surface audit passed');

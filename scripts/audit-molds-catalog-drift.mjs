import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const apply = process.argv.includes('--apply');
const TIERS = [50, 100, 300, 500, 1000, 3000];

function extractSupabaseConfig() {
  const source = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
  const urlMatch = source.match(/const SUPABASE_URL = '([^']+)'/);
  const keyMatch = source.match(/const SUPABASE_ANON_KEY = '([^']+)'/);
  if (!urlMatch || !keyMatch) {
    throw new Error('Could not extract Supabase config from js/supabase.js');
  }
  return {
    url: urlMatch[1],
    key: keyMatch[1],
  };
}

function createElement(id = '') {
  return {
    id,
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    appendChild() {},
    remove() {},
    focus() {},
    click() {},
    closest() { return null; },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    insertAdjacentHTML() {},
    scrollIntoView() {},
  };
}

function createDocument() {
  const elements = new Map();
  return {
    body: createElement('body'),
    addEventListener() {},
    createElement(tag) {
      return createElement(tag);
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function createVmContext() {
  const document = createDocument();
  const context = {
    console,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    setTimeout,
    clearTimeout,
    document,
    window: null,
    formatRub(value) {
      return `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
    },
    round2(value) {
      return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    },
    App: {
      toast() {},
      params: {},
    },
    loadMolds: async () => [],
    refreshTemplatesFromMolds() {},
  };
  context.window = context;
  return vm.createContext(context);
}

function runScript(context, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const code = fs.readFileSync(absolutePath, 'utf8');
  vm.runInContext(code, context, { filename: relativePath });
}

async function restFetch(config, resource, search = '') {
  const response = await fetch(`${config.url}/rest/v1/${resource}${search}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${resource} request failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function restPatch(config, resource, search, payload) {
  const response = await fetch(`${config.url}/rest/v1/${resource}${search}`, {
    method: 'PATCH',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${resource} patch failed (${response.status}): ${text}`);
  }
}

function parseMoldRow(row) {
  let mold = {};
  if (typeof row?.mold_data === 'string') {
    try {
      mold = JSON.parse(row.mold_data);
    } catch {
      mold = {};
    }
  } else if (row?.mold_data && typeof row.mold_data === 'object') {
    mold = { ...row.mold_data };
  }
  return {
    ...mold,
    id: row?.id ?? mold.id,
    name: row?.name || mold.name || '',
    created_at: row?.created_at || mold.created_at,
    updated_at: row?.updated_at || mold.updated_at,
  };
}

function getPublishedPrices(mold) {
  const prices = {};
  const snapshot = mold?.tiers_prices && typeof mold.tiers_prices === 'object' ? mold.tiers_prices : {};
  for (const qty of TIERS) {
    const direct = Number(snapshot[qty] ?? snapshot[String(qty)]);
    if (Number.isFinite(direct) && direct > 0) {
      prices[qty] = Math.round(direct);
      continue;
    }
    const legacyTier = Number(mold?.tiers?.[qty]?.sellPrice ?? mold?.tiers?.[String(qty)]?.sellPrice);
    if (Number.isFinite(legacyTier) && legacyTier > 0) {
      prices[qty] = Math.round(legacyTier);
      continue;
    }
    const legacyTopLevel = Number(
      qty === 1000 ? mold?.price1000
        : qty === 3000 ? mold?.price3000
          : mold?.[`price${qty}`]
    );
    if (Number.isFinite(legacyTopLevel) && legacyTopLevel > 0) {
      prices[qty] = Math.round(legacyTopLevel);
    }
  }
  return prices;
}

async function main() {
  const config = extractSupabaseConfig();
  const settingsRows = await restFetch(
    config,
    'settings',
    '?select=key,value&key=in.(vat_rate,fot_per_hour,plastic_cost_per_kg,nfc_write_speed,workers_count,hours_per_worker,work_load_ratio,plastic_injection_ratio,cutting_speed,indirect_costs_monthly,tax_rate,charity_rate,indirect_cost_mode,mold_base_cost,design_cost,nfc_tag_cost,margin_target,delivery_cost_moscow,printing_delivery_cost,waste_factor,packaging_ratio)',
  );
  const settings = Object.fromEntries((settingsRows || []).map(row => {
    const raw = String(row.value ?? '');
    const numeric = Number(raw);
    return [row.key, Number.isFinite(numeric) && raw !== '' ? numeric : raw];
  }));

  const moldRows = await restFetch(config, 'molds', '?select=*&order=name.asc');
  const parsedMolds = (moldRows || []).map(parseMoldRow);

  const context = createVmContext();
  runScript(context, 'js/calculator.js');
  runScript(context, 'js/molds.js');
  context.__settings = settings;
  context.__molds = JSON.parse(JSON.stringify(parsedMolds));
  context.App.params = vm.runInContext('getProductionParams(__settings)', context);
  const enrichedJson = vm.runInContext(`
    (function () {
      Molds.allMolds = __molds;
      Molds.enrichMolds();
      return JSON.stringify(Molds.allMolds);
    })()
  `, context);
  const enrichedMolds = JSON.parse(enrichedJson);

  const mismatches = [];
  for (const mold of enrichedMolds) {
    if (String(mold?.status || '').toLowerCase() !== 'active') continue;
    const publishedPrices = getPublishedPrices(mold);
    const computedPrices = Object.fromEntries(TIERS.map(qty => [qty, Math.round(Number(mold?.tiers?.[qty]?.sellPrice || 0))]));
    const priceDiffs = TIERS.filter(qty => computedPrices[qty] !== (publishedPrices[qty] || 0));
    const dimensionMismatch = [
      ['width_mm', Number(mold.width_mm || 0), Number((mold?.width_mm ?? 0) || 0)],
      ['height_mm', Number(mold.height_mm || 0), Number((mold?.height_mm ?? 0) || 0)],
      ['depth_mm', Number(mold.depth_mm || 0), Number((mold?.depth_mm ?? 0) || 0)],
    ].filter(([, computed, published]) => computed !== published);
    const storedWeight = Number(mold.weight_grams || 0);
    const storedCollection = String(mold.collection || '');
    if (priceDiffs.length || dimensionMismatch.length) {
      mismatches.push({
        id: mold.id,
        name: mold.name,
        priceDiffs,
        computedPrices,
        publishedPrices,
        weight_grams: storedWeight,
        collection: storedCollection,
        width_mm: Number(mold.width_mm || 0),
        height_mm: Number(mold.height_mm || 0),
        depth_mm: Number(mold.depth_mm || 0),
      });
    }
  }

  if (mismatches.length === 0) {
    console.log(`No catalog drift found across ${enrichedMolds.length} molds.`);
    return;
  }

  console.log(`Found ${mismatches.length} mold(s) with published catalog drift.`);
  mismatches.slice(0, 20).forEach(item => {
    console.log(`- ${item.id} ${item.name}`);
    if (item.priceDiffs.length) {
      console.log(`  price tiers: ${item.priceDiffs.map(qty => `${qty}: ${item.publishedPrices[qty] || 0} -> ${item.computedPrices[qty]}`).join(', ')}`);
    }
    if (item.width_mm || item.height_mm || item.depth_mm) {
      console.log(`  size: ${item.width_mm}×${item.height_mm}×${item.depth_mm}`);
    }
  });

  if (!apply) return;

  for (const item of mismatches) {
    const row = moldRows.find(entry => Number(entry.id) === Number(item.id));
    if (!row) continue;
    const mold = parseMoldRow(row);
    mold.tiers_prices = Object.fromEntries(TIERS.map(qty => [qty, item.computedPrices[qty]]));
    mold.tiers_published_at = new Date().toISOString();
    mold.weight_grams = item.weight_grams;
    mold.collection = item.collection;
    mold.width_mm = item.width_mm;
    mold.height_mm = item.height_mm;
    mold.depth_mm = item.depth_mm;
    await restPatch(config, 'molds', `?id=eq.${encodeURIComponent(item.id)}`, {
      mold_data: mold,
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`Applied catalog republish to ${mismatches.length} mold(s).`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

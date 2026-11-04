// Атомарные патчи для legacy-«блобов» склада: одна строка compat_rows хранит
// весь список (резервы, история, готовая продукция) или набор карт (галочки
// «собрано»). Раньше вкладки перезаписывали такую строку целиком из своей,
// возможно устаревшей, копии. Здесь клиент присылает только изменения, а
// сервер вливает их в текущее значение под блокировкой таблицы.

export const BLOB_TARGETS = Object.freeze({
  warehouse_reservations: {
    table: 'warehouse_reservations',
    primaryKey: ['id'],
    sourceId: '1',
    keyRow: { id: 1 },
    field: 'reservations_data',
    kind: 'records',
  },
  warehouse_history: {
    table: 'warehouse_history',
    primaryKey: ['id'],
    sourceId: '1',
    keyRow: { id: 1 },
    field: 'history_data',
    kind: 'records',
  },
  project_hardware_state: {
    table: 'settings',
    primaryKey: ['key'],
    sourceId: 'project_hardware_state_json',
    keyRow: { key: 'project_hardware_state_json' },
    field: 'value',
    kind: 'maps',
  },
  // Склад готовой продукции: три списка записей, каждый в своей строке settings.
  ready_goods_stock: {
    table: 'settings',
    primaryKey: ['key'],
    sourceId: 'ready_goods_stock_json',
    keyRow: { key: 'ready_goods_stock_json' },
    field: 'value',
    kind: 'records',
  },
  ready_goods_history: {
    table: 'settings',
    primaryKey: ['key'],
    sourceId: 'ready_goods_history_json',
    keyRow: { key: 'ready_goods_history_json' },
    field: 'value',
    kind: 'records',
  },
  ready_goods_sales_records: {
    table: 'settings',
    primaryKey: ['key'],
    sourceId: 'ready_goods_sales_records_json',
    keyRow: { key: 'ready_goods_sales_records_json' },
    field: 'value',
    kind: 'records',
  },
});

function recordId(record) {
  const id = record?.id;
  return id === null || id === undefined || id === '' ? null : String(id);
}

export function parseBlobValue(raw, kind) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = value.trim() ? JSON.parse(value) : null;
    } catch {
      value = null;
    }
  }
  if (kind === 'records') return Array.isArray(value) ? value : [];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// upserts replace records with the same id in place; new ones go to the start
// (ids listed in prependIds, kept in their given order) or the end.
// removeIds only removes what the client explicitly removed.
export function mergeRecords(current, patch = {}) {
  const removeIds = new Set((patch.removeIds || []).map((id) => String(id)));
  const prependIds = new Set((patch.prependIds || []).map((id) => String(id)));
  const result = (current || []).filter((record) => {
    const id = recordId(record);
    return id === null || !removeIds.has(id);
  });
  const indexById = new Map();
  result.forEach((record, index) => {
    const id = recordId(record);
    if (id !== null && !indexById.has(id)) indexById.set(id, index);
  });
  const front = [];
  const back = [];
  const added = new Set();
  for (const record of patch.upserts || []) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const id = recordId(record);
    if (id !== null && indexById.has(id)) {
      result[indexById.get(id)] = record;
      continue;
    }
    if (id !== null && (removeIds.has(id) || added.has(id))) continue;
    (id !== null && prependIds.has(id) ? front : back).push(record);
    if (id !== null) added.add(id);
  }
  return [...front, ...result, ...back];
}

export function mergeMaps(current, patch = {}) {
  const next = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch.top || {})) {
    next[key] = value;
  }
  for (const [mapName, entries] of Object.entries(patch.set || {})) {
    const base = next[mapName] && typeof next[mapName] === 'object' && !Array.isArray(next[mapName])
      ? next[mapName]
      : {};
    next[mapName] = { ...base, ...(entries || {}) };
  }
  for (const [mapName, keys] of Object.entries(patch.remove || {})) {
    if (!next[mapName] || typeof next[mapName] !== 'object' || Array.isArray(next[mapName])) continue;
    const map = { ...next[mapName] };
    for (const key of keys || []) delete map[String(key)];
    next[mapName] = map;
  }
  return next;
}

// Every reconcile/save of project hardware releases the active auto
// reservations of an (order, item) pair and creates fresh ones. When two tabs
// do that at once, a merge keeps both fresh sets. The newest batch supersedes
// the older one, so release the older active rows of that pair.
export function releaseSupersededProjectHardwareReservations(records, nowIso) {
  const newestByKey = new Map();
  for (const record of records) {
    if (record?.status !== 'active' || record?.source !== 'project_hardware') continue;
    const key = `${record.order_id}:${record.item_id}`;
    const createdAt = String(record.created_at || '');
    if (!newestByKey.has(key) || createdAt > newestByKey.get(key)) newestByKey.set(key, createdAt);
  }
  let released = 0;
  const next = records.map((record) => {
    if (record?.status !== 'active' || record?.source !== 'project_hardware') return record;
    const key = `${record.order_id}:${record.item_id}`;
    if (String(record.created_at || '') >= newestByKey.get(key)) return record;
    released += 1;
    return { ...record, status: 'released', released_at: nowIso, released_reason: 'superseded' };
  });
  return { records: next, released };
}

export function applyBlobPatchToValue(targetName, currentValue, patch, nowIso) {
  const target = BLOB_TARGETS[targetName];
  if (target.kind === 'records') {
    let records = mergeRecords(parseBlobValue(currentValue, 'records'), patch);
    if (targetName === 'warehouse_reservations') {
      records = releaseSupersededProjectHardwareReservations(records, nowIso).records;
    }
    return records;
  }
  return mergeMaps(parseBlobValue(currentValue, 'maps'), patch);
}

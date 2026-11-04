// Общий читатель строк legacy-таблиц calc. Единственная точка, откуда
// серверные модули читают compat_rows целиком.
export async function readCompatRows(client, table, lock = false, narrow = null) {
  // `narrow` is an optional list of alternatives combined with OR:
  // { sourceIds: [...] } or { contains: {...} } (GIN compat_rows_data_gin_idx).
  // It only narrows what Postgres sends back; callers still apply their exact
  // JS filters, so a too-wide narrow is safe and a missing one reads it all.
  const params = [table];
  const alternatives = [];
  for (const entry of Array.isArray(narrow) ? narrow : []) {
    if (Array.isArray(entry?.sourceIds) && entry.sourceIds.length) {
      params.push(entry.sourceIds.map((id) => String(id)));
      alternatives.push(`source_id = ANY($${params.length}::text[])`);
    } else if (entry?.contains && typeof entry.contains === 'object') {
      params.push(JSON.stringify(entry.contains));
      alternatives.push(`data @> $${params.length}::jsonb`);
    }
  }
  const narrowSql = alternatives.length ? ` AND (${alternatives.join(' OR ')})` : '';
  const { rows } = await client.query(
    `SELECT data
       FROM compat_rows
      WHERE table_name = $1${narrowSql}
      ORDER BY source_id${lock ? ' FOR UPDATE' : ''}`,
    params,
  );
  return rows.map((row) => row.data);
}

const SAFE_INTEGER_TEXT = /^-?\d{1,15}$/;

// JS filters compare with String(left) === String(right), so 42 and "42" are
// the same value. Containment is type-exact: ask for both spellings.
export function equalityNarrow(column, value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value)
    : typeof value === 'string' && SAFE_INTEGER_TEXT.test(value) ? value
      : null;
  if (text === null) return null;
  return [
    { contains: { [column]: Number(text) } },
    { contains: { [column]: text } },
  ];
}

// Builds a narrow from the first selective filter ("eq"/"in" on a safe
// integer); returns null when nothing safe can be pushed down.
export function narrowForFilters(filters, primaryKey) {
  for (const filter of Array.isArray(filters) ? filters : []) {
    if (!filter || typeof filter.column !== 'string') continue;
    const isSourceId = primaryKey.length === 1 && primaryKey[0] === filter.column;
    if (filter.op === 'eq') {
      if (isSourceId && filter.value !== null && filter.value !== undefined && typeof filter.value !== 'object') {
        return [{ sourceIds: [String(filter.value)] }];
      }
      const narrow = equalityNarrow(filter.column, filter.value);
      if (narrow) return narrow;
    }
    if (filter.op === 'in' && isSourceId && Array.isArray(filter.value) && filter.value.length
      && filter.value.every((value) => value !== null && value !== undefined && typeof value !== 'object')) {
      return [{ sourceIds: filter.value.map((value) => String(value)) }];
    }
  }
  return null;
}

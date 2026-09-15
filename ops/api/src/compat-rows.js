// Общий читатель строк legacy-таблиц calc. Единственная точка, откуда
// серверные модули читают compat_rows целиком.
export async function readCompatRows(client, table, lock = false) {
  const { rows } = await client.query(
    `SELECT data
       FROM compat_rows
      WHERE table_name = $1
      ORDER BY source_id${lock ? ' FOR UPDATE' : ''}`,
    [table],
  );
  return rows.map((row) => row.data);
}

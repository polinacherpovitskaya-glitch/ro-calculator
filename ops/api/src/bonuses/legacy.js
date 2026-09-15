import { readCompatRows } from '../compat-rows.js';

// Legacy-строки calc из compat_rows, нужные расчёту бонусов.
export async function loadLegacyBonusData(client) {
  const [orders, timeEntries, employees, settingsRows] = await Promise.all([
    readCompatRows(client, 'orders'),
    readCompatRows(client, 'time_entries'),
    readCompatRows(client, 'employees'),
    readCompatRows(client, 'settings'),
  ]);
  const settings = {};
  for (const row of settingsRows) {
    if (row && row.key !== undefined) settings[String(row.key)] = row.value;
  }
  return { orders, timeEntries, employees, settings };
}

export function activeEmployees(employees) {
  return employees
    .filter((e) => e && e.is_active !== false)
    .map((e) => ({ id: e.id, name: String(e.name || ''), role: String(e.role || '') }));
}

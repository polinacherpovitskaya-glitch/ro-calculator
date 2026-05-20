import { apiFetch } from './index';

export interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: number | null;
}

export async function listSettings() {
  const { settings } = await apiFetch<{ settings: SettingRow[] }>('/api/settings');
  return settings;
}

export async function getSetting(key: string) {
  const { setting } = await apiFetch<{ setting: SettingRow }>(`/api/settings/${encodeURIComponent(key)}`);
  return setting;
}

export async function putSetting(key: string, value: unknown) {
  const { setting } = await apiFetch<{ setting: SettingRow }>(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  return setting;
}

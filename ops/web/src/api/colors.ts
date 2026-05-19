import { apiFetch } from './index';

export interface AppColor {
  id: number;
  name: string;
  hex: string | null;
  category: string | null;
}

export interface ColorInput {
  id?: number;
  name: string;
  hex?: string | null;
  category?: string | null;
}

export type ColorPatch = Partial<ColorInput>;

export async function listColors(params: { search?: string; category?: string } = {}): Promise<AppColor[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.category) searchParams.set('category', params.category);
  const query = searchParams.toString();
  const { colors } = await apiFetch<{ colors: AppColor[] }>(`/api/colors${query ? `?${query}` : ''}`);
  return colors;
}

export async function createColor(input: ColorInput): Promise<AppColor> {
  const { color } = await apiFetch<{ color: AppColor }>('/api/colors', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return color;
}

export async function updateColor(id: number, patch: ColorPatch): Promise<AppColor> {
  const { color } = await apiFetch<{ color: AppColor }>(`/api/colors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return color;
}

export async function deleteColor(id: number): Promise<void> {
  await apiFetch<void>(`/api/colors/${id}`, { method: 'DELETE' });
}

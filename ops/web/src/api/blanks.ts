import { apiFetch } from './index';

export type BlankKind = 'hardware' | 'packaging';

export interface Blank {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  weight?: number | null;
  last_price: number | null;
  last_currency: string | null;
  photo_url?: string | null;
}

export interface BlankInput {
  id?: number;
  sku?: string | null;
  name: string;
  category?: string | null;
  weight?: number | null;
  last_price?: number | null;
  last_currency?: string | null;
  photo_url?: string | null;
}

export type BlankPatch = Partial<BlankInput>;

export async function listBlanks(kind: BlankKind, params: { search?: string; category?: string } = {}): Promise<Blank[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.category) searchParams.set('category', params.category);
  const query = searchParams.toString();
  const { blanks } = await apiFetch<{ blanks: Blank[] }>(`/api/blanks/${kind}${query ? `?${query}` : ''}`);
  return blanks;
}

export async function createBlank(kind: BlankKind, input: BlankInput): Promise<Blank> {
  const { blank } = await apiFetch<{ blank: Blank }>(`/api/blanks/${kind}`, {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return blank;
}

export async function updateBlank(kind: BlankKind, id: number, patch: BlankPatch): Promise<Blank> {
  const { blank } = await apiFetch<{ blank: Blank }>(`/api/blanks/${kind}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return blank;
}

export async function deleteBlank(kind: BlankKind, id: number): Promise<void> {
  await apiFetch<void>(`/api/blanks/${kind}/${id}`, { method: 'DELETE' });
}

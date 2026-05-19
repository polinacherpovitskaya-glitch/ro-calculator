import { apiFetch } from './index';

export interface ProductTemplate {
  id: number;
  name: string;
  category: string | null;
  data: Record<string, unknown>;
  is_active: boolean;
}

export interface ProductTemplateInput {
  id?: number;
  name: string;
  category?: string | null;
  data?: Record<string, unknown>;
  is_active?: boolean;
}

export async function listTemplates(params: { search?: string; category?: string; active?: boolean } = {}): Promise<ProductTemplate[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.category) searchParams.set('category', params.category);
  if (params.active !== undefined) searchParams.set('active', String(params.active));
  const query = searchParams.toString();
  const { templates } = await apiFetch<{ templates: ProductTemplate[] }>(`/api/templates${query ? `?${query}` : ''}`);
  return templates;
}

export async function createTemplate(input: ProductTemplateInput): Promise<ProductTemplate> {
  const { template } = await apiFetch<{ template: ProductTemplate }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now(), data: input.data || {} }),
  });
  return template;
}

export async function updateTemplate(id: number, patch: Partial<ProductTemplateInput>): Promise<ProductTemplate> {
  const { template } = await apiFetch<{ template: ProductTemplate }>(`/api/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return template;
}

export async function deleteTemplate(id: number): Promise<void> {
  await apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' });
}

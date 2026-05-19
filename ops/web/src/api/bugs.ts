import { apiFetch } from './index';

export interface BugAttachment {
  id: number;
  bug_id: number;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_key: string;
  uploaded_at: string;
  url?: string;
}

export interface BugReport {
  id: number;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'fixed' | 'wontfix' | 'duplicate';
  page: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
  assignee_id: number | null;
  extras?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  attachment_count?: number;
  attachments?: BugAttachment[];
}

export interface BugInput {
  id?: number;
  title: string;
  description?: string | null;
  severity?: BugReport['severity'];
  status?: BugReport['status'];
  page?: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  assignee_id?: number | null;
}

export type BugPatch = Partial<BugInput>;

export async function listBugs(params: { status?: string; severity?: string; page?: string; search?: string } = {}): Promise<BugReport[]> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.severity) searchParams.set('severity', params.severity);
  if (params.page) searchParams.set('page', params.page);
  if (params.search) searchParams.set('search', params.search);
  const query = searchParams.toString();
  const { bugs } = await apiFetch<{ bugs: BugReport[] }>(`/api/bugs${query ? `?${query}` : ''}`);
  return bugs;
}

export async function getBug(id: number): Promise<BugReport> {
  const { bug } = await apiFetch<{ bug: BugReport }>(`/api/bugs/${id}`);
  return bug;
}

export async function createBug(input: BugInput): Promise<BugReport> {
  const { bug } = await apiFetch<{ bug: BugReport }>('/api/bugs', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return bug;
}

export async function updateBug(id: number, patch: BugPatch): Promise<BugReport> {
  const { bug } = await apiFetch<{ bug: BugReport }>(`/api/bugs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return bug;
}

export async function deleteBug(id: number): Promise<void> {
  await apiFetch<void>(`/api/bugs/${id}`, { method: 'DELETE' });
}

export async function uploadBugAttachment(id: number, file: File): Promise<BugAttachment> {
  const form = new FormData();
  form.set('file', file);
  const res = await fetch(`/api/bugs/${id}/attachments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body.error || { code: 'HTTP_ERROR', message: `HTTP ${res.status}` };
  }
  const { attachment } = await res.json();
  return attachment;
}

export async function deleteBugAttachment(bugId: number, attachmentId: number): Promise<void> {
  await apiFetch<void>(`/api/bugs/${bugId}/attachments/${attachmentId}`, { method: 'DELETE' });
}

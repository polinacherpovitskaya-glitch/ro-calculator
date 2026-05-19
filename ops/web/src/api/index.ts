export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const method = String(init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('Idempotency-Key', crypto.randomUUID());
  }

  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const fallback = { code: 'HTTP_ERROR', message: `HTTP ${res.status}` };
    throw (body.error as ApiError | undefined) || fallback;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

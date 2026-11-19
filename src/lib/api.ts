let csrfTokenMemory = '';

export function setCsrfToken(token: string) {
  csrfTokenMemory = token;
}

export function getCsrfToken(): string {
  return csrfTokenMemory;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  if (data.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  return handleResponse<T>(res);
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfTokenMemory,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfTokenMemory,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrfTokenMemory,
    },
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrfTokenMemory,
    },
    body: formData,
  });
  return handleResponse<T>(res);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColorClass(status: string): string {
  const s = status.toLowerCase();
  if (
    s.includes('resolved') ||
    s.includes('action recorded') ||
    s.includes('closed') ||
    s.includes('confirmed') ||
    s.includes('approved')
  ) {
    return 'text-emerald-400';
  }
  if (
    s.includes('verified') ||
    s.includes('active') ||
    s.includes('scheduled') ||
    s.includes('in progress') ||
    s.includes('referred') ||
    s.includes('assigned')
  ) {
    return 'text-cyan-400';
  }
  if (s.includes('rejected') || s.includes('cancelled')) {
    return 'text-rose-400';
  }
  return 'text-amber-400';
}

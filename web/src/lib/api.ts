export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.map(String).join('; ');
  }
  return fallback;
}

// Production (CapRover): VITE_API_URL=/api → nginx proxies to the API app.
// Local: default to the Nest API on :3000 (or set VITE_API_URL in .env).
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api');

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(
  path: string,
  options: {
    method?: Method;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const url = path.startsWith('http')
    ? path
    : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      messageFromBody(parsed, res.statusText || `HTTP ${res.status}`),
      parsed,
    );
  }

  return parsed as T;
}

export const apiUrl = BASE;

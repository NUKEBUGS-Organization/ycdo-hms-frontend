/* YCDO HMS - API client. Every call carries the bearer token; a 401 ends the session.
   In mock mode (localhost + ?mock=1) the same calls are answered by api-mock.js in memory. */
(function () {
  const CFG = window.HMS_CONFIG;
  const store = {
    get() { try { return sessionStorage.getItem(CFG.tokenKey); } catch (e) { return null; } },
    set(t) { try { if (t) sessionStorage.setItem(CFG.tokenKey, t); else sessionStorage.removeItem(CFG.tokenKey); } catch (e) { /* private mode */ } },
  };
  let token = store.get();
  let onUnauthorized = () => {};

  class ApiError extends Error {
    constructor(status, message, data) { super(message); this.name = 'ApiError'; this.status = status; this.data = data || null; }
  }

  function qs(query) {
    if (!query) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    const s = p.toString();
    return s ? '?' + s : '';
  }

  function messageOf(status, data) {
    let m = data && data.message;
    if (Array.isArray(m)) m = m.join('. ');
    if (m) return String(m);
    if (status === 403) return 'You are not allowed to do this';
    if (status === 404) return 'Not found';
    if (status === 413) return 'The file is too large';
    if (status >= 500) return 'The HMS server had a problem. Try again in a minute.';
    return `Request failed (${status})`;
  }

  /**
   * opts: { query, body (JSON), form (FormData), blob: true to return a Blob, noAuthRedirect }
   */
  async function request(method, path, opts = {}) {
    if (CFG.mock) {
      if (!window.HMS_MOCK) throw new ApiError(0, 'Mock API not loaded');
      try { return await window.HMS_MOCK.handle(method, path, { ...opts, token }); }
      catch (e) {
        if (e instanceof ApiError && e.status === 401 && !opts.noAuthRedirect) { setToken(null); onUnauthorized(); }
        throw e;
      }
    }
    const headers = { Accept: opts.blob ? '*/*' : 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let body;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    let r;
    try {
      r = await fetch(CFG.apiBase + path + qs(opts.query), { method, headers, body, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      throw new ApiError(0, 'Cannot reach the HMS server. Check the internet connection and try again.');
    }
    if (r.status === 401 && !opts.noAuthRedirect) {
      setToken(null); onUnauthorized();
      throw new ApiError(401, 'Your session has ended. Please sign in again.');
    }
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      throw new ApiError(r.status, messageOf(r.status, data), data);
    }
    if (opts.blob) return r.blob();
    if (r.status === 204) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }

  function setToken(t) { token = t || null; store.set(token); }

  window.API = {
    ApiError,
    get: (path, query, o) => request('GET', path, { ...o, query }),
    post: (path, body, o) => request('POST', path, { ...o, body }),
    patch: (path, body, o) => request('PATCH', path, { ...o, body }),
    upload: (path, form) => request('POST', path, { form }),
    blob: (path) => request('GET', path, { blob: true }),
    request,
    token: () => token,
    setToken,
    onUnauthorized: (fn) => { onUnauthorized = fn; },
  };
})();

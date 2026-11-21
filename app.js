/* YCDO HMS (Phase 0: DRH registration + police dashboard) - shell: sign-in (with the Super Admin
   OTP step), header, sidebar, hash router, render helpers (h.*), toasts, modal, print, searchable
   selects and input masks. The helpers and look are taken from the approved prototype.
   Screens live in drh.js and register themselves with HMS.screen(). */
(function () {
  const CFG = window.HMS_CONFIG;
  const ORG = { name: 'Youth Community Development Organization', short: 'YCDO', tagline: 'SERVE HUMANITY', uan: '0304-1110222' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (Number(n) || 0).toLocaleString('en-PK');
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return '—'; return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtTime = (iso) => { if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return '—'; return `${pad(d.getHours() % 12 || 12)}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`; };
  const rel = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const hh = Math.round(m / 60); if (hh < 24) return hh + ' h ago'; return Math.round(hh / 24) + ' d ago'; };

  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    drh: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M12 8v8M8 12h8"/></svg>',
    menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    print: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    out: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></svg>',
  };

  const state = { me: null, meta: null, token: API.token(), login: { stage: 'password', email: '', challengeId: null, message: '' },
    modal: null, toasts: [], navOpen: false, centreId: readCentre(), screen: null, params: {}, underCare: {} };
  const screens = {};
  const actions = {};
  let memo = {};
  let renderSeq = 0;
  let lastRouteKey = null;

  function readCentre() { try { return sessionStorage.getItem('hms-centre') || 'all'; } catch (e) { return 'all'; } }
  function setCentre(id) { state.centreId = id || 'all'; try { sessionStorage.setItem('hms-centre', state.centreId); } catch (e) { /* ignore */ } }

  /* ── input rules (from the prototype) ─────────────────────
     Person names: letters, spaces and hyphen only. Phone: 11 digits, shown 03xx-xxxxxxx.
     CNIC: 13 digits, shown 36302-4842068-3. Dashes are inserted while typing. */
  const KIND_ATTRS = { person: 'maxlength="60" autocomplete="off"', phone: 'maxlength="12" inputmode="numeric"', cnic: 'maxlength="15" inputmode="numeric"' };
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const MASK = {
    person: (v) => String(v).replace(/[^\p{L}\s.-]/gu, '').replace(/\s{2,}/g, ' ').replace(/-{2,}/g, '-').replace(/^[\s.-]+/, ''),
    phone: (v) => { const d = digits(v).slice(0, 11); return d.length > 4 ? d.slice(0, 4) + '-' + d.slice(4) : d; },
    cnic: (v) => { const d = digits(v).slice(0, 13); return d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; },
  };
  const VALID = {
    person: (v) => (/^\p{L}+\.?(?:[\s-]\p{L}+\.?)*$/u.test(v.trim()) ? '' : 'may contain letters, spaces and hyphens only (e.g. Saif-Ur-Rehman)'),
    phone: (v) => (/^0\d{10}$/.test(digits(v)) ? '' : 'must be 11 digits starting with 0 (e.g. 0312-4578965)'),
    cnic: (v) => (/^\d{5}-\d{7}-\d$/.test(v.trim()) ? '' : 'must be 13 digits in the format 36302-4842068-3'),
  };
  function invalidField(form) {
    for (const el of form.querySelectorAll('[data-kind]')) {
      const v = el.value.trim(); if (!v) continue;
      const why = VALID[el.dataset.kind](v); if (why) return { el, why };
    }
    return null;
  }

  /* ── render helpers (prototype h.*) ─────────────────────── */
  const h = {
    esc, num, date: fmtDate, time: fmtTime, rel, digits,
    page: (title, sub, acts) => `<div class="page-h"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${acts ? `<div class="row">${acts}</div>` : ''}</div>`,
    /* k.href makes the whole card a link */
    kpis: (items) => `<div class="kpis">${items.map((k) => { const inner = `<div class="l">${esc(k.label)}</div><div class="v">${esc(k.value)}</div>${k.sub ? `<div class="s muted">${esc(k.sub)}</div>` : ''}`; return k.href ? `<a class="kpi click ${k.tone || ''}" href="${esc(k.href)}" title="Open the list">${inner}</a>` : `<div class="kpi ${k.tone || ''}">${inner}</div>`; }).join('')}</div>`,
    card: ({ title, subtitle, actions: acts, body, tone, id }) => `<div class="card ${tone ? 'tone-' + tone : ''}" ${id ? `id="${esc(id)}"` : ''}>${title ? `<div class="card-h"><div><h3>${esc(title)}</h3>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</div>${acts ? `<div class="actions">${acts}</div>` : ''}</div>` : ''}<div class="card-b">${body}</div></div>`,
    badge: (t, tone = '') => `<span class="badge ${tone}">${esc(t)}</span>`,
    /* rowHref(r) -> '#/...' makes the row open that page */
    table: ({ columns, rows, empty, rowHref }) => {
      if (!rows || !rows.length) return h.empty(empty || 'Nothing here yet');
      return `<div class="table-wrap"><table class="table"><thead><tr>${columns.map((c) => `<th class="${c.align === 'right' ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => { const href = rowHref ? rowHref(r) : null; return `<tr ${href ? `class="click" data-href="${esc(href)}" tabindex="0"` : ''}>${columns.map((c) => `<td class="${c.align === 'right' ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
    },
    field: (f) => {
      const id = esc(f.id); const req = f.required ? ' <span class="req">*</span>' : '';
      const kind = f.kind || null; const kattr = kind ? ` data-kind="${kind}" ${KIND_ATTRS[kind]}` : '';
      let ctrl;
      if (f.type === 'select') ctrl = `<select id="${id}" name="${id}" ${f.change ? `data-change="${esc(f.change)}"` : ''} ${f.plain ? 'data-plain="true"' : ''} ${f.disabled ? 'disabled' : ''}>${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') ctrl = `<textarea id="${id}" name="${id}" placeholder="${esc(f.placeholder || '')}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}>${esc(f.value || '')}</textarea>`;
      else if (f.type === 'file') ctrl = `<input id="${id}" name="${id}" type="file" ${f.accept ? `accept="${esc(f.accept)}"` : ''}>`;
      else ctrl = `<input id="${id}" name="${id}" type="${esc(f.type || 'text')}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.readonly ? 'readonly' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.inputmode ? `inputmode="${esc(f.inputmode)}"` : ''} ${f.autocomplete ? `autocomplete="${esc(f.autocomplete)}"` : ''} ${f.autofocus ? 'autofocus' : ''}${kattr}>`;
      return `<div class="field ${f.error ? 'err' : ''}" ${f.span ? `style="grid-column: span ${f.span}"` : ''}><label for="${id}">${esc(f.label)}${req}</label>${ctrl}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}${f.error ? `<div class="error">${esc(f.error)}</div>` : ''}</div>`;
    },
    btn: (b) => `<button type="button" class="btn ${b.tone || ''} ${b.size || ''}" data-action="${esc(b.action)}" ${b.arg != null ? `data-arg="${esc(b.arg)}"` : ''} ${b.form ? `data-form="${esc(b.form)}"` : ''} ${b.disabled ? 'disabled' : ''} ${b.title ? `title="${esc(b.title)}"` : ''}>${esc(b.label)}</button>`,
    linkBtn: (label, href, tone = 'secondary', size = 'sm') => `<a class="btn ${tone} ${size}" href="${esc(href)}" style="text-decoration:none">${esc(label)}</a>`,
    form: ({ id, fields, submit, cancel, extra }) => `<form id="${esc(id)}" data-form-id="${esc(id)}"><div class="form-grid">${fields.map(h.field).join('')}</div>${extra || ''}<div class="form-actions">${cancel ? h.btn({ ...cancel, tone: 'secondary' }) : ''}${h.btn({ ...submit, form: id })}</div></form>`,
    empty: (t) => `<div class="empty">${esc(t)}</div>`,
    note: (t, tone = '') => `<div class="note ${tone}">${esc(t)}</div>`,
    noteHtml: (html, tone = '') => `<div class="note ${tone}">${html}</div>`,
    steps: (s) => `<div class="steps">${s.map((x, i) => `<div class="step ${x.state || ''}"><span class="n">${x.state === 'done' ? '✓' : i + 1}</span>${esc(x.label)}</div>`).join('')}</div>`,
    timeline: (evs) => `<div class="timeline">${evs.map((e) => `<div class="ev"><div class="t">${esc(e.at)}</div><div class="d"></div><div class="b">${esc(e.title)}${e.body ? `<div class="sub">${esc(e.body)}</div>` : ''}</div></div>`).join('')}</div>`,
    dl: (pairs) => `<dl class="dl">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`,
    tabs: (items, active, cls = '') => `<div class="tabs ${cls}">${items.map((t) => `<a href="${esc(t.href)}" class="${t.id === active ? 'active' : ''}">${t.html || esc(t.label)}</a>`).join('')}</div>`,
    a4: (html) => `<div class="a4">${html}</div>`,
    letterhead: (title, centre) => `<div class="lh"><div class="logo">Y</div><div><b>${esc(ORG.name)}</b><div style="font-size:11px">${esc(centre?.name || '')}${centre?.area ? ' · ' + esc(centre.area) : ''}${centre?.phone ? ' · ' + esc(centre.phone) : ''} · UAN ${esc(ORG.uan)}</div></div><div style="margin-left:auto;text-align:right"><b>${esc(title)}</b><div style="font-size:10px;letter-spacing:.14em;color:#10B981">${esc(ORG.tagline)}</div></div></div>`,
    icon: (k) => icons[k] || '',
    loading: (t) => `<div class="loading-box">${esc(t || 'Loading…')}</div>`,
  };

  /* ── router ─────────────────────────────────────────────── */
  function parseHash() {
    const m = location.hash.replace(/^#\/?/, ''); const i = m.indexOf('?');
    const path = i >= 0 ? m.slice(0, i) : m; const q = i >= 0 ? m.slice(i + 1) : '';
    return { screen: path.split('/')[0] || '', params: Object.fromEntries(new URLSearchParams(q)) };
  }
  const href = (screen, params) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return `#/${screen}${s ? '?' + s : ''}`; };
  function navigate(screen, params) { const target = href(screen, params); if (location.hash === target) render(); else location.hash = target; }

  /* ── data memo: kept while the route stays the same, so re-rendering after a small change does not
     refetch; navigating anywhere fetches fresh data. Actions put the returned record back in. ── */
  async function cached(key, fn) { if (key in memo) return memo[key]; const v = await fn(); memo[key] = v; return v; }
  const setCached = (key, v) => { memo[key] = v; };
  const dropCached = (prefix) => { for (const k of Object.keys(memo)) if (!prefix || k.startsWith(prefix)) delete memo[k]; };

  /* ── context passed to screens and actions ───────────────── */
  function ctx() {
    return { h, state, me: state.me, meta: state.meta, params: state.params, navigate, href, toast, modal, closeModal, print, cached, setCached, dropCached, render, api: API };
  }

  /* ── toasts / modal / print ─────────────────────────────── */
  function toast(text, tone = 'ok') { const t = { id: Date.now() + Math.random(), text, tone }; state.toasts.push(t); renderToasts(); setTimeout(() => { state.toasts = state.toasts.filter((x) => x !== t); renderToasts(); }, tone === 'danger' ? 7000 : 4200); }
  function renderToasts() { const el = document.getElementById('toasts'); if (el) el.innerHTML = state.toasts.map((t) => `<div class="toast ${t.tone}" role="status">${esc(t.text)}</div>`).join(''); }
  /* The modal lives in its own root, so opening one never re-renders (or refetches) the page. */
  function modal(title, html, acts, opts = {}) { state.modal = { title, html, actions: acts || '', kind: opts.kind || 'custom', onClose: opts.onClose || null }; renderModal(); }
  function closeModal() { const m = state.modal; state.modal = null; renderModal(); if (m && m.onClose) m.onClose(); }
  function print(html, title = 'Print preview') { modal(title, html, h.btn({ label: 'Print', action: 'doPrint', tone: 'accent', size: 'sm' }), { kind: 'print' }); }
  function renderModal() {
    const root = document.getElementById('modal-root'); if (!root) return;
    const m = state.modal;
    root.innerHTML = m ? `<div class="overlay" data-action="closeModal"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.title)}"><div class="m-h"><h3>${esc(m.title)}</h3><div class="actions">${m.actions}${h.btn({ label: 'Close', action: 'closeModal', tone: 'secondary', size: 'sm' })}</div></div><div class="m-b" ${m.kind === 'print' ? 'id="print-root"' : ''}>${m.html}</div></div></div>` : '';
    if (m) { enhanceSelects(root); const f = root.querySelector('[autofocus]'); if (f) f.focus(); }
  }

  /* ── shell ──────────────────────────────────────────────── */
  const app = () => document.getElementById('app');
  const isReadOnly = () => state.me && !state.me.canWrite;

  function renderLogin() {
    const L = state.login;
    const mockUsers = CFG.mock && window.HMS_MOCK ? window.HMS_MOCK.demoUsers : [];
    const body = L.stage === 'otp'
      ? `<div><h1>Verification code</h1><div class="muted">${esc(L.message || 'A 6-digit code was sent to the Super Admin email.')}</div></div>
        <form id="otp-form" data-form-id="otp-form"><div class="stack-sm">
          ${h.field({ id: 'otp', label: 'Code', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', autofocus: true, required: true })}
          ${h.btn({ label: 'Verify and sign in', action: 'verifyOtp', form: 'otp-form', size: 'lg' }).replace('class="btn', 'class="btn block')}
          <div class="row between">${h.btn({ label: 'Send a new code', action: 'resendOtp', tone: 'ghost', size: 'sm' })}${h.btn({ label: 'Back', action: 'loginBack', tone: 'ghost', size: 'sm' })}</div>
        </div></form>`
      : `<div><h1>Sign in</h1><div class="muted">Drug rehabilitation centres · Gulgasht and Rasheedabad. Use the email and password given to you by YCDO IT.</div></div>
        <form id="login-form" data-form-id="login-form"><div class="stack-sm">
          ${h.field({ id: 'email', label: 'Email', type: 'email', value: L.email, autocomplete: 'username', autofocus: !L.email, required: true })}
          ${h.field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'current-password', autofocus: !!L.email, required: true })}
          ${h.btn({ label: 'Sign in', action: 'login', form: 'login-form', size: 'lg' }).replace('class="btn', 'class="btn block')}
        </div></form>
        ${mockUsers.length ? `<div><div class="label" style="margin-bottom:6px">Mock accounts (click to fill the email; any password of 6+ characters)</div><div class="demo-users">${mockUsers.map((u) => `<button type="button" data-action="fillLogin" data-arg="${esc(u.email)}"><b>${esc(u.name)}</b>${esc(u.label)}</button>`).join('')}</div></div>` : ''}`;
    app().innerHTML = `<div class="login"><div class="box"><div class="stack">
      <div class="row between"><div class="brand"><div class="logo">Y</div><div>YCDO HMS<small>${esc(ORG.tagline)}</small></div></div>${CFG.mock ? '<span class="badge warn">Mock data · no server</span>' : ''}</div>
      ${body}
    </div></div></div><div id="toasts" class="toasts"></div><div id="modal-root"></div><div class="loadbar"></div>`;
    renderToasts();
    const f = app().querySelector('[autofocus]'); if (f) f.focus();
  }

  function initials(n) { return String(n || '?').replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

  function renderHeader() {
    const me = state.me;
    return `<header class="header">
      <button type="button" class="nav-toggle" data-action="toggleNav" aria-label="${state.navOpen ? 'Close menu' : 'Open menu'}" aria-expanded="${state.navOpen ? 'true' : 'false'}">${icons.menu}</button>
      <a href="#/dashboard" class="brand" style="color:#fff;text-decoration:none"><div class="logo">Y</div><div>YCDO HMS<small>${esc(ORG.tagline)}</small></div></a>
      <form class="search" id="hdr-search" data-form-id="hdr-search" role="search">${icons.search}<input id="universal-search" name="q" type="search" placeholder="Search name, CNIC, file no, patient no, referral no…" autocomplete="off" value="${esc(state.screen === 'admissions' ? state.params.q || '' : '')}"></form>
      <div class="hdr-right">
        ${CFG.mock ? '<span class="badge warn">Mock data</span>' : ''}
        ${isReadOnly() ? '<span class="badge ro-badge" title="This account can view everything but cannot change anything">View only</span>' : ''}
        <div class="hdr-user"><span class="avatar">${esc(initials(me.name || me.email))}</span><div>${esc(me.name || me.email)}${me.designation ? `<small>${esc(me.designation)}</small>` : ''}</div></div>
        <button type="button" class="hdr-chip" data-action="signOut" title="Sign out">${icons.out} Sign out</button>
      </div></header>`;
  }

  function renderSidebar() {
    const me = state.me; const cur = state.screen;
    const items = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'admissions', label: 'Admissions' },
      ...(me.canWrite ? [{ id: 'register', label: 'Register patient' }, { id: 'payments', label: 'Payments' }] : []),
      { id: 'stations', label: 'Police stations', group: 'Police' },
      { id: 'places', label: 'Pick-up places' },
      ...(me.isAdmin ? [{ id: 'accounts', label: 'HMS accounts', group: 'Admin' }] : []),
    ];
    const active = { admission: 'admissions', station: 'stations', place: 'places' }[cur] || cur;
    let html = `<aside class="sidebar ${state.navOpen ? 'open' : ''}" id="ws-nav"><div class="ws-title">${icons.drh} Drug rehabilitation</div>`;
    for (const n of items) {
      if (n.group) html += `<div class="group">${esc(n.group)}</div>`;
      html += `<a href="#/${n.id}" class="${active === n.id ? 'active' : ''}">${esc(n.label)}</a>`;
    }
    html += `<a href="#" data-action="findByThumb">Find patient by thumb</a>`;
    const centres = (state.meta?.centres || []).filter((c) => (me.centreIds || []).includes(c.id)).map((c) => c.name.replace('Police and YCDO DRH ', ''));
    html += `<div class="foot">${esc(me.email)}<br>${me.canWrite ? (centres.length ? 'Can register at ' + esc(centres.join(' and ')) : 'Can register') : 'View only'}</div></aside>`;
    return html;
  }

  async function boot() {
    const [me, meta] = await Promise.all([API.get('/drh/me'), API.get('/drh/meta')]);
    state.me = me; state.meta = meta;
  }

  async function render() {
    const seq = ++renderSeq;
    state.token = API.token();
    if (!state.token) { state.me = null; renderLogin(); return; }
    document.body.classList.add('loading');
    try {
      if (!state.me) {
        if (!document.querySelector('.header')) app().innerHTML = `<div class="login"><div class="box">${h.loading('Signing in…')}</div></div><div class="loadbar"></div>`;
        try { await boot(); } catch (e) {
          if (seq !== renderSeq) return;
          if (!API.token()) { renderLogin(); return; }
          app().innerHTML = `<div class="login"><div class="box stack">${h.note(e.message, 'danger')}<div class="row">${h.btn({ label: 'Try again', action: 'retry' })}${h.btn({ label: 'Sign out', action: 'signOut', tone: 'secondary' })}</div></div></div><div id="toasts" class="toasts"></div><div class="loadbar"></div>`;
          return;
        }
      }
      const { screen, params } = parseHash();
      const routeKey = location.hash;
      if (routeKey !== lastRouteKey) { memo = {}; lastRouteKey = routeKey; }
      let name = screens[screen] ? screen : 'dashboard';
      const s = screens[name];
      state.screen = name; state.params = params;
      let content;
      if (s.admin && !state.me.isAdmin) content = h.note('Only YCDO IT can manage HMS accounts.', 'warn');
      else if (s.write && !state.me.canWrite) content = h.note('This account can view the DRH records but cannot register or change them.', 'warn');
      else {
        try { content = await s.render(ctx()); }
        catch (e) {
          if (seq !== renderSeq) return;
          if (e && e.status === 401) return; // onUnauthorized already re-rendered the login
          console.error(e);
          content = h.page(s.title || 'Error') + h.noteHtml(`<b>${esc(e.message || 'Something went wrong')}</b>`, 'danger') + `<div class="row">${h.btn({ label: 'Try again', action: 'retry' })}</div>`;
        }
      }
      if (seq !== renderSeq) return;
      const scrollY = window.scrollY; const sameRoute = app().dataset.route === routeKey;
      app().innerHTML = `${renderHeader()}<div class="body">${renderSidebar()}${state.navOpen ? '<div class="nav-scrim" data-action="toggleNav"></div>' : ''}<main class="content"><div class="stack">${content}</div></main></div><div id="toasts" class="toasts"></div><div id="modal-root"></div><div class="loadbar"></div>`;
      app().dataset.route = routeKey;
      if (sameRoute) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
      enhanceSelects(app());
      addExportBars();
      renderToasts(); renderModal();
      if (s.after) { try { s.after(ctx()); } catch (e) { console.error(e); } }
      for (const fn of afterRender) { try { fn(ctx()); } catch (e) { console.error(e); } }
    } finally {
      if (seq === renderSeq) document.body.classList.remove('loading');
    }
  }
  const afterRender = [];

  /* ── exports (prototype: every read-only data table card gets Export) ─────────────
     PDF prints exactly what the table shows on the letterhead; CSV opens in Excel. */
  function addExportBars() {
    document.querySelectorAll('.content .card').forEach((card, i) => {
      const t = card.querySelector(':scope > .card-b table'); if (!t || t.closest('.card') !== card) return;
      if (t.querySelector('input, select, textarea')) return;
      if (!t.querySelector('tbody tr')) return;
      if (card.dataset.noexport) return;
      card.dataset.xcard = i;
      let head = card.querySelector(':scope > .card-h');
      if (!head) { head = document.createElement('div'); head.className = 'card-h'; head.innerHTML = '<div></div>'; card.prepend(head); }
      let acts = head.querySelector(':scope > .actions');
      if (!acts) { acts = document.createElement('div'); acts.className = 'actions'; head.appendChild(acts); }
      acts.insertAdjacentHTML('beforeend', h.btn({ label: 'Export PDF', action: 'tableExport', arg: 'PDF|' + i, tone: 'secondary', size: 'sm' }) + h.btn({ label: 'Export CSV', action: 'tableExport', arg: 'CSV|' + i, tone: 'secondary', size: 'sm' }));
    });
  }
  function tableData(card) {
    const t = card.querySelector('table'); const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const keep = heads.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    const clean = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const rows = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children]).filter((c) => c.length === heads.length).map((c) => keep.map((i) => clean(c[i])));
    const title = (card.querySelector('.card-h h3') || document.querySelector('.content h1') || { textContent: 'Report' }).textContent.trim();
    return { title, heads: keep.map((i) => heads[i]), rows };
  }
  function tableExport(arg) {
    const [kind, idx] = String(arg).split('|'); const card = document.querySelector(`[data-xcard="${idx}"]`);
    if (!card) return;
    const d = tableData(card); const stamp = new Date().toISOString();
    if (kind === 'PDF') {
      const tbl = `<table><thead><tr>${d.heads.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${d.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const sub = (document.querySelector('.content .page-h h1') || { textContent: '' }).textContent;
      print(h.a4(h.letterhead(d.title, { name: sub }) + tbl + `<p class="small">${d.rows.length} rows · generated ${h.date(stamp)} ${h.time(stamp)} by ${esc(state.me.name || state.me.email)}</p>`), d.title + ' — Export PDF');
      return;
    }
    const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [d.heads, ...d.rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${d.title} - ${new Date().toLocaleDateString('en-CA')}.csv`.replace(/[\\/:*?"<>|]/g, '');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Exported “${d.title}” (${d.rows.length} rows)`);
  }

  /* ── shell actions ──────────────────────────────────────── */
  function afterLogin(res) {
    if (!res || !res.access_token) throw new Error('The server did not return a session');
    API.setToken(res.access_token);
    state.me = null; state.login = { stage: 'password', email: '', challengeId: null, message: '' };
    if (!parseHash().screen) location.hash = '#/dashboard';
    render();
  }
  Object.assign(actions, {
    retry: () => { memo = {}; render(); },
    fillLogin: (email) => { state.login.email = email; renderLogin(); },
    login: async (_a, form) => {
      const email = String(form.email || '').trim(); const password = String(form.password || '');
      state.login.email = email;
      if (!email || !password) { toast('Enter your email and password', 'danger'); return; }
      try {
        const res = await API.post('/auth/login', { email, password, client: 'hms' }, { noAuthRedirect: true });
        if (res && res.requiresOtp) { state.login = { stage: 'otp', email, challengeId: res.challengeId, message: res.message || (res.maskedEmail ? `A verification code was sent to ${res.maskedEmail}` : '') }; renderLogin(); return; }
        afterLogin(res);
      } catch (e) { toast(e.status === 401 ? 'Wrong email or password' : e.message, 'danger'); renderLogin(); }
    },
    verifyOtp: async (_a, form) => {
      const otp = digits(form.otp);
      if (otp.length !== 6) { toast('Enter the 6-digit code', 'danger'); return; }
      try { afterLogin(await API.post('/auth/verify-otp', { challengeId: state.login.challengeId, otp }, { noAuthRedirect: true })); }
      catch (e) { toast(e.status === 401 ? 'Wrong or expired code' : e.message, 'danger'); }
    },
    resendOtp: async () => {
      try { const r = await API.post('/auth/resend-otp', { challengeId: state.login.challengeId }, { noAuthRedirect: true }); if (r && r.challengeId) state.login.challengeId = r.challengeId; toast(r && r.message ? r.message : 'A new code was sent'); }
      catch (e) { toast(e.message, 'danger'); }
    },
    loginBack: () => { state.login.stage = 'password'; renderLogin(); },
    signOut: () => { API.setToken(null); state.me = null; state.meta = null; memo = {}; state.modal = null; location.hash = ''; renderLogin(); },
    toggleNav: () => { state.navOpen = !state.navOpen; render(); },
    closeModal: () => closeModal(),
    doPrint: () => window.print(),
    tableExport: (arg) => tableExport(arg),
    setCentre: (id) => { setCentre(id); },
  });

  /* Only a session that was open shows the "ended" note; a first visit just shows sign-in. */
  API.onUnauthorized(() => { const had = !!state.me; state.me = null; state.modal = null; if (had) toast('Your session has ended. Please sign in again.', 'warn'); renderLogin(); });

  /* ── event wiring ───────────────────────────────────────── */
  function readForm(formId) {
    const out = {}; const f = formId && document.getElementById(formId);
    if (f) for (const el of f.querySelectorAll('input,select,textarea')) { if (!el.name) continue; out[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'file' ? el.files : el.value; }
    return out;
  }
  const running = new Set();
  async function runAction(name, arg, formId, el) {
    const fn = actions[name];
    if (!fn) { console.warn('No action', name); return; }
    const fEl = formId && document.getElementById(formId);
    if (fEl && !fn.noValidate) {
      const bad = invalidField(fEl);
      if (bad) {
        const lbl = (fEl.querySelector(`label[for="${bad.el.id}"]`) || { textContent: 'This field' }).textContent.replace('*', '').trim();
        bad.el.closest('.field')?.classList.add('err'); bad.el.focus();
        toast(`${lbl} ${bad.why}`, 'danger'); return;
      }
    }
    /* One click, one request: a second click while the first is still running is ignored. */
    const key = name + '|' + (arg ?? '');
    if (running.has(key)) return;
    running.add(key);
    const btn = el && el.tagName === 'BUTTON' ? el : null;
    if (btn) btn.disabled = true;
    try {
      const res = await fn(arg, readForm(formId), el);
      if (typeof res === 'string') toast(res);
    } catch (e) {
      if (!(e && e.status === 401)) { console.error(e); toast(e && e.message ? e.message : 'Something went wrong', 'danger'); }
    } finally {
      running.delete(key);
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) {
      if (el.classList.contains('overlay') && e.target !== el) return;
      e.preventDefault();
      runAction(el.dataset.action, el.dataset.arg, el.dataset.form, el);
      return;
    }
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a,button,input,select,textarea')) { location.hash = row.dataset.href; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const row = e.target.closest && e.target.closest('tr[data-href]');
      if (row && e.target === row) { location.hash = row.dataset.href; return; }
    }
    if (e.key === 'Escape' && state.modal && !document.querySelector('.bio-overlay')) { closeModal(); }
    if (e.key === 'Enter' && e.target.closest && e.target.closest('form[data-form-id]') && e.target.tagName !== 'TEXTAREA' && !e.target.closest('.combo') && !e.target.closest('.ta')) {
      const form = e.target.closest('form');
      if (form.id === 'hdr-search') return; // handled by submit
      const btn = form.querySelector('[data-form]'); if (btn) { e.preventDefault(); btn.click(); }
    }
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'hdr-search') {
      const q = String(e.target.querySelector('input').value || '').trim();
      const cid = state.centreId !== 'all' ? state.centreId : undefined; navigate('admissions', { q: q || undefined, centreId: cid });
    }
  });
  document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) runAction(el.dataset.change, el.value, null, null); });
  window.addEventListener('hashchange', () => { state.navOpen = false; if (state.modal && state.modal.kind !== 'print') state.modal = null; render(); });

  /* ── searchable dropdowns (prototype): every <select> gets a type-to-filter box ─── */
  function comboLabel(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.text : ''; }
  function enhanceSelects(root) {
    for (const sel of (root || document).querySelectorAll('select:not([data-combo])')) {
      if (sel.dataset.plain === 'true') continue;
      sel.dataset.combo = '1';
      const wrap = document.createElement('div'); wrap.className = 'combo';
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'combo-in'; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
      if (sel.id) input.setAttribute('aria-label', (document.querySelector(`label[for="${sel.id}"]`) || { textContent: '' }).textContent.replace('*', '').trim());
      input.placeholder = sel.dataset.placeholder || 'Type to search…';
      input.value = comboLabel(sel);
      if (sel.disabled) input.disabled = true;
      const pop = document.createElement('div'); pop.className = 'combo-pop'; pop.hidden = true; pop.setAttribute('role', 'listbox');
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(input); wrap.appendChild(pop); wrap.appendChild(sel);
      sel.classList.add('combo-native');
    }
  }
  function comboFilter(sel, q) {
    const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return [...sel.options].map((o, i) => ({ i, text: o.text, value: o.value }))
      .filter((o) => !tokens.length || tokens.every((t) => o.text.toLowerCase().includes(t) || String(o.value).toLowerCase().includes(t)));
  }
  function comboOpen(wrap, q) {
    const sel = wrap.querySelector('select'); const pop = wrap.querySelector('.combo-pop'); const input = wrap.querySelector('.combo-in');
    const hits = comboFilter(sel, q);
    const selectedPos = hits.findIndex((x) => x.i === sel.selectedIndex);
    const activeI = hits.length ? (selectedPos >= 0 && (!q || q === comboLabel(sel)) ? selectedPos : 0) : -1;
    pop.innerHTML = hits.length ? hits.map((o, n) => `<div class="combo-opt ${n === activeI ? 'active' : ''}" role="option" data-i="${o.i}">${esc(o.text)}</div>`).join('') : '<div class="combo-none">No match</div>';
    pop.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function comboClose(wrap) {
    const pop = wrap.querySelector('.combo-pop'); const input = wrap.querySelector('.combo-in'); const sel = wrap.querySelector('select');
    if (pop) pop.hidden = true;
    if (input && sel) { input.setAttribute('aria-expanded', 'false'); input.value = comboLabel(sel); }
  }
  function comboPick(wrap, optIndex) {
    const sel = wrap.querySelector('select');
    if (!sel || optIndex == null || optIndex < 0 || !sel.options[optIndex]) return;
    const changed = sel.selectedIndex !== optIndex;
    sel.selectedIndex = optIndex;
    comboClose(wrap);
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function comboMove(wrap, delta) {
    const pop = wrap.querySelector('.combo-pop'); const opts = [...pop.querySelectorAll('.combo-opt')];
    if (!opts.length) return;
    let i = opts.findIndex((o) => o.classList.contains('active'));
    i = i < 0 ? 0 : Math.max(0, Math.min(opts.length - 1, i + delta));
    opts.forEach((o) => o.classList.remove('active')); opts[i].classList.add('active'); opts[i].scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('input', (e) => {
    const el = e.target; const k = el.dataset && el.dataset.kind;
    if (k && MASK[k]) {
      const before = el.value; const next = MASK[k](before);
      if (next !== before) { const atEnd = el.selectionStart === before.length; el.value = next; if (atEnd) el.setSelectionRange(next.length, next.length); }
      el.closest('.field')?.classList.remove('err');
    }
    const input = el.closest && el.closest('.combo-in'); if (input) comboOpen(input.parentElement, input.value);
  });
  document.addEventListener('focusin', (e) => {
    const input = e.target.closest('.combo-in'); if (!input) return;
    for (const w of document.querySelectorAll('.combo')) if (w !== input.parentElement) comboClose(w);
    input.select(); comboOpen(input.parentElement, '');
  });
  document.addEventListener('keydown', (e) => {
    const input = e.target.closest && e.target.closest('.combo-in'); if (!input) return;
    const wrap = input.parentElement; const pop = wrap.querySelector('.combo-pop');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (pop.hidden) comboOpen(wrap, input.value); else comboMove(wrap, e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.key === 'Enter') { if (!pop.hidden) { e.preventDefault(); e.stopPropagation(); const act = pop.querySelector('.combo-opt.active') || pop.querySelector('.combo-opt'); if (act) comboPick(wrap, Number(act.dataset.i)); } return; }
    if (e.key === 'Escape') { const wasOpen = !pop.hidden; comboClose(wrap); if (wasOpen) e.stopPropagation(); return; }
    if (e.key === 'Tab') comboClose(wrap);
  }, true);
  document.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-opt');
    if (opt) { e.preventDefault(); comboPick(opt.closest('.combo'), Number(opt.dataset.i)); return; }
    if (!e.target.closest('.combo')) for (const w of document.querySelectorAll('.combo')) comboClose(w);
  });
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('select.combo-native'); if (!sel) return;
    const input = sel.parentElement.querySelector('.combo-in'); if (input) input.value = comboLabel(sel);
  });

  function loadScript(src) { return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src)); document.head.appendChild(s); }); }

  window.HMS = {
    ORG, state, h, icons, MASK, VALID, invalidField, readForm,
    screen: (name, def) => { screens[name] = def; },
    action: (name, fn) => { actions[name] = fn; return fn; },
    actions: (map) => Object.assign(actions, map),
    afterRender: (fn) => afterRender.push(fn),
    navigate, href, render, toast, modal, closeModal, print, ctx, setCentre, renderModal,
    cached, setCached, dropCached,
  };
  window.addEventListener('DOMContentLoaded', async () => {
    if (CFG.mock) { try { await loadScript('api-mock.js'); } catch (e) { app().innerHTML = h.note(e.message, 'danger'); return; } }
    render();
  });
})();

/* YCDO HMS (Phase 0) - Drug Rehabilitation screens: dashboard (as presented to the CPO and DC),
   admissions list, patient file (test reports, discharge, weekly follow-up, print), registration
   (CNIC first, two guardians, police referral with station and pick-up place, photo and thumb),
   police station and pick-up place pages, find by thumb, and HMS accounts (YCDO IT only).
   Real data only. Payments (DRH staff and YCDO IT only, never police) live in billing.js. */
(function () {
  const { h } = window.HMS;
  const api = window.API;
  const bio = () => window.HMS.bio;

  /* ── small helpers ─────────────────────────────────────── */
  const DAY = 86400000;
  const meta = () => window.HMS.state.meta || { centres: [], substances: [], relations: [], placeTypes: [], ranks: [], outcomes: [], programmeDays: 90 };
  const me = () => window.HMS.state.me || {};
  const progDays = () => meta().programmeDays || 90;
  const shortCentre = (name) => String(name || '').replace(/^Police and YCDO DRH\s*/i, '') || String(name || '');
  const centreById = (id) => meta().centres.find((c) => c.id === id) || null;
  const centreShort = (cOrId) => { const c = typeof cOrId === 'string' ? centreById(cOrId) : cOrId; return c ? shortCentre(c.name) : ''; };
  const SRC = { POLICE: 'Police', FAMILY: 'Family', REFERRAL: 'Referral' };
  const SRC_LONG = { POLICE: 'Police referral', FAMILY: 'Family', REFERRAL: 'Hospital / department referral' };
  const srcLabel = (s) => SRC[s] || s || '—';
  const sourceBadge = (s) => h.badge(srcLabel(s), s === 'POLICE' ? 'dark' : 'info');
  const outcomeLabel = (v) => ((meta().outcomes || []).find((o) => o.value === v) || {}).label || (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()) : '');
  const AGE_GROUPS = [['Under 20', 'U20'], ['20 – 29', '20-29'], ['30 – 39', '30-39'], ['40 and above', '40P']];
  const ageCode = (label, i) => { const n = String(label).replace(/\s+/g, ' ').replace(/[–-]/g, '-'); const hit = AGE_GROUPS.find(([l]) => l.replace(/[–-]/g, '-') === n); return hit ? hit[1] : (AGE_GROUPS[i] || [])[1]; };
  const monthLabel = (ym) => { const [y, m] = String(ym).split('-').map(Number); return y && m ? new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' }) : String(ym); };
  const monthYear = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { month: 'long', year: 'numeric' }) : '');
  const pct = (a, z) => (z ? Math.round((a / z) * 100) : 0);
  const today = () => new Date().toLocaleDateString('en-CA');
  const plural = (n, one, many) => `${h.num(n)} ${n === 1 ? one : (many || one + 's')}`;
  const dayOf = (r) => r.day || Math.max(1, Math.ceil(((r.dischargedAt ? new Date(r.dischargedAt) : Date.now()) - new Date(r.admittedAt)) / DAY));
  const myCentreIds = () => { const m = me(); const ids = m.centreIds || []; return ids.length ? ids : (m.isAdmin && m.canWrite ? meta().centres.map((c) => c.id) : []); };
  const canWriteAt = (centreId) => !!me().canWrite && myCentreIds().includes(centreId);
  const fileHref = (id, tab) => window.HMS.href('admission', { id, tab });
  const listHref = (filters, title) => {
    const cid = window.HMS.state.centreId;
    return window.HMS.href('admissions', { centreId: cid !== 'all' ? cid : undefined, ...filters, t: title });
  };

  /* Photo of a patient: fetched with the token, shown as a blob URL. */
  const photoUrls = new Map();
  function photoUrl(patientId) {
    if (!photoUrls.has(patientId)) photoUrls.set(patientId, api.blob(`/drh/patients/${encodeURIComponent(patientId)}/photo`).then((b) => (b && b.size ? URL.createObjectURL(b) : null)).catch(() => null));
    return photoUrls.get(patientId);
  }
  function dropPhoto(patientId) { const p = photoUrls.get(patientId); photoUrls.delete(patientId); if (p) p.then((u) => u && setTimeout(() => URL.revokeObjectURL(u), 60000)); }
  function loadPhotos(root) {
    for (const img of (root || document).querySelectorAll('img[data-photo]:not([src])')) {
      const id = img.dataset.photo;
      photoUrl(id).then((u) => {
        if (u) { img.src = u; return; }
        const d = document.createElement('div'); d.className = 'bio-avatar empty'; d.style.cssText = img.style.cssText;
        d.innerHTML = `${h.esc(String(img.alt || '?').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase())}<span>no photo</span>`;
        img.replaceWith(d);
      });
    }
  }
  window.HMS.afterRender(() => loadPhotos());
  const hasPhoto = (p) => !!(p && (p.hasPhoto || p.photoAt));
  const hasThumb = (p) => (p && (p.thumbAt || p.hasThumb) ? true : p && p.hasThumb === false ? false : null);
  const avatar = (p, size) => bio().avatar(hasPhoto(p) ? { name: p.name, photoId: p.id } : { name: p && p.name }, size);

  function photoThumbBadge(p) {
    const miss = [];
    if (!hasPhoto(p)) miss.push('photo');
    if (hasThumb(p) === false) miss.push('thumb');
    if (miss.length) return h.badge(`${miss.join(' & ')} pending`, 'danger');
    return h.badge(hasThumb(p) ? 'complete' : 'photo on file', 'ok');
  }
  const reportsBadge = (n) => (n ? h.badge(plural(n, 'report'), 'ok') : h.badge('initial tests pending', 'warn'));

  /* Horizontal bars as in the prototype; every row links to the matching list. */
  function bars(rows, tone) {
    if (!rows.length || rows.every((r) => !r.n)) return '<div class="muted small">No admissions yet</div>';
    const max = Math.max(1, ...rows.map((r) => r.n || 0));
    return `<div class="bars">${rows.map((r) => {
      const inner = `<span class="small">${h.esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.round(((r.n || 0) / max) * 100)}%;background:${tone || 'var(--primary)'}"></div></div><b class="small">${h.num(r.n)}</b>`;
      return r.href ? `<a class="barrow" href="${h.esc(r.href)}" title="Open the list">${inner}</a>` : `<div class="barrow">${inner}</div>`;
    }).join('')}</div>`;
  }

  /* Tabs on top: both centres, or one. The count is "under care now". */
  function centreTabs(screen, current, keep) {
    const uc = window.HMS.state.underCare || {};
    const tabs = [{ id: 'all', name: 'Both centres' }].concat(meta().centres);
    return h.tabs(tabs.map((c) => {
      const n = uc[c.id];
      const params = screen === 'admissions' ? { ...keep, centreId: c.id === 'all' ? undefined : c.id, page: undefined } : { centre: c.id };
      return { id: c.id, href: window.HMS.href(screen, params), html: `${h.esc(c.name)}${n != null ? ` <span class="muted small">· ${h.num(n)} under care</span>` : ''}` };
    }), current, 'drh-branch-tabs');
  }
  function noteUnderCare(d) {
    const uc = {}; let all = 0;
    for (const c of d.byCentre || []) { uc[c.id] = c.underCare || 0; all += c.underCare || 0; }
    if ((d.byCentre || []).length) uc.all = all; else if (d.centre && d.kpis) uc[d.centre.id] = d.kpis.underCare;
    window.HMS.state.underCare = { ...window.HMS.state.underCare, ...uc };
  }
  async function ensureUnderCare() {
    const uc = window.HMS.state.underCare || {};
    if (uc.all != null) return;
    try { noteUnderCare(await api.get('/drh/dashboard', { centreId: 'all' })); } catch (e) { /* tabs without counts */ }
  }

  /* ── columns shared by the tables ──────────────────────── */
  const colPatient = { key: 'n', label: 'Patient', render: (r) => `<b>${h.esc(r.patient.name)}</b> <span class="muted small">${h.esc(r.patient.patientNo || '')}</span><div class="muted small mono">${h.esc(r.fileNo || '')}</div>` };
  const colPatientPlain = { key: 'n', label: 'Patient', render: (r) => `<b>${h.esc(r.patient.name)}</b> <span class="muted small">${h.esc(r.patient.patientNo || '')}</span><div class="muted small">${h.esc(r.patient.gender === 'FEMALE' ? 'Female' : 'Male')}, ${h.esc(r.patient.age ?? '?')}${r.patient.fatherName ? ' · s/o ' + h.esc(r.patient.fatherName) : ''}</div>` };
  const colCentre = { key: 'c', label: 'Centre', render: (r) => h.esc(centreShort(r.centre && r.centre.id) || shortCentre(r.centre && r.centre.name)) };
  const colSource = { key: 'src', label: 'Source', render: (r) => `${sourceBadge(r.source)}${r.source === 'POLICE' ? `<div class="muted small">${h.esc([r.policeReferralNo, r.policeStation && r.policeStation.name].filter(Boolean).join(' · '))}</div>` : ''}` };
  const colSubstance = { key: 'sub', label: 'Substance', render: (r) => `${h.esc(r.substance || '—')}${r.useYears != null && r.useYears !== '' ? `<div class="muted small">${plural(Number(r.useYears), 'year')} of use</div>` : ''}` };
  const colAdmitted = { key: 'adm', label: 'Admitted', render: (r) => `${h.date(r.admittedAt)}<div class="muted small">${r.status === 'ADMITTED' ? `day ${h.num(dayOf(r))} of ${progDays()}` : `${plural(dayOf(r), 'day')} stay`}</div>` };
  const colStatus = { key: 'st', label: 'Status', render: (r) => (r.status === 'ADMITTED' ? h.badge('Admitted', 'info') : h.badge('Discharged', 'ok')) };
  const colDischarged = { key: 'dis', label: 'Discharged', render: (r) => (r.dischargedAt ? `${h.date(r.dischargedAt)}<div class="muted small">${h.esc(outcomeLabel(r.outcome))}</div>` : '<span class="muted">—</span>') };
  const admissionsTable = (rows, empty, showCentre = true) => h.table({
    columns: [{ key: 'f', label: 'DRH file', render: (r) => `<b class="mono">${h.esc(r.fileNo || '')}</b>` }, ...(showCentre ? [colCentre] : []),
      { key: 'p', label: 'Patient', render: (r) => `${h.esc(r.patient.name)}<div class="muted small">${h.esc(r.patient.patientNo || '')} · ${h.esc(r.patient.gender === 'FEMALE' ? 'Female' : 'Male')}, ${h.esc(r.patient.age ?? '?')}</div>` },
      colSource, colSubstance, colAdmitted, colDischarged, colStatus],
    rows, rowHref: (r) => fileHref(r.id), empty });

  /* ══ Dashboard ═══════════════════════════════════════════ */
  window.HMS.screen('dashboard', {
    title: 'Drug rehabilitation',
    render: async (c) => {
      const ids = ['all'].concat(meta().centres.map((x) => x.id));
      if (c.params.centre && ids.includes(c.params.centre)) window.HMS.setCentre(c.params.centre);
      if (!ids.includes(c.state.centreId)) window.HMS.setCentre('all');
      const cid = c.state.centreId;
      const d = await c.cached('dash:' + cid, () => api.get('/drh/dashboard', { centreId: cid }));
      noteUnderCare(d);
      if (cid !== 'all') await ensureUnderCare();
      return centreTabs('dashboard', cid) + dashboardBody(d, cid);
    },
  });

  function dashboardBody(d, cid) {
    const K = d.kpis || {}; const centre = d.centre || {};
    const isAll = cid === 'all';
    const est = centre.establishedAt || (isAll ? meta().centres.map((x) => x.establishedAt).filter(Boolean).sort()[0] : null);
    const estTxt = est ? monthYear(est) : '';
    const byYearK = K.byYear || {};
    const thisYear = String(new Date().getFullYear());
    let years = Object.keys(byYearK).sort().slice(-2);
    if (!years.length) years = [thisYear];
    const L = (filters, title) => listHref(filters, title);
    const months = (d.byMonth || []).slice().sort((a, b) => String(a[0]).localeCompare(String(b[0]))).slice(-12);
    const needs = d.needsAction || []; const under = d.underCareRows || [];
    const labsDue = needs.filter((r) => !r.reports).length; const photoDue = needs.filter((r) => !hasPhoto(r.patient) || hasThumb(r.patient) === false).length;

    return h.page('Drug rehabilitation', [centre.name || (isAll ? 'Police and YCDO DRH · both centres' : ''), centre.area, centre.phone, estTxt ? 'since ' + estTxt : ''].filter(Boolean).join(' · '))
      + h.kpis([
        { label: 'Under care now', value: h.num(K.underCare), tone: 'info', sub: `${h.num(K.underCarePolice)} brought in by police`, href: L({ status: 'ADMITTED' }, 'Under care now') },
        { label: 'Patients treated', value: h.num(K.treated), tone: 'info', sub: `${estTxt ? 'since ' + estTxt + ' · ' : ''}${h.num(K.treatedPolice)} police referrals`, href: L({}, 'All admissions') },
        ...years.map((y) => { const v = byYearK[y] || { total: 0, police: 0 }; return { label: `Admissions ${y}`, value: h.num(v.total), tone: 'info', sub: `${h.num(v.police)} police referrals`, href: L({ year: y }, `Admissions ${y}`) }; }),
        { label: 'Discharged', value: h.num(K.discharged), tone: 'ok', sub: `${h.num(K.completed)} completed the programme (${pct(K.completed, K.discharged)}%)`, href: L({ status: 'DISCHARGED' }, 'Discharged') },
        { label: 'Weekly follow-up attended', value: K.followDue ? pct(K.followAttended, K.followDue) + '%' : '—', tone: 'ok', sub: `${h.num(K.followAttended)} of ${h.num(K.followDue)} visits after discharge`, href: L({ status: 'DISCHARGED' }, 'Discharged · weekly follow-up') },
        { label: 'Photo & thumb pending', value: h.num(K.photoThumbPending), tone: K.photoThumbPending ? 'danger' : 'ok', sub: `within 24 h · ${h.num(K.admitted30)} admitted, ${h.num(K.discharged30)} discharged in 30 days`, href: window.HMS.href('needs', { centre: cid }) },
      ])
      + '<div class="grid-2">'
      + (isAll ? h.card({ title: 'Under care now, by centre', subtitle: `${h.num(K.underCare)} patients across both centres`, body: bars((d.byCentre || []).map((x) => ({ label: shortCentre(x.name), n: x.underCare, href: window.HMS.href('admissions', { centreId: x.id, status: 'ADMITTED', t: 'Under care now · ' + shortCentre(x.name) }) }))) })
        + h.card({ title: 'Patients treated, by centre', subtitle: `${h.num(K.treated)}${estTxt ? ' since ' + estTxt : ''}`, body: bars((d.byCentre || []).map((x) => ({ label: shortCentre(x.name), n: x.treated, href: window.HMS.href('admissions', { centreId: x.id, t: 'All admissions · ' + shortCentre(x.name) }) })), '#0f766e') }) : '')
      + h.card({ title: 'Admissions by year', subtitle: `${h.num(K.treated)} admissions`, body: bars((d.byYear || []).slice().sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([y, n]) => ({ label: `${y}${String(y) === thisYear ? ' (to date)' : ''}`, n, href: L({ year: y }, `Admissions ${y}`) }))) })
      + h.card({ title: 'Admissions by source', subtitle: 'Police, family and referrals', body: bars((d.bySource || []).map(([s, n]) => ({ label: SRC_LONG[s] || s, n, href: L({ source: s }, 'Source · ' + (SRC_LONG[s] || s)) }))) })
      + h.card({ title: 'Police referrals by station', subtitle: 'Brought in as patients, not booked as accused', body: bars((d.byStation || []).map((x) => ({ label: x.name, n: x.count, href: L({ policeStationId: x.id, source: 'POLICE' }, 'Police referrals · ' + x.name) })), '#1e293b') })
      + h.card({ title: 'Where police found them', subtitle: 'Police referrals, by place', body: bars((d.byPlaceType || []).map(([t, n]) => ({ label: t, n, href: L({ placeType: t, source: 'POLICE' }, 'Found at · ' + t) })), '#475569')
          + ((d.byPlace || []).length ? `<div class="label bars-sub">Places</div>${bars((d.byPlace || []).slice(0, 8).map((x) => ({ label: `${x.name}${x.type ? ' (' + x.type.toLowerCase() + ')' : ''}`, n: x.count, href: L({ pickupPlaceId: x.id, source: 'POLICE' }, 'Found at · ' + x.name) })), '#64748b')}` : '') })
      + h.card({ title: 'Substance used', subtitle: `All ${h.num(K.treated)} patients`, body: bars((d.bySubstance || []).map(([s, n]) => ({ label: s, n, href: L({ substance: s }, 'Substance · ' + s) })), '#c2410c') })
      + h.card({ title: 'Age group', subtitle: `All ${h.num(K.treated)} patients`, body: bars((d.byAge || []).map(([l, n], i) => ({ label: l, n, href: L({ ageGroup: ageCode(l, i) }, 'Age group · ' + l) })), '#7c3aed') })
      + h.card({ title: 'Admissions per month', subtitle: 'Last twelve months', body: bars(months.map(([m, n]) => ({ label: monthLabel(m), n, href: L({ month: m }, 'Admissions · ' + monthLabel(m)) }))) })
      + h.card({ title: 'Discharge outcome', subtitle: `${h.num(K.discharged)} discharged`, body: bars((d.byOutcome || []).map(([o, n]) => ({ label: outcomeLabel(o), n, href: L({ status: 'DISCHARGED', outcome: o }, 'Discharge outcome · ' + outcomeLabel(o)) })), '#0f766e') })
      + '</div>'
      + needsCard(needs, isAll, `Photo & thumb or initial tests pending · ${h.num(labsDue)} tests, ${h.num(photoDue)} photo/thumb`)
      + h.card({ title: `Under care now (${h.num(K.underCare)})`, actions: K.underCare > under.length ? h.linkBtn('Open full list', L({ status: 'ADMITTED' }, 'Under care now')) : '', body: h.table({
        columns: [colPatientPlain, ...(isAll ? [colCentre] : []), colSource, colSubstance, colAdmitted,
          { key: 'bed', label: 'Bed', render: (r) => h.esc(r.bed || '—') },
          { key: 'pt', label: 'Photo & thumb', render: (r) => photoThumbBadge(r.patient) },
          { key: 'rp', label: 'Tests', render: (r) => reportsBadge(r.reports) }],
        rows: under, rowHref: (r) => fileHref(r.id), empty: 'No patients under care yet. Registered admissions appear here.' }) });
  }

  function needsCard(needs, isAll, subtitle) {
    return h.card({ id: 'needs', title: 'Needs action', subtitle, actions: `${h.btn({ label: 'Find patient by thumb', action: 'findByThumb', size: 'sm', tone: 'secondary' })}${me().canWrite ? h.linkBtn('Register DRH patient', '#/register', '', 'sm') : ''}`, body: h.table({
      columns: [colPatient, ...(isAll ? [colCentre] : []),
        { key: 'src', label: 'Source', render: (r) => sourceBadge(r.source) },
        { key: 'day', label: 'Day', align: 'right', render: (r) => h.num(dayOf(r)) },
        { key: 'sub', label: 'Substance', render: (r) => h.esc(r.substance || '') },
        { key: 'pt', label: 'Photo & thumb', render: (r) => photoThumbBadge(r.patient) },
        { key: 'rp', label: 'Tests', render: (r) => reportsBadge(r.reports) }],
      rows: needs, rowHref: (r) => fileHref(r.id), empty: 'Nothing pending — every admitted patient is enrolled and tested' }) });
  }

  window.HMS.screen('needs', {
    title: 'Needs action',
    render: async (c) => {
      const cid = c.params.centre || c.state.centreId || 'all';
      const d = await c.cached('dash:' + cid, () => api.get('/drh/dashboard', { centreId: cid }));
      const needs = d.needsAction || [];
      return h.page('Needs action', `${d.centre && d.centre.name ? d.centre.name + ' · ' : ''}admitted patients with photo, thumb or initial tests pending`, h.linkBtn('Dashboard', window.HMS.href('dashboard', { centre: cid })))
        + needsCard(needs, cid === 'all', `${plural(needs.length, 'patient')}`);
    },
  });

  /* ══ Admissions list ═════════════════════════════════════ */
  const FILTERS = ['centreId', 'status', 'source', 'policeStationId', 'pickupPlaceId', 'placeType', 'substance', 'year', 'month', 'ageGroup', 'outcome', 'gender', 'q'];
  const PAGE_SIZE = 50;
  const filterLabel = (k, v) => ({
    status: () => (v === 'ADMITTED' ? 'Under care' : v === 'DISCHARGED' ? 'Discharged' : v),
    source: () => SRC_LONG[v] || v, outcome: () => outcomeLabel(v), month: () => monthLabel(v), year: () => 'Year ' + v,
    ageGroup: () => (AGE_GROUPS.find((a) => a[1] === v) || [v])[0], gender: () => (v === 'FEMALE' ? 'Female' : 'Male'),
    policeStationId: () => 'Police station', pickupPlaceId: () => 'Pick-up place', placeType: () => 'Found at: ' + v, substance: () => v,
  }[k] || (() => v))();

  window.HMS.screen('admissions', {
    title: 'Admissions',
    render: async (c) => {
      const p = c.params; const query = {};
      for (const k of FILTERS) if (p[k]) query[k] = p[k];
      if (query.centreId === 'all') delete query.centreId;
      if (query.centreId) window.HMS.setCentre(query.centreId); else window.HMS.setCentre('all');
      const page = Math.max(1, parseInt(p.page, 10) || 1);
      const [res] = await Promise.all([c.cached('list', () => api.get('/drh/admissions', { ...query, page, pageSize: PAGE_SIZE })), ensureUnderCare()]);
      const keep = { ...query, t: p.t };
      const cid = query.centreId || 'all';
      const chips = Object.entries(query).filter(([k]) => k !== 'centreId' && k !== 'q').map(([k, v]) => {
        const without = { ...keep, [k]: undefined };
        const extra = k === 'policeStationId' ? ` <a href="${h.esc(window.HMS.href('station', { id: v }))}" title="Open the police station page">open page</a>` : k === 'pickupPlaceId' ? ` <a href="${h.esc(window.HMS.href('place', { id: v }))}" title="Open the place page">open page</a>` : '';
        return `<span class="filter-chip">${h.esc(filterLabel(k, v))}${extra} <a href="${h.esc(window.HMS.href('admissions', without))}" aria-label="Remove filter">×</a></span>`;
      });
      const total = res.total || 0; const ps = res.pageSize || PAGE_SIZE; const pg = res.page || page;
      const from = total ? (pg - 1) * ps + 1 : 0; const to = Math.min(total, pg * ps);
      const pager = total > ps ? `<div class="pager"><span class="muted small">Showing ${h.num(from)}–${h.num(to)} of ${h.num(total)}</span>${pg > 1 ? h.linkBtn('Previous', window.HMS.href('admissions', { ...keep, page: pg - 1 })) : ''}${to < total ? h.linkBtn('Next', window.HMS.href('admissions', { ...keep, page: pg + 1 })) : ''}</div>` : '';
      const title = p.t || (query.q ? `Search: ${query.q}` : 'All admissions');
      return centreTabs('admissions', cid, keep)
        + h.page('Admissions', `${title} · ${plural(total, 'admission')}`, `${h.btn({ label: 'Find patient by thumb', action: 'findByThumb', size: 'sm', tone: 'secondary' })}${me().canWrite ? h.linkBtn('Register DRH patient', '#/register', '', 'sm') : ''}`)
        + `<form id="list-search" data-form-id="list-search" class="searchbar"><input name="q" type="search" value="${h.esc(query.q || '')}" placeholder="Name, father name, CNIC, file no, patient no or police referral no" aria-label="Search admissions">${h.btn({ label: 'Search', action: 'listSearch', form: 'list-search' })}${query.q ? h.linkBtn('Clear', window.HMS.href('admissions', { ...keep, q: undefined })) : ''}</form>`
        + (chips.length ? `<div class="filters"><span class="muted small">Filters:</span>${chips.join('')}${h.linkBtn('Clear filters', window.HMS.href('admissions', { centreId: query.centreId, q: query.q }), 'ghost')}</div>` : '')
        + h.card({ title: `${title} (${h.num(total)})`, body: admissionsTable(res.rows || [], query.q || chips.length ? 'No admissions match' : 'No admissions yet', cid === 'all') + pager });
    },
  });

  /* ══ Patient file ════════════════════════════════════════ */
  window.HMS.screen('admission', {
    title: 'Patient file',
    render: async (c) => {
      const id = c.params.id;
      if (!id) return h.page('Patient file') + h.empty('Open a patient from the dashboard or the admissions list');
      const f = await c.cached('adm:' + id, () => api.get(`/drh/admissions/${encodeURIComponent(id)}`));
      const tab = c.params.tab || 'overview';
      // Money: only staff of this centre and YCDO IT; police never ask for it.
      const b = canBill(f) && (tab === 'payment' || tab === 'discharge') ? await window.HMS.billing.loadBilling(id) : null;
      return fileView(f, tab, b);
    },
  });

  const reportsOf = (f) => (Array.isArray(f.reports) ? f.reports : []);
  const followsOf = (f) => (Array.isArray(f.followUps) ? f.followUps : []);
  const MAX_FOLLOW_WEEKS = 12;
  function followWeeksDue(f) {
    if (f.status !== 'DISCHARGED' || !f.dischargedAt) return 0;
    return Math.max(0, Math.min(MAX_FOLLOW_WEEKS, Math.floor((Date.now() - new Date(f.dischargedAt)) / (7 * DAY))));
  }

  const canBill = (f) => !!(window.HMS.billing && canWriteAt(f.centre && f.centre.id));

  function fileView(f, tab, b) {
    const P = f.patient || {}; const w = canWriteAt(f.centre && f.centre.id);
    const reps = reportsOf(f); const fus = followsOf(f); const due = followWeeksDue(f);
    const tabs = h.tabs([
      { id: 'overview', label: 'Overview', href: fileHref(f.id, 'overview') },
      { id: 'reports', label: `Test reports (${reps.length})`, href: fileHref(f.id, 'reports') },
      ...(canBill(f) ? [{ id: 'payment', label: 'Payment', href: fileHref(f.id, 'payment') }] : []),
      { id: 'discharge', label: 'Discharge', href: fileHref(f.id, 'discharge') },
      { id: 'followup', label: f.status === 'DISCHARGED' ? `Follow-up (${fus.filter((x) => x.status === 'ATTENDED').length}/${due})` : 'Follow-up', href: fileHref(f.id, 'followup') },
    ], tab);
    const sub = [P.patientNo, `${P.gender === 'FEMALE' ? 'Female' : 'Male'}, ${P.age ?? '?'}`, srcLabel(f.source),
      f.source === 'POLICE' ? [f.policeReferralNo && 'Police referral ' + f.policeReferralNo, f.policeStation && f.policeStation.name].filter(Boolean).join(' · ') : f.referredBy,
      f.status === 'ADMITTED' ? `day ${dayOf(f)} of ${progDays()}` : 'discharged ' + h.date(f.dischargedAt)].filter(Boolean).join(' · ');
    const head = h.page(`${P.name} · ${f.fileNo}`, sub, `${h.linkBtn('Admissions', '#/admissions')}${h.btn({ label: 'Print file', action: 'printFile', arg: f.id, size: 'sm', tone: 'accent' })}`);
    const roNote = !me().canWrite ? '' : !w ? h.note(`This file belongs to ${centreShort(f.centre && f.centre.id) || 'another centre'}. You can view it; changes are made by that centre's staff.`, 'info') : '';
    if (tab === 'reports') return head + tabs + roNote + reportsTab(f, w);
    if (tab === 'payment' && b) return head + tabs + roNote + window.HMS.billing.payTab(f, b, w);
    if (tab === 'discharge') return head + tabs + roNote + dischargeTab(f, w, b);
    if (tab === 'followup') return head + tabs + roNote + followTab(f, w, due);
    return head + tabs + roNote + overviewTab(f, w);
  }

  function overviewTab(f, w) {
    const P = f.patient || {}; const reps = reportsOf(f);
    const deadline = new Date(new Date(f.admittedAt).getTime() + DAY);
    const missing = !hasPhoto(P) || !P.thumbAt;
    const hoursLeft = Math.ceil((deadline - Date.now()) / 3600000);
    const windowBadge = !missing ? h.badge('Complete', 'ok') : hoursLeft < 0 ? h.badge(`Overdue by ${Math.abs(hoursLeft)} h`, 'danger') : h.badge(`${hoursLeft} h left`, hoursLeft <= 6 ? 'warn' : 'info');
    const idCard = h.card({ title: 'Identity', subtitle: 'Photo and thumb are on the patient record and work at both centres', body: `<div class="bio-row">${avatar(P, 84)}<div class="grow stack-sm" style="flex:1;min-width:240px">${h.dl([
      ['Patient no', `<span class="mono">${h.esc(P.patientNo || '—')}</span>`],
      ['CNIC', `<span class="mono">${h.esc(P.cnic || '—')}</span>`],
      ['Father / husband', h.esc(P.fatherName || '—')],
      ['Gender, age', `${P.gender === 'FEMALE' ? 'Female' : 'Male'}, ${h.esc(P.age ?? '—')}`],
      ['Phone', P.phone ? `<span class="mono">${h.esc(P.phone)}</span>` : '<span class="muted">—</span>'],
      ['Address', h.esc([P.address, P.area].filter(Boolean).join(', ') || '—')],
      ['Photo', hasPhoto(P) ? `${h.badge('on file', 'ok')}${P.photoAt ? ` <span class="muted small">${h.date(P.photoAt)}</span>` : ''}` : h.badge('pending', 'danger')],
      ['Right thumb', P.thumbAt ? `${h.badge('enrolled', 'ok')} <span class="muted small">${h.date(P.thumbAt)}${P.thumbDevice ? ' · ' + h.esc(P.thumbDevice) : ''}</span>` : h.badge('pending', 'danger')],
    ])}${w ? `<div class="row">${h.btn({ label: hasPhoto(P) ? 'Update photo' : 'Take photo', action: 'capturePhoto', arg: f.id, size: 'sm', tone: 'secondary' })}${h.btn({ label: P.thumbAt ? 'Re-enrol thumb' : 'Enrol thumb', action: 'captureThumb', arg: f.id, size: 'sm', tone: 'secondary' })}${P.thumbAt ? h.btn({ label: 'Verify thumb', action: 'verifyThumb', arg: f.id, size: 'sm' }) : ''}</div>` : ''}</div></div>` });

    const admission = h.card({ title: 'Admission', body: h.dl([
      ['Centre', h.esc((f.centre && f.centre.name) || '—')],
      ['DRH file no', `<span class="mono">${h.esc(f.fileNo || '—')}</span>`],
      ['Admitted', `${h.date(f.admittedAt)} ${h.time(f.admittedAt)}`],
      ['Status', f.status === 'ADMITTED' ? h.badge(`Admitted · day ${dayOf(f)} of ${progDays()}`, 'info') : h.badge(`Discharged ${h.date(f.dischargedAt)} · ${outcomeLabel(f.outcome)}`, 'ok')],
      ['Source', `${sourceBadge(f.source)}${f.source === 'REFERRAL' && f.referredBy ? ' ' + h.esc(f.referredBy) : ''}`],
      ['Substance', `${h.esc(f.substance || '—')}${f.useYears != null && f.useYears !== '' ? ` <span class="muted small">· ${plural(Number(f.useYears), 'year')} of use</span>` : ''}`],
      ['Ward / bed', h.esc(f.bed || '—')],
    ]) });
    const off = f.officer || {};
    const police = f.source === 'POLICE' ? h.card({ title: 'Police referral', subtitle: 'Brought in as a patient, not booked as an accused', body: h.dl([
      ['Referral no', `<span class="mono">${h.esc(f.policeReferralNo || '—')}</span>`],
      ['Police station', f.policeStation ? `<a href="${h.esc(window.HMS.href('station', { id: f.policeStation.id }))}">${h.esc(f.policeStation.name)}</a>` : '—'],
      ['Officer', h.esc([off.name, off.rank].filter(Boolean).join(' · ') || '—') + (off.phone ? ` <span class="muted small mono">${h.esc(off.phone)}</span>` : '')],
      ['Picked up from', f.pickupPlace ? `<a href="${h.esc(window.HMS.href('place', { id: f.pickupPlace.id }))}">${h.esc(f.pickupPlace.name)}</a> ${h.badge(f.pickupPlace.type || '', 'info')}${f.pickupPlace.area ? ` <span class="muted small">${h.esc(f.pickupPlace.area)}</span>` : ''}` : '—'],
    ]) }) : '';
    const guardians = h.card({ title: 'Guardians', subtitle: 'Both numbers must stay reachable for the whole stay', body: (f.guardians || []).length ? `<div class="list">${(f.guardians || []).map((g, i) => `<div class="item"><span class="badge info">${h.esc(g.relation)}</span><div class="grow"><b>${h.esc(g.name)}</b><div class="muted small mono">${h.esc(g.phone)}</div></div>${w ? h.btn({ label: 'Log call', action: 'logCall', arg: f.id + '|' + i, size: 'sm', tone: 'secondary' }) : ''}</div>`).join('')}</div>` : h.empty('No guardians on file') });
    const clinical = h.card({ title: 'Photo, thumb & tests', body: h.dl([
      ['Photo (webcam)', hasPhoto(P) ? h.badge('captured', 'ok') : h.badge('pending', 'danger')],
      ['Thumb (fingerprint reader)', P.thumbAt ? h.badge('captured', 'ok') : h.badge('pending', 'danger')],
      ['24-hour window', `${windowBadge} <span class="muted small">deadline ${h.date(deadline.toISOString())} ${h.time(deadline.toISOString())}</span>`],
      ['Test reports', `${reportsBadge(reps.length)} <a href="${h.esc(fileHref(f.id, 'reports'))}" class="small">open</a>`],
      ...(f.status === 'DISCHARGED' ? [['Weekly follow-up', `${followsOf(f).filter((x) => x.status === 'ATTENDED').length} of ${followWeeksDue(f)} attended <a href="${h.esc(fileHref(f.id, 'followup'))}" class="small">open</a>`]] : []),
    ]) });
    const events = (f.events || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    const activity = h.card({ title: 'Activity', body: events.length ? h.timeline(events.map((e) => ({ at: h.date(e.at), title: e.title, body: [e.body, e.byName && 'by ' + e.byName].filter(Boolean).join(' · ') }))) : h.empty('No activity yet') });
    const others = (f.otherAdmissions || []).length ? h.card({ title: 'Other admissions of this person', subtitle: 'Same CNIC, earlier or other centre', body: admissionsTable(f.otherAdmissions, '', true) }) : '';
    return idCard + '<div class="grid-2">' + admission + (police || clinical) + guardians + (police ? clinical : '') + activity + '</div>' + others;
  }

  function reportsTab(f, w) {
    const reps = reportsOf(f).slice().sort((a, b) => String(b.testDate || '').localeCompare(String(a.testDate || '')));
    const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB');
    const list = h.card({ title: 'Test reports', subtitle: 'Initial package (HBsAg, HCV, HIV, CBC, LFT, urine drug screen) and later tests', body: h.table({
      columns: [
        { key: 't', label: 'Test', render: (r) => `<b>${h.esc(r.testName)}</b>` },
        { key: 'd', label: 'Test date', render: (r) => h.date(r.testDate) },
        { key: 'n', label: 'Result', render: (r) => h.esc(r.resultNote || '—') },
        { key: 'f', label: 'File', render: (r) => `${h.esc(r.fileName || '')}<div class="muted small">${h.esc(String(r.mimeType || '').replace('application/', '').replace('image/', '').toUpperCase())} · ${kb(r.sizeBytes)}</div>` },
        { key: 'u', label: 'Uploaded', render: (r) => `${h.date(r.uploadedAt)}<div class="muted small">${h.esc(r.uploadedBy || '')}</div>` },
        { key: 'x', label: '', render: (r) => `${h.btn({ label: 'Open', action: 'openReport', arg: r.id, size: 'sm', tone: 'secondary' })} ${h.btn({ label: 'Download', action: 'downloadReport', arg: r.id, size: 'sm', tone: 'secondary' })}` },
      ], rows: reps, empty: 'No test report uploaded yet. The initial tests are still pending.' }) });
    const upload = w ? h.card({ title: 'Upload a test report', subtitle: 'PDF, JPG, PNG or WEBP, up to 10 MB', body: h.form({ id: 'report-form', fields: [
      { id: 'file', label: 'Report file', type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp', required: true, span: 2 },
      { id: 'testName', label: 'Test name', placeholder: 'e.g. Initial package: HBsAg, HCV, HIV, CBC', required: true, maxlength: 120 },
      { id: 'testDate', label: 'Test date', type: 'date', value: today(), max: today(), required: true },
      { id: 'resultNote', label: 'Result note', type: 'textarea', placeholder: 'e.g. HCV reactive, referred to hepatitis clinic', span: 2, maxlength: 500 },
    ], submit: { label: 'Upload report', action: 'uploadReport', arg: f.id } }) }) : '';
    return list + upload;
  }

  function dischargeTab(f, w, b) {
    const P = f.patient || {}; const reps = reportsOf(f);
    const checks = [
      { label: 'Two guardians on file with phone numbers', ok: (f.guardians || []).length >= 2 && (f.guardians || []).every((g) => g.phone) },
      { label: 'Photo and thumb enrolment complete', ok: hasPhoto(P) && !!P.thumbAt },
      { label: 'Initial test report uploaded', ok: reps.length > 0 },
      { label: `Detox and rehabilitation programme (${progDays()} days)`, ok: dayOf(f) >= progDays() - 7 },
    ];
    const ready = checks.every((x) => x.ok);
    const outcomes = meta().outcomes || [];
    const def = dayOf(f) >= progDays() - 7 ? 'PROGRAMME_COMPLETED' : 'GUARDIAN_REQUEST';
    let action = '';
    if (f.status === 'DISCHARGED') action = h.note(`Discharged on ${h.date(f.dischargedAt)} — ${outcomeLabel(f.outcome)}.`, 'info');
    else if (w) action = (!ready ? h.note('An early discharge (guardian request, against medical advice or referral) is still possible; the outcome is written on the file.', 'warn') : '')
      + `<form id="discharge-form" data-form-id="discharge-form" style="margin-top:12px"><div class="form-grid">${h.field({ id: 'outcome', label: 'Outcome', type: 'select', value: def, options: outcomes.map((o) => ({ value: o.value, label: o.label })), required: true })}${h.field({ id: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'e.g. discharged to father, follow-up every Thursday', span: 2, maxlength: 500 })}</div>${b ? `<div style="margin-top:12px">${window.HMS.billing.dischargeExtra(b)}</div>` : ''}<div class="row end" style="margin-top:12px">${h.btn({ label: 'Confirm discharge', action: 'dischargeAsk', arg: f.id, form: 'discharge-form' })}</div></form>`;
    else action = h.note('Still admitted. Discharge is recorded by the centre staff.', 'info');
    return h.card({ title: 'Discharge checklist', tone: f.status === 'DISCHARGED' || ready ? 'ok' : 'warn', body: `<div class="list">${checks.map((x) => `<div class="item">${h.badge(x.ok ? 'done' : 'pending', x.ok ? 'ok' : 'warn')}<div class="grow">${h.esc(x.label)}</div></div>`).join('')}</div>${action}` })
      + h.card({ title: 'Discharge summary', body: `<div class="row">${h.btn({ label: 'Preview summary', action: 'printFile', arg: f.id, tone: 'secondary' })}<span class="muted small">Prints on YCDO letterhead with the photo, guardians, stay, tests and outcome.</span></div>` });
  }

  function followTab(f, w, due) {
    if (f.status !== 'DISCHARGED') return h.card({ title: 'Weekly follow-up', body: h.note('Weekly follow-up starts after discharge. Each week the patient visits (or is called) and the visit is recorded here as attended or missed.', 'info') });
    const fus = followsOf(f); const byWeek = new Map(fus.map((x) => [Number(x.weekNo), x]));
    const maxWeek = Math.max(due, ...fus.map((x) => Number(x.weekNo) || 0), 0);
    const rows = [];
    for (let i = 1; i <= maxWeek; i++) rows.push({ week: i, rec: byWeek.get(i), dueAt: new Date(new Date(f.dischargedAt).getTime() + i * 7 * DAY).toISOString() });
    const attended = fus.filter((x) => x.status === 'ATTENDED').length; const missed = fus.filter((x) => x.status === 'MISSED').length;
    const notRec = rows.filter((r) => !r.rec && r.week <= due).length;
    const next = (() => { for (let i = 1; i <= MAX_FOLLOW_WEEKS + 40; i++) if (!byWeek.has(i)) return i; return maxWeek + 1; })();
    const table = h.card({ title: 'Weekly follow-up after discharge', subtitle: `${plural(due, 'week')} due since ${h.date(f.dischargedAt)} · ${h.num(attended)} attended · ${h.num(missed)} missed · ${h.num(notRec)} not recorded`, body: h.table({
      columns: [
        { key: 'w', label: 'Week', render: (r) => `<b>Week ${r.week}</b>` },
        { key: 'd', label: 'Due', render: (r) => h.date(r.dueAt) },
        { key: 's', label: 'Status', render: (r) => (r.rec ? (r.rec.status === 'ATTENDED' ? h.badge('Attended', 'ok') : h.badge('Missed', 'danger')) : r.week <= due ? h.badge('Not recorded', 'warn') : h.badge('Upcoming')) },
        { key: 'v', label: 'Visit date', render: (r) => (r.rec ? h.date(r.rec.visitDate) : '—') },
        { key: 'n', label: 'Note', render: (r) => h.esc((r.rec && r.rec.note) || '') },
        { key: 'b', label: 'Recorded', render: (r) => (r.rec ? `${h.date(r.rec.recordedAt)}<div class="muted small">${h.esc(r.rec.recordedBy || '')}</div>` : '') },
      ], rows, empty: 'The first weekly follow-up is due one week after discharge.' }) });
    const weekOpts = []; for (let i = 1; i <= Math.max(next, due, 1) + 1; i++) if (!byWeek.has(i)) weekOpts.push({ value: i, label: `Week ${i}${i > due ? ' (early)' : ''}` });
    const form = w ? h.card({ title: 'Record a weekly follow-up', body: h.form({ id: 'follow-form', fields: [
      { id: 'weekNo', label: 'Week', type: 'select', value: next, options: weekOpts },
      { id: 'status', label: 'Status', type: 'select', value: 'ATTENDED', options: [{ value: 'ATTENDED', label: 'Attended' }, { value: 'MISSED', label: 'Missed' }] },
      { id: 'visitDate', label: 'Visit date', type: 'date', value: today(), max: today(), required: true },
      { id: 'note', label: 'Note (optional)', type: 'textarea', placeholder: 'e.g. came with brother, urine screen negative', span: 2, maxlength: 500 },
    ], submit: { label: 'Save follow-up', action: 'saveFollowUp', arg: f.id } }) }) : '';
    return table + form;
  }

  /* ══ Police stations and pick-up places ══════════════════ */
  window.HMS.screen('station', {
    title: 'Police station',
    render: async (c) => {
      const s = await c.cached('st:' + c.params.id, () => api.get(`/drh/police-stations/${encodeURIComponent(c.params.id)}`));
      const st = s.stats || {};
      const L = (f, t) => window.HMS.href('admissions', { policeStationId: s.id, ...f, t: `${t} · ${s.name}` });
      return h.page(s.name, ['Police station', s.area, s.phone].filter(Boolean).join(' · '), h.linkBtn('All police stations', '#/stations'))
        + h.kpis([
          { label: 'Brought in (all time)', value: h.num(st.total), tone: 'info', sub: 'police referrals from this station', href: L({}, 'Police referrals') },
          { label: 'Under care now', value: h.num(st.underCare), tone: 'info', href: L({ status: 'ADMITTED' }, 'Under care') },
          { label: 'Discharged', value: h.num(st.discharged), tone: 'ok', href: L({ status: 'DISCHARGED' }, 'Discharged') },
        ])
        + h.card({ title: 'Where this station found them', subtitle: 'Pick-up places of its referrals', body: bars((s.places || []).map((p) => ({ label: `${p.name}${p.type ? ' (' + p.type.toLowerCase() + ')' : ''}`, n: p.count, href: window.HMS.href('place', { id: p.id }) })), '#475569') })
        + h.card({ title: `Patients brought in by ${s.name} (${h.num((s.admissions || []).length)})`, body: admissionsTable(s.admissions || [], 'No patients from this station yet', true) });
    },
  });

  window.HMS.screen('place', {
    title: 'Pick-up place',
    render: async (c) => {
      const p = await c.cached('pl:' + c.params.id, () => api.get(`/drh/places/${encodeURIComponent(c.params.id)}`));
      const st = p.stats || {};
      const L = (f, t) => window.HMS.href('admissions', { pickupPlaceId: p.id, ...f, t: `${t} · ${p.name}` });
      return h.page(p.name, [p.type, p.area].filter(Boolean).join(' · '), h.linkBtn('All pick-up places', '#/places'))
        + (p.policeStation ? h.noteHtml(`Area police station: <a href="${h.esc(window.HMS.href('station', { id: p.policeStation.id }))}">${h.esc(p.policeStation.name)}</a>`, 'info') : '')
        + h.kpis([
          { label: 'Found here (all time)', value: h.num(st.total), tone: 'info', sub: 'police referrals', href: L({}, 'Found at') },
          { label: 'Under care now', value: h.num(st.underCare), tone: 'info', href: L({ status: 'ADMITTED' }, 'Under care, found at') },
        ])
        + h.card({ title: 'Brought in by', subtitle: 'Police stations that picked up patients here', body: bars((p.stations || []).map((s) => ({ label: s.name, n: s.count, href: window.HMS.href('station', { id: s.id }) })), '#1e293b') })
        + h.card({ title: `Patients found at ${p.name} (${h.num((p.admissions || []).length)})`, body: admissionsTable(p.admissions || [], 'No patients from this place yet', true) });
    },
  });

  window.HMS.screen('stations', {
    title: 'Police stations',
    render: async (c) => {
      const q = c.params.q || '';
      const list = await c.cached('stations', () => api.get('/drh/police-stations', { q }));
      return h.page('Police stations', 'Stations that refer patients to the centres. Open one to see its patients and pick-up places.', me().canWrite ? h.btn({ label: 'Add police station', action: 'addStation', arg: 'index', size: 'sm' }) : '')
        + `<form id="st-search" data-form-id="st-search" class="searchbar"><input name="q" type="search" value="${h.esc(q)}" placeholder="Station name or area" aria-label="Search police stations">${h.btn({ label: 'Search', action: 'indexSearch', arg: 'stations', form: 'st-search' })}</form>`
        + h.card({ title: `Police stations (${h.num(list.length)})`, body: h.table({ columns: [
          { key: 'name', label: 'Station', render: (s) => `<b>${h.esc(s.name)}</b>` },
          { key: 'area', label: 'Area', render: (s) => h.esc(s.area || '—') },
          { key: 'phone', label: 'Phone', render: (s) => (s.phone ? `<span class="mono">${h.esc(s.phone)}</span>` : '—') },
          { key: 'n', label: 'Patients brought in', align: 'right', render: (s) => h.num(s.admissions) },
        ], rows: list, rowHref: (s) => window.HMS.href('station', { id: s.id }), empty: q ? 'No station matches' : 'No police stations yet. They are added during registration.' }) });
    },
  });

  window.HMS.screen('places', {
    title: 'Pick-up places',
    render: async (c) => {
      const q = c.params.q || ''; const type = c.params.type || '';
      const list = await c.cached('places', () => api.get('/drh/places', { q, type }));
      return h.page('Pick-up places', 'Where police found the patients: graveyards, roadsides, bridges and other places.', me().canWrite ? h.btn({ label: 'Add place', action: 'addPlace', arg: 'index', size: 'sm' }) : '')
        + `<form id="pl-search" data-form-id="pl-search" class="searchbar"><input name="q" type="search" value="${h.esc(q)}" placeholder="Place name or area" aria-label="Search places"><div style="min-width:200px">${h.field({ id: 'type', label: '', type: 'select', value: type, options: [{ value: '', label: 'All types' }].concat((meta().placeTypes || []).map((t) => ({ value: t, label: t }))) }).replace('<label for="type"></label>', '')}</div>${h.btn({ label: 'Search', action: 'indexSearch', arg: 'places', form: 'pl-search' })}</form>`
        + h.card({ title: `Places (${h.num(list.length)})`, body: h.table({ columns: [
          { key: 'name', label: 'Place', render: (p) => `<b>${h.esc(p.name)}</b>` },
          { key: 'type', label: 'Type', render: (p) => h.badge(p.type || '', 'info') },
          { key: 'area', label: 'Area', render: (p) => h.esc(p.area || '—') },
          { key: 'ps', label: 'Police station', render: (p) => h.esc((p.policeStation && p.policeStation.name) || '—') },
          { key: 'n', label: 'Patients found here', align: 'right', render: (p) => h.num(p.admissions) },
        ], rows: list, rowHref: (p) => window.HMS.href('place', { id: p.id }), empty: q || type ? 'No place matches' : 'No places yet. They are added during registration.' }) });
    },
  });

  /* ══ Type-ahead: police stations and places ══════════════
     Matching ignores case, "PS" / "police station" / "thana", spaces and hyphens, and allows a
     small spelling slip, so "ps gul-gasht" finds "PS Gulgasht". "Add new" creates one; if the
     server finds a very similar one it answers 409 with "Did you mean …?". */
  const TA = { stations: null, places: null };
  const loadStations = () => (TA.stations = TA.stations || api.get('/drh/police-stations').catch((e) => { TA.stations = null; throw e; }));
  const loadPlaces = () => (TA.places = TA.places || api.get('/drh/places').catch((e) => { TA.places = null; throw e; }));
  const norm = (s) => String(s || '').toLowerCase().replace(/police\s*station|thana|\bp\s*\.?\s*s\b\.?/g, ' ').replace(/[^a-z0-9؀-ۿ]/g, '');
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  function taMatch(list, q, extra) {
    const nq = norm(q);
    const scored = [];
    for (const it of list) {
      if (extra && !extra(it)) continue;
      const nn = norm(it.name); const na = norm(it.area);
      let s = 0;
      if (!nq) s = 1;
      else if (nn.startsWith(nq)) s = 5;
      else if (nn.includes(nq)) s = 4;
      else if (na.includes(nq)) s = 2;
      else if (nq.length >= 3 && lev(nq, nn.slice(0, nq.length)) <= (nq.length > 6 ? 2 : 1)) s = 3;
      else if (nq.length >= 4 && lev(nq, nn) <= 2) s = 3;
      if (s) scored.push([s, it]);
    }
    return scored.sort((a, b) => b[0] - a[0] || (b[1].admissions || 0) - (a[1].admissions || 0) || String(a[1].name).localeCompare(String(b[1].name))).slice(0, 12).map((x) => x[1]);
  }
  const taDef = {
    station: { load: loadStations, sub: (s) => [s.area, s.admissions ? plural(s.admissions, 'patient') : ''].filter(Boolean).join(' · '), addLabel: 'police station', filter: () => null },
    place: { load: loadPlaces, sub: (p) => [p.type, p.area, p.policeStation && p.policeStation.name, p.admissions ? plural(p.admissions, 'patient') : ''].filter(Boolean).join(' · '), addLabel: 'place',
      filter: () => { const t = (document.getElementById('pickupType') || {}).value; return t ? (p) => p.type === t : null; } },
  };
  /** markup: visible text box + hidden id; data-ta names the kind */
  function typeahead({ kind, id, textName, idName, label, required, text, value, placeholder, hint }) {
    return `<div class="field ta" data-ta="${kind}"><label for="${id}">${h.esc(label)}${required ? ' <span class="req">*</span>' : ''}</label><input id="${id}" name="${textName}" class="ta-in" type="text" autocomplete="off" value="${h.esc(text || '')}" placeholder="${h.esc(placeholder || 'Type to search…')}" role="combobox" aria-expanded="false"><input type="hidden" name="${idName}" value="${h.esc(value || '')}"><div class="ta-pop" role="listbox" hidden></div><div class="ta-chosen">${value ? '✓ chosen from the list' : ''}</div>${hint ? `<div class="hint">${h.esc(hint)}</div>` : ''}</div>`;
  }
  async function taOpen(wrap) {
    const kind = wrap.dataset.ta; const def = taDef[kind]; const input = wrap.querySelector('.ta-in'); const pop = wrap.querySelector('.ta-pop');
    let list;
    try { list = await def.load(); } catch (e) { pop.innerHTML = `<div class="combo-none">${h.esc(e.message)}</div>`; pop.hidden = false; return; }
    if (document.activeElement !== input) return;
    const q = input.value.trim();
    const hits = taMatch(list, q, def.filter());
    const exact = hits.some((x) => norm(x.name) === norm(q));
    pop.innerHTML = hits.map((x, i) => `<div class="ta-opt ${i === 0 ? 'active' : ''}" role="option" data-id="${h.esc(x.id)}" data-name="${h.esc(x.name)}">${h.esc(x.name)}<small>${h.esc(def.sub(x))}</small></div>`).join('')
      + (!hits.length ? `<div class="combo-none">No ${def.addLabel} matches${q ? ` “${h.esc(q)}”` : ''}</div>` : '')
      + (me().canWrite && q && !exact ? `<div class="ta-opt add ${hits.length ? '' : 'active'}" role="option" data-add="1">+ Add new ${def.addLabel} “${h.esc(q)}”</div>` : '');
    pop.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  function taClose(wrap) { const pop = wrap.querySelector('.ta-pop'); if (pop) pop.hidden = true; const i = wrap.querySelector('.ta-in'); if (i) i.setAttribute('aria-expanded', 'false'); }
  function taSet(wrap, id, name) {
    const input = wrap.querySelector('.ta-in'); const hid = wrap.querySelector('input[type=hidden]');
    input.value = name || ''; hid.value = id || '';
    wrap.querySelector('.ta-chosen').textContent = id ? '✓ chosen from the list' : '';
    wrap.classList.remove('err');
    saveDraftFromDom();
    taClose(wrap);
  }
  function taPick(wrap, opt) {
    if (opt.dataset.add) { taClose(wrap); const q = wrap.querySelector('.ta-in').value.trim(); if (wrap.dataset.ta === 'station') openAddStation('reg', q); else openAddPlace('reg', q); return; }
    taSet(wrap, opt.dataset.id, opt.dataset.name);
  }
  let taTimer = null;
  document.addEventListener('input', (e) => {
    const input = e.target.closest && e.target.closest('.ta-in'); if (!input) return;
    const wrap = input.closest('.ta');
    const hid = wrap.querySelector('input[type=hidden]'); if (hid.value) { hid.value = ''; wrap.querySelector('.ta-chosen').textContent = ''; }
    clearTimeout(taTimer); taTimer = setTimeout(() => taOpen(wrap), 120);
  });
  document.addEventListener('focusin', (e) => { const input = e.target.closest && e.target.closest('.ta-in'); if (input) taOpen(input.closest('.ta')); });
  document.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.ta-opt');
    if (opt) { e.preventDefault(); taPick(opt.closest('.ta'), opt); return; }
    if (!e.target.closest('.ta')) document.querySelectorAll('.ta').forEach(taClose);
  });
  document.addEventListener('keydown', (e) => {
    const input = e.target.closest && e.target.closest('.ta-in'); if (!input) return;
    const wrap = input.closest('.ta'); const pop = wrap.querySelector('.ta-pop');
    const opts = [...pop.querySelectorAll('.ta-opt')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (pop.hidden) { taOpen(wrap); return; }
      let i = opts.findIndex((o) => o.classList.contains('active')); i = Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      opts.forEach((o) => o.classList.remove('active')); if (opts[i]) { opts[i].classList.add('active'); opts[i].scrollIntoView({ block: 'nearest' }); }
    } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const a = pop.hidden ? null : opts.find((o) => o.classList.contains('active')); if (a) taPick(wrap, a); }
    else if (e.key === 'Escape') { if (!pop.hidden) { e.stopPropagation(); taClose(wrap); } }
    else if (e.key === 'Tab') taClose(wrap);
  }, true);

  /* Add station / place, with the "Did you mean …?" step on 409. ctx 'reg' fills the registration form. */
  function openAddStation(ctx, name) {
    window.HMS.modal('Add police station', h.form({ id: 'st-form', fields: [
      { id: 'stName', label: 'Station name', value: name || '', placeholder: 'e.g. PS Gulgasht', required: true, autofocus: true, maxlength: 80 },
      { id: 'stArea', label: 'Area', placeholder: 'e.g. Gulgasht Colony, Multan', maxlength: 120 },
      { id: 'stPhone', label: 'Phone', kind: 'phone', placeholder: '061-xxxxxxx or 03xx-xxxxxxx' },
    ], submit: { label: 'Add station', action: 'createStation', arg: ctx } }));
  }
  function openAddPlace(ctx, name) {
    const draftType = (document.getElementById('pickupType') || {}).value || SD.reg.pickupType || '';
    const stationId = ctx === 'reg' ? (document.querySelector('input[name=policeStationId]') || {}).value || SD.reg.policeStationId || '' : '';
    window.HMS.modal('Add pick-up place', h.form({ id: 'pl-form', fields: [
      { id: 'plType', label: 'Type of place', type: 'select', value: draftType || (meta().placeTypes || [])[0], options: (meta().placeTypes || []).map((t) => ({ value: t, label: t })), required: true },
      { id: 'plName', label: 'Name', value: name || '', placeholder: 'e.g. Qabristan Hassan Parwana', required: true, autofocus: true, maxlength: 120 },
      { id: 'plArea', label: 'Area', placeholder: 'e.g. Hassan Parwana Colony, Multan', maxlength: 120 },
    ], submit: { label: 'Add place', action: 'createPlace', arg: ctx + '|' + stationId } }));
  }
  function similarStep(kind, ctx, payload, err) {
    const sim = (err.data && err.data.similar) || [];
    const label = kind === 'station' ? 'police station' : 'place';
    const body = h.note(err.message || `A very similar ${label} already exists.`, 'warn')
      + `<div class="label" style="margin:14px 0 6px">Did you mean …?</div><div class="list">${sim.map((s) => `<div class="item"><div class="grow"><b>${h.esc(s.name)}</b><div class="muted small">${h.esc([s.type, s.area].filter(Boolean).join(' · '))}</div></div>${h.btn({ label: 'Use this', action: 'useExisting', arg: `${kind}|${ctx}|${s.id}|${s.name}`, size: 'sm' })}</div>`).join('') || '<div class="muted small">—</div>'}</div>`
      + `<div class="row end" style="margin-top:14px">${h.btn({ label: `No, add “${payload.name}” as a new ${label}`, action: kind === 'station' ? 'forceStation' : 'forcePlace', arg: ctx, tone: 'secondary' })}</div>`;
    pendingCreate = { kind, ctx, payload };
    window.HMS.modal(`Is this ${label} already on the list?`, body);
  }
  let pendingCreate = null;
  function created(kind, ctx, item) {
    if (kind === 'station') TA.stations = null; else TA.places = null;
    window.HMS.closeModal();
    if (ctx === 'reg') {
      saveDraftFromDom();
      if (kind === 'station') { SD.reg.policeStationId = item.id; SD.reg.stationText = item.name; }
      else { SD.reg.pickupPlaceId = item.id; SD.reg.placeText = item.name; if (item.type) SD.reg.pickupType = item.type; }
      window.HMS.render();
    } else { window.HMS.dropCached(); window.HMS.render(); }
  }
  async function postStation(ctx, payload) {
    try { const s = await api.post('/drh/police-stations', payload); created('station', ctx, s); return `${s.name} added`; }
    catch (e) { if (e.status === 409) { similarStep('station', ctx, payload, e); return; } throw e; }
  }
  async function postPlace(ctx, payload) {
    try { const p = await api.post('/drh/places', payload); created('place', ctx, p); return `${p.name} added`; }
    catch (e) { if (e.status === 409) { similarStep('place', ctx, payload, e); return; } throw e; }
  }

  /* ══ Registration ════════════════════════════════════════ */
  /* Draft of the registration form, so a blocked submit or a page change never wipes what was typed. */
  const SD = { reg: {}, lookup: null };
  const dv = (id, fallback) => (SD.reg[id] !== undefined && SD.reg[id] !== '' ? SD.reg[id] : (fallback === undefined ? '' : fallback));
  function saveDraftFromDom() {
    const f = document.getElementById('drh-form'); if (!f) return;
    for (const el of f.querySelectorAll('input,select,textarea')) if (el.name && el.type !== 'file') SD.reg[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('#drh-form') && e.target.name) SD.reg[e.target.name] = e.target.value; });
  document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#drh-form') && e.target.name) SD.reg[e.target.name] = e.target.value; });

  window.HMS.screen('register', {
    title: 'Register DRH patient', write: true,
    render: async () => {
      const L = SD.lookup; const centres = meta().centres.filter((x) => myCentreIds().includes(x.id));
      const looked = !!L; const blocked = !!(L && L.openAdmission); const P = L && L.patient;
      const stepState = (i) => (!looked ? (i === 0 ? 'active' : 'todo') : blocked ? (i === 0 ? 'active' : 'todo') : i === 0 ? 'done' : 'active');
      const head = h.page('Register DRH patient', centres.length === 1 ? `Centre: ${centres[0].name}` : 'Choose the centre in step 3', h.linkBtn('Admissions', '#/admissions'))
        + h.steps([{ label: 'CNIC & identity', state: stepState(0) }, { label: 'Guardians', state: stepState(1) }, { label: 'Source & history', state: stepState(2) }, { label: 'Photo & thumb', state: stepState(3) }, { label: 'Payment', state: stepState(4) }]);
      if (!centres.length) return head + h.note('Your account is not linked to a centre, so it cannot register patients. Ask YCDO IT to add your centre.', 'warn');

      const cnicField = `<div class="form-grid">${h.field({ id: 'cnic', label: 'CNIC', kind: 'cnic', placeholder: '36302-xxxxxxx-x', value: looked ? L.cnic : dv('cnic'), required: true, readonly: looked, autofocus: !looked, hint: 'Look up the CNIC first: a person registered before keeps the same patient number' })}<div class="field"><label>&nbsp;</label>${looked ? h.btn({ label: 'Change CNIC', action: 'regReset', tone: 'secondary' }) : h.btn({ label: 'Look up CNIC', action: 'regLookup', form: 'drh-form' })}</div></div>`;
      let identity;
      if (!looked) identity = cnicField + `<div style="margin-top:12px">${h.note('Enter the CNIC and press Look up. If the person was registered before, the new admission is opened on the same patient record.', 'info')}</div>`;
      else if (blocked) {
        const o = L.openAdmission;
        identity = cnicField + `<div style="margin-top:12px">${h.noteHtml(`<b>${h.esc(o.patient ? o.patient.name : 'This person')} is already admitted</b> at ${h.esc((o.centre && o.centre.name) || 'a DRH centre')} (file ${h.esc(o.fileNo)}, since ${h.date(o.admittedAt)}). A second admission cannot be opened until that one is discharged. <a href="${h.esc(fileHref(o.id))}">Open the file</a>`, 'danger')}</div>`;
      } else if (P) {
        identity = cnicField + `<div class="bio-row" style="margin-top:14px">${avatar(P, 60)}<div class="grow" style="flex:1;min-width:220px">${h.dl([
          ['Patient', `<b>${h.esc(P.name)}</b> <span class="muted small">${h.esc(P.patientNo || '')}</span>`],
          ['Father / husband', h.esc(P.fatherName || '—')], ['Gender, age', `${P.gender === 'FEMALE' ? 'Female' : 'Male'}, ${h.esc(P.age ?? '—')}`],
          ['Phone', h.esc(P.phone || '—')], ['Address', h.esc([P.address, P.area].filter(Boolean).join(', ') || '—')],
        ])}</div></div><div style="margin-top:10px">${h.note('Registered before: a new admission will be opened for this person on the same patient record.', 'ok')}</div>`;
      } else {
        identity = cnicField + `<div style="margin-top:10px">${h.note('No patient with this CNIC yet: capture the new patient below.', 'info')}</div><div class="form-grid" style="margin-top:12px">${[
          h.field({ id: 'name', label: 'Full name', kind: 'person', value: dv('name'), required: true }),
          h.field({ id: 'fatherName', label: 'Father / husband name', kind: 'person', value: dv('fatherName'), required: true }),
          h.field({ id: 'gender', label: 'Gender', type: 'select', value: dv('gender', 'MALE'), options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }] }),
          h.field({ id: 'age', label: 'Age', type: 'number', min: 10, max: 100, value: dv('age'), required: true }),
          h.field({ id: 'phone', label: 'Phone', kind: 'phone', placeholder: '03xx-xxxxxxx', value: dv('phone') }),
          h.field({ id: 'address', label: 'Address', placeholder: 'House / street / mohallah', value: dv('address'), maxlength: 200 }),
          h.field({ id: 'area', label: 'Area', placeholder: 'e.g. Gulgasht Colony, Multan', value: dv('area'), maxlength: 120 }),
        ].join('')}</div>`;
      }
      const cards = [h.card({ title: '1 · CNIC and identity', subtitle: 'The same patient number is used at both centres', body: identity })];
      if (looked && !blocked) {
        const rel = (meta().relations || []).map((v) => ({ value: v, label: v }));
        const src = dv('source', 'FAMILY');
        cards.push(h.card({ title: '2 · Guardians', subtitle: 'The DRH standard operating procedure requires two active guardian contacts. Registration is blocked if either is missing.', tone: 'warn', body: `<div class="form-grid">${[
          h.field({ id: 'g1name', label: 'Guardian 1 name', kind: 'person', required: true, value: dv('g1name') }),
          h.field({ id: 'g1rel', label: 'Relationship', type: 'select', value: dv('g1rel', 'Father'), options: rel }),
          h.field({ id: 'g1phone', label: 'Guardian 1 phone', kind: 'phone', required: true, value: dv('g1phone') }),
          h.field({ id: 'g2name', label: 'Guardian 2 name', kind: 'person', required: true, value: dv('g2name') }),
          h.field({ id: 'g2rel', label: 'Relationship', type: 'select', value: dv('g2rel', 'Brother'), options: rel }),
          h.field({ id: 'g2phone', label: 'Guardian 2 phone', kind: 'phone', required: true, value: dv('g2phone') }),
        ].join('')}</div>` }));
        const police = src === 'POLICE' ? `<div class="label" style="margin:16px 0 8px">Police referral</div><div class="form-grid">${[
          h.field({ id: 'policeReferralNo', label: 'Police referral no', value: dv('policeReferralNo'), required: true, placeholder: 'as written on the referral letter', maxlength: 60 }),
          typeahead({ kind: 'station', id: 'stationText', textName: 'stationText', idName: 'policeStationId', label: 'Police station', required: true, text: dv('stationText'), value: dv('policeStationId'), placeholder: 'Type, e.g. Gulgasht', hint: 'Choose from the list, or add it if it is not there' }),
          h.field({ id: 'officerName', label: 'Officer name', kind: 'person', value: dv('officerName'), required: true }),
          h.field({ id: 'officerRank', label: 'Officer rank', type: 'select', value: dv('officerRank', ''), options: [{ value: '', label: '—' }].concat((meta().ranks || []).map((r) => ({ value: r, label: r }))) }),
          h.field({ id: 'officerPhone', label: 'Officer phone', kind: 'phone', value: dv('officerPhone'), placeholder: '03xx-xxxxxxx' }),
          h.field({ id: 'pickupType', label: 'Found at (type of place)', type: 'select', value: dv('pickupType', ''), options: [{ value: '', label: 'Any type' }].concat((meta().placeTypes || []).map((t) => ({ value: t, label: t }))) }),
          typeahead({ kind: 'place', id: 'placeText', textName: 'placeText', idName: 'pickupPlaceId', label: 'Pick-up place (name / area)', required: true, text: dv('placeText'), value: dv('pickupPlaceId'), placeholder: 'e.g. Qabristan Hassan Parwana', hint: 'Where the police found the patient' }),
        ].join('')}</div>` : src === 'REFERRAL' ? `<div class="form-grid" style="margin-top:12px">${h.field({ id: 'referredBy', label: 'Referred by', value: dv('referredBy'), placeholder: 'Doctor, hospital or department', span: 2, maxlength: 120 })}</div>` : '';
        cards.push(h.card({ title: '3 · Source of admission & history', body: `<div class="form-grid">${[
          h.field({ id: 'centreId', label: 'Centre', type: 'select', value: dv('centreId', centres.length === 1 ? centres[0].id : (centres.find((x) => x.id === window.HMS.state.centreId) || {}).id || ''), options: (centres.length > 1 ? [{ value: '', label: 'Choose the centre' }] : []).concat(centres.map((x) => ({ value: x.id, label: x.name }))), required: true, disabled: centres.length === 1 }),
          h.field({ id: 'source', label: 'Source', type: 'select', value: src, change: 'regSource', options: [{ value: 'FAMILY', label: 'Family (brought by family)' }, { value: 'POLICE', label: 'Police' }, { value: 'REFERRAL', label: 'Referral (doctor / hospital / department)' }] }),
          h.field({ id: 'substance', label: 'Substance used', type: 'select', value: dv('substance', (meta().substances || [])[0]), options: (meta().substances || []).map((v) => ({ value: v, label: v })) }),
          h.field({ id: 'useYears', label: 'Years of use', type: 'number', min: 0, max: 60, value: dv('useYears') }),
          h.field({ id: 'bed', label: 'Ward / bed', placeholder: 'e.g. Ward A · Bed 12', value: dv('bed'), maxlength: 60 }),
        ].join('')}${centres.length === 1 ? `<input type="hidden" name="centreId" value="${h.esc(centres[0].id)}">` : ''}</div>${police}<div style="margin-top:12px">${h.note('A person brought in by police is admitted as a patient, not booked as an accused. The referral number and police station stay on the file and appear in the police reports.', 'info')}</div>` }));
        cards.push(h.card({ title: '4 · Photo & thumb', subtitle: P && hasPhoto(P) && P.thumbAt ? 'Already on the patient record; retake only if they changed' : 'Required before saving: take them now, with the patient here', body: regBio(P) }));
        cards.push(window.HMS.billing.regCard(dv, src));
      }
      return head + `<form id="drh-form" data-form-id="drh-form" class="stack">${cards.join('')}${looked && !blocked ? `<div class="form-actions">${h.btn({ label: 'Clear form', action: 'regClear', tone: 'secondary' })}${h.btn({ label: 'Save DRH registration', action: 'saveRegistration', form: 'drh-form' })}</div>` : ''}</form>`;
    },
  });

  function regBio(P) {
    const r = SD.reg;
    const photoOnFile = P && hasPhoto(P); const thumbOnFile = P && !!P.thumbAt;
    const photo = r.photo; const thumb = r.thumbTemplate;
    const dup = r.thumbDup;
    const av = photo ? bio().avatar({ name: r.name || (P && P.name) || 'New patient', photo }, 60) : photoOnFile ? avatar(P, 60) : bio().avatar({ name: r.name || (P && P.name) || 'New patient' }, 60);
    return `<div class="bio-row">
      <div class="bio-tile">${av}<div class="grow"><b>Photo</b> <span class="req" style="color:var(--danger)">${photo || photoOnFile ? '' : '*'}</span><div class="muted small">${photo ? 'Captured now on the webcam' : photoOnFile ? 'Already on the patient record' : 'Not taken yet'}</div></div>${h.btn({ label: photo || photoOnFile ? 'Retake' : 'Take photo', action: 'regPhoto', size: 'sm', tone: photo || photoOnFile ? 'secondary' : '' })}</div>
      <div class="bio-tile"><div class="bio-fp" style="width:60px;height:80px">${r.thumbImage ? `<img src="${h.esc(r.thumbImage)}" alt="">` : '<div class="bio-fp-empty" style="font-size:28px">👍</div>'}</div><div class="grow"><b>Right thumb</b> <span class="req" style="color:var(--danger)">${thumb || thumbOnFile ? '' : '*'}</span><div class="muted small">${thumb ? 'Enrolled now on the fingerprint reader' : thumbOnFile ? 'Already on the patient record' : 'Not enrolled yet'}</div></div>${h.btn({ label: thumb || thumbOnFile ? 'Enrol again' : 'Enrol thumb', action: 'regThumb', size: 'sm', tone: thumb || thumbOnFile ? 'secondary' : '' })}</div>
    </div>`
      + (dup ? `<div style="margin-top:12px">${h.noteHtml(`<b>This thumb is already enrolled for ${h.esc(dup.name || 'another patient')}${dup.patientNo ? ' (' + h.esc(dup.patientNo) + ')' : ''}${dup.cnic ? ', CNIC ' + h.esc(dup.cnic) : ''}.</b> The same person cannot be registered twice — press “Change CNIC” and look up that patient's CNIC, or enrol the thumb again if this was a mistake.`, 'danger')}</div>` : '')
      + '<div class="muted small" style="margin-top:10px">Photo: workstation webcam. Thumb: ZKTeco USB fingerprint reader (Live10R / ZK9500) through the fingerprint service on this computer.</div>';
  }

  /* Duplicate-thumb check: the same thumb must not open a second patient record. */
  async function thumbOwner(template, exceptPatientId) {
    const thumbs = await api.get('/drh/thumbs');
    const cands = (thumbs || []).filter((t) => t.template && t.id !== exceptPatientId).map((t) => ({ id: t.id, template: t.template }));
    if (!cands.length) return null;
    const m = await bio().findTemplate(template, cands);
    if (!m || !m.id) return null;
    let p = null; try { p = await api.get(`/drh/patients/${encodeURIComponent(m.id)}`); } catch (e) { /* keep the id */ }
    return { id: m.id, score: m.score, name: p && p.name, patientNo: p && p.patientNo, cnic: p && p.cnic };
  }

  function regFail(msg, fieldName) {
    if (fieldName) {
      const el = document.querySelector(`#drh-form [name="${fieldName}"]`);
      const wrap = el && (el.closest('.field') || el.closest('.ta'));
      if (wrap) { wrap.classList.add('err'); const focusEl = wrap.querySelector('.ta-in, .combo-in, input:not([type=hidden]), select, textarea'); if (focusEl) focusEl.focus(); }
    }
    window.HMS.toast('Blocked: ' + msg, 'danger');
  }

  /* ══ Accounts (YCDO IT) ══════════════════════════════════ */
  const ROLE_LABEL = { DRH_STAFF: 'DRH staff', POLICE_VIEWER: 'Police (view only)' };
  window.HMS.screen('accounts', {
    title: 'HMS accounts', admin: true,
    render: async (c) => {
      const list = await c.cached('accounts', () => api.get('/drh/accounts'));
      c.state.accounts = list;
      const shown = c.state.pwShown || (c.state.pwShown = new Set());
      return h.page('HMS accounts', 'Logins for the DRH centres and the police. As in HRMS, YCDO IT can see each current password here to give it to the person, and change it any time.', h.btn({ label: 'New account', action: 'accountNew', size: 'sm' }))
        + h.card({ title: `Accounts (${h.num(list.length)})`, body: h.table({ columns: [
          { key: 'n', label: 'Name', render: (a) => `<b>${h.esc(a.name || '—')}</b>${a.designation ? `<div class="muted small">${h.esc(a.designation)}</div>` : ''}` },
          { key: 'e', label: 'Email', render: (a) => `<span class="mono">${h.esc(a.email)}</span>` },
          { key: 'p', label: 'Password', render: (a) => (a.password ? `<span class="mono">${shown.has(a.id) ? h.esc(a.password) : '••••••••'}</span> ${h.btn({ label: shown.has(a.id) ? 'Hide' : 'Show', action: 'accountPwToggle', arg: a.id, size: 'sm', tone: 'secondary' })}${a.passwordChangedAt ? `<div class="muted small">set ${h.date(a.passwordChangedAt)}</div>` : ''}` : '<span class="muted">not stored</span>') },
          { key: 'r', label: 'Role', render: (a) => h.badge(ROLE_LABEL[a.role] || a.role, a.role === 'POLICE_VIEWER' ? 'dark' : 'info') },
          { key: 'c', label: 'Centres', render: (a) => (a.role === 'DRH_STAFF' ? h.esc((a.centreIds || []).map(centreShort).filter(Boolean).join(', ') || '—') : '<span class="muted">both (view)</span>') },
          { key: 'a', label: 'Status', render: (a) => (a.isActive ? h.badge('Active', 'ok') : h.badge('Disabled', 'danger')) },
          { key: 'l', label: 'Last sign-in', render: (a) => (a.lastLogin ? `${h.date(a.lastLogin)} ${h.time(a.lastLogin)}` : '<span class="muted">never</span>') },
          { key: 'x', label: '', render: (a) => h.btn({ label: 'Edit', action: 'accountEdit', arg: a.id, size: 'sm', tone: 'secondary' }) },
        ], rows: list, empty: 'No HMS accounts yet' }) });
    },
  });
  function accountForm(a) {
    const isNew = !a; const centres = meta().centres;
    const role = a ? a.role : 'DRH_STAFF';
    const boxes = `<div class="field" style="grid-column:1/-1"><label>Centres (staff can register at)</label><div class="row">${centres.map((x) => `<label class="chk"><input type="checkbox" name="centre_${h.esc(x.id)}" ${a ? ((a.centreIds || []).includes(x.id) ? 'checked' : '') : ''}> ${h.esc(x.name)}</label>`).join('')}</div><div class="hint">Police accounts see both centres and cannot change anything; centres are ignored for them.</div></div>`;
    return `<form id="acc-form" data-form-id="acc-form"><div class="form-grid">${[
      h.field({ id: 'accName', label: 'Name', value: a ? a.name : '', required: true, autofocus: true, maxlength: 80 }),
      h.field({ id: 'accDesignation', label: 'Designation', value: a ? a.designation || '' : '', placeholder: 'e.g. CPO Multan, Admission Officer', maxlength: 80 }),
      isNew ? h.field({ id: 'accEmail', label: 'Email (sign-in)', type: 'email', required: true, autocomplete: 'off' }) : h.field({ id: 'accEmailRo', label: 'Email (sign-in)', value: a.email, readonly: true }),
      isNew ? h.field({ id: 'accRole', label: 'Role', type: 'select', value: role, options: [{ value: 'DRH_STAFF', label: 'DRH staff (register and update at own centres)' }, { value: 'POLICE_VIEWER', label: 'Police (view only, both centres)' }] }) : h.field({ id: 'accRoleRo', label: 'Role', value: ROLE_LABEL[a.role] || a.role, readonly: true }),
      h.field({ id: 'accPassword', label: isNew ? 'Password (optional)' : 'New password (leave empty to keep)', type: 'text', autocomplete: 'off', hint: isNew ? 'Leave empty and the system makes one. You can see and change it on this page any time, like HRMS.' : 'At least 8 characters. The new password shows in the list.' }),
      ...(isNew ? [] : [`<div class="field"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="accActive" ${a.isActive ? 'checked' : ''}> Account active (can sign in)</label></div>`]),
    ].join('')}${boxes}</div><div class="form-actions">${h.btn({ label: 'Cancel', action: 'closeModal', tone: 'secondary' })}${h.btn({ label: isNew ? 'Create account' : 'Save changes', action: 'accountSave', arg: a ? a.id : '', form: 'acc-form' })}</div></form>`;
  }

  /* ══ Print file ══════════════════════════════════════════ */
  async function printFile(id) {
    const f = await window.HMS.cached('adm:' + id, () => api.get(`/drh/admissions/${encodeURIComponent(id)}`));
    const P = f.patient || {}; const ph = hasPhoto(P) ? await photoUrl(P.id) : null;
    const centre = centreById(f.centre && f.centre.id) || f.centre || {};
    const off = f.officer || {};
    const events = (f.events || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    const fus = followsOf(f).slice().sort((a, b) => a.weekNo - b.weekNo);
    window.HMS.print(h.a4(`${h.letterhead('Drug rehabilitation file', centre)}${ph ? `<img src="${h.esc(ph)}" alt="" style="float:right;width:90px;height:120px;object-fit:cover;border:1px solid #ccc;border-radius:4px;margin-left:12px">` : ''}<h2>${h.esc(P.name)} · ${h.esc(f.fileNo)}</h2>
      <p>Patient no ${h.esc(P.patientNo || '')} · CNIC ${h.esc(P.cnic || '—')} · ${P.gender === 'FEMALE' ? 'Female' : 'Male'}, ${h.esc(P.age ?? '')} · s/o ${h.esc(P.fatherName || '—')}<br>${h.esc([P.address, P.area].filter(Boolean).join(', '))}${P.phone ? ' · ' + h.esc(P.phone) : ''}</p>
      <table><tr><th>Admitted</th><td>${h.date(f.admittedAt)}</td><th>${f.status === 'ADMITTED' ? 'Day' : 'Stay'}</th><td>${dayOf(f)}${f.status === 'ADMITTED' ? ' of ' + progDays() : ' days'}</td><th>Status</th><td>${f.status === 'ADMITTED' ? 'Admitted' : 'Discharged'}</td></tr>
      <tr><th>Substance</th><td>${h.esc(f.substance || '—')}</td><th>Years of use</th><td>${h.esc(f.useYears ?? '—')}</td><th>Ward / bed</th><td>${h.esc(f.bed || '—')}</td></tr>
      <tr><th>Source</th><td>${h.esc(SRC_LONG[f.source] || f.source)}</td><th>${f.source === 'POLICE' ? 'Referral no' : 'Referred by'}</th><td colspan="3">${h.esc(f.source === 'POLICE' ? f.policeReferralNo || '—' : f.referredBy || '—')}</td></tr>
      ${f.source === 'POLICE' ? `<tr><th>Police station</th><td>${h.esc((f.policeStation && f.policeStation.name) || '—')}</td><th>Officer</th><td colspan="3">${h.esc([off.name, off.rank, off.phone].filter(Boolean).join(' · ') || '—')}</td></tr><tr><th>Picked up from</th><td colspan="5">${h.esc(f.pickupPlace ? `${f.pickupPlace.name} (${f.pickupPlace.type})${f.pickupPlace.area ? ', ' + f.pickupPlace.area : ''}` : '—')}</td></tr>` : ''}
      ${f.dischargedAt ? `<tr><th>Discharged</th><td>${h.date(f.dischargedAt)}</td><th>Outcome</th><td colspan="3">${h.esc(outcomeLabel(f.outcome))}</td></tr>` : ''}</table>
      <h2 style="margin-top:12px">Guardians</h2><table><tr><th>Name</th><th>Relationship</th><th>Phone</th></tr>${(f.guardians || []).map((g) => `<tr><td>${h.esc(g.name)}</td><td>${h.esc(g.relation)}</td><td>${h.esc(g.phone)}</td></tr>`).join('')}</table>
      <h2 style="margin-top:12px">Test reports</h2>${reportsOf(f).length ? `<table><tr><th>Test</th><th>Date</th><th>Result</th></tr>${reportsOf(f).map((r) => `<tr><td>${h.esc(r.testName)}</td><td>${h.date(r.testDate)}</td><td>${h.esc(r.resultNote || '')}</td></tr>`).join('')}</table>` : '<p>No test report uploaded.</p>'}
      ${fus.length ? `<h2 style="margin-top:12px">Weekly follow-up</h2><table><tr><th>Week</th><th>Status</th><th>Visit date</th><th>Note</th></tr>${fus.map((x) => `<tr><td>${h.esc(x.weekNo)}</td><td>${x.status === 'ATTENDED' ? 'Attended' : 'Missed'}</td><td>${h.date(x.visitDate)}</td><td>${h.esc(x.note || '')}</td></tr>`).join('')}</table>` : ''}
      <h2 style="margin-top:12px">Activity</h2><table><tr><th>Date</th><th>Event</th></tr>${events.map((t) => `<tr><td>${h.date(t.at)}</td><td>${h.esc(t.title)}${t.body ? ` — ${h.esc(t.body)}` : ''}${t.byName ? ` (${h.esc(t.byName)})` : ''}</td></tr>`).join('')}</table>
      <p class="small" style="margin-top:10px">Printed ${h.date(new Date().toISOString())} ${h.time(new Date().toISOString())} by ${h.esc(me().name || me().email || '')}</p>
      <div class="sig"><div>DRH Staff</div><div>Guardian</div></div>`), 'DRH file');
  }

  /* ══ Actions ═════════════════════════════════════════════ */
  const fileAfter = (f, msg) => { window.HMS.setCached('adm:' + f.id, f); window.HMS.render(); return msg; };
  const getFile = (id) => window.HMS.cached('adm:' + id, () => api.get(`/drh/admissions/${encodeURIComponent(id)}`));
  const reportBlobs = new Map();
  async function reportBlob(id) { if (!reportBlobs.has(id)) reportBlobs.set(id, api.blob(`/drh/reports/${encodeURIComponent(id)}/content`).catch((e) => { reportBlobs.delete(id); throw e; })); return reportBlobs.get(id); }

  window.HMS.actions({
    listSearch: (_a, form) => { const p = { ...window.HMS.state.params, q: String(form.q || '').trim() || undefined, page: undefined }; window.HMS.navigate('admissions', p); },
    indexSearch: (screen, form) => { window.HMS.navigate(screen, { q: String(form.q || '').trim() || undefined, type: form.type || undefined }); },

    findByThumb: async () => {
      const thumbs = await api.get('/drh/thumbs');
      const names = new Map();
      const m = await bio().identifyThumb({ title: 'Find DRH patient by thumb (both centres)', candidates: (thumbs || []).map((t) => ({ id: t.id, template: t.template })),
        describe: async (pid) => { const p = await api.get(`/drh/patients/${encodeURIComponent(pid)}`); names.set(pid, p); return `${p.name} · ${p.patientNo || ''}`; } });
      if (!m || !m.id) return;
      const p = names.get(m.id) || await api.get(`/drh/patients/${encodeURIComponent(m.id)}`);
      const adms = (p.admissions || []).slice().sort((a, b) => (b.status === 'ADMITTED') - (a.status === 'ADMITTED') || new Date(b.admittedAt) - new Date(a.admittedAt));
      if (!adms.length) { window.HMS.toast(`${p.name} has no admission on file`, 'warn'); return; }
      window.HMS.navigate('admission', { id: adms[0].id });
    },

    /* ── registration ── */
    regLookup: async (_a, form) => {
      saveDraftFromDom();
      const cnic = String(form.cnic || '').trim();
      if (!/^\d{5}-\d{7}-\d$/.test(cnic)) { regFail('the CNIC must be 13 digits in the format 36302-4842068-3', 'cnic'); return; }
      const res = await api.get('/drh/patients/lookup', { cnic });
      SD.lookup = { cnic, patient: res && res.patient ? res.patient : null, openAdmission: res && res.openAdmission ? res.openAdmission : null };
      SD.reg.cnic = cnic; SD.reg.thumbDup = null;
      window.HMS.render();
      if (SD.lookup.openAdmission) return;
      return SD.lookup.patient ? `${SD.lookup.patient.name} found — a new admission will be opened` : 'New patient — capture the details';
    },
    regReset: () => { saveDraftFromDom(); SD.lookup = null; SD.reg.thumbDup = null; window.HMS.render(); },
    regClear: () => { SD.reg = {}; SD.lookup = null; window.HMS.render(); return 'Form cleared'; },
    regSource: () => { saveDraftFromDom(); window.HMS.render(); },
    regPhoto: async () => {
      saveDraftFromDom();
      const url = await bio().takePhoto({ title: 'Patient photo', who: SD.reg.name || (SD.lookup && SD.lookup.patient && SD.lookup.patient.name) || '' });
      if (!url) return;
      SD.reg.photo = url; window.HMS.render(); return 'Photo captured — it is saved with the registration';
    },
    regThumb: async () => {
      saveDraftFromDom();
      const t = await bio().enrollThumb({ title: 'Enrol right thumb', who: SD.reg.name || (SD.lookup && SD.lookup.patient && SD.lookup.patient.name) || '' });
      if (!t) return;
      SD.reg.thumbTemplate = t.template; SD.reg.thumbImage = t.image; SD.reg.thumbDup = null;
      const st = bio().last(); SD.reg.thumbDevice = st && st.device && !st.simulate ? st.device : st && st.simulate ? 'Simulated reader' : 'ZKTeco fingerprint reader';
      let dup = null;
      try { dup = await thumbOwner(t.template, SD.lookup && SD.lookup.patient ? SD.lookup.patient.id : null); } catch (e) { window.HMS.toast('Could not check the thumb against other patients: ' + e.message, 'warn'); }
      SD.reg.thumbDup = dup;
      window.HMS.render();
      window.HMS.toast(dup ? 'This thumb is already enrolled for another patient — see the red note' : 'Thumb enrolled — it is saved with the registration', dup ? 'danger' : 'ok');
    },
    saveRegistration: async (_a, form) => {
      saveDraftFromDom();
      const L = SD.lookup; const r = SD.reg;
      if (!L) { regFail('look up the CNIC first', 'cnic'); return; }
      if (L.openAdmission) { regFail('this person already has an open admission'); return; }
      const P = L.patient;
      const t = (k) => String(form[k] ?? r[k] ?? '').trim();
      if (!P) {
        if (!t('name')) return regFail('enter the patient\'s full name', 'name');
        if (!t('fatherName')) return regFail('enter the father / husband name', 'fatherName');
        const age = Number(t('age')); if (!Number.isFinite(age) || age < 10 || age > 100) return regFail('enter the age (10 to 100)', 'age');
      }
      for (const [n, p, lbl] of [['g1name', 'g1phone', 'Guardian 1'], ['g2name', 'g2phone', 'Guardian 2']]) {
        if (!t(n)) return regFail(`two guardians with active phone numbers are required by the DRH standard operating procedure (${lbl} name is missing)`, n);
        if (!/^0\d{10}$/.test(h.digits(t(p)))) return regFail(`${lbl} needs an 11-digit phone number`, p);
      }
      if (h.digits(t('g1phone')) === h.digits(t('g2phone'))) return regFail('the two guardians need two different phone numbers', 'g2phone');
      const centreId = t('centreId');
      if (!centreId || !myCentreIds().includes(centreId)) return regFail('choose the centre', 'centreId');
      const source = t('source') || 'FAMILY';
      if (source === 'POLICE') {
        if (!t('policeReferralNo')) return regFail('a police case needs the police referral number', 'policeReferralNo');
        if (!t('policeStationId')) return regFail('choose the police station from the list (or add it)', 'policeStationId');
        if (!t('officerName')) return regFail('enter the name of the police officer who brought the patient', 'officerName');
        if (!t('pickupPlaceId')) return regFail('choose where the police found the patient from the list (or add the place)', 'pickupPlaceId');
      }
      const money = window.HMS.billing.regBody(t, source);
      if (money.error) return regFail(money.error, money.field);
      const needPhoto = !(P && hasPhoto(P)); const needThumb = !(P && P.thumbAt);
      if (needPhoto && !r.photo) return regFail('take the patient\'s photo (step 4)');
      if (needThumb && !r.thumbTemplate) return regFail('enrol the patient\'s right thumb (step 4)');
      if (r.thumbTemplate) {
        let dup = r.thumbDup;
        try { dup = await thumbOwner(r.thumbTemplate, P ? P.id : null); } catch (e) { /* keep the earlier check */ }
        r.thumbDup = dup;
        if (dup) { window.HMS.render(); return regFail(`this thumb is already enrolled for ${dup.name || 'another patient'}${dup.patientNo ? ' (' + dup.patientNo + ')' : ''}`); }
      }
      const num = (v) => (v === '' || v == null ? undefined : Number(v));
      const body = {
        centreId,
        ...(P ? { patientId: P.id } : { patient: { name: t('name'), fatherName: t('fatherName'), gender: t('gender') || 'MALE', age: num(t('age')), cnic: L.cnic, phone: t('phone') || undefined, address: t('address') || undefined, area: t('area') || undefined } }),
        ...(r.photo ? { photo: r.photo } : {}),
        ...(r.thumbTemplate ? { thumbTemplate: r.thumbTemplate, thumbDevice: r.thumbDevice || 'ZKTeco fingerprint reader' } : {}),
        guardians: [{ name: t('g1name'), relation: t('g1rel') || 'Father', phone: t('g1phone') }, { name: t('g2name'), relation: t('g2rel') || 'Brother', phone: t('g2phone') }],
        source, substance: t('substance') || undefined, useYears: num(t('useYears')), bed: t('bed') || undefined,
        ...(source === 'POLICE' ? { policeReferralNo: t('policeReferralNo'), policeStationId: t('policeStationId'), officerName: t('officerName'), officerRank: t('officerRank') || undefined, officerPhone: t('officerPhone') || undefined, pickupPlaceId: t('pickupPlaceId') } : {}),
        ...(source === 'REFERRAL' && t('referredBy') ? { referredBy: t('referredBy') } : {}),
        ...money.body,
      };
      let f;
      try { f = await api.post('/drh/admissions', body); }
      catch (e) { if (e.status === 401) throw e; window.HMS.toast('Not saved: ' + e.message, 'danger'); return; }
      SD.reg = {}; SD.lookup = null;
      window.HMS.state.underCare = {};
      if (f && f.patient && f.patient.id) dropPhoto(f.patient.id);
      TA.stations = null; TA.places = null;
      location.hash = fileHref(f.id);
      return `${f.fileNo} registered at ${(f.centre && f.centre.name) || 'the centre'}`;
    },

    /* ── stations / places ── */
    addStation: (ctx) => openAddStation(ctx || 'index', ''),
    addPlace: (ctx) => openAddPlace(ctx || 'index', ''),
    createStation: async (ctx, form) => {
      const name = String(form.stName || '').trim(); if (!name) { window.HMS.toast('Enter the station name', 'danger'); return; }
      return postStation(ctx, { name, area: String(form.stArea || '').trim() || undefined, phone: String(form.stPhone || '').trim() || undefined });
    },
    createPlace: async (arg, form) => {
      const [ctx, stationId] = String(arg).split('|');
      const name = String(form.plName || '').trim(); if (!name) { window.HMS.toast('Enter the name of the place', 'danger'); return; }
      return postPlace(ctx, { type: form.plType, name, area: String(form.plArea || '').trim() || undefined, policeStationId: stationId || undefined });
    },
    forceStation: async (ctx) => { if (!pendingCreate) return; return postStation(ctx, { ...pendingCreate.payload, force: true }); },
    forcePlace: async (ctx) => { if (!pendingCreate) return; return postPlace(ctx, { ...pendingCreate.payload, force: true }); },
    useExisting: (arg) => {
      const [kind, ctx, id, ...rest] = String(arg).split('|'); const name = rest.join('|');
      if (ctx === 'reg') { created(kind, ctx, { id, name }); return `${name} chosen`; }
      window.HMS.closeModal(); window.HMS.navigate(kind === 'station' ? 'station' : 'place', { id });
    },

    /* ── patient file ── */
    capturePhoto: async (id) => {
      const f = await getFile(id); const P = f.patient;
      const url = await bio().takePhoto({ title: `Photo · ${P.name}`, who: P.name });
      if (!url) return;
      await api.patch(`/drh/patients/${encodeURIComponent(P.id)}/biometrics`, { photo: url });
      dropPhoto(P.id);
      const nf = await api.get(`/drh/admissions/${encodeURIComponent(id)}`);
      return fileAfter(nf, hasPhoto(P) ? `Photo updated for ${P.name}` : `Photo captured for ${P.name}`);
    },
    captureThumb: async (id) => {
      const f = await getFile(id); const P = f.patient;
      const t = await bio().enrollThumb({ title: `Enrol thumb · ${P.name}`, who: P.name });
      if (!t) return;
      const dup = await thumbOwner(t.template, P.id);
      if (dup) { window.HMS.toast(`Not saved: this thumb is already enrolled for ${dup.name || 'another patient'}${dup.patientNo ? ' (' + dup.patientNo + ')' : ''}`, 'danger'); return; }
      const st = bio().last();
      await api.patch(`/drh/patients/${encodeURIComponent(P.id)}/biometrics`, { thumbTemplate: t.template, thumbDevice: st && st.simulate ? 'Simulated reader' : (st && st.device) || 'ZKTeco fingerprint reader' });
      const nf = await api.get(`/drh/admissions/${encodeURIComponent(id)}`);
      return fileAfter(nf, `${P.thumbAt ? 'Thumb re-enrolled' : 'Thumb enrolled'} for ${P.name}`);
    },
    verifyThumb: async (id) => {
      const f = await getFile(id); const P = f.patient;
      const thumbs = await api.get('/drh/thumbs');
      const mine = (thumbs || []).find((x) => x.id === P.id);
      if (!mine || !mine.template) return 'No thumb enrolled for this patient';
      const m = await bio().verifyThumb({ title: `Verify thumb · ${P.name}`, template: mine.template, who: P.name });
      if (!m) return;
      const nf = await api.post(`/drh/admissions/${encodeURIComponent(id)}/events`, { title: m.matched ? 'Identity verified by thumb' : 'Thumb verification FAILED', body: `Score ${m.score}` });
      fileAfter(nf);
      window.HMS.toast(m.matched ? `${P.name}: identity verified` : `${P.name}: thumb did not match`, m.matched ? 'ok' : 'danger');
    },
    logCall: async (arg) => {
      const [id, idx] = String(arg).split('|'); const f = await getFile(id); const g = (f.guardians || [])[Number(idx)];
      if (!g) return 'Guardian not found';
      const nf = await api.post(`/drh/admissions/${encodeURIComponent(id)}/events`, { title: 'Guardian contacted', body: `${g.name} (${g.relation}) · ${g.phone}` });
      return fileAfter(nf, `Call to ${g.name} logged`);
    },
    uploadReport: async (id, form) => {
      const file = form.file && form.file[0];
      if (!file) { window.HMS.toast('Choose the report file', 'danger'); return; }
      const okType = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
      if (!okType) { window.HMS.toast('Only PDF, JPG, PNG or WEBP files can be uploaded', 'danger'); return; }
      if (file.size > 10 * 1024 * 1024) { window.HMS.toast('The file is larger than 10 MB. Scan it at a lower resolution or as PDF.', 'danger'); return; }
      const testName = String(form.testName || '').trim(); const testDate = String(form.testDate || '');
      if (!testName) { window.HMS.toast('Enter the test name', 'danger'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) { window.HMS.toast('Enter the test date', 'danger'); return; }
      const fd = new FormData();
      fd.append('file', file, file.name); fd.append('testName', testName); fd.append('testDate', testDate);
      if (String(form.resultNote || '').trim()) fd.append('resultNote', String(form.resultNote).trim());
      const nf = await api.upload(`/drh/admissions/${encodeURIComponent(id)}/reports`, fd);
      return fileAfter(nf, `${testName} uploaded`);
    },
    openReport: async (rid) => {
      const blob = await reportBlob(rid);
      const url = URL.createObjectURL(blob);
      const isImg = /^image\//.test(blob.type); const isPdf = blob.type === 'application/pdf';
      const name = (document.querySelector(`[data-arg="${CSS.escape(rid)}"]`)?.closest('tr')?.querySelector('td b')?.textContent) || 'Test report';
      window.HMS.modal(name, `<div class="report-view">${isImg ? `<img src="${url}" alt="${h.esc(name)}">` : isPdf ? `<iframe src="${url}" title="${h.esc(name)}"></iframe>` : h.note('This file type cannot be shown here. Use Download.', 'info')}</div>`,
        `<a class="btn sm accent" href="${url}" download="${h.esc(name.replace(/[\\/:*?"<>|]/g, ''))}" style="text-decoration:none">Download</a>`, { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
    },
    downloadReport: async (rid, _f, el) => {
      const blob = await reportBlob(rid);
      const tr = el && el.closest('tr'); const fname = tr ? tr.children[3].childNodes[0].textContent.trim() : 'report';
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fname || 'report';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    dischargeAsk: async (id, form) => {
      const f = await getFile(id);
      if (!form.outcome) { window.HMS.toast('Choose the outcome', 'danger'); return; }
      const b = canBill(f) ? await window.HMS.billing.loadBilling(id) : null;
      const owes = b && !b.isPoliceCase && b.rateSet && b.due > 0;
      if (owes && !form.dueApprovedBy) { window.HMS.toast(`Blocked: ${window.HMS.billing.pkr(b.due)} is still due. Receive it on the Payment tab, or choose who approved the discharge with money due.`, 'danger'); return; }
      pendingDischarge = { id, outcome: form.outcome, note: String(form.note || '').trim(), dueApprovedBy: owes ? form.dueApprovedBy : undefined, dueApprovalNote: owes ? String(form.dueApprovalNote || '').trim() || undefined : undefined };
      const dueTxt = owes ? ` <b>${h.esc(window.HMS.billing.pkr(b.due))}</b> stays due (approved by the ${h.esc(form.dueApprovedBy)}).` : '';
      window.HMS.modal('Confirm discharge', h.noteHtml(`Discharge <b>${h.esc(f.patient.name)}</b> (${h.esc(f.fileNo)}) on day ${dayOf(f)} — <b>${h.esc(outcomeLabel(form.outcome))}</b>?${dueTxt} This cannot be undone. Weekly follow-up starts from today.`, 'warn'),
        h.btn({ label: 'Yes, discharge', action: 'dischargeConfirm', arg: id, size: 'sm' }));
    },
    dischargeConfirm: async (id) => {
      if (!pendingDischarge || pendingDischarge.id !== id) return;
      const pd = pendingDischarge;
      const nf = await api.post(`/drh/admissions/${encodeURIComponent(id)}/discharge`, { outcome: pd.outcome, note: pd.note || undefined, dueApprovedBy: pd.dueApprovedBy, dueApprovalNote: pd.dueApprovalNote });
      pendingDischarge = null; window.HMS.closeModal(); window.HMS.state.underCare = {}; window.HMS.dropCached('bill:' + id);
      return fileAfter(nf, `${nf.patient.name} discharged — ${outcomeLabel(nf.outcome).toLowerCase()}`);
    },
    saveFollowUp: async (id, form) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.visitDate || ''))) { window.HMS.toast('Enter the visit date', 'danger'); return; }
      const nf = await api.post(`/drh/admissions/${encodeURIComponent(id)}/follow-ups`, { weekNo: Number(form.weekNo) || undefined, status: form.status, visitDate: form.visitDate, note: String(form.note || '').trim() || undefined });
      return fileAfter(nf, `Week ${form.weekNo} recorded as ${form.status === 'ATTENDED' ? 'attended' : 'missed'}`);
    },
    printFile: (id) => printFile(id),

    /* ── accounts ── */
    accountNew: () => window.HMS.modal('New HMS account', accountForm(null)),
    accountPwToggle: (id) => {
      const s = window.HMS.state.pwShown || (window.HMS.state.pwShown = new Set());
      if (s.has(id)) s.delete(id); else s.add(id);
      window.HMS.render();
    },
    accountEdit: (id) => { const a = (window.HMS.state.accounts || []).find((x) => x.id === id); if (a) window.HMS.modal(`Edit · ${a.name || a.email}`, accountForm(a)); },
    accountSave: async (id, form) => {
      const centreIds = meta().centres.map((x) => x.id).filter((cid) => form['centre_' + cid]);
      const name = String(form.accName || '').trim(); const designation = String(form.accDesignation || '').trim();
      const password = String(form.accPassword || '');
      if (!name) { window.HMS.toast('Enter the name', 'danger'); return; }
      if (password && password.length < 8) { window.HMS.toast('The password needs at least 8 characters', 'danger'); return; }
      if (!id) {
        const email = String(form.accEmail || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.HMS.toast('Enter a valid email', 'danger'); return; }
        const role = form.accRole;
        if (role === 'DRH_STAFF' && !centreIds.length) { window.HMS.toast('Tick at least one centre for a DRH staff account', 'danger'); return; }
        await api.post('/drh/accounts', { email, name, designation: designation || undefined, role, centreIds: role === 'DRH_STAFF' ? centreIds : [], ...(password ? { password } : {}) });
        window.HMS.closeModal(); window.HMS.dropCached('accounts'); window.HMS.render();
        return `Account created for ${name}. Press Show in the Password column to see the password.`;
      }
      const a = (window.HMS.state.accounts || []).find((x) => x.id === id) || {};
      if (a.role === 'DRH_STAFF' && !centreIds.length) { window.HMS.toast('Tick at least one centre for a DRH staff account', 'danger'); return; }
      await api.patch(`/drh/accounts/${encodeURIComponent(id)}`, { name, designation, centreIds: a.role === 'DRH_STAFF' ? centreIds : undefined, isActive: !!form.accActive, ...(password ? { password } : {}) });
      window.HMS.closeModal(); window.HMS.dropCached('accounts'); window.HMS.render();
      return `Saved ${name}`;
    },
  });
  let pendingDischarge = null;
})();

/* YCDO HMS - DRH payments (owner, 21 Nov 2026): daily rate PKR 500-3,000, Zakat approval below
   PKR 1,000 (three days), payments with receipts, discharge with money due only on approval.
   Police cases are free; guardians may contribute voluntarily.
   Shown only to DRH staff at their own centre and to YCDO IT. Police logins never get this
   screen, the tab or the data: the API refuses /drh/billing for them. */
(function () {
  const { h } = window.HMS;
  const api = window.API;

  const RATE_MIN = 500, RATE_MAX = 3000, ZAKAT_BELOW = 1000;
  const APPROVERS = ['Founder', 'Chairman', 'President'];
  const METHODS = [['CASH', 'Cash'], ['BANK_TRANSFER', 'Bank transfer'], ['MOBILE_WALLET', 'JazzCash / Easypaisa'], ['CHEQUE', 'Cheque']];
  const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const methodLabel = (v) => (METHODS.find((m) => m[0] === v) || [v, v])[1];
  const methodOpts = METHODS.map(([value, label]) => ({ value, label }));
  const approverOpts = (first) => [{ value: '', label: first || 'Choose' }].concat(APPROVERS.map((a) => ({ value: a, label: a })));
  const shortCentre = (name) => String(name || '').replace(/^Police and YCDO DRH\s*/i, '') || String(name || '');
  const fileHref = (id, tab) => window.HMS.href('admission', { id, tab });
  const me = () => window.HMS.state.me || {};

  function category(rate) {
    const r = Number(rate) || 0;
    if (!r) return null;
    if (r < RATE_MIN || r > RATE_MAX) return { label: `Out of range (PKR ${RATE_MIN.toLocaleString('en-US')}–${RATE_MAX.toLocaleString('en-US')})`, tone: 'danger' };
    if (r < ZAKAT_BELOW) return { label: 'Zakat-supported · approval required', tone: 'warn', zakat: true };
    if (r <= 1500) return { label: 'Category 3', tone: 'info' };
    if (r <= 2500) return { label: 'Category 2', tone: 'info' };
    return { label: 'Private patient', tone: 'ok' };
  }
  const catHtml = (rate) => { const c = category(rate); return c ? h.badge(c.label, c.tone) : '<span class="muted small">enter the rate</span>'; };

  /* Live category and the Zakat block while the rate is typed (registration and rate change). */
  document.addEventListener('input', (e) => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.rate) return;
    const box = document.getElementById(el.dataset.rate);
    if (!box) return;
    const cat = box.querySelector('[data-cat]'); if (cat) cat.innerHTML = catHtml(el.value);
    const z = box.querySelector('[data-zakat]'); if (z) z.style.display = Number(el.value) > 0 && Number(el.value) < ZAKAT_BELOW ? '' : 'none';
  });
  /* h.field has no data-rate hook: add it after each render. */
  window.HMS.afterRender(() => { for (const id of ['dailyRate', 'newRate']) { const el = document.getElementById(id); if (el) el.dataset.rate = id === 'dailyRate' ? 'reg-money' : 'rate-money'; } });

  const zakatFields = (dv, pre) => `<div data-zakat style="margin-top:12px;${Number(dv(pre + 'Rate')) > 0 && Number(dv(pre + 'Rate')) < ZAKAT_BELOW ? '' : 'display:none'}">${h.noteHtml('<b>Below PKR 1,000 a day:</b> a Zakat approval request goes to the Founder, Chairman or President (on WhatsApp, with the Zakat form). They have three days to decide. The admission goes ahead meanwhile. If it is rejected, the daily rate must be raised to PKR 1,000 or more.', 'warn')}<div class="form-grid" style="margin-top:10px">${[
    h.field({ id: 'zakatApprover', label: 'Approver', type: 'select', value: dv('zakatApprover', ''), options: approverOpts(), required: true }),
    h.field({ id: 'zakatPhone', label: 'Approver WhatsApp', kind: 'phone', value: dv('zakatPhone'), placeholder: '03xx-xxxxxxx' }),
    h.field({ id: 'zakatForm', label: 'Zakat form', type: 'select', value: dv('zakatForm', 'ATTACHED'), options: [{ value: 'ATTACHED', label: 'Attached (scan on file)' }, { value: 'TO_FOLLOW', label: 'To follow' }] }),
  ].join('')}</div></div>`;

  const depositFields = (dv, label) => `<div class="form-grid" style="margin-top:12px">${[
    h.field({ id: 'depAmount', label, type: 'number', min: 1, step: 1, value: dv('depAmount'), placeholder: 'PKR (optional)' }),
    h.field({ id: 'depMethod', label: 'Method', type: 'select', value: dv('depMethod', 'CASH'), options: methodOpts }),
    h.field({ id: 'depPaidBy', label: 'Paid by', kind: 'person', value: dv('depPaidBy'), placeholder: 'e.g. guardian name' }),
    h.field({ id: 'depRef', label: 'Reference', value: dv('depRef'), placeholder: 'bank / wallet / cheque no', maxlength: 80 }),
  ].join('')}</div>`;

  /* ── registration: step 5 ─────────────────────────────── */
  function regCard(dv, source) {
    if (source === 'POLICE') {
      return h.card({ title: '5 · Payment', subtitle: 'Police case: free', body: h.note('Police cases are free. If the guardians want to contribute, record it here; otherwise leave it empty. A police patient is discharged at PKR 0.', 'info') + depositFields(dv, 'Voluntary contribution') });
    }
    const dvr = (k, f) => (k === 'regRate' ? dv('dailyRate', f) : dv(k, f));
    return h.card({ title: '5 · Payment', subtitle: `Daily rate PKR ${RATE_MIN.toLocaleString('en-US')} to ${RATE_MAX.toLocaleString('en-US')}. Days billed count both the admission and the discharge day.`, body: `<div id="reg-money"><div class="form-grid">${[
      h.field({ id: 'dailyRate', label: 'Daily rate (PKR)', type: 'number', min: RATE_MIN, max: RATE_MAX, step: 50, value: dv('dailyRate'), required: true, inputmode: 'numeric' }),
      `<div class="field"><label>Category</label><div style="padding-top:8px" data-cat>${catHtml(dv('dailyRate'))}</div><div class="hint">500–999 Zakat-supported · 1,000–1,500 Category 3 · 1,501–2,500 Category 2 · 2,501–3,000 Private</div></div>`,
    ].join('')}</div>${zakatFields(dvr, 'reg')}<div class="label" style="margin:16px 0 0">Deposit received now (optional)</div>${depositFields(dv, 'Amount')}</div>` });
  }

  /** Money part of the registration body. Returns { error, field } when something is missing. */
  function regBody(t, source) {
    const deposit = (() => {
      const amt = Number(t('depAmount'));
      if (!t('depAmount')) return null;
      if (!Number.isInteger(amt) || amt < 1) return { error: 'enter the amount received as a whole number of rupees', field: 'depAmount' };
      return { amount: amt, method: t('depMethod') || 'CASH', paidBy: t('depPaidBy') || undefined, reference: t('depRef') || undefined };
    })();
    if (deposit && deposit.error) return deposit;
    if (source === 'POLICE') return { body: deposit ? { deposit } : {} };
    const rate = Number(t('dailyRate'));
    if (!t('dailyRate') || !Number.isInteger(rate)) return { error: `enter the daily rate (PKR ${RATE_MIN}–${RATE_MAX})`, field: 'dailyRate' };
    if (rate < RATE_MIN || rate > RATE_MAX) return { error: `the daily rate must be PKR ${RATE_MIN} to ${RATE_MAX}`, field: 'dailyRate' };
    const body = { dailyRate: rate };
    if (rate < ZAKAT_BELOW) {
      if (!t('zakatApprover')) return { error: 'a rate below PKR 1,000 needs a Zakat request: choose the approver', field: 'zakatApprover' };
      body.zakat = { approver: t('zakatApprover'), approverPhone: t('zakatPhone') || undefined, formStatus: t('zakatForm') || 'ATTACHED' };
    }
    if (deposit) body.deposit = deposit;
    return { body };
  }

  /* ── patient file: Payment tab ────────────────────────── */
  const loadBilling = (id) => window.HMS.cached('bill:' + id, () => api.get(`/drh/billing/${encodeURIComponent(id)}`));

  function zakatBadge(z) {
    if (z.status === 'PENDING') {
      const left = Math.ceil((new Date(z.deadline) - Date.now()) / 86400000);
      return z.overdue ? h.badge(`Pending · overdue ${Math.abs(left)} d`, 'danger') : h.badge(`Pending · ${Math.max(0, left)} d left`, 'warn');
    }
    return h.badge(z.status === 'APPROVED' ? 'Approved' : z.status === 'REJECTED' ? 'Rejected' : 'Cancelled', z.status === 'APPROVED' ? 'ok' : z.status === 'REJECTED' ? 'danger' : '');
  }

  function payTab(f, b, w) {
    const police = b.isPoliceCase;
    const kpis = h.kpis([
      { label: 'Daily rate', value: police ? 'Free' : b.rateSet ? pkr(b.dailyRate) : 'Not set', tone: police ? 'ok' : b.rateSet ? 'info' : 'danger', sub: police ? 'Police case' : b.category || 'set it below' },
      { label: 'Days billed', value: h.num(b.days), tone: 'info', sub: `${h.date(b.admittedAt)} to ${b.dischargedAt ? h.date(b.dischargedAt) : 'today'}, both days count` },
      { label: 'Charges', value: pkr(b.accrued), tone: 'info', sub: police ? 'no charge for police cases' : `${h.num(b.days)} × ${b.rateSet ? pkr(b.dailyRate) : '—'}` },
      { label: police ? 'Contributions' : 'Received', value: pkr(b.received), tone: 'ok', sub: `${h.num(b.payments.length)} receipt${b.payments.length === 1 ? '' : 's'}` },
      b.balance < 0
        ? { label: 'Paid in advance', value: pkr(-b.balance), tone: 'ok', sub: police ? 'voluntary contribution' : 'more than the charges so far' }
        : { label: 'Due', value: pkr(b.due), tone: b.due ? 'danger' : 'ok', sub: b.due ? (f.status === 'DISCHARGED' ? 'still receivable after discharge' : 'grows each day by the rate') : 'nothing due' },
    ]);
    const notes = [
      !b.rateSet && !police ? h.note('This file has no daily rate yet (it was registered before payments were added). Set it below.', 'warn') : '',
      b.rateMustRise ? h.noteHtml('<b>The Zakat request was rejected.</b> Raise the daily rate to PKR 1,000 or more below. The whole stay is charged at the new rate.', 'danger') : '',
      b.dueApprovedBy ? h.note(`Discharged with ${pkr(b.dueAtDischarge)} due, approved by the ${b.dueApprovedBy}${b.dueApprovalNote ? ' · ' + b.dueApprovalNote : ''}. The balance stays receivable.`, 'info') : '',
    ].join('');

    const zak = b.zakat.length ? h.card({ title: 'Zakat approval', subtitle: 'Founder / Chairman / President decide within three days', body: h.table({
      columns: [
        { key: 's', label: 'Status', render: (z) => zakatBadge(z) },
        { key: 'r', label: 'Rate', align: 'right', render: (z) => pkr(z.rate) },
        { key: 'a', label: 'Approver', render: (z) => `${h.esc(z.approver)}${z.approverPhone ? `<div class="muted small mono">${h.esc(z.approverPhone)}</div>` : ''}` },
        { key: 'f', label: 'Form', render: (z) => (z.formStatus === 'ATTACHED' ? 'Attached' : h.badge('To follow', 'warn')) },
        { key: 'q', label: 'Requested', render: (z) => `${h.date(z.requestedAt)}<div class="muted small">${h.esc(z.requestedBy || '')} · due ${h.date(z.deadline)}</div>` },
        { key: 'd', label: 'Decision', render: (z) => (z.decidedAt ? `${h.date(z.decidedAt)}<div class="muted small">${h.esc([z.decidedBy && 'recorded by ' + z.decidedBy, z.decisionNote].filter(Boolean).join(' · '))}</div>` : w && z.status === 'PENDING' ? `${h.btn({ label: 'Approved', action: 'zakatDecide', arg: `${f.id}|${z.id}|APPROVED`, size: 'sm' })} ${h.btn({ label: 'Rejected', action: 'zakatDecide', arg: `${f.id}|${z.id}|REJECTED`, size: 'sm', tone: 'secondary' })}` : '—') },
      ], rows: b.zakat }) }) : '';

    const receive = w ? h.card({ title: police ? 'Record a voluntary contribution' : 'Receive payment', subtitle: 'A receipt number is given; print it for the guardian', body: h.form({ id: 'pay-form', fields: [
      { id: 'amount', label: 'Amount (PKR)', type: 'number', min: 1, step: 1, value: !police && b.due ? b.due : '', required: true, inputmode: 'numeric' },
      { id: 'method', label: 'Method', type: 'select', value: 'CASH', options: methodOpts },
      { id: 'paidBy', label: 'Paid by', kind: 'person', placeholder: 'e.g. guardian name' },
      { id: 'reference', label: 'Reference', placeholder: 'bank / wallet / cheque no', maxlength: 80 },
      { id: 'note', label: 'Note (optional)', type: 'textarea', span: 2, maxlength: 300 },
    ], submit: { label: 'Save and print receipt', action: 'payReceive', arg: f.id } }) }) : '';

    const list = h.card({ title: `Receipts (${h.num(b.payments.length)})`, body: h.table({
      columns: [
        { key: 'r', label: 'Receipt', render: (p) => `<b class="mono">${h.esc(p.receiptNo)}</b>` },
        { key: 'd', label: 'Date', render: (p) => `${h.date(p.receivedAt)} <span class="muted small">${h.time(p.receivedAt)}</span>` },
        { key: 'a', label: 'Amount', align: 'right', render: (p) => `<b>${pkr(p.amount)}</b>` },
        { key: 'm', label: 'Method', render: (p) => `${h.esc(methodLabel(p.method))}${p.reference ? `<div class="muted small mono">${h.esc(p.reference)}</div>` : ''}` },
        { key: 'p', label: 'Paid by', render: (p) => h.esc(p.paidBy || '—') + (p.note ? `<div class="muted small">${h.esc(p.note)}</div>` : '') },
        { key: 'b', label: 'Received by', render: (p) => h.esc(p.receivedBy || '') },
        { key: 'x', label: '', render: (p) => h.btn({ label: 'Print', action: 'payPrint', arg: `${f.id}|${p.id}`, size: 'sm', tone: 'secondary' }) },
      ], rows: b.payments, empty: police ? 'No contribution recorded. None is required for a police case.' : 'No payment received yet' }) });

    const rateForm = w && !police ? h.card({ title: b.rateSet ? 'Change the daily rate' : 'Set the daily rate', subtitle: 'The whole stay is charged at the current rate. Every change is kept below with its reason.', body: `<form id="rate-form" data-form-id="rate-form"><div id="rate-money"><div class="form-grid">${[
      h.field({ id: 'newRate', label: 'New daily rate (PKR)', type: 'number', min: RATE_MIN, max: RATE_MAX, step: 50, required: true, inputmode: 'numeric', value: b.rateMustRise ? ZAKAT_BELOW : '' }),
      `<div class="field"><label>Category</label><div style="padding-top:8px" data-cat>${catHtml(b.rateMustRise ? ZAKAT_BELOW : '')}</div></div>`,
      h.field({ id: 'reason', label: 'Reason', required: true, span: 2, maxlength: 300, placeholder: b.rateMustRise ? 'e.g. Zakat request rejected by the Chairman' : 'e.g. family moved to Category 2 on request' }),
    ].join('')}</div>${zakatFields((k, d) => (k === 'rateRate' ? '' : d === undefined ? '' : d), 'rate')}</div><div class="form-actions">${h.btn({ label: b.rateSet ? 'Change rate' : 'Set rate', action: 'rateChange', arg: f.id, form: 'rate-form' })}</div></form>` }) : '';

    const history = b.rateChanges.length ? h.card({ title: 'Rate history', body: h.table({
      columns: [
        { key: 'd', label: 'Date', render: (r) => h.date(r.at) },
        { key: 'c', label: 'Change', render: (r) => (r.fromRate == null ? `set to <b>${pkr(r.toRate)}</b>` : `${pkr(r.fromRate)} → <b>${pkr(r.toRate)}</b>`) },
        { key: 'r', label: 'Reason', render: (r) => h.esc(r.reason) },
        { key: 'b', label: 'By', render: (r) => h.esc(r.byName || '') },
      ], rows: b.rateChanges }) }) : '';

    return kpis + notes + zak + (receive && rateForm ? '<div class="grid-2">' + receive + rateForm + '</div>' : receive + rateForm) + list + history;
  }

  /* ── discharge: money due needs the approver ──────────── */
  function dischargeExtra(b) {
    if (!b) return '';
    if (b.isPoliceCase) return h.note(`Police case: free.${b.received ? ` Voluntary contributions: ${pkr(b.received)}.` : ''}`, 'info');
    if (!b.rateSet) return h.note('No daily rate on this file, so nothing is charged. Set the rate on the Payment tab if this patient should pay.', 'warn');
    if (!b.due) return h.note(`Payments clear: ${pkr(b.accrued)} charged for ${h.num(b.days)} days, ${pkr(b.received)} received.`, 'ok');
    return `<div style="margin-top:12px">${h.noteHtml(`<b>${pkr(b.due)} still due</b> (${h.num(b.days)} days × ${pkr(b.dailyRate)} = ${pkr(b.accrued)}, received ${pkr(b.received)}). Receive it on the Payment tab, or discharge with the approval of the Founder, Chairman or President. The balance then stays receivable.`, 'warn')}<div class="form-grid" style="margin-top:10px">${[
      h.field({ id: 'dueApprovedBy', label: 'Discharge with money due approved by', type: 'select', value: '', options: approverOpts('Not approved'), required: true }),
      h.field({ id: 'dueApprovalNote', label: 'Approval note', placeholder: 'e.g. approved on WhatsApp, family to pay in instalments', maxlength: 300 }),
    ].join('')}</div></div>`;
  }

  /* ── receipt ──────────────────────────────────────────── */
  async function printReceipt(admissionId, paymentId) {
    const [b, f] = await Promise.all([loadBilling(admissionId), window.HMS.cached('adm:' + admissionId, () => api.get(`/drh/admissions/${encodeURIComponent(admissionId)}`))]);
    const p = b.payments.find((x) => x.id === paymentId); if (!p) return;
    const centre = (window.HMS.state.meta.centres || []).find((c) => c.id === b.centre.id) || b.centre;
    const P = f.patient || {};
    window.HMS.print(h.a4(`${h.letterhead(b.isPoliceCase ? 'Contribution receipt' : 'Payment receipt', centre)}
      <table><tr><th>Receipt no</th><td><b>${h.esc(p.receiptNo)}</b></td><th>Date</th><td>${h.date(p.receivedAt)} ${h.time(p.receivedAt)}</td></tr>
      <tr><th>Patient</th><td>${h.esc(P.name || '')} · ${h.esc(P.patientNo || '')}</td><th>DRH file</th><td>${h.esc(b.fileNo)}</td></tr>
      <tr><th>Amount</th><td><b>${pkr(p.amount)}</b></td><th>Method</th><td>${h.esc(methodLabel(p.method))}${p.reference ? ' · ' + h.esc(p.reference) : ''}</td></tr>
      <tr><th>Paid by</th><td>${h.esc(p.paidBy || '—')}</td><th>Received by</th><td>${h.esc(p.receivedBy || '')}</td></tr>
      ${p.note ? `<tr><th>Note</th><td colspan="3">${h.esc(p.note)}</td></tr>` : ''}</table>
      <h2 style="margin-top:12px">Account on ${h.date(new Date().toISOString())}</h2>
      <table><tr><th>Daily rate</th><td>${b.isPoliceCase ? 'Police case (free)' : pkr(b.dailyRate)}</td><th>Days</th><td>${h.num(b.days)}</td></tr>
      <tr><th>Charges</th><td>${pkr(b.accrued)}</td><th>Received in total</th><td>${pkr(b.received)}</td></tr>
      <tr><th>${b.balance < 0 ? 'Paid in advance' : 'Due'}</th><td colspan="3"><b>${pkr(Math.abs(b.balance))}</b></td></tr></table>
      <div class="sig"><div>Received by</div><div>Guardian</div></div>`), 'Receipt');
  }

  /* ── Payments screen ──────────────────────────────────── */
  window.HMS.screen('payments', {
    title: 'Payments', write: true,
    render: async (c) => {
      const centres = (window.HMS.state.meta.centres || []).filter((x) => (me().centreIds || []).includes(x.id));
      const ids = centres.map((x) => x.id);
      let cid = c.params.centre || (centres.length === 1 ? centres[0].id : 'all');
      if (cid !== 'all' && !ids.includes(cid)) cid = centres.length === 1 ? centres[0].id : 'all';
      const s = await c.cached('billsum:' + cid, () => api.get('/drh/billing/summary', { centreId: cid }));
      const T = s.totals || {};
      const tabs = centres.length > 1 ? h.tabs([{ id: 'all', label: 'Both centres' }].concat(centres.map((x) => ({ id: x.id, label: x.name }))).map((t) => ({ ...t, href: window.HMS.href('payments', { centre: t.id }) })), cid, 'drh-branch-tabs') : '';
      const showC = cid === 'all' && centres.length > 1;
      const colFile = { key: 'f', label: 'Patient', render: (r) => `<b>${h.esc(r.patient.name)}</b> <span class="muted small">${h.esc(r.patient.patientNo)}</span><div class="muted small mono">${h.esc(r.fileNo)}</div>` };
      const colC = showC ? [{ key: 'c', label: 'Centre', render: (r) => h.esc(shortCentre(r.centre && r.centre.name)) }] : [];
      const dueTable = (rows, after) => h.table({ columns: [colFile, ...colC,
        { key: 'r', label: 'Rate', align: 'right', render: (r) => pkr(r.dailyRate) },
        { key: 'd', label: 'Days', align: 'right', render: (r) => h.num(r.days) },
        { key: 'a', label: 'Charges', align: 'right', render: (r) => pkr(r.accrued) },
        { key: 'p', label: 'Received', align: 'right', render: (r) => pkr(r.received) },
        { key: 'u', label: 'Due', align: 'right', render: (r) => `<b>${pkr(r.due)}</b>` },
        ...(after ? [{ key: 'x', label: 'Discharged', render: (r) => `${h.date(r.dischargedAt)}${r.dueApprovedBy ? `<div class="muted small">approved by the ${h.esc(r.dueApprovedBy)}</div>` : ''}` }] : []),
      ], rows, rowHref: (r) => fileHref(r.id, 'payment'), empty: after ? 'Nothing outstanding after discharge' : 'No money due from patients under care' });

      return tabs + h.page('Payments', `${cid === 'all' ? centres.map((x) => shortCentre(x.name)).join(' and ') : shortCentre((centres.find((x) => x.id === cid) || {}).name)} · not visible to police logins`)
        + h.kpis([
          { label: 'Due · under care', value: pkr(T.receivableUnderCare), tone: T.receivableUnderCare ? 'warn' : 'ok', sub: `${h.num((s.underCare || []).length)} patients` },
          { label: 'Due · after discharge', value: pkr(T.receivableAfterDischarge), tone: T.receivableAfterDischarge ? 'danger' : 'ok', sub: `${h.num((s.afterDischarge || []).length)} patients` },
          { label: 'Received today', value: pkr(T.receivedToday), tone: 'ok', sub: `${h.num(T.paymentsToday)} receipts` },
          { label: 'Received this month', value: pkr(T.receivedThisMonth), tone: 'ok', sub: `${h.num(T.paymentsThisMonth)} receipts` },
          { label: 'Zakat approvals pending', value: h.num(T.zakatPending), tone: T.zakatOverdue ? 'danger' : T.zakatPending ? 'warn' : 'ok', sub: T.zakatOverdue ? `${h.num(T.zakatOverdue)} past the three days` : 'decided within three days' },
          { label: 'Daily rate not set', value: h.num(T.rateNotSet), tone: T.rateNotSet ? 'warn' : 'ok', sub: 'admitted, non-police' },
        ])
        + ((s.zakatPending || []).length ? h.card({ title: `Zakat approvals pending (${h.num(s.zakatPending.length)})`, tone: T.zakatOverdue ? 'warn' : undefined, body: h.table({ columns: [
          { key: 'f', label: 'Patient', render: (z) => (z.admission ? `<b>${h.esc(z.admission.patient.name)}</b><div class="muted small mono">${h.esc(z.admission.fileNo)}</div>` : '—') },
          { key: 'r', label: 'Rate', align: 'right', render: (z) => pkr(z.rate) },
          { key: 'a', label: 'Approver', render: (z) => `${h.esc(z.approver)}${z.approverPhone ? `<div class="muted small mono">${h.esc(z.approverPhone)}</div>` : ''}` },
          { key: 'q', label: 'Requested', render: (z) => h.date(z.requestedAt) },
          { key: 's', label: 'Status', render: (z) => zakatBadge(z) },
        ], rows: s.zakatPending, rowHref: (z) => (z.admission ? fileHref(z.admission.id, 'payment') : null) }) }) : '')
        + ((s.rateNotSet || []).length ? h.card({ title: `Daily rate not set (${h.num(s.rateNotSet.length)})`, subtitle: 'Registered before payments were added', body: h.table({ columns: [colFile, ...colC, { key: 'a', label: 'Admitted', render: (r) => h.date(r.admittedAt) }], rows: s.rateNotSet, rowHref: (r) => fileHref(r.id, 'payment') }) }) : '')
        + h.card({ title: 'Due from patients under care', body: dueTable(s.underCare || [], false) })
        + h.card({ title: 'Due after discharge (receivable)', body: dueTable(s.afterDischarge || [], true) })
        + h.card({ title: 'Recent receipts', body: h.table({ columns: [
          { key: 'r', label: 'Receipt', render: (p) => `<b class="mono">${h.esc(p.receiptNo)}</b>` },
          { key: 'd', label: 'Date', render: (p) => `${h.date(p.receivedAt)} <span class="muted small">${h.time(p.receivedAt)}</span>` },
          { key: 'f', label: 'Patient', render: (p) => (p.admission ? `${h.esc(p.admission.patient.name)}<div class="muted small mono">${h.esc(p.admission.fileNo)}</div>` : '—') },
          { key: 'a', label: 'Amount', align: 'right', render: (p) => `<b>${pkr(p.amount)}</b>` },
          { key: 'm', label: 'Method', render: (p) => h.esc(methodLabel(p.method)) },
          { key: 'b', label: 'Received by', render: (p) => h.esc(p.receivedBy || '') },
        ], rows: s.recentPayments || [], rowHref: (p) => (p.admission ? fileHref(p.admission.id, 'payment') : null), empty: 'No payment received yet' }) });
    },
  });

  /* ── actions ──────────────────────────────────────────── */
  const after = (id, b, msg) => { window.HMS.setCached('bill:' + id, b); window.HMS.render(); return msg; };
  let pendingZakat = null;

  window.HMS.actions({
    payReceive: async (id, form) => {
      const amount = Number(form.amount);
      if (!Number.isInteger(amount) || amount < 1) { window.HMS.toast('Enter the amount as a whole number of rupees', 'danger'); return; }
      const res = await api.post(`/drh/billing/${encodeURIComponent(id)}/payments`, { amount, method: form.method || 'CASH', paidBy: String(form.paidBy || '').trim() || undefined, reference: String(form.reference || '').trim() || undefined, note: String(form.note || '').trim() || undefined });
      after(id, res.billing, '');
      const p = res.billing.payments.find((x) => x.receiptNo === res.receiptNo);
      if (p) await printReceipt(id, p.id);
      window.HMS.toast(`${pkr(amount)} received · ${res.receiptNo}`, 'ok');
    },
    payPrint: (arg) => { const [id, pid] = String(arg).split('|'); return printReceipt(id, pid); },
    rateChange: async (id, form) => {
      const rate = Number(form.newRate);
      if (!Number.isInteger(rate) || rate < RATE_MIN || rate > RATE_MAX) { window.HMS.toast(`The daily rate must be PKR ${RATE_MIN} to ${RATE_MAX}`, 'danger'); return; }
      const reason = String(form.reason || '').trim(); if (reason.length < 3) { window.HMS.toast('Write the reason for the change', 'danger'); return; }
      const body = { dailyRate: rate, reason };
      if (rate < ZAKAT_BELOW) {
        if (!form.zakatApprover) { window.HMS.toast('A rate below PKR 1,000 needs a Zakat request: choose the approver', 'danger'); return; }
        body.zakat = { approver: form.zakatApprover, approverPhone: String(form.zakatPhone || '').trim() || undefined, formStatus: form.zakatForm || 'ATTACHED' };
      }
      const b = await api.patch(`/drh/billing/${encodeURIComponent(id)}/rate`, body);
      return after(id, b, `Daily rate set to ${pkr(rate)}`);
    },
    zakatDecide: (arg) => {
      const [id, zid, decision] = String(arg).split('|');
      pendingZakat = { id, zid, decision };
      const rej = decision === 'REJECTED';
      window.HMS.modal(rej ? 'Zakat request rejected' : 'Zakat request approved', `<form id="zk-form" data-form-id="zk-form">${h.note(rej ? 'Record the rejection. The daily rate must then be raised to PKR 1,000 or more on this tab.' : 'Record that the approver approved the Zakat-supported rate.', rej ? 'warn' : 'info')}<div class="form-grid" style="margin-top:10px">${h.field({ id: 'zkNote', label: rej ? 'Reason (required)' : 'Note (optional)', type: 'textarea', span: 2, maxlength: 300, placeholder: rej ? 'e.g. family can pay Category 3' : 'e.g. approved on WhatsApp 21 Nov' })}</div><div class="form-actions">${h.btn({ label: 'Cancel', action: 'closeModal', tone: 'secondary' })}${h.btn({ label: 'Save decision', action: 'zakatSave', form: 'zk-form' })}</div></form>`);
    },
    zakatSave: async (_a, form) => {
      if (!pendingZakat) return;
      const note = String(form.zkNote || '').trim();
      if (pendingZakat.decision === 'REJECTED' && !note) { window.HMS.toast('Write the reason', 'danger'); return; }
      const { id, zid, decision } = pendingZakat;
      const b = await api.post(`/drh/billing/zakat/${encodeURIComponent(zid)}/decision`, { decision, note: note || undefined });
      pendingZakat = null; window.HMS.closeModal();
      return after(id, b, decision === 'APPROVED' ? 'Zakat approval recorded' : 'Rejection recorded: raise the daily rate');
    },
  });

  window.HMS.billing = { regCard, regBody, payTab, dischargeExtra, loadBilling, pkr };
})();

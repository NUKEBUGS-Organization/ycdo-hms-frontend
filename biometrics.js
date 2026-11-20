/* YCDO HMS — patient photo (webcam) and thumb (ZKTeco USB reader) capture. Same behaviour as the
   approved prototype.

   HMS.bio is shared by every workspace:
     takePhoto({ title })                      -> Promise<jpegDataUrl | null>
     enrollThumb({ title, who })               -> Promise<{ template, image } | null>   three touches, merged
     verifyThumb({ title, template, who })     -> Promise<{ matched, score } | null>
     identifyThumb({ title, candidates, describe })  -> Promise<{ id, score } | { id: null } | null>
                                               describe(id) -> Promise<label> names the match in the panel
     findTemplate(template, candidates)        -> Promise<{ id, score } | null>  (no scan; duplicate check)
     readForm(formId)                          -> plain object of the form's current values
   null always means the operator cancelled.

   The capture panel lives outside #app, so the shell re-rendering behind it never kills the
   camera stream or an enrolment in progress.

   The webcam is used straight from the browser. The fingerprint reader goes through
   bridge/fp-bridge.py on http://127.0.0.1:8790 (started on the centre PC with
   start-fingerprint-service.bat), because a browser cannot open a USB reader. */
(function () {
  const BRIDGE = ((window.HMS_CONFIG && window.HMS_CONFIG.bridgeUrl) || 'http://127.0.0.1:8790').replace(/\/$/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── bridge calls ─────────────────────────────────────── */
  async function call(path, body, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 8000);
    try {
      const r = await fetch(BRIDGE + path, body === undefined ? { signal: ctl.signal, cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || `Fingerprint service error ${r.status}`), { kind: 'device' });
      return j;
    } catch (e) {
      if (e.kind) throw e;
      if (e.name === 'AbortError') throw Object.assign(new Error('The fingerprint service did not answer in time'), { kind: 'bridge' });
      throw Object.assign(new Error('The fingerprint service is not running on this computer'), { kind: 'bridge' });
    } finally { clearTimeout(t); }
  }
  let lastStatus = null;
  async function status() {
    try { lastStatus = await call('/status'); } catch (e) { lastStatus = { ok: false, error: e.message, bridge: false }; }
    return lastStatus;
  }

  /* ── panel ────────────────────────────────────────────── */
  function panel(title) {
    const ov = document.createElement('div');
    ov.className = 'bio-overlay';
    ov.innerHTML = `<div class="bio-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="bio-h"><h3>${esc(title)}</h3><span class="bio-dev"></span></div>
      <div class="bio-b"></div><div class="bio-f"></div></div>`;
    document.body.appendChild(ov);
    const q = (s) => ov.querySelector(s);
    return {
      el: ov,
      body: (html) => { q('.bio-b').innerHTML = html; },
      dev: (html) => { q('.bio-dev').innerHTML = html; },
      foot: (buttons) => {
        const f = q('.bio-f'); f.innerHTML = '';
        for (const b of buttons) {
          const el = document.createElement('button');
          el.type = 'button'; el.className = `btn ${b.tone || ''}`; el.textContent = b.label;
          if (b.disabled) el.disabled = true;
          el.addEventListener('click', (e) => { e.stopPropagation(); b.onClick(); });
          f.appendChild(el);
        }
        const first = f.querySelector('button:not([disabled])'); if (first && !buttons.noFocus) first.focus();
      },
      close: () => ov.remove(),
    };
  }
  const devBadge = (st) => (st && st.ok
    ? `<span class="badge ${st.simulate ? 'warn' : 'ok'}">${esc(st.simulate ? 'Simulated reader' : st.device || 'Reader ready')}</span>`
    : '<span class="badge danger">Reader not ready</span>');

  function bridgeHelp(err) {
    const notRunning = !err || err.kind === 'bridge';
    return `<div class="note danger"><b>${esc(err ? err.message : 'The fingerprint reader is not available')}</b></div>
      <ol class="bio-help">
        ${notRunning ? '<li>Start the fingerprint service on this computer: double-click <b>start-fingerprint-service.bat</b> (YCDO HMS fingerprint folder) and keep its window open.</li><li>If Chrome asks to allow this site to reach devices on the local network, click <b>Allow</b>.</li>' : ''}
        <li>The <b>ZKFinger SDK for Windows</b> must be installed once on this computer — it installs the reader driver and <span class="mono">libzkfp.dll</span>.</li>
        <li>Check the reader in Device Manager: it should show as <b>ZK9500 / Live10R</b> without a warning sign, and its light should be on.</li>
      </ol>`;
  }

  /* ── webcam photo ─────────────────────────────────────── */
  function takePhoto(opts = {}) {
    return new Promise((resolve) => {
      const p = panel(opts.title || 'Patient photo');
      p.dev('<span class="badge info">Webcam</span>');
      let stream = null;
      const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
      const done = (v) => { stop(); p.close(); resolve(v); };
      const live = async () => {
        p.body(`<div class="bio-cam"><video autoplay playsinline muted></video><div class="bio-frame"></div></div>
          <div class="muted small center" style="margin-top:8px">Face the camera, inside the frame, with good light. ${esc(opts.who || '')}</div>`);
        p.foot([{ label: 'Starting camera…', disabled: true, onClick() {} }, { label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot open a camera here. Open the HMS at https://hms.ycdo.org.pk in Chrome or Edge.');
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
          const v = p.el.querySelector('video'); if (!v) { stop(); return; }
          v.srcObject = stream;
          await v.play().catch(() => {});
          p.foot([{ label: 'Capture photo', tone: 'primary', onClick: () => snap(v) }, { label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
        } catch (e) {
          const why = e && e.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for this page in the browser address bar, then try again.'
            : e && e.name === 'NotFoundError' ? 'No camera was found. Check the webcam cable.'
            : e && e.name === 'NotReadableError' ? 'The camera is busy in another program (Zoom, Teams, Camera app). Close it and try again.'
            : (e && e.message) || 'The camera could not be opened';
          p.body(`<div class="note danger"><b>${esc(why)}</b></div>`);
          p.foot([{ label: 'Try again', tone: 'primary', onClick: live }, { label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
        }
      };
      const snap = (v) => {
        /* Passport-style 3:4 crop from the middle of the frame, small enough to keep on the device. */
        const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
        const ch = vh, cw = Math.round(vh * 3 / 4);
        const c = document.createElement('canvas'); c.width = 300; c.height = 400;
        c.getContext('2d').drawImage(v, (vw - cw) / 2, 0, cw, ch, 0, 0, 300, 400);
        const url = c.toDataURL('image/jpeg', 0.75);
        stop();
        p.body(`<div class="bio-cam"><img src="${url}" alt="Captured photo"></div>`);
        p.foot([{ label: 'Use this photo', tone: 'primary', onClick: () => done(url) }, { label: 'Retake', tone: 'secondary', onClick: live }, { label: 'Cancel', tone: 'ghost', onClick: () => done(null) }]);
      };
      live();
    });
  }

  /* ── thumb ────────────────────────────────────────────── */
  const fpBox = (img, text, tone) => `<div class="bio-fp">${img ? `<img src="${esc(img)}" alt="Fingerprint scan">` : '<div class="bio-fp-empty">👍</div>'}</div>
    <div class="bio-step ${tone || ''}">${text}</div>`;

  /** Runs a thumb flow: checks the reader, then hands control to `run`. */
  function thumbFlow(title, run) {
    return new Promise((resolve) => {
      const p = panel(title);
      let cancelled = false;
      const done = (v) => { cancelled = true; p.close(); resolve(v); };
      const start = async () => {
        cancelled = false;
        p.body(fpBox(null, 'Checking the fingerprint reader…'));
        p.foot([{ label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
        const st = await status();
        p.dev(devBadge(st));
        if (!st.ok) {
          p.body(bridgeHelp(st.bridge === false ? { kind: 'bridge', message: st.error } : { kind: 'device', message: st.error }));
          p.foot([{ label: 'Check again', tone: 'primary', onClick: start }, { label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
          return;
        }
        try { await run(p, () => cancelled, done); }
        catch (e) {
          if (cancelled) return;
          p.body(e.kind === 'bridge' ? bridgeHelp(e) : `${fpBox(null, esc(e.message), 'danger')}`);
          p.foot([{ label: 'Try again', tone: 'primary', onClick: start }, { label: 'Cancel', tone: 'secondary', onClick: () => done(null) }]);
        }
      };
      start();
    });
  }
  async function scan(p, text, img, isCancelled) {
    for (;;) {
      p.body(fpBox(img, text));
      const r = await call('/capture', { timeoutMs: 20000 }, 26000);
      if (isCancelled()) return null;
      if (!r.timeout) return r;
      text = 'No thumb detected yet — place the thumb flat on the glass';
    }
  }

  function enrollThumb(opts = {}) {
    return thumbFlow(opts.title || 'Enrol thumb', async (p, isCancelled, done) => {
      const temps = []; let img = null;
      for (let i = 1; i <= 3; i++) {
        const r = await scan(p, `${i === 1 ? 'Place the <b>right thumb</b>' : 'Lift, then place the <b>same thumb</b> again'} on the reader <span class="muted">(${i} of 3)</span>${opts.who ? `<div class="muted small">${esc(opts.who)}</div>` : ''}`, img, isCancelled);
        if (!r) return;
        temps.push(r.template); img = r.image;
      }
      p.body(fpBox(img, 'Combining the three scans…'));
      const m = await call('/merge', { templates: temps });
      if (isCancelled()) return;
      p.body(fpBox(img, '<b>Thumb enrolled</b>', 'ok'));
      p.foot([{ label: 'Save thumb', tone: 'primary', onClick: () => done({ template: m.template, image: img }) }, { label: 'Enrol again', tone: 'secondary', onClick: () => { p.close(); enrollThumb(opts).then(done); } }, { label: 'Cancel', tone: 'ghost', onClick: () => done(null) }]);
    });
  }

  function verifyThumb(opts = {}) {
    return thumbFlow(opts.title || 'Verify thumb', async (p, isCancelled, done) => {
      const r = await scan(p, `Place the patient's <b>right thumb</b> on the reader${opts.who ? `<div class="muted small">${esc(opts.who)}</div>` : ''}`, null, isCancelled);
      if (!r) return;
      const m = await call('/match', { a: r.template, b: opts.template });
      if (isCancelled()) return;
      p.body(fpBox(r.image, m.matched ? `<b>Thumb matches</b> <span class="muted">· score ${m.score}</span>` : `<b>Thumb does NOT match</b> <span class="muted">· score ${m.score}</span>`, m.matched ? 'ok' : 'danger'));
      p.foot([{ label: 'Done', tone: 'primary', onClick: () => done(m) }, { label: 'Scan again', tone: 'secondary', onClick: () => { p.close(); verifyThumb(opts).then(done); } }]);
    });
  }

  function identifyThumb(opts = {}) {
    return thumbFlow(opts.title || 'Find patient by thumb', async (p, isCancelled, done) => {
      const cands = (opts.candidates || []).filter((c) => c.template);
      if (!cands.length) { p.body(fpBox(null, 'No patient has a thumb enrolled yet', 'danger')); p.foot([{ label: 'Close', tone: 'secondary', onClick: () => done(null) }]); return; }
      const r = await scan(p, `Place the patient's <b>right thumb</b> on the reader <div class="muted small">Searching ${cands.length} enrolled patient${cands.length === 1 ? '' : 's'}</div>`, null, isCancelled);
      if (!r) return;
      const m = await call('/identify', { template: r.template, candidates: cands }, 20000);
      if (isCancelled()) return;
      const hit = m.match && cands.find((c) => c.id === m.match.id);
      if (hit && !hit.label && opts.describe) { try { hit.label = await opts.describe(hit.id); } catch (e) { /* show the id */ } }
      if (isCancelled()) return;
      p.body(fpBox(r.image, hit ? `<b>${esc(hit.label || hit.id)}</b> <span class="muted">· score ${m.match.score}</span>` : '<b>No enrolled patient matches this thumb</b>', hit ? 'ok' : 'warn'));
      p.foot(hit ? [{ label: 'Open', tone: 'primary', onClick: () => done({ id: hit.id, score: m.match.score }) }, { label: 'Scan again', tone: 'secondary', onClick: () => { p.close(); identifyThumb(opts).then(done); } }]
        : [{ label: 'Scan again', tone: 'primary', onClick: () => { p.close(); identifyThumb(opts).then(done); } }, { label: 'Close', tone: 'secondary', onClick: () => done({ id: null }) }]);
    });
  }

  async function findTemplate(template, candidates) {
    const cands = (candidates || []).filter((c) => c.template);
    if (!template || !cands.length) return null;
    try { const m = await call('/identify', { template, candidates: cands }, 20000); return m.match || null; } catch (e) { return null; }
  }

  function readForm(id) {
    const f = document.getElementById(id); const out = {};
    if (f) for (const el of f.querySelectorAll('input,select,textarea')) if (el.name) out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    return out;
  }

  /* Small avatar used on patient files: the photo when there is one, initials otherwise. */
  function avatar(p, size = 72) {
    if (p && p.photo) return `<img class="bio-avatar" src="${esc(p.photo)}" alt="${esc(p.name)}" style="width:${size}px;height:${Math.round(size * 4 / 3)}px">`;
    /* photo on the server: loaded with the token after render (drh.js loadPhotos) */
    if (p && p.photoId) return `<img class="bio-avatar" data-photo="${esc(p.photoId)}" alt="${esc(p.name)}" style="width:${size}px;height:${Math.round(size * 4 / 3)}px">`;
    const ini = String((p && p.name) || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return `<div class="bio-avatar empty" style="width:${size}px;height:${Math.round(size * 4 / 3)}px">${esc(ini)}${p && p.captured ? '' : '<span>no photo</span>'}</div>`;
  }

  window.HMS.bio = { bridge: BRIDGE, status, takePhoto, enrollThumb, verifyThumb, identifyThumb, findTemplate, readForm, avatar, last: () => lastStatus };
})();

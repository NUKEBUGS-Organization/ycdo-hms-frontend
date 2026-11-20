/* YCDO HMS - in-memory mock of the Phase 0 API (docs/hms/phase0-api.md), for testing every screen
   without the backend. Loaded only on localhost with ?mock=1 (see config.js / app.js); never
   shipped in the Docker image. Data lives in memory: reloading the page starts again.
   Mock thumbs use the simulated reader's templates (bridge/fp-bridge.py --simulate):
   finger-1 is free (a new patient), finger-2 belongs to Bilal Ahmed (duplicate demo). */
(function () {
  const { ApiError } = window.API;
  const DAY = 86400000;
  const now = () => new Date();
  const iso = (d) => new Date(d).toISOString();
  const ago = (days, hh = 10, mm = 30) => { const d = new Date(Date.now() - days * DAY); d.setHours(hh, mm, 0, 0); if (d > now()) d.setTime(Date.now() - 2 * 3600000); return d.toISOString(); };
  const dateOnly = (s) => String(s).slice(0, 10);
  let seq = 1000;
  const uid = (p) => `${p}_${(++seq).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const b64 = (s) => btoa(s);
  const fail = (status, message, extra) => { throw new ApiError(status, message, { statusCode: status, message, ...(extra || {}) }); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ── reference data ───────────────────────────────────── */
  const META = {
    centres: [
      { id: 'c-gul', code: 'PDG1', name: 'Police and YCDO DRH Gulgasht', area: 'Gulgasht Road, near Jalil Chowk, Multan', phone: '0310-2827777', establishedAt: '2024-03-01' },
      { id: 'c-ras', code: 'PDR1', name: 'Police and YCDO DRH Rasheedabad', area: 'Chowk Rasheedabad, Multan', phone: '0329-2827777', establishedAt: '2026-01-05' },
    ],
    substances: ['Heroin', 'Ice (crystal meth)', 'Hashish (charas)', 'Injectable heroin', 'Alcohol', 'Opium', 'Sedative tablets', 'Other'],
    relations: ['Father', 'Mother', 'Brother', 'Sister', 'Husband', 'Wife', 'Son', 'Uncle', 'Other'],
    placeTypes: ['Graveyard', 'Roadside', 'Under a bridge', 'Public park', 'Bus stand', 'Railway station', 'Public square', 'Canal bank', 'Other'],
    ranks: ['Constable', 'Head Constable', 'ASI', 'SI', 'Inspector', 'DSP', 'SP', 'Other'],
    outcomes: [{ value: 'PROGRAMME_COMPLETED', label: 'Programme completed' }, { value: 'GUARDIAN_REQUEST', label: 'Discharged on guardian request' }, { value: 'AGAINST_MEDICAL_ADVICE', label: 'Left against medical advice' }, { value: 'REFERRED', label: 'Referred to hospital (psychiatry)' }],
    programmeDays: 90,
  };
  const ALL_CENTRE = { id: 'all', name: 'Police and YCDO DRH · both centres', area: 'Gulgasht and Rasheedabad, Multan', phone: '0310-2827777 · 0329-2827777', establishedAt: '2024-03-01' };

  /* ── accounts ─────────────────────────────────────────── */
  const users = [
    { id: 'u1', email: 'kashif.gulgasht@ycdo.test', name: 'Muhammad Kashif', designation: 'Admission Officer, DRH Gulgasht', role: 'DRH_STAFF', roles: ['DRH_STAFF'], centreIds: ['c-gul'], isActive: true, lastLogin: ago(1, 9) },
    { id: 'u2', email: 'sana.drh@ycdo.test', name: 'Sana Iqbal', designation: 'DRH Coordinator (both centres)', role: 'DRH_STAFF', roles: ['DRH_STAFF'], centreIds: ['c-gul', 'c-ras'], isActive: true, lastLogin: ago(0, 8) },
    { id: 'u3', email: 'cpo.multan@ycdo.test', name: 'CPO Multan', designation: 'City Police Officer, Multan', role: 'POLICE_VIEWER', roles: ['POLICE_VIEWER'], centreIds: [], isActive: true, lastLogin: ago(2, 11) },
    { id: 'u4', email: 'spo.ops@ycdo.test', name: 'SPO Operations', designation: 'SP Operations, Multan', role: 'POLICE_VIEWER', roles: ['POLICE_VIEWER'], centreIds: [], isActive: true, lastLogin: null },
    { id: 'u5', email: 'it@ycdo.test', name: 'YCDO IT', designation: 'IT Admin', role: 'IT_ADMIN', roles: ['IT_ADMIN'], centreIds: [], isActive: true, lastLogin: ago(0, 7) },
    { id: 'u6', email: 'superadmin@ycdo.test', name: 'Super Admin', designation: 'Super Admin', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'], centreIds: [], isActive: true, lastLogin: ago(5, 7) },
  ];
  const tokens = {}; const challenges = {};
  const isAdminU = (u) => u.roles.some((r) => r === 'SUPER_ADMIN' || r === 'IT_ADMIN');
  const canWriteU = (u) => u.roles.some((r) => r === 'DRH_STAFF' || r === 'SUPER_ADMIN' || r === 'IT_ADMIN');
  const writeCentres = (u) => (isAdminU(u) ? META.centres.map((c) => c.id) : u.centreIds);

  /* ── stations and places ──────────────────────────────── */
  const stations = [
    { id: 'ps-gul', name: 'PS Gulgasht', area: 'Gulgasht Colony, Multan', phone: '061-9200101', active: true },
    { id: 'ps-mum', name: 'PS Mumtazabad', area: 'Mumtazabad, Multan', phone: '061-9200102', active: true },
    { id: 'ps-bos', name: 'PS Bosan', area: 'Bosan Road, Multan', phone: '', active: true },
    { id: 'ps-sit', name: 'PS Seetal Mari', area: 'Seetal Mari, Multan', phone: '061-9200201', active: true },
    { id: 'ps-che', name: 'PS Chehlyak', area: 'Chehlyak, Multan', phone: '', active: true },
    { id: 'ps-del', name: 'PS Delhi Gate', area: 'Delhi Gate, Old City, Multan', phone: '061-9200203', active: true },
    { id: 'ps-can', name: 'PS Cantt', area: 'Multan Cantonment', phone: '', active: true },
  ];
  const places = [
    { id: 'pl-hp', type: 'Graveyard', name: 'Qabristan Hassan Parwana', area: 'Hassan Parwana Colony, Multan', policeStationId: 'ps-mum', active: true },
    { id: 'pl-sm', type: 'Graveyard', name: 'Qabristan Seetal Mari', area: 'Seetal Mari, Multan', policeStationId: 'ps-sit', active: true },
    { id: 'pl-fly', type: 'Under a bridge', name: 'Chowk Kumharanwala flyover', area: 'Chowk Kumharanwala, Multan', policeStationId: 'ps-gul', active: true },
    { id: 'pl-bus', type: 'Bus stand', name: 'General Bus Stand', area: 'Khanewal Road, Multan', policeStationId: 'ps-che', active: true },
    { id: 'pl-rly', type: 'Railway station', name: 'Multan Cantt railway station', area: 'Multan Cantonment', policeStationId: 'ps-can', active: true },
    { id: 'pl-qb', type: 'Public park', name: 'Qasim Bagh', area: 'Old Fort, Multan', policeStationId: 'ps-del', active: true },
    { id: 'pl-bos', type: 'Roadside', name: 'Bosan Road near Chungi No 6', area: 'Bosan Road, Multan', policeStationId: 'ps-bos', active: true },
  ];

  /* ── patients and admissions ──────────────────────────── */
  const patients = []; const admissions = []; const reportFiles = {};
  let patientSeq = 0; const fileSeq = { 'c-gul': 0, 'c-ras': 0 };
  function addPatient(p) {
    const rec = { id: uid('pat'), patientNo: 'YCDO-DRH-' + String(++patientSeq).padStart(6, '0'), gender: 'MALE', phone: '', address: '', area: '', photo: null, photoAt: null, thumbTemplate: null, thumbAt: null, thumbDevice: null, createdAt: iso(now()), ...p };
    patients.push(rec); return rec;
  }
  function fileNoFor(centreId, at) { const c = META.centres.find((x) => x.id === centreId); const yy = String(new Date(at).getFullYear()).slice(2); return `DRH-${c.code}-${yy}-${String(++fileSeq[centreId]).padStart(4, '0')}`; }
  function addAdmission(a) {
    const rec = { id: uid('adm'), status: 'ADMITTED', dischargedAt: null, outcome: null, source: 'FAMILY', substance: 'Heroin', useYears: null, bed: '', policeReferralNo: null, policeStationId: null, officer: { name: null, rank: null, phone: null }, pickupPlaceId: null, referredBy: null, guardians: [], reports: [], followUps: [], events: [], ...a };
    rec.fileNo = rec.fileNo || fileNoFor(rec.centreId, rec.admittedAt);
    rec.guardians = rec.guardians.map((g) => ({ id: uid('g'), ...g }));
    admissions.push(rec); return rec;
  }
  const ev = (a, at, title, body, byName) => a.events.push({ at, title, body: body || null, byName: byName || 'Muhammad Kashif' });
  function seedReport(a, at, testName, resultNote) {
    const r = { id: uid('rep'), testName, testDate: dateOnly(at), resultNote: resultNote || null, fileName: testName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png', mimeType: 'image/png', sizeBytes: 182000, uploadedAt: at, uploadedBy: 'Muhammad Kashif' };
    a.reports.push(r); reportFiles[r.id] = { gen: testName, patient: a.patientId };
    ev(a, at, 'Test report uploaded', testName + (resultNote ? ' · ' + resultNote : ''));
  }
  function seed() {
    const S = [
      // name, father, age, cnic, centre, daysAgo, source, substance, years, station, place, finger, photo, discharge [daysAgo, outcome], reports
      ['Bilal Ahmed', 'Saeed Ahmed', 28, '36302-4521873-5', 'c-ras', 14, 'POLICE', 'Ice (crystal meth)', 4, 'ps-sit', 'pl-sm', 'finger-2', true, null, 1],
      ['Muhammad Asif Joiya', 'Ghulam Rasool', 34, '36302-7781245-3', 'c-gul', 41, 'POLICE', 'Heroin', 9, 'ps-mum', 'pl-hp', 'finger-3', true, null, 2],
      ['Zeeshan Khokhar', 'Allah Ditta', 22, '36302-1199452-7', 'c-gul', 3, 'POLICE', 'Ice (crystal meth)', 3, 'ps-gul', 'pl-fly', null, true, null, 0],
      ['Usman Ali', 'Shaukat Ali', 19, '36302-3342187-1', 'c-ras', 2, 'FAMILY', 'Hashish (charas)', 2, null, null, 'finger-4', true, null, 0],
      ['Rukhsana Bibi', 'Allah Ditta', 29, '36301-5566778-2', 'c-ras', 6, 'REFERRAL', 'Sedative tablets', 3, null, null, null, false, null, 1],
      ['Waqas Langah', 'Muhammad Bashir', 31, '36302-8845123-9', 'c-gul', 0, 'POLICE', 'Injectable heroin', 7, 'ps-che', 'pl-bus', null, false, null, 0],
      ['Naveed Arain', 'Manzoor Ahmed', 38, '36302-2210984-5', 'c-gul', 88, 'POLICE', 'Heroin', 12, 'ps-del', 'pl-qb', 'finger-5', true, null, 3],
      ['Muhammad Ali', 'Rafiq Ahmed', 30, '36302-6612398-1', 'c-ras', 95, 'FAMILY', 'Heroin', 6, null, null, 'finger-6', true, [3 * 7 + 2, 'PROGRAMME_COMPLETED'], 2],
      ['Kamran Sial', 'Nazir Ahmed', 26, '36302-9910032-3', 'c-gul', 130, 'POLICE', 'Ice (crystal meth)', 5, 'ps-mum', 'pl-hp', 'finger-7', true, [40, 'PROGRAMME_COMPLETED'], 2],
      ['Shahid Bhatti', 'Abdul Ghafoor', 45, '36302-4456120-9', 'c-gul', 300, 'POLICE', 'Opium', 20, 'ps-can', 'pl-rly', 'finger-8', true, [280, 'GUARDIAN_REQUEST'], 1],
      ['Faisal Qureshi', 'Muhammad Hanif', 24, '36303-1123456-7', 'c-gul', 420, 'REFERRAL', 'Alcohol', 4, null, null, 'finger-10', true, [330, 'PROGRAMME_COMPLETED'], 1],
      ['Adnan Baloch', 'Khuda Bakhsh', 17, '32303-7788990-1', 'c-ras', 60, 'POLICE', 'Hashish (charas)', 2, 'ps-sit', 'pl-sm', 'finger-11', true, [20, 'AGAINST_MEDICAL_ADVICE'], 1],
      ['Tariq Hiraj', 'Ghulam Haider', 41, '36302-5501234-3', 'c-gul', 57, 'POLICE', 'Heroin', 15, 'ps-bos', 'pl-bos', 'finger-12', true, [12, 'REFERRED'], 1],
    ];
    const g2 = [['Imran Ahmed', 'Brother'], ['Nasreen Bibi', 'Mother'], ['Danish Khokhar', 'Brother'], ['Nasreen Ali', 'Mother'], ['Sakina Bibi', 'Mother'], ['Saima Bibi', 'Wife'], ['Rizwan Arain', 'Brother'], ['Shahid Ali', 'Brother'], ['Parveen Akhtar', 'Mother'], ['Waseem Bhatti', 'Son'], ['Uzma Bibi', 'Wife'], ['Razia Bibi', 'Mother'], ['Akhtar Hiraj', 'Brother']];
    const officers = [['Muhammad Akram', 'ASI', '0300-6123456'], ['Rab Nawaz', 'SI', '0301-7345612'], ['Liaqat Ali', 'Head Constable', '0333-6012345'], ['Javed Iqbal', 'Inspector', '0345-7012398']];
    const wards = ['Ward A · Bed 4', 'Ward B · Bed 7', 'Ward A · Bed 12', 'Ward C · Bed 3', 'Female ward · Bed 2', 'Ward D · Bed 9', 'Ward B · Bed 15'];
    S.forEach((s, i) => {
      const [name, father, age, cnic, centreId, days, source, substance, years, st, pl, finger, photo, dis, nrep] = s;
      const female = /Bibi$/.test(name);
      const at = ago(days, 9 + (i % 9), (i * 10) % 60);
      const p = addPatient({ name, fatherName: father, age, cnic, gender: female ? 'FEMALE' : 'MALE', phone: `03${i % 5}${(i * 3) % 10}-${String(4512398 + i * 7919).slice(0, 7)}`, address: `House ${10 + i}, Street ${2 + (i % 7)}`, area: centreId === 'c-gul' ? 'Gulgasht Colony, Multan' : 'Rasheedabad, Multan',
        photo: photo ? 'gen' : null, photoAt: photo ? at : null, thumbTemplate: finger ? b64('SIM:' + finger) : null, thumbAt: finger ? at : null, thumbDevice: finger ? 'ZKTeco Live10R' : null });
      const o = officers[i % officers.length];
      const a = addAdmission({ centreId, patientId: p.id, admittedAt: at, source, substance, useYears: years, bed: female ? 'Female ward · Bed 2' : wards[i % wards.length],
        policeReferralNo: source === 'POLICE' ? `MLT-${String(new Date(at).getFullYear()).slice(2)}-${String(812 + i * 37).padStart(4, '0')}` : null,
        policeStationId: st, pickupPlaceId: pl, officer: source === 'POLICE' ? { name: o[0], rank: o[1], phone: o[2] } : { name: null, rank: null, phone: null },
        referredBy: source === 'REFERRAL' ? (i % 2 ? 'Psychiatry OPD · Nishtar Hospital Multan' : 'Social Welfare Department Multan') : null,
        guardians: [{ name: father, relation: 'Father', phone: `0300-${String(1112223 + i * 1301).slice(0, 7)}` }, { name: g2[i][0], relation: g2[i][1], phone: `0301-${String(2223334 + i * 977).slice(0, 7)}` }] });
      ev(a, at, source === 'POLICE' ? 'Brought in by police — admitted as a patient' : source === 'REFERRAL' ? 'Admitted on referral' : 'Admitted — brought by family', source === 'POLICE' ? `Referral ${a.policeReferralNo} · ${stations.find((x) => x.id === st).name} · found at ${places.find((x) => x.id === pl).name}` : a.referredBy || `Guardian: ${father} (Father)`);
      if (photo && finger) ev(a, at, 'Photo and thumb enrolled', 'At registration');
      for (let k = 0; k < nrep; k++) seedReport(a, ago(Math.max(0, days - 1 - k * 20), 14), k === 0 ? 'Initial package: HBsAg, HCV, HIV, CBC, LFT, urine drug screen' : k === 1 ? 'Urine drug screen (repeat)' : 'LFT (follow-up)', k === 0 && substance === 'Injectable heroin' ? 'HCV reactive — referred to hepatitis clinic' : k === 0 ? 'All non-reactive' : 'Negative');
      if (days > 7 && !dis) ev(a, ago(days - 7, 11), 'Detox phase completed', 'Moved to the rehabilitation ward');
      if (dis) {
        a.status = 'DISCHARGED'; a.dischargedAt = ago(dis[0], 12); a.outcome = dis[1];
        ev(a, a.dischargedAt, 'Discharged', META.outcomes.find((x) => x.value === dis[1]).label);
        const weeks = Math.min(12, Math.floor(dis[0] / 7));
        for (let wk = 1; wk <= weeks; wk++) {
          if (wk === weeks && i % 2) continue; // leave the last week unrecorded on some files
          const miss = (wk + i) % 5 === 0;
          a.followUps.push({ id: uid('fu'), weekNo: wk, status: miss ? 'MISSED' : 'ATTENDED', visitDate: dateOnly(ago(dis[0] - wk * 7)), note: miss ? 'Guardian called, will come next week' : null, recordedAt: ago(dis[0] - wk * 7, 13), recordedBy: 'Muhammad Kashif' });
        }
      }
    });
    // An earlier admission of Muhammad Asif Joiya (same person, re-admitted)
    const asif = patients.find((x) => x.name === 'Muhammad Asif Joiya');
    const old = addAdmission({ centreId: 'c-gul', patientId: asif.id, admittedAt: ago(520, 11), source: 'FAMILY', substance: 'Heroin', useYears: 7, bed: 'Ward C · Bed 11', guardians: [{ name: 'Ghulam Rasool', relation: 'Father', phone: '0300-1112223' }, { name: 'Nasreen Bibi', relation: 'Mother', phone: '0301-2223334' }] });
    old.status = 'DISCHARGED'; old.dischargedAt = ago(440, 12); old.outcome = 'GUARDIAN_REQUEST';
    ev(old, old.admittedAt, 'Admitted — brought by family'); ev(old, old.dischargedAt, 'Discharged', 'Discharged on guardian request');
  }
  seed();

  /* ── shaping ──────────────────────────────────────────── */
  const stationRef = (id) => { const s = stations.find((x) => x.id === id); return s ? { id: s.id, name: s.name } : null; };
  const placeRef = (id) => { const p = places.find((x) => x.id === id); return p ? { id: p.id, type: p.type, name: p.name, area: p.area } : null; };
  const centreRef = (id) => { const c = META.centres.find((x) => x.id === id); return { id: c.id, code: c.code, name: c.name }; };
  const dayOf = (a) => Math.max(1, Math.ceil(((a.dischargedAt ? new Date(a.dischargedAt) : now()) - new Date(a.admittedAt)) / DAY));
  const followDue = (a) => (a.status === 'DISCHARGED' ? Math.min(12, Math.floor((now() - new Date(a.dischargedAt)) / (7 * DAY))) : 0);
  const patientOf = (a) => patients.find((p) => p.id === a.patientId);
  function row(a) {
    const p = patientOf(a);
    return { id: a.id, fileNo: a.fileNo, centre: centreRef(a.centreId), status: a.status, admittedAt: a.admittedAt, dischargedAt: a.dischargedAt, outcome: a.outcome, day: dayOf(a), source: a.source,
      substance: a.substance, useYears: a.useYears, bed: a.bed, policeReferralNo: a.policeReferralNo, policeStation: stationRef(a.policeStationId), pickupPlace: placeRef(a.pickupPlaceId),
      patient: { id: p.id, patientNo: p.patientNo, name: p.name, fatherName: p.fatherName, gender: p.gender, age: p.age, cnic: p.cnic, hasPhoto: !!p.photo, hasThumb: !!p.thumbTemplate },
      reports: a.reports.length, followUps: { due: followDue(a), attended: a.followUps.filter((f) => f.status === 'ATTENDED').length } };
  }
  const fullPatient = (p) => ({ id: p.id, patientNo: p.patientNo, name: p.name, fatherName: p.fatherName, gender: p.gender, age: p.age, cnic: p.cnic, phone: p.phone, address: p.address, area: p.area, hasPhoto: !!p.photo, photoAt: p.photoAt, thumbAt: p.thumbAt, thumbDevice: p.thumbDevice });
  function file(a) {
    const p = patientOf(a);
    return { ...row(a), patient: fullPatient(p), officer: clone(a.officer), referredBy: a.referredBy, guardians: clone(a.guardians), reports: clone(a.reports), followUps: clone(a.followUps),
      events: clone(a.events).sort((x, y) => new Date(x.at) - new Date(y.at)),
      otherAdmissions: admissions.filter((x) => x.patientId === a.patientId && x.id !== a.id).sort((x, y) => new Date(y.admittedAt) - new Date(x.admittedAt)).map(row) };
  }
  const byDateDesc = (x, y) => new Date(y.admittedAt) - new Date(x.admittedAt);

  /* ── helpers ──────────────────────────────────────────── */
  function auth(token) {
    const uidv = tokens[token]; const u = users.find((x) => x.id === uidv);
    if (!u || !u.isActive) fail(401, 'Unauthorized');
    return u;
  }
  function needWrite(u, centreId) {
    if (!canWriteU(u)) fail(403, 'This account can view the DRH records but cannot change them');
    if (centreId && !writeCentres(u).includes(centreId)) fail(403, 'You can only make changes at your own centre');
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/police\s*station|thana|\bp\s*\.?\s*s\b\.?/g, ' ').replace(/[^a-z0-9]/g, '');
  const similar = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))); };
  const ageGroupOf = (age) => (age < 20 ? 'U20' : age < 30 ? '20-29' : age < 40 ? '30-39' : '40P');
  const AGE_LABELS = [['U20', 'Under 20'], ['20-29', '20 – 29'], ['30-39', '30 – 39'], ['40P', '40 and above']];
  const top = (m) => Object.entries(m).sort((x, y) => y[1] - x[1]);
  const inc = (m, k) => { if (k != null) m[k] = (m[k] || 0) + 1; };

  /* Generated JPEG for seeded photos (initials on a coloured card). */
  function genImage(text, w, h, bg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(w / 2, h * 0.38, w * 0.22, 0, Math.PI * 2); g.fill();
    g.fillRect(w * 0.2, h * 0.62, w * 0.6, h * 0.4);
    g.fillStyle = '#0F172A'; g.font = `bold ${Math.round(w * 0.16)}px Arial`; g.textAlign = 'center'; g.fillText(text, w / 2, h * 0.43);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
  }
  function genReport(title, who) {
    const c = document.createElement('canvas'); c.width = 620; c.height = 820; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 620, 820); g.fillStyle = '#10B981'; g.fillRect(0, 0, 620, 70);
    g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText('YCDO Laboratory · test report (MOCK)', 24, 44);
    g.fillStyle = '#0F172A'; g.font = 'bold 18px Arial'; g.fillText(who, 24, 120); g.font = '16px Arial';
    String(title).match(/.{1,52}(\s|$)/g).forEach((l, i) => g.fillText(l.trim(), 24, 160 + i * 24));
    g.fillStyle = '#64748B'; g.fillText('This is generated mock data for testing.', 24, 780);
    return new Promise((r) => c.toBlob(r, 'image/png'));
  }
  const dataUrlToBlob = async (u) => (await fetch(u)).blob();

  /* ── dashboard ────────────────────────────────────────── */
  function dashboard(centreId) {
    const sel = centreId && centreId !== 'all' ? centreId : 'all';
    const list = admissions.filter((a) => sel === 'all' || a.centreId === sel);
    const adm = list.filter((a) => a.status === 'ADMITTED'); const dis = list.filter((a) => a.status === 'DISCHARGED');
    const pol = (l) => l.filter((a) => a.source === 'POLICE').length;
    const byYearK = {}; const byYear = {}; const bySource = {}; const byStation = {}; const byPlaceType = {}; const byPlace = {}; const bySubstance = {}; const byAge = {}; const byMonth = {}; const byOutcome = {};
    for (const a of list) {
      const y = String(new Date(a.admittedAt).getFullYear());
      byYearK[y] = byYearK[y] || { total: 0, police: 0 }; byYearK[y].total++; if (a.source === 'POLICE') byYearK[y].police++;
      inc(byYear, y); inc(bySource, a.source); inc(bySubstance, a.substance); inc(byAge, ageGroupOf(patientOf(a).age)); inc(byMonth, a.admittedAt.slice(0, 7));
      if (a.policeStationId) inc(byStation, a.policeStationId);
      if (a.pickupPlaceId) { const p = places.find((x) => x.id === a.pickupPlaceId); inc(byPlaceType, p.type); inc(byPlace, p.id); }
      if (a.status === 'DISCHARGED') inc(byOutcome, a.outcome);
    }
    const incomplete = (a) => { const p = patientOf(a); return !p.photo || !p.thumbTemplate; };
    const in30 = (d) => d && now() - new Date(d) <= 30 * DAY;
    const centre = sel === 'all' ? ALL_CENTRE : META.centres.find((c) => c.id === sel);
    return {
      centre: { id: centre.id, name: centre.name, area: centre.area, phone: centre.phone, establishedAt: centre.establishedAt },
      kpis: { underCare: adm.length, underCarePolice: pol(adm), treated: list.length, treatedPolice: pol(list), byYear: byYearK, discharged: dis.length,
        completed: dis.filter((a) => a.outcome === 'PROGRAMME_COMPLETED').length,
        followDue: dis.reduce((s, a) => s + followDue(a), 0), followAttended: dis.reduce((s, a) => s + a.followUps.filter((f) => f.status === 'ATTENDED').length, 0),
        photoThumbPending: adm.filter(incomplete).length, admitted30: list.filter((a) => in30(a.admittedAt)).length, discharged30: dis.filter((a) => in30(a.dischargedAt)).length },
      byCentre: META.centres.map((c) => ({ id: c.id, name: c.name, underCare: admissions.filter((a) => a.centreId === c.id && a.status === 'ADMITTED').length, treated: admissions.filter((a) => a.centreId === c.id).length })),
      byYear: Object.entries(byYear).sort(), bySource: top(bySource),
      byStation: top(byStation).map(([id, count]) => ({ ...stationRef(id), count })),
      byPlaceType: top(byPlaceType), byPlace: top(byPlace).map(([id, count]) => ({ ...placeRef(id), count })),
      bySubstance: top(bySubstance), byAge: AGE_LABELS.map(([k, l]) => [l, byAge[k] || 0]), byMonth: Object.entries(byMonth).sort(), byOutcome: top(byOutcome),
      needsAction: adm.filter((a) => !a.reports.length || incomplete(a)).sort(byDateDesc).map(row),
      underCareRows: adm.sort(byDateDesc).map(row),
    };
  }

  function listAdmissions(q) {
    let l = admissions.slice();
    const eq = (k, f) => { if (q[k]) l = l.filter(f); };
    eq('centreId', (a) => q.centreId === 'all' || a.centreId === q.centreId);
    eq('status', (a) => a.status === q.status); eq('source', (a) => a.source === q.source);
    eq('policeStationId', (a) => a.policeStationId === q.policeStationId); eq('pickupPlaceId', (a) => a.pickupPlaceId === q.pickupPlaceId);
    eq('placeType', (a) => (placeRef(a.pickupPlaceId) || {}).type === q.placeType); eq('substance', (a) => a.substance === q.substance);
    eq('year', (a) => String(new Date(a.admittedAt).getFullYear()) === String(q.year)); eq('month', (a) => a.admittedAt.slice(0, 7) === q.month);
    eq('ageGroup', (a) => ageGroupOf(patientOf(a).age) === q.ageGroup); eq('outcome', (a) => a.outcome === q.outcome); eq('gender', (a) => patientOf(a).gender === q.gender);
    if (q.q) { const s = String(q.q).toLowerCase(); l = l.filter((a) => { const p = patientOf(a); return [p.name, p.fatherName, p.cnic, a.fileNo, p.patientNo, a.policeReferralNo].some((v) => String(v || '').toLowerCase().includes(s)); }); }
    l.sort(byDateDesc);
    const page = Math.max(1, Number(q.page) || 1); const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
    return { total: l.length, page, pageSize, rows: l.slice((page - 1) * pageSize, page * pageSize).map(row) };
  }

  /* ── router ───────────────────────────────────────────── */
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  on('POST', '/auth/login', ({ body }) => {
    const u = users.find((x) => x.email === String(body.email || '').toLowerCase());
    if (!u || String(body.password || '').length < 6 || !u.isActive) fail(401, 'Invalid credentials');
    if (u.roles.includes('SUPER_ADMIN')) { const id = uid('otp'); challenges[id] = u.id; return { requiresOtp: true, challengeId: id, message: 'A verification code was sent to s*****n@ycdo.test (mock code: 123456)', expiresInSeconds: 600 }; }
    const t = uid('tok'); tokens[t] = u.id; u.lastLogin = iso(now());
    return { access_token: t, user: { id: u.id, email: u.email, role: u.role, roles: u.roles } };
  });
  on('POST', '/auth/verify-otp', ({ body }) => {
    const uidv = challenges[body.challengeId]; if (!uidv || body.otp !== '123456') fail(401, 'Invalid or expired code');
    delete challenges[body.challengeId]; const u = users.find((x) => x.id === uidv); const t = uid('tok'); tokens[t] = u.id;
    return { access_token: t, user: { id: u.id, email: u.email, role: u.role, roles: u.roles } };
  });
  on('POST', '/auth/resend-otp', ({ body }) => { if (!challenges[body.challengeId]) fail(401, 'Invalid or expired OTP challenge'); return { requiresOtp: true, challengeId: body.challengeId, message: 'A new code was sent (mock code: 123456)', expiresInSeconds: 600 }; });

  on('GET', '/drh/me', ({ u }) => ({ id: u.id, email: u.email, name: u.name, designation: u.designation, roles: u.roles, canWrite: canWriteU(u), isAdmin: isAdminU(u), centreIds: canWriteU(u) ? writeCentres(u) : [] }));
  on('GET', '/drh/meta', () => clone(META));
  on('GET', '/drh/dashboard', ({ query }) => dashboard(query.centreId));
  on('GET', '/drh/admissions', ({ query }) => listAdmissions(query));

  on('GET', '/drh/police-stations', ({ query }) => {
    const q = String(query.q || '').toLowerCase();
    return stations.filter((s) => s.active && (!q || s.name.toLowerCase().includes(q) || String(s.area || '').toLowerCase().includes(q)))
      .map((s) => ({ id: s.id, name: s.name, area: s.area, phone: s.phone, admissions: admissions.filter((a) => a.policeStationId === s.id).length }))
      .sort((a, b) => (q ? Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) : 0) || b.admissions - a.admissions || a.name.localeCompare(b.name));
  });
  on('POST', '/drh/police-stations', ({ u, body }) => {
    needWrite(u);
    const name = String(body.name || '').trim(); if (name.length < 2) fail(400, 'Enter the station name');
    if (!body.force) { const sim = stations.filter((s) => similar(s.name, name)); if (sim.length) fail(409, 'A police station with a very similar name already exists', { similar: sim.map((s) => ({ id: s.id, name: s.name, area: s.area })) }); }
    const s = { id: uid('ps'), name, area: body.area || null, phone: body.phone || null, active: true }; stations.push(s);
    return { id: s.id, name: s.name, area: s.area, phone: s.phone, admissions: 0 };
  });
  on('GET', '/drh/police-stations/:id', ({ params }) => {
    const s = stations.find((x) => x.id === params.id); if (!s) fail(404, 'Police station not found');
    const l = admissions.filter((a) => a.policeStationId === s.id).sort(byDateDesc);
    const pc = {}; l.forEach((a) => inc(pc, a.pickupPlaceId));
    return { id: s.id, name: s.name, area: s.area, phone: s.phone, stats: { total: l.length, underCare: l.filter((a) => a.status === 'ADMITTED').length, discharged: l.filter((a) => a.status === 'DISCHARGED').length },
      places: top(pc).filter(([id]) => id && id !== 'null').map(([id, count]) => ({ ...placeRef(id), count })), admissions: l.map(row) };
  });
  on('GET', '/drh/places', ({ query }) => {
    const q = String(query.q || '').toLowerCase();
    return places.filter((p) => p.active && (!query.type || p.type === query.type) && (!q || p.name.toLowerCase().includes(q) || String(p.area || '').toLowerCase().includes(q)))
      .map((p) => ({ id: p.id, type: p.type, name: p.name, area: p.area, policeStation: stationRef(p.policeStationId), admissions: admissions.filter((a) => a.pickupPlaceId === p.id).length }))
      .sort((a, b) => b.admissions - a.admissions || a.name.localeCompare(b.name));
  });
  on('POST', '/drh/places', ({ u, body }) => {
    needWrite(u);
    const name = String(body.name || '').trim(); if (name.length < 2) fail(400, 'Enter the name of the place');
    if (!META.placeTypes.includes(body.type)) fail(400, 'Choose the type of place');
    if (!body.force) { const sim = places.filter((p) => similar(p.name, name)); if (sim.length) fail(409, 'A place with a very similar name already exists', { similar: sim.map((p) => ({ id: p.id, name: p.name, area: p.area, type: p.type })) }); }
    const p = { id: uid('pl'), type: body.type, name, area: body.area || null, policeStationId: body.policeStationId || null, active: true }; places.push(p);
    return { id: p.id, type: p.type, name: p.name, area: p.area, policeStation: stationRef(p.policeStationId), admissions: 0 };
  });
  on('GET', '/drh/places/:id', ({ params }) => {
    const p = places.find((x) => x.id === params.id); if (!p) fail(404, 'Place not found');
    const l = admissions.filter((a) => a.pickupPlaceId === p.id).sort(byDateDesc);
    const sc = {}; l.forEach((a) => inc(sc, a.policeStationId));
    return { id: p.id, type: p.type, name: p.name, area: p.area, policeStation: stationRef(p.policeStationId), stats: { total: l.length, underCare: l.filter((a) => a.status === 'ADMITTED').length },
      stations: top(sc).map(([id, count]) => ({ ...stationRef(id), count })), admissions: l.map(row) };
  });

  on('GET', '/drh/patients/lookup', ({ query }) => {
    const cnic = String(query.cnic || '').trim(); if (!/^\d{5}-\d{7}-\d$/.test(cnic)) fail(400, 'CNIC must be in the format 12345-1234567-1');
    const p = patients.find((x) => x.cnic === cnic); if (!p) return { patient: null, openAdmission: null };
    const open = admissions.find((a) => a.patientId === p.id && a.status === 'ADMITTED');
    return { patient: fullPatient(p), openAdmission: open ? row(open) : null };
  });
  on('GET', '/drh/thumbs', () => patients.filter((p) => p.thumbTemplate).map((p) => ({ id: p.id, template: p.thumbTemplate })));
  on('GET', '/drh/patients/:id/photo', async ({ params }) => {
    const p = patients.find((x) => x.id === params.id); if (!p || !p.photo) fail(404, 'No photo');
    if (p.photo === 'gen') return genImage(p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join(''), 300, 400, ['#A7F3D0', '#BFDBFE', '#FDE68A', '#DDD6FE', '#FBCFE8'][p.patientNo.slice(-1) % 5]);
    return dataUrlToBlob(p.photo);
  });
  on('GET', '/drh/patients/:id', ({ params }) => {
    const p = patients.find((x) => x.id === params.id); if (!p) fail(404, 'Patient not found');
    return { ...fullPatient(p), admissions: admissions.filter((a) => a.patientId === p.id).sort(byDateDesc).map(row) };
  });
  on('PATCH', '/drh/patients/:id/biometrics', ({ u, params, body }) => {
    const p = patients.find((x) => x.id === params.id); if (!p) fail(404, 'Patient not found');
    needWrite(u);
    const open = admissions.find((a) => a.patientId === p.id && a.status === 'ADMITTED') || admissions.filter((a) => a.patientId === p.id).sort(byDateDesc)[0];
    if (open) needWrite(u, open.centreId);
    if (body.thumbTemplate) { const other = patients.find((x) => x.id !== p.id && x.thumbTemplate === body.thumbTemplate); if (other) fail(409, `This thumb is already enrolled for ${other.name} (${other.patientNo})`); }
    if (body.photo) { if (!/^data:image\/jpeg;base64,/.test(body.photo)) fail(400, 'Photo must be a JPEG data URL'); p.photo = body.photo; p.photoAt = iso(now()); if (open) ev(open, p.photoAt, 'Photo updated', null, u.name); }
    if (body.thumbTemplate) { p.thumbTemplate = body.thumbTemplate; p.thumbAt = iso(now()); p.thumbDevice = body.thumbDevice || null; if (open) ev(open, p.thumbAt, 'Thumb enrolled', body.thumbDevice || null, u.name); }
    return fullPatient(p);
  });

  on('POST', '/drh/admissions', ({ u, body }) => {
    needWrite(u, body.centreId);
    if (!META.centres.some((c) => c.id === body.centreId)) fail(400, 'Choose the centre');
    let p = body.patientId ? patients.find((x) => x.id === body.patientId) : null;
    if (body.patientId && !p) fail(400, 'Patient not found');
    if (!p) {
      const np = body.patient || {};
      if (!/^\d{5}-\d{7}-\d$/.test(String(np.cnic || ''))) fail(400, 'CNIC is required in the format 12345-1234567-1');
      if (!np.name || !np.fatherName) fail(400, 'Patient name and father name are required');
      const ex = patients.find((x) => x.cnic === np.cnic);
      if (ex) p = ex;
    }
    if (p) { const open = admissions.find((a) => a.patientId === p.id && a.status === 'ADMITTED'); if (open) fail(409, `${p.name} already has an open admission (${open.fileNo})`); }
    const g = body.guardians || [];
    if (g.length < 2 || g.slice(0, 2).some((x) => !x.name || !/^0\d{10}$/.test(String(x.phone || '').replace(/\D/g, '')))) fail(400, 'Two guardians with phone numbers are required');
    if (!['POLICE', 'FAMILY', 'REFERRAL'].includes(body.source)) fail(400, 'Choose the source');
    if (body.source === 'POLICE') {
      if (!body.policeReferralNo) fail(400, 'Police referral number is required for a police case');
      if (!stations.some((s) => s.id === body.policeStationId)) fail(400, 'Police station is required for a police case');
      if (!body.officerName) fail(400, 'Officer name is required for a police case');
      if (!places.some((x) => x.id === body.pickupPlaceId)) fail(400, 'Pick-up place is required for a police case');
    }
    const needPhoto = !p || !p.photo; const needThumb = !p || !p.thumbTemplate;
    if (needPhoto && !body.photo) fail(400, 'Photo is required');
    if (needThumb && !body.thumbTemplate) fail(400, 'Thumb is required');
    if (body.thumbTemplate) { const other = patients.find((x) => x.thumbTemplate === body.thumbTemplate && (!p || x.id !== p.id)); if (other) fail(409, `This thumb is already enrolled for ${other.name} (${other.patientNo})`); }
    const at = iso(now());
    if (!p) { const np = body.patient; p = addPatient({ name: np.name, fatherName: np.fatherName, gender: np.gender || 'MALE', age: Number(np.age) || null, cnic: np.cnic, phone: np.phone || '', address: np.address || '', area: np.area || '' }); }
    if (body.photo) { p.photo = body.photo; p.photoAt = at; }
    if (body.thumbTemplate) { p.thumbTemplate = body.thumbTemplate; p.thumbAt = at; p.thumbDevice = body.thumbDevice || null; }
    const a = addAdmission({ centreId: body.centreId, patientId: p.id, admittedAt: at, source: body.source, substance: body.substance || null, useYears: body.useYears ?? null, bed: body.bed || '',
      policeReferralNo: body.policeReferralNo || null, policeStationId: body.policeStationId || null, pickupPlaceId: body.pickupPlaceId || null,
      officer: { name: body.officerName || null, rank: body.officerRank || null, phone: body.officerPhone || null }, referredBy: body.referredBy || null, guardians: g.slice(0, 2) });
    ev(a, at, body.source === 'POLICE' ? 'Brought in by police — admitted as a patient' : body.source === 'REFERRAL' ? 'Admitted on referral' : 'Admitted — brought by family',
      body.source === 'POLICE' ? `Referral ${a.policeReferralNo} · ${stationRef(a.policeStationId).name} · found at ${placeRef(a.pickupPlaceId).name}` : body.referredBy || `Guardian: ${g[0].name} (${g[0].relation})`, u.name);
    if (body.photo || body.thumbTemplate) ev(a, at, [body.photo && 'Photo', body.thumbTemplate && 'thumb'].filter(Boolean).join(' and ') + ' captured at registration', null, u.name);
    return file(a);
  });
  const admOr404 = (id) => { const a = admissions.find((x) => x.id === id); if (!a) fail(404, 'Admission not found'); return a; };
  on('GET', '/drh/admissions/:id', ({ params }) => file(admOr404(params.id)));
  on('POST', '/drh/admissions/:id/discharge', ({ u, params, body }) => {
    const a = admOr404(params.id); needWrite(u, a.centreId);
    if (a.status !== 'ADMITTED') fail(409, 'Already discharged');
    if (!META.outcomes.some((o) => o.value === body.outcome)) fail(400, 'Choose the outcome');
    a.status = 'DISCHARGED'; a.dischargedAt = iso(now()); a.outcome = body.outcome;
    ev(a, a.dischargedAt, 'Discharged', META.outcomes.find((o) => o.value === body.outcome).label + (body.note ? ' · ' + body.note : ''), u.name);
    return file(a);
  });
  on('POST', '/drh/admissions/:id/follow-ups', ({ u, params, body }) => {
    const a = admOr404(params.id); needWrite(u, a.centreId);
    if (a.status !== 'DISCHARGED') fail(400, 'Follow-up is recorded after discharge');
    if (!['ATTENDED', 'MISSED'].includes(body.status)) fail(400, 'Status must be ATTENDED or MISSED');
    const weekNo = body.weekNo || (Math.max(0, ...a.followUps.map((f) => f.weekNo)) + 1);
    if (a.followUps.some((f) => f.weekNo === weekNo)) fail(409, `Week ${weekNo} is already recorded`);
    a.followUps.push({ id: uid('fu'), weekNo, status: body.status, visitDate: body.visitDate, note: body.note || null, recordedAt: iso(now()), recordedBy: u.name });
    ev(a, iso(now()), `Weekly follow-up · week ${weekNo} ${body.status === 'ATTENDED' ? 'attended' : 'missed'}`, body.note || null, u.name);
    return file(a);
  });
  on('POST', '/drh/admissions/:id/events', ({ u, params, body }) => {
    const a = admOr404(params.id); needWrite(u, a.centreId);
    if (!body.title) fail(400, 'Title is required');
    ev(a, iso(now()), String(body.title).slice(0, 120), body.body ? String(body.body).slice(0, 500) : null, u.name);
    return file(a);
  });
  on('POST', '/drh/admissions/:id/reports', ({ u, params, form }) => {
    const a = admOr404(params.id); needWrite(u, a.centreId);
    const f = form && form.get('file');
    if (!f || !f.size) fail(400, 'Choose the report file');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)) fail(400, 'Only PDF, JPG, PNG or WEBP files');
    if (f.size > 10 * 1024 * 1024) fail(413, 'File is larger than 10 MB');
    const testName = String(form.get('testName') || '').trim(); const testDate = String(form.get('testDate') || '');
    if (!testName || !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) fail(400, 'Test name and test date are required');
    const r = { id: uid('rep'), testName, testDate, resultNote: form.get('resultNote') || null, fileName: f.name, mimeType: f.type, sizeBytes: f.size, uploadedAt: iso(now()), uploadedBy: u.name };
    a.reports.push(r); reportFiles[r.id] = { blob: f };
    ev(a, r.uploadedAt, 'Test report uploaded', testName + (r.resultNote ? ' · ' + r.resultNote : ''), u.name);
    return file(a);
  });
  on('GET', '/drh/reports/:id/content', ({ params }) => {
    const rf = reportFiles[params.id]; if (!rf) fail(404, 'Report not found');
    if (rf.blob) return rf.blob;
    return genReport(rf.gen, patientOf(admissions.find((a) => a.patientId === rf.patient)).name);
  });

  on('GET', '/drh/accounts', ({ u }) => { if (!isAdminU(u)) fail(403, 'Forbidden'); return users.filter((x) => x.role === 'DRH_STAFF' || x.role === 'POLICE_VIEWER').map((x) => ({ id: x.id, email: x.email, name: x.name, designation: x.designation, role: x.role, centreIds: x.centreIds, isActive: x.isActive, lastLogin: x.lastLogin, password: x.plain || 'Mock1234pw', passwordChangedAt: x.pwAt || null })); });
  on('POST', '/drh/accounts', ({ u, body }) => {
    if (!isAdminU(u)) fail(403, 'Forbidden');
    const email = String(body.email || '').toLowerCase();
    if (users.some((x) => x.email === email)) fail(409, 'An account with this email already exists');
    if (!['DRH_STAFF', 'POLICE_VIEWER'].includes(body.role)) fail(400, 'Role must be DRH_STAFF or POLICE_VIEWER');
    if (body.password && String(body.password).length < 8) fail(400, 'Password must be at least 8 characters');
    const x = { plain: body.password || ('Mk' + Math.random().toString(36).slice(2, 8) + '7'), pwAt: new Date().toISOString(), id: uid('u'), email, name: body.name, designation: body.designation || null, role: body.role, roles: [body.role], centreIds: body.role === 'DRH_STAFF' ? body.centreIds || [] : [], isActive: true, lastLogin: null };
    users.push(x); return { id: x.id, email: x.email, name: x.name, role: x.role, centreIds: x.centreIds, isActive: true, lastLogin: null };
  });
  on('PATCH', '/drh/accounts/:id', ({ u, params, body }) => {
    if (!isAdminU(u)) fail(403, 'Forbidden');
    const x = users.find((y) => y.id === params.id); if (!x) fail(404, 'Account not found');
    if (body.name != null) x.name = body.name; if (body.designation != null) x.designation = body.designation;
    if (body.centreIds) x.centreIds = body.centreIds; if (body.isActive != null) x.isActive = !!body.isActive;
    if (body.password && String(body.password).length < 8) fail(400, 'Password must be at least 8 characters');
    if (body.password) { x.plain = body.password; x.pwAt = new Date().toISOString(); }
    if (x.isActive === false) for (const [t, id] of Object.entries(tokens)) if (id === x.id) delete tokens[t];
    return { id: x.id, email: x.email, name: x.name, role: x.role, centreIds: x.centreIds, isActive: x.isActive, lastLogin: x.lastLogin };
  });

  async function handle(method, path, opts) {
    await sleep(120 + Math.random() * 180);
    const r = routes.find((x) => x.method === method && x.re.test(path));
    if (!r) fail(404, `Mock: no route ${method} ${path}`);
    const params = path.match(r.re).groups || {};
    const ctx = { params, query: opts.query || {}, body: opts.body || {}, form: opts.form || null };
    if (!path.startsWith('/auth/')) ctx.u = auth(opts.token);
    const out = await r.fn(ctx);
    if (opts.blob) return out;
    return out instanceof Blob ? out : clone(out);
  }

  window.HMS_MOCK = {
    handle,
    demoUsers: users.map((u) => ({ email: u.email, name: u.name, label: { DRH_STAFF: u.centreIds.length > 1 ? 'DRH staff · both centres' : 'DRH staff · Gulgasht', POLICE_VIEWER: 'Police · view only', IT_ADMIN: 'IT admin · accounts', SUPER_ADMIN: 'Super admin · OTP 123456' }[u.role] })),
  };
})();

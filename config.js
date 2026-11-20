/* YCDO HMS (Phase 0: DRH registration + police dashboard) - runtime configuration.
   No secrets here: this file is served to every browser. */
(function () {
  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const params = new URLSearchParams(location.search);
  window.HMS_CONFIG = Object.freeze({
    apiBase: local ? 'http://localhost:3000' : 'https://hrms-api.ycdo.org.pk',
    /* Local fingerprint service on the centre PC (bridge/fp-bridge.py). */
    bridgeUrl: 'http://127.0.0.1:8790',
    /* In-memory API for testing the screens without the backend: only on localhost with ?mock=1. */
    mock: local && params.get('mock') === '1',
    tokenKey: 'hms-token',
  });
})();

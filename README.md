# YCDO HMS web (Phase 0)

> **Handover:** read [`HANDOVER.md`](HANDOVER.md) first. This repo is a copy; the live HMS is built and deployed from `QaisarWaheed/ycdo-management-system` (`main`).

Web app for the two Police and YCDO DRH centres (Gulgasht, Rasheedabad): patient registration with photo and thumb, patient files, test reports, discharge, weekly follow-ups, and the police dashboard. Served at https://hms.ycdo.org.pk; the API is https://hrms-api.ycdo.org.pk (repo `ycdo-hms-backend`).

Static files only (vanilla JS, no build step), served by nginx (`Dockerfile`, `nginx.conf`, `captain-definition` for CapRover).

## Run locally
```bash
python -m http.server 8766
```
- Against a local API on port 3000: http://localhost:8766
- Mock data, no server: http://localhost:8766/?mock=1 (any password of 6+ characters; Super Admin OTP 123456)

## Fingerprint reader on the centre PCs
`bridge/` holds the local fingerprint service for the ZKTeco Live10R (needs ZKFinger SDK 5.3 and Python 3). See `bridge/README.md`.

The earlier reception/pharmacy prototype that lived in this repo is in the git history.

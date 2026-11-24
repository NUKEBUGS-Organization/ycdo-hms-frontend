# YCDO HMS (Drug Rehabilitation) handover (24 November 2026)

Written for the developer taking over HMS and for the Claude Code sessions they run.

**Where the live code is.** This repo is a copy. HMS is built and deployed from the main repo **QaisarWaheed/ycdo-management-system** (branch `main`), because HMS shares its API and database with HRMS and FMS. Every path below (`apps/api/...`, `apps/hms/...`, `docs/...`) is a path in that repo. In `ycdo-hms-backend` the same files are under `apps/api`; in `ycdo-hms-frontend` the `apps/hms` files are at the root. In the main repo read `CLAUDE.md` (standing rules for every session) and `docs/hms/HANDOVER.md` (the short HMS rules) first; the HRMS handover is `docs/handover/2026-11-17-hrms-handover.md` there.

No passwords, tokens or patient data are in this file. Ask the owner for access.

## Khulasa (Roman Urdu, team ke liye)

- **HMS** = https://hms.ycdo.org.pk. Police and YCDO DRH ke do centres (Gulgasht, Rasheedabad) ke patients ki registration, file, test reports, payment, discharge aur weekly follow-up.
- **Police** (CPO Multan, SPO Operations, Police Administrative) sirf dekh sakti hai: dashboard, thaane, jagahen (qabristan waghera), patient ki file aur reports. **Paise ki koi maloomat police ko kabhi nazar nahi aati.**
- HMS ki **API alag nahi**: wahi `hrms-api` hai jo HRMS aur FMS chalati hai. Isi liye API ki har tar mein teeno systems ka code hona zaroori hai.
- **hms-web** par sirf HMS ki tar jaye, HRMS ki tar sirf **hrms-web** par.
- Photo aur thumb registration ke waqt ya **24 ghante ke andar** patient file se.
- Payment: roz ka rate PKR 500 se 3,000; 1,000 se kam par Zakat ki manzoori; police case muft; raqam baqi ho to discharge sirf manzoori se.

## 1. Where things stand

- HMS is being built in phases from the clickable prototype (section 7, last item), which designs the whole hospital system. **Phase 0 = DRH only** and is live.

- `main` holds all HMS work: `69ef2cdd` (DRH module, police dashboard, payments) and `2ac82e4c` (photo and thumb within 24 hours). Later commits are HRMS/FMS.
- Live (checked 22 Nov 2026): `hrms-api` version 458, `hms-web` version 6. Staff are using it: real patients and payments are in the database.
- Checked live on 22 Nov: a police login sees no Payment menu, tab or amount, and `/drh/billing` and `/drh/accounts` return 403 for it. A staff login can register, sees the 24-hour wording and the Payments page.
- Not done yet: the fingerprint service on the two centre PCs (section 7).

## 2. System map

| Part | Where | Notes |
|---|---|---|
| API module | `apps/api/src/modules/drh` | `DrhController` (`/drh`), `DrhBillingController` (`/drh/billing`), `DrhAccountsController` (`/drh/accounts`). Services: `drh.service.ts`, `drh-billing.service.ts`, `drh-dashboard.service.ts`, file checks in `drh-files.ts`. |
| Role isolation | `apps/api/src/common/hms-access.util.ts`, `modules/auth/jwt-auth.guard.ts`, `auth.service.ts` | `DRH_STAFF` and `POLICE_VIEWER` may call only `/drh/*` and `/auth/me`, and must sign in with `client: 'hms'`. Only HMS roles, Super Admin and IT Admin may use the `hms` client. |
| Larger JSON body | `apps/api/src/common/drh-body-limit.ts` | 4 MB for `/drh` (webcam photo). See section 6, item 4 before touching it. |
| Database | `apps/api/prisma/schema.prisma`, migrations `20261121090000_hms_drh_phase0`, `20261121120000_hms_drh_billing` | Same PostgreSQL as HRMS/FMS (`hrms-postgres`). Tables `Drh*`. Photos and report files are stored in `DrhFile` (bytea) because `hrms-api` has no persistent volume. |
| Web app | `apps/hms` | Plain HTML/JS, no build step, served by nginx. `drh.js` (screens), `billing.js` (payments, staff only), `biometrics.js` (webcam and fingerprint), `api-mock.js` (local test data, never shipped). |
| Fingerprint service | `apps/hms/bridge` | `fp-bridge.py` on each centre PC, http://127.0.0.1:8790, ZKTeco Live10R via ZKFinger SDK 5.3.0.33. |
| API contract | `docs/hms/phase0-api.md` | Every route and body. |

Centres (seeded): Gulgasht `PDG1`, Rasheedabad `PDR1`. The migration also seeds 23 Multan police stations; staff add new stations and pick-up places in the app, with a warning for similar names.

Numbers: patient `YCDO-DRH-000001`; file `DRH-{centre}-{yymmdd}-{NNN}`; receipt `RCPT-{centre}-{yymmdd}-{NNN}` (Pakistan date).

## 3. The owner's business rules (do not change without asking)

Registration (owner, 20 and 22 Nov 2026):
- Required: CNIC (13 digits, one patient per CNIC; a returning person gets a new admission, not a new patient), two guardians with different phone numbers, and for a police case the referral number, police station, officer name and pick-up place.
- Photo and thumb: taken now if the patient is there, otherwise **due within 24 hours** from the patient file. Registration is not blocked. Dashboard and Needs action show "N h left" or "overdue". The duplicate-thumb check runs whenever a thumb is enrolled.
- One open admission per person. Programme 90 days. Weekly follow-up after discharge, 12 weeks.

Police (CPO Multan, SPO Operations, Police Administrative):
- All three identical, read-only, both centres.
- They see everything about patients (CNIC, phone, guardians, address, all test reports including HIV/HCV) so they can act. **They never see any money.** Money is only served by `/drh/billing`, whose controller does not list `POLICE_VIEWER`, and no money is written to the activity timeline, which police can read.

Payments (owner, 21 Nov 2026):
- Daily rate PKR 500 to 3,000. Bands: 500 to 999 Zakat-supported, 1,000 to 1,500 Category 3, 1,501 to 2,500 Category 2, 2,501 to 3,000 Private.
- Below 1,000: a Zakat request to the Founder, Chairman or President, three days to decide. The admission goes ahead. If rejected, the rate must be raised to 1,000 or more and the whole stay is charged at the new rate.
- Police cases are free; guardians may contribute voluntarily; discharge at PKR 0 is normal.
- Days billed: the admission day and the discharge day both count (Pakistan time).
- A non-police discharge with money due needs the approver's name (Founder, Chairman or President); the balance stays receivable.
- Methods: cash, bank transfer, JazzCash / Easypaisa, cheque.
- DRH staff see and enter money only for their own centre; IT sees both.

Accounts:
- HMS logins are separate from HRMS staff logins. YCDO IT creates them at https://hms.ycdo.org.pk/#/accounts. As in HRMS "User Passwords", the current password is stored for IT to show and change, and every change is in the audit log.
- Live accounts: three police logins (one per post) and one staff login per centre. The list is on the Accounts page.

## 4. Deploy

Push does not deploy. HMS ships in two CapRover apps:

| Tar | CapRover app | Live URL |
|---|---|---|
| `apps/api.tar.gz` (same API as HRMS/FMS) | `hrms-api` | https://hrms-api.ycdo.org.pk |
| `apps/hms.tar.gz` | `hms-web` | https://hms.ycdo.org.pk |

```bash
# from the repo root, after pulling the latest main
git archive --format=tar.gz -o apps/hms.tar.gz HEAD:apps/hms Dockerfile api.js app.js biometrics.js billing.js captain-definition config.js drh.js index.html nginx.conf styles.css
```

The api tar command is in `CLAUDE.md`. The hms `Dockerfile` copies a fixed list of files: add any new `.js` file to it, or it will not reach the live site (this happened once with `billing.js`).

After deploying, check:
- `https://hrms-api.ycdo.org.pk/drh/meta` answers **401** (route exists). **404 means the DRH module is missing from the API.**
- https://hms.ycdo.org.pk shows "YCDO HMS", and `drh.js` and `billing.js` load.
- HRMS login still works.

Rollback: CapRover → app → Deployment → Version History. Never "fix" one system by uploading an older api tar; it removes the other systems' newer work.

## 5. Local testing

- API: `cd apps/api && npx prisma generate && npx jest src/modules/drh src/modules/auth src/common`.
- Web without a backend: serve `apps/hms` on localhost (e.g. `python -m http.server 8766 --directory apps/hms`) and open `http://localhost:8766/?mock=1`. The mock has demo staff, police, IT and Super Admin logins (any password of 6+ characters; Super Admin OTP 123456) and sample patients. It only runs on localhost with `?mock=1`.
- Fingerprint without a reader: `python apps/hms/bridge/fp-bridge.py --simulate`.
- Live tests: no test patients on the live system without the owner's OK. They count on the police dashboard.

## 6. Incidents and lessons

1. **21 Nov ~11:40, DRH disappeared.** An HRMS api tar was built from a `main` that did not yet contain DRH and was deployed. All `/drh` routes went 404; HRMS kept working. Fixed by merging and redeploying. Lesson: before building any api tar, pull the latest `main` so it has HRMS, FMS and HMS together.
2. **21 Nov 11:47 PM, hms.ycdo.org.pk showed HRMS.** The HRMS frontend tar was uploaded to `hms-web` (version 4). Fixed on 22 Nov by deploying `apps/hms` as version 5. Lesson: `hms-web` gets only the `apps/hms` tar.
3. **Old apps that HMS does not use.** `hms-api-backend` (last deployed July 2026, returns 502) and its database `hms-postgres` / `ycdo_hms` are not part of the live HMS. Do not point HMS at them. `hms-postgres` still uses a weak default password (details with the owner); the owner decides whether that database holds anything before it is changed or removed. `hms-web-frontend` (reported on 22 Nov to serve an old HRMS build) is not used either.
4. **21 Nov, every POST body was empty for half an hour.** `app.use('/drh', json())` made Nest skip its global JSON parser, because Nest looks for a middleware named `jsonParser`. HRMS login broke. The fix wraps the parser in a function with another name; `drh-body-limit.spec.ts` guards it. Keep the wrapper.
5. **`POST /auth/register` was public** and accepted any role. Now Super Admin / IT Admin only. Open: check the users table for logins nobody created.

## 7. Open items

At the centres:
- Install the fingerprint service on both registration PCs: ZKFinger SDK 5.3.0.33 (reader unplugged), plug in the Live10R, Python 3 with "Add to PATH", copy `apps/hms/bridge`, run `start-fingerprint-service.bat` and add it to Startup. Allow the camera in Chrome. Details: `apps/hms/bridge/README.md`.

Owner's decisions still open:
- Correcting or voiding a wrong payment: allowed or not, and by whom. Today no payment can be removed.
- Test patients on the live system: allowed or not, and how they are removed.
- The weak `hms-postgres` password (section 6, item 3).
- Review the 23 seeded police stations.

Other:
- Training videos (captioned, mock data): `DRH-staff-guide.mp4`, `Police-view-guide.mp4`, kept by the owner outside the repo.
- Copies of HMS code: `NUKEBUGS-Organization/ycdo-hms-backend` (private, `apps/api`) and `ycdo-hms-frontend` (public, `apps/hms`). They are copies of this repo. Never push `apps/api/uploads/` (staff letters) or `apps/api/src/modules/daily-reports/fixtures/` (real hospital PDFs) there. The old history of the frontend repo contains a malware file `api/init` (commit `989c082` and earlier): do not check out those commits.
- **The prototype is the design of the whole HMS**: https://github.com/NUKEBUGS-Organization/ycdo-hms-prototype (private). Phase 0 built only its DRH part as real software; Reception, Doctor, Lab, Pharmacy, Central Store, Finance, HR Admin, Reports, Audit and the mobile screens are still to be built from it in later phases. Branch `main` is the full design; `demo-cpo-dc-nov-2026` is the build shown to the CPO and the DC (no money, two DRH branch tabs) and is for demos only. Where the live DRH differs from the prototype, the live system and the owner's decisions above win.

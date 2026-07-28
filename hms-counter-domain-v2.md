# YCDO HMS — Counter Domain (Reception + Pharmacy + Lab), v2

This supersedes the single-payment model in the original schema and prompts 4 & 8.
It reflects the flow confirmed with the business owner, cross-checked against the
legacy PHP where the code was readable.

---

## 1. The real flow

Three physical events, each its own token. There is NO "one token dispensed
multiple times" — every money-and-stock event is a distinct token.

1. **REGISTRATION** — reception takes a flat token fee (per branch, per category;
   NOT dependent on doctor). Issues a token. No medicine lines ever on this token.
   Patient goes to the doctor.

2. **PHARMACY (second turn)** — after the doctor prescribes (in the system), the
   patient returns to the same counter. Pharmacist dispenses the prescribed
   medicines on a PHARMACY token, priced at that day's price and category, stock
   moves. If the patient returns days later for more, that is a NEW PHARMACY
   token chained via previousTokenId — priced fresh at that day's prices.

3. **LAB** — doctor orders a test; patient pays at the same counter on a separate
   LAB token. Lab items are non-stock (tracksStock=false), so no stock movement.
   Lab payment status is NOT the lab technician's concern — they work off the slip.

Plus **REFERRAL** — intra-visit referral to another doctor (legacy referral_turn):
a new token chained to the original, small referral fee, minor stock draw.

## 2. Pricing — per branch

CORRECTION from v1: prices are per-branch, not on the catalogue item.
The same medicine costs different amounts at different branches.

- `Item` (catalogue, mirrored from org) holds NO prices — name, category,
  tracksStock only.
- `BranchItemPrice` holds the four tiers + purchase price PER branch PER item.
- A pharmacy line prices from THIS branch's row, at the token's category.
- One resolver, category → column, exhaustive switch. Snapshot onto the line.

The registration token fee is also per-branch, per-category — a separate small
price table keyed by branch + category (not per item).

## 3. Returned tokens

- Approval is verbal/off-system (admin calls finance/coordinator).
- The org authoriser FLAGS the token in the system (branch cannot flag its own).
- Full only. No partial return.
- Financial reversal is handled by the DAILY SUMMARY: flagged tokens are excluded
  from the revenue total and printed SEPARATELY below the table, so the
  organisation can audit refunds and prevent concealment.
- Stock IS returned: when the flag reaches the branch, a positive StockMovement
  (SALE_RETURN) per dispensed line restores branch stock.
- The token row is preserved (status REFUNDED), never deleted.
- The flag is set org-side and SYNCS DOWN to the branch (needed for the branch's
  own summary print and to trigger the stock reversal locally).

## 4. Receivables

Any money-taking token (PHARMACY, LAB) may be partially paid; the remainder
becomes a Receivable. (Legacy branch_pending_details — unique per token.)

## 5. Login / audit

Individual per-user login. Every write stamped with createdBy. (Legacy: role by
which $_SESSION key is set; new system: a real role column + user id.)

## 6. Sync — three inbound flows into the branch

1. Catalogue + per-branch prices (mirror, read-only)
2. Store → branch transfers (consumed by branch receiving)
3. Returned-token flags (trigger stock reversal + summary exclusion)

Everything else flows OUT (branch → VPS): tokens, lines, movements, receivables,
patients, receivings.

## 7. Explicitly deferred to later phases

- **Procedures** — a surgery/operation CASE FILE (patient file), consuming stock
  under per-procedure limits, with its own second turn and running balance.
  This is its own module, not a token type. Needs its own discovery pass.
  (Legacy: branch_procedure_pending_token, procedure_medicine_limits_admin,
  second_procedure_turn, expense_procedure.)
- **Cross-branch patient continuity** — local record + global identity + lazy
  matching on CNIC/phone. Capture CNIC/phone well NOW to enable it later.

---

## 8. Schema changes from v1

Keep from v1: Patient, TokenCounter, StockMovement, BranchStock,
StockReservation, Transfer/TransferLine, Receivable, Staff, ItemCategory.

CHANGE:

- **Item**: remove the four price columns and purchasePrice. Catalogue only.
- **NEW BranchItemPrice**: (branchId, itemId) unique; priceDeserving, pricePoor,
  priceMember, priceGeneral, purchasePrice. Mirrored per branch.
- **NEW RegistrationFee**: (branchId, category) unique; amount. The flat reg fee.
- **Token**: add `tokenType` enum (REGISTRATION | PHARMACY | LAB | REFERRAL);
  add `tokenFee` Decimal (the reg fee charged, 0 for non-registration);
  add refund flag fields: `refundFlagged` bool, `refundFlaggedBy`,
  `refundFlaggedAt`, `refundReason`. Keep previousTokenId, category, totals.
- **TokenLine**: unchanged shape, but unitPrice/purchasePrice now snapshot from
  BranchItemPrice, not Item. LAB lines carry no stock movement.
- **PrescriptionLine (NEW, optional this phase)**: the doctor's order, separate
  from the dispensed TokenLine. Only needed once the doctor screen is built; the
  pharmacy screen reads it to pre-fill. Can be deferred if the doctor screen is
  a later prompt.

---

## 9. Revised prompt set (replaces prompts 4 & 8)

### Prompt 4A — Per-branch pricing + registration fee

```
Revise the YCDO HMS pricing model to be per-branch.

Read prisma/schema.prisma. Currently the four price tiers live on Item. This is
wrong: prices differ per branch. Migrate:

1. Remove priceDeserving/pricePoor/priceMember/priceGeneral/purchasePrice from
   Item. Item becomes catalogue-only (name, category, tracksStock, barcode).
2. Add model BranchItemPrice: branchId, itemId, priceDeserving, pricePoor,
   priceMember, priceGeneral, purchasePrice. @@unique([branchId, itemId]).
   Mirrored from org, read-only at the branch.
3. Add model RegistrationFee: branchId, category (PatientCategory), amount.
   @@unique([branchId, category]). The flat registration token fee, per branch,
   per category. Not per item, not per doctor.
4. Update resolveUnitPrice to take a BranchItemPrice row (for this branch)
   instead of an Item. Keep it the single pricing authority, exhaustive switch.
5. Update the seed: seed BranchItemPrice rows for the seeded branch and
   RegistrationFee rows for all four categories.

Generate the migration. All money is Prisma.Decimal.
```

### Prompt 4B — Token types + registration save

```
Add token types to the YCDO HMS token model and a registration endpoint.

1. Add enum TokenType { REGISTRATION PHARMACY LAB REFERRAL } and a tokenType
   column on Token (required). Add tokenFee Decimal @default(0).
2. POST /api/tokens/registration
   Body: patientId OR newPatient{...}, doctorId, category.
   - tokenType = REGISTRATION. No lines. No stock.
   - tokenFee = RegistrationFee for (branchId, category). totalAmount = tokenFee.
   - Allocate tokenNo via TokenCounter (branch+date row lock).
   - amountReceived defaults to the fee (registration is always paid in full;
     reject partial). Return the token for the slip.
   This is a SEPARATE, simpler save than the pharmacy token. Registration never
   carries medicines.
```

### Prompt 4C — Pharmacy dispense token (revise existing POST /api/tokens)

```
Revise POST /api/tokens to be the PHARMACY dispense save (tokenType PHARMACY).

Same transaction structure as before (patient/counter/priced lines/stock SALE/
reservations CONSUMED/receivable), with these corrections:

- unitPrice/purchasePrice snapshot from BranchItemPrice for THIS branch, via
  resolveUnitPrice. Not from Item.
- previousTokenId links a return-visit purchase to the original token. Pricing
  is always current (new token = current prices, current category) — do not
  copy old prices.
- Partial payment allowed → Receivable (unlike registration, which is full only).
- Re-check availability in-transaction; 409 on conflict.
```

### Prompt 4D — Lab token

```
Add POST /api/tokens/lab (tokenType LAB).

- Lines reference lab-test items (tracksStock=false). NO stock movement, NO
  reservation — assert every line's item.tracksStock is false, reject otherwise.
- Priced at the patient's category from BranchItemPrice.
- Partial payment allowed → Receivable (a lab token can be pending).
- Own token number, may chain via previousTokenId to the registration token.
```

### Prompt 4E — Returned-token flag + stock reversal

```
Add returned-token handling.

1. Token gets: refundFlagged bool @default(false), refundFlaggedBy (uuid, the org
   authoriser), refundFlaggedAt, refundReason.
2. The flag is set org-side and arrives at the branch via sync (inbound). When a
   token transitions to refundFlagged=true at the branch, in ONE transaction:
   - set Token.status = REFUNDED
   - for each stock-tracked line, insert a positive StockMovement
     (reason SALE_RETURN, refType 'REFUND') and increment BranchStock
   - if a Receivable exists, set it WRITTEN_OFF
   Do NOT null amountReceived on the row — the DAILY SUMMARY handles revenue
   exclusion. Full return only; there is no partial.
3. This must be idempotent: applying the same flag twice must not double-restock.
   Guard on current status (only ACTIVE → REFUNDED does the reversal).
```

### Prompt 8 (revised) — Registration screen + dispense screen

```
Split the counter UI into two screens matching the real flow.

REGISTRATION screen (/registration):
  - Search/select or create patient (search-first, F2 for new — as speced).
  - Category segmented control. Doctor select.
  - Shows the registration fee for (branch, category), read from the API.
  - No cart, no item search. One action: SAVE & PRINT token.
  - Calls POST /api/tokens/registration.

DISPENSE screen (/dispense) — the current reception screen, corrected:
  - Open a patient's registration token (by token no or patient search).
  - Cart + item search + reservations exactly as speced.
  - Prices come from BranchItemPrice (per branch).
  - SAVE calls POST /api/tokens (PHARMACY). Partial payment → receivable fields.
  - A manual-entry path: pharmacist can add lines even if the doctor's
    prescription isn't in the system (paper fallback during outage).

Keep reception-screen-spec.md's layout, keyboard flow and reservation behaviour.
LAB and REFERRAL tokens are variants of the dispense screen — defer until the
two core screens work.
```

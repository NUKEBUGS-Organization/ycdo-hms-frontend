# Reception + Pharmacy Counter — Interaction Spec

## Who this is for

One person, standing, with a queue in front of them, doing the same task 200+
times a day. They will learn this screen in a week and then never look at it
again — they will look at the patient and type. Every design decision below
follows from that.

The measure of success is **seconds per token**, and the second measure is
**how obvious a mistake is before it commits**. Nothing else matters much.

---

## 1. Screen layout

A single full-height screen. No tabs, no wizard, no modal-per-step. The whole
token is visible at once because the receptionist needs to answer "what am I
charging this person" without navigating.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  YCDO Central Hospital        Counter 2 · Aslam        ● Online   14:32   │
├────────────────────────────────┬─────────────────────────────────────────┤
│                                │                                         │
│  PATIENT                       │   CART                                  │
│  ┌──────────────────────────┐  │   ┌───────────────────────────────────┐ │
│  │ 🔍 Search or F2 for new  │  │   │ Panadol 500mg                     │ │
│  └──────────────────────────┘  │   │ 1 × 3 × 5 = 15    @ 12.00   180.00│ │
│                                │   │                             [ × ] │ │
│  ── selected patient card ──   │   ├───────────────────────────────────┤ │
│  Nasreen Bibi                  │   │ Augmentin 625mg                   │ │
│  CH-00412 · F · 34y            │   │ 1 × 2 × 7 = 14    @ 45.00   630.00│ │
│  0300-1234567                  │   │                             [ × ] │ │
│  Last visit: 12 Jun 2026       │   └───────────────────────────────────┘ │
│                                │                                         │
│  CATEGORY                      │   ADD ITEM                              │
│  [Deserving][Poor][Member]     │   ┌───────────────────────────────────┐ │
│  [General]                     │   │ 🔍 Type medicine name…            │ │
│                                │   └───────────────────────────────────┘ │
│  DOCTOR                        │                                         │
│  [ Dr. Saeed Ahmed        ▾ ]  │                                         │
│                                │                                         │
├────────────────────────────────┴─────────────────────────────────────────┤
│  Total  810.00      Received [ 810.00 ]      Balance  0.00               │
│                                                                          │
│                                    [ F9 · SAVE & PRINT ]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Left column is *who and how much they pay*. Right column is *what they get*.
Bottom bar is money and the commit. That ordering matches the conversation
actually happening at the counter.

### Why the category selector is large and on the left

It changes every price on the screen. It is the single highest-consequence
field on the page and the legacy system got it wrong for years without anyone
noticing. It must be impossible to not see which tier is selected — big
segmented control, selected state in a strong colour, never a dropdown.

When it changes, every line in the cart re-prices immediately and visibly.

---

## 2. Keyboard flow

The receptionist should be able to complete a routine token without touching
the mouse. Full path:

| Key | Action |
|---|---|
| `F1` | Focus patient search |
| `F2` | New patient (opens inline form, not a modal) |
| `F3` | Focus item search |
| `F4` | Cycle patient category |
| `F6` | Focus "Received" amount |
| `F9` | Save & print |
| `Esc` | Close the open dropdown, or clear the current search box |
| `Ctrl+Del` | Abandon token (with confirm) |

Inside the **item search**:

| Key | Action |
|---|---|
| type | live search, results appear below after ~150ms debounce |
| `↑ ↓` | move through results |
| `Enter` | select item → focus jumps to dose field |
| `Esc` | close results, keep typed text |

Inside the **dose row** (dose / feed / days):

| Key | Action |
|---|---|
| `Tab` | dose → feed → days |
| `Enter` | commit line, reserve stock, return focus to item search |
| `Esc` | cancel this line, focus item search |

That loop — `type, Enter, 1, Tab, 3, Tab, 5, Enter` — is the hot path. It must
never be interrupted by a modal, a toast that steals focus, or a layout shift.

**Focus rule:** after any successful action, focus returns to the item search.
The receptionist's default state is "ready to add another medicine."

---

## 3. Reservations on screen

This is the part where the model has to be visible without being noisy.

### When a line is committed

`Enter` on the dose row does two things at once: adds the line to the cart
locally, and fires `POST /api/reservations`. The line appears **immediately** —
do not wait for the response. Optimistic, because the network is localhost-fast
and the receptionist should never wait on it.

If the reservation comes back `409`:
- the line turns red in place
- it shows `Only 2 available` inline, on the line, not in a toast
- the quantity field becomes editable in place
- the line **cannot** be included in a save until it is fixed or removed

The failure is attached to the thing that failed. Never a toast — toasts
disappear while the receptionist is looking at the patient.

### When a line is removed

`×` or `Del` on a focused line: remove from the cart, fire
`DELETE /api/reservations/:id`. Again optimistic — the row disappears at once.
Stock returns to availability at every other counter within their next poll.

### Availability display

Item search results show available quantity next to each item:

```
Panadol 500mg          Tablets      12.00 / 18.00 / 24.00 / 30.00     240 avail
Augmentin 625mg        Tablets      45.00 / 60.00 / 75.00 / 90.00       8 avail
Flagyl 400mg           Tablets      —  out of stock  —
```

- Prices shown are all four tiers, with the **currently selected tier bolded**.
  Seeing all four is useful — patients ask, and staff catch mis-set categories.
- Availability under 10 shows in amber. Zero shows greyed and is not
  selectable.
- Non-`tracksStock` items (consultation, lab tests) show no availability at
  all — not "0", not "∞", nothing. Absence is the correct signal.

### The 20-minute expiry

Do not put a countdown timer on screen. It creates anxiety and implies the
receptionist is racing something. Instead:

- If a cart has been idle **15 minutes**, show a quiet inline banner above the
  cart: *"This token has been open a while — holds expire in 5 minutes."*
- Any interaction (adding, removing, typing) refreshes the holds and clears
  the banner.
- If holds do expire, the banner turns amber: *"Stock holds released. Re-check
  availability before saving."* The lines stay in the cart. Nothing is deleted
  from under the receptionist. The save will re-validate anyway.

The reservation system's job is to be invisible when things are normal and
explicit when they are not.

---

## 4. The patient step

### Search-first, always

The search box is focused on page load. Typing a name, phone, or MR number
searches immediately. **New patient is the secondary action**, behind `F2` or a
button beside the search box.

This ordering is the entire fix for the legacy system's 2.47M patient rows.
When creating a new patient is easier than finding an existing one, staff will
always create. The screen must make finding easier.

### Duplicate guard

When creating a new patient, if the entered phone or CNIC already matches an
existing patient at this branch, show it inline before the save button:

```
⚠ Nasreen Bibi (CH-00412) has this phone number.
  [ Use existing patient ]    [ Create anyway ]
```

Not a blocker — sometimes a family shares a number. But it must be seen.

### Selected patient card

Once selected, the patient collapses into a compact card showing name, MR
number, gender, age, phone, and last visit date. Last visit matters: it tells
the receptionist whether this is a follow-up and prompts the "have you seen the
doctor before?" question naturally.

---

## 5. Money and commit

### The bottom bar

Three numbers, always visible, always current: **Total**, **Received**,
**Balance**.

- `Received` defaults to the full total. The common case is full payment and
  the receptionist should not have to type it.
- Changing `Received` to less than the total makes `Balance` show in amber and
  reveals the receivable fields (guardian name, phone, recommended by, promised
  date) inline beneath the bar.
- Balance is never negative. Entering more than the total is rejected at the
  input — there is no overpayment concept in this system.

### The save button

One button, `F9`, labelled with the action and the consequence: **SAVE &
PRINT**. It is disabled when:

- no patient is selected
- no doctor is selected
- the cart is empty
- any line is in an error state

Show the reason on hover/focus, not just a dead button.

### After save

Print fires immediately, without a dialogue if the browser allows it. The
screen resets to a fresh token with the item search focused. A small confirmed
line appears at the top: *"Token CH-124 saved · [Reprint]"* — persistent until
the next save, because the most common post-save need is reprinting a slip that
jammed.

**Do not** show a success modal. It costs a keystroke 200 times a day.

---

## 6. Failure states

| Situation | Behaviour |
|---|---|
| Branch server unreachable | Full-width red bar: *"Cannot reach server. Do not continue — your work will not be saved."* Save disabled. This is the one case that stops everything. |
| Save fails on a stock conflict | Stay on the screen. Highlight the offending line(s) in red with actual availability. Reservations remain ACTIVE, so the receptionist corrects and retries. Nothing is lost. |
| Save fails for any other reason | Same: stay, show the error, keep the cart. Never clear a cart on failure. |
| Printer fails | Token is already saved. Show the reprint action prominently. Never tie the save's success to the printer. |

The governing rule: **a receptionist must never lose typed work.** Everything
else is negotiable.

---

## 7. Explicitly out of scope for v1

- Doctor's own prescription screen (`select_by_doctor` in the legacy system)
- Lab test ordering and reporting
- Procedures and admissions
- Deserving-medicine allocation limits
- Fingerprint patient identification (the legacy local agent on 127.0.0.1:9100)

These are separate screens with separate flows. Getting the counter right
first is what makes the rest worth building.

---

## 8. Things worth arguing about

Flagging where I have made a call that could reasonably go the other way:

1. **Optimistic line adding.** I add the line before the reservation confirms.
   Faster, but means a red error line appears after the fact. The alternative —
   waiting ~30ms on localhost — is arguably fine and simpler. Worth trying both.

2. **No countdown timer.** I think a visible timer creates pressure and looks
   broken when it hits zero. Some staff may prefer knowing. Easy to add later
   if they ask; hard to remove once they rely on it.

3. **All four price tiers shown in search results.** More information density,
   and it helps catch a mis-set category. But it is four numbers per row on a
   screen that is already busy. Could be a hover or an expandable detail.

4. **Full-payment default.** If most patients at YCDO actually pay partially,
   this default is wrong and creates a receivable-shaped hole. Check the real
   ratio before building.

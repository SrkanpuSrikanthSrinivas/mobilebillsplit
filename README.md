# Family Mobile Split (T-Mobile)

One shared link. Upload a month's T-Mobile bill (PDF) and it parses every line,
splits fairly, tracks who's paid, and shows an all-months summary.

**Split rules**
- **Netflix** — a fixed amount (default $8.99, set in `lib/config.js`) is **deducted
  from the plan pool first**, then charged to the account holder, so only the holder
  bears it and everyone else's plan share drops.
- **Plan** — the remaining plan cost is split **equally across all 8 lines** (T-Mobile's
  uneven per-line prices are just how it spreads account discounts).
- **Device** — each person pays their own installment **net of their own promo
  credit**; never pooled. Negative = money back that month.
- **Usage** — one-time usage stays on the line that rang it up.
- **Account credits** — T-Mobile's account-level "Credits & adjustments" are detected
  automatically and shown with a per-credit **assign-to-person** dropdown. An assigned
  credit comes off that person's total; unassigned credits are flagged and not applied.

Verified against the Aug–Nov 2026 bills: every month's charges reconcile to the total due.

## Deploy (Vercel + Neon)
1. Create a Neon Postgres DB at https://neon.tech and copy the **pooled** connection
   string (host contains `-pooler`).
2. Push this folder to a GitHub repo.
3. Import it at https://vercel.com/new (Next.js auto-detected). Add one env var:
   `DATABASE_URL` = your Neon string (Production environment).
4. Deploy. Tables are created on first use. Share the site URL with everyone — the
   link is open: anyone can upload bills, view all families, and mark payments.

## Edit families / people
`lib/config.js` — `PEOPLE` (10-digit phone → name), `FAMILIES` (grouping + which
family is `holder`), `HOLDER`/`PAYER` (account holder = Netflix + collector).

## How parsing works
`lib/parseTmobileBill.mjs` (uses **unpdf**, serverless-safe) reads each line's Plans
and Total from the bill summary; a line's personal charge = Total − Plans (its device
net + usage). Plan total and bill total come from the Totals row; usage is phone-tagged;
Netflix's net charge is detected and assigned to the holder. Keyed by phone number, so
it keeps working as amounts change month to month. If a bill's line sums ever differ
from the printed total, the month view flags "check".

# AT&T Family Split

Upload each month's AT&T Mobility PDF and it automatically parses every line,
groups people into families, tracks who's paid, and gives each family a
read-only link — no manual math.

Tested against six real bills: month, account total, and every per-line total
extract correctly and reconcile to the penny.

## How it works

- **Organizer** opens the site, enters the organizer key, and uploads the bill PDF.
- The server parses it (`lib/parseAttBill.mjs`), stores per-line totals in Neon Postgres.
- Families are grouped per `lib/config.js`; the account holder's family shows as "covered."
- **Families** open a read-only link (`/share/<SHARE_TOKEN>`) and see their totals,
  the all-months summary, and who's paid.

## Deploy (Vercel + Neon)

1. **Create a Neon database** at https://neon.tech → copy the connection string
   (looks like `postgres://…@ep-….neon.tech/neondb?sslmode=require`).

2. **Push this folder to GitHub** (a new repo).

3. **Import the repo into Vercel** (https://vercel.com/new). Framework: Next.js
   (auto-detected). Before deploying, add three Environment Variables:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | your Neon connection string |
   | `ADMIN_KEY` | a long random string (only you know it) |
   | `SHARE_TOKEN` | a different long random string (goes in the family link) |

4. **Deploy.** Tables are created automatically on first use.

5. **Use it:**
   - Organizer dashboard: `https://your-app.vercel.app/` → enter `ADMIN_KEY` → upload bills.
   - Family link to share: `https://your-app.vercel.app/share/<SHARE_TOKEN>` (read-only).

## Run locally

```bash
cp .env.example .env      # fill in the three values
npm install
npm run dev               # http://localhost:3000
```

## Changing families / people

Edit `lib/config.js`:
- `PEOPLE` — line number (10 digits, no dots) → name.
- `FAMILIES` — group lines; mark the account holder's family `holder: true`.
- `PAYER` — the name shown as the Zelle recipient.

No database migration needed — grouping is applied at display time from the
stored per-line totals.

## Notes

- The parser keys everything off the phone number on each line, so it keeps
  working month to month even as amounts change.
- If a future bill's sum doesn't match AT&T's printed total, the month view
  flags it ("check") so you can eyeball that bill.
- Upload runs on the Node.js serverless runtime (set in `app/api/upload/route.js`).

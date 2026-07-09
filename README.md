# AT&T Family Split

One shared link for everyone. Upload a month's AT&T Mobility PDF and it parses
every line automatically, groups people into families, shows each family's total,
tracks who's paid, and gives an all-months summary — no manual math, no logins.

Tested against six real bills: month, account total, and every per-line total
extract correctly and reconcile to the penny.

## Deploy (Vercel + Neon)

1. **Create a Neon database** at https://neon.tech → copy the connection string
   (looks like `postgres://…@ep-….neon.tech/neondb?sslmode=require`).

2. **Push this folder to GitHub** (a new repo).

3. **Import the repo into Vercel** (https://vercel.com/new). Framework: Next.js
   (auto-detected). Add ONE environment variable:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | your Neon connection string |

4. **Deploy.** Tables are created automatically on first use.

5. **Share the site URL** (e.g. `https://your-app.vercel.app`) with everyone.
   Anyone with the link can upload bills, view all families, and mark payments.

## Run locally

```bash
cp .env.example .env      # paste your DATABASE_URL
npm install
npm run dev               # http://localhost:3000
```

## Changing families / people

Edit `lib/config.js`:
- `PEOPLE` — line number (10 digits, no dots) → name.
- `FAMILIES` — group lines; mark the account holder's family `holder: true`.
- `PAYER` — the name shown as the Zelle recipient.

Grouping is applied at display time from the stored per-line totals, so no
database change is needed when you edit this.

## How the parsing works

`lib/parseAttBill.mjs` uses **unpdf** (a serverless-safe PDF text extractor) to
pull, from each bill: the issue month, the account total, and every line's
"Total for <number>" amount. It keys off the phone number, so it keeps working
month to month as amounts change. If a bill's line-sum ever doesn't match AT&T's
printed total, the month view flags it with "check".

## Notes on access

There's no password — anyone with the URL can view and edit. That's intentional
for a small family group. If you later want it locked down, the simplest option
is Vercel's built-in password protection (Project → Settings → Deployment
Protection) or Vercel Authentication.

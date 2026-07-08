// lib/db.mjs — Neon Postgres access
import { neon } from "@neondatabase/serverless";

let _sql = null;
function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
const sql = (...args) => getSql()(...args);

let ready = null;
export async function ensureSchema() {
  if (ready) return ready;
  ready = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS bills (
        month text PRIMARY KEY,
        account text,
        account_total numeric,
        lines jsonb NOT NULL,
        uploaded_at timestamptz DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        month text NOT NULL,
        family_id text NOT NULL,
        paid boolean NOT NULL DEFAULT false,
        PRIMARY KEY (month, family_id)
      )`;
  })();
  return ready;
}

export async function upsertBill({ month, account, accountTotal, lines }) {
  await ensureSchema();
  await sql`
    INSERT INTO bills (month, account, account_total, lines)
    VALUES (${month}, ${account}, ${accountTotal}, ${JSON.stringify(lines)})
    ON CONFLICT (month) DO UPDATE
      SET account = EXCLUDED.account,
          account_total = EXCLUDED.account_total,
          lines = EXCLUDED.lines,
          uploaded_at = now()`;
}

export async function setPaid(month, familyId, paid) {
  await ensureSchema();
  await sql`
    INSERT INTO payments (month, family_id, paid)
    VALUES (${month}, ${familyId}, ${paid})
    ON CONFLICT (month, family_id) DO UPDATE SET paid = EXCLUDED.paid`;
}

export async function getAllData() {
  await ensureSchema();
  const bills = await sql`SELECT month, account, account_total, lines FROM bills ORDER BY month`;
  const pays = await sql`SELECT month, family_id, paid FROM payments`;
  const payments = {};
  for (const p of pays) {
    (payments[p.month] ||= {})[p.family_id] = p.paid;
  }
  const billMap = {};
  for (const b of bills) {
    billMap[b.month] = {
      account: b.account,
      accountTotal: Number(b.account_total),
      lines: b.lines, // { "2144043110": 32.77, ... }
    };
  }
  return { bills: billMap, payments };
}

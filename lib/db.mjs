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
  // ::jsonb forces a clean parse so the column always holds a JSON object
  await sql`
    INSERT INTO bills (month, account, account_total, lines)
    VALUES (${month}, ${account}, ${accountTotal}, ${JSON.stringify(lines)}::jsonb)
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

// jsonb can come back as an object OR a (possibly double-encoded) string
// depending on the driver — coerce to a plain { line: number } object.
function toLines(v) {
  let x = v;
  for (let i = 0; i < 2 && typeof x === "string"; i++) {
    try { x = JSON.parse(x); } catch { break; }
  }
  if (!x || typeof x !== "object") return {};
  const out = {};
  for (const k of Object.keys(x)) out[k] = Number(x[k]);
  return out;
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
      lines: toLines(b.lines),
    };
  }
  return { bills: billMap, payments };
}

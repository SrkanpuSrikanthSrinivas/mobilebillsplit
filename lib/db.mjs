// lib/db.mjs — Neon Postgres access (serverless HTTP driver)
import { neon } from "@neondatabase/serverless";

let _sql = null;
function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
const sql = (...a) => getSql()(...a);

let ready = null;
export async function ensureSchema() {
  if (ready) return ready;
  ready = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS bills (
        month text PRIMARY KEY,
        account text,
        plans_total numeric,
        bill_total numeric,
        netflix numeric DEFAULT 0,
        lines jsonb NOT NULL,
        credits jsonb DEFAULT '[]'::jsonb,
        uploaded_at timestamptz DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        month text NOT NULL, family_id text NOT NULL,
        paid boolean NOT NULL DEFAULT false,
        PRIMARY KEY (month, family_id)
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS credit_assignments (
        month text NOT NULL, credit_id text NOT NULL,
        person_id text,
        PRIMARY KEY (month, credit_id)
      )`;
    // self-migrate pre-existing bills table
    await sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS plans_total numeric`;
    await sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_total numeric`;
    await sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS netflix numeric DEFAULT 0`;
    await sql`ALTER TABLE bills ADD COLUMN IF NOT EXISTS credits jsonb DEFAULT '[]'::jsonb`;
  })();
  return ready;
}

export async function upsertBill({ month, account, plansTotal, billTotal, netflix, lines, credits }) {
  await ensureSchema();
  await sql`
    INSERT INTO bills (month, account, plans_total, bill_total, netflix, lines, credits)
    VALUES (${month}, ${account}, ${plansTotal}, ${billTotal}, ${netflix || 0}, ${JSON.stringify(lines)}::jsonb, ${JSON.stringify(credits || [])}::jsonb)
    ON CONFLICT (month) DO UPDATE
      SET account = EXCLUDED.account, plans_total = EXCLUDED.plans_total, bill_total = EXCLUDED.bill_total,
          netflix = EXCLUDED.netflix, lines = EXCLUDED.lines, credits = EXCLUDED.credits, uploaded_at = now()`;
}

export async function setPaid(month, familyId, paid) {
  await ensureSchema();
  await sql`
    INSERT INTO payments (month, family_id, paid) VALUES (${month}, ${familyId}, ${paid})
    ON CONFLICT (month, family_id) DO UPDATE SET paid = EXCLUDED.paid`;
}

export async function setCreditAssign(month, creditId, personId) {
  await ensureSchema();
  await sql`
    INSERT INTO credit_assignments (month, credit_id, person_id) VALUES (${month}, ${creditId}, ${personId})
    ON CONFLICT (month, credit_id) DO UPDATE SET person_id = EXCLUDED.person_id`;
}

function parseJson(v, fallback) {
  let x = v;
  for (let i = 0; i < 2 && typeof x === "string"; i++) { try { x = JSON.parse(x); } catch { break; } }
  return x && typeof x === "object" ? x : fallback;
}
function toLines(v) {
  const x = parseJson(v, {});
  const out = {};
  for (const k of Object.keys(x)) {
    const o = x[k] || {};
    out[k] = { plans: Number(o.plans || 0), total: Number(o.total || 0),
      personal: Number(o.personal || 0), usage: Number(o.usage || 0), device: Number(o.device || 0) };
  }
  return out;
}
function toCredits(v) {
  const x = parseJson(v, []);
  if (!Array.isArray(x)) return [];
  return x.map((c) => ({ id: String(c.id), label: String(c.label || "Credit"), amount: Number(c.amount || 0) }));
}

export async function getAllData() {
  await ensureSchema();
  const bills = await sql`SELECT month, account, plans_total, bill_total, netflix, lines, credits FROM bills ORDER BY month`;
  const pays = await sql`SELECT month, family_id, paid FROM payments`;
  const cas = await sql`SELECT month, credit_id, person_id FROM credit_assignments`;
  const payments = {};
  for (const p of pays) (payments[p.month] ||= {})[p.family_id] = p.paid;
  const creditAssign = {};
  for (const a of cas) (creditAssign[a.month] ||= {})[a.credit_id] = a.person_id;
  const billMap = {};
  for (const b of bills) {
    billMap[b.month] = {
      account: b.account, plansTotal: Number(b.plans_total), billTotal: Number(b.bill_total),
      netflix: Number(b.netflix || 0), lines: toLines(b.lines), credits: toCredits(b.credits),
    };
  }
  return { bills: billMap, payments, creditAssign };
}

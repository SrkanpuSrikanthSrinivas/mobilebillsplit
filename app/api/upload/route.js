import { NextResponse } from "next/server";
import { parseAttBill } from "../../../lib/parseAttBill.mjs";
import { upsertBill, getAllData } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseAttBill(buf);
  } catch (e) {
    return NextResponse.json({ error: "Could not read this PDF: " + e.message }, { status: 422 });
  }

  if (!parsed.month || parsed.accountTotal == null || parsed.lines.length === 0) {
    return NextResponse.json(
      { error: "This doesn't look like an AT&T Mobility bill (couldn't find the month, total, or line items)." },
      { status: 422 }
    );
  }

  const lines = {};
  for (const l of parsed.lines) lines[l.line] = { t: l.total, d: l.byod || 0 };

  // Write to the DB, and confirm the row is actually readable afterward.
  try {
    await upsertBill({ month: parsed.month, account: parsed.account, accountTotal: parsed.accountTotal, lines });
    const check = await getAllData();
    if (!check.bills[parsed.month]) {
      return NextResponse.json(
        { error: "Parsed OK but the saved bill wasn't found on read-back — the app is likely reading a different database than it wrote to. Check DATABASE_URL." },
        { status: 500 }
      );
    }
  } catch (e) {
    return NextResponse.json({ error: "Database write failed: " + e.message }, { status: 500 });
  }

  return NextResponse.json({
    month: parsed.month,
    accountTotal: parsed.accountTotal,
    reconciles: parsed.reconciles,
    sumOfLines: parsed.sumOfLines,
    lineCount: parsed.lines.length,
    stored: true,
  });
}

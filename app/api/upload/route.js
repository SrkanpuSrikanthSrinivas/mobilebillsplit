import { NextResponse } from "next/server";
import { parseTmobileBill } from "../../../lib/parseTmobileBill.mjs";
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
    parsed = await parseTmobileBill(buf);
  } catch (e) {
    return NextResponse.json({ error: "Could not read this PDF: " + e.message }, { status: 422 });
  }

  if (!parsed.month || parsed.plansTotal == null || parsed.billTotal == null || parsed.lineCount === 0) {
    return NextResponse.json(
      { error: "This doesn't look like a T-Mobile bill (couldn't find the month, totals, or line items)." },
      { status: 422 }
    );
  }

  try {
    await upsertBill(parsed);
    const check = await getAllData();
    if (!check.bills[parsed.month]) {
      return NextResponse.json(
        { error: "Parsed OK but the saved bill wasn't found on read-back — the app may be reading a different database than it wrote to. Check DATABASE_URL." },
        { status: 500 }
      );
    }
  } catch (e) {
    return NextResponse.json({ error: "Database write failed: " + e.message }, { status: 500 });
  }

  return NextResponse.json({
    month: parsed.month,
    plansTotal: parsed.plansTotal,
    billTotal: parsed.billTotal,
    netflix: parsed.netflix,
    lineCount: parsed.lineCount,
    creditsFound: (parsed.credits || []).length,
    reconciles: parsed.reconciles,
    stored: true,
  });
}

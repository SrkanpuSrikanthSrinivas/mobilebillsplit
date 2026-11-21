import { NextResponse } from "next/server";
import { upsertBill, getAllData } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The browser parses the PDF and posts the small result here (avoids the 4.5MB
// serverless upload limit — we only ever receive ~1KB of JSON).
export async function POST(req) {
  let parsed;
  try {
    parsed = await req.json();
  } catch (e) {
    return NextResponse.json({ error: "Expected JSON. Reload the page and try again." }, { status: 400 });
  }

  if (!parsed || !parsed.month || parsed.plansTotal == null || parsed.billTotal == null || !parsed.lines || !Object.keys(parsed.lines).length) {
    return NextResponse.json(
      { error: "This doesn't look like a T-Mobile bill (couldn't find the month, totals, or line items)." },
      { status: 422 }
    );
  }

  try {
    await upsertBill({
      month: parsed.month, account: parsed.account || "…----",
      plansTotal: Number(parsed.plansTotal), billTotal: Number(parsed.billTotal),
      netflix: Number(parsed.netflix || 0), lines: parsed.lines, credits: parsed.credits || [],
    });
    const check = await getAllData();
    if (!check.bills[parsed.month]) {
      return NextResponse.json({ error: "Saved but not found on read-back — the app may be reading a different database than it wrote to. Check DATABASE_URL." }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Database write failed: " + e.message }, { status: 500 });
  }

  return NextResponse.json({
    month: parsed.month, plansTotal: Number(parsed.plansTotal), billTotal: Number(parsed.billTotal),
    netflix: Number(parsed.netflix || 0), lineCount: Object.keys(parsed.lines).length,
    creditsFound: (parsed.credits || []).length, reconciles: !!parsed.reconciles, stored: true,
  });
}

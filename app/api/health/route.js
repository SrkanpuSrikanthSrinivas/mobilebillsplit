import { NextResponse } from "next/server";
import { getAllData } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dbHost = "unknown";
  try { dbHost = new URL(process.env.DATABASE_URL).host; } catch (e) {}
  try {
    const data = await getAllData();
    return NextResponse.json({
      ok: true,
      dbHost,
      billsCount: Object.keys(data.bills).length,
      months: Object.keys(data.bills).sort(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, dbHost, error: e.message }, { status: 500 });
  }
}

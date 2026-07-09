import { NextResponse } from "next/server";
import { setPaid } from "../../../lib/db.mjs";

export const runtime = "nodejs";

export async function POST(req) {
  const { month, familyId, paid } = await req.json();
  if (!month || !familyId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await setPaid(month, familyId, !!paid);
  return NextResponse.json({ ok: true });
}

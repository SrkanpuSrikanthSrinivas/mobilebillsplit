import { NextResponse } from "next/server";
import { setCreditAssign } from "../../../lib/db.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req) {
  const { month, creditId, personId } = await req.json();
  if (!month || !creditId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await setCreditAssign(month, creditId, personId || null);
  return NextResponse.json({ ok: true });
}

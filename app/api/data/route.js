import { NextResponse } from "next/server";
import { getAllData } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getAllData();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

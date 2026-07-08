import { NextResponse } from "next/server";
import { getAllData } from "../../../lib/db.mjs";

export const runtime = "nodejs";

function ok(req) {
  const k = req.headers.get("x-admin-key");
  const t = req.headers.get("x-share-token");
  return k === process.env.ADMIN_KEY || t === process.env.SHARE_TOKEN;
}

export async function GET(req) {
  if (!ok(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await getAllData();
  return NextResponse.json(data);
}

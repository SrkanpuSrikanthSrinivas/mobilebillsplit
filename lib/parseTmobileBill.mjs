// lib/parseTmobileBill.mjs
// Server-side: extract visual text lines from a T-Mobile PDF with unpdf, then
// run the shared pure parser. (Kept for server use / fallback; the browser does
// its own extraction to avoid the 4.5MB serverless upload limit.)
import { getDocumentProxy } from "unpdf";
import { parseBillLines } from "./parseLines.mjs";

async function extractLines(u8) {
  const pdf = await getDocumentProxy(u8);
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], str: item.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      lines.push(rows.get(y).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return lines;
}

export async function parseTmobileBill(buffer) {
  const u8 = new Uint8Array(buffer);
  const lines = await extractLines(u8);
  return parseBillLines(lines);
}

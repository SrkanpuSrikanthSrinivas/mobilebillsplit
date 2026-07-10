// lib/parseAttBill.mjs
// Extracts month, account total, per-line totals, AND the per-line
// "Discount for switching to AT&T with own device" (BYOD discount),
// so the app can redistribute that discount evenly across all lines.
import { getDocumentProxy } from "unpdf";

const MONTHS = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
const dollar = (s) => parseFloat(s.replace(/[$,]/g, ""));

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

export async function parseAttBill(buffer) {
  const u8 = new Uint8Array(buffer);
  const lines = await extractLines(u8);
  const text = lines.join("\n");

  let month = null;
  const dm = text.match(/Issue Date:?\s*([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/);
  if (dm) { const mm = MONTHS[dm[1].slice(0, 3).toLowerCase()]; if (mm) month = `${dm[2]}-${mm}`; }

  const am = text.match(/Account Number:?\s*(\d{6,})/);
  const account = am ? "\u2026" + am[1].slice(-4) : "\u2026----";

  let accountTotal = null;
  const td = text.match(/Total due\s*\$([\d,]+\.\d{2})/);
  const tw = text.match(/Total for Wireless\s*\$([\d,]+\.\d{2})/);
  if (td) accountTotal = dollar(td[1]); else if (tw) accountTotal = dollar(tw[1]);

  // per-line totals from "Total for <phone> $amount"
  const linesOut = [];
  const seen = new Set();
  const reLineTotal = /Total for (\d{3}\.\d{3}\.\d{4})\D+\$([\d,]+\.\d{2})/;
  for (const l of lines) {
    const m = l.match(reLineTotal);
    if (m && !seen.has(m[1])) { seen.add(m[1]); linesOut.push({ line: m[1].replace(/\./g, ""), total: dollar(m[2]) }); }
  }

  // per-line BYOD ("own device") discount, tracked by detail section
  const byod = {};
  let cur = null;
  for (const l of lines) {
    const pm = l.match(/Phone,\s*(\d{3}\.\d{3}\.\d{4})/);
    if (pm) { cur = pm[1].replace(/\./g, ""); continue; }
    if (/Total for \d{3}\.\d{3}\.\d{4}/.test(l)) { cur = null; continue; }
    if (cur && /Discount for switching to AT&T with own device/.test(l)) {
      const a = l.match(/(\d+\.\d{2})/);
      if (a) byod[cur] = (byod[cur] || 0) + parseFloat(a[1]);
    }
  }
  for (const row of linesOut) row.byod = byod[row.line] || 0;

  const sumLines = linesOut.reduce((s, r) => s + r.total, 0);
  return {
    month, account, accountTotal, lines: linesOut,
    reconciles: accountTotal != null && Math.abs(sumLines - accountTotal) < 0.01,
    sumOfLines: Math.round(sumLines * 100) / 100,
  };
}

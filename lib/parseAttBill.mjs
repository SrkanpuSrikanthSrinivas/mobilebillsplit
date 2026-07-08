// parseAttBill.mjs
// Extracts month, account total, and per-line totals from an AT&T Mobility PDF bill.
// Runs in Node (Vercel serverless) using pdfjs-dist's legacy build.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Rebuild visual lines from positioned text items (like `pdftotext -layout`).
async function extractLines(data) {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map(); // y (rounded) -> [{x, str}]
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, str: item.str });
    }
    const ys = [...rows.keys()].sort((a, b) => b - a); // top -> bottom
    for (const y of ys) {
      const line = rows.get(y).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      lines.push(line.replace(/\s+/g, " ").trim());
    }
  }
  return lines;
}

const dollar = (s) => parseFloat(s.replace(/[$,]/g, ""));

export async function parseAttBill(buffer) {
  const data = Uint8Array.from(buffer);
  const lines = await extractLines(data);
  const text = lines.join("\n");

  // --- billing month from Issue Date ---
  let month = null;
  const dm = text.match(/Issue Date:?\s*([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/);
  if (dm) {
    const mm = MONTHS[dm[1].slice(0, 3).toLowerCase()];
    if (mm) month = `${dm[2]}-${mm}`;
  }

  // --- account number (last 4 for display) ---
  const am = text.match(/Account Number:?\s*(\d{6,})/);
  const account = am ? "…" + am[1].slice(-4) : "…----";

  // --- account total: prefer "Total due", fall back to "Total for Wireless" ---
  let accountTotal = null;
  const td = text.match(/Total due\s*\$([\d,]+\.\d{2})/);
  const tw = text.match(/Total for Wireless\s*\$([\d,]+\.\d{2})/);
  if (td) accountTotal = dollar(td[1]);
  else if (tw) accountTotal = dollar(tw[1]);

  // --- per-line totals from "Total for <phone> $amount" ---
  const linesOut = [];
  const seen = new Set();
  const reLineTotal = /Total for (\d{3}\.\d{3}\.\d{4})\D+\$([\d,]+\.\d{2})/;
  for (const l of lines) {
    const m = l.match(reLineTotal);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      linesOut.push({ line: m[1].replace(/\./g, ""), total: dollar(m[2]) });
    }
  }

  // --- names from the summary table (phone + CAPS name) ---
  const names = {};
  const reNameRow = /(\d{3}\.\d{3}\.\d{4})\s+([A-Z][A-Z .]+?)\s+\d\s+[-$]/;
  for (const l of lines) {
    const m = l.match(reNameRow);
    if (m) {
      const key = m[1].replace(/\./g, "");
      if (!names[key]) names[key] = m[2].trim().replace(/\s+/g, " ");
    }
  }
  for (const row of linesOut) row.name = names[row.line] || null;

  const sumLines = linesOut.reduce((s, r) => s + r.total, 0);

  return {
    month,
    account,
    accountTotal,
    lines: linesOut, // [{ line: "2144043110", name, total }]
    reconciles: accountTotal != null && Math.abs(sumLines - accountTotal) < 0.01,
    sumOfLines: Math.round(sumLines * 100) / 100,
  };
}

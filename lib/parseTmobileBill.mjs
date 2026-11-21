// lib/parseTmobileBill.mjs
// Extracts the fair-split inputs from a T-Mobile bill PDF.
//
// Model fact used here: for every voice line,
//   line Total = line Plans + Equipment + Services + One-time usage
// Services (Netflix/Hulu) are account-level $0, so a line's PERSONAL charge
// (its own device net + its own usage) = (line Total - line Plans).
// That makes the split robust without having to disentangle columns:
//   owed = plansTotal / N   +   (lineTotal - linePlans)   [+ netflix if holder]
//
// We still capture usage separately (it is phone-tagged in the One-time section)
// so the UI can show device-net vs usage, and we capture Netflix's net charge.
import { getDocumentProxy } from "unpdf";

const MONTHS = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
const money = (s) => parseFloat(String(s).replace(/[$,]/g, ""));
const MONEY = /-?\$[\d,]+\.\d{2}/g;        // matches $6.14 and -$6.32 ; ignores lone "-"
const digits = (s) => s.replace(/\D/g, "");

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
  const text = lines.join("\n");

  // ---- month ----
  let month = null;
  const dm = text.match(/Bill issue date\s*([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/i)
         || text.match(/\b([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/);
  if (dm) { const mm = MONTHS[dm[1].slice(0,3).toLowerCase()]; if (mm) month = `${dm[2]}-${mm}`; }

  // ---- account (last 4) ----
  const am = text.match(/Account\s*(?:Number)?\s*[:#]?\s*(\d{6,})/i);
  const account = am ? "…" + am[1].slice(-4) : "…----";

  // ---- per-line table rows:  (xxx) xxx-xxxx  Voice  <money...>  -> plans=first, total=last ----
  const lineData = {};        // phone10 -> { plans, total }
  const reRow = /\((\d{3})\)\s*(\d{3})-(\d{4})\s+Voice\b(.*)$/;
  for (const l of lines) {
    const m = l.match(reRow);
    if (!m) continue;
    const phone = m[1] + m[2] + m[3];
    const toks = (m[4].match(MONEY) || []).map(money);
    if (toks.length < 1) continue;
    lineData[phone] = { plans: toks[0], total: toks[toks.length - 1] };
  }

  // ---- plansTotal & billTotal from the "Totals" row (first = plans, last = bill) ----
  let plansTotal = null, billTotal = null;
  for (const l of lines) {
    const mt = l.match(/^\s*Totals\b(.*)$/);
    if (mt) {
      const toks = (mt[1].match(MONEY) || []).map(money);
      if (toks.length >= 2) { plansTotal = toks[0]; billTotal = toks[toks.length - 1]; break; }
    }
  }
  // fallback bill total from TOTAL DUE (rendered as "$ 349 .04")
  if (billTotal == null) {
    const td = text.replace(/\s+/g, " ").match(/TOTAL DUE\s*\$?\s*([\d,]+)\s*\.\s*(\d{2})/i);
    if (td) billTotal = money(td[1] + "." + td[2]);
  }

  // ---- per-line one-time usage: "(xxx) xxx-xxxx had a total of $X usage charges" ----
  const usage = {};
  const reUse = /\((\d{3})\)\s*(\d{3})-(\d{4})\s+had a total of\s+\$([\d,]+\.\d{2})\s+usage/i;
  for (const l of lines) {
    const m = l.match(reUse);
    if (m) usage[m[1]+m[2]+m[3]] = money(m[4]);
  }

  // ---- Netflix net charge (assigned to holder by the app) ----
  let netflix = 0;
  const nf = text.match(/Netflix[^\n]*?\$([\d,]+\.\d{2})/i);
  if (nf) netflix = money(nf[1]);

  // ---- account-level credits & adjustments (no per-member breakdown on the bill,
  //      so the app lets the user assign each one to a person) ----
  const credits = [];
  const reCredit = /Credits? & adjustments\s+Account\s+(.+?)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+-\$([\d,]+\.\d{2})/i;
  let ci = 0;
  for (const l of lines) {
    const m = l.match(reCredit);
    if (m) credits.push({ id: "c" + (ci++), label: m[1].trim(), amount: money(m[2]) });
  }

  // ---- assemble per-line output (personal = total - plans; device = personal - usage) ----
  const outLines = {};
  for (const [phone, d] of Object.entries(lineData)) {
    const personal = Math.round((d.total - d.plans) * 100) / 100;
    const use = usage[phone] || 0;
    const device = Math.round((personal - use) * 100) / 100;
    outLines[phone] = { plans: d.plans, total: d.total, personal, usage: use, device };
  }

  const lineCount = Object.keys(outLines).length;
  const sumPersonal = Object.values(outLines).reduce((s, v) => s + v.personal, 0);
  // reconciliation: plansTotal + sum(personal) + netflix(already in a line's total if billed) ?=
  // Netflix nets to $0 normally; when billed it appears in Services and is already inside billTotal.
  const recon = (plansTotal != null && billTotal != null)
    ? Math.abs((plansTotal + sumPersonal) - billTotal) < 0.02 : false;

  return { month, account, plansTotal, billTotal, lineCount, netflix, credits, lines: outLines, reconciles: recon };
}

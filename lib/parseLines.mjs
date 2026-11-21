// lib/parseLines.mjs
// Pure parser: takes the visual text lines of a T-Mobile bill (already extracted
// from the PDF, in either the browser or on the server) and returns the fair-split
// inputs. No PDF / Node dependency, so it runs in the browser too.
//
// Model fact: for every voice line, Total = Plans + Equipment + Services + One-time.
// Services (Netflix/Hulu) are account-level $0, so a line's PERSONAL charge
// (device net + usage) = (lineTotal - linePlans).

const MONTHS = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
const money = (s) => parseFloat(String(s).replace(/[$,]/g, ""));
const MONEY = /-?\$[\d,]+\.\d{2}/g;

export function parseBillLines(lines) {
  const text = lines.join("\n");

  // month
  let month = null;
  const dm = text.match(/Bill issue date\s*([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/i) || text.match(/\b([A-Za-z]{3,9})\s+\d{1,2},\s*(\d{4})/);
  if (dm) { const mm = MONTHS[dm[1].slice(0, 3).toLowerCase()]; if (mm) month = `${dm[2]}-${mm}`; }

  // account (last 4)
  const am = text.match(/Account\s*(?:Number)?\s*[:#]?\s*(\d{6,})/i);
  const account = am ? "…" + am[1].slice(-4) : "…----";

  // per-line table rows: (xxx) xxx-xxxx Voice <money...> -> plans=first, total=last
  const lineData = {};
  const reRow = /\((\d{3})\)\s*(\d{3})-(\d{4})\s+Voice\b(.*)$/;
  for (const l of lines) {
    const m = l.match(reRow);
    if (!m) continue;
    const phone = m[1] + m[2] + m[3];
    const toks = (m[4].match(MONEY) || []).map(money);
    if (toks.length < 1) continue;
    lineData[phone] = { plans: toks[0], total: toks[toks.length - 1] };
  }

  // plansTotal & billTotal from the "Totals" row
  let plansTotal = null, billTotal = null;
  for (const l of lines) {
    const mt = l.match(/^\s*Totals\b(.*)$/);
    if (mt) { const toks = (mt[1].match(MONEY) || []).map(money); if (toks.length >= 2) { plansTotal = toks[0]; billTotal = toks[toks.length - 1]; break; } }
  }
  if (billTotal == null) {
    const td = text.replace(/\s+/g, " ").match(/TOTAL DUE\s*\$?\s*([\d,]+)\s*\.\s*(\d{2})/i);
    if (td) billTotal = money(td[1] + "." + td[2]);
  }

  // per-line one-time usage
  const usage = {};
  const reUse = /\((\d{3})\)\s*(\d{3})-(\d{4})\s+had a total of\s+\$([\d,]+\.\d{2})\s+usage/i;
  for (const l of lines) { const m = l.match(reUse); if (m) usage[m[1] + m[2] + m[3]] = money(m[4]); }

  // Netflix net charge
  let netflix = 0;
  const nf = text.match(/Netflix[^\n]*?\$([\d,]+\.\d{2})/i);
  if (nf) netflix = money(nf[1]);

  // account-level credits & adjustments
  const credits = [];
  const reCredit = /Credits? & adjustments\s+Account\s+(.+?)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+-\$([\d,]+\.\d{2})/i;
  let ci = 0;
  for (const l of lines) { const m = l.match(reCredit); if (m) credits.push({ id: "c" + (ci++), label: m[1].trim(), amount: money(m[2]) }); }

  // assemble
  const outLines = {};
  for (const [phone, d] of Object.entries(lineData)) {
    const personal = Math.round((d.total - d.plans) * 100) / 100;
    const use = usage[phone] || 0;
    const device = Math.round((personal - use) * 100) / 100;
    outLines[phone] = { plans: d.plans, total: d.total, personal, usage: use, device };
  }
  const lineCount = Object.keys(outLines).length;
  const sumPersonal = Object.values(outLines).reduce((s, v) => s + v.personal, 0);
  const reconciles = (plansTotal != null && billTotal != null) ? Math.abs((plansTotal + sumPersonal) - billTotal) < 0.02 : false;

  return { month, account, plansTotal, billTotal, lineCount, netflix, credits, lines: outLines, reconciles };
}

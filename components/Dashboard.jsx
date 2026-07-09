"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { PEOPLE, FAMILIES, PAYER } from "../lib/config";

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (n) => { const v = isFinite(n) ? n : 0; return (v < 0 ? "-" : "") + "$" + Math.abs(v).toFixed(2); };
const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }); };
const monthShort = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" }) + " '" + String(y).slice(2); };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("month");
  const [month, setMonth] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else setMsg({ type: "err", text: "Could not load data." });
    } catch (e) { setMsg({ type: "err", text: "Network error." }); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const monthKeys = useMemo(() => (data ? Object.keys(data.bills).sort() : []), [data]);
  useEffect(() => {
    if (monthKeys.length && (!month || !monthKeys.includes(month))) setMonth(monthKeys[monthKeys.length - 1]);
  }, [monthKeys]); // eslint-disable-line

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      let j = {};
      try { j = await res.json(); } catch (_) {}
      if (!res.ok) setMsg({ type: "err", text: j.error || `Upload failed (${res.status}).` });
      else {
        setMsg({ type: j.reconciles ? "ok" : "warn",
          text: `${monthLabel(j.month)} added — total ${money(j.accountTotal)}, ${j.lineCount} lines. ${j.reconciles ? "Reconciles ✓" : "⚠ line sum " + money(j.sumOfLines) + " ≠ bill total"}` });
        await load(); setMonth(j.month); setView("month");
      }
    } catch (e) { setMsg({ type: "err", text: "Upload error: " + e.message }); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const togglePaid = async (familyId, current) => {
    const next = !current;
    setData((d) => ({ ...d, payments: { ...d.payments, [month]: { ...(d.payments[month] || {}), [familyId]: next } } }));
    try {
      await fetch("/api/paid", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, familyId, paid: next }) });
    } catch (e) { setMsg({ type: "err", text: "Couldn't save that change." }); }
  };

  const famLines = (mk) => (data?.bills[mk]?.lines) || {};
  const famTotal = (f, mk) => f.lines.reduce((s, ln) => s + num(famLines(mk)[ln]), 0);
  const isPaid = (f, mk) => f.holder || !!(data?.payments[mk]?.[f.id]);
  const famAgg = (f) => {
    let total = 0, paid = 0;
    monthKeys.forEach((mk) => { const t = famTotal(f, mk); total += t; if (isPaid(f, mk)) paid += t; });
    return { total, paid, outstanding: total - paid };
  };

  if (loading) return <div className="wrap"><Style /><p className="muted" style={{ padding: 40 }}>Loading…</p></div>;
  const cur = month && data?.bills[month];

  return (
    <div className="wrap"><Style />
      <header className="mast">
        <div>
          <div className="brand">AT&amp;T Family Split</div>
          <div className="sub">Shared dashboard · everyone pays {PAYER}</div>
        </div>
        <div className="seg">
          <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
          <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}>All months</button>
        </div>
      </header>
      <div className="perf" />

      <section className="uploadbar">
        <div>
          <div className="mini">Upload a month&apos;s AT&amp;T bill (PDF)</div>
          <div className="muted sm">It reads every line automatically — no manual math.</div>
        </div>
        <div className="uprow">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          {busy && <span className="muted sm">Parsing…</span>}
        </div>
      </section>
      {msg && <div className={"msg " + msg.type}>{msg.text}</div>}

      {monthKeys.length === 0 ? (
        <div className="empty">No bills yet — upload a PDF above to get started.</div>
      ) : view === "month" ? (
        <>
          <div className="monthpick">
            <select className="sel" value={month || ""} onChange={(e) => setMonth(e.target.value)}>
              {monthKeys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
            </select>
          </div>

          {FAMILIES.map((f) => {
            const total = famTotal(f, month);
            const paid = isPaid(f, month);
            return (
              <section className={"fam" + (f.holder ? " holder" : paid ? " ispaid" : "")} key={f.id}>
                <div className="fam-head">
                  <div className="fam-title">
                    <span className="fam-name">{f.name}</span>
                    {f.holder ? <span className="chip">account holder</span> : <span className="chip pay">Zelle {PAYER}</span>}
                  </div>
                  <div className="fam-right">
                    <span className="fam-total">{money(total)}</span>
                    {f.holder ? <span className="covered">covered</span>
                      : <button className={"chk" + (paid ? " on" : "")} onClick={() => togglePaid(f.id, paid)}>{paid ? "✓ paid" : "mark paid"}</button>}
                  </div>
                </div>
                <div className="members">
                  {f.lines.map((ln) => (
                    <div className="mrow" key={ln}>
                      <span className="nm">{PEOPLE[ln]?.name || ln}</span>
                      <span className="ln">…{ln.slice(-4)}</span>
                      <span className="mamt">{money(num(cur.lines[ln]))}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <ReconStrip data={data} month={month} />
        </>
      ) : (
        <section className="card">
          <div className="card-head"><h2>All months</h2><span className="tag">{monthKeys.length} bills</span></div>
          <div className="scroll">
            <table className="grid">
              <thead><tr>
                <th className="l">Family</th>
                {monthKeys.map((k) => <th key={k}>{monthShort(k)}</th>)}
                <th className="tot">Total</th><th className="tot">Owed</th>
              </tr></thead>
              <tbody>
                {FAMILIES.map((f) => {
                  const a = famAgg(f);
                  return (
                    <tr key={f.id} className={f.holder ? "holderrow" : ""}>
                      <td className="l">{f.name}{f.holder && <span className="tinychip">holder</span>}</td>
                      {monthKeys.map((k) => {
                        const t = famTotal(f, k); const pd = isPaid(f, k) && !f.holder;
                        return <td key={k} className={pd ? "paidcell" : ""}>{money(t)}</td>;
                      })}
                      <td className="tot strong">{money(a.total)}</td>
                      <td className={"tot " + (a.outstanding > 0.005 ? "owe" : "clear")}>{money(a.outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr>
                <td className="l">All bills</td>
                {monthKeys.map((k) => <td key={k}>{money(FAMILIES.reduce((s, f) => s + famTotal(f, k), 0))}</td>)}
                <td className="tot strong">{money(FAMILIES.reduce((s, f) => s + famAgg(f).total, 0))}</td>
                <td className="tot owe">{money(FAMILIES.reduce((s, f) => s + famAgg(f).outstanding, 0))}</td>
              </tr></tfoot>
            </table>
          </div>
          <p className="muted sm" style={{ marginTop: 12 }}>Green cells are months a family has paid. “Owed” is what each family still needs to send {PAYER}.</p>
        </section>
      )}
    </div>
  );
}

function ReconStrip({ data, month }) {
  const bill = data.bills[month];
  const t = (f) => f.lines.reduce((a, ln) => a + num(bill.lines[ln]), 0);
  const sum = FAMILIES.reduce((s, f) => s + t(f), 0);
  const collected = FAMILIES.reduce((s, f) => s + ((f.holder || !!(data.payments[month]?.[f.id])) ? t(f) : 0), 0);
  const outstanding = sum - collected;
  const diff = sum - num(bill.accountTotal);
  const done = Math.abs(outstanding) < 0.005;
  return (
    <section className={"recon" + (done ? " done" : "")}>
      <div className="rc"><span className="mini">Bill total</span><span className="val">{money(sum)}</span></div>
      <div className="rc"><span className="mini">Collected</span><span className="val pos">{money(collected)}</span></div>
      <div className="rc"><span className="mini">Still owed</span><span className={"val" + (outstanding > 0.005 ? " neg" : "")}>{money(outstanding)}</span></div>
      <div className="rc"><span className="mini">AT&amp;T total</span><span className="val">{money(num(bill.accountTotal))}</span>
        <span className={"flag " + (Math.abs(diff) < 0.01 ? "ok" : "bad")}>{Math.abs(diff) < 0.01 ? "matches" : "check"}</span></div>
    </section>
  );
}

function Style() { return <style>{CSS}</style>; }

const CSS = `
.wrap{--ink:#1b2430;--paper:#eceff4;--surface:#fff;--line:#dbe1ea;--muted:#6c7787;--accent:#2f56d6;--accent-soft:#eaefff;--pos:#157347;--neg:#c22f3d;--hold:#7a5cff;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--ink);background:var(--paper);min-height:100vh;padding:18px;max-width:900px;margin:0 auto;box-sizing:border-box;}
.wrap *{box-sizing:border-box;}
.muted{color:var(--muted);} .sm{font-size:12px;}
.mini{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600;}
.sel{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:9px 11px;font-size:14px;color:var(--ink);outline:none;font-family:inherit;min-width:180px;cursor:pointer;}
.sel:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
.mast{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
.brand{font-size:24px;font-weight:800;letter-spacing:-.5px;} .sub{font-size:13px;color:var(--muted);margin-top:2px;}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--surface);}
.seg button{border:none;background:transparent;padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;}
.seg button.on{background:var(--accent);color:#fff;}
.perf{border-top:2px dashed var(--line);margin:14px 0 16px;}
.uploadbar{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:var(--surface);border:1px dashed var(--accent);border-radius:12px;padding:14px 16px;margin-bottom:14px;}
.uprow{display:flex;align-items:center;gap:10px;}
.msg{border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px;}
.msg.ok{background:#e6f6ec;color:var(--pos);} .msg.warn{background:#fdf3e2;color:#a56b16;} .msg.err{background:#fdeaea;color:var(--neg);}
.empty{color:var(--muted);font-size:14px;padding:30px;text-align:center;border:1px dashed var(--line);border-radius:12px;background:var(--surface);}
.monthpick{margin-bottom:14px;}
.fam{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:14px;}
.fam.holder{border-left:4px solid var(--hold);}
.fam.ispaid{border-left:4px solid var(--pos);background:linear-gradient(90deg,rgba(21,115,71,.04),var(--surface) 40%);}
.fam-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--line);}
.fam-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.fam-name{font-size:17px;font-weight:700;}
.chip{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:3px 9px;border-radius:20px;background:#efe9ff;color:var(--hold);}
.chip.pay{background:var(--accent-soft);color:var(--accent);}
.fam-right{display:flex;align-items:center;gap:14px;}
.fam-total{font-size:22px;font-weight:800;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.covered{font-size:12px;font-weight:700;color:var(--hold);text-transform:uppercase;letter-spacing:.5px;}
.chk{border:2px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);white-space:nowrap;}
.chk.on{background:var(--pos);border-color:var(--pos);color:#fff;}
.members{padding-top:6px;}
.mrow{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line);}
.mrow:last-child{border-bottom:none;}
.nm{font-size:13.5px;font-weight:600;flex:1;} .ln{font-size:11px;color:var(--muted);font-family:var(--mono);}
.mamt{font-family:var(--mono);font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;width:90px;text-align:right;}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:14px;}
.card-head{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;}
.card-head h2{font-size:16px;margin:0;font-weight:700;}
.tag{font-size:11px;color:var(--muted);background:var(--paper);padding:3px 9px;border-radius:20px;font-weight:600;}
.scroll{overflow-x:auto;margin:0 -4px;}
.grid{width:100%;border-collapse:collapse;font-size:13px;min-width:560px;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.grid th,.grid td{padding:9px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line);}
.grid th{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;font-family:system-ui;}
.grid th.l,.grid td.l{text-align:left;position:sticky;left:0;background:var(--surface);font-family:system-ui;font-weight:600;}
.tinychip{font-size:9px;font-weight:700;text-transform:uppercase;color:var(--hold);background:#efe9ff;padding:2px 6px;border-radius:10px;margin-left:6px;}
.grid td.tot,.grid th.tot{background:var(--paper);font-weight:700;}
.grid td.strong{font-weight:800;} .grid td.owe{color:var(--neg);} .grid td.clear{color:var(--pos);}
.grid td.paidcell{background:rgba(21,115,71,.09);color:var(--pos);}
.grid tr.holderrow td{color:var(--muted);}
.grid tfoot td{border-top:2px solid var(--line);border-bottom:none;font-weight:800;background:var(--paper);}
.recon{display:flex;align-items:center;gap:22px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:16px 20px;}
.recon.done{background:#0f3d2a;}
.rc{display:flex;flex-direction:column;gap:4px;} .recon .mini{color:#a9b3c1;}
.val{font-size:20px;font-weight:700;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.val.pos{color:#5fd39a;} .val.neg{color:#ff8b8b;}
.flag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;width:fit-content;}
.flag.ok{background:rgba(95,211,154,.2);color:#5fd39a;} .flag.bad{background:rgba(255,139,139,.2);color:#ff8b8b;}
@media (max-width:640px){.recon{gap:14px;}}
`;

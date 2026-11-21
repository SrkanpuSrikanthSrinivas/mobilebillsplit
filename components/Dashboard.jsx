"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { PEOPLE, FAMILIES, HOLDER, PAYER, NETFLIX, ONE_TIME } from "../lib/config";

const r = (x) => Math.round((Number(x) + 1e-9) * 100) / 100;
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = (n) => { const v = r(n); return (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2); };
const mLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }); };
const mShort = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + k.slice(2, 4); };
const N = Object.keys(PEOPLE).length;

// Split rules:
//  - Netflix is deducted from the shared plan pool, then the pool is split equally,
//    and Netflix is charged back to the holder (so only the holder bears it).
//  - Devices & usage are personal (from the bill).
//  - Account credits are assigned to specific people and reduce their total.
function compute(bill, assign = {}) {
  if (!bill) return null;
  const nflx = num(NETFLIX.amount);
  const planPool = r(bill.plansTotal - nflx);          // deduct Netflix from the shared pool
  const share = r(planPool / N);
  const plan = {}, owed = {}, dev = {}, use = {};
  for (const pid in PEOPLE) { plan[pid] = share; owed[pid] = share; }
  plan[HOLDER] = r(plan[HOLDER] + r(planPool - share * N)); // residual penny to holder
  owed[HOLDER] = plan[HOLDER];
  // one-time usage: split equally across all, or charged to the line that incurred it
  const usageTotal = r(Object.keys(PEOPLE).reduce((s, pid) => s + num((bill.lines[pid] || {}).usage), 0));
  const split = !!ONE_TIME.splitAcrossAll;
  const usageShare = split ? r(usageTotal / N) : 0;
  for (const pid in PEOPLE) {
    const L = bill.lines[pid] || {};
    dev[pid] = num(L.device); use[pid] = split ? usageShare : num(L.usage);
    owed[pid] = r(owed[pid] + num(L.device) + use[pid]);
  }
  if (split) owed[HOLDER] = r(owed[HOLDER] + r(usageTotal - usageShare * N)); // usage residual to holder
  owed[NETFLIX.to] = r(owed[NETFLIX.to] + nflx);          // Netflix back onto holder
  const chargesSum = r(Object.values(owed).reduce((s, v) => s + v, 0)); // == billTotal
  // account credits -> assigned people
  const creditApplied = {}; let creditsAssigned = 0, creditsUnassigned = 0;
  for (const c of (bill.credits || [])) {
    const to = assign[c.id];
    if (to && PEOPLE[to]) {
      owed[to] = r(owed[to] - c.amount);
      creditApplied[to] = r((creditApplied[to] || 0) + c.amount);
      creditsAssigned = r(creditsAssigned + c.amount);
    } else creditsUnassigned = r(creditsUnassigned + c.amount);
  }
  return { share, plan, owed, dev, use, nflx, chargesSum, creditApplied, creditsAssigned, creditsUnassigned, usageTotal, usageSplit: split };
}

export default function Dashboard({ initialData = { bills: {}, payments: {}, creditAssign: {} }, dbError = null }) {
  const [data, setData] = useState({ creditAssign: {}, ...initialData });
  const [view, setView] = useState("month");
  const [month, setMonth] = useState(() => {
    const ks = Object.keys(initialData?.bills || {}).sort();
    return ks[ks.length - 1] || null;
  });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const monthKeys = useMemo(() => Object.keys(data.bills).sort(), [data]);
  useEffect(() => {
    if (monthKeys.length && (!month || !monthKeys.includes(month))) setMonth(monthKeys[monthKeys.length - 1]);
  }, [monthKeys]); // eslint-disable-line

  const comp = useMemo(() => {
    const m = {};
    for (const mk of monthKeys) m[mk] = compute(data.bills[mk], data.creditAssign?.[mk] || {});
    return m;
  }, [data, monthKeys]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      let j = {}; try { j = await res.json(); } catch (_) {}
      if (!res.ok) setMsg({ type: "err", text: j.error || `Upload failed (${res.status}).` });
      else {
        const creditNote = j.creditsFound ? ` ${j.creditsFound} account credit(s) found — assign below.` : "";
        setMsg({ type: j.reconciles ? "ok" : "warn",
          text: `${mLabel(j.month)} added — bill ${money(j.billTotal)}, ${j.lineCount} lines. ${j.reconciles ? "Reconciles ✓" : "⚠ check"}${creditNote} Refreshing…` });
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (e) { setMsg({ type: "err", text: "Upload error: " + e.message }); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const togglePaid = async (familyId, current) => {
    const next = !current;
    setData((d) => ({ ...d, payments: { ...d.payments, [month]: { ...(d.payments[month] || {}), [familyId]: next } } }));
    try { await fetch("/api/paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, familyId, paid: next }) }); }
    catch (e) { setMsg({ type: "err", text: "Couldn't save that change." }); }
  };

  const assignCredit = async (creditId, personId) => {
    setData((d) => ({ ...d, creditAssign: { ...d.creditAssign, [month]: { ...(d.creditAssign?.[month] || {}), [creditId]: personId || null } } }));
    try { await fetch("/api/credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, creditId, personId: personId || null }) }); }
    catch (e) { setMsg({ type: "err", text: "Couldn't save the credit assignment." }); }
  };

  const famTotal = (f, mk) => comp[mk] ? r(f.lines.reduce((s, p) => s + comp[mk].owed[p], 0)) : 0;
  const isPaid = (f, mk) => f.holder || !!(data.payments?.[mk]?.[f.id]);
  const famAgg = (f) => {
    let total = 0, paid = 0;
    for (const mk of monthKeys) { const t = famTotal(f, mk); total += t; if (isPaid(f, mk)) paid += t; }
    return { total: r(total), outstanding: r(total - paid) };
  };

  const cur = month && data.bills[month];
  const c = month && comp[month];
  const assignMap = (month && data.creditAssign?.[month]) || {};

  return (
    <div className="wrap"><Style />
      <header className="mast">
        <div>
          <div className="brand">Family Mobile Split</div>
          <div className="sub">T-Mobile{cur ? ` · acct ${cur.account}` : ""} · everyone pays {PAYER}</div>
        </div>
        <div className="seg">
          <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
          <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}>All months</button>
        </div>
      </header>
      <div className="perf" />

      <section className="uploadbar">
        <div>
          <div className="mini">Upload a month's T-Mobile bill (PDF)</div>
          <div className="muted sm">Plan split equally after Netflix; devices &amp; one-time usage per person; account credits assignable below.</div>
        </div>
        <div className="uprow">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
          {busy && <span className="muted sm">Parsing…</span>}
        </div>
      </section>
      {dbError && <div className="msg err">Database read failed on the server: {dbError}</div>}
      {msg && <div className={"msg " + msg.type}>{msg.text}</div>}

      {monthKeys.length === 0 ? (
        <div className="empty">No bills yet — upload a T-Mobile PDF above to get started.</div>
      ) : view === "month" && cur && c ? (
        <>
          <div className="monthpick">
            <select className="sel" value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthKeys.map((k) => <option key={k} value={k}>{mLabel(k)}</option>)}
            </select>
          </div>

          {cur.credits && cur.credits.length > 0 && (
            <section className={"credits" + (c.creditsUnassigned > 0 ? " warn" : "")}>
              <div className="credits-head">
                <span className="cr-title">Account credits — assign to the right person</span>
                {c.creditsUnassigned > 0 && <span className="cr-warn">{money(c.creditsUnassigned)} unassigned</span>}
              </div>
              <div className="muted sm" style={{ marginBottom: 10 }}>T-Mobile lists these at the account level with no per-person breakdown. Assign each to whoever it belongs to — it comes off that person's total.</div>
              {cur.credits.map((cr) => (
                <div className="cr-row" key={cr.id}>
                  <div><span className="cr-label">{cr.label}</span> <span className="cr-amt">−{money(cr.amount)}</span></div>
                  <select className="sel sm" value={assignMap[cr.id] || ""} onChange={(e) => assignCredit(cr.id, e.target.value)}>
                    <option value="">— unassigned —</option>
                    {Object.keys(PEOPLE).map((pid) => <option key={pid} value={pid}>{PEOPLE[pid].name}</option>)}
                  </select>
                </div>
              ))}
            </section>
          )}

          {FAMILIES.map((f) => {
            const total = famTotal(f, month);
            const paid = isPaid(f, month);
            return (
              <section className={"fam" + (f.holder ? " holder" : paid ? " ispaid" : "")} key={f.id}>
                <div className="fam-head">
                  <div><span className="fam-name">{f.name}</span>
                    {f.holder ? <span className="chip hold">account holder</span> : <span className="chip pay">Zelle {PAYER.split(" ")[0]}</span>}</div>
                  <div className="fam-right">
                    <span className="fam-total">{money(total)}</span>
                    {f.holder ? <span className="covered">covered</span>
                      : <button className={"chk" + (paid ? " on" : "")} onClick={() => togglePaid(f.id, paid)}>{paid ? "✓ paid" : "mark paid"}</button>}
                  </div>
                </div>
                <table className="mtable">
                  <thead><tr><th className="l">Person</th><th>Plan</th><th>Device</th><th className="hide-sm">Usage / Netflix / Credit</th><th>Total</th></tr></thead>
                  <tbody>
                    {f.lines.map((pid) => {
                      const dv = c.dev[pid], u = c.use[pid], isH = pid === NETFLIX.to, nf = isH ? c.nflx : 0, cr = c.creditApplied[pid] || 0;
                      const bits = [];
                      if (u > 0) bits.push(<div key="u" className="xrow">{money(u)} <span className="xlab">{c.usageSplit ? "usage · split" : "usage"}</span></div>);
                      if (isH && nf > 0) bits.push(<div key="n" className="xrow"><b>{money(nf)}</b> <span className="xlab">Netflix</span></div>);
                      if (cr > 0) bits.push(<div key="c" className="xrow pos">−{money(cr)} <span className="xlab">credit</span></div>);
                      return (
                        <tr key={pid}>
                          <td className="l"><div className="pname">{PEOPLE[pid].name}</div><div className="pline">…{pid.slice(-4)}</div></td>
                          <td>{money(c.plan[pid])}</td>
                          <td className={dv < 0 ? "neg" : dv > 0 ? "" : "z"}>{dv !== 0 ? money(dv) : "—"}</td>
                          <td className="hide-sm xcell">{bits.length ? bits : <span className="z">—</span>}</td>
                          <td className="ptot">{money(c.owed[pid])}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}

          <ReconStrip bill={cur} comp={c} />
          <DevicePanel comp={c} />
        </>
      ) : view === "all" ? (
        <section className="card">
          <div className="card-head"><h2>All months</h2><span className="tag">{monthKeys.length} bills</span></div>
          <div className="scroll">
            <table className="grid">
              <thead><tr><th className="l">Family</th>{monthKeys.map((k) => <th key={k}>{mShort(k)}</th>)}<th>Total</th><th>Owed</th></tr></thead>
              <tbody>
                {FAMILIES.map((f) => {
                  const a = famAgg(f);
                  return (<tr key={f.id} className={f.holder ? "hold" : ""}>
                    <td className="l">{f.name}{f.holder && <span className="tinychip">holder</span>}</td>
                    {monthKeys.map((k) => { const t = famTotal(f, k); const pd = isPaid(f, k) && !f.holder; return <td key={k} className={pd ? "paidcell" : ""}>{money(t)}</td>; })}
                    <td className="strong">{money(a.total)}</td>
                    <td className={a.outstanding > 0.005 ? "owe" : "clear"}>{money(a.outstanding)}</td>
                  </tr>);
                })}
              </tbody>
              <tfoot><tr><td className="l">All families</td>
                {monthKeys.map((k) => <td key={k}>{money(comp[k] ? Object.values(comp[k].owed).reduce((s, v) => s + v, 0) : 0)}</td>)}
                <td className="strong">{money(monthKeys.reduce((s, k) => s + (comp[k] ? Object.values(comp[k].owed).reduce((a, v) => a + v, 0) : 0), 0))}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
          <div className="muted sm" style={{ marginTop: 10 }}>Netflix deducted then split; devices &amp; one-time usage per person; account credits to the assigned person. Green = family paid.</div>
        </section>
      ) : <div className="empty">Loading…</div>}
    </div>
  );
}

function ReconStrip({ bill, comp }) {
  const collected = r(FAMILIES.filter(f => !f.holder).reduce((s, f) => s + f.lines.reduce((a, p) => a + comp.owed[p], 0), 0));
  const ok = Math.abs(comp.chargesSum - bill.billTotal) < 0.02;
  const net = r(comp.chargesSum - comp.creditsAssigned);
  return (
    <section className={"recon" + (ok ? " ok" : "")}>
      <div className="rc"><span className="k">T-Mobile bill</span><span className="v">{money(bill.billTotal)}</span></div>
      {comp.creditsAssigned > 0 && <div className="rc"><span className="k">Account credits</span><span className="v pos">−{money(comp.creditsAssigned)}</span></div>}
      <div className="rc"><span className="k">Net to collect</span><span className="v">{money(net)}</span></div>
      <div className="rc"><span className="k">{PAYER.split(" ")[0]} collects (2 families)</span><span className="v">{money(collected)}</span></div>
      <span className={"flag " + (ok ? "ok" : "bad")}>{ok ? "bill reconciles ✓" : "check"}</span>
    </section>
  );
}

function DevicePanel({ comp }) {
  const rows = [];
  for (const f of FAMILIES) for (const pid of f.lines) {
    const dv = comp.dev[pid];
    if (dv === 0) continue;
    rows.push(<tr key={pid}><td className="l">{PEOPLE[pid].name} <span className="pline">…{pid.slice(-4)}</span></td>
      <td className={dv < 0 ? "neg" : "pos"}><b>{money(dv)}</b></td></tr>);
  }
  const noDev = Object.keys(PEOPLE).filter(p => comp.dev[p] === 0).map(p => PEOPLE[p].name.split(" ")[0]).join(", ");
  return (
    <div className="panel">
      <h2>Device credits — returned to each owner</h2>
      <p className="sub">Each person's device cost is their own installment net of their own promo credit — never pooled. A negative value is money back that month.</p>
      <table className="dtable">
        <thead><tr><th className="l">Person</th><th>Device (net of promo credit)</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      {noDev && <div className="muted sm" style={{ marginTop: 10 }}>{noDev} bring their own device — no device charge.</div>}
    </div>
  );
}

function Style() { return <style>{CSS}</style>; }
const CSS = `
.wrap{--ink:#161c26;--paper:#eef1f6;--surface:#fff;--line:#dde3ec;--muted:#69748a;--accent:#1f54c9;--accent-soft:#e7edfd;--pos:#0f7a46;--neg:#c0392b;--hold:#6d4bd8;--warn:#a56b16;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--ink);background:var(--paper);min-height:100vh;padding:20px 16px 60px;max-width:900px;margin:0 auto;}
.wrap *{box-sizing:border-box;}
.muted{color:var(--muted);} .sm{font-size:12px;}
.mini{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:700;}
.sel{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:9px 11px;font-size:14px;color:var(--ink);font-family:inherit;min-width:190px;cursor:pointer;}
.sel.sm{min-width:160px;padding:6px 9px;font-size:13px;}
.mast{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
.brand{font-size:25px;font-weight:800;letter-spacing:-.5px;} .sub{font-size:13px;color:var(--muted);margin-top:2px;}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--surface);}
.seg button{border:none;background:transparent;padding:8px 14px;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;}
.seg button.on{background:var(--accent);color:#fff;}
.perf{border-top:2px dashed var(--line);margin:14px 0 16px;}
.uploadbar{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:var(--surface);border:1px dashed var(--accent);border-radius:12px;padding:14px 16px;margin-bottom:14px;}
.uprow{display:flex;align-items:center;gap:10px;}
.msg{border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px;}
.msg.ok{background:#e4f5ec;color:var(--pos);} .msg.warn{background:#fdf3e2;color:var(--warn);} .msg.err{background:#fdeaea;color:var(--neg);}
.empty{color:var(--muted);font-size:14px;padding:30px;text-align:center;border:1px dashed var(--line);border-radius:12px;background:var(--surface);}
.monthpick{margin-bottom:14px;}
.credits{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px;}
.credits.warn{border-color:var(--warn);background:#fffaf2;}
.credits-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:2px;}
.cr-title{font-size:14px;font-weight:800;}
.cr-warn{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--warn);background:#fbeccc;padding:3px 9px;border-radius:20px;}
.cr-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line);}
.cr-label{font-weight:600;font-size:14px;} .cr-amt{font-family:var(--mono);color:var(--pos);font-weight:700;margin-left:6px;}
.fam{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px;}
.fam.holder{border-left:4px solid var(--hold);}
.fam.ispaid{border-left:4px solid var(--pos);background:linear-gradient(90deg,rgba(15,122,70,.05),var(--surface) 40%);}
.fam-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--line);}
.fam-name{font-size:17px;font-weight:800;}
.chip{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:3px 9px;border-radius:20px;margin-left:9px;}
.chip.hold{background:var(--accent-soft);color:var(--hold);} .chip.pay{background:var(--accent-soft);color:var(--accent);}
.fam-right{display:flex;align-items:center;gap:14px;}
.fam-total{font-size:22px;font-weight:800;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.covered{font-size:12px;font-weight:700;color:var(--hold);text-transform:uppercase;letter-spacing:.5px;}
.chk{border:2px solid var(--line);background:var(--surface);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;color:var(--muted);white-space:nowrap;}
.chk.on{background:var(--pos);border-color:var(--pos);color:#fff;}
.mtable{width:100%;border-collapse:collapse;margin-top:8px;}
.mtable th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;text-align:right;padding:6px 8px;border-bottom:1px solid var(--line);}
.mtable th.l{text-align:left;}
.mtable td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:right;font-size:14px;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.mtable tr:last-child td{border-bottom:none;} .mtable td.l{text-align:left;font-family:system-ui;}
.pname{font-weight:600;font-size:14px;} .pline{font-size:11px;color:var(--muted);font-family:var(--mono);}
.neg{color:var(--neg);} .pos{color:var(--pos);} .z{color:var(--muted);} .ptot{font-weight:800;}
.xcell{line-height:1.3;} .xrow{white-space:nowrap;}
.xlab{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-family:system-ui;}
.recon{display:flex;gap:22px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:15px 20px;align-items:center;margin-top:4px;}
.recon.ok{background:#0b3d28;}
.rc{display:flex;flex-direction:column;gap:3px;} .rc .k{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9fb0c4;}
.rc .v{font-size:19px;font-weight:800;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.rc .v.pos{color:#7ff0b4;}
.flag{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;}
.flag.ok{background:rgba(73,201,138,.2);color:#7ff0b4;} .flag.bad{background:rgba(255,139,122,.25);color:#ffb3a6;}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:16px 0;}
.panel h2{font-size:14px;margin:0 0 4px;} .panel p.sub{font-size:12.5px;color:var(--muted);margin:0 0 12px;}
.dtable{width:100%;border-collapse:collapse;}
.dtable th,.dtable td{padding:9px 10px;border-bottom:1px solid var(--line);font-size:13px;text-align:right;}
.dtable th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;}
.dtable th.l,.dtable td.l{text-align:left;} .dtable td{font-family:var(--mono);font-variant-numeric:tabular-nums;}
.dtable td.l{font-family:system-ui;font-weight:600;} .dtable tr:last-child td{border-bottom:none;}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px;}
.card-head{display:flex;align-items:baseline;gap:12px;margin-bottom:12px;} .card-head h2{font-size:16px;margin:0;font-weight:700;}
.tag{font-size:11px;color:var(--muted);background:var(--paper);padding:3px 9px;border-radius:20px;font-weight:600;}
.scroll{overflow-x:auto;margin:0 -2px;}
.grid{width:100%;border-collapse:collapse;min-width:560px;font-size:13px;font-family:var(--mono);font-variant-numeric:tabular-nums;}
.grid th,.grid td{padding:10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;}
.grid th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:700;font-family:system-ui;}
.grid th.l,.grid td.l{text-align:left;font-family:system-ui;font-weight:600;position:sticky;left:0;background:var(--surface);}
.grid tr.hold td{color:var(--hold);} .grid td.strong{font-weight:800;} .grid td.owe{color:var(--neg);} .grid td.clear{color:var(--pos);}
.grid td.paidcell{background:rgba(15,122,70,.1);color:var(--pos);}
.grid tfoot td{border-top:2px solid var(--line);font-weight:800;background:var(--paper);}
.tinychip{font-size:9px;font-weight:800;text-transform:uppercase;color:var(--hold);background:var(--accent-soft);padding:2px 6px;border-radius:9px;margin-left:6px;}
@media (max-width:640px){.recon{gap:16px;} .hide-sm{display:none;}}
`;

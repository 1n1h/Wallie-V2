import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, updateDoc,
  increment, query, orderBy, limit,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import {
  ROSTER, ROSTER_MAP, SPREAD, INTERVALS, BALANCE_PRESETS, LEVERAGE_OPTIONS,
  fetchQuotes, fetchLevels,
} from "../../config/demo";
import DeskChat from "./DeskChat";
import { MessageCircle } from "lucide-react";
import "./DemoDesk.css";

// ─── Demo Desk ───
// Paper trading on live markets, FTMO-style: pick a balance + leverage,
// trade the live chart, and every closed trade is written to the journal
// automatically (demoTrades). Demo funds only — nothing touches a broker.
const TONES = {
  support: { stroke: "#3fb27f", label: "#7bd7a8" },
  resistance: { stroke: "#e05d5d", label: "#ff9d9d" },
  trend: { stroke: "#4B90FF", label: "#9cc2ff" },
};

const fmtUSD = (n) =>
  (n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const fmtSigned = (n) =>
  n == null || Number.isNaN(n) ? "—" : `${n >= 0 ? "+" : "−"}${fmtUSD(Math.abs(n)).slice(0)}`.replace("−$", "-$");
const fmtPx = (p) => {
  if (p == null || Number.isNaN(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
};
const fmtR = (r) => (r == null || Number.isNaN(r) ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(1)}R`);
const fmtDur = (ms) => {
  if (!ms || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

export default function DemoDesk() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;

  const [account, setAccount] = useState(undefined); // undefined = loading, null = none
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [symbol, setSymbol] = useState("GOLD");
  const [interval, setIntervalCode] = useState("D");
  const [levels, setLevels] = useState(null);
  const [showLevels, setShowLevels] = useState(true);

  const [side, setSide] = useState("buy");
  const [notionalStr, setNotionalStr] = useState("5000");
  const [lev, setLev] = useState(50);
  const [stopStr, setStopStr] = useState("");
  const [targetStr, setTargetStr] = useState("");
  const autoFillRef = useRef(true);
  const [ticketError, setTicketError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const closingRef = useRef(new Set());

  // Setup form state
  const [setupBalance, setSetupBalance] = useState(50000);
  const [setupCustom, setSetupCustom] = useState("");
  const [setupLev, setSetupLev] = useState(50);

  // ── Subscriptions ──
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      setAccount(snap.exists() ? snap.data()?.demoAccount || null : null);
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users", uid, "demoPositions"), orderBy("openedAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users", uid, "demoTrades"), orderBy("closedAt", "desc"), limit(8));
    const unsub = onSnapshot(q, (snap) => {
      setTrades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (account?.leverage) setLev(account.leverage);
  }, [account?.leverage]);

  // ── Live quotes: selected symbol + every open position's symbol ──
  const pollSymbols = useMemo(
    () => [...new Set([symbol, ...positions.map((p) => p.symbol)])],
    [symbol, positions]
  );
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const q = await fetchQuotes(pollSymbols);
      if (alive && q && Object.keys(q).length) {
        setQuotes((prev) => ({ ...prev, ...q }));
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [pollSymbols.join(",")]);

  // ── Drawn levels for the chart ──
  useEffect(() => {
    let alive = true;
    setLevels(null);
    fetchLevels(symbol, interval).then((lv) => { if (alive) setLevels(lv); });
    return () => { alive = false; };
  }, [symbol, interval]);

  // ── Price helpers ──
  const pxFor = (sym) => {
    const q = quotes[sym];
    if (!q) return null;
    const s = (SPREAD[ROSTER_MAP[sym]?.cls] ?? 0.0003) / 2;
    return { mid: q.price, changePct: q.changePct, bid: q.price * (1 - s), ask: q.price * (1 + s) };
  };
  const exitFor = (pos) => {
    const px = pxFor(pos.symbol);
    if (!px) return null;
    return pos.direction === "buy" ? px.bid : px.ask;
  };
  const pnlFor = (pos, exitPx) => {
    if (exitPx == null) return null;
    const dir = pos.direction === "buy" ? 1 : -1;
    return dir * (exitPx / pos.entryPrice - 1) * pos.notional;
  };
  const riskFor = (pos) =>
    pos.stop ? pos.notional * (Math.abs(pos.entryPrice - pos.stop) / pos.entryPrice) : null;

  const rows = positions.map((p) => {
    const exitPx = exitFor(p);
    const pnl = pnlFor(p, exitPx);
    const risk = riskFor(p);
    return { ...p, exitPx, pnl, r: pnl != null && risk ? pnl / risk : null };
  });
  const floating = rows.reduce((a, r) => a + (r.pnl || 0), 0);
  const usedMargin = positions.reduce((a, p) => a + p.notional / (p.leverage || 1), 0);
  const balance = account?.balance ?? 0;
  const equity = balance + floating;
  const freeMargin = equity - usedMargin;
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;

  // ── Closing (manual / stop / target / stop-out / reset) ──
  const closePosition = async (pos, exitPrice, reason) => {
    if (!uid || closingRef.current.has(pos.id)) return;
    closingRef.current.add(pos.id);
    try {
      const pnl = pnlFor(pos, exitPrice);
      const risk = riskFor(pos);
      await updateDoc(doc(db, "users", uid), { "demoAccount.balance": increment(pnl || 0) });
      await addDoc(collection(db, "users", uid, "demoTrades"), {
        symbol: pos.symbol,
        direction: pos.direction,
        notional: pos.notional,
        leverage: pos.leverage,
        entryPrice: pos.entryPrice,
        exitPrice,
        stop: pos.stop || null,
        target: pos.target || null,
        pnl: pnl || 0,
        rMultiple: pnl != null && risk ? +(pnl / risk).toFixed(2) : null,
        openedAt: pos.openedAt,
        closedAt: Date.now(),
        durationMs: Date.now() - pos.openedAt,
        closeReason: reason,
        epoch: pos.epoch || 0,
      });
      await deleteDoc(doc(db, "users", uid, "demoPositions", pos.id));
    } catch (err) {
      console.error("closePosition:", err);
    } finally {
      closingRef.current.delete(pos.id);
    }
  };

  // Auto-close on ticks: stops, targets, margin stop-out.
  useEffect(() => {
    if (!account || !positions.length || !Object.keys(quotes).length) return;
    for (const pos of positions) {
      const exitPx = exitFor(pos);
      if (exitPx == null) continue;
      if (pos.stop && ((pos.direction === "buy" && exitPx <= pos.stop) || (pos.direction === "sell" && exitPx >= pos.stop))) {
        closePosition(pos, pos.stop, "stop");
      } else if (pos.target && ((pos.direction === "buy" && exitPx >= pos.target) || (pos.direction === "sell" && exitPx <= pos.target))) {
        closePosition(pos, pos.target, "target");
      }
    }
    if (usedMargin > 0 && equity < usedMargin * 0.5) {
      for (const pos of positions) {
        const exitPx = exitFor(pos);
        if (exitPx != null) closePosition(pos, exitPx, "stopout");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);

  // ── Ticket → open position ──
  const pxSel = pxFor(symbol);
  const entryRef = pxSel ? (side === "buy" ? pxSel.ask : pxSel.bid) : null;

  useEffect(() => {
    if (!levels || !autoFillRef.current) return;
    const ref = entryRef || levels.currentPrice;
    if (!ref) return;
    const sups = levels.drawings.filter((d) => d.type === "hline" && d.tone === "support" && d.price < ref).map((d) => d.price);
    const ress = levels.drawings.filter((d) => d.type === "hline" && d.tone === "resistance" && d.price > ref).map((d) => d.price);
    if (side === "buy") {
      if (sups.length) setStopStr(String(Math.max(...sups)));
      if (ress.length) setTargetStr(String(Math.min(...ress)));
    } else {
      if (ress.length) setStopStr(String(Math.min(...ress)));
      if (sups.length) setTargetStr(String(Math.max(...sups)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, side]);

  const openPosition = async () => {
    setTicketError("");
    if (!pxSel || entryRef == null) { setTicketError("Waiting for a live price — try again in a second."); return; }
    const notional = parseFloat(notionalStr);
    if (!notional || notional < 100) { setTicketError("Minimum position size is $100."); return; }
    const marginNeeded = notional / lev;
    if (marginNeeded > freeMargin) {
      setTicketError(`Not enough free margin — this needs ${fmtUSD(marginNeeded)}, you have ${fmtUSD(freeMargin)} free.`);
      return;
    }
    const stop = stopStr ? parseFloat(stopStr) : null;
    const target = targetStr ? parseFloat(targetStr) : null;
    if (stop != null && (Number.isNaN(stop) || (side === "buy" ? stop >= entryRef : stop <= entryRef))) {
      setTicketError(side === "buy" ? "For a buy, the stop must sit below the entry price." : "For a sell, the stop must sit above the entry price.");
      return;
    }
    if (target != null && (Number.isNaN(target) || (side === "buy" ? target <= entryRef : target >= entryRef))) {
      setTicketError(side === "buy" ? "For a buy, the target must sit above the entry price." : "For a sell, the target must sit below the entry price.");
      return;
    }
    try {
      await addDoc(collection(db, "users", uid, "demoPositions"), {
        symbol,
        tvSymbol: ROSTER_MAP[symbol]?.tv || `NASDAQ:${symbol}`,
        direction: side,
        notional,
        leverage: lev,
        entryPrice: entryRef,
        stop,
        target,
        openedAt: Date.now(),
        epoch: account?.epoch || 0,
      });
      autoFillRef.current = true;
    } catch (err) {
      console.error("openPosition:", err);
      setTicketError("Couldn't open the position — please try again.");
    }
  };

  const createAccount = async () => {
    const bal = setupCustom ? parseFloat(setupCustom) : setupBalance;
    if (!bal || bal < 1000) return;
    await setDoc(doc(db, "users", uid), {
      demoAccount: {
        balance: bal, startingBalance: bal, leverage: setupLev,
        epoch: 0, resets: 0, createdAt: Date.now(),
      },
    }, { merge: true });
  };

  const resetAccount = async () => {
    if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 4000); return; }
    setResetArmed(false);
    for (const pos of positions) {
      const exitPx = exitFor(pos);
      if (exitPx != null) await closePosition(pos, exitPx, "reset");
    }
    await setDoc(doc(db, "users", uid), {
      demoAccount: {
        ...account,
        balance: account.startingBalance,
        epoch: (account.epoch || 0) + 1,
        resets: (account.resets || 0) + 1,
      },
    }, { merge: true });
  };

  const deskContext = () => {
    const lines = [
      "THE USER IS ON THEIR DEMO DESK (paper trading with demo funds — NOT real money, no broker involved).",
      `Demo account: balance ${fmtUSD(balance)}, equity ${fmtUSD(equity)}, free margin ${fmtUSD(freeMargin)}, leverage 1:${account?.leverage || lev}.`,
    ];
    if (rows.length) {
      lines.push("Open demo positions:");
      for (const r of rows) {
        lines.push(`- ${r.symbol} ${r.direction === "buy" ? "LONG" : "SHORT"} ${fmtUSD(r.notional)} @ ${fmtPx(r.entryPrice)}, now ${fmtPx(r.exitPx)}, P&L ${fmtSigned(r.pnl)} (${fmtR(r.r)})${r.stop ? `, stop ${fmtPx(r.stop)}` : ""}${r.target ? `, target ${fmtPx(r.target)}` : ""}.`);
      }
    } else {
      lines.push("No open demo positions right now.");
    }
    lines.push(`They are looking at ${symbol} on the ${interval} timeframe${pxSel ? ` (live price ${fmtPx(pxSel.mid)})` : ""}. Answer with their desk in mind. This is education about their practice trading — never place trades for them; they press the buttons.`);
    return lines.join("\n");
  };

  // ── Chart ──
  const theme = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const tvSrc =
    "https://www.tradingview.com/widgetembed/?symbol=" +
    encodeURIComponent(ROSTER_MAP[symbol]?.tv || `NASDAQ:${symbol}`) +
    "&interval=" + encodeURIComponent(interval) +
    "&theme=" + theme +
    "&style=1&locale=en&toolbarbg=" + (theme === "light" ? "f4f0e7" : "2a2724") +
    "&symboledit=1&saveimage=0&withdateranges=1&hide_side_toolbar=0";
  const yFor = (price) =>
    levels ? Math.max(0, Math.min(100, ((levels.pMax - price) / (levels.pMax - levels.pMin)) * 100)) : 0;
  const drawn = levels
    ? levels.drawings.map((d) => {
        if (d.type === "hline") { const y = yFor(d.price); return { d, y1: y, y2: y, labelY: y }; }
        const slope = (d.p2 - d.p1) / (d.i2 - d.i1);
        const atStart = d.p1 - slope * d.i1;
        const atEnd = d.p1 + slope * (levels.count - 1 - d.i1);
        return { d, y1: yFor(atStart), y2: yFor(atEnd), labelY: yFor(atStart) };
      })
    : [];

  if (account === undefined) {
    return <div className="demo-wrap"><div className="demo-loading">Loading your demo desk…</div></div>;
  }

  if (!account) {
    return (
      <div className="demo-wrap">
        <div className="demo-setup demo-card">
          <h2>Open your demo account</h2>
          <p className="demo-sub">
            Practice trading on live markets with demo funds — FTMO-style. Nothing here touches a real
            broker, and every trade you close is written to your journal automatically.
          </p>
          <label className="demo-flabel">Starting balance</label>
          <div className="demo-presets">
            {BALANCE_PRESETS.map((b) => (
              <button
                key={b}
                className={`demo-preset ${!setupCustom && setupBalance === b ? "active" : ""}`}
                onClick={() => { setSetupBalance(b); setSetupCustom(""); }}
              >
                ${b.toLocaleString()}
              </button>
            ))}
          </div>
          <input
            className="demo-input"
            type="number"
            min="1000"
            placeholder="Or a custom amount (min $1,000)"
            value={setupCustom}
            onChange={(e) => setSetupCustom(e.target.value)}
          />
          <label className="demo-flabel">Leverage</label>
          <div className="demo-presets">
            {LEVERAGE_OPTIONS.map((l) => (
              <button key={l} className={`demo-preset ${setupLev === l ? "active" : ""}`} onClick={() => setSetupLev(l)}>
                1:{l}
              </button>
            ))}
          </div>
          <button className="demo-primary" onClick={createAccount}>Create demo account</button>
          <p className="demo-fine">Demo funds only — this never touches a real broker.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="demo-wrap">
      {/* Account strip */}
      <div className="demo-strip demo-card">
        <div className="demo-stat">
          <span className="demo-stat-label"><span className="desk-live-dot" /> Demo account</span>
          <span className="demo-stat-sub">Started {fmtUSD(account.startingBalance)} · resets {account.resets || 0}</span>
        </div>
        <div className="demo-stat"><span className="demo-stat-label">Balance</span><strong>{fmtUSD(balance)}</strong></div>
        <div className="demo-stat">
          <span className="demo-stat-label">Equity</span>
          <strong className={floating >= 0 ? "pos" : "neg"}>{fmtUSD(equity)}</strong>
        </div>
        <div className="demo-stat"><span className="demo-stat-label">Free margin</span><strong>{fmtUSD(freeMargin)}</strong></div>
        <div className="demo-stat">
          <span className="demo-stat-label">Margin level</span>
          <strong>{marginLevel == null ? "—" : `${Math.round(marginLevel)}%`}</strong>
        </div>
        <div className="demo-strip-actions">
          <span className="demo-lev-pill">1:{account.leverage}</span>
          <button className={`demo-ghost ${resetArmed ? "armed" : ""}`} onClick={resetAccount}>
            {resetArmed ? "Confirm reset?" : "Reset account"}
          </button>
        </div>
      </div>

      <div className="demo-grid">
        {/* Chart card */}
        <div className="demo-chart demo-card">
          <div className="demo-chart-head">
            <div className="demo-chart-title">
              <strong>{symbol}</strong>
              <span>{ROSTER_MAP[symbol]?.name}</span>
              {pxSel && (
                <span className={`demo-chart-px ${(pxSel.changePct ?? 0) >= 0 ? "pos" : "neg"}`}>
                  {fmtPx(pxSel.mid)}{pxSel.changePct != null ? ` ${pxSel.changePct >= 0 ? "▲" : "▼"} ${Math.abs(pxSel.changePct)}%` : ""}
                </span>
              )}
            </div>
            <div className="demo-ivpills">
              {INTERVALS.map((iv) => (
                <button key={iv.code} className={interval === iv.code ? "active" : ""} onClick={() => setIntervalCode(iv.code)}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
          <div className="demo-chart-tv">
            <iframe title={`${symbol} live chart`} src={tvSrc} style={{ width: "100%", height: "100%", border: 0, display: "block" }} allowFullScreen />
            {showLevels && levels && (
              <>
                <svg className="chart-levels-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {drawn.map(({ d, y1, y2 }, i) => (
                    <line key={i} x1="0" y1={y1} x2="100" y2={y2} stroke={TONES[d.tone].stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                {drawn.map(({ d, labelY }, i) => (
                  <span key={i} className="chart-lvl-label" style={{ top: `${labelY}%`, color: TONES[d.tone].label, borderColor: TONES[d.tone].stroke }}>
                    {d.label}
                  </span>
                ))}
              </>
            )}
          </div>
          <div className="demo-chart-cap">
            <span>{symbol} · live chart by TradingView{levels ? " · Wallie's levels, drawn from real market data" : ""}</span>
            {levels && (
              <button className="demo-linkbtn" onClick={() => setShowLevels(!showLevels)}>
                {showLevels ? "Hide levels" : "Show levels"}
              </button>
            )}
          </div>
        </div>

        {/* Right rail: ticket + positions */}
        <div className="demo-rail">
          <div className="demo-ticket demo-card">
            <h3>New position</h3>
            <select className="demo-input" value={symbol} onChange={(e) => { setSymbol(e.target.value); autoFillRef.current = true; }} aria-label="Symbol">
              {ROSTER.map((r) => (
                <option key={r.symbol} value={r.symbol}>{r.symbol} — {r.name}</option>
              ))}
            </select>
            <div className="demo-bidask">
              <div className="demo-ba sell">
                <span>Sell</span><strong>{pxSel ? fmtPx(pxSel.bid) : "…"}</strong>
              </div>
              <div className="demo-ba buy">
                <span>Buy</span><strong>{pxSel ? fmtPx(pxSel.ask) : "…"}</strong>
              </div>
            </div>
            <div className="demo-sides">
              <button className={`demo-side sell ${side === "sell" ? "active" : ""}`} onClick={() => setSide("sell")}>SELL</button>
              <button className={`demo-side buy ${side === "buy" ? "active" : ""}`} onClick={() => setSide("buy")}>BUY</button>
            </div>
            <label className="demo-flabel">Size (notional $)</label>
            <input className="demo-input" type="number" min="100" step="100" value={notionalStr} onChange={(e) => setNotionalStr(e.target.value)} />
            <label className="demo-flabel">Leverage</label>
            <select className="demo-input" value={lev} onChange={(e) => setLev(parseInt(e.target.value, 10))}>
              {LEVERAGE_OPTIONS.map((l) => <option key={l} value={l}>1:{l}</option>)}
            </select>
            <div className="demo-stoptarget">
              <div>
                <label className="demo-flabel">Stop loss</label>
                <input className="demo-input" type="number" placeholder="Optional" value={stopStr}
                  onChange={(e) => { autoFillRef.current = false; setStopStr(e.target.value); }} />
              </div>
              <div>
                <label className="demo-flabel">Take profit</label>
                <input className="demo-input" type="number" placeholder="Optional" value={targetStr}
                  onChange={(e) => { autoFillRef.current = false; setTargetStr(e.target.value); }} />
              </div>
            </div>
            {levels && <p className="demo-hint">Stop/target prefilled from Wallie's drawn levels — adjust freely.</p>}
            {ticketError && <p className="demo-error">{ticketError}</p>}
            <button className={`demo-open ${side}`} onClick={openPosition}>
              Open {side === "buy" ? "BUY" : "SELL"} position
            </button>
            <p className="demo-fine">Demo funds only — this never touches a real broker.</p>
          </div>

          <div className="demo-positions demo-card">
            <h3>Open positions {positions.length > 0 && <span className="demo-count">{positions.length}</span>}</h3>
            {rows.length === 0 && <p className="demo-empty">No open positions. Your first trade is a click away.</p>}
            {rows.map((r) => (
              <div key={r.id} className="demo-pos">
                <div className="demo-pos-main">
                  <span className={`demo-dir ${r.direction}`}>{r.direction === "buy" ? "LONG" : "SHORT"}</span>
                  <div>
                    <strong>{r.symbol}</strong>
                    <span className="demo-pos-sub">{fmtUSD(r.notional)} @ {fmtPx(r.entryPrice)} · {fmtDur(Date.now() - r.openedAt)}</span>
                    {(r.stop || r.target) && (
                      <span className="demo-pos-sub">
                        {r.stop ? `SL ${fmtPx(r.stop)}` : ""}{r.stop && r.target ? " · " : ""}{r.target ? `TP ${fmtPx(r.target)}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="demo-pos-right">
                  <strong className={r.pnl >= 0 ? "pos" : "neg"}>{r.pnl == null ? "—" : `${fmtSigned(r.pnl)}`}</strong>
                  <span className="demo-pos-sub">{fmtR(r.r)}</span>
                  <button className="demo-close" onClick={() => { if (r.exitPx != null) closePosition(r, r.exitPx, "manual"); }}>
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Journal strip */}
      <div className="demo-journal demo-card">
        <div className="demo-journal-head">
          <h3>Journal — auto-logged from your demo trades</h3>
          <button className="demo-linkbtn" onClick={() => navigate("/chat")}>Review my journal →</button>
        </div>
        {trades.length === 0 && <p className="demo-empty">Closed trades land here automatically, with their R multiple and how they ended.</p>}
        <div className="demo-trades">
          {trades.map((t) => (
            <div key={t.id} className="demo-trade">
              <span className={`demo-trade-bar ${t.pnl >= 0 ? "win" : "loss"}`} />
              <strong>{t.symbol}</strong>
              <span>{t.direction === "buy" ? "long" : "short"} · closed <b className={t.pnl >= 0 ? "pos" : "neg"}>{fmtR(t.rMultiple)}</b> ({fmtSigned(t.pnl)})</span>
              <span className="demo-pos-sub">
                held {fmtDur(t.durationMs)} · {t.closeReason === "stop" ? "stop respected" : t.closeReason === "target" ? "hit target" : t.closeReason === "stopout" ? "margin stop-out" : t.closeReason === "reset" ? "closed on reset" : "manual close"} · Logged ✓
              </span>
            </div>
          ))}
        </div>
      </div>

      <button className="demo-ask" onClick={() => setChatOpen(true)}>
        <MessageCircle size={18} /> Ask Wallie
      </button>
      <DeskChat open={chatOpen} onClose={() => setChatOpen(false)} deskContext={deskContext} />
    </div>
  );
}

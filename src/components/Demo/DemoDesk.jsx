import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Context } from "../../context/Context";
import {
  collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, updateDoc,
  increment, query, orderBy, limit, arrayUnion,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import {
  ROSTER, ROSTER_MAP, SPREAD, INTERVALS, BALANCE_PRESETS, LEVERAGE_OPTIONS,
  fetchQuotes, fetchLevels,
} from "../../config/demo";
import DeskChat from "./DeskChat";
import DeskChart, { orderKindFor, ORDER_LABEL } from "./DeskChart";

const INDICATOR_DEFS = [
  { key: "ema", label: "EMA 20 / 50", note: "overlay" },
  { key: "sma", label: "SMA 50 / 200", note: "overlay" },
  { key: "bb", label: "Bollinger Bands", note: "20 · 2σ" },
  { key: "vwap", label: "VWAP", note: "daily reset" },
  { key: "rsi", label: "RSI 14", note: "pane" },
  { key: "macd", label: "MACD", note: "12 · 26 · 9" },
  { key: "stoch", label: "Stochastic", note: "14 · 3" },
];
import SentimentGauge from "./SentimentGauge";
import { MessageCircle, ChevronUp, ChevronDown } from "lucide-react";

// Desk actions from chat are executed exactly once per message, even if
// the desk unmounts and remounts within the session.
const executedDeskActions = new Set();
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
  const { chatHistory } = useContext(Context);
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
  const [indicators, setIndicators] = useState(() => {
    try { return { ema: true, sma: false, bb: false, vwap: false, rsi: true, macd: false, stoch: false, ...JSON.parse(localStorage.getItem("wallie_desk_indicators") || "{}") }; }
    catch { return { ema: true, sma: false, bb: false, vwap: false, rsi: true, macd: false, stoch: false }; }
  });
  const [indOpen, setIndOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("wallie_desk_indicators", JSON.stringify(indicators)); } catch { /* ignore */ }
  }, [indicators]);
  const toggleIndicator = (key) => setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  const [railOpen, setRailOpen] = useState({ ticket: true, orders: true, positions: true, sentiment: true });
  const toggleRail = (key) => setRailOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const collapsedByChatRef = useRef(false);

  // Docked chat needs room on desktop: tuck the app sidebar away while
  // the chat is open, and put it back when the chat closes.
  useEffect(() => {
    if (chatOpen && typeof window !== "undefined" && window.innerWidth >= 1280) {
      collapsedByChatRef.current = true;
      window.dispatchEvent(new CustomEvent("wallie:sidebar-collapse"));
    } else if (!chatOpen && collapsedByChatRef.current) {
      collapsedByChatRef.current = false;
      window.dispatchEvent(new CustomEvent("wallie:sidebar-restore"));
    }
  }, [chatOpen]);
  const [chartEngine, setChartEngine] = useState(() => localStorage.getItem("wallie_desk_chart") || "wallie");
  const [actionLog, setActionLog] = useState([]);
  const [toolMode, setToolMode] = useState("off");
  const [toolNotice, setToolNotice] = useState(null);
  // Position-tool plans live per symbol and persist (localStorage), so a
  // mockup on GOLD is still there when you come back to GOLD.
  const [plansBySymbol, setPlansBySymbol] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wallie_desk_plans") || "{}"); } catch { return {}; }
  });
  const [activePlanMap, setActivePlanMap] = useState({});
  const [orders, setOrders] = useState([]);
  const fillingRef = useRef(new Set());
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
    const q = query(collection(db, "users", uid, "demoOrders"), orderBy("placedAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  useEffect(() => {
    try { localStorage.setItem("wallie_desk_plans", JSON.stringify(plansBySymbol)); } catch { /* storage full/blocked */ }
  }, [plansBySymbol]);

  // Self-heal: an armed order always has its plan box, even on a fresh
  // device where localStorage has never seen it.
  useEffect(() => {
    if (!orders.length) return;
    setPlansBySymbol((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const o of orders) {
        const arr = next[o.symbol] || [];
        if (!arr.some((p) => p.id === o.planId)) {
          changed = true;
          next[o.symbol] = [...arr, {
            id: o.planId, direction: o.direction, entry: o.entryPrice,
            stop: o.stop, target: o.target, t1: o.t1, t2: o.t2,
            status: "armed", orderId: o.id, orderType: o.orderType,
          }];
        }
      }
      return changed ? next : prev;
    });
  }, [orders]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "users", uid, "demoTrades"), orderBy("closedAt", "desc"), limit(300));
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
    () => [...new Set([symbol, ...positions.map((p) => p.symbol), ...orders.map((o) => o.symbol)])],
    [symbol, positions, orders]
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

  // ── Drawn levels + candles for the chart (refreshed on a slow poll) ──
  useEffect(() => {
    let alive = true;
    setLevels(null);
    const load = () => fetchLevels(symbol, interval).then((lv) => { if (alive && lv) setLevels(lv); });
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
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
      "[[DESK_MODE]]",
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

  // ── Agentic desk actions: Wallie (via chat) operates the desk ──
  const logAct = (text, ok = true) =>
    setActionLog((prev) => [...prev.slice(-3), { id: `${Date.now()}-${Math.random()}`, text, ok }]);

  // Suggestion-chip quick action: a level alert in the same watches store
  // the chat's action chips use (surfaces in the Activity tab).
  const quickWatch = async (sym, level) => {
    if (!uid || level == null) return;
    try {
      await updateDoc(doc(db, "users", uid), {
        watches: arrayUnion({
          id: `w${Date.now()}`,
          symbol: sym,
          label: `Watching ${sym}`,
          level,
          createdAt: Date.now(),
        }),
      });
      logAct(`Alert set — watching ${sym} at ${fmtPx(level)} (it'll show in your Activity tab)`);
    } catch (err) {
      console.error("quickWatch:", err);
      logAct("Couldn't set that alert — try again", false);
    }
  };

  const executeDeskActions = async (actions) => {
    for (const a of actions) {
      try {
        if (a.type === "show_symbol") {
          if (!ROSTER_MAP[a.symbol]) { logAct(`I don't trade ${a.symbol} on this desk yet`, false); continue; }
          setSymbol(a.symbol);
          if (a.interval) setIntervalCode(a.interval);
          logAct(`Showing ${a.symbol} on your chart — levels drawn`);
        } else if (a.type === "open_position") {
          const meta = ROSTER_MAP[a.symbol];
          if (!meta) { logAct(`I don't trade ${a.symbol} on this desk yet`, false); continue; }
          const q = await fetchQuotes([a.symbol]);
          const mid = q[a.symbol]?.price;
          if (!mid) { logAct(`Couldn't get a live price for ${a.symbol} — position not opened`, false); continue; }
          const half = (SPREAD[meta.cls] ?? 0.0003) / 2;
          const entry = a.direction === "buy" ? mid * (1 + half) : mid * (1 - half);
          const lv = await fetchLevels(a.symbol, interval);
          let stop = null;
          if (lv) {
            const sups = lv.drawings.filter((d) => d.type === "hline" && d.tone === "support" && d.price < entry).map((d) => d.price);
            const ress = lv.drawings.filter((d) => d.type === "hline" && d.tone === "resistance" && d.price > entry).map((d) => d.price);
            stop = a.direction === "buy" ? (sups.length ? Math.max(...sups) : null) : (ress.length ? Math.min(...ress) : null);
          }
          let stopNote = "";
          if (!stop) {
            stop = entry * (a.direction === "buy" ? 0.9965 : 1.0035);
            stopNote = " (no clean level nearby — 0.35% stop)";
          }
          const target = a.rr ? entry + (a.direction === "buy" ? 1 : -1) * a.rr * Math.abs(entry - stop) : null;
          const notional = a.notional || parseFloat(notionalStr) || 5000;
          const useLev = a.leverage || lev;
          if (notional / useLev > freeMargin) {
            logAct(`Not enough free margin for a ${fmtUSD(notional)} ${a.symbol} position — not opened`, false);
            continue;
          }
          await addDoc(collection(db, "users", uid, "demoPositions"), {
            symbol: a.symbol,
            tvSymbol: meta.tv,
            direction: a.direction,
            notional,
            leverage: useLev,
            entryPrice: entry,
            stop,
            target,
            openedAt: Date.now(),
            epoch: account?.epoch || 0,
            source: "wallie",
          });
          logAct(`Opened ${a.direction === "buy" ? "BUY" : "SELL"} ${a.symbol} ${fmtUSD(notional)} @ ${fmtPx(entry)} · 1:${useLev} · stop ${fmtPx(stop)}${target ? ` · target ${fmtPx(target)} (${a.rr}R)` : ""}${stopNote}`);
        } else if (a.type === "close_position") {
          const targets = a.all ? positions : positions.filter((p) => p.symbol === a.symbol);
          if (!targets.length) { logAct(a.all ? "No open positions to close" : `No open ${a.symbol} position to close`, false); continue; }
          for (const pos of targets) {
            const q = await fetchQuotes([pos.symbol]);
            const mid = q[pos.symbol]?.price;
            if (!mid) { logAct(`Couldn't price ${pos.symbol} to close it`, false); continue; }
            const half = (SPREAD[ROSTER_MAP[pos.symbol]?.cls] ?? 0.0003) / 2;
            const exit = pos.direction === "buy" ? mid * (1 - half) : mid * (1 + half);
            await closePosition(pos, exit, "manual");
            logAct(`Closed ${pos.symbol} ${pos.direction === "buy" ? "LONG" : "SHORT"} @ ${fmtPx(exit)}`);
          }
        }
      } catch (err) {
        console.error("desk action error:", err);
        logAct("That action didn't go through — try again", false);
      }
    }
  };

  useEffect(() => {
    if (!account || !chatHistory?.length) return;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.type === "ai" && Array.isArray(msg.desk) && msg.desk.length) {
        const key = `${msg.chatId || ""}:${i}:${JSON.stringify(msg.desk)}`;
        if (!executedDeskActions.has(key)) {
          executedDeskActions.add(key);
          executeDeskActions(msg.desk);
        }
        break; // only the latest action-bearing message
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatHistory]);

  // ── Position tool v2: per-symbol plan boxes, pending orders, live sync ──
  useEffect(() => {
    if (chartEngine === "tv" && toolMode !== "off") setToolMode("off");
  }, [chartEngine, toolMode]);

  const currentPlans = plansBySymbol[symbol] || [];
  const activePlanId = activePlanMap[symbol] || currentPlans[currentPlans.length - 1]?.id || null;

  const updatePlans = (sym, next) =>
    setPlansBySymbol((prev) => ({ ...prev, [sym]: next }));

  const syncTicketFromPlan = (plan) => {
    if (!plan || plan.status !== "draft") return;
    autoFillRef.current = false;
    setSide(plan.direction);
    setStopStr(String(+plan.stop.toFixed(6)));
    setTargetStr(String(+plan.target.toFixed(6)));
  };

  const handleSelectPlan = (id) => {
    setActivePlanMap((prev) => ({ ...prev, [symbol]: id }));
    const plan = (plansBySymbol[symbol] || []).find((p) => p.id === id);
    if (plan) syncTicketFromPlan(plan);
  };

  // Plan geometry changed (drag end / create): persist, sync the ticket,
  // and — the important part — adjust any live trade or armed order the
  // plan is attached to.
  const handlePlansChange = (next) => {
    updatePlans(symbol, next);
    for (const plan of next) {
      if (plan.orderId) {
        const px = pxFor(symbol);
        const kind = px ? orderKindFor(plan, px.bid, px.ask) : plan.orderType;
        updateDoc(doc(db, "users", uid, "demoOrders", plan.orderId), {
          entryPrice: plan.entry, stop: plan.stop, target: plan.target, t2: plan.t2, orderType: kind,
        }).catch((e) => console.error("order sync:", e));
        if (kind !== plan.orderType) {
          updatePlans(symbol, next.map((p) => (p.id === plan.id ? { ...p, orderType: kind } : p)));
        }
      }
      if (plan.positionId) {
        updateDoc(doc(db, "users", uid, "demoPositions", plan.positionId), {
          stop: plan.stop, target: plan.target,
        }).catch((e) => console.error("position sync:", e));
      }
    }
    const active = next.find((p) => p.id === activePlanId);
    if (active) syncTicketFromPlan(active);
  };

  const patchPlan = (sym, planId, patch) =>
    setPlansBySymbol((prev) => ({
      ...prev,
      [sym]: (prev[sym] || []).map((p) => (p.id === planId ? { ...p, ...patch } : p)),
    }));

  const openFromTool = async (plan) => {
    const meta = ROSTER_MAP[symbol];
    const q = await fetchQuotes([symbol]);
    const mid = q[symbol]?.price;
    if (!mid) { setToolNotice("Couldn't get a live price — position not opened"); return; }
    const half = (SPREAD[meta?.cls] ?? 0.0003) / 2;
    const liveEntry = plan.direction === "buy" ? mid * (1 + half) : mid * (1 - half);
    const delta = liveEntry - plan.entry;
    const stop = plan.stop + delta;
    const target = plan.target + delta;
    const notional = parseFloat(notionalStr) || 5000;
    if (notional / lev > freeMargin) {
      setToolNotice(`Not enough free margin — this needs ${fmtUSD(notional / lev)}, you have ${fmtUSD(freeMargin)} free`);
      return;
    }
    try {
      const ref = await addDoc(collection(db, "users", uid, "demoPositions"), {
        symbol,
        tvSymbol: meta?.tv || `NASDAQ:${symbol}`,
        direction: plan.direction,
        notional,
        leverage: lev,
        entryPrice: liveEntry,
        stop,
        target,
        openedAt: Date.now(),
        epoch: account?.epoch || 0,
        source: "position-tool",
      });
      patchPlan(symbol, plan.id, { status: "filled", positionId: ref.id });
      const msg = `Filled ${plan.direction === "buy" ? "BUY" : "SELL"} ${symbol} @ ${fmtPx(liveEntry)} · stop ${fmtPx(stop)} · target ${fmtPx(target)}`;
      setToolNotice(msg);
      logAct(msg);
      setTimeout(() => setToolNotice(null), 7000);
    } catch (err) {
      console.error("openFromTool:", err);
      setToolNotice("Couldn't open the position — please try again");
    }
  };

  const placePendingOrder = async (plan, kind) => {
    const notional = parseFloat(notionalStr) || 5000;
    if (notional / lev > freeMargin) {
      setToolNotice(`Not enough free margin — this needs ${fmtUSD(notional / lev)}, you have ${fmtUSD(freeMargin)} free`);
      return;
    }
    try {
      const ref = await addDoc(collection(db, "users", uid, "demoOrders"), {
        symbol,
        direction: plan.direction,
        orderType: kind,
        entryPrice: plan.entry,
        stop: plan.stop,
        target: plan.target,
        notional,
        leverage: lev,
        t1: plan.t1,
        t2: plan.t2,
        planId: plan.id,
        placedAt: Date.now(),
        epoch: account?.epoch || 0,
      });
      patchPlan(symbol, plan.id, { status: "armed", orderId: ref.id, orderType: kind });
      const msg = `${ORDER_LABEL[kind]} armed on ${symbol} @ ${fmtPx(plan.entry)} · stop ${fmtPx(plan.stop)} · target ${fmtPx(plan.target)}`;
      setToolNotice(msg);
      logAct(msg);
      setTimeout(() => setToolNotice(null), 7000);
    } catch (err) {
      console.error("placePendingOrder:", err);
      setToolNotice("Couldn't place the order — please try again");
    }
  };

  const handleTrade = (plan) => {
    const px = pxFor(symbol);
    if (!px) { setToolNotice("Waiting for a live price — try again in a second"); return; }
    const kind = orderKindFor(plan, px.bid, px.ask);
    if (kind === "market") openFromTool(plan);
    else placePendingOrder(plan, kind);
  };

  const handleCancelOrder = async (plan, sym = symbol) => {
    if (plan?.orderId) {
      try { await deleteDoc(doc(db, "users", uid, "demoOrders", plan.orderId)); } catch { /* already gone */ }
    }
    if (plan) patchPlan(sym, plan.id, { status: "draft", orderId: null, orderType: null });
    const msg = `Order cancelled on ${sym}`;
    setToolNotice(msg);
    logAct(msg);
  };

  const handleRemovePlan = (id) => {
    const plan = currentPlans.find((p) => p.id === id);
    if (plan?.orderId) handleCancelOrder(plan);
    updatePlans(symbol, currentPlans.filter((p) => p.id !== id));
  };

  // Pending-order fills: watched on every quote tick.
  const fillOrder = async (order, px) => {
    if (fillingRef.current.has(order.id)) return;
    fillingRef.current.add(order.id);
    try {
      const meta = ROSTER_MAP[order.symbol];
      const half = (SPREAD[meta?.cls] ?? 0.0003) / 2;
      const fill = order.direction === "buy" ? order.entryPrice * (1 + half) : order.entryPrice * (1 - half);
      const ref = await addDoc(collection(db, "users", uid, "demoPositions"), {
        symbol: order.symbol,
        tvSymbol: meta?.tv || `NASDAQ:${order.symbol}`,
        direction: order.direction,
        notional: order.notional,
        leverage: order.leverage,
        entryPrice: fill,
        stop: order.stop,
        target: order.target,
        openedAt: Date.now(),
        epoch: order.epoch || 0,
        source: "pending-order",
      });
      await deleteDoc(doc(db, "users", uid, "demoOrders", order.id));
      patchPlan(order.symbol, order.planId, { status: "filled", positionId: ref.id, orderId: null, orderType: null });
      const msg = `Your ${order.symbol} ${ORDER_LABEL[order.orderType] || "order"} filled @ ${fmtPx(fill)} · stop ${fmtPx(order.stop)} · target ${fmtPx(order.target)}`;
      setToolNotice(msg);
      logAct(msg);
    } catch (err) {
      console.error("fillOrder:", err);
    } finally {
      fillingRef.current.delete(order.id);
    }
  };

  useEffect(() => {
    if (!orders.length || !Object.keys(quotes).length) return;
    for (const order of orders) {
      const px = pxFor(order.symbol);
      if (!px) continue;
      const hit = order.direction === "buy"
        ? (order.orderType === "buy-stop" ? px.ask >= order.entryPrice : px.ask <= order.entryPrice)
        : (order.orderType === "sell-stop" ? px.bid <= order.entryPrice : px.bid >= order.entryPrice);
      if (hit) fillOrder(order, px);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, orders]);

  // Account-run stats for the top strip: win rate over this epoch's
  // closed trades, and straight realized P&L (balance vs starting).
  const epochTrades = account ? trades.filter((t) => (t.epoch || 0) === (account.epoch || 0)) : [];
  const wins = epochTrades.filter((t) => (t.pnl || 0) > 0).length;
  const winRate = epochTrades.length ? Math.round((wins / epochTrades.length) * 100) : null;
  const totalPL = account ? account.balance - account.startingBalance : 0;

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
    <div className={`demo-shell ${chatOpen ? "chat-open" : ""}`}>
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
        <div className="demo-stat">
          <span className="demo-stat-label">Win rate</span>
          <strong>{winRate == null ? "—" : `${winRate}%`}</strong>
        </div>
        <div className="demo-stat">
          <span className="demo-stat-label">P&amp;L</span>
          <strong className={totalPL > 0 ? "pos" : totalPL < 0 ? "neg" : ""}>{totalPL > 0 ? "+" : totalPL < 0 ? "−" : ""}{fmtUSD(totalPL)}</strong>
        </div>
        <div className="demo-strip-actions">
          <span className="demo-lev-pill">1:{account.leverage}</span>
          <button className={`demo-ghost ${resetArmed ? "armed" : ""}`} onClick={resetAccount}>
            {resetArmed ? "Confirm reset?" : "Reset account"}
          </button>
        </div>
      </div>

      <div className="demo-grid">
        <div className="demo-main-col">
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
            <div className="demo-chart-switches">
              {chartEngine === "wallie" && (
                <div className="demo-ivpills">
                  <button className={toolMode === "long" ? "active tool-long" : ""} onClick={() => setToolMode(toolMode === "long" ? "off" : "long")}>Long</button>
                  <button className={toolMode === "short" ? "active tool-short" : ""} onClick={() => setToolMode(toolMode === "short" ? "off" : "short")}>Short</button>
                </div>
              )}
              {chartEngine === "wallie" && (
                <div className="demo-ind-dd">
                  <button className={`demo-ind-btn ${indOpen ? "open" : ""}`} onClick={() => setIndOpen(!indOpen)}>
                    Indicators
                    <span className="demo-ind-count">{Object.values(indicators).filter(Boolean).length}</span>
                    <ChevronDown size={14} />
                  </button>
                  {indOpen && (
                    <>
                      <div className="demo-ind-backdrop" onClick={() => setIndOpen(false)} />
                      <div className="demo-ind-menu">
                        {INDICATOR_DEFS.map((d) => (
                          <label key={d.key} className="demo-ind-row">
                            <input type="checkbox" checked={!!indicators[d.key]} onChange={() => toggleIndicator(d.key)} />
                            <span className="demo-ind-name">{d.label}</span>
                            <span className="demo-ind-note">{d.note}</span>
                          </label>
                        ))}
                        <p className="demo-ind-foot">Computed by Wallie from the same candles. VWAP needs volume — unavailable on crypto feeds.</p>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="demo-ivpills">
                <button className={chartEngine === "wallie" ? "active" : ""} onClick={() => { setChartEngine("wallie"); localStorage.setItem("wallie_desk_chart", "wallie"); }}>Wallie chart</button>
                <button className={chartEngine === "tv" ? "active" : ""} onClick={() => { setChartEngine("tv"); localStorage.setItem("wallie_desk_chart", "tv"); }}>TradingView</button>
              </div>
              <div className="demo-ivpills">
                {INTERVALS.map((iv) => (
                  <button key={iv.code} className={interval === iv.code ? "active" : ""} onClick={() => setIntervalCode(iv.code)}>
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="demo-chart-tv">
            {chartEngine === "tv" ? (
              <>
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
              </>
            ) : levels?.candles?.length ? (
              <DeskChart
                key={symbol}
                candles={levels.candles}
                drawings={showLevels ? levels.drawings : []}
                theme={theme}
                chartKey={`${symbol}-${interval}`}
                toolMode={toolMode}
                sizeNotional={parseFloat(notionalStr) || 0}
                liveQuote={pxSel ? { bid: pxSel.bid, ask: pxSel.ask } : null}
                plans={currentPlans}
                activePlanId={activePlanId}
                onSelectPlan={handleSelectPlan}
                onPlansChange={handlePlansChange}
                onTrade={handleTrade}
                onCancelOrder={handleCancelOrder}
                onRemovePlan={handleRemovePlan}
                notice={toolNotice}
                indicators={indicators}
              />
            ) : (
              <div className="demo-chart-loading">Loading chart data…</div>
            )}
          </div>
          <div className="demo-chart-cap">
            <span>
              {chartEngine === "tv"
                ? `${symbol} · live chart by TradingView${levels ? " · Wallie's levels, drawn from real market data" : ""}`
                : `${symbol} · Wallie chart — candles & levels from the same real market data, so the lines move with the chart`}
            </span>
            {levels && (
              <button className="demo-linkbtn" onClick={() => setShowLevels(!showLevels)}>
                {showLevels ? "Hide levels" : "Show levels"}
              </button>
            )}
          </div>
        </div>

        {/* Journal — lives in the chart column, directly under the chart */}
        <div className="demo-journal demo-card">
          <div className="demo-journal-head">
            <h3>Journal — auto-logged from your demo trades</h3>
            <button className="demo-linkbtn" onClick={() => navigate("/chat")}>Review my journal →</button>
          </div>
          {trades.length === 0 && <p className="demo-empty">Closed trades land here automatically, with their R multiple and how they ended.</p>}
          <div className="demo-trades">
            {trades.slice(0, 8).map((t) => (
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
        </div>

        {/* Right rail: ticket + positions */}
        <div className="demo-rail">
          <div className="demo-ticket demo-card">
            <div className="demo-card-head">
              <h3>New position</h3>
              <button className="demo-collapse" onClick={() => toggleRail("ticket")} aria-label={railOpen.ticket ? "Collapse new position" : "Expand new position"}>
                {railOpen.ticket ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {railOpen.ticket && (<>
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
            </>)}
          </div>

          {orders.length > 0 && (
            <div className="demo-positions demo-card">
              <div className="demo-card-head">
                <h3>Pending orders <span className="demo-count">{orders.length}</span></h3>
                <button className="demo-collapse" onClick={() => toggleRail("orders")} aria-label={railOpen.orders ? "Collapse pending orders" : "Expand pending orders"}>
                  {railOpen.orders ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              {railOpen.orders && orders.map((o) => (
                <div key={o.id} className="demo-pos">
                  <div className="demo-pos-main">
                    <span className={`demo-dir ${o.direction}`}>{ORDER_LABEL[o.orderType] || "ORDER"}</span>
                    <div>
                      <strong>{o.symbol}</strong>
                      <span className="demo-pos-sub">{fmtUSD(o.notional)} @ {fmtPx(o.entryPrice)} · 1:{o.leverage}</span>
                      <span className="demo-pos-sub">SL {fmtPx(o.stop)} · TP {fmtPx(o.target)}</span>
                    </div>
                  </div>
                  <div className="demo-pos-right">
                    <button className="demo-close" onClick={() => handleCancelOrder({ id: o.planId, orderId: o.id }, o.symbol)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="demo-positions demo-card">
            <div className="demo-card-head">
              <h3>Open positions {positions.length > 0 && <span className="demo-count">{positions.length}</span>}</h3>
              <button className="demo-collapse" onClick={() => toggleRail("positions")} aria-label={railOpen.positions ? "Collapse open positions" : "Expand open positions"}>
                {railOpen.positions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {rows.length === 0 && <p className="demo-empty">No open positions. Your first trade is a click away.</p>}
            {railOpen.positions && (<div className="demo-pos-list">
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
            </div>)}
          </div>

          <div className="demo-positions demo-card">
            <div className="demo-card-head">
              <h3>Sentiment — {symbol}</h3>
              <button className="demo-collapse" onClick={() => toggleRail("sentiment")} aria-label={railOpen.sentiment ? "Collapse sentiment" : "Expand sentiment"}>
                {railOpen.sentiment ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {railOpen.sentiment && (
              <div className="demo-sentiment-body">
                <SentimentGauge
                  tvSymbol={ROSTER_MAP[symbol]?.tv || `NASDAQ:${symbol}`}
                  interval={{ "1": "1m", "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W" }[interval] || "1h"}
                  theme={theme}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>

    {!chatOpen && (
      <button className="demo-ask" onClick={() => setChatOpen(true)}>
        <MessageCircle size={18} /> Ask Wallie
      </button>
    )}
    {chatOpen && (
      <div className="demo-chatdock">
        <DeskChat
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          deskContext={deskContext}
          actionLog={actionLog}
          chipCtx={(() => {
            const hlines = (levels?.drawings || []).filter((d) => d.type === "hline");
            const mid = pxSel?.mid ?? levels?.currentPrice ?? null;
            const resAbove = hlines.filter((d) => d.tone === "resistance" && (mid == null || d.price > mid)).map((d) => d.price).sort((a, b) => a - b)[0];
            const supBelow = hlines.filter((d) => d.tone === "support" && (mid == null || d.price < mid)).map((d) => d.price).sort((a, b) => b - a)[0];
            const alertLevel = resAbove ?? supBelow ?? null;
            return {
              symbol,
              interval,
              hasPosOnSymbol: positions.some((p) => p.symbol === symbol),
              nearestRes: alertLevel != null ? fmtPx(alertLevel) : null,
              alertLevel,
            };
          })()}
          onQuickWatch={quickWatch}
        />
      </div>
    )}
    </div>
  );
}

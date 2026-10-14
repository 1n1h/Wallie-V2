import { useEffect, useRef, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";

// Wallie's own chart (TradingView's open-source lightweight-charts).
// Candles come from the same server series the levels are computed from,
// and the levels are native price lines — pinned to their prices, moving
// WITH the chart on zoom/pan.
//
// Position tool v2: plans are BOXES over a time range (drag the right
// edge to resize), several can live on one chart, kept per symbol by the
// desk; a plan can be traded at market or armed as a pending order.
// Indicators are computed in-house from the same candles and selected
// from the desk's Indicators dropdown (the `indicators` prop).
const TONE_COLOR = { support: "#3fb27f", resistance: "#e05d5d", trend: "#4B90FF" };

const fmtPx = (p) => {
  if (p == null || Number.isNaN(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
};
const fmtUSD = (n) =>
  n == null || Number.isNaN(n) ? "—" : Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD" });

// ── Indicator math (index-aligned helpers) ──
function emaAligned(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let s = 0;
  for (let j = 0; j < period; j++) s += values[j];
  let ema = s / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}
function smaAligned(values, period) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}
const toPoints = (candles, aligned) =>
  aligned.flatMap((v, i) => (v == null ? [] : [{ time: candles[i].time, value: v }]));

function emaSeries(candles, period) {
  return toPoints(candles, emaAligned(candles.map((c) => c.close), period));
}
function smaSeries(candles, period) {
  return toPoints(candles, smaAligned(candles.map((c) => c.close), period));
}
function bollingerSeries(candles, period = 20, mult = 2) {
  const closes = candles.map((c) => c.close);
  const mid = smaAligned(closes, period);
  const upper = new Array(candles.length).fill(null);
  const lower = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper: toPoints(candles, upper), mid: toPoints(candles, mid), lower: toPoints(candles, lower) };
}
function vwapSeries(candles) {
  const out = [];
  let cumPV = 0;
  let cumV = 0;
  let day = null;
  for (const c of candles) {
    const d = Math.floor(c.time / 86400);
    if (d !== day) { day = d; cumPV = 0; cumV = 0; }
    const v = c.volume || 0;
    if (v <= 0) continue;
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * v;
    cumV += v;
    if (cumV > 0) out.push({ time: c.time, value: cumPV / cumV });
  }
  return out;
}
function rsiSeries(candles, period = 14) {
  if (!candles || candles.length <= period) return [];
  const out = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const push = (time) => {
    const value = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
    out.push({ time, value });
  };
  push(candles[period].time);
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    push(candles[i].time);
  }
  return out;
}
function macdData(candles, fast = 12, slow = 26, signalPeriod = 9) {
  const closes = candles.map((c) => c.close);
  const eF = emaAligned(closes, fast);
  const eS = emaAligned(closes, slow);
  const macd = closes.map((_, i) => (eF[i] != null && eS[i] != null ? eF[i] - eS[i] : null));
  const start = macd.findIndex((v) => v != null);
  const signal = new Array(candles.length).fill(null);
  if (start >= 0) {
    const sub = macd.slice(start);
    const sigSub = emaAligned(sub, signalPeriod);
    sigSub.forEach((v, j) => { signal[start + j] = v; });
  }
  return {
    macd: toPoints(candles, macd),
    signal: toPoints(candles, signal),
    hist: candles.flatMap((c, i) =>
      macd[i] != null && signal[i] != null
        ? [{ time: c.time, value: macd[i] - signal[i], color: macd[i] - signal[i] >= 0 ? "rgba(63,178,127,0.55)" : "rgba(224,93,93,0.55)" }]
        : []
    ),
  };
}
function stochData(candles, kPeriod = 14, smooth = 3) {
  const rawK = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    rawK[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  // %K: smooth the raw values over `smooth` bars (only where raw exists).
  const k = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1 + smooth - 1) continue;
    let s = 0;
    let ok = true;
    for (let j = i - smooth + 1; j <= i; j++) { if (rawK[j] == null) { ok = false; break; } s += rawK[j]; }
    if (ok) k[i] = s / smooth;
  }
  void kVals;
  const d = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1 + 2 * (smooth - 1)) continue;
    let s = 0;
    let ok = true;
    for (let j = i - smooth + 1; j <= i; j++) { if (k[j] == null) { ok = false; break; } s += k[j]; }
    if (ok) d[i] = s / smooth;
  }
  return { k: toPoints(candles, k), d: toPoints(candles, d) };
}

// What kind of execution a plan's entry implies vs the live market.
export function orderKindFor(plan, bid, ask) {
  if (!plan || bid == null || ask == null) return "market";
  if (plan.direction === "buy") {
    if (plan.entry > ask) return "buy-stop";
    if (plan.entry < bid) return "buy-limit";
    return "market";
  }
  if (plan.entry < bid) return "sell-stop";
  if (plan.entry > ask) return "sell-limit";
  return "market";
}
export const ORDER_LABEL = {
  "market": "Market",
  "buy-stop": "Buy Stop",
  "buy-limit": "Buy Limit",
  "sell-stop": "Sell Stop",
  "sell-limit": "Sell Limit",
};

const PANE_DEFS = [
  { key: "rsi", label: "RSI 14" },
  { key: "macd", label: "MACD 12·26·9" },
  { key: "stoch", label: "Stochastic 14·3" },
];

export default function DeskChart({
  candles, drawings, theme, chartKey, toolMode, sizeNotional, liveQuote,
  plans, activePlanId, onSelectPlan, onPlansChange, onTrade, onCancelOrder, onRemovePlan, notice,
  indicators,
}) {
  const ind = indicators || { ema: true, rsi: true };
  const hostRef = useRef(null);
  const paneHostRefs = useRef({});
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const trendSeriesRef = useRef([]);
  const overlayRefs = useRef({});
  const panesRef = useRef({});
  const syncingRef = useRef(false);
  const fittedKeyRef = useRef(null);
  const [, setLayoutTick] = useState(0);
  const [localPlans, setLocalPlans] = useState(plans || []);
  const dragRef = useRef(null);
  const toolModeRef = useRef(toolMode);
  const plansRef = useRef(localPlans);
  const candlesRef = useRef(candles);
  const activeRef = useRef(activePlanId);
  toolModeRef.current = toolMode;
  plansRef.current = localPlans;
  candlesRef.current = candles;
  activeRef.current = activePlanId;
  const cbRef = useRef({});
  cbRef.current = { onSelectPlan, onPlansChange, onTrade, onCancelOrder, onRemovePlan };

  // Sync the local mirror from the desk's canonical plans (not mid-drag).
  useEffect(() => {
    if (!dragRef.current) setLocalPlans(plans || []);
  }, [plans, chartKey]);

  // ── Chart lifecycle ──
  useEffect(() => {
    if (!hostRef.current) return;
    const dark = theme !== "light";
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: dark ? "#cfc8b8" : "#5a5348",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: dark ? "rgba(233,225,207,0.06)" : "rgba(90,78,60,0.10)" },
        horzLines: { color: dark ? "rgba(233,225,207,0.06)" : "rgba(90,78,60,0.10)" },
      },
      rightPriceScale: { borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)" },
      timeScale: {
        borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#3fb27f",
      downColor: "#e05d5d",
      wickUpColor: "#3fb27f",
      wickDownColor: "#e05d5d",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const bump = () => setLayoutTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    const ro = new ResizeObserver(bump);
    ro.observe(hostRef.current);

    chart.subscribeClick((param) => {
      if (!param?.point || !seriesRef.current) return;
      const s = seriesRef.current;
      const x = param.point.x;
      const y = param.point.y;
      const ts = chart.timeScale();
      for (const p of plansRef.current) {
        const x1 = ts.timeToCoordinate(p.t1);
        const x2 = ts.timeToCoordinate(p.t2);
        const ys = [s.priceToCoordinate(p.entry), s.priceToCoordinate(p.stop), s.priceToCoordinate(p.target)];
        if (x1 == null || x2 == null || ys.some((v) => v == null)) continue;
        if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(...ys) - 6 && y <= Math.max(...ys) + 6) {
          cbRef.current.onSelectPlan?.(p.id);
          return;
        }
      }
      const mode = toolModeRef.current;
      if (!mode || mode === "off") return;
      const price = s.coordinateToPrice(y);
      if (price == null || price <= 0) return;
      const cs = candlesRef.current || [];
      if (cs.length < 2) return;
      const barDur = cs[1].time - cs[0].time;
      let t = param.time != null ? param.time : ts.coordinateToTime(x);
      if (t == null) return;
      let t1 = cs[0].time;
      for (const c of cs) { if (c.time <= t) t1 = c.time; else break; }
      const risk = price * 0.0035;
      const dir = mode === "long" ? "buy" : "sell";
      const plan = {
        id: `p${Date.now()}`,
        direction: dir,
        entry: price,
        stop: dir === "buy" ? price - risk : price + risk,
        target: dir === "buy" ? price + risk * 2 : price - risk * 2,
        t1,
        t2: t1 + barDur * 30,
        status: "draft",
      };
      const next = [...plansRef.current, plan];
      setLocalPlans(next);
      plansRef.current = next;
      cbRef.current.onSelectPlan?.(plan.id);
      cbRef.current.onPlansChange?.(next);
    });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      trendSeriesRef.current = [];
      overlayRefs.current = {};
      for (const key of Object.keys(panesRef.current)) {
        try { panesRef.current[key].chart.remove(); } catch { /* gone */ }
      }
      panesRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Indicators: overlays + synced panes ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const dark = theme !== "light";
    const cs = candlesRef.current || [];
    const lineOpts = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const ov = overlayRefs.current;

    const setOverlay = (key, enabled, create) => {
      if (enabled && !ov[key]) {
        ov[key] = create();
      } else if (!enabled && ov[key]) {
        const seriesList = Array.isArray(ov[key]) ? ov[key] : [ov[key]];
        for (const s of seriesList) { try { chart.removeSeries(s); } catch { /* gone */ } }
        delete ov[key];
      }
    };

    setOverlay("ema", ind.ema, () => {
      const a = chart.addLineSeries({ color: "#4B90FF", ...lineOpts });
      const b = chart.addLineSeries({ color: "#e8b34b", ...lineOpts });
      a.setData(emaSeries(cs, 20));
      b.setData(emaSeries(cs, 50));
      return [a, b];
    });
    setOverlay("sma", ind.sma, () => {
      const a = chart.addLineSeries({ color: "#e07b39", ...lineOpts });
      const b = chart.addLineSeries({ color: "#c65b8f", ...lineOpts });
      a.setData(smaSeries(cs, 50));
      b.setData(smaSeries(cs, 200));
      return [a, b];
    });
    setOverlay("bb", ind.bb, () => {
      const data = bollingerSeries(cs);
      const opts = { color: "rgba(155,126,222,0.75)", ...lineOpts };
      const u = chart.addLineSeries(opts);
      const m = chart.addLineSeries({ color: "rgba(155,126,222,0.45)", ...lineOpts, lineStyle: LineStyle.Dotted });
      const l = chart.addLineSeries(opts);
      u.setData(data.upper);
      m.setData(data.mid);
      l.setData(data.lower);
      return [u, m, l];
    });
    setOverlay("vwap", ind.vwap, () => {
      const v = chart.addLineSeries({ color: "#39c2d7", ...lineOpts, lineStyle: LineStyle.Dashed });
      v.setData(vwapSeries(cs));
      return [v];
    });

    // Panes (RSI / MACD / Stochastic) — separate small charts, range-synced.
    const enabledPanes = PANE_DEFS.filter((d) => ind[d.key]);
    for (const def of PANE_DEFS) {
      const enabled = !!ind[def.key];
      const existing = panesRef.current[def.key];
      if (enabled && !existing) {
        const host = paneHostRefs.current[def.key];
        if (!host) continue;
        const pc = createChart(host, {
          autoSize: true,
          layout: { background: { color: "transparent" }, textColor: dark ? "#cfc8b8" : "#5a5348", fontSize: 10 },
          grid: {
            vertLines: { color: dark ? "rgba(233,225,207,0.05)" : "rgba(90,78,60,0.08)" },
            horzLines: { color: dark ? "rgba(233,225,207,0.05)" : "rgba(90,78,60,0.08)" },
          },
          rightPriceScale: { borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)" },
          timeScale: { borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)", timeVisible: true, secondsVisible: false },
        });
        const pane = { chart: pc, series: {} };
        if (def.key === "rsi") {
          const s = pc.addLineSeries({ color: "#9b7ede", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
          s.createPriceLine({ price: 70, color: "rgba(224,93,93,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
          s.createPriceLine({ price: 30, color: "rgba(63,178,127,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
          s.setData(rsiSeries(cs));
          pane.series.main = s;
        } else if (def.key === "macd") {
          const data = macdData(cs);
          const hist = pc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
          hist.setData(data.hist);
          const m = pc.addLineSeries({ color: "#4B90FF", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
          m.setData(data.macd);
          const sig = pc.addLineSeries({ color: "#e8b34b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          sig.setData(data.signal);
          pane.series = { hist, main: m, signal: sig };
        } else if (def.key === "stoch") {
          const data = stochData(cs);
          const k = pc.addLineSeries({ color: "#4B90FF", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
          k.createPriceLine({ price: 80, color: "rgba(224,93,93,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "80" });
          k.createPriceLine({ price: 20, color: "rgba(63,178,127,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "20" });
          k.setData(data.k);
          const d = pc.addLineSeries({ color: "#e05d5d", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          d.setData(data.d);
          pane.series = { main: k, d };
        }
        panesRef.current[def.key] = pane;
        const syncTo = (dst) => (range) => {
          if (syncingRef.current || !range) return;
          syncingRef.current = true;
          try { dst.timeScale().setVisibleLogicalRange(range); } catch { /* mid-teardown */ }
          syncingRef.current = false;
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(syncTo(pc));
        pc.timeScale().subscribeVisibleLogicalRangeChange(syncTo(chart));
        const current = chart.timeScale().getVisibleLogicalRange();
        if (current) { try { pc.timeScale().setVisibleLogicalRange(current); } catch { /* noop */ } }
      } else if (!enabled && existing) {
        try { existing.chart.remove(); } catch { /* gone */ }
        delete panesRef.current[def.key];
      }
    }
    // The time axis lives on the bottom-most visible pane (or the main
    // chart when no panes are open).
    chart.timeScale().applyOptions({ visible: enabledPanes.length === 0 });
    enabledPanes.forEach((def, i) => {
      const pane = panesRef.current[def.key];
      if (pane) pane.chart.timeScale().applyOptions({ visible: i === enabledPanes.length - 1 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ind, theme]);

  // ── Data + drawn levels ──
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !candles?.length) return;
    series.setData(candles);

    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* already gone */ }
    }
    priceLinesRef.current = [];
    for (const ts of trendSeriesRef.current) {
      try { chart.removeSeries(ts); } catch { /* already gone */ }
    }
    trendSeriesRef.current = [];

    for (const d of drawings || []) {
      if (d.type === "hline") {
        priceLinesRef.current.push(series.createPriceLine({
          price: d.price,
          color: TONE_COLOR[d.tone] || TONE_COLOR.trend,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: d.tone === "support" ? "Support" : "Resistance",
        }));
      } else if (d.type === "trend") {
        const endIdx = candles.length - 1;
        const i1 = Math.max(0, Math.min(endIdx, d.i1));
        const slope = (d.p2 - d.p1) / Math.max(1, d.i2 - d.i1);
        const endPrice = d.p1 + slope * (endIdx - d.i1);
        if (candles[endIdx].time > candles[i1].time) {
          const ls = chart.addLineSeries({
            color: TONE_COLOR.trend,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          ls.setData([
            { time: candles[i1].time, value: d.p1 },
            { time: candles[endIdx].time, value: endPrice },
          ]);
          trendSeriesRef.current.push(ls);
        }
      }
    }

    const ov = overlayRefs.current;
    if (ov.ema) { ov.ema[0].setData(emaSeries(candles, 20)); ov.ema[1].setData(emaSeries(candles, 50)); }
    if (ov.sma) { ov.sma[0].setData(smaSeries(candles, 50)); ov.sma[1].setData(smaSeries(candles, 200)); }
    if (ov.bb) { const b = bollingerSeries(candles); ov.bb[0].setData(b.upper); ov.bb[1].setData(b.mid); ov.bb[2].setData(b.lower); }
    if (ov.vwap) { ov.vwap[0].setData(vwapSeries(candles)); }
    const panes = panesRef.current;
    if (panes.rsi) panes.rsi.series.main.setData(rsiSeries(candles));
    if (panes.macd) { const d = macdData(candles); panes.macd.series.hist.setData(d.hist); panes.macd.series.main.setData(d.macd); panes.macd.series.signal.setData(d.signal); }
    if (panes.stoch) { const d = stochData(candles); panes.stoch.series.main.setData(d.k); panes.stoch.series.d.setData(d.d); }

    if (fittedKeyRef.current !== chartKey) {
      fittedKeyRef.current = chartKey;
      chart.timeScale().fitContent();
    }
    setLayoutTick((t) => t + 1);
  }, [candles, drawings, chartKey]);

  // ── Dragging (prices + box edge) ──
  const startDrag = (planId, handle) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    cbRef.current.onSelectPlan?.(planId);
    dragRef.current = { planId, handle };
    const move = (ev) => {
      const host = hostRef.current;
      const chart = chartRef.current;
      const s = seriesRef.current;
      if (!host || !chart || !s) return;
      const rect = host.getBoundingClientRect();
      const cur = plansRef.current.find((p) => p.id === planId);
      if (!cur) return;
      let next = null;
      if (handle === "edge") {
        const cs = candlesRef.current || [];
        const barDur = cs.length > 1 ? cs[1].time - cs[0].time : 60;
        const t = chart.timeScale().coordinateToTime(ev.clientX - rect.left);
        if (t == null) return;
        next = { ...cur, t2: Math.max(cur.t1 + barDur * 2, t) };
      } else {
        const price = s.coordinateToPrice(ev.clientY - rect.top);
        if (price == null || price <= 0) return;
        const minDist = cur.entry * 0.0002;
        if (handle === "entry") {
          const delta = price - cur.entry;
          next = { ...cur, entry: price, stop: cur.stop + delta, target: cur.target + delta };
        } else if (handle === "stop") {
          const stop = cur.direction === "buy" ? Math.min(price, cur.entry - minDist) : Math.max(price, cur.entry + minDist);
          next = { ...cur, stop };
        } else if (handle === "target") {
          const target = cur.direction === "buy" ? Math.max(price, cur.entry + minDist) : Math.min(price, cur.entry - minDist);
          next = { ...cur, target };
        }
      }
      if (next) {
        const arr = plansRef.current.map((p) => (p.id === planId ? next : p));
        setLocalPlans(arr);
        plansRef.current = arr;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragRef.current = null;
      cbRef.current.onPlansChange?.(plansRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── Geometry for render ──
  const chart = chartRef.current;
  const series = seriesRef.current;
  const tsApi = chart ? chart.timeScale() : null;
  const geom = (p) => {
    if (!series || !tsApi) return null;
    const paneW = hostRef.current?.clientWidth || 0;
    let x1 = tsApi.timeToCoordinate(p.t1);
    let x2 = tsApi.timeToCoordinate(p.t2);
    if (x1 == null) x1 = 0;
    if (x2 == null) x2 = paneW;
    const yE = series.priceToCoordinate(p.entry);
    const yS = series.priceToCoordinate(p.stop);
    const yT = series.priceToCoordinate(p.target);
    if (yE == null || yS == null || yT == null) return null;
    if (x2 < 0 || x1 > paneW) return null;
    return { x: Math.max(0, Math.min(x1, x2)), w: Math.abs(x2 - x1), yE, yS, yT };
  };

  const active = localPlans.find((p) => p.id === activePlanId) || null;
  const activeKind = active ? orderKindFor(active, liveQuote?.bid, liveQuote?.ask) : "market";
  const riskDist = active ? Math.abs(active.entry - active.stop) : 0;
  const rewardDist = active ? Math.abs(active.target - active.entry) : 0;
  const rr = riskDist > 0 ? rewardDist / riskDist : 0;
  const riskAmt = active ? (sizeNotional || 0) * (riskDist / active.entry) : 0;
  const rewardAmt = active ? (sizeNotional || 0) * (rewardDist / active.entry) : 0;
  const visiblePanes = PANE_DEFS.filter((d) => ind[d.key]);

  return (
    <div className="desk-lw-wrap">
      <div ref={hostRef} className="desk-lw-chart" />
      {visiblePanes.map((def) => (
        <div key={def.key} className="desk-pane">
          <span className="desk-pane-label">{def.label}</span>
          <div ref={(el) => { paneHostRefs.current[def.key] = el; }} className="desk-pane-chart" />
        </div>
      ))}

      {toolMode !== "off" && (
        <div className="desk-tool-hint">
          Click the chart to drop a {toolMode} plan box — drag its lines for entry, stop and target, and its right edge to resize. Click an existing box to select it.
        </div>
      )}

      {localPlans.map((p) => {
        const g = geom(p);
        if (!g) return null;
        const isActive = p.id === activePlanId;
        const isLong = p.direction === "buy";
        return (
          <div key={p.id} className={`desk-plan ${isActive ? "active" : ""} ${p.status}`}>
            <div className="desk-zone risk" style={{ left: g.x, top: Math.min(g.yE, g.yS), width: g.w, height: Math.abs(g.yE - g.yS) }} />
            <div className="desk-zone reward" style={{ left: g.x, top: Math.min(g.yE, g.yT), width: g.w, height: Math.abs(g.yE - g.yT) }} />
            <div
              className="desk-strip entry"
              style={{ left: g.x, top: g.yE - 7, width: g.w }}
              onPointerDown={isActive ? startDrag(p.id, "entry") : () => cbRef.current.onSelectPlan?.(p.id)}
            >
              <span className="desk-strip-tag">
                {isLong ? "LONG" : "SHORT"} {fmtPx(p.entry)}{p.status === "armed" ? ` · ${ORDER_LABEL[p.orderType] || "ARMED"}` : p.status === "filled" ? " · OPEN" : ""}
              </span>
            </div>
            {isActive && (
              <>
                <div className="desk-strip stop" style={{ left: g.x, top: g.yS - 7, width: g.w }} onPointerDown={startDrag(p.id, "stop")}>
                  <span className="desk-strip-tag">Stop {fmtPx(p.stop)}</span>
                </div>
                <div className="desk-strip target" style={{ left: g.x, top: g.yT - 7, width: g.w }} onPointerDown={startDrag(p.id, "target")}>
                  <span className="desk-strip-tag">Target {fmtPx(p.target)}</span>
                </div>
                <div className="desk-edge" style={{ left: g.x + g.w - 5, top: Math.min(g.yS, g.yT), height: Math.abs(g.yT - g.yS) }} onPointerDown={startDrag(p.id, "edge")} title="Drag to resize the box" />
              </>
            )}
          </div>
        );
      })}

      {active && (
        <div className="desk-tool-panel">
          <div className="desk-tool-title">
            <span className={`demo-dir ${active.direction}`}>{active.direction === "buy" ? "LONG" : "SHORT"}</span>
            <strong>RR 1:{rr ? rr.toFixed(1) : "—"}</strong>
            <button className="desk-tool-x" onClick={() => cbRef.current.onRemovePlan?.(active.id)} aria-label="Remove plan">✕</button>
          </div>
          <div className="desk-tool-rows">
            <span>Entry <b>{fmtPx(active.entry)}</b></span>
            <span>Risk <b className="neg">−{fmtUSD(riskAmt)}</b> to {fmtPx(active.stop)}</span>
            <span>Reward <b className="pos">+{fmtUSD(rewardAmt)}</b> to {fmtPx(active.target)}</span>
            {active.status === "draft" && (
              <span className="desk-tool-note">
                {activeKind === "market"
                  ? "Entry is at the market — trading fills now, stop/target shift to keep this geometry."
                  : `Entry is away from the market — trading arms a ${ORDER_LABEL[activeKind]} that fills when price reaches ${fmtPx(active.entry)}.`}
              </span>
            )}
            {active.status === "armed" && (
              <span className="desk-tool-note">{ORDER_LABEL[active.orderType] || "Pending order"} armed — drag the stop/target to adjust the order. Size {fmtUSD(sizeNotional || 0)}.</span>
            )}
            {active.status === "filled" && (
              <span className="desk-tool-note">Position open — dragging the stop/target adjusts the live trade.</span>
            )}
          </div>
          {notice && <div className="desk-tool-notice">{notice}</div>}
          {active.status === "draft" && (
            <button className="desk-tool-trade" onClick={() => cbRef.current.onTrade?.(active)}>
              {activeKind === "market" ? "Trade this position" : `Place ${ORDER_LABEL[activeKind]}`}
            </button>
          )}
          {active.status === "armed" && (
            <button className="desk-tool-trade cancel" onClick={() => cbRef.current.onCancelOrder?.(active)}>
              Cancel order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";

// Wallie's own chart (TradingView's open-source lightweight-charts).
// Candles come from the same server series the levels are computed from,
// and the levels are native price lines — pinned to their prices, moving
// WITH the chart on zoom/pan.
//
// Position tool v2 (TradingView-style): plans are BOXES over a time
// range (drag the right edge to resize), several can live on one chart,
// and each is kept per symbol by the desk. A plan can be traded at
// market, or armed as a pending order (buy/sell stop & limit) when its
// entry sits away from the live price. Dragging an armed/filled plan's
// stop or target adjusts the actual order/position.
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

// Indicators, computed in-house from the same candles (lightweight-
// charts ships none). EMA: standard k=2/(n+1), seeded with the SMA.
// RSI: Wilder's smoothing, period 14.
function emaSeries(candles, period) {
  if (!candles || candles.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let ema = null;
  candles.forEach((c, i) => {
    if (i < period - 1) return;
    if (ema === null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += candles[j].close;
      ema = s / period;
    } else {
      ema = c.close * k + ema * (1 - k);
    }
    out.push({ time: c.time, value: ema });
  });
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

export default function DeskChart({
  candles, drawings, theme, chartKey, toolMode, sizeNotional, liveQuote,
  plans, activePlanId, onSelectPlan, onPlansChange, onTrade, onCancelOrder, onRemovePlan, notice,
}) {
  const hostRef = useRef(null);
  const rsiHostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const ema20Ref = useRef(null);
  const ema50Ref = useRef(null);
  const rsiChartRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const syncingRef = useRef(false);
  const [indicators, setIndicators] = useState(() => {
    try { return { ema: true, rsi: true, ...JSON.parse(localStorage.getItem("wallie_desk_indicators") || "{}") }; }
    catch { return { ema: true, rsi: true }; }
  });
  useEffect(() => {
    try { localStorage.setItem("wallie_desk_indicators", JSON.stringify(indicators)); } catch { /* ignore */ }
  }, [indicators]);
  const priceLinesRef = useRef([]);
  const trendSeriesRef = useRef([]);
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
  // Always-latest callbacks: the chart's click handler is registered
  // once per chart instance, so it must call through a ref — never a
  // captured prop (a stale closure files new plans under the symbol
  // that was showing when the chart first mounted, and they vanish).
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

    // Clicks: select a plan whose box was clicked; otherwise, with the
    // tool armed, drop a new plan at that price/time.
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
      ema20Ref.current = null;
      ema50Ref.current = null;
      if (rsiChartRef.current) {
        try { rsiChartRef.current.remove(); } catch { /* already gone */ }
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Indicators: EMA overlays + a synced RSI pane ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const dark = theme !== "light";

    if (indicators.ema && !ema20Ref.current) {
      const lineOpts = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      ema20Ref.current = chart.addLineSeries({ color: "#4B90FF", ...lineOpts });
      ema50Ref.current = chart.addLineSeries({ color: "#e8b34b", ...lineOpts });
      ema20Ref.current.setData(emaSeries(candlesRef.current, 20));
      ema50Ref.current.setData(emaSeries(candlesRef.current, 50));
    } else if (!indicators.ema && ema20Ref.current) {
      try { chart.removeSeries(ema20Ref.current); chart.removeSeries(ema50Ref.current); } catch { /* gone */ }
      ema20Ref.current = null;
      ema50Ref.current = null;
    }

    if (indicators.rsi && !rsiChartRef.current && rsiHostRef.current) {
      const rc = createChart(rsiHostRef.current, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: dark ? "#cfc8b8" : "#5a5348", fontSize: 10 },
        grid: {
          vertLines: { color: dark ? "rgba(233,225,207,0.05)" : "rgba(90,78,60,0.08)" },
          horzLines: { color: dark ? "rgba(233,225,207,0.05)" : "rgba(90,78,60,0.08)" },
        },
        rightPriceScale: { borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)" },
        timeScale: { borderColor: dark ? "rgba(233,225,207,0.16)" : "rgba(90,78,60,0.22)", timeVisible: true, secondsVisible: false },
      });
      const rs = rc.addLineSeries({ color: "#9b7ede", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });
      rs.createPriceLine({ price: 70, color: "rgba(224,93,93,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
      rs.createPriceLine({ price: 30, color: "rgba(63,178,127,0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
      rs.setData(rsiSeries(candlesRef.current));
      rsiChartRef.current = rc;
      rsiSeriesRef.current = rs;
      // Keep the two panes scrolling together.
      const syncFrom = (src, dst) => (range) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        try { dst.timeScale().setVisibleLogicalRange(range); } catch { /* mid-teardown */ }
        syncingRef.current = false;
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(syncFrom(chart, rc));
      rc.timeScale().subscribeVisibleLogicalRangeChange(syncFrom(rc, chart));
      const current = chart.timeScale().getVisibleLogicalRange();
      if (current) rc.timeScale().setVisibleLogicalRange(current);
      chart.timeScale().applyOptions({ visible: false });
    } else if (!indicators.rsi && rsiChartRef.current) {
      try { rsiChartRef.current.remove(); } catch { /* gone */ }
      rsiChartRef.current = null;
      rsiSeriesRef.current = null;
      chart.timeScale().applyOptions({ visible: true });
    }
  }, [indicators, theme]);

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

    if (ema20Ref.current) ema20Ref.current.setData(emaSeries(candles, 20));
    if (ema50Ref.current) ema50Ref.current.setData(emaSeries(candles, 50));
    if (rsiSeriesRef.current) rsiSeriesRef.current.setData(rsiSeries(candles));

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
    onSelectPlan?.(planId);
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
      onPlansChange?.(plansRef.current);
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
    // A plan's times can fall outside the currently loaded candles (made
    // on another timeframe/session) — clamp to the pane edges instead of
    // dropping the box entirely.
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

  return (
    <div className="desk-lw-wrap">
      <div ref={hostRef} className="desk-lw-chart" />
      {indicators.rsi && (
        <div className="desk-rsi">
          <span className="desk-rsi-label">RSI 14</span>
          <div ref={rsiHostRef} className="desk-rsi-chart" />
        </div>
      )}

      <div className="desk-ind-chips">
        <button className={indicators.ema ? "active" : ""} onClick={() => setIndicators((s) => ({ ...s, ema: !s.ema }))} title="EMA 20 (blue) and EMA 50 (gold) overlays">EMA</button>
        <button className={indicators.rsi ? "active" : ""} onClick={() => setIndicators((s) => ({ ...s, rsi: !s.rsi }))} title="RSI 14 pane">RSI</button>
      </div>

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
              onPointerDown={isActive ? startDrag(p.id, "entry") : () => onSelectPlan?.(p.id)}
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
            <button className="desk-tool-x" onClick={() => onRemovePlan?.(active.id)} aria-label="Remove plan">✕</button>
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
            <button className="desk-tool-trade" onClick={() => onTrade?.(active)}>
              {activeKind === "market" ? "Trade this position" : `Place ${ORDER_LABEL[activeKind]}`}
            </button>
          )}
          {active.status === "armed" && (
            <button className="desk-tool-trade cancel" onClick={() => onCancelOrder?.(active)}>
              Cancel order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

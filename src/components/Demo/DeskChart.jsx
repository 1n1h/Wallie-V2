import { useEffect, useRef, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";

// Wallie's own chart (TradingView's open-source lightweight-charts).
// Candles come from the same server series the levels are computed from,
// and the levels are native price lines — pinned to their prices, moving
// WITH the chart on zoom/pan.
//
// Position tool (TradingView-style long/short planner): arm Long or
// Short, click the chart to place an entry, then drag the red zone to
// set the stop and the green zone to set the target. The plan syncs to
// the order ticket, and "Trade this position" opens it at market with
// the drawn risk geometry preserved.
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

export default function DeskChart({ candles, drawings, theme, chartKey, toolMode, sizeNotional, onPlanChange, onTrade, notice }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const trendSeriesRef = useRef([]);
  const fittedKeyRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const [, setLayoutTick] = useState(0);
  const planRef = useRef(null);
  const toolModeRef = useRef(toolMode);
  const dragRef = useRef(null);
  planRef.current = plan;
  toolModeRef.current = toolMode;

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

    // Position tool: first click on the chart places the entry.
    chart.subscribeClick((param) => {
      const mode = toolModeRef.current;
      if (!mode || mode === "off" || planRef.current) return;
      if (!param?.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null || price <= 0) return;
      const risk = price * 0.0035;
      const next = mode === "long"
        ? { direction: "buy", entry: price, stop: price - risk, target: price + risk * 2 }
        : { direction: "sell", entry: price, stop: price + risk, target: price - risk * 2 };
      setPlan(next);
      planRef.current = next;
      onPlanChange?.(next);
    });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      trendSeriesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Tool arm/disarm + direction flips ──
  useEffect(() => {
    if (toolMode === "off") {
      if (planRef.current) { setPlan(null); planRef.current = null; onPlanChange?.(null); }
      return;
    }
    const want = toolMode === "long" ? "buy" : "sell";
    const cur = planRef.current;
    if (cur && cur.direction !== want) {
      const risk = Math.abs(cur.entry - cur.stop);
      const reward = Math.abs(cur.target - cur.entry);
      const flipped = want === "buy"
        ? { direction: "buy", entry: cur.entry, stop: cur.entry - risk, target: cur.entry + reward }
        : { direction: "sell", entry: cur.entry, stop: cur.entry + risk, target: cur.entry - reward };
      setPlan(flipped);
      planRef.current = flipped;
      onPlanChange?.(flipped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode]);

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

    if (fittedKeyRef.current !== chartKey) {
      fittedKeyRef.current = chartKey;
      chart.timeScale().fitContent();
    }
    setLayoutTick((t) => t + 1);
  }, [candles, drawings, chartKey]);

  // ── Position tool geometry ──
  const series = seriesRef.current;
  const paneW = chartRef.current ? chartRef.current.paneSize().width : 0;
  const yOf = (price) => (series && price != null ? series.priceToCoordinate(price) : null);
  const yEntry = plan ? yOf(plan.entry) : null;
  const yStop = plan ? yOf(plan.stop) : null;
  const yTarget = plan ? yOf(plan.target) : null;
  const isLong = plan?.direction === "buy";
  const riskDist = plan ? Math.abs(plan.entry - plan.stop) : 0;
  const rewardDist = plan ? Math.abs(plan.target - plan.entry) : 0;
  const rr = riskDist > 0 ? rewardDist / riskDist : 0;
  const riskAmt = plan ? (sizeNotional || 0) * (riskDist / plan.entry) : 0;
  const rewardAmt = plan ? (sizeNotional || 0) * (rewardDist / plan.entry) : 0;

  const startDrag = (handle) => (e) => {
    if (!planRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { handle };
    const move = (ev) => {
      const host = hostRef.current;
      const s = seriesRef.current;
      const cur = planRef.current;
      if (!host || !s || !cur) return;
      const rect = host.getBoundingClientRect();
      const price = s.coordinateToPrice(ev.clientY - rect.top);
      if (price == null || price <= 0) return;
      const minDist = cur.entry * 0.0002;
      let next = null;
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
      if (next) { setPlan(next); planRef.current = next; }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragRef.current = null;
      if (planRef.current) onPlanChange?.(planRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const clearPlan = () => {
    setPlan(null);
    planRef.current = null;
    onPlanChange?.(null);
  };

  return (
    <div className="desk-lw-wrap">
      <div ref={hostRef} className="desk-lw-chart" />

      {toolMode !== "off" && !plan && (
        <div className="desk-tool-hint">
          Click the chart to place your {toolMode === "long" ? "long" : "short"} entry — then drag the red zone to your stop and the green to your target.
        </div>
      )}

      {plan && yEntry != null && yStop != null && yTarget != null && (
        <>
          <div
            className="desk-zone risk"
            style={{ top: Math.min(yEntry, yStop), height: Math.abs(yEntry - yStop), width: paneW }}
          />
          <div
            className="desk-zone reward"
            style={{ top: Math.min(yEntry, yTarget), height: Math.abs(yEntry - yTarget), width: paneW }}
          />
          <div className="desk-strip entry" style={{ top: yEntry - 7, width: paneW }} onPointerDown={startDrag("entry")}>
            <span className="desk-strip-tag">Entry {fmtPx(plan.entry)} — drag to move all</span>
          </div>
          <div className="desk-strip stop" style={{ top: yStop - 7, width: paneW }} onPointerDown={startDrag("stop")}>
            <span className="desk-strip-tag">Stop {fmtPx(plan.stop)}</span>
          </div>
          <div className="desk-strip target" style={{ top: yTarget - 7, width: paneW }} onPointerDown={startDrag("target")}>
            <span className="desk-strip-tag">Target {fmtPx(plan.target)}</span>
          </div>

          <div className="desk-tool-panel">
            <div className="desk-tool-title">
              <span className={`demo-dir ${isLong ? "buy" : "sell"}`}>{isLong ? "LONG" : "SHORT"}</span>
              <strong>RR 1:{rr ? rr.toFixed(1) : "—"}</strong>
              <button className="desk-tool-x" onClick={clearPlan} aria-label="Clear position plan">✕</button>
            </div>
            <div className="desk-tool-rows">
              <span>Risk <b className="neg">−{fmtUSD(riskAmt)}</b> to {fmtPx(plan.stop)}</span>
              <span>Reward <b className="pos">+{fmtUSD(rewardAmt)}</b> to {fmtPx(plan.target)}</span>
              <span className="desk-tool-note">Size from your ticket ({fmtUSD(sizeNotional || 0)}). Trading fills at live market — stop/target shift to keep this geometry.</span>
            </div>
            {notice && <div className="desk-tool-notice">{notice}</div>}
            <button className="desk-tool-trade" onClick={() => onTrade?.(planRef.current)}>
              Trade this position
            </button>
          </div>
        </>
      )}
    </div>
  );
}

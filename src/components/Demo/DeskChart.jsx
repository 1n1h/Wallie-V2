import { useEffect, useRef } from "react";
import { createChart, LineStyle } from "lightweight-charts";

// Wallie's own chart (TradingView's open-source lightweight-charts).
// Candles come from the same server series the levels are computed from,
// and the levels are native price lines — so they are pinned to their
// prices and move WITH the chart when the user zooms or pans.
const TONE_COLOR = { support: "#3fb27f", resistance: "#e05d5d", trend: "#4B90FF" };

export default function DeskChart({ candles, drawings, theme, chartKey }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const trendSeriesRef = useRef([]);
  const fittedKeyRef = useRef(null);

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
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      trendSeriesRef.current = [];
    };
  }, [theme]);

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
  }, [candles, drawings, chartKey]);

  return <div ref={hostRef} className="desk-lw-chart" />;
}

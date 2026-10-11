import { useEffect, useRef } from "react";
import "./heat-map.css";

// TradingView Stock Heatmap — TradingView's official embed widget.
// The embed script reads its JSON config from its own text content
// and renders into the sibling widget div, so both are created
// imperatively inside the container on mount.
const CONFIG = {
  dataSource: "SPX500",
  blockSize: "market_cap_basic",
  blockColor: "change",
  grouping: "sector",
  locale: "en",
  symbolUrl: "",
  colorTheme: "dark",
  exchanges: [],
  hasTopBar: false,
  isDataSetEnabled: false,
  isZoomEnabled: true,
  hasSymbolTooltip: true,
  isMonoSize: false,
  width: "100%",
  height: "100%",
};
const SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";

export default function HeatMap({ className = "" }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.dataset.loaded) return;
    host.dataset.loaded = "true";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    host.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = SCRIPT_SRC;
    script.innerHTML = JSON.stringify(CONFIG);
    host.appendChild(script);
  }, []);

  return (
    <div className={`tradingview-widget-container wallie-heatmap ${className}`} ref={hostRef}>
      <div className="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/heatmap/stock/" rel="noopener nofollow" target="_blank">
          <span className="blue-text">Stock Heatmap</span>
        </a>
        <span className="trademark">&nbsp;by TradingView</span>
      </div>
    </div>
  );
}

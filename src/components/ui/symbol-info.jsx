import { useEffect, useRef } from "react";
import "./symbol-info.css";

// TradingView Symbol Info — TradingView's official embed widget.
// Mounted in the PlayPanel's Charts tab with Travis's config
// (AAPL), width adapted to the rail (100% instead of a fixed 550).
const CONFIG = {
  symbol: "NASDAQ:AAPL",
  isTransparent: false,
  locale: "en",
  width: "100%",
};
const SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js";

export default function SymbolInfo() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || host.dataset.loaded) return;
    host.dataset.loaded = "true";

    const theme =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    host.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = SCRIPT_SRC;
    script.innerHTML = JSON.stringify({ ...CONFIG, colorTheme: theme });
    host.appendChild(script);
  }, []);

  return (
    <div className="tradingview-widget-container pp-symbol-info" ref={hostRef}>
      <div className="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/symbols/NASDAQ-AAPL/" rel="noopener nofollow" target="_blank">
          <span className="blue-text">AAPL performance</span>
        </a>
        <span className="trademark">&nbsp;by TradingView</span>
      </div>
    </div>
  );
}

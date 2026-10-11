import { useEffect, useRef } from "react";
import "./news-feed.css";

// TradingView Timeline — TradingView's official news embed widget.
// Powers the PlayPanel's Activity tab with live market headlines.
const CONFIG = {
  feedMode: "all_symbols",
  isTransparent: false,
  displayMode: "regular",
  locale: "en",
  width: "100%",
  height: "100%",
};
const SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";

export default function NewsFeed() {
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
    <div className="tradingview-widget-container pp-news-feed" ref={hostRef}>
      <div className="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/news/" rel="noopener nofollow" target="_blank">
          <span className="blue-text">Market news</span>
        </a>
        <span className="trademark">&nbsp;by TradingView</span>
      </div>
    </div>
  );
}

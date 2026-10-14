import { useEffect, useRef } from "react";

// TradingView Technical Analysis gauge — the "sentiment" widget
// (Strong Sell → Strong Buy summary from TradingView's indicators).
// Official embed, same imperative pattern as the heat map card: the
// embed script reads its JSON config from its own text content and
// renders into the sibling widget div. Rebuilt when symbol/interval/
// theme changes.
const SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";

export default function SentimentGauge({ tvSymbol, interval = "1h", theme }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !tvSymbol) return;
    host.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    host.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = SCRIPT_SRC;
    script.innerHTML = JSON.stringify({
      interval,
      width: "100%",
      // NOT transparent: with transparency on, the widget keeps its
      // light chrome even when colorTheme says dark.
      isTransparent: false,
      height: "100%",
      symbol: tvSymbol,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: theme === "light" ? "light" : "dark",
    });
    host.appendChild(script);
  }, [tvSymbol, interval, theme]);

  return <div className="tradingview-widget-container demo-sentiment-tv" ref={hostRef} />;
}

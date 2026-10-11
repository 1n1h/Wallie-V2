import { useEffect, useRef } from "react";
import "./ticker-tape.css";

// TradingView Ticker Tape — the classic iframe embed widget.
// (The newer tv-ticker-tape web component animated in jittery
// steps; this embed scrolls smoothly.) Config carries Travis's
// exact symbol list, de-duplicated for the classic format.
const CONFIG = {
  symbols: [
    { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
    { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
    { proName: "FOREXCOM:DJI", title: "Dow Jones" },
    { proName: "FX:EURUSD", title: "EUR/USD" },
    { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
    { proName: "BITSTAMP:ETHUSD", title: "Ethereum" },
    { proName: "CMCMARKETS:GOLD", title: "Gold" },
    { proName: "OANDA:XAUUSD", title: "Gold (OANDA)" },
    { proName: "OANDA:EURUSD", title: "EUR/USD (OANDA)" },
    { proName: "FX:USDJPY", title: "USD/JPY" },
  ],
  showSymbolLogo: false,
  isTransparent: true,
  displayMode: "adaptive",
  locale: "en",
};
const SCRIPT_SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";

export default function TickerTape() {
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
    <div className="tv-tape-bar">
      <div className="tradingview-widget-container tv-tape-host" ref={hostRef} />
    </div>
  );
}

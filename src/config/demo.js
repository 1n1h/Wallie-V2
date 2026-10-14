import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

// Demo desk data access — live quotes + drawn levels from Cloud Functions,
// using the same callable envelope as the chat function.
const PROJECT_ID = "wallie-ai-37522";
const REGION = "us-central1";

function getFunctionUrl(name) {
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

function waitForAuth() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function callFunction(name, data) {
  const user = await waitForAuth();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(getFunctionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Function ${name} failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

export async function fetchQuotes(symbols) {
  try {
    const result = await callFunction("prices", { symbols });
    return result?.quotes || {};
  } catch (err) {
    console.error("fetchQuotes:", err.message);
    return {};
  }
}

export async function fetchLevels(symbol, interval) {
  try {
    const result = await callFunction("levels", { symbol, interval });
    return result?.levels || null;
  } catch (err) {
    console.error("fetchLevels:", err.message);
    return null;
  }
}

// Tradeable roster: display symbol -> TradingView symbol + asset class.
// Display symbols resolve to price sources server-side (chartDataSource).
export const ROSTER = [
  { symbol: "US30", name: "Dow Jones 30", tv: "OANDA:US30USD", cls: "index" },
  { symbol: "NAS100", name: "Nasdaq 100", tv: "OANDA:NAS100USD", cls: "index" },
  { symbol: "SPX500", name: "S&P 500", tv: "TVC:SPX", cls: "index" },
  { symbol: "GOLD", name: "Gold Spot", tv: "TVC:GOLD", cls: "metal" },
  { symbol: "SILVER", name: "Silver Spot", tv: "TVC:SILVER", cls: "metal" },
  { symbol: "OIL", name: "Crude Oil WTI", tv: "TVC:USOIL", cls: "energy" },
  { symbol: "BTC", name: "Bitcoin", tv: "BITSTAMP:BTCUSD", cls: "crypto" },
  { symbol: "ETH", name: "Ethereum", tv: "BITSTAMP:ETHUSD", cls: "crypto" },
  { symbol: "SOL", name: "Solana", tv: "COINBASE:SOLUSD", cls: "crypto" },
  { symbol: "XRP", name: "Ripple", tv: "BITSTAMP:XRPUSD", cls: "crypto" },
  { symbol: "DOGE", name: "Dogecoin", tv: "COINBASE:DOGEUSD", cls: "crypto" },
  { symbol: "EURUSD", name: "Euro / US Dollar", tv: "FX:EURUSD", cls: "fx" },
  { symbol: "GBPUSD", name: "Pound / US Dollar", tv: "FX:GBPUSD", cls: "fx" },
  { symbol: "USDJPY", name: "US Dollar / Yen", tv: "FX:USDJPY", cls: "fx" },
  { symbol: "AUDUSD", name: "Aussie / US Dollar", tv: "FX:AUDUSD", cls: "fx" },
  { symbol: "USDCAD", name: "US Dollar / Canadian", tv: "FX:USDCAD", cls: "fx" },
  { symbol: "USDCHF", name: "US Dollar / Swiss Franc", tv: "FX:USDCHF", cls: "fx" },
  { symbol: "SPY", name: "S&P 500 ETF", tv: "AMEX:SPY", cls: "etf" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", tv: "NASDAQ:QQQ", cls: "etf" },
  { symbol: "AAPL", name: "Apple", tv: "NASDAQ:AAPL", cls: "stock" },
  { symbol: "TSLA", name: "Tesla", tv: "NASDAQ:TSLA", cls: "stock" },
  { symbol: "NVDA", name: "NVIDIA", tv: "NASDAQ:NVDA", cls: "stock" },
];

export const ROSTER_MAP = Object.fromEntries(ROSTER.map((r) => [r.symbol, r]));

// Half-spread per asset class (fraction of price). Buys fill at ask,
// sells at bid — a small, realistic cost of crossing the spread.
export const SPREAD = {
  index: 0.0003,
  metal: 0.0003,
  energy: 0.0004,
  crypto: 0.0008,
  fx: 0.00012,
  etf: 0.0003,
  stock: 0.0005,
};

export const INTERVALS = [
  { code: "1", label: "1m" },
  { code: "5", label: "5m" },
  { code: "15", label: "15m" },
  { code: "60", label: "1H" },
  { code: "240", label: "4H" },
  { code: "D", label: "1D" },
  { code: "W", label: "1W" },
];

export const BALANCE_PRESETS = [10000, 25000, 50000, 100000];
export const LEVERAGE_OPTIONS = [10, 25, 50, 100];

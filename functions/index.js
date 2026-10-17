const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fetch = require("node-fetch");

initializeApp();
const db = getFirestore();

// Secrets â€” changeable via: firebase functions:secrets:set SECRET_NAME
const togetherKey = defineSecret("TOGETHER_API_KEY");
const geminiKey = defineSecret("GEMINI_API_KEY");
const metaKey = defineSecret("META_MODEL_API_KEY");
const browserUseKey = defineSecret("BROWSER_USE_API_KEY");


const TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions";
const TEXT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
const VISION_MODEL = "meta-llama/Llama-Vision-Free";
// Vision runs on Google Gemini (free tier). Models are tried in order and the
// first success wins, so a renamed or quota-capped model falls through to the
// next one automatically.
const GEMINI_VISION_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Vision primary: Meta Model API (Muse Spark). It is OpenAI-compatible, so
// the OpenAI-style messages array goes as-is. Gemini stays as the fallback.
const META_API_URL = "https://api.meta.ai/v1/chat/completions";
const SPARK_VISION_MODEL = "muse-spark-1.3";
// Chart Plot format: ANALYZE image requests answer as a JSON envelope so the
// app can draw the levels on the user's chart (drawings) and offer tappable
// follow-ups (actions). The handler converts the envelope back into the
// classic "VERDICT: ... + read" text contract, so nothing downstream changes.
const PLOT_FORMAT_INSTRUCTION = `
-----------------------
CHART PLOT FORMAT (required)
-----------------------
This is an ANALYZE request. This format OVERRIDES any earlier formatting instruction: do NOT start with a VERDICT line and do NOT write any prose outside the JSON. Reply with ONLY a JSON object in exactly this shape:
{"verdict":"BULLISH" or "BEARISH" or "NEUTRAL","confidence":0-100,"read":"your educational read in markdown — key support/resistance levels, trend and patterns, confluence, and one lesson — just without a verdict line. Keep it tight, roughly 250-400 words: the drawings carry the levels, so do not list every price twice","drawings":[up to 6 items],"actions":[2 to 4 items]}
drawings mark the exact levels and zones your read describes, so the app can draw them on the user's chart. Coordinates are PERCENTAGES of the image: x runs 0-100 left to right, y runs 0-100 TOP to bottom.
- Zone: {"type":"zone","tone":"support" or "resistance","x1":left,"y1":top,"x2":right,"y2":bottom,"label":"Support 4,000-4,150"}
- Line: {"type":"line","tone":"trend" or "support" or "resistance","x1":start x,"y1":start y,"x2":end x,"y2":end y,"label":"Downtrend line"}
Only draw levels you can actually see on the chart. Keep labels short.
actions are tappable follow-ups the app will offer under your read. Ground them in THIS chart. Allowed kinds:
- {"kind":"watch","label":"Watch the 4,000 support","symbol":"XAUUSD","level":4000} — level is the one price that matters, or null.
- {"kind":"remind","label":"Remind me at tomorrow's open","symbol":"XAUUSD","when":"open"} — when is "open", "4h", or "tomorrow".
- {"kind":"watchlist","label":"Add XAUUSD to my watchlist","symbol":"XAUUSD"}
- {"kind":"teach","label":"Teach me: blow-off tops","topic":"blow-off tops"}
symbol is the instrument shown on the chart (XAUUSD, BTCUSD, US30, AAPL...), or null if you cannot read it.`;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TECHNICAL ANALYSIS â€” computed from free Yahoo/CoinGecko OHLCV data
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = calcSMA(data.slice(0, period), period);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 == null || ema26 == null) return null;

  // Calculate full MACD line for signal line
  const macdLine = [];
  const k12 = 2 / 13;
  const k26 = 2 / 27;
  let e12 = calcSMA(closes.slice(0, 12), 12);
  let e26 = calcSMA(closes.slice(0, 26), 26);

  for (let i = 26; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    e26 = closes[i] * k26 + e26 * (1 - k26);
    macdLine.push(e12 - e26);
  }

  const macd = macdLine[macdLine.length - 1];
  const signal = macdLine.length >= 9 ? calcEMA(macdLine, 9) : null;
  const histogram = signal != null ? macd - signal : null;

  return { macd: +macd.toFixed(4), signal: signal != null ? +signal.toFixed(4) : null, histogram: histogram != null ? +histogram.toFixed(4) : null };
}

function calcBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const sma = calcSMA(closes, period);
  const slice = closes.slice(-period);
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: +(sma + stdDev * sd).toFixed(4),
    middle: +sma.toFixed(4),
    lower: +(sma - stdDev * sd).toFixed(4),
  };
}

function findSupportResistance(highs, lows, closes) {
  if (closes.length < 10) return null;
  const levels = [];

  // Find swing highs and lows (look back 3 candles each way)
  const lookback = 3;
  for (let i = lookback; i < closes.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isSwingHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isSwingLow = false;
    }
    if (isSwingHigh) levels.push({ type: "resistance", price: highs[i] });
    if (isSwingLow) levels.push({ type: "support", price: lows[i] });
  }

  // Cluster nearby levels (within 0.5% of each other)
  const clustered = [];
  const used = new Set();
  for (let i = 0; i < levels.length; i++) {
    if (used.has(i)) continue;
    const cluster = [levels[i]];
    used.add(i);
    for (let j = i + 1; j < levels.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(levels[i].price - levels[j].price) / levels[i].price < 0.005) {
        cluster.push(levels[j]);
        used.add(j);
      }
    }
    const avgPrice = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
    const type = cluster.filter((l) => l.type === "resistance").length >= cluster.filter((l) => l.type === "support").length ? "resistance" : "support";
    clustered.push({ type, price: +avgPrice.toFixed(4), touches: cluster.length });
  }

  // Sort by number of touches (stronger levels first) and return top levels
  const currentPrice = closes[closes.length - 1];
  const supports = clustered
    .filter((l) => l.price < currentPrice)
    .sort((a, b) => b.touches - a.touches || b.price - a.price)
    .slice(0, 3);
  const resistances = clustered
    .filter((l) => l.price >= currentPrice)
    .sort((a, b) => b.touches - a.touches || a.price - b.price)
    .slice(0, 3);

  return { supports, resistances };
}

function calcVolumeProfile(volumes, closes) {
  if (!volumes || volumes.length < 5) return null;
  const recent5 = volumes.slice(-5);
  const older = volumes.slice(-20, -5);
  const avgRecent = recent5.reduce((a, b) => a + b, 0) / recent5.length;
  const avgOlder = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent;
  const ratio = avgOlder > 0 ? avgRecent / avgOlder : 1;

  let trend = "normal";
  if (ratio > 1.5) trend = "significantly increasing";
  else if (ratio > 1.15) trend = "increasing";
  else if (ratio < 0.65) trend = "significantly decreasing";
  else if (ratio < 0.85) trend = "decreasing";

  return { avgRecent: Math.round(avgRecent), avgOlder: Math.round(avgOlder), trend };
}

function runFullTA(closes, highs, lows, volumes) {
  const result = {};

  result.currentPrice = closes[closes.length - 1];
  result.priceChange = closes.length >= 2
    ? +(((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100).toFixed(2)
    : null;

  // RSI
  const rsi = calcRSI(closes, 14);
  if (rsi != null) result.rsi = +rsi.toFixed(2);

  // Moving averages
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);

  result.movingAverages = {};
  if (ema9 != null) result.movingAverages.EMA9 = +ema9.toFixed(4);
  if (ema21 != null) result.movingAverages.EMA21 = +ema21.toFixed(4);
  if (sma20 != null) result.movingAverages.SMA20 = +sma20.toFixed(4);
  if (sma50 != null) result.movingAverages.SMA50 = +sma50.toFixed(4);
  if (sma200 != null) result.movingAverages.SMA200 = +sma200.toFixed(4);

  // MACD
  const macd = calcMACD(closes);
  if (macd) result.macd = macd;

  // Bollinger Bands
  const bb = calcBollingerBands(closes, 20, 2);
  if (bb) result.bollingerBands = bb;

  // Support & Resistance
  if (highs && lows) {
    const sr = findSupportResistance(highs, lows, closes);
    if (sr) result.supportResistance = sr;
  }

  // Volume
  const vol = calcVolumeProfile(volumes, closes);
  if (vol) result.volume = vol;

  // Quick trend assessment from MAs
  if (ema9 != null && ema21 != null && sma50 != null) {
    const price = result.currentPrice;
    if (price > ema9 && ema9 > ema21 && ema21 > sma50) result.trend = "strong uptrend";
    else if (price > ema21 && ema21 > sma50) result.trend = "uptrend";
    else if (price < ema9 && ema9 < ema21 && ema21 < sma50) result.trend = "strong downtrend";
    else if (price < ema21 && ema21 < sma50) result.trend = "downtrend";
    else result.trend = "ranging/consolidating";
  }

  return result;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DATA FETCHING â€” expanded with OHLCV for TA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ Ticker / Symbol Maps â”€â”€â”€

const CRYPTO_MAP = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum",
  sol: "solana", solana: "solana",
  xrp: "ripple", ripple: "ripple",
  ada: "cardano", cardano: "cardano",
  doge: "dogecoin", dogecoin: "dogecoin",
  dot: "polkadot", polkadot: "polkadot",
  matic: "matic-network", polygon: "matic-network",
  avax: "avalanche-2", avalanche: "avalanche-2",
  link: "chainlink", chainlink: "chainlink",
  bnb: "binancecoin", shib: "shiba-inu",
  ltc: "litecoin", uni: "uniswap", atom: "cosmos",
  near: "near", apt: "aptos", arb: "arbitrum",
  op: "optimism", sui: "sui", pepe: "pepe",
};

// Reverse map: CoinGecko ID â†’ common ticker for display
const CRYPTO_TICKER = {};
for (const [key, val] of Object.entries(CRYPTO_MAP)) {
  if (key.length <= 5 && !CRYPTO_TICKER[val]) CRYPTO_TICKER[val] = key.toUpperCase();
}

const STOCK_ALIASES = {
  tesla: "TSLA", apple: "AAPL", google: "GOOGL", alphabet: "GOOGL",
  amazon: "AMZN", microsoft: "MSFT", nvidia: "NVDA", meta: "META",
  facebook: "META", netflix: "NFLX", amd: "AMD", intel: "INTC",
  disney: "DIS", boeing: "BA", coinbase: "COIN", palantir: "PLTR",
  "s&p": "^GSPC", "s&p 500": "^GSPC", sp500: "^GSPC", spy: "SPY",
  nasdaq: "^IXIC", qqq: "QQQ", dow: "^DJI", dia: "DIA",
  gold: "GC=F", silver: "SI=F", oil: "CL=F", "crude oil": "CL=F",
  "natural gas": "NG=F",
  us30: "^DJI", nas100: "^IXIC", spx500: "^GSPC", xauusd: "GC=F",
};

// Extract tickers/coins from user prompt
function detectAssets(prompt) {
  const lower = prompt.toLowerCase().replace(/['']/g, "'");
  const words = lower.split(/[\s,!?.]+/).filter(Boolean);
  const cryptos = [];
  const stocks = [];

  for (const word of words) {
    const clean = word.replace(/[^a-z0-9&]/g, "");
    if (CRYPTO_MAP[clean]) {
      if (!cryptos.find((c) => c.coinId === CRYPTO_MAP[clean])) {
        cryptos.push({ query: clean, coinId: CRYPTO_MAP[clean] });
      }
    } else if (STOCK_ALIASES[clean]) {
      if (!stocks.find((s) => s.symbol === STOCK_ALIASES[clean])) {
        stocks.push({ query: clean, symbol: STOCK_ALIASES[clean] });
      }
    }
  }

  // Multi-word aliases
  for (const [alias, symbol] of Object.entries(STOCK_ALIASES)) {
    if (alias.includes(" ") && lower.includes(alias)) {
      if (!stocks.find((s) => s.symbol === symbol)) {
        stocks.push({ query: alias, symbol });
      }
    }
  }

  // Raw uppercase tickers (e.g. PLTR, HOOD)
  const tickerRegex = /\b([A-Z]{2,5})\b/g;
  let m;
  while ((m = tickerRegex.exec(prompt)) !== null) {
    const ticker = m[1];
    const ignore = ["AI", "THE", "AND", "OR", "IS", "IT", "TO", "DO", "MY", "ME", "IF", "SO", "UP", "AT", "ON", "IN", "BY", "OF", "NO", "TP", "SL", "RR"];
    if (!stocks.find((s) => s.symbol === ticker) && !ignore.includes(ticker)) {
      stocks.push({ query: ticker, symbol: ticker });
    }
  }

  return { cryptos, stocks };
}

// ─── Inline chart cards ───
// "Show me a chart of US30" → the reply carries a live TradingView chart
// card, no upload needed. Detection is deterministic (no model cost): the
// prompt needs chart intent AND a symbol we can map to a TradingView feed.
const CHART_TV_MAP = {
  US30: "OANDA:US30USD", USA30: "OANDA:US30USD", DJI: "OANDA:US30USD", DOW: "OANDA:US30USD", DIA: "OANDA:US30USD",
  NAS100: "OANDA:NAS100USD", US100: "OANDA:NAS100USD", NDX: "OANDA:NAS100USD", NASDAQ: "OANDA:NAS100USD", QQQ: "NASDAQ:QQQ",
  SPX500: "TVC:SPX", SP500: "TVC:SPX", SPX: "TVC:SPX",
  GOLD: "TVC:GOLD", XAUUSD: "TVC:GOLD", XAU: "TVC:GOLD",
  SILVER: "TVC:SILVER", XAGUSD: "TVC:SILVER",
  BTC: "BITSTAMP:BTCUSD", BTCUSD: "BITSTAMP:BTCUSD", BITCOIN: "BITSTAMP:BTCUSD",
  ETH: "BITSTAMP:ETHUSD", ETHUSD: "BITSTAMP:ETHUSD", ETHEREUM: "BITSTAMP:ETHUSD",
  SOL: "COINBASE:SOLUSD", SOLANA: "COINBASE:SOLUSD",
  XRP: "BITSTAMP:XRPUSD", DOGE: "COINBASE:DOGEUSD", DOGECOIN: "COINBASE:DOGEUSD",
  EURUSD: "FX:EURUSD", GBPUSD: "FX:GBPUSD", USDJPY: "FX:USDJPY", AUDUSD: "FX:AUDUSD", USDCAD: "FX:USDCAD", USDCHF: "FX:USDCHF",
  OIL: "TVC:USOIL", WTI: "TVC:USOIL", USOIL: "TVC:USOIL",
  SPY: "AMEX:SPY",
  US500: "TVC:SPX", DXY: "TVC:DXY", VIX: "TVC:VIX", UK100: "TVC:UKX", GER40: "TVC:DE40", JPN225: "TVC:NI225",
  GBPJPY: "FX:GBPJPY", EURGBP: "FX:EURGBP", EURJPY: "FX:EURJPY", GBPCHF: "FX:GBPCHF",
  ADA: "COINBASE:ADAUSD", LTC: "COINBASE:LTCUSD", LINK: "COINBASE:LINKUSD",
  BNB: "BINANCE:BNBUSDT", AVAX: "COINBASE:AVAXUSD",
};
const CHART_INTERVALS = [
  [/\b15[\s-]?min(ute)?s?\b/i, "15"],
  [/\b5[\s-]?min(ute)?s?\b/i, "5"],
  [/\b30[\s-]?min(ute)?s?\b/i, "30"],
  [/\b1[\s-]?min(ute)?s?\b/i, "1"],
  [/\b4[\s-]?hours?\b/i, "240"],
  [/\b1[\s-]?hours?\b/i, "60"],
  [/\bmonthly\b|\b1\s?mo\b/i, "M"],
  [/\bweekly\b|\b1\s?w\b/i, "W"],
  [/\b15\s?m\b|\bfifteen minute\b/i, "15"],
  [/\b5\s?m\b|\bfive minute\b/i, "5"],
  [/\b30\s?m\b|\bthirty minute\b/i, "30"],
  [/\b1\s?m\b|\bone minute\b/i, "1"],
  [/\b4\s?h\b|\bfour hour\b/i, "240"],
  [/\b1\s?h\b|\bhourly\b|\bone hour\b/i, "60"],
  [/\bdaily\b|\b1\s?d\b|\bday chart\b/i, "D"],
];
function detectChartRequest(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  // Broad intent set: a mapped symbol token is ALSO required below, so
  // everyday phrasings ("let me see gold", "what's US30 doing") are safe.
  const intent =
    /\b(chart|graph|mock[-\s]?up|show|display|pull up|pull|bring up|open|load|see|view|look|looking|looks|watch|check|give me|doing|draw|analyze|analyse|support|resistance|levels|go to|switch|timeframe|tf)\b/i.test(prompt) ||
    /^\s*(us30|nas100|spx500|gold|xauusd|btc|eth|eurusd|gbpusd|sol)\s*(chart)?\s*(please)?\s*$/i.test(prompt);
  if (!intent) return null;
  const upper = prompt.toUpperCase().replace(/([A-Z]{3})\s*\/\s*([A-Z]{3})/g, "$1$2");
  let tvSymbol = null;
  let display = null;
  if (upper.includes("S&P")) { tvSymbol = "TVC:SPX"; display = "SPX500"; }
  if (!tvSymbol) {
    const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
    for (const tok of tokens) {
      if (CHART_TV_MAP[tok]) { tvSymbol = CHART_TV_MAP[tok]; display = tok; break; }
      const bare = tok.replace(/USD$/, "");
      if (bare !== tok && CHART_TV_MAP[bare]) { tvSymbol = CHART_TV_MAP[bare]; display = tok; break; }
    }
  }
  if (!tvSymbol) {
    const dollar = /\$([A-Za-z]{1,5})\b/.exec(prompt);
    if (dollar) { tvSymbol = `NASDAQ:${dollar[1].toUpperCase()}`; display = dollar[1].toUpperCase(); }
  }
  if (!tvSymbol) return null;
  let interval = "D";
  for (const [re, code] of CHART_INTERVALS) { if (re.test(prompt)) { interval = code; break; } }
  return { symbol: display, tvSymbol, interval };
}

// Sentiment requests ("market sentiment on Tesla") — the chat shows
// TradingView's live technical-analysis gauge for the symbol, so the
// reply only needs a short lean, not an essay. Symbol resolution mirrors
// detectChartRequest, plus company names via STOCK_ALIASES.
function detectSentimentRequest(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  if (!/\bsentiment\b/i.test(prompt)) return null;
  const upper = prompt.toUpperCase().replace(/([A-Z]{3})\s*\/\s*([A-Z]{3})/g, "$1$2");
  let tvSymbol = null;
  let display = null;
  if (upper.includes("S&P")) { tvSymbol = "TVC:SPX"; display = "SPX500"; }
  if (!tvSymbol) {
    const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
    for (const tok of tokens) {
      if (CHART_TV_MAP[tok]) { tvSymbol = CHART_TV_MAP[tok]; display = tok; break; }
      const bare = tok.replace(/USD$/, "");
      if (bare !== tok && CHART_TV_MAP[bare]) { tvSymbol = CHART_TV_MAP[bare]; display = tok; break; }
    }
  }
  if (!tvSymbol) {
    // Bare tickers that only exist as alias values (TSLA, AAPL, NVDA…)
    const aliasValues = new Set(Object.values(STOCK_ALIASES).map((v) => String(v).toUpperCase()));
    const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
    for (const tok of tokens) {
      if (aliasValues.has(tok)) { display = tok; tvSymbol = `NASDAQ:${tok}`; break; }
    }
  }
  if (!tvSymbol) {
    const lowerTokens = prompt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const tok of lowerTokens) {
      const alias = STOCK_ALIASES[tok];
      if (alias) {
        display = alias.toUpperCase();
        tvSymbol = CHART_TV_MAP[display] || `NASDAQ:${display}`;
        break;
      }
    }
  }
  if (!tvSymbol) {
    const dollar = /\$([A-Za-z]{1,5})\b/.exec(prompt);
    if (dollar) { tvSymbol = `NASDAQ:${dollar[1].toUpperCase()}`; display = dollar[1].toUpperCase(); }
  }
  if (!tvSymbol) return null;
  let interval = "D";
  for (const [re, code] of CHART_INTERVALS) { if (re.test(prompt)) { interval = code; break; } }
  return { symbol: display, tvSymbol, interval };
}

// ─── Drawn levels for chart cards ───
// Support/resistance + trendlines computed from REAL OHLCV data (Yahoo for
// stocks/indexes/forex, CoinGecko for crypto), so the lines drawn on a
// requested chart are actual levels at actual prices — not illustrations.
const CHART_YAHOO_MAP = {
  SPX: "^GSPC", XAU: "GC=F", XAGUSD: "SI=F", WTI: "CL=F", USOIL: "CL=F",
  DXY: "DX-Y.NYB", VIX: "^VIX", UK100: "^FTSE", GER40: "^GDAXI", JPN225: "^N225",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "JPY=X", AUDUSD: "AUDUSD=X",
  USDCAD: "CAD=X", USDCHF: "CHF=X", GBPJPY: "GBPJPY=X", EURGBP: "EURGBP=X", EURJPY: "EURJPY=X",
};
const YAHOO_RANGE = {
  "1": ["1d", "1m"], "5": ["5d", "5m"], "15": ["5d", "15m"], "30": ["1mo", "30m"],
  "60": ["3mo", "60m"], "240": ["6mo", "60m"], "D": ["6mo", "1d"], "W": ["2y", "1wk"], "M": ["5y", "1mo"],
};

function chartDataSource(chartReq) {
  const display = chartReq.symbol.toUpperCase();
  const lower = display.toLowerCase();
  const stripped = display.replace(/USD$/, "");
  if (CRYPTO_MAP[lower]) return { type: "crypto", coinId: CRYPTO_MAP[lower] };
  if (stripped !== display && CRYPTO_MAP[stripped.toLowerCase()]) return { type: "crypto", coinId: CRYPTO_MAP[stripped.toLowerCase()] };
  if (CHART_YAHOO_MAP[display]) return { type: "stock", symbol: CHART_YAHOO_MAP[display] };
  if (STOCK_ALIASES[lower]) return { type: "stock", symbol: STOCK_ALIASES[lower] };
  if (stripped !== display && STOCK_ALIASES[stripped.toLowerCase()]) return { type: "stock", symbol: STOCK_ALIASES[stripped.toLowerCase()] };
  return { type: "stock", symbol: display };
}

// --- Exchange-grade crypto candles (Kraken public REST) ---
// CoinGecko's free OHLC is coarse (4-hour candles even when the
// user asked for 15 minutes). Kraken's public OHLC endpoint — the
// same source the CCXT library wraps — serves true 1m-1w candles
// with real volume and needs no API key. Integrated directly
// instead of the 70MB CCXT package: identical data, no cold-start
// cost. CoinGecko stays as the fallback for unmapped pairs and
// any Kraken failure.
const KRAKEN_PAIRS = { bitcoin: "XBTUSD", ethereum: "ETHUSD", solana: "SOLUSD", ripple: "XRPUSD", dogecoin: "DOGEUSD", cardano: "ADAUSD", polkadot: "DOTUSD", "avalanche-2": "AVAXUSD", chainlink: "LINKUSD", "shiba-inu": "SHIBUSD", litecoin: "LTCUSD", uniswap: "UNIUSD", cosmos: "ATOMUSD", near: "NEARUSD", aptos: "APTUSD", arbitrum: "ARBUSD", optimism: "OPUSD", sui: "SUIUSD", pepe: "PEPEUSD" };
const KRAKEN_INTERVALS = { "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, D: 1440, W: 10080, M: 10080 };
async function fetchKrakenSeries(coinId, intervalCode) {
  const pair = KRAKEN_PAIRS[coinId];
  if (!pair) return null;
  const mins = KRAKEN_INTERVALS[intervalCode] || 1440;
  try {
    const url = "https://api.kraken.com/0/public/OHLC?pair=" + pair + "&interval=" + mins;
    const res = await Promise.race([
      fetch(url, { headers: { accept: "application/json" } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("kraken timeout")), 5000)),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || (data.error && data.error.length)) return null;
    const key = Object.keys(data.result || {}).find((k) => k !== "last");
    const rows = key ? data.result[key] : null;
    if (!Array.isArray(rows) || rows.length < 30) return null;
    return {
      ts: rows.map((r) => r[0] * 1000),
      opens: rows.map((r) => parseFloat(r[1])),
      highs: rows.map((r) => parseFloat(r[2])),
      lows: rows.map((r) => parseFloat(r[3])),
      closes: rows.map((r) => parseFloat(r[4])),
      volumes: rows.map((r) => parseFloat(r[6])),
    };
  } catch { return null; }
}

async function fetchRawSeries(source, intervalCode) {
  try {
    if (source.type === "crypto") {
      const krakenSeries = await fetchKrakenSeries(source.coinId, intervalCode);
      if (krakenSeries) return krakenSeries;
      const days = ["D", "W", "M"].includes(intervalCode) ? 180 : 7;
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${source.coinId}/ohlc?vs_currency=usd&days=${days}`, { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 30) return null;
      return {
        ts: data.map((d) => d[0]),
        opens: data.map((d) => d[1]),
        highs: data.map((d) => d[2]),
        lows: data.map((d) => d[3]),
        closes: data.map((d) => d[4]),
        volumes: data.map(() => null), // CoinGecko OHLC carries no volume
      };
    }
    const [range, iv] = YAHOO_RANGE[intervalCode] || YAHOO_RANGE.D;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(source.symbol)}?interval=${iv}&range=${range}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    const q = result?.indicators?.quote?.[0];
    if (!result || !q || !Array.isArray(result.timestamp)) return null;
    let rows = result.timestamp
      .map((t, i) => ({ t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] ?? null }))
      .filter((r) => r.o != null && r.h != null && r.l != null && r.c != null);
    if (intervalCode === "240") {
      const agg = [];
      for (let i = 0; i < rows.length; i += 4) {
        const g = rows.slice(i, i + 4);
        if (g.length === 0) continue;
        agg.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1].c, v: g.reduce((s, x) => s + (x.v || 0), 0) });
      }
      rows = agg;
    }
    if (rows.length < 30) return null;
    return { ts: rows.map((r) => r.t), opens: rows.map((r) => r.o), highs: rows.map((r) => r.h), lows: rows.map((r) => r.l), closes: rows.map((r) => r.c), volumes: rows.map((r) => r.v) };
  } catch (err) {
    console.error("fetchRawSeries error:", err.message);
    return null;
  }
}

function fmtLevelPrice(p) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
}

// Pure drawing computation over a raw series (the visible window is the
// last 120 candles; the client maps prices to the chart's price axis).
function levelsFromSeries(series) {
  const n = series.closes.length;
  const start = Math.max(0, n - 120);
  const highs = series.highs.slice(start);
  const lows = series.lows.slice(start);
  const closes = series.closes.slice(start);
  const opens = (series.opens || series.closes).slice(start);
  const count = closes.length;
  if (count < 30) return null;
  // Candles for the desk's own chart — same visible window as the levels,
  // so drawn lines always sit exactly on the candles they came from.
  const volumes = series.volumes ? series.volumes.slice(start) : [];
  const candles = closes.map((c, i) => ({
    time: Math.floor(series.ts[start + i] / 1000),
    open: opens[i], high: highs[i], low: lows[i], close: c,
    ...(volumes[i] != null ? { volume: volumes[i] } : {}),
  }));
  const price = closes[count - 1];
  const drawings = [];
  const sr = findSupportResistance(highs, lows, closes);
  if (sr) {
    const sups = (sr.supports || []).filter((s) => s.price < price).sort((a, b) => b.price - a.price).slice(0, 2);
    const ress = (sr.resistances || []).filter((r) => r.price > price).sort((a, b) => a.price - b.price).slice(0, 2);
    for (const s of sups) drawings.push({ type: "hline", tone: "support", price: s.price, label: `Support ${fmtLevelPrice(s.price)}` });
    for (const r of ress) drawings.push({ type: "hline", tone: "resistance", price: r.price, label: `Resistance ${fmtLevelPrice(r.price)}` });
  }
  const lookback = 3;
  const swingHighs = [];
  const swingLows = [];
  for (let i = lookback; i < count - lookback; i++) {
    let hi = true;
    let lo = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) hi = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) lo = false;
    }
    if (hi) swingHighs.push({ i, price: highs[i] });
    if (lo) swingLows.push({ i, price: lows[i] });
  }
  const lastTwo = (arr) => (arr.length >= 2 ? [arr[arr.length - 2], arr[arr.length - 1]] : null);
  const lh = lastTwo(swingHighs);
  if (lh && lh[1].price < lh[0].price && lh[1].i - lh[0].i >= 5) {
    drawings.push({ type: "trend", tone: "trend", i1: lh[0].i, p1: lh[0].price, i2: lh[1].i, p2: lh[1].price, label: "Trendline" });
  }
  const ll = lastTwo(swingLows);
  if (ll && ll[1].price > ll[0].price && ll[1].i - ll[0].i >= 5) {
    drawings.push({ type: "trend", tone: "trend", i1: ll[0].i, p1: ll[0].price, i2: ll[1].i, p2: ll[1].price, label: "Trendline" });
  }
  let pMin = Math.min(...lows);
  let pMax = Math.max(...highs);
  const pad = (pMax - pMin) * 0.05;
  pMin -= pad;
  pMax += pad;
  return { drawings, pMin, pMax, count, startTs: series.ts[start], endTs: series.ts[n - 1], currentPrice: price, candles };
}

async function computeChartLevels(chartReq) {
  const source = chartDataSource(chartReq);
  const series = await fetchRawSeries(source, chartReq.interval || "D");
  if (!series) return null;
  return levelsFromSeries(series);
}

// Which half of the chart test failed (symbol vs intent) — for log diagnosis
function chartMissReason(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) return null;
  const upper = prompt.toUpperCase().replace(/([A-Z]{3})\s*\/\s*([A-Z]{3})/g, "$1$2");
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  const symbolHit = upper.includes("S&P") || tokens.some((t) => CHART_TV_MAP[t]) || /\$[A-Za-z]{1,5}\b/.test(prompt);
  const intentHit =
    /\b(chart|graph|mock[-\s]?up|show|display|pull up|pull|bring up|open|load|see|view|look|looking|looks|watch|check|give me|doing|draw|analyze|analyse|support|resistance|levels|go to|switch|timeframe|tf)\b/i.test(prompt) ||
    /^\s*(us30|nas100|spx500|gold|xauusd|btc|eth|eurusd|gbpusd|sol)\s*(chart)?\s*(please)?\s*$/i.test(prompt);
  if (symbolHit === intentHit) return null; // both or neither — not a near miss
  return symbolHit ? "symbol-no-intent" : "intent-no-symbol";
}

// Parse a timeframe code out of free text ("15 min tf", "1-hour").
function parseInterval(text) {
  if (typeof text !== "string") return null;
  for (const [re, code] of CHART_INTERVALS) {
    if (re.test(text)) return code;
  }
  return null;
}

const INTERVAL_NAMES = { "1": "1-minute", "5": "5-minute", "15": "15-minute", "30": "30-minute", "60": "1-hour", "240": "4-hour", D: "daily", W: "weekly", M: "monthly" };

// Chart symbol for a resolved TA ticker, whichever path resolved it.
function chartSymbolFor(tk) {
  if (!tk) return null;
  const disp = String(tk.display || "").toUpperCase();
  if (CHART_TV_MAP[disp]) return { symbol: disp, tvSymbol: CHART_TV_MAP[disp] };
  const mapped = disp === "GC=F" ? "GOLD" : disp === "SI=F" ? "SILVER" : disp === "CL=F" ? "USOIL" : disp === "^DJI" ? "US30" : disp === "^IXIC" ? "NAS100" : disp === "^GSPC" ? "SPX500" : null;
  if (mapped) return { symbol: mapped, tvSymbol: CHART_TV_MAP[mapped] };
  if (/^[A-Z]{1,5}$/.test(disp)) return { symbol: disp, tvSymbol: `NASDAQ:${disp}` };
  return null;
}

// A chart follow-up that names only a timeframe ("go to the 15 min
// tf") resolves its symbol from the user's own earlier chart ask.
function resolveContextChart(prompt, history) {
  const interval = parseInterval(prompt);
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0 && i >= history.length - 10; i--) {
    const h = history[i];
    if (!h || h.role !== "user" || typeof h.text !== "string") continue;
    const r = detectChartRequest(h.text);
    if (r) return { symbol: r.symbol, tvSymbol: r.tvSymbol, interval: interval || r.interval || "D" };
  }
  return null;
}

// Intent router: a small structured model call that UNDERSTANDS the
// message with conversation context, instead of keyword matching.
// Returns { kind, symbol, interval } or null. Symbols are validated
// against the known maps afterwards — the router can never invent one.
async function classifyIntent(prompt, history, apiKey) {
  try {
    const recent = (Array.isArray(history) ? history.slice(-6) : [])
      .map((h) => `${h && h.role === "user" ? "User" : "Wallie"}: ${String((h && h.text) || "").slice(0, 200)}`)
      .join("\n");
    const system =
      "You route messages for a trading education assistant. Read the conversation and the new message, and decide what the user is asking for, in their own words, however they phrase it. Reply with ONLY a JSON object: {\"kind\": ..., \"symbol\": ..., \"interval\": ...}. " +
      "kind is one of: \"chart\" (they want to see, pull up, or switch a chart or timeframe), \"analysis\" (they ask about a market's indicators, levels, trend, or price action — RSI, MACD, moving averages, support/resistance, what price is doing), \"signal\" (they want a trade signal or setup), \"sentiment\" (they ask about market sentiment), \"none\" (anything else, including lessons and general questions). " +
      "symbol is the market they mean, resolved from context when they say 'it', 'this', or only name a timeframe — an uppercase code like GOLD, BTC, EURUSD, US30, AAPL — or null when no market is meant. " +
      "interval is one of \"1\", \"5\", \"15\", \"30\", \"60\", \"240\", \"D\", \"W\" when they name or imply a timeframe (including from context), else null.";
    const messages = [
      { role: "system", content: system },
      { role: "user", content: `Conversation:\n${recent || "(new conversation)"}\n\nNew message: ${prompt}` },
    ];
    const data = await Promise.race([
      callTogetherAI(messages, apiKey, { model: TEXT_MODEL, maxTokens: 120, temperature: 0.1 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("intent timeout")), 4500)),
    ]);
    const text = data?.choices?.[0]?.message?.content || "";
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!["chart", "analysis", "signal", "sentiment", "none"].includes(j.kind)) return null;
    let symbol = null;
    if (typeof j.symbol === "string" && j.symbol.trim()) {
      const up = j.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const bare = up.replace(/USD$/, "");
      if (CHART_TV_MAP[up]) symbol = up;
      else if (bare !== up && CHART_TV_MAP[bare]) symbol = bare;
      else if (STOCK_ALIASES[up.toLowerCase()]) symbol = up;
      else if (/^[A-Z]{1,5}$/.test(up)) symbol = up;
    }
    const interval = ["1", "5", "15", "30", "60", "240", "D", "W", "M"].includes(String(j.interval)) ? String(j.interval) : null;
    return { kind: j.kind, symbol, interval };
  } catch (e) {
    return null;
  }
}

// Detect the primary ticker from prompt + pageContext (for TA enrichment)
function detectPrimaryTicker(prompt, pageContext) {
  // pageContext ticker takes priority if the user seems to be asking about "this" chart
  const lp = prompt.toLowerCase();
  const referringToScreen = /\b(this|current|here|the chart|my chart|analyze|setup)\b/i.test(prompt);

  if (referringToScreen && pageContext?.ticker) {
    const ticker = pageContext.ticker.replace(/USD$|USDT$|\/USD$|\/USDT$/i, "");
    const lower = ticker.toLowerCase();
    if (CRYPTO_MAP[lower]) return { type: "crypto", coinId: CRYPTO_MAP[lower], display: ticker.toUpperCase() };
    return { type: "stock", symbol: ticker.toUpperCase(), display: ticker.toUpperCase() };
  }

  // Otherwise detect from prompt
  const { cryptos, stocks } = detectAssets(prompt);
  if (cryptos.length > 0) return { type: "crypto", coinId: cryptos[0].coinId, display: cryptos[0].query.toUpperCase() };
  if (stocks.length > 0) return { type: "stock", symbol: stocks[0].symbol, display: stocks[0].symbol };

  // Last resort: pageContext ticker
  if (pageContext?.ticker) {
    const ticker = pageContext.ticker.replace(/USD$|USDT$|\/USD$|\/USDT$/i, "");
    const lower = ticker.toLowerCase();
    if (CRYPTO_MAP[lower]) return { type: "crypto", coinId: CRYPTO_MAP[lower], display: ticker.toUpperCase() };
    return { type: "stock", symbol: ticker.toUpperCase(), display: ticker.toUpperCase() };
  }

  return null;
}

// â”€â”€â”€ Yahoo Finance: full OHLCV data + TA â”€â”€â”€

async function fetchStockOHLCV(symbol, range = "6mo", interval = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    if (!quotes) return null;

    const closes = (quotes.close || []).filter((v) => v != null);
    const highs = (quotes.high || []).filter((v) => v != null);
    const lows = (quotes.low || []).filter((v) => v != null);
    const volumes = (quotes.volume || []).filter((v) => v != null);

    if (closes.length < 10) return null;

    const ta = runFullTA(closes, highs, lows, volumes);

    return {
      symbol: meta.symbol,
      currency: meta.currency,
      exchange: meta.exchangeName,
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose || meta.previousClose,
      ta,
    };
  } catch (err) {
    console.error("Yahoo OHLCV error:", err.message);
    return null;
  }
}

// â”€â”€â”€ CoinGecko: OHLCV data + TA â”€â”€â”€

async function fetchCryptoOHLCV(coinId) {
  try {
    // Prefer true daily candles from the exchange (Kraken);
    // CoinGecko's free OHLC is coarse even at days=180.
    let closes = null;
    let highs = null;
    let lows = null;
    let volumes = null;
    const ks = await fetchKrakenSeries(coinId, "D");
    if (ks && ks.closes.length >= 10) {
      closes = ks.closes;
      highs = ks.highs;
      lows = ks.lows;
      volumes = ks.volumes;
    }
    if (!closes) {
      // Fetch 180 days of daily OHLC data (free, no API key)
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=180`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 10) return null;
      closes = data.map((d) => d[4]);
      highs = data.map((d) => d[2]);
      lows = data.map((d) => d[3]);
    }

    const ta = runFullTA(closes, highs, lows, volumes);

    // Also get current price + market data
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    const priceRes = await fetch(priceUrl, { headers: { accept: "application/json" } });
    let priceData = null;
    if (priceRes.ok) {
      const pd = await priceRes.json();
      priceData = pd[coinId] || null;
    }

    return {
      coinId,
      ticker: CRYPTO_TICKER[coinId] || coinId.toUpperCase(),
      price: priceData?.usd || ta.currentPrice,
      change24h: priceData?.usd_24h_change?.toFixed(2) || null,
      volume24h: priceData?.usd_24h_vol || null,
      marketCap: priceData?.usd_market_cap || null,
      ta,
    };
  } catch (err) {
    console.error("CoinGecko OHLCV error:", err.message);
    return null;
  }
}

// â”€â”€â”€ Format TA data into a readable string for the LLM â”€â”€â”€

function formatTAForPrompt(label, data) {
  const ta = data.ta;
  if (!ta) return null;

  const lines = [`â”€â”€ TECHNICAL ANALYSIS: ${label} â”€â”€`];

  lines.push(`Current Price: $${ta.currentPrice?.toLocaleString()}`);
  if (ta.priceChange != null) lines.push(`Last Candle Change: ${ta.priceChange > 0 ? "+" : ""}${ta.priceChange}%`);
  if (ta.trend) lines.push(`Trend: ${ta.trend}`);
  if (ta.rsi != null) {
    let rsiNote = "";
    if (ta.rsi > 70) rsiNote = " (overbought)";
    else if (ta.rsi > 60) rsiNote = " (bullish momentum)";
    else if (ta.rsi < 30) rsiNote = " (oversold)";
    else if (ta.rsi < 40) rsiNote = " (bearish momentum)";
    else rsiNote = " (neutral)";
    lines.push(`RSI(14): ${ta.rsi}${rsiNote}`);
  }

  if (ta.macd) {
    const m = ta.macd;
    let macdNote = "";
    if (m.histogram != null) {
      macdNote = m.histogram > 0 ? " (bullish)" : " (bearish)";
    }
    lines.push(`MACD: ${m.macd} | Signal: ${m.signal} | Histogram: ${m.histogram}${macdNote}`);
  }

  if (ta.movingAverages && Object.keys(ta.movingAverages).length > 0) {
    const ma = ta.movingAverages;
    const parts = Object.entries(ma).map(([k, v]) => `${k}: $${v.toLocaleString()}`);
    lines.push(`Moving Averages: ${parts.join(" | ")}`);

    // Price position relative to MAs
    const price = ta.currentPrice;
    const above = Object.entries(ma).filter(([, v]) => price > v).map(([k]) => k);
    const below = Object.entries(ma).filter(([, v]) => price <= v).map(([k]) => k);
    if (above.length > 0) lines.push(`Price ABOVE: ${above.join(", ")}`);
    if (below.length > 0) lines.push(`Price BELOW: ${below.join(", ")}`);
  }

  if (ta.bollingerBands) {
    const bb = ta.bollingerBands;
    const price = ta.currentPrice;
    let bbPos = "";
    if (price >= bb.upper) bbPos = " â€” price at upper band (potential overbought/breakout)";
    else if (price <= bb.lower) bbPos = " â€” price at lower band (potential oversold/breakdown)";
    else bbPos = ` â€” price within bands`;
    lines.push(`Bollinger Bands: Upper $${bb.upper.toLocaleString()} | Mid $${bb.middle.toLocaleString()} | Lower $${bb.lower.toLocaleString()}${bbPos}`);
  }

  if (ta.supportResistance) {
    const sr = ta.supportResistance;
    if (sr.supports.length > 0) {
      lines.push(`Support Levels: ${sr.supports.map((s) => `$${s.price.toLocaleString()} (${s.touches} touches)`).join(" | ")}`);
    }
    if (sr.resistances.length > 0) {
      lines.push(`Resistance Levels: ${sr.resistances.map((r) => `$${r.price.toLocaleString()} (${r.touches} touches)`).join(" | ")}`);
    }
  }

  if (ta.volume) {
    lines.push(`Volume Trend: ${ta.volume.trend} (recent avg: ${ta.volume.avgRecent?.toLocaleString()})`);
  }

  // Extra data (market cap, etc.)
  if (data.change24h != null) lines.push(`24h Change: ${data.change24h}%`);
  if (data.volume24h != null) lines.push(`24h Volume: $${(data.volume24h / 1e9).toFixed(2)}B`);
  if (data.marketCap != null) lines.push(`Market Cap: $${(data.marketCap / 1e9).toFixed(2)}B`);
  if (data.exchange) lines.push(`Exchange: ${data.exchange}`);

  return lines.join("\n");
}

// â”€â”€â”€ Simple price fetch (for non-analysis queries) â”€â”€â”€

async function fetchSimplePrice(prompt) {
  const { cryptos, stocks } = detectAssets(prompt);
  const results = [];

  const cryptoPromises = cryptos.map(async ({ query, coinId }) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      const info = data[coinId];
      if (!info) return;
      results.push(
        `${(CRYPTO_TICKER[coinId] || query).toUpperCase()}: $${info.usd?.toLocaleString()} | ` +
        `24h: ${info.usd_24h_change?.toFixed(2)}% | ` +
        `Vol: $${(info.usd_24h_vol / 1e9).toFixed(2)}B | ` +
        `MCap: $${(info.usd_market_cap / 1e9).toFixed(2)}B`
      );
    } catch {}
  });

  const stockPromises = stocks.slice(0, 5).map(async ({ symbol }) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!res.ok) return;
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) return;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const price = meta.regularMarketPrice;
      const change = prevClose ? ((price - prevClose) / prevClose * 100).toFixed(2) : null;
      results.push(
        `${meta.symbol}: $${price?.toLocaleString()} | ` +
        `Change: ${change > 0 ? "+" : ""}${change}% | ` +
        `Exchange: ${meta.exchangeName}`
      );
    } catch {}
  });

  await Promise.all([...cryptoPromises, ...stockPromises]);
  return results.length > 0 ? results.join("\n") : null;
}

// â”€â”€â”€ News â”€â”€â”€

async function searchGoogleNews(query, whenDays) {
  try {
    const boundedQuery = whenDays && whenDays > 0 ? query + " when:" + whenDays + "d" : query;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(boundedQuery)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const xml = await res.text();

    const results = [];
    const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && results.length < 6) {
      const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim();
      const pubDate = match[3].trim();
      if (title) results.push({ title, date: pubDate });
    }

    if (results.length === 0) return null;
    return results.map((item, i) => `${i + 1}. ${item.title} (${item.date})`).join("\n");
  } catch (err) {
    console.error("Google News search failed:", err);
    return null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYSTEM PROMPT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// --- Macro context (FRED) ---
// Free Federal Reserve data via the keyless fredgraph CSV export.
// Gives event/news answers the macro layer they were missing (a
// gold drop on a hot CPI print is a macro story). Cached in memory
// for 6 hours; every figure carries its observation date because
// monthly series lag by design.
let fredCache = { at: 0, text: null };
async function fetchFredSeries(id, cosd) {
  const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id + "&cosd=" + cosd;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
  if (!res.ok) return [];
  const text = await res.text();
  const rows = [];
  for (const line of text.split("\n")) {
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const v = parseFloat(parts[1]);
    if (!isFinite(v)) continue;
    rows.push({ date: parts[0].trim(), value: v });
  }
  return rows;
}
function fredDayLabel(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fredMonthLabel(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
async function fetchMacroContext() {
  if (fredCache.text && Date.now() - fredCache.at < 6 * 3600 * 1000) return fredCache.text;
  const cosd = new Date(Date.now() - 500 * 86400000).toISOString().split("T")[0];
  const get = async (id) => {
    try {
      return await Promise.race([fetchFredSeries(id, cosd), new Promise((r) => setTimeout(() => r([]), 4000))]);
    } catch { return []; }
  };
  const [cpi, ff, dgs, usd, unrate, vix] = await Promise.all([
    get("CPIAUCSL"), get("FEDFUNDS"), get("DGS10"), get("DTWEXBGS"), get("UNRATE"), get("VIXCLS"),
  ]);
  const lines = [];
  if (cpi.length > 12) {
    const last = cpi[cpi.length - 1];
    const yr = cpi[cpi.length - 13];
    const yoy = ((last.value - yr.value) / yr.value) * 100;
    lines.push("- Inflation (CPI): " + yoy.toFixed(1) + "% year over year (" + fredMonthLabel(last.date) + ")");
  }
  if (ff.length) {
    const l = ff[ff.length - 1];
    lines.push("- Fed funds rate: " + l.value.toFixed(2) + "% (" + fredMonthLabel(l.date) + ")");
  }
  if (unrate.length) {
    const l = unrate[unrate.length - 1];
    lines.push("- Unemployment rate: " + l.value.toFixed(1) + "% (" + fredMonthLabel(l.date) + ")");
  }
  function dailyLine(label, rows, fmt) {
    if (!rows.length) return;
    const l = rows[rows.length - 1];
    const weekAgo = new Date(new Date(l.date + "T00:00:00Z").getTime() - 7 * 86400000).toISOString().split("T")[0];
    let extra = "";
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].date <= weekAgo) { extra = ", was " + fmt(rows[i].value) + " a week earlier"; break; }
    }
    lines.push("- " + label + ": " + fmt(l.value) + " (" + fredDayLabel(l.date) + ")" + extra);
  }
  dailyLine("10-year Treasury yield", dgs, (v) => v.toFixed(2) + "%");
  dailyLine("US dollar (broad index)", usd, (v) => v.toFixed(1));
  dailyLine("VIX (volatility index)", vix, (v) => v.toFixed(1));
  if (!lines.length) return null;
  const text = lines.join("\n");
  if (lines.length >= 3) fredCache = { at: Date.now(), text };
  return text;
}

function buildSignalModePrompt() {
  return `You are Wallie, an AI trading agent that reads charts. The user has uploaded a trading chart photographed from their phone.

Examine the chart for a tradeable setup. Reply with ONLY a JSON object â€” no prose, no markdown, no preamble, no code fences.

Schema when a clean setup exists:
{ "kind": "signal",
  "ticker": <string or null>,
  "timeframe": <string or null, e.g. "5m", "1h", "1D">,
  "entry": <price as string>,
  "stopLoss": <price as string>,
  "takeProfit": <price as string>,
  "rr": <string like "1:2.4">,
  "confidence": "low" | "medium" | "high",
  "reasoning": <2-3 sentences explaining the confluence â€” trend, indicator, level/structure> }

Schema when no clean setup:
{ "kind": "no_signal",
  "reason": <1-2 sentences explaining what's missing â€” e.g. "Price action is choppy and indicators are conflicting" or "Chart is too blurry to read levels reliably"> }

Rules:
- Only return a "signal" if at least 3 things align (trend + indicator + level/structure).
- Risk/reward MUST be â‰¥ 1.5:1, ideally 2:1+.
- If you cannot read clear invalidation (no obvious stop level), return "no_signal".
- If the image isn't a chart at all (a wall, a face, a meme), return "no_signal" with a friendly explanation.
- Be honest. Refusing to signal builds trust. Hallucinating numbers destroys it.
- The "entry", "stopLoss", "takeProfit" values must be readable from the chart's price axis â€” do not invent levels that aren't visible.
- Direction is implied by entry vs stop: stop below entry = long bias, stop above entry = short bias.`;
}

// --- Date awareness (Eastern Time) ---
// Cloud Functions run on UTC; users are on US Eastern. All
// user-facing "today" math happens in America/New_York and always
// carries the weekday, so relative references ("on Friday") have
// an anchor the model can resolve.
const ET_TZ = "America/New_York";
function etTodayParts() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return { y: +g("year"), m: +g("month"), d: +g("day"), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
}
function fmtUTCDate(dt) {
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function etTodayString() { const t = etTodayParts(); return fmtUTCDate(new Date(Date.UTC(t.y, t.m - 1, t.d))); }
function etYesterdayString() { const t = etTodayParts(); return fmtUTCDate(new Date(Date.UTC(t.y, t.m - 1, t.d - 1))); }

// Resolve a relative-day reference ("on Friday", "yesterday",
// "this week") to the actual Eastern date it means, plus a news
// recency window that covers it. Null when there is no reference.
const WEEKDAY_IDX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function resolveRelativeDay(prompt) {
  if (typeof prompt !== "string") return null;
  const p = prompt.toLowerCase();
  const t = etTodayParts();
  const base = Date.UTC(t.y, t.m - 1, t.d);
  const DAY = 86400000;
  const fmt = (ms) => fmtUTCDate(new Date(ms));
  if (/\blast night\b/.test(p)) return { label: "last night", date: fmt(base - DAY), whenDays: 3 };
  if (/\byesterday\b/.test(p)) return { label: "yesterday", date: fmt(base - DAY), whenDays: 3 };
  if (/\b(today|tonight|this morning|this afternoon|right now)\b/.test(p)) return { label: "today", date: fmt(base), whenDays: 2 };
  for (const name of Object.keys(WEEKDAY_IDX)) {
    if (new RegExp("\\b" + name + "\\b").test(p)) {
      const back = (t.dow - WEEKDAY_IDX[name] + 7) % 7;
      return { label: name, date: fmt(base - back * DAY), whenDays: Math.max(3, back + 3) };
    }
  }
  if (/\b(this week|past week|last week|this month)\b/.test(p)) return { label: "this week", date: null, whenDays: 7 };
  return null;
}

function buildSystemPrompt() {
  const today = etTodayString();
  const yesterday = etYesterdayString();

  return `
You are Wallie — an AI trading agent for retail traders. You don't just talk about charts: you read them, draw on them, watch them, and act on them inside this app.

Today is ${today} (Eastern Time). Yesterday was ${yesterday}.

DATE DISCIPLINE: Resolve every relative day reference ("today", "yesterday", "on Friday", "this week", "last night") against the dates above — never guess a date. When you describe a specific past event, name its full date (weekday, month, day, year). Never present an event from one date as if it happened on a different day the user asked about.

-----------------------
WHO YOU ARE
-----------------------
- An agent, not a chatbot. Inside this app you have real tools (listed below) — use them.
- You have no biography. Never claim to be human or a former trader; your authority comes from the data in front of you and the quality of your reads.
- Links: users share video and article links (YouTube, TikTok, Instagram). Your system reads what it can from a link and attaches it further down when available. NEVER say you are "a language model", that you cannot access or open links, or that you cannot watch videos. If nothing from a link is attached, work from the link itself and the conversation, and ask for the transcript or a short description in one line.
- Sharp, honest, and on the retail trader's side. You'd rather say "there's no trade here" than dress up a coin flip.
- You break down complex market concepts with clear, simple language — like a knowledgeable trading buddy, not a textbook.
- You're not afraid to call out bad setups or risky trades.
- You speak naturally and conversationally.

-----------------------
YOUR MISSION
-----------------------
Most retail traders were taught by gurus who don't actually know anything. Your job is to teach them properly: protect them from blowing up, build real discipline, and keep them in the game long enough to get good. Grade the process, not the outcome — discipline over signals, always. Every answer can teach one useful thing.

-----------------------
WHAT YOU DO
-----------------------
- Read charts users upload — and draw your levels directly on them (support, resistance, trendlines)
- Pull up any live chart in the app with support/resistance drawn on it
- Watch price levels for the user and keep alerts, reminders, and a watchlist
- Run the Demo Desk: open and close paper positions, and arm buy/sell stop & limit orders that fill when price reaches them
- Keep the user's trading journal automatically from their demo trades, and review their habits with them
- Analyze market sentiment and structure on any ticker or pair, grounded in real data
- Teach trading concepts at any skill level, and help with risk management and position sizing
- Provide trade ideas and setups with entry/SL/TP levels — only when the data earns it (see SIGNAL QUALITY RULES)

When you can do something in this app, offer to do it instead of just describing it. You're an agent: act, don't just advise.

-----------------------
BOUNDARIES
-----------------------
- Education and demo trading only. You never execute real-money trades, never connect to a broker, and never promise or imply returns.
- Your reads are educational, not financial advice. The decision is always the user's.

-----------------------
HOW TO USE DATA
-----------------------
When TECHNICAL ANALYSIS DATA is provided below, use it to ground your response:
- NEVER invent or guess price levels, RSI values, support/resistance, or any numbers
- Only state numbers that appear in the provided data
- If data is missing or unavailable, say so honestly â€” "I don't have that data right now"
- Weave the data naturally into your response â€” don't just dump numbers
- Explain what the indicators mean for the trader in plain language

When a chart IMAGE is provided:
- Use the image to identify visual patterns (candlestick patterns, trendlines, chart patterns, divergences)
- Cross-reference what you SEE in the chart with the TECHNICAL DATA provided
- If the data and the chart conflict, note the discrepancy
- Describe what you see on the chart naturally, like you're sitting next to the trader

-----------------------
CRITICAL: RESPONSE MODE
-----------------------
A chart upload is NOT a signal request. Users upload charts for many reasons â€” to learn, to ask questions, to get a second opinion. Read their message carefully before deciding how to respond.

ONLY produce the signal format (PAIR/BIAS/ENTRY/SL/TP) when ALL of these are true:
1. The user EXPLICITLY asks for a trade setup, signal, entry, or position
2. The technical data shows clear directional confluence (at least 3 indicators agreeing)
3. There is a logical entry with meaningful distance between entry, stop loss, and take profit

For everything else â€” questions, education, pattern identification, sentiment, "what do you see", "explain this" â€” respond conversationally. No signal box. Just talk to them like a trading buddy.

-----------------------
SIGNAL QUALITY RULES (NON-NEGOTIABLE)
-----------------------
You do NOT always have to give a trade. Protecting capital is more important than finding entries.

BEFORE generating any signal, check these conditions against the TECHNICAL DATA provided:

1. CONFLUENCE â€” At least 3 of these must align in the same direction:
   - Trend (price vs key MAs)
   - RSI (not stuck in neutral 45-55 range)
   - MACD histogram direction
   - Price near support/resistance level
   - Volume trend supporting the move
   If fewer than 3 align, there is no trade. Say so.

2. MEANINGFUL LEVELS â€” Entry, SL, and TP must be based on actual support/resistance from the data.
   - Stop loss must be placed beyond a real support/resistance level, not just a few pips away
   - Take profit must target the next significant level
   - The distance between entry and SL must make sense for the asset's volatility
   - NEVER place SL and TP only 2-5 pips from entry â€” that's noise, not a trade

3. MINIMUM R:R â€” The reward-to-risk ratio must be at least 1.5:1. If it's less, there's no edge. Don't take it.

4. NO TRADE CONDITIONS â€” Decline to give a signal when:
   - RSI is between 45-55 and MACD histogram is near zero (flat/indecisive)
   - Price is mid-range between support and resistance with no clear direction
   - Moving averages are tangled/flat (no separation)
   - Volume is declining with no breakout catalyst
   - The chart shows choppy, sideways price action
   - The data simply doesn't support a directional bias

When you decline a trade, be honest and specific about WHY. Vary your language â€” here are examples of the TONE (don't repeat these word for word, express the same ideas naturally in your own way each time):
   - "Honestly? I don't see an edge here. RSI is dead neutral at 51, MACD is flat, and price is just chopping between [level] and [level]. I'd stay on the sidelines until one of those levels breaks with conviction."
   - "I could draw up a setup here but I'd be lying to you â€” there's no real confluence backing it. [specific indicator] says one thing, [other indicator] says another. Sometimes the best trade is no trade."
   - "This one's a pass from me. The R:R isn't there â€” your stop would need to be at [level] which means you're risking more than the next target at [level] would pay you."

When you DO give a signal (because confluence is strong), use this format:

> **PAIR:** [ticker]
>
> **BIAS:** [LONG or SHORT]
>
> **ENTRY:** [price â€” from the data/chart, at a meaningful level]
>
> **STOP LOSS:** [price â€” beyond the nearest support/resistance]
>
> **TAKE PROFIT:** [price â€” at the next significant level]
>
> **R:R:** [must be â‰¥ 1.5:1]

Then a short **Rationale** (3-5 bullets) explaining the confluence â€” which indicators agree, which support/resistance levels matter, and any relevant fundamental context from the news data.

-----------------------
PERSONALITY GUIDELINES
-----------------------
- Keep responses concise but warm. Don't write essays.
- Format for skimmers: short lines, bold lead-ins, lists over paragraphs. Never send a wall of text when a list or a visual would say it better.
- Use analogies when they help, but don't force them.
- If someone is clearly new, be patient and explain more.
- If someone is experienced, be direct and skip the basics.
- It's okay to say "I'm not sure" or "the data isn't clear here."
- Never start responses with "Great question!" or other filler.
- Don't repeat the user's question back to them.
- Vary your language. Don't use the same phrases every response. Be natural.
- When declining a trade, don't be apologetic â€” be confident. Sitting out IS the smart play.
`;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function logApiUsage(usage) {
  try {
    const totalTokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const cost = (inputTokens * 0.90 + outputTokens * 0.90) / 1_000_000;

    const today = new Date().toISOString().split("T")[0];
    const ref = db.doc("admin/apiSpend");
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { totalCalls: 0, totalTokens: 0, estimatedCost: 0, dailyLog: [] };

    data.totalCalls = (data.totalCalls || 0) + 1;
    data.totalTokens = (data.totalTokens || 0) + totalTokens;
    data.estimatedCost = (data.estimatedCost || 0) + cost;

    const dailyLog = data.dailyLog || [];
    const todayEntry = dailyLog.find((d) => d.date === today);
    if (todayEntry) {
      todayEntry.calls += 1;
      todayEntry.tokens += totalTokens;
      todayEntry.cost += cost;
    } else {
      dailyLog.push({ date: today, calls: 1, tokens: totalTokens, cost });
    }
    data.dailyLog = dailyLog.slice(-30);

    await ref.set(data);
  } catch (err) {
    console.error("API spend logging error:", err);
  }
}

async function callTogetherAI(messages, apiKey, { model, maxTokens = 8192, temperature = 0.7, responseFormat } = {}) {
  const body = {
    model: model || TEXT_MODEL,
    messages,
    temperature,
    top_p: 0.95,
    max_tokens: maxTokens,
  };
  if (responseFormat) body.response_format = responseFormat;
  const res = await fetch(TOGETHER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Together AI error:", res.status, errBody);
    throw new Error(`Together AI API error: ${res.status}`);
  }

  const data = await res.json();
  return data;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CLOUD FUNCTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Sends the OpenAI-style messages array to the Meta Model API (Muse Spark)
// and returns a Together-shaped result, so the chat handler's response
// handling stays identical. Spark is the primary vision route; Gemini is the
// fallback (see the chat handler). jsonMode is accepted for signature parity
// with callGeminiVision; v1 relies on the prompt-level JSON instruction plus
// the handler's existing parsing instead of a response_format constraint.
async function callSparkVision(messages, apiKey, { temperature = 0.7, jsonMode = false, maxTokens = 4096 } = {}) {
  const startedAt = Date.now();
  const body = {
    model: SPARK_VISION_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  const res = await fetch(META_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("Spark vision error:", res.status, errBody);
    throw new Error(`Meta Model API error: ${res.status}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  let text = msg.content || "";
  if (Array.isArray(text)) {
    text = text.map((p) => (typeof p === "string" ? p : p.text || "")).join("");
  }
  if (!text) {
    console.error("Spark empty-content diagnostics:", JSON.stringify({
      finish_reason: data.choices?.[0]?.finish_reason ?? null,
      usage: data.usage ?? null,
      message_keys: Object.keys(msg),
      reasoning_len: typeof msg.reasoning_content === "string" ? msg.reasoning_content.length : null,
      content_type: typeof msg.content,
    }).slice(0, 800));
    throw new Error("Meta Model API returned an empty response");
  }
  console.log(`Spark vision answered with ${SPARK_VISION_MODEL} in ${Date.now() - startedAt}ms (in ${data.usage?.prompt_tokens ?? "?"} / out ${data.usage?.completion_tokens ?? "?"} tokens)`);
  return {
    choices: [{ message: { content: text } }],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// Converts the OpenAI-style messages array (built for Together) into a Gemini
// generateContent call and returns a Together-shaped result, so the chat
// handler's response handling stays identical.
async function callGeminiVision(messages, apiKey, { temperature = 0.7, jsonMode = false } = {}) {
  const systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (typeof msg.content === "string" && msg.content) systemParts.push(msg.content);
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];
    if (typeof msg.content === "string") {
      if (msg.content) parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url && part.image_url.url) {
          const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(part.image_url.url);
          if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  const generationConfig = { temperature, maxOutputTokens: 8192 };
  if (jsonMode) generationConfig.responseMimeType = "application/json";

  const body = { contents, generationConfig };
  if (systemParts.length) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n") }] };
  }

  let lastError = null;
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error(`Gemini vision error (${model}):`, res.status, errBody);
        lastError = new Error(`Gemini API error: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("");
      console.log(`Gemini vision answered with ${model}`);
      return {
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
    } catch (err) {
      console.error(`Gemini vision request failed (${model}):`, err);
      lastError = err;
    }
  }
  throw lastError || new Error("Gemini vision unavailable");
}

const DESK_SYMBOLS = ["US30", "NAS100", "SPX500", "GOLD", "SILVER", "OIL", "BTC", "ETH", "SOL", "XRP", "DOGE", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "SPY", "QQQ", "AAPL", "TSLA", "NVDA"];

const DESK_ACTIONS_INSTRUCTION =
  "\n\nDESK ACTIONS: The user is chatting from their Demo Desk inside this app — paper trading with demo funds. It is NOT real money and there is NO broker. You can operate the desk for them. When (and only when) they ask you to do one of these things, end your reply with a fenced block in exactly this shape:\n" +
  "```desk\n{\"actions\":[{\"type\":\"open_position\",\"symbol\":\"USDJPY\",\"direction\":\"buy\",\"leverage\":50,\"rr\":4}]}\n```\n" +
  "Action types:\n" +
  "- open_position {symbol, direction: \"buy\"|\"sell\", leverage?: 1-100, rr?: target distance as a multiple of the stop distance (\"1 to 4 risk reward\" means rr 4), notional?: dollar size}. The desk fills at the live price, takes the stop from the drawn levels, and sets the target from rr. Include leverage, rr, or notional ONLY when the user states them.\n" +
  "- close_position {symbol} closes that symbol's open position; {\"type\":\"close_position\",\"all\":true} closes everything.\n" +
  "- show_symbol {symbol, interval?: \"1\"|\"5\"|\"15\"|\"60\"|\"240\"|\"D\"|\"W\"} puts that market on their chart with your levels drawn.\n" +
  "Symbols must be desk symbols: " + DESK_SYMBOLS.join(", ") + ". Common names: dollar yen = USDJPY, gold = GOLD, nas = NAS100, dow = US30, euro dollar = EURUSD.\n" +
  "In your visible text, briefly confirm what you are doing (e.g. \"Opening a USDJPY buy on your desk at 1:50 with a 4R target\"). The app executes it and shows them the fill — never say you cannot place demo trades; on this desk you can. If they did not ask you to do anything, answer normally with NO desk block." +
  "\nAfter you carry out a desk action, end your visible reply with ONE short question offering a sensible next step, matched to what just happened — e.g. after showing a chart: \"Want the levels drawn, a trade signal, or an alert at the next level?\"; after opening a position: \"Want an alert at your target, or should I keep an eye on the stop?\" Keep it to one line.";


// --- Semantic cache for timeless education answers ---
// Repeat concept questions ("what is RSI?") are embedded and matched
// against previously stored Q&A in the eduCache collection; a close
// enough match is served without an LLM call. The cache is gated to
// knowledge-only turns and only knowledge-only answers are stored
// (see the hooks in the chat handler), so a cached answer can never
// carry stale market data.
const EDU_CACHE_V = "v1";
const EDU_CACHE_THRESHOLD = 0.9;
const EDU_EMBED_MODEL = "BAAI/bge-base-en-v1.5";

function normalizeEduQuestion(q) {
  return String(q || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function eduCosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function fetchEduEmbedding(text, apiKey) {
  const res = await Promise.race([
    fetch("https://api.together.xyz/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({ model: EDU_EMBED_MODEL, input: text }),
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("embed timeout")), 2500)),
  ]);
  if (!res.ok) throw new Error("embed status " + res.status);
  const json = await res.json();
  const vec = json && json.data && json.data[0] && json.data[0].embedding;
  if (!Array.isArray(vec) || !vec.length) throw new Error("embed shape");
  return vec;
}

async function readEduCache(embedding) {
  const snap = await db.collection("eduCache").orderBy("hits", "desc").limit(400).get();
  let best = null, bestScore = 0;
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d || d.v !== EDU_CACHE_V || !d.answer || !Array.isArray(d.embedding)) return;
    const s = eduCosine(embedding, d.embedding);
    if (s > bestScore) { bestScore = s; best = { ref: doc.ref, answer: d.answer, hits: d.hits || 0, q: d.q }; }
  });
  return { best, bestScore };
}

// [SharedLink helpers]
// Users paste video links (YouTube / TikTok / Instagram) into chat.
// These helpers read what the platform allows a server to read: public
// metadata always (oEmbed), and the YouTube transcript when YouTube
// serves it. Everything fails silent: a null just means the prompt
// block further down tells the model to ask for a paste instead.
function extractSharedLink(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/https?:\/\/[^\s<>\])"']+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,!?]+$/, "");
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    let id = null;
    const vm = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (vm) id = vm[1];
    if (!id) {
      const pm = url.match(/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/);
      if (pm) id = pm[1];
    }
    if (!id && lower.includes("youtu.be")) {
      const bm = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
      if (bm) id = bm[1];
    }
    return { platform: "YouTube", url: url, id: id };
  }
  if (lower.includes("tiktok.com")) return { platform: "TikTok", url: url, id: null };
  if (lower.includes("instagram.com")) return { platform: "Instagram", url: url, id: null };
  return null;
}

async function fetchLinkMeta(link) {
  try {
    let endpoint = null;
    if (link.platform === "YouTube") {
      endpoint = "https://www.youtube.com/oembed?url=" + encodeURIComponent(link.url) + "&format=json";
    } else if (link.platform === "TikTok") {
      endpoint = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(link.url);
    }
    if (!endpoint) return null;
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
    const res = await Promise.race([fetch(endpoint, { headers: { "User-Agent": ua } }), timer]);
    if (!res || !res.ok) return null;
    const j = await res.json();
    const title = (j.title || "").toString().slice(0, 300);
    const author = (j.author_name || "").toString().slice(0, 120);
    if (!title) return null;
    return { title: title, author: author };
  } catch (e) {
    return null;
  }
}

async function fetchYouTubeTranscript(videoId) {
  try {
    if (!videoId) return null;
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const body = JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240111.09.00", hl: "en" } },
      videoId: videoId,
    });
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), 4500));
    const res = await Promise.race([
      fetch("https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": ua },
        body: body,
      }),
      timer,
    ]);
    if (!res || !res.ok) return null;
    const data = await res.json();
    const tracks = data && data.captions && data.captions.playerCaptionsTracklistRenderer && data.captions.playerCaptionsTracklistRenderer.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;
    let track = null;
    for (const t of tracks) { if (t.languageCode === "en" && t.kind !== "asr") { track = t; break; } }
    if (!track) { for (const t of tracks) { if (t.languageCode === "en") { track = t; break; } } }
    if (!track) track = tracks[0];
    if (!track || !track.baseUrl) return null;
    const timer2 = new Promise((resolve) => setTimeout(() => resolve(null), 4500));
    const res2 = await Promise.race([fetch(track.baseUrl + "&fmt=json3", { headers: { "User-Agent": ua } }), timer2]);
    if (!res2 || !res2.ok) return null;
    const tj = await res2.json();
    const events = tj.events || [];
    let text = "";
    for (const ev of events) {
      if (!ev.segs) continue;
      for (const seg of ev.segs) {
        if (seg.utf8) text += seg.utf8 + " ";
      }
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text.length < 80) return null;
    return text.slice(0, 12000);
  } catch (e) {
    return null;
  }
}

async function readLinkWithBrowser(link) {
  try {
    let key = "";
    try { key = browserUseKey.value().trim(); } catch (e) { key = ""; }
    if (!key) { console.log("BrowserLink key=missing"); return null; }
    const taskText = "Open this page and read what it teaches: " + link.url + " — Do not sign in to anything; do not like, subscribe, follow, or comment. Return: the title, the creator or channel name, and a faithful account of the content. If it teaches a trading strategy, list its exact rules: the setup, entry trigger, stop loss, take profit, any filters or minimum requirements, in order. If the page cannot be read, say PAGE UNREADABLE and why.";
    const headers = { "Content-Type": "application/json", "X-Browser-Use-API-Key": key };
    const browserStartedAt = Date.now();
    const deadline = Date.now() + 95000;
    const browserEndLog = (extra) => { console.log("BrowserLink end status=" + (status || "none") + " waited=" + Math.round((Date.now() - browserStartedAt) / 1000) + "s" + (extra || "")); };
    const createTimer = new Promise((resolve) => setTimeout(() => resolve(null), 15000));
    const createRes = await Promise.race([
      fetch("https://api.browser-use.com/api/v4/runs", { method: "POST", headers: headers, body: JSON.stringify({ task: taskText, maxCostUsd: 1 }) }),
      createTimer,
    ]);
    if (!createRes || !createRes.ok) { console.log("BrowserLink create http=" + (createRes ? createRes.status : "timeout")); return null; }
    const created = await createRes.json();
    const runId = created && created.id;
    if (!runId) return null;
    let status = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const stTimer = new Promise((resolve) => setTimeout(() => resolve(null), 10000));
        const stRes = await Promise.race([fetch("https://api.browser-use.com/api/v4/runs/" + runId + "/status", { headers: headers }), stTimer]);
        if (stRes && stRes.ok) {
          const st = await stRes.json();
          status = (st && st.status) || "";
        }
      } catch (e) { /* keep polling until the deadline */ }
      if (status === "completed") break;
      if (status && status !== "running" && status !== "queued" && status !== "created" && status !== "pending" && status !== "in_progress") { browserEndLog(""); return null; }
    }
    if (status !== "completed") { browserEndLog(""); return null; }
    const getTimer = new Promise((resolve) => setTimeout(() => resolve(null), 10000));
    const getRes = await Promise.race([fetch("https://api.browser-use.com/api/v4/runs/" + runId, { headers: headers }), getTimer]);
    if (!getRes || !getRes.ok) { browserEndLog(" outlen=0"); return null; }
    const run = await getRes.json();
    const text = (((run && (run.output || run.result)) || "") + "").trim();
    browserEndLog(" outlen=" + text.length);
    if (text.length < 40) return null;
    return text.slice(0, 6000);
  } catch (e) {
    return null;
  }
}

async function readSharedLink(promptText) {
  try {
    const link = extractSharedLink(promptText);
    if (!link) return null;
    const meta = await fetchLinkMeta(link);
    let transcript = null;
    if (link.platform === "YouTube" && link.id) {
      transcript = await fetchYouTubeTranscript(link.id);
    }
    let browserNotes = null;
    if (!transcript && (link.platform === "YouTube" || link.platform === "TikTok")) {
      browserNotes = await readLinkWithBrowser(link);
    }
    console.log("SharedLink " + link.platform + " meta=" + (meta ? "y" : "n") + " transcript=" + (transcript ? transcript.length : 0) + " browser=" + (browserNotes ? browserNotes.length : 0));
    return { link: link, meta: meta, transcript: transcript, browserNotes: browserNotes };
  } catch (e) {
    return null;
  }
}
// [/SharedLink helpers]
exports.chat = onCall(
  { secrets: [togetherKey, geminiKey, metaKey, browserUseKey], timeoutSeconds: 120, cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to use Wallie.");
    }

    const { prompt, imageBase64, imageMimeType, history, userPersona, pageContext, signalMode } = request.data;
    if (!prompt || typeof prompt !== "string") {
      throw new HttpsError("invalid-argument", "A text prompt is required.");
    }

    try {
      let systemPrompt = buildSystemPrompt();
      if (signalMode === true) systemPrompt = buildSignalModePrompt();

      // User persona â€” skip in signalMode (output is structured JSON, no personalization)
      if (!signalMode && userPersona && typeof userPersona === "string") {
        systemPrompt += `\n-----------------------\nUSER PROFILE\n-----------------------\n${userPersona}\n\nTailor your tone and depth to this trader's level.\n`;
      }

      // Page context (ticker on screen) â€” skip in signalMode
      if (!signalMode && pageContext && typeof pageContext === "object" && pageContext.ticker) {
        systemPrompt += `\n-----------------------\nACTIVE CHART CONTEXT\n-----------------------\n`;
        systemPrompt += `Platform: ${pageContext.platform || "Unknown"}\n`;
        systemPrompt += `Ticker: ${pageContext.ticker}\n`;
        if (pageContext.price) systemPrompt += `Current Price: ${pageContext.price}\n`;
        if (pageContext.timeframe) systemPrompt += `Timeframe: ${pageContext.timeframe}\n`;
        systemPrompt += `\nThe user has ${pageContext.ticker} open. When they say "this" or "current" they likely mean ${pageContext.ticker}. But do NOT proactively analyze it â€” only reference it when the user's message is about it.\n`;
      }

      const apiKey = togetherKey.value().trim();

      // â”€â”€â”€ Validate image â”€â”€â”€
      let validImage = false;
      if (imageBase64 && imageMimeType) {
        const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        const isValidMime = allowedMimes.includes(imageMimeType.toLowerCase());
        const isValidBase64 = typeof imageBase64 === "string" && imageBase64.length > 1000 && imageBase64.length < 10_000_000;
        const base64Clean = imageBase64.replace(/\s/g, "");
        const isValidChars = /^[A-Za-z0-9+/=]+$/.test(base64Clean.substring(0, 200));
        validImage = isValidMime && isValidBase64 && isValidChars;
        if (!validImage) {
          console.warn("Invalid image data rejected:", { mimeType: imageMimeType, length: imageBase64?.length });
        }
      }

      const hasImage = validImage;
      const visionT0 = Date.now();
      const model = hasImage ? VISION_MODEL : TEXT_MODEL;
      const lowerPrompt = prompt.toLowerCase();

      // â”€â”€â”€ Detect if this needs live data / TA enrichment â”€â”€â”€
      const isCasual = prompt.trim().split(/\s+/).length <= 12 && [
        "thanks", "thank you", "bye", "goodbye", "later", "see you",
        "talk to you", "that's it", "thats it", "no more", "i'm good",
        "im good", "cool", "awesome", "got it", "ok", "okay", "great",
        "hello", "hi", "hey", "good morning", "good night", "gm", "gn",
        "nah", "nope", "yes", "yeah", "yep", "no thanks", "appreciate it",
      ].some((phrase) => lowerPrompt.includes(phrase));

      // Determine if we should fetch full TA (chart analysis, signals) or just prices.
      // In signalMode the vision model reads the chart directly; skip TA fetches.
      const needsTA = !signalMode && !isCasual && (
        hasImage ||
        /\b(analyze|analysis|setup|signal|entry|exit|support|resistance|rsi|macd|ema|sma|bollinger|technical|chart|pattern|trend|bias|long|short)\b/i.test(prompt)
      );

      // Date awareness: relative-day references ("on Friday",
      // "yesterday") resolve to a real Eastern date, and
      // event/causation questions ("what caused the drop") route
      // to recency-bounded news instead of the model's memory.
      const relativeDay = !signalMode && !isCasual ? resolveRelativeDay(prompt) : null;
      const wantsEventNews = !signalMode && !isCasual && (
        !!relativeDay ||
        (/\b(why|what caused|caused|reason for)\b/i.test(prompt) &&
          /\b(drop|dropped|dropping|fall|fell|falling|plunge|plunged|crash|crashed|surge|surged|rally|rallied|jump|jumped|spike|spiked|tank|tanked|soar|soared|slide|slid|slump|slumped|dump|dumped|move|moved|selloff|sold off)\b/i.test(prompt))
      );

      const needsPrice = !signalMode && !isCasual && !needsTA && (
        /\b(price|worth|trading at|cost of|how much)\b/i.test(prompt) ||
        /\b(sentiment|news|market|current|latest|today|right now|this week|what.?s happening)\b/i.test(prompt) ||
        detectAssets(prompt).cryptos.length > 0 ||
        detectAssets(prompt).stocks.length > 0 ||
        wantsEventNews
      );

      // â”€â”€â”€ Fetch data â”€â”€â”€
      // Understanding layer: deterministic hits first; when they
      // miss, an intent-router call reads the message WITH context,
      // so free-form asks ("go to the 15 min tf", "what's the RSI
      // at") resolve a symbol and timeframe the way a person would.

      // Semantic education cache (read): serve timeless concept
      // questions from the shared cache instead of a fresh LLM
      // call. Strictly gated — no image, no desk/signal mode, no
      // event/price intent, no asset named, no chart or sentiment
      // request, and no market context in the recent history.
      // Any doubt falls through to the normal flow.
      const sharedLink = signalMode ? null : await readSharedLink(prompt).catch(() => null);
      let eduEmbed = null;
      let eduNormQ = "";
      let eduExactDoc = false;
      const eduDesk = typeof userPersona === "string" && userPersona.includes("[[DESK_MODE]]");
      const eduHistClean = !(Array.isArray(history) && history.slice(-4).some((h) => h && (h.hadImage || detectPrimaryTicker(typeof h.text === "string" ? h.text : "", null))));
      const eduGate = !signalMode && !hasImage && !isCasual && !eduDesk && !wantsEventNews && !relativeDay && !sharedLink &&
        !needsPrice && eduHistClean &&
        detectAssets(prompt).cryptos.length === 0 && detectAssets(prompt).stocks.length === 0 &&
        !detectChartRequest(prompt) && !detectSentimentRequest(prompt) &&
        /^(what is|what's|whats|explain|define|meaning of|how does|how do|why does|difference between|teach me|tell me about|what are)\b/i.test(prompt.trim()) &&
        !/\b(at|right now|today|currently)\b/i.test(prompt);
      if (eduGate) {
        try {
          eduNormQ = normalizeEduQuestion(prompt);
          eduEmbed = await fetchEduEmbedding(eduNormQ || prompt, apiKey);
          const eduFound = await readEduCache(eduEmbed);
          if (eduFound.best && eduFound.best.q === eduNormQ) eduExactDoc = true;
          if (eduFound.best && eduFound.bestScore >= EDU_CACHE_THRESHOLD) {
            console.log("EduCache HIT score=" + eduFound.bestScore.toFixed(3) + " q=\"" + eduNormQ + "\"");
            eduFound.best.ref.update({ hits: eduFound.best.hits + 1 }).catch(() => {});
            return { response: eduFound.best.answer };
          }
          console.log("EduCache MISS best=" + eduFound.bestScore.toFixed(3) + " q=\"" + eduNormQ + "\"");
        } catch (e) {
          console.log("EduCache read skipped:", e.message);
          eduEmbed = null;
        }
      }

      let intent = null;
      let intentChart = null;
      let wantTA = needsTA;
      const promptInterval = parseInterval(prompt);
      if (!signalMode && !hasImage && !isCasual && !(typeof userPersona === "string" && userPersona.includes("[[DESK_MODE]]"))) {
        const detChart0 = detectChartRequest(prompt);
        const detSent0 = detectSentimentRequest(prompt);
        if (!detChart0 && promptInterval) {
          intentChart = resolveContextChart(prompt, history);
          if (intentChart) intent = { kind: "chart", symbol: intentChart.symbol, interval: intentChart.interval };
        }
        if (!intent && !detChart0 && !detSent0) {
          intent = await classifyIntent(prompt, history, apiKey);
          if (intent) console.log(`Intent: ${intent.kind} ${intent.symbol || "-"} @ ${intent.interval || "-"}`);
        }
        if (intent && intent.kind === "chart" && !detChart0 && !intentChart) {
          if (intent.symbol) {
            intentChart = { symbol: intent.symbol, tvSymbol: CHART_TV_MAP[intent.symbol] || `NASDAQ:${intent.symbol}`, interval: intent.interval || promptInterval || "D" };
          } else if (intent.interval || promptInterval) {
            intentChart = resolveContextChart(prompt, history);
          }
        }
        if (intent && (intent.kind === "analysis" || intent.kind === "signal")) wantTA = true;
      }

      let taData = null;
      let priceData = null;
      let newsData = null;

      let taTicker = null;
      if (wantTA) {
        let primaryTicker = detectPrimaryTicker(prompt, pageContext);
        if (!primaryTicker && Array.isArray(history)) {
          // Follow-ups ("give me a signal") rarely repeat the symbol.
          // Recover it from the most recent history message that names
          // one, so the TA below is grounded in the right market.
          for (let i = history.length - 1; i >= 0 && i >= history.length - 10; i--) {
            const htxt = history[i] && typeof history[i].text === "string" ? history[i].text : "";
            if (!htxt) continue;
            primaryTicker = detectPrimaryTicker(htxt, null);
            if (primaryTicker) break;
          }
        }
        taTicker = primaryTicker;
        if (!primaryTicker && intent && intent.symbol && (intent.kind === "analysis" || intent.kind === "signal")) {
          const cs = chartDataSource({ symbol: intent.symbol });
          primaryTicker = { type: cs.type, symbol: cs.symbol, coinId: cs.coinId, display: intent.symbol };
          taTicker = primaryTicker;
        }
        // TA at the timeframe being discussed, computed from the same
        // candle series the chart levels come from, so the indicator
        // values and the drawn levels always agree.
        const taInterval = (intent && intent.interval) || promptInterval || null;
        if (primaryTicker && taInterval) {
          const csym = chartSymbolFor(primaryTicker);
          if (csym) {
            try {
              const series = await fetchRawSeries(chartDataSource({ symbol: csym.symbol }), taInterval);
              if (series && series.closes.length >= 30) {
                const ta = runFullTA(series.closes, series.highs, series.lows, series.volumes);
                const formatted = formatTAForPrompt(`${csym.symbol} — ${INTERVAL_NAMES[taInterval] || taInterval} timeframe`, { ta });
                if (formatted) {
                  taData = formatted;
                  console.log(`TA attached: ${csym.symbol} @ ${taInterval}`);
                }
              }
            } catch (e) {
              console.error("Series TA error:", e.message);
            }
          }
        }
        if (primaryTicker && !taData) {
          try {
            if (primaryTicker.type === "crypto") {
              const data = await fetchCryptoOHLCV(primaryTicker.coinId);
              if (data) taData = formatTAForPrompt(primaryTicker.display, data);
            } else {
              const data = await fetchStockOHLCV(primaryTicker.symbol);
              if (data) taData = formatTAForPrompt(primaryTicker.display, data);
            }
          } catch (err) {
            console.error("TA fetch error:", err);
          }
        }
        // Also fetch news for context
        const newsQuery = primaryTicker?.display || prompt;
        try {
          newsData = await searchGoogleNews(newsQuery, relativeDay ? relativeDay.whenDays : null);
        } catch {}
      }

      if (needsPrice) {
        try {
          const evtTicker = wantsEventNews ? detectPrimaryTicker(prompt, pageContext) : null;
          const evtWord = (prompt.match(/\b(drop|dropped|fall|fell|plunge|plunged|crash|crashed|surge|surged|rally|rallied|jump|jumped|spike|spiked|tank|tanked|soar|soared|slide|slump|slumped|dump|dumped|selloff)\b/i) || [])[1] || "";
          const eventQuery = evtTicker && evtWord ? evtTicker.display + " " + evtWord : prompt;
          const [prices, news] = await Promise.all([
            fetchSimplePrice(prompt),
            searchGoogleNews(wantsEventNews ? eventQuery : prompt, relativeDay ? relativeDay.whenDays : null),
          ]);
          priceData = prices;
          newsData = news;
        } catch (err) {
          console.error("Price fetch error:", err);
        }
      }

      // â”€â”€â”€ Build final system prompt with data â”€â”€â”€
      let finalSystemPrompt = systemPrompt;

      if (taData) {
        finalSystemPrompt += `\n-----------------------\nTECHNICAL ANALYSIS DATA (computed from real market data â€” use ONLY these numbers)\n-----------------------\n${taData}\n\nIMPORTANT: Ground your analysis in this data. Do NOT invent price levels, RSI values, or support/resistance that aren't listed above. If you're giving a signal, entry/SL/TP must be based on these levels.\n`;
      }

      if (needsTA && !taData) {
        finalSystemPrompt += `\n\nNO LIVE DATA: No technical data could be attached to this reply. You do NOT have current prices, levels, or indicator values for this request. NEVER state specific prices, support/resistance levels, RSI/MACD values, or percentages from memory; they will be stale and wrong. If it is not clear which symbol the user means, ask which one. If the symbol is clear but the data failed to load, say you could not pull live data just now and offer what you CAN do (pull up the chart, explain how to read the setup) without quoting numbers.\n`;
      }

      if (priceData) {
        finalSystemPrompt += `\n-----------------------\nLIVE PRICES\n-----------------------\n${priceData}\n\nUse these exact prices. Do not guess or make up numbers.\n`;
      }

      if (relativeDay) {
        finalSystemPrompt += "\n\nTIME ANCHOR: The user is asking about " + relativeDay.label + (relativeDay.date ? " \u2014 " + relativeDay.date : "") + ". Today is " + etTodayString() + ". Any news attached to this reply was limited to roughly the last " + relativeDay.whenDays + " days. Rules: (1) Name the full date of any event you describe. (2) Only describe events that match the day the user asked about. (3) If none of the results describe an event on that date, say you could not find a matching event for that date \u2014 do NOT substitute an older event or an event from a different day, and do not fill the gap from memory.";
      }

      if (newsData) {
        finalSystemPrompt += `\n-----------------------\nRECENT NEWS\n-----------------------\n${newsData}\n\nMention relevant headlines naturally if they add context. Don't list them all.\n`;
      }

      // â”€â”€â”€ Build messages â”€â”€â”€
      // Chart Plot: ANALYZE image requests (not signal mode, not LOOK
      // frames) answer in the JSON envelope described above.
      let macroData = null;
      if (newsData) {
        try { macroData = await fetchMacroContext(); } catch {}
      }
      if (macroData) {
        finalSystemPrompt += "\n\nMACRO CONTEXT (Federal Reserve data via FRED \u2014 observation dates shown; monthly series lag by design):\n" + macroData + "\n\nUse this to explain WHY markets may be moving (rates, inflation, the dollar, fear). Never present a monthly figure as if it were released today \u2014 use its date.";
      }

      if (sharedLink) {
        const sl = sharedLink;
        finalSystemPrompt += "\n\n-----------------------\nSHARED LINK (" + sl.link.platform + ")\n-----------------------\n";
        if (sl.meta) finalSystemPrompt += "Video: \"" + sl.meta.title + "\"" + (sl.meta.author ? " by " + sl.meta.author : "") + "\n";
        else finalSystemPrompt += "The user shared this link: " + sl.link.url + "\n";
        if (sl.transcript) {
          finalSystemPrompt += "\nFull transcript of the video:\n" + sl.transcript + "\n\nWork from the transcript: explain what it teaches in plain language. If it presents a trading strategy, pull out the exact rules (setup, entry trigger, stop, target, and any filters or minimums) and lay them out as a short list, then ask if the user wants to save it as a strategy or have you teach it step by step. Quote nothing at length; teach it in your own words.";
        } else if (sl.browserNotes) {
          finalSystemPrompt += "\nSHARED LINK — Wallie sent its own browser to read this " + sl.link.platform + " page for the user. What it brought back:\n" + sl.browserNotes + "\n\nTeach from this material in your own words. If it describes a strategy, pull out the exact rules (setup, entry, stop, target, filters, minimums) as a short list, then offer to save it as one of the user's strategies or to teach it step by step. Do not reproduce the video's script or long passages.";
        } else {
          finalSystemPrompt += "\nThe full content could not be pulled automatically (" + (sl.link.platform === "Instagram" ? "Instagram blocks outside reads" : "the platform restricted it") + "). You DO know what this is — the lines above name it and who made it. Open your reply by naming it and what it covers. Never say the title or the topic was not provided. Work from the title and the conversation. Do NOT claim you cannot open links and never use boilerplate about being a language model. If the user is asking about the video's content or strategy, tell them what you found above and ask for the transcript or a short description in ONE line (YouTube: the transcript is under the video's ... menu; TikTok/Instagram: paste the caption or description). If they describe it, extract the rules and offer to save it as a strategy.";
        }
      }
      const wantsPlot =
        hasImage && !signalMode && typeof prompt === "string" && prompt.trim().toUpperCase() === "ANALYZE";
      if (wantsPlot) {
        finalSystemPrompt += PLOT_FORMAT_INSTRUCTION;
      }

      // Demo Desk mode: the desk chat can ask Wallie to operate the desk
      // (open/close demo positions, switch the chart) via a fenced action
      // block the handler parses into structured deskActions.
      const deskMode = !signalMode && typeof userPersona === "string" && userPersona.includes("[[DESK_MODE]]");
      if (deskMode) {
        finalSystemPrompt += DESK_ACTIONS_INSTRUCTION;
      }

      // Inline chart card: "show me a chart of US30" (text only — image
      // requests already carry the user's own chart).
      const chartReq = !hasImage && !signalMode ? detectChartRequest(prompt) || intentChart : null;
      let chartActions = null;
      if (!chartReq && !hasImage && !signalMode) {
        const miss = chartMissReason(prompt);
        if (miss) console.log(`Chart near-miss: ${miss}`);
      }
      if (chartReq) {
        finalSystemPrompt += `\n\nCHART DISPLAY: A live interactive ${chartReq.symbol} chart is being displayed to the user inside this reply, below your text. You DO have the ability to show charts in this app — never say you can't display or pull up a chart. Refer to it naturally in one or two short sentences (e.g. "here's ${chartReq.symbol} live") and point out what to look at — trend direction, structure, the nearest level from the market data above if any was provided. Do NOT invent exact live prices that were not provided to you. Keep it brief: the chart is the point.`;

        // Drawn levels: compute real S/R + trendlines from market data and
        // ship them with the chart so the client can draw them on top.
        try {
          const levels = await Promise.race([
            computeChartLevels(chartReq),
            new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (levels && levels.drawings.length) {
            chartReq.levels = levels;
            console.log(`Chart levels computed: ${levels.drawings.length} drawings for ${chartReq.tvSymbol}`);
            const cSup = levels.drawings.filter((d) => d.type === "hline" && d.tone === "support").sort((a, b) => b.price - a.price)[0];
            const cRes = levels.drawings.filter((d) => d.type === "hline" && d.tone === "resistance").sort((a, b) => a.price - b.price)[0];
            chartActions = [
              ...(cSup ? [{ kind: "watch", label: `Watch ${chartReq.symbol} support ${fmtLevelPrice(cSup.price)}`, symbol: chartReq.symbol, level: cSup.price, when: null, topic: null }] : []),
              ...(cRes ? [{ kind: "watch", label: `Watch ${chartReq.symbol} resistance ${fmtLevelPrice(cRes.price)}`, symbol: chartReq.symbol, level: cRes.price, when: null, topic: null }] : []),
              { kind: "teach", label: `Teach me the ${chartReq.symbol} setup`, symbol: null, level: null, when: null, topic: `${chartReq.symbol} trade setup` },
            ].slice(0, 3);
            const lvText = levels.drawings.filter((d) => d.type === "hline").map((d) => d.label).join(" · ");
            if (lvText) {
              finalSystemPrompt += `\n\nDRAWN LEVELS: The chart shown to the user has these lines drawn on it, computed from real market data: ${lvText}${levels.drawings.some((d) => d.type === "trend") ? " · plus a trendline" : ""}. Cite these exact prices when you mention support and resistance — they are the same lines the user is looking at.`;
            }
          }
        } catch (err) {
          console.error("Chart levels error:", err.message);
        }
      }

      // Capability showcase: "what can you do" gets SHOWN, not told — a
      // live GOLD chart with drawn levels rides along as a working
      // example, plus ready-made action chips under the reply.
      let showcaseReq = null;
      let showcaseActions = null;
      if (!hasImage && !signalMode && !deskMode && !chartReq && !wantsPlot) {
        const asksCaps = /(what can you do|what do you do|who are you|what are you|how can you help|what can you help|what can wallie do|what does wallie do|show me what you can do|your (features|abilities|capabilities)|things you can do)/.test(prompt.toLowerCase());
        if (asksCaps) {
          showcaseReq = { symbol: "GOLD", tvSymbol: CHART_TV_MAP.GOLD, interval: "D", example: true };
          finalSystemPrompt += `\n\nCAPABILITY SHOWCASE: The user asked what you can do. Show, don't tell. A live GOLD chart with your support/resistance levels drawn is displayed below your text as a working example of your chart markup. Format rules: open with ONE short line. Then a tight list of at most 6 items — each starts with a bold label followed by at most ~8 words (e.g. **Read charts** — upload one and I'll mark it up). Point at the example once, in one short line. End with ONE line offering concrete next steps: upload a chart, pull up a market, or open the Demo Desk. Total under 110 words. NO explanatory paragraphs, NO essay.`;
          try {
            const levels = await Promise.race([
              computeChartLevels(showcaseReq),
              new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
            ]);
            if (levels && levels.drawings.length) {
              showcaseReq.levels = levels;
              const lvText = levels.drawings.filter((d) => d.type === "hline").map((d) => d.label).join(" · ");
              if (lvText) {
                finalSystemPrompt += `\n\nDRAWN LEVELS on the example chart: ${lvText}. You may cite the nearest level as proof of the markup.`;
              }
              const res = levels.drawings.find((d) => d.type === "hline" && d.tone === "resistance");
              showcaseActions = [
                ...(res ? [{ kind: "watch", label: `Watch GOLD at ${fmtLevelPrice(res.price)}`, symbol: "GOLD", level: res.price, when: null, topic: null }] : []),
                { kind: "watchlist", label: "Add GOLD to my watchlist", symbol: "GOLD", level: null, when: null, topic: null },
                { kind: "teach", label: "Teach me support & resistance", symbol: null, level: null, when: null, topic: "support and resistance" },
                { kind: "remind", label: "Remind me at the open", symbol: "GOLD", level: null, when: "open", topic: null },
              ].slice(0, 4);
            }
          } catch (err) {
            console.error("Showcase levels error:", err.message);
          }
          if (!showcaseActions) {
            showcaseActions = [
              { kind: "watchlist", label: "Add GOLD to my watchlist", symbol: "GOLD", level: null, when: null, topic: null },
              { kind: "teach", label: "Teach me support & resistance", symbol: null, level: null, when: null, topic: "support and resistance" },
            ];
          }
          console.log("Capability showcase attached: GOLD (D)");
        }
      }

      // Sentiment gauge: "sentiment on TSLA" shows TradingView's live
      // technical-analysis gauge in the reply — text stays a short lean.
      const sentimentReq = !hasImage && !signalMode && !deskMode ? detectSentimentRequest(prompt) : null;
      if (sentimentReq) {
        finalSystemPrompt += `\n\nSENTIMENT DISPLAY: A live sentiment gauge for ${sentimentReq.symbol} (TradingView's technical analysis summary — oscillators including RSI and MACD, plus moving averages, Strong Sell to Strong Buy) is displayed to the user below your text. Text rules: state the lean in ONE short line, then at most 3 short supporting points (today's price action from any data provided, one news driver, the nearest level if provided). Under ~70 words total. NEVER say RSI, MACD or any indicator is "not available" — the gauge below shows them live. NEVER narrate what you could do ("I can pull up...") — the gauge is already on screen.`;
        console.log(`Sentiment gauge attached: ${sentimentReq.tvSymbol} (${sentimentReq.interval})`);
      }

      // Signal grounding (2026-10-15): a TA/signal ask on a resolved
      // symbol also carries that symbol's REAL drawn levels (the same
      // computation behind chart cards) plus ready-made follow-up
      // actions, and the chart rides along with the reply. The model
      // cites these numbers, never memory.
      let signalChart = null;
      let signalActions = null;
      if (wantTA && taTicker && !hasImage && !signalMode && !deskMode && !chartReq && !showcaseReq && !sentimentReq) {
        const disp = String(taTicker.display || "").toUpperCase();
        let chartSym = CHART_TV_MAP[disp] ? disp : disp === "GC=F" ? "GOLD" : disp === "SI=F" ? "SILVER" : disp === "CL=F" ? "USOIL" : disp === "^DJI" ? "US30" : disp === "^IXIC" ? "NAS100" : disp === "^GSPC" ? "SPX500" : null;
        if (!chartSym && /^[A-Z]{1,5}$/.test(disp)) chartSym = disp;
        if (chartSym) {
          try {
            const sReq = { symbol: chartSym, tvSymbol: CHART_TV_MAP[chartSym] || `NASDAQ:${chartSym}`, interval: (intent && intent.interval) || promptInterval || "D" };
            const lv = await Promise.race([
              computeChartLevels(sReq),
              new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
            ]);
            if (lv && lv.drawings && lv.drawings.length) {
              sReq.levels = lv;
              signalChart = sReq;
              const lvText = lv.drawings.filter((d) => d.type === "hline").map((d) => d.label).join(" · ");
              if (lvText) {
                finalSystemPrompt += `\n\nDRAWN LEVELS for ${chartSym}: ${lvText}. These are computed from real market data and drawn on the chart attached to this reply. If you give a signal or quote support/resistance, your entry, stop, and target MUST be built from these prices and the technical data above — never from memory.`;
              }
              const sSup = lv.drawings.filter((d) => d.type === "hline" && d.tone === "support").sort((a, b) => b.price - a.price)[0];
              const sRes = lv.drawings.filter((d) => d.type === "hline" && d.tone === "resistance").sort((a, b) => a.price - b.price)[0];
              signalActions = [
                ...(sSup ? [{ kind: "watch", label: `Watch ${chartSym} support ${fmtLevelPrice(sSup.price)}`, symbol: chartSym, level: sSup.price, when: null, topic: null }] : []),
                ...(sRes ? [{ kind: "watch", label: `Watch ${chartSym} resistance ${fmtLevelPrice(sRes.price)}`, symbol: chartSym, level: sRes.price, when: null, topic: null }] : []),
                { kind: "teach", label: `Teach me the ${chartSym} setup`, symbol: null, level: null, when: null, topic: `${chartSym} trade setup` },
              ].slice(0, 3);
              console.log(`Signal grounding attached: ${chartSym}`);
            }
          } catch (err) {
            console.error("Signal grounding error:", err.message);
          }
        }
      }
      if ((wantTA || intentChart) && !taData && !signalChart && !(chartReq && chartReq.levels && chartReq.levels.drawings && chartReq.levels.drawings.length)) {
        finalSystemPrompt += `\n\nFINAL GROUNDING RULE: No live data is attached to this reply. Do NOT produce a signal (no PAIR / BIAS / ENTRY / STOP / TAKE PROFIT block) and do NOT quote any price, level, RSI, MACD, or percentage. Reply briefly: say you could not pull live data for this one, and offer to pull up the chart or try again.`;
      }

      const messages = [{ role: "system", content: finalSystemPrompt }];

      // Conversation history with image context notes
      if (Array.isArray(history)) {
        for (const msg of history) {
          let content = msg.text || "";
          if (msg.role === "user" && msg.hadImage) {
            content = `[User shared a trading chart image with this message]\n${content}`;
          }
          messages.push({
            role: msg.role === "user" ? "user" : "assistant",
            content,
          });
        }
      }

      // Current user message
      if (hasImage) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: wantsPlot ? `${prompt} — answer ONLY as the JSON envelope described in your instructions (verdict, confidence, read, drawings, actions). No prose outside the JSON.` : prompt },
            { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          ],
        });
      } else {
        messages.push({ role: "user", content: prompt });
      }

      // â”€â”€â”€ Call LLM â”€â”€â”€
      let data;
      if (hasImage) {
        // Images go to Muse Spark (Meta Model API) first, with Gemini as
        // the fallback. Text-only requests stay on Together.
        const visionT1 = Date.now();
        try {
          data = await callSparkVision(messages, metaKey.value().trim(), {
            temperature: signalMode ? 0.2 : 0.7,
            jsonMode: !!signalMode,
            maxTokens: wantsPlot ? 5120 : 4096,
          });
        } catch (sparkErr) {
          console.error("Spark vision failed, falling back to Gemini:", sparkErr);
          data = await callGeminiVision(messages, geminiKey.value().trim(), {
            temperature: signalMode ? 0.2 : 0.7,
            jsonMode: !!signalMode,
          });
        }
        console.log(`Vision timing: pre-model ${visionT1 - visionT0}ms, total ${Date.now() - visionT0}ms`);
      } else {
        data = await callTogetherAI(messages, apiKey, {
          model,
          temperature: signalMode ? 0.2 : 0.7,
          responseFormat: signalMode ? { type: "json_object" } : undefined,
        });
      }
      let textResponse = data.choices?.[0]?.message?.content || "";

      // Strip any hallucinated tool call markup
      textResponse = textResponse
        .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "")
        .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
        .replace(/<\|.*?\|>/g, "")
        .trim();

      // Chart Plot envelope: convert the model's JSON back into the classic
      // text contract (VERDICT line + read) and carry the drawings + action
      // suggestions alongside for the app to render.
      let plot = null;
      let plotActions = null;
      if (wantsPlot && textResponse) {
        try {
          const clean = textResponse.replace(/```json/gi, "").replace(/```/g, "").trim();
          const env = JSON.parse(clean);
          const bias = String(env.verdict || "").toUpperCase();
          if (["BULLISH", "BEARISH", "NEUTRAL"].includes(bias) && typeof env.read === "string" && env.read.trim()) {
            const conf = Math.max(0, Math.min(100, parseInt(env.confidence, 10) || 0));
            textResponse = `VERDICT: ${bias} ${conf}%\n\n${env.read.trim()}`;
            const coord = (v) => Math.max(0, Math.min(100, Number(v) || 0));
            if (Array.isArray(env.drawings)) {
              const drawings = env.drawings
                .filter((d) => d && (d.type === "zone" || d.type === "line"))
                .map((d) => ({
                  type: d.type,
                  tone: ["support", "resistance", "trend"].includes(d.tone) ? d.tone : "trend",
                  x1: coord(d.x1), y1: coord(d.y1), x2: coord(d.x2), y2: coord(d.y2),
                  label: typeof d.label === "string" ? d.label.slice(0, 48) : "",
                }))
                .slice(0, 6);
              if (drawings.length) plot = { drawings };
            }
            if (Array.isArray(env.actions)) {
              const actions = env.actions
                .filter((a) => a && ["watch", "remind", "watchlist", "teach"].includes(a.kind) && typeof a.label === "string")
                .map((a) => ({
                  kind: a.kind,
                  label: a.label.slice(0, 64),
                  symbol: typeof a.symbol === "string" ? a.symbol.slice(0, 12) : null,
                  level: typeof a.level === "number" && isFinite(a.level) ? a.level : null,
                  when: ["open", "4h", "tomorrow"].includes(a.when) ? a.when : null,
                  topic: typeof a.topic === "string" ? a.topic.slice(0, 64) : null,
                }))
                .slice(0, 4);
              if (actions.length) plotActions = actions;
            }
            console.log(`Plot envelope parsed: ${plot ? plot.drawings.length : 0} drawings, ${plotActions ? plotActions.length : 0} actions`);
          }
        } catch (e) {
          console.error("Plot envelope parse failed, returning raw text:", e.message);
          // Salvage the read field if the JSON is merely malformed
          const m = /"read"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(textResponse);
          if (m) {
            try { textResponse = JSON.parse(`"${m[1]}"`); } catch { /* keep raw text */ }
          }
        }
      }

      // Desk actions: extract + sanitize the fenced block, strip it from
      // the visible reply, and ship structured actions for the desk to run.
      let deskActions = null;
      if (deskMode && textResponse) {
        const m = /```(?:desk|json)?\s*(\{[\s\S]*?\})\s*```/.exec(textResponse);
        if (m) {
          try {
            const parsed = JSON.parse(m[1]);
            if (parsed && Array.isArray(parsed.actions)) {
              const clean = [];
              for (const a of parsed.actions.slice(0, 3)) {
                if (!a || typeof a !== "object") continue;
                const sym = typeof a.symbol === "string" ? a.symbol.toUpperCase().trim() : null;
                if (a.type === "open_position" && sym && DESK_SYMBOLS.includes(sym) && ["buy", "sell"].includes(a.direction)) {
                  const act = { type: "open_position", symbol: sym, direction: a.direction };
                  if (Number.isFinite(a.leverage)) act.leverage = Math.max(1, Math.min(100, Math.round(a.leverage)));
                  if (Number.isFinite(a.rr)) act.rr = Math.max(0.5, Math.min(10, a.rr));
                  if (Number.isFinite(a.notional)) act.notional = Math.max(100, Math.min(10000000, a.notional));
                  clean.push(act);
                } else if (a.type === "close_position") {
                  if (a.all === true) clean.push({ type: "close_position", all: true });
                  else if (sym && DESK_SYMBOLS.includes(sym)) clean.push({ type: "close_position", symbol: sym });
                } else if (a.type === "show_symbol" && sym && DESK_SYMBOLS.includes(sym)) {
                  const act = { type: "show_symbol", symbol: sym };
                  if (["1", "5", "15", "60", "240", "D", "W"].includes(String(a.interval))) act.interval = String(a.interval);
                  clean.push(act);
                }
              }
              if (clean.length) {
                deskActions = clean;
                textResponse = textResponse.replace(m[0], "").trim();
                console.log(`Desk actions parsed: ${clean.length} (${clean.map((c) => c.type).join(",")})`);
              }
            }
          } catch (e) {
            console.error("Desk actions parse failed:", e.message);
          }
        }
      }

      logApiUsage(data.usage);


      // Semantic education cache (write): only knowledge-only
      // answers are ever stored — no TA, price or news data was
      // attached and no cards or actions were produced — so a
      // cached answer can never go stale.
      if (eduEmbed && eduNormQ && !eduExactDoc && !sharedLink && textResponse &&
        !taData && !priceData && !newsData &&
        !plot && !chartReq && !showcaseReq && !signalChart && !sentimentReq && !deskActions &&
        textResponse.length >= 80 && textResponse.length <= 6000) {
        db.collection("eduCache").add({
          q: eduNormQ, question: String(prompt).slice(0, 300), embedding: eduEmbed,
          answer: textResponse, v: EDU_CACHE_V, hits: 0, createdAt: Date.now(),
        }).then(() => console.log("EduCache STORED q=\"" + eduNormQ + "\""))
          .catch((e) => console.log("EduCache store failed:", e.message));
      }

      const out = { response: textResponse || "I'm not sure how to respond to that. Could you try rephrasing?" };
      if (plot) out.plot = plot;
      if (plotActions) out.actions = plotActions;
      if (chartReq) {
        out.chart = chartReq;
        if (chartActions) out.actions = chartActions;
        console.log(`Chart card attached: ${chartReq.tvSymbol} (${chartReq.interval})`);
      }
      if (showcaseReq) {
        out.chart = showcaseReq;
        if (showcaseActions) out.actions = showcaseActions;
        console.log("Showcase chart + chips attached");
      }
      if (signalChart && !out.chart) {
        out.chart = signalChart;
        if (signalActions && !out.actions) out.actions = signalActions;
        console.log(`Signal chart attached: ${signalChart.tvSymbol}`);
      }
      if (sentimentReq) out.sentiment = sentimentReq;
      if (deskActions) out.deskActions = deskActions;
      return out;
    } catch (error) {
      console.error("Chat error:", error);
      throw new HttpsError("internal", "Failed to process your message. Please try again.");
    }
  }
);

exports.searchWeb = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { query } = request.data;
    if (!query || typeof query !== "string") {
      throw new HttpsError("invalid-argument", "A search query is required.");
    }

    try {
      const relDay = resolveRelativeDay(query);
      const [prices, news] = await Promise.all([
        fetchSimplePrice(query),
        searchGoogleNews(query, relDay ? relDay.whenDays : null),
      ]);
      const parts = [];
      if (prices) parts.push(prices);
      if (news) parts.push(news);
      return { results: parts.join("\n\n") || "No results found." };
    } catch (error) {
      console.error("Search error:", error);
      throw new HttpsError("internal", "Search failed. Please try again.");
    }
  }
);

// ─── Demo desk: live quotes + drawn levels ───
// Batch quotes for the paper-trading desk. Symbols are desk display
// symbols (US30, GOLD, BTC, AAPL…) resolved to data sources the same way
// chart cards resolve them (chartDataSource).
async function fetchYahooQuotePrice(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const prev = meta.chartPreviousClose || meta.previousClose || null;
  return {
    price: meta.regularMarketPrice,
    changePct: prev ? +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2) : null,
  };
}

exports.prices = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const raw = Array.isArray(request.data?.symbols) ? request.data.symbols : [];
  const symbols = [...new Set(raw.map((s) => String(s).toUpperCase().trim()).filter(Boolean))].slice(0, 12);
  const quotes = {};
  const cryptoJobs = {};
  const stockJobs = [];
  for (const sym of symbols) {
    const src = chartDataSource({ symbol: sym });
    if (src.type === "crypto") {
      (cryptoJobs[src.coinId] = cryptoJobs[src.coinId] || []).push(sym);
    } else {
      stockJobs.push([sym, src.symbol]);
    }
  }
  const tasks = [];
  const coinIds = Object.keys(cryptoJobs);
  if (coinIds.length) {
    tasks.push((async () => {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(",")}&vs_currencies=usd&include_24hr_change=true`,
          { headers: { accept: "application/json" } }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const id of coinIds) {
          const d = data[id];
          if (!d || d.usd == null) continue;
          for (const sym of cryptoJobs[id]) {
            quotes[sym] = { price: d.usd, changePct: d.usd_24h_change != null ? +d.usd_24h_change.toFixed(2) : null };
          }
        }
      } catch (err) {
        console.error("prices crypto error:", err.message);
      }
    })());
  }
  for (const [sym, yahoo] of stockJobs) {
    tasks.push((async () => {
      try {
        const q = await Promise.race([
          fetchYahooQuotePrice(yahoo),
          new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        if (q) quotes[sym] = q;
      } catch (err) {
        console.error("prices stock error:", err.message);
      }
    })());
  }
  await Promise.all(tasks);
  return { quotes, asOf: Date.now() };
});

// Drawn levels for one symbol — same computation as chat chart cards.
exports.levels = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const symbol = String(request.data?.symbol || "").toUpperCase().trim();
  const interval = String(request.data?.interval || "D");
  if (!symbol) {
    throw new HttpsError("invalid-argument", "A symbol is required.");
  }
  const chartReq = { symbol, tvSymbol: CHART_TV_MAP[symbol] || `NASDAQ:${symbol}`, interval };
  try {
    const levels = await Promise.race([
      computeChartLevels(chartReq),
      new Promise((resolve) => setTimeout(() => resolve(null), 9000)),
    ]);
    return { levels };
  } catch (err) {
    console.error("levels error:", err.message);
    return { levels: null };
  }
});

// ─── Feed function: structured headlines + economic calendar + macro ───
// Backs the Feed page: general market headlines, per-symbol headlines for
// the user's watchlist, this week's economic calendar (ForexFactory data
// via the free faireconomy JSON mirror — FF offers no public API), and the
// FRED macro block. Everything fails soft: a dead source returns empty.
async function searchGoogleNewsItems(query, whenDays, limit) {
  try {
    const boundedQuery = whenDays && whenDays > 0 ? query + " when:" + whenDays + "d" : query;
    const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(boundedQuery) + "&hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const results = [];
    const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && results.length < (limit || 6)) {
      const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim();
      const link = match[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      if (title) results.push({ title, link, date: match[3].trim() });
    }
    return results;
  } catch (err) {
    console.error("searchGoogleNewsItems failed:", err.message);
    return [];
  }
}

async function fetchEconomicCalendar() {
  try {
    const res = await Promise.race([
      fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { headers: { accept: "application/json" } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("calendar timeout")), 6000)),
    ]);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 250).map((e) => ({
      title: String(e.title || ""),
      country: String(e.country || ""),
      date: String(e.date || ""),
      impact: String(e.impact || ""),
      forecast: String(e.forecast || ""),
      previous: String(e.previous || ""),
      actual: String(e.actual || ""),
    }));
  } catch (err) {
    console.error("fetchEconomicCalendar failed:", err.message);
    return [];
  }
}

exports.feed = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const symbols = [...new Set((Array.isArray(request.data?.symbols) ? request.data.symbols : [])
    .map((s) => String(s).toUpperCase().trim()).filter(Boolean))].slice(0, 4);
  const jobs = [
    fetchMacroContext().catch(() => null),
    fetchEconomicCalendar(),
    searchGoogleNewsItems("stock market forex gold bitcoin news today", 2, 8),
    ...symbols.map((s) => searchGoogleNewsItems(s + " price news", 3, 5)),
  ];
  const [macro, calendar, general, ...perSymbol] = await Promise.all(jobs);
  const bySymbol = {};
  symbols.forEach((s, i) => { bySymbol[s] = perSymbol[i] || []; });
  return { macro: macro || null, calendar, headlines: { general, bySymbol }, asOf: Date.now() };
});


// --- Invite referrals: a new user claims a friend's referral code ---
// Both sides bank a 20%-off-first-month reward automatically: the
// new user gets refReward on their doc; the referrer's joined and
// coupons counters increment. Guarded: no self-referrals, one claim
// per account, unknown codes are a quiet no-op.
const FV = require("firebase-admin/firestore").FieldValue;

exports.claimReferral = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const code = String((request.data && request.data.refCode) || "")
    .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  if (!code) return { ok: false, reason: "no_code" };
  const meRef = db.collection("users").doc(uid);
  const meSnap = await meRef.get();
  const me = meSnap.exists ? meSnap.data() : {};
  if (me.referredBy) return { ok: false, reason: "already_claimed" };
  const q = await db.collection("users").where("referralCode", "==", code).limit(2).get();
  if (q.empty) return { ok: false, reason: "unknown_code" };
  const refDoc = q.docs[0];
  if (refDoc.id === uid) return { ok: false, reason: "self" };
  const batch = db.batch();
  batch.set(meRef, {
    referredBy: code,
    referredByUid: refDoc.id,
    refReward: { pct: 20, kind: "first_month_off", status: "banked", at: Date.now() },
  }, { merge: true });
  batch.update(refDoc.ref, {
    "referrals.joined": FV.increment(1),
    "referrals.coupons": FV.increment(1),
  });
  batch.set(db.collection("referrals").doc(uid), { referrerUid: refDoc.id, code, at: Date.now() });
  await batch.commit();
  console.log("Referral claimed:", code, "by", uid);
  return { ok: true };
});

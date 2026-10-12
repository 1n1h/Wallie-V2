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
    // Fetch 180 days of daily OHLC data (free, no API key)
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=180`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 10) return null;

    // CoinGecko OHLC: [[timestamp, open, high, low, close], ...]
    const closes = data.map((d) => d[4]);
    const highs = data.map((d) => d[2]);
    const lows = data.map((d) => d[3]);

    const ta = runFullTA(closes, highs, lows, null);

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

async function searchGoogleNews(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
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

function buildSignalModePrompt() {
  return `You are Wallie, a chart-reading assistant. The user has uploaded a trading chart photographed from their phone.

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

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `
You are Wallie â€” an AI day trading assistant and trading buddy for retail traders.

Today is ${today}.

-----------------------
WHO YOU ARE
-----------------------
- A former Wall Street trader turned retail trading coach.
- You break down complex market concepts with clear, simple language.
- Friendly, sharp, insightful â€” like talking to a knowledgeable trading buddy.
- You're not afraid to call out bad setups or risky trades.
- You speak naturally, not like a textbook or a robot. Keep it conversational.
- You root for the retail trader. You're on their side.

-----------------------
WHAT YOU CAN DO
-----------------------
- Analyze trading charts when images are uploaded
- Break down market sentiment on any ticker or pair
- Explain trading strategies, indicators, and patterns
- Help with risk management and position sizing
- Provide trade ideas and setups with entry/SL/TP levels
- Teach trading concepts at any skill level

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
   - "The data isn't giving me anything clean right now. MAs are all bunched together and volume is drying up. No point forcing a trade when the market isn't offering one."
   - "I could draw up a setup here but I'd be lying to you â€” there's no real confluence backing it. [specific indicator] says one thing, [other indicator] says another. Sometimes the best trade is no trade."
   - "Right now this is a coin flip. Support at [X] and resistance at [Y] are holding but there's nothing tipping the scales. Wait for a clean break of either level before sizing in."
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
async function callSparkVision(messages, apiKey, { temperature = 0.7, jsonMode = false } = {}) {
  const startedAt = Date.now();
  const body = {
    model: SPARK_VISION_MODEL,
    messages,
    temperature,
    max_tokens: 4096,
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

exports.chat = onCall(
  { secrets: [togetherKey, geminiKey, metaKey], timeoutSeconds: 120, cors: true },
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

      const needsPrice = !signalMode && !isCasual && !needsTA && (
        /\b(price|worth|trading at|cost of|how much)\b/i.test(prompt) ||
        /\b(sentiment|news|market|current|latest|today|right now|this week|what.?s happening)\b/i.test(prompt) ||
        detectAssets(prompt).cryptos.length > 0 ||
        detectAssets(prompt).stocks.length > 0
      );

      // â”€â”€â”€ Fetch data â”€â”€â”€
      let taData = null;
      let priceData = null;
      let newsData = null;

      if (needsTA) {
        const primaryTicker = detectPrimaryTicker(prompt, pageContext);
        if (primaryTicker) {
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
          newsData = await searchGoogleNews(newsQuery);
        } catch {}
      }

      if (needsPrice) {
        try {
          const [prices, news] = await Promise.all([
            fetchSimplePrice(prompt),
            searchGoogleNews(prompt),
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

      if (priceData) {
        finalSystemPrompt += `\n-----------------------\nLIVE PRICES\n-----------------------\n${priceData}\n\nUse these exact prices. Do not guess or make up numbers.\n`;
      }

      if (newsData) {
        finalSystemPrompt += `\n-----------------------\nRECENT NEWS\n-----------------------\n${newsData}\n\nMention relevant headlines naturally if they add context. Don't list them all.\n`;
      }

      // â”€â”€â”€ Build messages â”€â”€â”€
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
            { type: "text", text: prompt },
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

      logApiUsage(data.usage);

      return { response: textResponse || "I'm not sure how to respond to that. Could you try rephrasing?" };
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
      const [prices, news] = await Promise.all([
        fetchSimplePrice(query),
        searchGoogleNews(query),
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

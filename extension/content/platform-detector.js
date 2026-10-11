// =============================================================
// Platform Detector — Content Script (v2)
// =============================================================
// Upgraded: MutationObserver replaces polling, instant ticker
// detection, SPA navigation listeners, always-on context.
// =============================================================

(() => {
  "use strict";

  const PLATFORMS = {
    tradingview: {
      match: /tradingview\.com/,
      name: "TradingView",
      // Nodes to watch for mutations (ticker/price changes)
      watchSelectors: ['.chart-widget', '.layout__area--top', '#header-toolbar-symbol-search'],
      selectors: {
        ticker: [
          '[data-symbol-short]',
          '.chart-widget .pane-legend-title__description',
          '#header-toolbar-symbol-search input',
          '.tv-category-header__price-line .js-symbol-last',
        ],
        price: [
          '.chart-widget .pane-legend-item-value-wrap .pane-legend-line:first-child .pane-legend-item-value',
          '.js-symbol-last',
          '[class*="lastContainer"] [class*="last-"]',
        ],
        timeframe: [
          '#header-toolbar-intervals .isActive',
          '[data-name="date-ranges-tabs"] .isActive',
          '.layout__area--top button[class*="isActive"]',
        ],
        chartCanvas: [
          'canvas.chart-markup-table',
          '.chart-container canvas',
          'table.chart-markup-table canvas',
        ],
      },
    },
    binance: {
      match: /binance\.com/,
      name: "Binance",
      watchSelectors: ['[class*="symbol"]', '[class*="showPrice"]'],
      selectors: {
        ticker: ['.css-1bwgsh3', '[class*="symbol"]', '.header-title h1'],
        price: ['[class*="showPrice"]', '.css-ydcgk2', '[class*="tickerPrice"]'],
        timeframe: ['.chart-toolbar button.active', '[class*="interval"] .active'],
        chartCanvas: ['#binance-kline canvas', '.kline-container canvas'],
      },
    },
    coinbase: {
      match: /coinbase\.com/,
      name: "Coinbase",
      watchSelectors: ['[class*="AssetPrice"]'],
      selectors: {
        ticker: ['h1[class*="TextTitle"]', '[data-testid="asset-name"]'],
        price: ['[class*="AssetPrice"]', 'span[class*="price"]'],
        timeframe: ['button[aria-pressed="true"]'],
        chartCanvas: ['canvas'],
      },
    },
    bybit: {
      match: /bybit\.com/,
      name: "Bybit",
      watchSelectors: ['.contract-name', '.price-value'],
      selectors: {
        ticker: ['.contract-name', '[class*="symbolName"]'],
        price: ['.price-value', '[class*="lastPrice"]'],
        timeframe: ['.chart-toolbar .active'],
        chartCanvas: ['.chart-container canvas'],
      },
    },
    yahoo: {
      match: /finance\.yahoo\.com/,
      name: "Yahoo Finance",
      watchSelectors: ['fin-streamer[data-field="regularMarketPrice"]'],
      selectors: {
        ticker: ['h1[class*="yf-"]', '[data-testid="qsp-title"]'],
        price: ['fin-streamer[data-field="regularMarketPrice"]', '[data-testid="qsp-price"]'],
        timeframe: ['button[data-selected="true"]'],
        chartCanvas: ['canvas'],
      },
    },
    investing: {
      match: /investing\.com/,
      name: "Investing.com",
      watchSelectors: ['[data-test="instrument-price-last"]'],
      selectors: {
        ticker: ['h1.instrument-header_title__gU0S_', 'h1[class*="instrument"]'],
        price: ['[data-test="instrument-price-last"]', '.instrument-price_last__KQzyA'],
        timeframe: [],
        chartCanvas: ['canvas'],
      },
    },
  };

  let currentPlatform = null;
  let lastContextJSON = "";
  let domObserver = null;

  // ---- Detect Current Platform ----

  function detectPlatform() {
    const url = window.location.href;
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.match.test(url)) {
        return { key, ...platform };
      }
    }
    return null;
  }

  // ---- Query DOM with fallback selectors ----

  function queryFirst(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          return el.getAttribute("data-symbol-short")
            || el.textContent?.trim()
            || el.value?.trim()
            || null;
        }
      } catch { /* skip invalid selectors */ }
    }
    return null;
  }

  // ---- Build & Broadcast Context ----

  function buildContext() {
    const platform = currentPlatform || detectPlatform();
    if (!platform) {
      window.__walliePageContext = { platform: null };
      return;
    }

    currentPlatform = platform;

    const context = {
      platform: platform.name,
      platformKey: platform.key,
      url: window.location.href,
      ticker: queryFirst(platform.selectors.ticker),
      price: queryFirst(platform.selectors.price),
      timeframe: queryFirst(platform.selectors.timeframe),
      hasChart: platform.selectors.chartCanvas.some(
        (sel) => document.querySelector(sel) !== null
      ),
      timestamp: Date.now(),
    };

    // Clean ticker
    if (context.ticker) {
      context.ticker = context.ticker.split(/[\s/]/)[0].replace(/[^A-Za-z0-9.]/g, "");
    }

    // Only broadcast if context actually changed
    const json = JSON.stringify({ t: context.ticker, p: context.price, tf: context.timeframe });
    if (json === lastContextJSON) return;
    lastContextJSON = json;

    window.__walliePageContext = context;

    // Notify extension (guard against invalidated context after extension reload)
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: "PAGE_CONTEXT_UPDATE",
          payload: context,
        }).catch(() => {});
      }
    } catch { /* extension context invalidated */ }
  }

  // ---- MutationObserver: Watch for ticker/price DOM changes ----

  function startObserving() {
    if (domObserver) domObserver.disconnect();

    const platform = currentPlatform;
    if (!platform) return;

    // Debounce to avoid rapid-fire rebuilds
    let debounceTimer = null;
    const debouncedBuild = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(buildContext, 150);
    };

    domObserver = new MutationObserver(debouncedBuild);

    // Watch specific containers for this platform
    const watchTargets = [];
    for (const sel of (platform.watchSelectors || [])) {
      try {
        const el = document.querySelector(sel);
        if (el) watchTargets.push(el);
      } catch {}
    }

    // Always watch body as fallback (characterData for price ticks)
    if (watchTargets.length === 0) {
      watchTargets.push(document.body);
    }

    for (const target of watchTargets) {
      domObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: false,
      });
    }

    // Also watch body for structural changes (new chart loaded, SPA nav)
    domObserver.observe(document.body, { childList: true, subtree: false });
  }

  // ---- SPA Navigation Detection ----

  let lastUrl = location.href;

  // History API interception (works on TradingView, Binance, etc.)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    onNavigation();
  };

  window.addEventListener("popstate", onNavigation);

  function onNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    currentPlatform = null; // re-detect
    lastContextJSON = ""; // force rebuild

    // Wait for DOM to settle after navigation
    setTimeout(() => {
      currentPlatform = detectPlatform();
      buildContext();
      startObserving();
    }, 500);
  }

  // ---- Initialize ----

  currentPlatform = detectPlatform();
  buildContext();
  startObserving();

  // Fallback: re-check every 10s in case MutationObserver misses something
  // (much less frequent than the old 3s polling)
  setInterval(() => {
    lastContextJSON = ""; // force a fresh check
    buildContext();
  }, 10000);

  console.log("[Wallie AI] Platform detector v2 loaded — MutationObserver active.");
})();

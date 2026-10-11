// =============================================================
// Chart Scraper — Content Script (v2)
// =============================================================
// Upgraded: Direct canvas.toDataURL capture, fallback to tab
// capture, manual selection mode preserved.
// =============================================================

(() => {
  "use strict";

  let selectionMode = false;
  let overlay = null;
  let selectionBox = null;
  let startX = 0;
  let startY = 0;

  // Platform-specific canvas selectors (ordered by specificity)
  const CANVAS_SELECTORS = {
    tradingview: [
      'table.chart-markup-table canvas',
      'canvas.chart-markup-table',
      '.chart-container canvas',
      '.layout__area--center canvas',
    ],
    binance: [
      '#binance-kline canvas',
      '.kline-container canvas',
      '[class*="kline"] canvas',
    ],
    coinbase: ['[class*="ChartContainer"] canvas', 'canvas'],
    bybit: ['.chart-container canvas', 'canvas'],
    yahoo: ['[data-testid="qsp-chart"] canvas', 'canvas'],
    investing: ['#candle-chart canvas', '.chart-container canvas', 'canvas'],
  };

  // ---- Message Listener ----

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "START_CHART_SELECT") {
      startSelectionMode();
      sendResponse({ success: true });
      return;
    }

    if (message.type === "CAPTURE_CHART_DIRECT") {
      captureChartDirect().then(sendResponse);
      return true;
    }

    if (message.type === "AUTO_DETECT_CHART") {
      autoDetectAndCapture().then(sendResponse);
      return true;
    }

    if (message.type === "GET_CHART_ELEMENT_RECT") {
      sendResponse(findChartRect());
      return;
    }
  });

  // ---- Direct Canvas Capture (no tab screenshot needed) ----

  async function captureChartDirect() {
    const ctx = window.__walliePageContext;
    const platformKey = ctx?.platformKey;
    const selectors = CANVAS_SELECTORS[platformKey] || ['canvas'];

    // Try each selector to find the chart canvas
    for (const sel of selectors) {
      try {
        const canvases = document.querySelectorAll(sel);
        for (const canvas of canvases) {
          const rect = canvas.getBoundingClientRect();
          // Must be a visible, meaningful chart (not tiny icons or UI elements)
          if (rect.width > 200 && rect.height > 150 && canvas.width > 100) {
            try {
              const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
              // Verify it's not blank (all white or all black)
              if (dataUrl.length > 5000) {
                return {
                  success: true,
                  dataUrl,
                  method: "canvas-direct",
                  width: canvas.width,
                  height: canvas.height,
                };
              }
            } catch (e) {
              // Canvas tainted by cross-origin — fall through to tab capture
              console.warn("[Wallie AI] Canvas tainted, will use tab capture:", e.message);
            }
          }
        }
      } catch {}
    }

    // Fallback: return rect for tab capture + crop
    const rect = findChartRect();
    if (rect) {
      return { success: false, fallbackRect: rect, method: "needs-tab-capture" };
    }

    return { success: false, error: "No chart canvas found on this page." };
  }

  // ---- Auto-Detect Chart Area (for tab capture fallback) ----

  async function autoDetectAndCapture() {
    const rect = findChartRect();
    if (!rect) {
      return { success: false, error: "No chart detected on this page." };
    }
    return { success: true, rect };
  }

  function findChartRect() {
    const ctx = window.__walliePageContext;
    if (!ctx || !ctx.platformKey) return null;

    const chartSelectors = {
      tradingview: ['.chart-markup-table', '.chart-container', '[class*="chart-"]', '.layout__area--center'],
      binance: ['#binance-kline', '.kline-container', '[class*="kline"]'],
      coinbase: ['[class*="ChartContainer"]', '[data-testid="chart-container"]'],
      bybit: ['.chart-container', '[class*="chart-wrapper"]'],
      yahoo: ['[data-testid="qsp-chart"]', '.chart-container'],
      investing: ['#candle-chart', '.chart-container'],
    };

    const selectors = chartSelectors[ctx.platformKey] || ['canvas'];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }
      }
    }

    return null;
  }

  // Expose for external calls from side panel
  window.__wallieChartScraper_findChartRect = findChartRect;

  // ---- Manual Selection Mode ----

  function startSelectionMode() {
    if (selectionMode) return;
    selectionMode = true;

    overlay = document.createElement("div");
    overlay.className = "wallie-select-overlay";
    document.body.appendChild(overlay);

    selectionBox = document.createElement("div");
    selectionBox.className = "wallie-select-box";
    overlay.appendChild(selectionBox);

    const label = document.createElement("div");
    label.className = "wallie-select-label";
    label.textContent = "Click and drag to select chart area";
    overlay.appendChild(label);

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onEscape);
  }

  function onMouseDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
  }

  function onMouseMove(e) {
    if (!selectionBox || selectionBox.style.display !== "block") return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${Math.abs(e.clientX - startX)}px`;
    selectionBox.style.height = `${Math.abs(e.clientY - startY)}px`;
  }

  function onMouseUp(e) {
    const rect = {
      x: Math.min(e.clientX, startX),
      y: Math.min(e.clientY, startY),
      width: Math.abs(e.clientX - startX),
      height: Math.abs(e.clientY - startY),
    };
    cleanupSelection();
    if (rect.width > 50 && rect.height > 50) {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
          chrome.runtime.sendMessage({ type: "CHART_AREA_SELECTED", payload: rect });
        }
      } catch { /* extension context invalidated */ }
    }
  }

  function onEscape(e) {
    if (e.key === "Escape") cleanupSelection();
  }

  function cleanupSelection() {
    selectionMode = false;
    if (overlay) { overlay.remove(); overlay = null; selectionBox = null; }
    document.removeEventListener("keydown", onEscape);
  }

  console.log("[Wallie AI] Chart scraper v2 loaded — direct canvas capture enabled.");
})();

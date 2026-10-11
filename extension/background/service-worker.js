// =============================================================
// Wallie AI Chrome Extension — Background Service Worker (v2)
// =============================================================
// Upgrades: notifications, smart intent-aware prompts,
// always-on ticker context, direct canvas capture routing.
// =============================================================

const CLOUD_FN_BASE = "https://us-central1-wallie-ai-37522.cloudfunctions.net";

// ---- Side Panel Setup ----

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ---- Message Router ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_TAB") {
    handleTabCapture(sender.tab?.id).then(sendResponse);
    return true;
  }

  if (message.type === "CAPTURE_AREA") {
    handleAreaCapture(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === "SEND_CHAT") {
    handleChat(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === "GET_PAGE_CONTEXT") {
    getPageContext(sender.tab?.id || message.tabId).then(sendResponse);
    return true;
  }

  if (message.type === "POPOUT_WINDOW") {
    chrome.windows.getCurrent((win) => {
      const left = (win.left + win.width) - 440;
      chrome.windows.create({
        url: chrome.runtime.getURL("sidepanel/panel.html?mode=popup"),
        type: "popup",
        width: 420,
        height: 640,
        top: win.top + 60,
        left: Math.max(0, left),
      });
    });
    sendResponse({ success: true });
    return;
  }

  // Upgrade 3: Alert notifications
  if (message.type === "SHOW_NOTIFICATION") {
    showNotification(message.payload);
    sendResponse({ success: true });
    return;
  }
});

// ---- Tab Screenshot Capture ----

async function handleTabCapture(tabId) {
  try {
    const tab = tabId
      ? await chrome.tabs.get(tabId)
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
      quality: 92,
    });

    return { success: true, dataUrl };
  } catch (err) {
    console.error("Tab capture failed:", err);
    return { success: false, error: err.message };
  }
}

async function handleAreaCapture({ dataUrl, rect }) {
  return { success: true, dataUrl };
}

// ---- Chat with Cloud Functions ----

async function handleChat({ prompt, imageBase64, imageMimeType, history, userPersona, pageContext }) {
  const token = await getFirebaseToken();
  if (!token) {
    return { error: "Not signed in. Please log in to Wallie AI." };
  }

  const chatHistory = (history || []).map((msg) => ({
    role: msg.type === "user" ? "user" : "model",
    text: msg.message,
    hadImage: !!msg.hadImage,
  }));

  // Chart attachment decided by panel — it handles auto-capture before sending.
  // Service worker just passes through whatever the panel provides.
  let finalImageBase64 = imageBase64;
  let finalImageMime = imageMimeType;

  const payload = { prompt, history: chatHistory };
  if (finalImageBase64) payload.imageBase64 = finalImageBase64;
  if (finalImageMime) payload.imageMimeType = finalImageMime;
  if (userPersona) payload.userPersona = userPersona;
  if (pageContext) payload.pageContext = pageContext; // Always-on ticker metadata

  const res = await fetch(`${CLOUD_FN_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloud function error (${res.status}): ${text}`);
  }

  const json = await res.json();
  const response = json.result.response;

  // Auto-notify on strong trade signals
  if (response.includes("**BIAS:**") && response.includes("**ENTRY:**")) {
    const tickerMatch = response.match(/\*\*PAIR:\*\*\s*(.+)/);
    const biasMatch = response.match(/\*\*BIAS:\*\*\s*(.+)/);
    if (tickerMatch && biasMatch) {
      showNotification({
        title: `${biasMatch[1].trim()} Signal — ${tickerMatch[1].trim()}`,
        message: "Wallie detected a trade setup. Open the extension to see details.",
      });
    }
  }

  return { response };
}

// ---- Upgrade 3: Chrome Notifications ----

function showNotification({ title, message, icon }) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: icon || chrome.runtime.getURL("icons/icon128.png"),
    title: title || "Wallie AI",
    message: message || "",
    priority: 2,
  });
}

// Clicking a notification opens the side panel
chrome.notifications.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ---- Scrape Page Context via Content Script ----

async function getPageContext(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__walliePageContext || null,
    });
    return result?.result || null;
  } catch {
    return null;
  }
}

// ---- Firebase Auth Token Management ----

async function getFirebaseToken() {
  const { wallieAuthToken, wallieTokenExpiry } = await chrome.storage.local.get([
    "wallieAuthToken",
    "wallieTokenExpiry",
  ]);

  if (!wallieAuthToken || wallieAuthToken === "dev-token") return null;

  if (wallieTokenExpiry && Date.now() > wallieTokenExpiry) {
    chrome.runtime.sendMessage({ type: "REFRESH_TOKEN" }).catch(() => {});
    return null;
  }

  return wallieAuthToken;
}

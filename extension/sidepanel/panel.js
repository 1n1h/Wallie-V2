// =============================================================
// Wallie AI — Side Panel Controller
// =============================================================
// Handles: auth flow, chat UI, chart capture, context display,
// image cropping, and message routing to background worker.
// =============================================================

(() => {
  "use strict";

  // ---- Firebase Init ----

  const firebaseConfig = {
    apiKey: "AIzaSyCnd7ps1cC-ozSLvmh0sv-QQZHbcrEwi2c",
    authDomain: "wallie-ai-37522.firebaseapp.com",
    projectId: "wallie-ai-37522",
    storageBucket: "wallie-ai-37522.firebasestorage.app",
    messagingSenderId: "17389863721",
    appId: "1:17389863721:web:28578242d8de2a2aa22d38",
  };

  firebase.initializeApp(firebaseConfig);
  const fbAuth = firebase.auth();

  // ---- State ----

  const state = {
    authed: false,
    firebaseUser: null,
    userName: null,
    chatHistory: [],
    pendingImage: null, // { dataUrl, mimeType }
    pageContext: null,
    loading: false,
    activeChatIdx: null,
    referencedTab: null,
    lastChartBase64: null, // cached last chart for implicit context
    // TTS
    isSpeaking: false,
    activeSpeakBtn: null,
    voiceId: 0, // index into speechSynthesis voices
    ttsEnabled: true,
  };

  // ---- TTS (Web Speech API) ----

  const VOICE_PRESETS = [
    { name: "Default", match: null },
    { name: "Google US", match: "Google US English" },
    { name: "Google UK", match: "Google UK English" },
    { name: "Microsoft David", match: "David" },
    { name: "Microsoft Zira", match: "Zira" },
    { name: "Microsoft Mark", match: "Mark" },
  ];

  let speechUtterance = null;
  let availableVoices = [];

  function loadVoices() {
    availableVoices = speechSynthesis.getVoices();
  }
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();

  function getSelectedVoice() {
    if (!availableVoices.length) loadVoices();
    const preset = VOICE_PRESETS[state.voiceId] || VOICE_PRESETS[0];
    if (!preset.match) return null;
    return availableVoices.find((v) => v.name.includes(preset.match)) || null;
  }

  function speakText(text, btn) {
    // Stop current speech if any
    stopSpeaking();

    if (!state.ttsEnabled) return;

    // Strip markdown/html for clean speech
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\n+/g, ". ");

    speechUtterance = new SpeechSynthesisUtterance(clean);
    const voice = getSelectedVoice();
    if (voice) speechUtterance.voice = voice;
    speechUtterance.rate = 1.05;
    speechUtterance.pitch = 1;

    state.isSpeaking = true;
    state.activeSpeakBtn = btn;
    if (btn) btn.classList.add("active");

    speechUtterance.onend = () => {
      state.isSpeaking = false;
      if (btn) btn.classList.remove("active");
      state.activeSpeakBtn = null;
    };

    speechUtterance.onerror = () => {
      state.isSpeaking = false;
      if (btn) btn.classList.remove("active");
      state.activeSpeakBtn = null;
    };

    speechSynthesis.speak(speechUtterance);
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    state.isSpeaking = false;
    if (state.activeSpeakBtn) {
      state.activeSpeakBtn.classList.remove("active");
      state.activeSpeakBtn = null;
    }
  }

  function toggleSpeak(text, btn) {
    if (state.isSpeaking && state.activeSpeakBtn === btn) {
      stopSpeaking();
    } else {
      speakText(text, btn);
    }
  }

  function copyText(text) {
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/<[^>]*>/g, "");
    navigator.clipboard.writeText(clean);
  }

  async function loadTTSSettings() {
    const { wallieVoiceId, wallieTTSEnabled } = await chrome.storage.local.get([
      "wallieVoiceId", "wallieTTSEnabled",
    ]);
    if (wallieVoiceId != null) state.voiceId = wallieVoiceId;
    if (wallieTTSEnabled != null) state.ttsEnabled = wallieTTSEnabled;
  }

  // ---- DOM Refs ----

  const $ = (sel) => document.querySelector(sel);
  const authScreen = $("#auth-screen");
  const chatScreen = $("#chat-screen");
  const chatMessages = $("#chat-messages");
  const chatInput = $("#chat-input");
  const sendBtn = $("#btn-send");
  const attachBtn = $("#btn-attach");
  const fileInput = $("#file-input");
  const imagePreview = $("#image-preview");
  const previewImg = $("#preview-img");
  const removeImgBtn = $("#btn-remove-image");
  const sharingBar = $("#sharing-bar");
  const sharingLabel = $("#sharing-label");
  const captureBtn = $("#btn-capture-chart");
  const suggestions = $("#suggestions");
  const chipAnalyzeText = $("#chip-analyze-text");

  // ---- Init ----

  async function init() {
    // Listen for Firebase auth state
    fbAuth.onAuthStateChanged(async (user) => {
      if (user) {
        state.firebaseUser = user;
        state.authed = true;

        // Store fresh token for the service worker
        const token = await user.getIdToken();
        await chrome.storage.local.set({
          wallieAuthToken: token,
          wallieTokenExpiry: Date.now() + 3500000, // ~58 min
        });

        // Store and display user's first name
        if (user.displayName) {
          const firstName = user.displayName.split(" ")[0];
          state.userName = firstName;
          await chrome.storage.local.set({ wallieUserName: firstName });
        } else {
          const { wallieUserName } = await chrome.storage.local.get("wallieUserName");
          state.userName = wallieUserName || "Trader";
        }
        updateGreetingName();

        showChat();
      } else {
        state.firebaseUser = null;
        state.authed = false;
        await chrome.storage.local.remove(["wallieAuthToken", "wallieTokenExpiry"]);
        authScreen.classList.remove("hidden");
        chatScreen.classList.add("hidden");
      }
    });

    // Refresh token periodically (tokens expire in ~1 hour)
    setInterval(async () => {
      if (state.firebaseUser) {
        const token = await state.firebaseUser.getIdToken(true);
        await chrome.storage.local.set({
          wallieAuthToken: token,
          wallieTokenExpiry: Date.now() + 3500000,
        });
      }
    }, 30 * 60 * 1000); // every 30 min

    await loadTTSSettings();
    bindEvents();
    pollPageContext();
  }

  // ---- Event Bindings ----

  function bindEvents() {
    // Auth
    $("#btn-google-login").addEventListener("click", () => handleLogin("google"));
    $("#btn-apple-login").addEventListener("click", () => handleLogin("apple"));

    // Chat
    sendBtn.addEventListener("click", sendMessage);
    chatInput.addEventListener("input", onInputChange);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
      // Close tab picker on Escape
      if (e.key === "Escape") closeTabPicker();
    });

    // Attach menu (capture or upload)
    attachBtn.addEventListener("click", toggleAttachMenu);
    fileInput.addEventListener("change", handleFileAttach);
    removeImgBtn.addEventListener("click", clearPendingImage);

    // Capture from sharing bar still works
    captureBtn.addEventListener("click", captureChart);

    // New chat
    $("#btn-new-chat").addEventListener("click", resetChat);

    // Recent chats dropdown
    $("#btn-recent-chats").addEventListener("click", toggleRecentChats);

    // Settings in dropdown
    $("#btn-settings-dropdown").addEventListener("click", (e) => {
      e.stopPropagation();
      closeRecentChats();
    });

    // Pop-out / Dock / Close
    $("#btn-popout").addEventListener("click", handlePopout);
    $("#btn-close-popup").addEventListener("click", () => window.close());

    // Detect if we're in popup mode
    if (window.location.search.includes("mode=popup")) {
      document.body.classList.add("popup-mode");
      // Swap pop-out icon to "dock back" icon
      const popBtn = $("#btn-popout");
      popBtn.title = "Dock to sidebar";
      popBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="15" height="15" rx="2"/><path d="M2 9v11a2 2 0 0 0 2 2h11"/></svg>`;
      // Show close button in popup mode
      $("#btn-close-popup").classList.remove("hidden");
    }

    // TTS toggle
    $("#tts-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      state.ttsEnabled = !state.ttsEnabled;
      $("#tts-toggle").classList.toggle("active", state.ttsEnabled);
      chrome.storage.local.set({ wallieTTSEnabled: state.ttsEnabled });
      if (!state.ttsEnabled) stopSpeaking();
    });

    // Suggestion chips
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => handleQuickAction(chip.dataset.action));
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "PAGE_CONTEXT_UPDATE") {
        updatePageContext(msg.payload);
      }
      if (msg.type === "CHART_AREA_SELECTED") {
        handleAreaSelected(msg.payload);
      }
    });
  }

  // ---- Recent Chats Dropdown ----

  function toggleRecentChats() {
    const dropdown = $("#recent-chats-dropdown");
    if (dropdown.classList.contains("hidden")) {
      openRecentChats();
    } else {
      closeRecentChats();
    }
  }

  async function openRecentChats() {
    const dropdown = $("#recent-chats-dropdown");
    const list = $("#recent-chats-list");

    // Load saved chats from storage
    const { wallieSavedChats } = await chrome.storage.local.get("wallieSavedChats");
    const chats = wallieSavedChats || [];

    list.innerHTML = "";

    if (chats.length === 0) {
      list.innerHTML = '<div class="dropdown-empty">No recent chats</div>';
    } else {
      chats.slice(0, 8).forEach((chat, idx) => {
        const item = document.createElement("button");
        item.className = "dropdown-item" + (idx === state.activeChatIdx ? " active" : "");
        item.innerHTML = `
          <span class="chat-icon">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </span>
          ${escapeHtml(chat.title)}
        `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          loadChat(idx, chats);
          closeRecentChats();
        });
        list.appendChild(item);
      });

      if (chats.length > 8) {
        const more = document.createElement("button");
        more.className = "dropdown-item";
        more.innerHTML = `<span class="chat-icon" style="font-size:10px;">...</span> More`;
        list.appendChild(more);
      }
    }

    // Render voice options
    const voiceContainer = $("#voice-options");
    voiceContainer.innerHTML = "";
    VOICE_PRESETS.forEach((preset, idx) => {
      const btn = document.createElement("button");
      btn.className = "dropdown-item" + (idx === state.voiceId ? " active" : "");
      btn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        ${preset.name}
      `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.voiceId = idx;
        chrome.storage.local.set({ wallieVoiceId: idx });
        voiceContainer.querySelectorAll(".dropdown-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      voiceContainer.appendChild(btn);
    });

    // Update TTS toggle state
    $("#tts-toggle").classList.toggle("active", state.ttsEnabled);

    dropdown.classList.remove("hidden");

    // Close on click outside (next tick so the toggle click doesn't immediately close)
    setTimeout(() => {
      document.addEventListener("click", handleDropdownOutsideClick);
    }, 0);
  }

  function handleDropdownOutsideClick(e) {
    const dropdown = $("#recent-chats-dropdown");
    const toggleBtn = $("#btn-recent-chats");
    if (!dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
      closeRecentChats();
    }
  }

  function closeRecentChats() {
    $("#recent-chats-dropdown").classList.add("hidden");
    document.removeEventListener("click", handleDropdownOutsideClick);
  }

  function loadChat(idx, chats) {
    const chat = chats[idx];
    if (!chat) return;

    state.activeChatIdx = idx;
    state.chatHistory = chat.messages.map((m) => ({ type: m.type, message: m.message }));

    // Clear and rebuild messages
    chatMessages.innerHTML = "";
    chat.messages.forEach((m) => {
      addMessage(m.type === "user" ? "user" : "ai", m.message);
    });
  }

  async function saveCurrentChat() {
    if (state.chatHistory.length === 0) return;

    // Generate title from first user message
    const firstMsg = state.chatHistory.find((m) => m.type === "user");
    const title = firstMsg ? firstMsg.message.substring(0, 50) : "New chat";

    const { wallieSavedChats } = await chrome.storage.local.get("wallieSavedChats");
    const chats = wallieSavedChats || [];

    // Update existing or add new
    if (state.activeChatIdx != null && chats[state.activeChatIdx]) {
      chats[state.activeChatIdx].messages = state.chatHistory;
      chats[state.activeChatIdx].title = title;
    } else {
      chats.unshift({ title, messages: state.chatHistory, timestamp: Date.now() });
      state.activeChatIdx = 0;
    }

    // Keep last 20
    await chrome.storage.local.set({ wallieSavedChats: chats.slice(0, 20) });
  }

  // ---- @ Tab Picker ----

  async function showTabPicker() {
    const picker = $("#tab-picker");
    const list = $("#tab-picker-list");

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      list.innerHTML = "";

      tabs.forEach((tab) => {
        if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) return;

        const item = document.createElement("button");
        item.className = "tab-item";
        const favicon = tab.favIconUrl || "";
        const title = tab.title || tab.url || "Untitled";

        item.innerHTML = `
          ${favicon ? `<img src="${escapeHtml(favicon)}" alt="" onerror="this.style.display='none'" />` : '<span style="width:14px;height:14px;display:inline-block;"></span>'}
          <span>${escapeHtml(title.substring(0, 50))}</span>
        `;
        item.addEventListener("click", () => {
          insertTabReference(tab);
          closeTabPicker();
        });
        list.appendChild(item);
      });

      picker.classList.remove("hidden");
    } catch (err) {
      console.error("Tab query failed:", err);
    }
  }

  function closeTabPicker() {
    $("#tab-picker").classList.add("hidden");
  }

  function insertTabReference(tab) {
    const title = tab.title || tab.url;
    // Replace the @ with a tab reference
    const val = chatInput.value;
    const atIdx = val.lastIndexOf("@");
    chatInput.value = val.substring(0, atIdx) + `@${title.substring(0, 40)} `;
    chatInput.focus();
    onInputChange();

    // Store referenced tab info for context
    state.referencedTab = { id: tab.id, title: tab.title, url: tab.url };
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Auth ----

  async function handleLogin(provider) {
    const btn = provider === "google" ? $("#btn-google-login") : $("#btn-apple-login");
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = "0.6";

    try {
      if (provider === "google") {
        await googleSignIn();
      } else {
        // Apple sign-in: open web app (Apple requires verified domain)
        chrome.tabs.create({ url: "https://wallie-ai-37522.web.app/" });
        btn.disabled = false;
        btn.style.opacity = "";
      }
    } catch (err) {
      console.error("Auth error:", err);
      alert("Sign-in failed: " + err.message);
      btn.disabled = false;
      btn.style.opacity = "";
      btn.innerHTML = origHTML;
    }
  }

  async function googleSignIn() {
    const GOOGLE_CLIENT_ID = "17389863721-nd9m4qra2ksu0fksv88ci2p5bnk27jmp.apps.googleusercontent.com";
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("prompt", "select_account");

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (url) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(url);
          }
        }
      );
    });

    // Extract access_token from redirect URL fragment
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");

    if (!accessToken) {
      throw new Error("No access token received from Google");
    }

    // Sign into Firebase with the Google access token
    const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    await fbAuth.signInWithCredential(credential);
    // onAuthStateChanged listener handles the rest
  }

  // ---- Screen Management ----

  function showChat() {
    authScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
  }

  async function handlePopout() {
    const isPopup = window.location.search.includes("mode=popup");
    if (isPopup) {
      // Dock back: open the side panel on the active tab and close this popup
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
      }
      window.close();
    } else {
      // Pop out: open as floating window
      chrome.runtime.sendMessage({ type: "POPOUT_WINDOW" });
    }
  }

  function updateGreetingName() {
    const nameEl = $("#user-name");
    if (nameEl) nameEl.textContent = state.userName || "Trader";
  }

  function resetChat() {
    state.chatHistory = [];
    state.activeChatIdx = null;
    state.referencedTab = null;
    clearPendingImage();
    chatMessages.innerHTML = "";

    // Rebuild welcome
    const welcome = document.createElement("div");
    welcome.className = "welcome-section";
    welcome.innerHTML = `
      <h2 class="greeting-text">Hello, <span id="user-name" class="gradient-text">${state.userName || "Trader"}</span></h2>
      <p class="greeting-sub">How can I help you today?</p>
    `;
    chatMessages.appendChild(welcome);

    // Rebuild suggestions
    const sug = document.createElement("div");
    sug.className = "suggestions";
    sug.id = "suggestions";
    sug.innerHTML = `
      <button class="chip" data-action="capture">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Capture this chart
      </button>
      <button class="chip" data-action="select">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
        Select chart area
      </button>
      <button class="chip" data-action="analyze">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        Analyze current setup
      </button>
      <button class="chip" data-action="sentiment">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        Market sentiment
      </button>
    `;
    chatMessages.appendChild(sug);

    // Re-bind chip events
    sug.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => handleQuickAction(chip.dataset.action));
    });
  }

  // ---- Page Context ----

  async function pollPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.runtime.sendMessage({
          type: "GET_PAGE_CONTEXT",
          tabId: tab.id,
        });
        if (response) updatePageContext(response);
      }
    } catch { /* tab not ready */ }

    setTimeout(pollPageContext, 5000);
  }

  function updatePageContext(ctx) {
    // Clear cached chart if the ticker changed (prevents stale chart from old pair)
    if (ctx?.ticker && state.pageContext?.ticker && ctx.ticker !== state.pageContext.ticker) {
      state.lastChartBase64 = null;
    }

    state.pageContext = ctx;

    if (ctx?.platform && (ctx.ticker || ctx.price)) {
      // Build sharing label like Gemini: "XAUUSD 4,411.90 +0.7%"
      let label = ctx.ticker || "";
      if (ctx.price) label += ` ${ctx.price}`;
      if (ctx.timeframe) label += ` ${ctx.timeframe}`;

      sharingLabel.textContent = label.trim();
      sharingBar.classList.remove("hidden");

      // Update analyze chip with actual ticker
      const analyzeChip = document.querySelector("#chip-analyze-text, .chip[data-action='analyze'] span");
      if (analyzeChip) {
        analyzeChip.textContent = `Analyze ${ctx.ticker || "current"} setup`;
      }
    } else {
      sharingBar.classList.add("hidden");
    }
  }

  // ---- Chart Capture (v2: direct canvas → tab capture fallback) ----

  async function captureChart() {
    captureBtn.disabled = true;
    const origHTML = captureBtn.innerHTML;
    captureBtn.textContent = "...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let captured = false;

      // Try direct canvas capture first (faster, no permission flash)
      if (tab?.id) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // This runs in the content script context
              if (typeof window.__wallieDirectCapture === "function") {
                return window.__wallieDirectCapture();
              }
              return null;
            },
          });

          // Try sending message to content script for direct capture
          const directResult = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_CHART_DIRECT" });

          if (directResult?.success && directResult.dataUrl) {
            setPendingImage(directResult.dataUrl, "image/jpeg");
            // Cache for implicit context
            state.lastChartBase64 = directResult.dataUrl.split(",")[1];
            captured = true;
          } else if (directResult?.fallbackRect) {
            // Direct capture failed (tainted canvas), use tab capture + crop
            const tabResult = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
            if (tabResult.success) {
              const cropped = await cropImage(tabResult.dataUrl, directResult.fallbackRect);
              setPendingImage(cropped, "image/png");
              state.lastChartBase64 = cropped.split(",")[1];
              captured = true;
            }
          }
        } catch { /* content script not available */ }
      }

      // Fallback: full tab capture + optional crop
      if (!captured) {
        const result = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
        if (result.success) {
          // Try to get chart rect for cropping
          let chartRect = null;
          if (tab?.id) {
            try {
              const [sr] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.__wallieChartScraper_findChartRect?.() || null,
              });
              chartRect = sr?.result;
            } catch {}
          }

          if (chartRect) {
            const cropped = await cropImage(result.dataUrl, chartRect);
            setPendingImage(cropped, "image/png");
            state.lastChartBase64 = cropped.split(",")[1];
          } else {
            setPendingImage(result.dataUrl, "image/png");
            state.lastChartBase64 = result.dataUrl.split(",")[1];
          }
        } else {
          addSystemMessage("Failed to capture. Make sure you're on a trading page.");
        }
      }
    } catch (err) {
      addSystemMessage("Capture error: " + err.message);
    }

    captureBtn.disabled = false;
    captureBtn.innerHTML = origHTML;
  }

  async function cropImage(dataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = new OffscreenCanvas(rect.width * dpr, rect.height * dpr);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr,
          0, 0, rect.width * dpr, rect.height * dpr
        );
        canvas.convertToBlob({ type: "image/png" }).then((blob) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      };
      img.src = dataUrl;
    });
  }

  // ---- Area Selection ----

  async function handleAreaSelected(rect) {
    const result = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
    if (result.success) {
      const cropped = await cropImage(result.dataUrl, rect);
      setPendingImage(cropped, "image/png");
    }
  }

  async function startAreaSelect() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "START_CHART_SELECT" });
    }
  }

  // ---- Quick Actions ----

  function handleQuickAction(action) {
    clearWelcome();

    switch (action) {
      case "capture":
        captureChart();
        break;
      case "select":
        startAreaSelect();
        addSystemMessage("Click and drag on the page to select a chart area. Press Esc to cancel.");
        break;
      case "analyze":
        if (state.pageContext?.ticker) {
          chatInput.value = `Analyze ${state.pageContext.ticker} \u2014 what's the current setup? Give me entry, SL, and TP.`;
        } else {
          chatInput.value = "What's the market looking like right now?";
        }
        onInputChange();
        sendMessage();
        break;
      case "sentiment":
        if (state.pageContext?.ticker) {
          chatInput.value = `What's the current market sentiment on ${state.pageContext.ticker}?`;
        } else {
          chatInput.value = "What's the overall market sentiment right now?";
        }
        onInputChange();
        sendMessage();
        break;
    }
  }

  // ---- Image Handling ----

  // ---- Attach Menu (Capture Window / Upload from PC) ----

  function toggleAttachMenu() {
    const existing = document.querySelector(".attach-menu");
    if (existing) { existing.remove(); return; }

    const menu = document.createElement("div");
    menu.className = "attach-menu";
    menu.innerHTML = `
      <button class="attach-menu-item" data-action="capture">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Capture window
      </button>
      <button class="attach-menu-item" data-action="upload">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        Upload from PC
      </button>
    `;

    menu.querySelector('[data-action="capture"]').addEventListener("click", async () => {
      menu.remove();
      await captureChart();
    });

    menu.querySelector('[data-action="upload"]').addEventListener("click", () => {
      menu.remove();
      fileInput.click();
    });

    // Position above the attach button
    const inputArea = document.querySelector(".input-area");
    inputArea.insertBefore(menu, inputArea.firstChild);

    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && e.target !== attachBtn) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  function handleFileAttach() {
    const file = fileInput.files[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result, file.type);
    reader.readAsDataURL(file);
    fileInput.value = "";
  }

  function setPendingImage(dataUrl, mimeType) {
    // Compress large images to avoid 504 timeouts on the cloud function
    compressImage(dataUrl).then((compressed) => {
      state.pendingImage = { dataUrl: compressed, mimeType: "image/jpeg" };
      previewImg.src = compressed;
      imagePreview.classList.remove("hidden");
      onInputChange();
    });
  }

  function compressImage(dataUrl, maxWidth = 1280, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl); // fallback to original
      img.src = dataUrl;
    });
  }

  function clearPendingImage() {
    state.pendingImage = null;
    previewImg.src = "";
    imagePreview.classList.add("hidden");
    onInputChange();
  }

  // ---- Chat ----

  function onInputChange() {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 70) + "px";

    const hasContent = chatInput.value.trim().length > 0 || state.pendingImage;
    sendBtn.disabled = !hasContent || state.loading;

    // Detect @ for tab picker
    const val = chatInput.value;
    const cursorPos = chatInput.selectionStart;
    const textBefore = val.substring(0, cursorPos);

    // Show tab picker if @ is typed at start or after a space
    if (textBefore.endsWith("@") || (textBefore.endsWith("@") && textBefore.length === 1)) {
      showTabPicker();
    } else if (!textBefore.includes("@")) {
      closeTabPicker();
    }
  }

  async function sendMessage() {
    let text = chatInput.value.trim();
    if (!text && !state.pendingImage) return;
    if (state.loading) return;

    // Default prompt when sending an image with no text
    if (!text && state.pendingImage) {
      text = "Analyze this chart";
    }

    clearWelcome();

    // Append tab reference context to prompt (page context now handled by service worker)
    let prompt = text;
    if (state.referencedTab) {
      prompt += `\n\n[Context: User referenced tab "${state.referencedTab.title}" (${state.referencedTab.url})]`;
      state.referencedTab = null;
    }

    // Show user message
    addMessage("user", text, state.pendingImage?.dataUrl);

    // Build payload with full context
    const payload = {
      prompt,
      history: state.chatHistory.slice(-10),
      pageContext: state.pageContext,
    };

    if (state.pendingImage) {
      payload.imageBase64 = state.pendingImage.dataUrl.split(",")[1];
      payload.imageMimeType = state.pendingImage.mimeType;
      state.lastChartBase64 = payload.imageBase64;
    }

    state.chatHistory.push({ type: "user", message: text, hadImage: !!state.pendingImage });

    // Clear input
    chatInput.value = "";
    chatInput.style.height = "auto";
    clearPendingImage();

    // Loading
    state.loading = true;
    onInputChange();
    const loadingEl = addLoadingIndicator();

    try {
      const result = await chrome.runtime.sendMessage({
        type: "SEND_CHAT",
        payload,
      });

      loadingEl.remove();

      if (result.error) {
        addSystemMessage(result.error);
      } else {
        addMessage("ai", result.response);
        state.chatHistory.push({ type: "ai", message: result.response });
        saveCurrentChat();
      }
    } catch (err) {
      loadingEl.remove();
      addSystemMessage("Connection error: " + err.message);
    }

    state.loading = false;
    onInputChange();
  }

  // ---- Upgrade 4: Risk Calculator (Modal) ----

  function openRiskCalculator(entry, sl) {
    // Remove any existing overlay
    const existing = document.querySelector(".risk-calc-overlay");
    if (existing) existing.remove();

    const riskPerPoint = Math.abs(entry - sl);

    const overlay = document.createElement("div");
    overlay.className = "risk-calc-overlay";
    overlay.innerHTML = `
      <div class="risk-calc-modal">
        <div class="risk-calc-header">
          <div class="risk-calc-header-left">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Risk Calculator
          </div>
          <button class="risk-calc-close" title="Close">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="risk-calc-row">
          <label>Account Balance ($)</label>
          <input type="number" class="risk-calc-input rc-balance" value="10000" min="0" />
        </div>
        <div class="risk-calc-row">
          <label>Risk (%)</label>
          <input type="number" class="risk-calc-input rc-risk" value="1" min="0.1" max="100" step="0.1" />
        </div>
        <div class="risk-calc-row">
          <label>Entry / SL</label>
          <span class="risk-calc-vals">${entry.toLocaleString()} / ${sl.toLocaleString()}</span>
        </div>
        <div class="risk-calc-divider"></div>
        <div class="risk-calc-result">
          <span class="rc-label">Position Size</span>
          <span class="rc-value">—</span>
        </div>
        <div class="rc-risk-amount"></div>
      </div>
    `;

    const modal = overlay.querySelector(".risk-calc-modal");

    const calc = () => {
      const balance = parseFloat(modal.querySelector(".rc-balance").value) || 0;
      const riskPct = parseFloat(modal.querySelector(".rc-risk").value) || 0;
      const riskAmount = balance * (riskPct / 100);
      const positionSize = riskPerPoint > 0 ? (riskAmount / riskPerPoint) : 0;

      modal.querySelector(".rc-value").textContent = positionSize > 0
        ? `${positionSize.toFixed(4)} units`
        : "—";
      modal.querySelector(".rc-risk-amount").textContent = riskAmount > 0
        ? `$${riskAmount.toFixed(2)} at risk`
        : "";
    };

    modal.querySelector(".rc-balance").addEventListener("input", calc);
    modal.querySelector(".rc-risk").addEventListener("input", calc);

    // Close on X or clicking backdrop
    modal.querySelector(".risk-calc-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    setTimeout(calc, 0);
  }

  function createSignalCalcButton(entry, sl) {
    const btn = document.createElement("button");
    btn.className = "signal-calc-btn";
    btn.innerHTML = `
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      Calculate Position Size
    `;
    btn.addEventListener("click", () => openRiskCalculator(entry, sl));
    return btn;
  }

  // ---- Message Rendering ----

  function addMessage(type, text, imageUrl) {
    const el = document.createElement("div");
    el.className = `msg msg-${type}`;

    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.className = "msg-image";
      el.appendChild(img);
    }

    if (text) {
      const textEl = document.createElement("div");
      textEl.innerHTML = formatResponse(text);
      el.appendChild(textEl);
    }

    // Upgrade 4: Risk Calculator — show "Calculate Position Size" button on signals
    if (type === "ai" && text) {
      const entryMatch = text.match(/\*\*ENTRY:\*\*\s*([\d,.]+)/);
      const slMatch = text.match(/\*\*STOP LOSS:\*\*\s*([\d,.]+)/);
      if (entryMatch && slMatch) {
        const entry = parseFloat(entryMatch[1].replace(/,/g, ""));
        const sl = parseFloat(slMatch[1].replace(/,/g, ""));
        if (!isNaN(entry) && !isNaN(sl) && entry !== sl) {
          el.appendChild(createSignalCalcButton(entry, sl));
        }
      }
    }

    // Add action buttons on AI messages
    if (type === "ai" && text) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";

      // Audio button
      const audioBtn = document.createElement("button");
      audioBtn.className = "msg-action-btn";
      audioBtn.title = "Read aloud";
      audioBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
      audioBtn.addEventListener("click", () => toggleSpeak(text, audioBtn));
      actions.appendChild(audioBtn);

      // Copy button
      const copyBtn = document.createElement("button");
      copyBtn.className = "msg-action-btn";
      copyBtn.title = "Copy";
      copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      copyBtn.addEventListener("click", () => {
        copyText(text);
        copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 1500);
      });
      actions.appendChild(copyBtn);

      el.appendChild(actions);
    }

    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function addSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "msg msg-ai";
    el.style.opacity = "0.6";
    el.style.fontSize = "0.72rem";
    el.textContent = text;
    chatMessages.appendChild(el);
    scrollToBottom();
  }

  function addLoadingIndicator() {
    const el = document.createElement("div");
    el.className = "msg msg-ai msg-loading";
    el.innerHTML = "<span></span><span></span><span></span>";
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
  }

  function clearWelcome() {
    const welcome = chatMessages.querySelector(".welcome-section");
    if (welcome) welcome.remove();
    const sug = chatMessages.querySelector(".suggestions");
    if (sug) sug.remove();
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ---- Response Formatter ----

  function formatResponse(text) {
    // Strip any tool call / function call markup the LLM may hallucinate
    let clean = text
      .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "")
      .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
      .replace(/<\|.*?\|>/g, "")
      .trim();

    return clean
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^>\s*(.+)$/gm, '<div class="signal-line">$1</div>')
      .replace(/\n/g, "<br/>");
  }

  // ---- Start ----

  init();
})();

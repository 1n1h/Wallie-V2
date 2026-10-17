import "./SettingsModal.css";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Blocks,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  HelpCircle,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  Scale,
  Search,
  Shield,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { VOICE_OPTIONS } from "../../config/tts";
import wallieMark from "../../assets/wallie-mark.png";

// Settings as a pop-out, Muse-style: hazy backdrop, rounded box,
// tab rail on the left, one pane per tab. Mounted once at app level;
// anything can open it with a wallie:open-settings event.

const TABS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "connectors", label: "Connectors", icon: Blocks },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "messaging", label: "Messaging channels", icon: MessageCircle },
  { id: "memory", label: "Memory", icon: Lock },
  { id: "help", label: "Help & support", icon: HelpCircle },
  { id: "legal", label: "Legal info", icon: Scale },
];

const LEGACY_SECTION_TAB = {
  plan: "general",
  appearance: "general",
  connections: "connectors",
  permissions: "memory",
  account: "memory",
};

const ACCENTS = [
  { name: "Wallie blue", value: "#006CED" },
  { name: "Sky", value: "#0A84FF" },
  { name: "Violet", value: "#7D6FE8" },
  { name: "Pink", value: "#E86FA8" },
  { name: "Peach", value: "#F0A35E" },
  { name: "Mint", value: "#5DA271" },
  { name: "Sand", value: "#B8A88F" },
  { name: "Charcoal", value: "#3A352F" },
];

const FEATURED = [
  { name: "TradingView", sub: "Charts, watchlists and alerts", icon: TrendingUp, tile: "#2E7FE8" },
  { name: "MetaTrader", sub: "Read-only MT4 / MT5 account sync", icon: Monitor, tile: "#5EA0F0" },
  { name: "FTMO", sub: "Prop-firm challenge and account stats", icon: Trophy, tile: "#F0A35E" },
];

const CONNECTOR_GROUPS = [
  {
    title: "Brokers",
    items: [
      { name: "Interactive Brokers", sub: "Stocks, options and futures" },
      { name: "Fidelity", sub: "Brokerage and retirement accounts" },
      { name: "Charles Schwab", sub: "Brokerage and banking" },
      { name: "E*TRADE", sub: "Stocks and options" },
      { name: "tastytrade", sub: "Options and futures" },
    ],
  },
  {
    title: "Trading Desk",
    items: [
      { name: "MT4", sub: "MetaTrader 4 terminal" },
      { name: "MT5", sub: "MetaTrader 5 terminal" },
      { name: "Polymarket", sub: "Prediction markets" },
      { name: "Kalshi", sub: "Event contracts" },
      { name: "Tradelocker", sub: "Trading platform and charts" },
    ],
  },
  {
    title: "Crypto",
    items: [
      { name: "Crypto.com", sub: "Exchange and wallet" },
      { name: "Robinhood", sub: "Stocks and crypto" },
      { name: "Webull", sub: "Stocks and crypto" },
      { name: "Dex Screener", sub: "On-chain pair data" },
      { name: "Kraken", sub: "Crypto exchange" },
    ],
  },
];

const CHANNELS = [
  { name: "WhatsApp", sub: "Market alerts and your morning brief", color: "#25D366" },
  { name: "Slack", sub: "Share Wallie with your trading group", color: "#8A5BA6" },
  { name: "Signal", sub: "Private, encrypted alerts", color: "#3A76F0" },
  { name: "Telegram", sub: "Alerts in your Telegram chats", color: "#229ED9" },
  { name: "Discord", sub: "Alerts in your server", color: "#5865F2" },
];

const IMPORT_PROMPT = `You are helping me migrate context from one AI assistant to Wallie, an AI trading assistant that coaches me to be a better trader. Your job is to compile, from our past conversations, a portable memory snapshot of what you reliably know about me as a trader and as a person. The output is going verbatim into a new AI's memory, so quality matters more than completeness.

OUTPUT RULES
- Output a single Markdown block using the section headers below. Omit any section you have nothing solid for — do not invent placeholders.
- Refer to me in the third person ("the user", "they") inside each bullet.
- One factual sentence per bullet. No transitions, no narrative.
- Mark anything you are uncertain about with "(inferred)" at the end of the bullet.
- Skip one-off statements unless they were clearly important.
- Skip sensitive information (health conditions, financial details, mental health) unless I explicitly asked you to remember it.
- Hard cap: 2000 words.

SECTIONS
## Identity
Name, pronouns, age range, current city / country, time zone, languages spoken.
## Trading profile
Years trading, markets traded (forex, stocks, crypto, futures, indices), broker and platforms, trading style (scalp / day / swing), usual session times, instruments watched most, risk rules and position sizing habits, trade stack and tools used daily in my trading journey if known.
## Goals & projects
Trading goals, active personal or professional projects I have asked you to help with — state, goal, constraints.
## Communication preferences
Tone I want (casual / formal, blunt / warm), preferred response length, output format preferences (Markdown, plain text, code blocks), things I have asked you to avoid.
## Recurring people
Partner, children, close family, friends, colleagues I mention regularly. First name + relationship + any salient detail.
## Health & dietary
Allergies, dietary restrictions, accessibility needs. Only include things I have stated myself.
## Interests & hobbies
Topics I keep returning to. Sports, music, games, reading taste.
## Working style & values
How I make decisions, what motivates me, what frustrates me. Things I have explicitly asked you to do or not do.
## Tools & environment
Devices, operating systems, apps, services, languages, frameworks I use regularly.
## Anything else durable
Anything important that does not fit above and is unlikely to change in the next year.`;

const initialsOf = (name) =>
  (name || "?")
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const resolveMode = (mode) =>
  mode === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : mode;

const SettingsModal = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("general");
  const [userData, setUserData] = useState(null);

  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem("wallie_theme_mode") || "dark",
  );
  const [themeResolved, setThemeResolved] = useState(
    () => document.documentElement.getAttribute("data-theme") || "dark",
  );
  const [accent, setAccent] = useState(() => localStorage.getItem("wallie_accent") || "#006CED");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("wallie_font_size") || "medium");
  const [lang, setLang] = useState(() => localStorage.getItem("wallie_lang") || "English");
  const [langOpen, setLangOpen] = useState(false);

  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceId, setVoiceId] = useState("am_adam");
  const [persona, setPersona] = useState("");
  const [personaState, setPersonaState] = useState("");

  const [connQuery, setConnQuery] = useState("");
  const [connTab, setConnTab] = useState("available");
  const [soon, setSoon] = useState({});
  const [walletNote, setWalletNote] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importState, setImportState] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Keep the resolved theme in sync with <html data-theme> (the rail
  // toggle and other writers change it too).
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setThemeResolved(el.getAttribute("data-theme") || "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // Apply saved accent + font size on first mount (this component is
  // mounted app-wide, so preferences take effect on every page).
  useEffect(() => {
    const a = localStorage.getItem("wallie_accent");
    if (a) document.documentElement.style.setProperty("--wallie-accent", a);
    const f = localStorage.getItem("wallie_font_size");
    if (f) document.documentElement.setAttribute("data-font-size", f);
  }, []);

  // Follow the OS while in system mode.
  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () =>
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [themeMode]);

  useEffect(() => {
    const handler = (e) => {
      const t = e.detail?.tab || LEGACY_SECTION_TAB[e.detail?.section] || "general";
      setTab(t);
      setClearConfirm(false);
      setDeleteConfirm(false);
      setOpen(true);
    };
    window.addEventListener("wallie:open-settings", handler);
    return () => window.removeEventListener("wallie:open-settings", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  // Load the account doc whenever the pop-out opens.
  useEffect(() => {
    if (!open || !user) return;
    let live = true;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (!live || !snap.exists()) return;
        const d = snap.data();
        setUserData(d);
        const s = d.settings || {};
        if (s.userPersona) setPersona(s.userPersona);
        if (s.ttsEnabled !== undefined) setTtsEnabled(s.ttsEnabled);
        if (s.voiceId) setVoiceId(s.voiceId);
        if (s.fontSize) setFontSize(s.fontSize);
        if (s.themeMode) setThemeMode(s.themeMode);
        if (s.accent) {
          setAccent(s.accent);
          document.documentElement.style.setProperty("--wallie-accent", s.accent);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, user]);

  const saveSetting = (patch) => {
    if (!user) return;
    updateDoc(doc(db, "users", user.uid), patch).catch(() => {});
  };

  const applyThemeMode = (mode) => {
    setThemeMode(mode);
    const resolved = resolveMode(mode);
    document.documentElement.setAttribute("data-theme", resolved);
    try {
      localStorage.setItem("wallie_theme_mode", mode);
    } catch {
      /* ignore */
    }
    saveSetting({ "settings.theme": resolved, "settings.themeMode": mode });
  };

  const applyAccent = (value) => {
    setAccent(value);
    document.documentElement.style.setProperty("--wallie-accent", value);
    try {
      localStorage.setItem("wallie_accent", value);
    } catch {
      /* ignore */
    }
    saveSetting({ "settings.accent": value });
  };

  const applyFontSize = (size) => {
    setFontSize(size);
    document.documentElement.setAttribute("data-font-size", size);
    try {
      localStorage.setItem("wallie_font_size", size);
    } catch {
      /* ignore */
    }
    saveSetting({ "settings.fontSize": size });
  };

  const applyLang = (value) => {
    setLang(value);
    setLangOpen(false);
    try {
      localStorage.setItem("wallie_lang", value);
    } catch {
      /* ignore */
    }
  };

  const savePersona = () => {
    saveSetting({ "settings.userPersona": persona });
    setPersonaState("Saved");
    setTimeout(() => setPersonaState(""), 1800);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/");
  };

  const handleClearChats = async () => {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), { savedChats: [] }).catch(() => {});
    setClearConfirm(false);
  };

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
      await deleteDoc(doc(db, "users", `${user.uid}.soul`)).catch(() => {});
      await deleteDoc(doc(db, "users", `${user.uid}.connections`)).catch(() => {});
    } catch {
      /* best effort — local data is cleared regardless */
    }
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("wallie_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* storage unavailable */
    }
    setDeleting(false);
    setOpen(false);
    await logout();
    navigate("/");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
    } catch {
      /* clipboard unavailable */
    }
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const doImport = async () => {
    const text = importText.trim();
    if (!text || !user) return;
    setImportState("Saving…");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        soul: text,
        importedMemory: text,
        importedAt: Date.now(),
      });
      setImportState("Imported — Wallie will use this memory from now on.");
      setImportText("");
    } catch {
      setImportState("Couldn't save that — try again.");
    }
  };

  const downloadMemory = () => {
    const d = userData || {};
    const s = d.settings || {};
    const lines = [
      "# Wallie memory export",
      "",
      "Exported " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      "",
      "## Profile",
      "- Name: " + (user?.displayName || "—"),
      "- Email: " + (user?.email || "—"),
      "",
      "## Trading profile",
      s.userPersona || "—",
      "",
      "## What Wallie remembers",
      d.soul || d.importedMemory || "—",
      "",
      "## Plan and referrals",
      "- Plan: Free",
      "- Friends joined: " + ((d.referrals && d.referrals.joined) || 0),
      "- Rewards banked: " + ((d.referrals && d.referrals.coupons) || 0),
      "",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallie-memory.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const markSoon = (name) => setSoon((prev) => ({ ...prev, [name]: true }));

  const ConnectBtn = ({ name }) =>
    soon[name] ? (
      <span className="set-soon-tag">Coming soon</span>
    ) : (
      <button className="set-connect-btn" onClick={() => markSoon(name)}>
        Connect
      </button>
    );

  if (!open) return null;

  const q = connQuery.trim().toLowerCase();
  const match = (name) => !q || name.toLowerCase().includes(q);
  const joined = (userData?.referrals && userData.referrals.joined) || 0;
  const coupons = (userData?.referrals && userData.referrals.coupons) || 0;
  const profileName = user?.displayName || (user?.email ? user.email.split("@")[0] : "Account");

  return createPortal(
    <div className="set-backdrop" onClick={() => setOpen(false)}>
      <div className="set-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <nav className="set-rail">
          <div className="set-rail-title">Settings</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`set-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} strokeWidth={1.9} />
              <span>{t.label}</span>
            </button>
          ))}
          <div className="set-rail-spacer" />
          <button className="set-tab" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.9} />
            <span>Log out</span>
          </button>
        </nav>

        <div className="set-main">
          <button className="set-close" onClick={() => setOpen(false)} aria-label="Close settings">
            <X size={17} />
          </button>

          {tab === "general" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">General</h2>

              <div className="set-card set-profile-card">
                {user?.photoURL ? (
                  <img className="set-avatar" src={user.photoURL} alt="" />
                ) : (
                  <span className="set-avatar set-avatar-initials">{initialsOf(profileName)}</span>
                )}
                <div className="set-profile-text">
                  <strong>{profileName}</strong>
                  <span>{user?.email || ""}</span>
                </div>
              </div>

              <div className="set-label">Subscription</div>
              <div className="set-card">
                <div className="set-row">
                  <div className="set-row-text">
                    <strong>Your Plan</strong>
                    <span>Free plan — everything is open while we build.</span>
                  </div>
                  <span className="set-row-side">Free</span>
                </div>
                <div className="set-div" />
                <div className="set-row">
                  <div className="set-row-text">
                    <strong>Referrals</strong>
                    <span>You and each friend get 20% off the first month of Pro.</span>
                  </div>
                  <span className="set-row-side">
                    {joined} joined · {coupons} banked
                  </span>
                </div>
                <div className="set-row set-row-actions">
                  <button
                    className="set-link"
                    onClick={() => {
                      setOpen(false);
                      navigate("/pricing");
                    }}
                  >
                    Manage subscription
                  </button>
                  <button
                    className="set-link"
                    onClick={() => {
                      setOpen(false);
                      navigate("/chat");
                      setTimeout(
                        () => window.dispatchEvent(new CustomEvent("wallie:open-invite")),
                        400,
                      );
                    }}
                  >
                    Invite friends
                  </button>
                </div>
              </div>

              <div className="set-card">
                <button className="set-row set-row-btn" onClick={() => setLangOpen((o) => !o)}>
                  <span className="set-row-name">Language</span>
                  <span className="set-row-side">
                    {lang} <ChevronRight size={16} />
                  </span>
                </button>
                {langOpen && (
                  <div className="set-lang-list">
                    {["English", "Español", "Português"].map((l) => (
                      <button
                        key={l}
                        className={`set-lang-item ${lang === l ? "active" : ""}`}
                        onClick={() => applyLang(l)}
                      >
                        {l}
                        {lang === l && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="set-label">Appearance</div>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-name">Mode</span>
                  <div className="set-seg set-seg-icons">
                    <button
                      className={themeMode === "light" ? "active" : ""}
                      onClick={() => applyThemeMode("light")}
                      aria-label="Light mode"
                    >
                      <Sun size={16} />
                    </button>
                    <button
                      className={themeMode === "dark" ? "active" : ""}
                      onClick={() => applyThemeMode("dark")}
                      aria-label="Dark mode"
                    >
                      <Moon size={16} />
                    </button>
                    <button
                      className={themeMode === "system" ? "active" : ""}
                      onClick={() => applyThemeMode("system")}
                      aria-label="System mode"
                    >
                      <Monitor size={16} />
                    </button>
                  </div>
                </div>
                <div className="set-div" />
                <div className="set-row">
                  <span className="set-row-name">Theme color</span>
                  <div className="set-swatches">
                    <button
                      className={`set-swatch set-swatch-photo ${accent === "photo" ? "active" : ""}`}
                      onClick={() => applyAccent("#006CED")}
                      aria-label="Default color"
                    >
                      <img src={wallieMark} alt="" />
                    </button>
                    {ACCENTS.map((a) => (
                      <button
                        key={a.value}
                        className={`set-swatch ${accent === a.value ? "active" : ""}`}
                        style={{ background: a.value }}
                        onClick={() => applyAccent(a.value)}
                        aria-label={a.name}
                      >
                        {accent === a.value && <Check size={13} color="#fff" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-div" />
                <div className="set-row">
                  <span className="set-row-name">Font size</span>
                  <div className="set-seg">
                    {["small", "medium", "large"].map((s) => (
                      <button
                        key={s}
                        className={fontSize === s ? "active" : ""}
                        onClick={() => applyFontSize(s)}
                      >
                        {s[0].toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="set-label">Voice</div>
              <div className="set-card">
                <div className="set-row">
                  <span className="set-row-name">Text-to-Speech</span>
                  <div className="set-seg">
                    <button
                      className={ttsEnabled ? "active" : ""}
                      onClick={() => {
                        setTtsEnabled(true);
                        saveSetting({ "settings.ttsEnabled": true });
                      }}
                    >
                      On
                    </button>
                    <button
                      className={!ttsEnabled ? "active" : ""}
                      onClick={() => {
                        setTtsEnabled(false);
                        saveSetting({ "settings.ttsEnabled": false });
                      }}
                    >
                      Off
                    </button>
                  </div>
                </div>
                {ttsEnabled && (
                  <div className="set-voice-grid">
                    {VOICE_OPTIONS.map((v) => (
                      <button
                        key={v.id}
                        className={`set-voice ${voiceId === v.id ? "active" : ""}`}
                        onClick={() => {
                          setVoiceId(v.id);
                          saveSetting({ "settings.voiceId": v.id });
                        }}
                      >
                        <span>{v.name}</span>
                        <small>{v.desc}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "connectors" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Connectors</h2>
              <div className="set-search">
                <Search size={16} />
                <input
                  value={connQuery}
                  onChange={(e) => setConnQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search connectors"
                />
              </div>
              <div className="set-seg set-seg-wide">
                <button className={connTab === "available" ? "active" : ""} onClick={() => setConnTab("available")}>
                  Available
                </button>
                <button className={connTab === "connected" ? "active" : ""} onClick={() => setConnTab("connected")}>
                  Connected
                </button>
              </div>

              {connTab === "connected" ? (
                <p className="set-empty-note">Nothing connected yet — connections are rolling out soon.</p>
              ) : (
                <>
                  <div className="set-label">Featured</div>
                  <div className="set-featured">
                    {FEATURED.filter((f) => match(f.name)).map((f) => (
                      <div key={f.name} className="set-feature-card">
                        <span className="set-feature-tile" style={{ background: f.tile }}>
                          <f.icon size={19} color="#fff" />
                        </span>
                        <strong>{f.name}</strong>
                        <span>{f.sub}</span>
                        <ConnectBtn name={f.name} />
                      </div>
                    ))}
                  </div>

                  {CONNECTOR_GROUPS.map((g) => {
                    const items = g.items.filter((i) => match(i.name));
                    if (items.length === 0) return null;
                    return (
                      <div key={g.title}>
                        <div className="set-label">{g.title}</div>
                        <div className="set-card set-list-card">
                          {items.map((i, idx) => (
                            <div key={i.name}>
                              {idx > 0 && <div className="set-div" />}
                              <div className="set-row">
                                <span className="set-letter-tile">{initialsOf(i.name)}</span>
                                <div className="set-row-text">
                                  <strong>{i.name}</strong>
                                  <span>{i.sub}</span>
                                </div>
                                <ConnectBtn name={i.name} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <div className="set-label">Custom</div>
                  <div className="set-card">
                    <div className="set-row">
                      <div className="set-row-text">
                        <strong>Custom connector</strong>
                        <span>Add your own tools and data sources with MCP.</span>
                      </div>
                      <ConnectBtn name="__mcp" />
                    </div>
                  </div>

                  <p className="set-disclaimer">
                    Wallie AI has read-only access to your connectors. It can view your accounts
                    and data to coach you — it can never place trades, move money, or change
                    anything on a connected account.
                  </p>
                </>
              )}
            </div>
          )}

          {tab === "wallet" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Wallet</h2>
              <p className="set-intro">
                This is the card on file we'll bill after your free trial is over. It's only for
                your Wallie subscription — Wallie never uses it to shop or to trade.
              </p>
              <div className="set-label">Payment methods</div>
              <div className="set-card set-list-card">
                <div className="set-row">
                  <span className="set-letter-tile">
                    <Link2 size={16} />
                  </span>
                  <div className="set-row-text">
                    <strong>Link</strong>
                    <span>One-click payments with Link by Stripe</span>
                  </div>
                  <button className="set-connect-btn" onClick={() => setWalletNote("link")}>
                    Add
                  </button>
                </div>
                <div className="set-div" />
                <div className="set-row">
                  <span className="set-letter-tile">
                    <CreditCard size={16} />
                  </span>
                  <div className="set-row-text">
                    <strong>Stripe</strong>
                    <span>Pay by card through Stripe</span>
                  </div>
                  <button className="set-connect-btn" onClick={() => setWalletNote("stripe")}>
                    Add
                  </button>
                </div>
              </div>
              {walletNote && (
                <p className="set-empty-note">
                  Card setup opens when your Pro trial starts — we'll ask for it then, never
                  before.
                </p>
              )}
            </div>
          )}

          {tab === "messaging" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Messaging channels</h2>
              <p className="set-intro">
                Get Wallie's alerts and briefs where you already talk. Pick a channel to connect
                it.
              </p>
              <div className="set-card set-list-card">
                {CHANNELS.map((c, idx) => (
                  <div key={c.name}>
                    {idx > 0 && <div className="set-div" />}
                    <div className="set-row">
                      <span
                        className="set-letter-tile"
                        style={{ background: c.color + "24", color: c.color }}
                      >
                        {initialsOf(c.name)}
                      </span>
                      <div className="set-row-text">
                        <strong>{c.name}</strong>
                        <span>{c.sub}</span>
                      </div>
                      <ConnectBtn name={c.name} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "memory" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Memory</h2>

              <div className="set-card set-privacy-card">
                <Shield size={19} />
                <div className="set-row-text">
                  <strong>Your memory stays yours</strong>
                  <span>
                    What Wallie remembers lives on your account and is only used to personalize
                    your answers.{" "}
                    <button
                      className="set-link"
                      onClick={() => window.open("https://www.wallieai.com/policy/privacy", "_blank")}
                    >
                      Learn more
                    </button>
                  </span>
                </div>
              </div>

              <div className="set-label">Your trading profile</div>
              <div className="set-card">
                <p className="set-card-note">
                  Tell Wallie about yourself so it can tailor answers to your trading style. This
                  is saved to your account and included in every conversation.
                </p>
                <textarea
                  className="set-textarea"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="e.g. I trade forex and crypto. I'm a beginner with 6 months of experience focusing on swing trades. I want to learn more about risk management and reading price action."
                  rows={4}
                  maxLength={500}
                />
                <div className="set-row set-row-actions">
                  <span className="set-char-count">{persona.length}/500</span>
                  <button className="set-save-btn" onClick={savePersona}>
                    {personaState || "Save profile"}
                  </button>
                </div>
              </div>

              <div className="set-label">Move your memory</div>
              <div className="set-card set-list-card">
                <button className="set-row set-row-btn" onClick={() => setImportOpen((o) => !o)}>
                  <span className="set-row-name">Import memory</span>
                  <ChevronRight size={16} className={importOpen ? "set-chev-open" : ""} />
                </button>
                {importOpen && (
                  <div className="set-import">
                    <p className="set-card-note">
                      Copy this prompt into your current AI, then paste what it gives you back
                      here. It becomes part of what Wallie remembers about you — importing
                      replaces your current imported memory.
                    </p>
                    <pre className="set-prompt">{IMPORT_PROMPT}</pre>
                    <button className="set-save-btn" onClick={copyPrompt}>
                      {promptCopied ? (
                        <>
                          <Check size={15} /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={15} /> Copy prompt
                        </>
                      )}
                    </button>
                    <textarea
                      className="set-textarea"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Paste the output from your other AI here…"
                      rows={5}
                    />
                    <div className="set-row set-row-actions">
                      <span className="set-import-state">{importState}</span>
                      <button className="set-save-btn" onClick={doImport} disabled={!importText.trim()}>
                        Import &amp; replace
                      </button>
                    </div>
                  </div>
                )}
                <div className="set-div" />
                <button className="set-row set-row-btn" onClick={downloadMemory}>
                  <span className="set-row-name">Download agent memory</span>
                  <Download size={16} />
                </button>
              </div>

              <div className="set-label">Danger zone</div>
              <div className="set-card">
                {!clearConfirm ? (
                  <button className="set-danger-btn" onClick={() => setClearConfirm(true)}>
                    Clear all chats
                  </button>
                ) : (
                  <div className="set-confirm-row">
                    <span>Clear every saved chat? This can't be undone.</span>
                    <button className="set-cancel-btn" onClick={() => setClearConfirm(false)}>
                      Keep them
                    </button>
                    <button className="set-confirm-btn" onClick={handleClearChats}>
                      Yes, clear
                    </button>
                  </div>
                )}
                <div className="set-div" />
                {!deleteConfirm ? (
                  <button className="set-danger-btn" onClick={() => setDeleteConfirm(true)}>
                    Delete my data
                  </button>
                ) : (
                  <div className="set-confirm-row">
                    <span>
                      Delete your Wallie data? This removes your profile, memory and preferences,
                      clears this device, and signs you out.
                    </span>
                    <button className="set-cancel-btn" onClick={() => setDeleteConfirm(false)}>
                      Keep my data
                    </button>
                    <button className="set-confirm-btn" onClick={handleDelete} disabled={deleting}>
                      {deleting ? "Deleting…" : "Yes, delete it"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "help" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Help &amp; support</h2>
              <div className="set-card set-list-card">
                {[
                  { name: "FAQ", sub: "Answers to common questions" },
                  { name: "Submit feedback", sub: "Tell us what would make Wallie better" },
                  { name: "Report an issue", sub: "Something broken? Let us know" },
                ].map((r, idx) => (
                  <div key={r.name}>
                    {idx > 0 && <div className="set-div" />}
                    <button
                      className="set-row set-row-btn"
                      onClick={() => {
                        setOpen(false);
                        navigate("/support");
                      }}
                    >
                      <span className="set-row-text">
                        <strong>{r.name}</strong>
                        <span>{r.sub}</span>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "legal" && (
            <div className="set-scroll">
              <h2 className="set-pane-title">Legal info</h2>
              <div className="set-card set-list-card">
                <button
                  className="set-row set-row-btn"
                  onClick={() => window.open("https://www.wallieai.com/policy/privacy", "_blank")}
                >
                  <span className="set-row-name">Privacy Policy</span>
                  <ExternalLink size={15} />
                </button>
                <div className="set-div" />
                <button
                  className="set-row set-row-btn"
                  onClick={() => window.open("https://www.wallieai.com/policy/terms", "_blank")}
                >
                  <span className="set-row-name">Terms of Service</span>
                  <ExternalLink size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SettingsModal;

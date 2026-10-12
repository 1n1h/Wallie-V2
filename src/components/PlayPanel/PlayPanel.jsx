import "./PlayPanel.css";
import { useContext, useEffect, useRef, useState } from "react";
import { Context } from "../../context/Context";
import { Pencil, List, ShieldCheck, History, Fingerprint, Heart } from "lucide-react";
import wallieLogo from "../../assets/wallie-mark.png";
import SoulCard from "../Soul/SoulCard";
import ConnectCard from "../Connect/ConnectCard";
import HeatMap from "../ui/heat-map";
import WatchCard from "./WatchCard";

const ROUTINE = [
  "Check the market heat map",
  "Scan today's economic calendar",
  "Daily chart — draw the trend",
  "1-hour chart — mark support & resistance",
  "15-minute — find supply & demand zones",
  "5-minute — build the trade plan",
];

const WATCHLIST_DEFAULT = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF" },
  { symbol: "GOLD", name: "Gold" },
  { symbol: "US30", name: "Dow Jones" },
];

const QUICK_PROMPTS = [
  "Teach me technical analysis like I'm a beginner",
  "Explain support and resistance with an example",
  "What's the overall market mood today?",
  "Quiz me on risk management",
];

const LESSONS = [
  {
    title: "Confluence beats hunches",
    body: "One level is a guess. Two independent levels landing in the same zone is a plan. Wait for agreement before you get excited.",
  },
  {
    title: "Risk first, always",
    body: "Decide what a trade can cost you before you think about what it can make you. Size the position so a loss is a lesson, not a disaster.",
  },
  {
    title: "Trend is the context",
    body: "A perfect setup against the bigger trend is a fight you don't need. Read the daily chart before the 5-minute one — order matters.",
  },
  {
    title: "Levels are zones, not lines",
    body: "Price respects areas, not laser beams. Draw zones with some width and you'll stop wondering why price 'broke' your line by two points.",
  },
  {
    title: "Journal everything",
    body: "The traders who last are the ones who review. Log the plan, the entry, the exit, and how you felt. Patterns in you matter as much as patterns on the chart.",
  },
  {
    title: "Patience is a position",
    body: "Cash is a trade too. The market pays people who wait for their setup, and charges everyone who chases.",
  },
  {
    title: "Plan the exit first",
    body: "Before any entry: where are you wrong, and where do you take profit? If you can't answer both, you're not ready to enter.",
  },
];

// The four panel tabs, Muse-style: Activity reads the news,
// Approvals holds the charts, Upcoming is the watchlist, and
// Identity is Wallie's profile, soul and connections.
const TABS = [
  { id: "activity", label: "Activity", Icon: List },
  { id: "approvals", label: "Charts", Icon: ShieldCheck },
  { id: "upcoming", label: "Watchlist", Icon: History },
  { id: "identity", label: "Identity", Icon: Fingerprint },
];

const TILES = [
  { id: "soul", name: "SOUL", sub: "ACCESS WITH CARE" },
  { id: "memory", name: "MEMORY", sub: "ACCESS WITH CARE" },
  { id: "identity", name: "IDENTITY", sub: "ACCESS WITH CARE" },
  { id: "persona", name: "PERSONA", sub: "ACCESS WITH CARE" },
];

const PlayPanel = ({ onCollapse, mobileSection }) => {
  const { onSent } = useContext(Context);
  const [done, setDone] = useState(() => ROUTINE.map(() => false));
  const [tab, setTab] = useState("activity");

  // Mobile: the bottom tab bar drives which section shows, full-screen
  useEffect(() => {
    if (mobileSection) setTab(mobileSection);
  }, [mobileSection]);
  const soulAnchorRef = useRef(null);

  const toggleStep = (i) =>
    setDone((d) => d.map((v, idx) => (idx === i ? !v : v)));
  const doneCount = done.filter(Boolean).length;

  // Watchlist — user-editable, saved on this device
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("wallie_watchlist"));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {
      /* fall through to defaults */
    }
    return WATCHLIST_DEFAULT;
  });
  const [newSymbol, setNewSymbol] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem("wallie_watchlist", JSON.stringify(watchlist));
    } catch {
      /* storage unavailable */
    }
  }, [watchlist]);
  const addSymbol = () => {
    const s = newSymbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.]/g, "")
      .slice(0, 10);
    setNewSymbol("");
    if (!s || watchlist.some((w) => w.symbol === s)) return;
    setWatchlist((list) => [...list, { symbol: s, name: s }]);
  };
  const removeSymbol = (s) =>
    setWatchlist((list) => list.filter((w) => w.symbol !== s));

  // Chart-read action chips in the chat can add a symbol — merge it into
  // the live list (the save effect above persists it).
  useEffect(() => {
    const onAdd = (e) => {
      const s = e?.detail?.symbol;
      if (!s) return;
      setWatchlist((list) =>
        list.some((w) => w.symbol === s) ? list : [...list, { symbol: s, name: s }]
      );
    };
    window.addEventListener("wallie:watchlist-add", onAdd);
    return () => window.removeEventListener("wallie:watchlist-add", onAdd);
  }, []);

  // Editable profile picture (saved on this device)
  const [avatar, setAvatar] = useState(() => {
    try {
      return localStorage.getItem("wallie_avatar") || null;
    } catch {
      return null;
    }
  });
  const avatarInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const url = canvas.toDataURL("image/jpeg", 0.85);
        setAvatar(url);
        try {
          localStorage.setItem("wallie_avatar", url);
        } catch {}
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const resetAvatar = () => {
    setAvatar(null);
    try {
      localStorage.removeItem("wallie_avatar");
    } catch {}
  };

  const lesson =
    LESSONS[
      Math.floor(Date.now() / 86400000) % LESSONS.length
    ];

  const askAbout = (symbol, name) =>
    onSent(
      `Give me a quick educational breakdown of ${name} (${symbol}): the current trend, the key levels to watch, and one thing a beginner should learn from this chart.`
    );

  const today = new Date();
  const tileDate = `${String(today.getMonth() + 1).padStart(2, "0")}.${String(
    today.getDate()
  ).padStart(2, "0")}.${String(today.getFullYear()).slice(2)}`;

  const jumpToSoul = () =>
    soulAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <aside className={`pp${mobileSection ? " pp-mobile-open" : ""}`}>
      {/* Fixed header — presence + tab bar. Never scrolls. */}
      <div className="pp-fixed">
        {onCollapse && (
          <button
            className="pp-collapse-btn"
            onClick={onCollapse}
            title="Hide panel"
            aria-label="Hide panel"
          >
            »
          </button>
        )}
        <div className="pp-profile">
          <div
            className="pp-avatar"
            onClick={() => avatarInputRef.current?.click()}
            onDoubleClick={resetAvatar}
            title="Click to change picture · Double-click to reset"
          >
            <img
              src={avatar || wallieLogo}
              alt="Wallie"
              className={avatar ? "pp-avatar-custom" : ""}
            />
            <button
              className="pp-avatar-edit"
              onClick={(e) => {
                e.stopPropagation();
                avatarInputRef.current?.click();
              }}
              aria-label="Change Wallie picture"
            >
              <Pencil size={12} strokeWidth={2.2} />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
          </div>
          <span className="pp-name">Wallie</span>
          <span className="pp-status">
            <span className="pp-dot" /> Watching the markets
          </span>
        </div>

        <div className="pp-tabs" role="tablist" aria-label="Panel sections">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              title={label}
              className={`pp-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={19} strokeWidth={1.9} />
            </button>
          ))}
        </div>
      </div>

      {/* Scrolling content — flows under the fixed header. */}
      <div className="pp-scroll">
        {tab === "activity" && (
          <>
            {/* Lesson of the day */}
            <div className="pp-card pp-lesson">
              <span className="pp-lesson-tag">Lesson of the day</span>
              <span className="pp-lesson-title">{lesson.title}</span>
              <p className="pp-lesson-body">{lesson.body}</p>
            </div>

            {/* Quick prompts */}
            <div className="pp-card">
              <div className="pp-card-head">
                <span className="pp-card-title">Learn something</span>
              </div>
              <div className="pp-prompts">
                {QUICK_PROMPTS.map((q) => (
                  <button key={q} className="pp-prompt" onClick={() => onSent(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Level watches + reminders set from chart reads */}
            <WatchCard />
          </>
        )}

        {tab === "approvals" && (
          <>
            {/* Approvals — charts */}
            <div className="pp-card pp-tv-card">
              <div className="pp-card-head">
                <span className="pp-card-title">Market heat map</span>
              </div>
              <HeatMap />
              <p className="pp-card-note">
                Step one of the routine — see where the money is moving
                before you open a chart.
              </p>
            </div>
          </>
        )}

        {tab === "upcoming" && (
          <>
            {/* Upcoming — watchlist */}
            <div className="pp-card">
              <div className="pp-card-head">
                <span className="pp-card-title">Watchlist</span>
              </div>
              <div className="pp-watch">
                {watchlist.map((w) => (
                  <div key={w.symbol} className="pp-watch-row-wrap">
                    <button
                      className="pp-watch-row"
                      onClick={() => askAbout(w.symbol, w.name)}
                    >
                      <span className="pp-watch-sym">{w.symbol}</span>
                      <span className="pp-watch-name">{w.name}</span>
                      <span className="pp-watch-arrow">→</span>
                    </button>
                    <button
                      className="pp-watch-remove"
                      title={`Remove ${w.symbol}`}
                      aria-label={`Remove ${w.symbol} from watchlist`}
                      onClick={() => removeSymbol(w.symbol)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="pp-watch-add">
                <input
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSymbol()}
                  placeholder="Add a symbol — e.g. AAPL"
                  maxLength={10}
                />
                <button onClick={addSymbol}>Add</button>
              </div>
              <p className="pp-card-note">
                Tap a market and Wallie breaks it down in the chat. Your
                list is saved on this device.
              </p>
            </div>

            {/* Pre-session routine */}
            <div className="pp-card">
              <div className="pp-card-head">
                <span className="pp-card-title">Pre-session routine</span>
                <span className="pp-progress">
                  {doneCount}/{ROUTINE.length}
                </span>
              </div>
              <div className="pp-steps">
                {ROUTINE.map((step, i) => (
                  <label
                    key={i}
                    className={`pp-step ${done[i] ? "done" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={done[i]}
                      onChange={() => toggleStep(i)}
                    />
                    <span>{step}</span>
                  </label>
                ))}
              </div>
              <p className="pp-card-note">
                {doneCount === ROUTINE.length
                  ? "Routine complete. Now you get to be patient."
                  : "Work it top-down, every session. No skipping ahead."}
              </p>
            </div>
          </>
        )}

        {tab === "identity" && (
          <>
            {/* Identity — profile summary */}
            <div className="pp-card pp-identity-card">
              <span className="pp-identity-name">Wallie</span>
              <span className="pp-identity-role">
                Your AI trading coach — reads the chart with you and teaches
                as it goes.
              </span>
              <span className="pp-identity-vibe-label">Vibe</span>
              <p className="pp-identity-vibe">
                Patient, plain-spoken, zero hype. Education only — never a
                trade signal, never a guru.
              </p>
              <button className="pp-identity-edit" onClick={jumpToSoul}>
                <Pencil size={13} strokeWidth={2} /> Edit
              </button>
            </div>

            {/* Four white squares — Soul / Memory / Identity / Persona */}
            <div className="pp-tiles">
              {TILES.map((t) => (
                <button key={t.id} className="pp-tile" onClick={jumpToSoul}>
                  <span className="pp-tile-name">{t.name}</span>
                  <span className="pp-tile-sub">{t.sub}</span>
                  <span className="pp-tile-foot">
                    <span className="pp-tile-date">{tileDate}</span>
                    <Heart size={15} strokeWidth={2} className="pp-tile-heart" />
                  </span>
                </button>
              ))}
            </div>

            {/* Soul & Memory — IDENTITY.md / SOUL.md / MEMORY.md */}
            <div ref={soulAnchorRef} className="pp-anchor">
              <SoulCard />
            </div>

            {/* Connect tools — brokers & tools, read-only */}
            <ConnectCard />
          </>
        )}

      </div>
    </aside>
  );
};

export default PlayPanel;

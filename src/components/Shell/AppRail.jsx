import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  Library,
  Lightbulb,
  MessageCircle,
  Monitor,
  Moon,
  Newspaper,
  Search,
  Settings,
  Smartphone,
  Sun,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { Context } from "../../context/Context.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { db } from "../../firebase";
import wallieMark from "../../assets/wallie-mark.png";
import "./AppRail.css";

const APP_STORE_URL = "https://apps.apple.com/us/app/wallie-ai/id6744089470";

const ITEMS = [
  { id: "chat", label: "Chat", icon: MessageCircle, action: "chat" },
  { id: "search", label: "Search", icon: Search, action: "search" },
  { id: "desk", label: "Desk", icon: TrendingUp, to: "/demo" },
  { id: "strategies", label: "Saved Strategies", icon: Lightbulb, to: "/strategies" },
  { id: "feed", label: "Feed", icon: Newspaper, to: "/feed" },
  { id: "education", label: "Education", icon: Library, to: "/education" },
  { id: "community", label: "Community", icon: Users, to: "/community" },
];

function SearchOverlay({ onClose }) {
  const { prevPrompts, loadChat } = useContext(Context);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chats = Array.isArray(prevPrompts) ? prevPrompts : [];
  const q = query.trim().toLowerCase();
  const results = [];
  chats.forEach((chat, index) => {
    if (!q) {
      results.push({ chat, index, snippet: "" });
      return;
    }
    const inTitle = (chat.title || "").toLowerCase().includes(q);
    let snippet = "";
    if (!inTitle && Array.isArray(chat.messages)) {
      const hit = chat.messages.find((m) => (m.message || "").toLowerCase().includes(q));
      if (hit) {
        const text = hit.message || "";
        const at = text.toLowerCase().indexOf(q);
        snippet = (at > 30 ? "…" : "") + text.slice(Math.max(0, at - 30), at + q.length + 60).trim();
      }
    }
    if (inTitle || snippet) results.push({ chat, index, snippet });
  });
  const shown = q ? results.slice(0, 12) : results.slice(0, 6);

  const openChat = (index) => {
    loadChat(index);
    onClose();
    navigate("/chat");
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <Search size={19} className="search-input-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
          <button className="search-close" onClick={onClose} aria-label="Close search">
            <X size={17} />
          </button>
        </div>
        <div className="search-results">
          {!q && <div className="search-section">Recents</div>}
          {shown.length === 0 && (
            <div className="search-empty">{q ? "No chats match that search." : "No saved chats yet."}</div>
          )}
          {shown.map(({ chat, index, snippet }) => (
            <button key={index} className="search-row" onClick={() => openChat(index)}>
              <span className="search-row-icon">
                <MessageCircle size={16} />
              </span>
              <span className="search-row-text">
                <span className="search-row-title">{chat.title || "Chat"}</span>
                {snippet ? <span className="search-row-snippet">{snippet}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DownloadCard({ onClose }) {
  const [macSoon, setMacSoon] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dl-wrap">
      <div className="dl-catcher" onClick={onClose} />
      <div className="dl-card" role="dialog" aria-label="Download the Wallie app">
        <button className="dl-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <div className="dl-visual" aria-hidden="true">
          <img className="dl-shot back" src="/apps/app-desk.jpg" alt="" />
          <img className="dl-shot front" src="/apps/app-chat.jpg" alt="" />
        </div>
        <h3 className="dl-title">Trade with Wallie anywhere</h3>
        <p className="dl-sub">Download Wallie for iOS! Android &amp; Mac Coming soon.</p>
        <button
          className="dl-btn"
          onClick={() => window.open(APP_STORE_URL, "_blank", "noopener")}
        >
          <Smartphone size={18} /> Mobile apps
        </button>
        <button
          className={`dl-btn ${macSoon ? "soon" : ""}`}
          onClick={() => setMacSoon(true)}
          disabled={macSoon}
        >
          <Monitor size={18} /> {macSoon ? "Coming soon" : "Mac app"}
        </button>
      </div>
    </div>
  );
}

export default function AppRail({ active }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);

  // Theme: the attribute on <html> is the source of truth; a
  // MutationObserver keeps this toggle in sync when the theme is
  // changed elsewhere (e.g. the Settings pop-out).
  const [theme, setThemeState] = useState(
    () => document.documentElement.getAttribute("data-theme") || "dark",
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setThemeState(el.getAttribute("data-theme") || "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setThemeState(next);
    if (user) {
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { settings: { theme: next } },
          { merge: true },
        );
      } catch {
        /* theme still applies on this device */
      }
    }
  };

  const path = location.pathname;
  const current =
    active ||
    (path.startsWith("/demo")
      ? "desk"
      : path.startsWith("/strategies")
        ? "strategies"
        : path.startsWith("/feed")
          ? "feed"
          : path.startsWith("/education")
            ? "education"
            : path.startsWith("/community")
              ? "community"
              : path.startsWith("/settings")
                ? "settings"
                : "chat");

  // The chat bubble opens the chat-history column on pages that
  // have one (chat, desk); anywhere else it goes to the chat page.
  const onChatClick = () => {
    if (path.startsWith("/chat") || path.startsWith("/demo")) {
      window.dispatchEvent(new CustomEvent("wallie:toggle-history"));
    } else {
      navigate("/chat");
    }
  };

  return (
    <>
      <nav className="app-rail" aria-label="Wallie sections">
        <div className="rail-mark" title="Wallie">
          <img src={wallieMark} alt="Wallie" />
        </div>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              className={`rail-btn ${isActive ? "active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() =>
                item.action === "search"
                  ? setSearchOpen(true)
                  : item.action === "chat"
                    ? onChatClick()
                    : navigate(item.to)
              }
            >
              <Icon size={21} strokeWidth={isActive ? 2.3 : 2} />
            </button>
          );
        })}
        <div className="rail-spacer" />
        <button
          className="rail-btn"
          title="Download Apps"
          aria-label="Download Apps"
          onClick={() => setDlOpen(true)}
        >
          <Download size={21} strokeWidth={2} />
        </button>
        <button
          className="rail-btn"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={21} strokeWidth={2} /> : <Moon size={21} strokeWidth={2} />}
        </button>
        <button
          className={`rail-btn ${current === "settings" ? "active" : ""}`}
          title="Settings"
          aria-label="Settings"
          onClick={() => navigate("/settings")}
        >
          <Settings size={21} strokeWidth={current === "settings" ? 2.3 : 2} />
        </button>
      </nav>

      {current !== "chat" && (
        <button className="chat-fab" onClick={() => navigate("/chat")} title="Ask Wallie" aria-label="Ask Wallie">
          <img src={wallieMark} alt="" />
        </button>
      )}

      {searchOpen && createPortal(<SearchOverlay onClose={() => setSearchOpen(false)} />, document.body)}
      {dlOpen && createPortal(<DownloadCard onClose={() => setDlOpen(false)} />, document.body)}
    </>
  );
}

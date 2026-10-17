import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Library,
  Lightbulb,
  MessageCircle,
  Newspaper,
  Search,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Context } from "../../context/Context.jsx";
import wallieMark from "../../assets/wallie-mark.png";
import "./AppRail.css";

const ITEMS = [
  { id: "chat", label: "Chat", icon: MessageCircle, to: "/chat" },
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

export default function AppRail({ active }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

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
              onClick={() => (item.action === "search" ? setSearchOpen(true) : navigate(item.to))}
            >
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
            </button>
          );
        })}
        <div className="rail-spacer" />
        <button
          className={`rail-btn ${current === "settings" ? "active" : ""}`}
          title="Settings"
          aria-label="Settings"
          onClick={() => navigate("/settings")}
        >
          <Settings size={21} strokeWidth={current === "settings" ? 2.2 : 1.8} />
        </button>
      </nav>

      {current !== "chat" && (
        <button className="chat-fab" onClick={() => navigate("/chat")} title="Ask Wallie" aria-label="Ask Wallie">
          <img src={wallieMark} alt="" />
        </button>
      )}

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  );
}

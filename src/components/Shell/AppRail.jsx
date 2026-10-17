import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  Library,
  Lightbulb,
  Lock,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  Newspaper,
  Search,
  Settings,
  Smartphone,
  Sparkles,
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
import WalliePanel from "./WalliePanel";
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
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target) &&
        !(menuRef.current && menuRef.current.contains(e.target))
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const profileName = user?.displayName || (user?.email ? user.email.split("@")[0] : "Account");
  const profileInitials = profileName.slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate("/");
  };

  const handleAdmin = () => {
    setProfileOpen(false);
    const pin = prompt("Enter admin PIN:");
    if (pin === import.meta.env.VITE_ADMIN_PIN) {
      sessionStorage.setItem("wallie_admin", "true");
      navigate("/admin/dashboard");
    }
  };

  // The round Wallie button: on the desk it drives the desk's own
  // chat panel (and steps aside while that panel is open); anywhere
  // else it opens the floating Wallie panel right on the page.
  const [panelOpen, setPanelOpen] = useState(false);
  const [deskChatOpen, setDeskChatOpen] = useState(false);

  useEffect(() => {
    const on = () => setDeskChatOpen(true);
    const off = () => setDeskChatOpen(false);
    window.addEventListener("wallie:deskchat-open", on);
    window.addEventListener("wallie:deskchat-close", off);
    return () => {
      window.removeEventListener("wallie:deskchat-open", on);
      window.removeEventListener("wallie:deskchat-close", off);
    };
  }, []);

  useEffect(() => {
    setPanelOpen(false);
  }, [location.pathname]);

  const onFab = () => {
    if (location.pathname.startsWith("/demo")) {
      window.dispatchEvent(new CustomEvent("wallie:toggle-deskchat"));
    } else {
      setPanelOpen((o) => !o);
    }
  };

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
        <div className="rail-mark">
          <img src={wallieMark} alt="Wallie" />
        </div>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              className={`rail-btn ${isActive ? "active" : ""}`}
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
              <span className="rail-tip">{item.label}</span>
            </button>
          );
        })}
        <div className="rail-spacer" />
        <button
          className="rail-btn"
          aria-label="Download Apps"
          onClick={() => setDlOpen(true)}
        >
          <Download size={21} strokeWidth={2} />
          <span className="rail-tip">Download Apps</span>
        </button>
        <button
          className="rail-btn"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={21} strokeWidth={2} /> : <Moon size={21} strokeWidth={2} />}
          <span className="rail-tip">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <button
          className="rail-btn"
          aria-label="Settings"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("wallie:open-settings", { detail: { tab: "general" } }),
            )
          }
        >
          <Settings size={21} strokeWidth={current === "settings" ? 2.3 : 2} />
          <span className="rail-tip">Settings</span>
        </button>
        <div className="rail-profile" ref={profileRef}>
          <button
            className="rail-avatar-btn"
            aria-label="Your account"
            onClick={() => setProfileOpen((o) => !o)}
          >
            {user?.photoURL ? (
              <img className="rail-avatar" src={user.photoURL} alt="" />
            ) : (
              <span className="rail-avatar rail-avatar-initials">{profileInitials}</span>
            )}
            <span className="rail-tip">Your account</span>
          </button>
          {profileOpen &&
            createPortal(
              <div className="rail-profile-menu" ref={menuRef}>
                <div className="rail-menu-head">{profileName}</div>
                <div
                  className="rail-menu-item"
                  onClick={() => {
                    setProfileOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("wallie:open-settings", { detail: { section: "plan" } }),
                    );
                  }}
                >
                  <Sparkles size={16} strokeWidth={1.8} /> Upgrade Plan
                </div>
                <div className="rail-menu-item" onClick={handleAdmin}>
                  <Lock size={16} strokeWidth={1.8} /> Admin Dashboard
                </div>
                <div className="rail-menu-divider" />
                <div className="rail-menu-item" onClick={handleLogout}>
                  <LogOut size={16} strokeWidth={1.8} /> Log Out
                </div>
              </div>,
              document.body,
            )}
        </div>
      </nav>

      {current !== "chat" && !deskChatOpen && (
        <button className="chat-fab" onClick={onFab} aria-label="Ask Wallie">
          <img src={wallieMark} alt="" />
          <span className="rail-tip fab-tip">Ask Wallie</span>
        </button>
      )}
      {!location.pathname.startsWith("/demo") && (
        <WalliePanel open={panelOpen} onClose={() => setPanelOpen(false)} page={current} />
      )}

      {searchOpen && createPortal(<SearchOverlay onClose={() => setSearchOpen(false)} />, document.body)}
      {dlOpen && createPortal(<DownloadCard onClose={() => setDlOpen(false)} />, document.body)}
    </>
  );
}

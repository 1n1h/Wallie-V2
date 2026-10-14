import "./Sidebar.css";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Context } from "../../context/Context";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  SquarePen,
  X,
  TrendingUp,
  Users,
  AtSign,
  HandCoins,
  Sparkles,
  Settings,
  Lock,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";

const Sidebar = ({ mobileOpen, onClose }) => {
  const {
    prevPrompts,
    newChat,
    deleteChat,
    loadChat,
  } = useContext(Context);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const menuRef = useRef(null);
  const [tip, setTip] = useState(null);
  const tipTimer = useRef(null);

  // The demo desk's docked chat asks the sidebar to tuck away for room.
  useEffect(() => {
    const collapse = () => setCollapsed(true);
    const restore = () => setCollapsed(false);
    window.addEventListener("wallie:sidebar-collapse", collapse);
    window.addEventListener("wallie:sidebar-restore", restore);
    return () => {
      window.removeEventListener("wallie:sidebar-collapse", collapse);
      window.removeEventListener("wallie:sidebar-restore", restore);
    };
  }, []);

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

  // Small, unhurried tooltips — rendered through a portal so the
  // collapsed rail's overflow can never clip them.
  const showTip = (e, text, always = false) => {
    if (!collapsed && !always) return;
    const r = e.currentTarget.getBoundingClientRect();
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => {
      setTip({ text, x: r.right + 12, y: r.top + r.height / 2 });
    }, 450);
  };
  const hideTip = () => {
    clearTimeout(tipTimer.current);
    setTip(null);
  };

  // Theme: quick sun/moon toggle. The attribute on <html> is the source of
  // truth; a MutationObserver keeps this button in sync when the theme is
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

  const handleLoadChat = (index) => {
    loadChat(index);
    if (onClose) onClose();
  };

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      {/* Top: Collapse + New Chat */}
      <div className="sb-top">
        <div className="sb-icon-btn" onClick={() => { hideTip(); setCollapsed(!collapsed); }} onMouseEnter={(e) => showTip(e, collapsed ? "Expand sidebar" : "Collapse sidebar", true)} onMouseLeave={hideTip}>
          <Menu size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">Menu</span>}
        </div>

        <div className="sb-icon-btn sb-new-chat" onClick={() => { hideTip(); newChat(); }} onMouseEnter={(e) => showTip(e, "Start a fresh chat")} onMouseLeave={hideTip}>
          <SquarePen size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">New Chat</span>}
        </div>
      </div>

      {/* Chat History */}
      {!collapsed && (
        <div className="sb-history">
          <div className="sb-history-list">
            {prevPrompts.length === 0 ? (
              <p className="sb-empty">No chats yet</p>
            ) : (
              prevPrompts.map((item, index) => (
                <div
                  key={index}
                  className="sb-history-item"
                >
                  <div className="sb-history-content" onClick={() => handleLoadChat(index)}>
                    <span>{(item.title || "Chat").length > 28 ? (item.title || "Chat").slice(0, 28) + "..." : (item.title || "Chat")}</span>
                  </div>
                  <button
                    className="sb-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(index);
                    }}
                    title="Delete chat"
                  >
                    <X size={14} strokeWidth={1.8} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="sb-bottom">
        <div className="sb-icon-btn" onClick={() => { hideTip(); navigate("/demo"); }} onMouseEnter={(e) => showTip(e, "Practice trading on live markets")} onMouseLeave={hideTip}>
          <TrendingUp size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">Demo Desk</span>}
        </div>

        <div className="sb-icon-btn" onClick={() => { hideTip(); navigate("/community"); }} onMouseEnter={(e) => showTip(e, "Join the conversation")} onMouseLeave={hideTip}>
          <Users size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">Community</span>}
        </div>

        <div className={`sb-socials ${collapsed ? "collapsed" : ""}`}>
          <button className="sb-social-btn" aria-label="Wallie on TikTok" onClick={() => { hideTip(); window.open("https://www.tiktok.com/@t.thetiktoktrader", "_blank"); }} onMouseEnter={(e) => showTip(e, "Watch Wallie on TikTok")} onMouseLeave={hideTip}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.8 3.6 4 3.9v3c-1.6 0-3-.5-4-1.3v6.1c0 3.4-2.4 5.8-5.7 5.8a5.5 5.5 0 0 1-5.6-5.5c0-3.2 2.6-5.6 6-5.4v3.1c-1.6-.3-3 .7-3 2.2 0 1.4 1.1 2.4 2.5 2.4 1.6 0 2.7-1.1 2.7-2.9V3h3z" /></svg>
          </button>
          <button className="sb-social-btn" aria-label="Wallie on Instagram" onClick={() => { hideTip(); window.open("https://www.instagram.com/wallie_ai", "_blank"); }} onMouseEnter={(e) => showTip(e, "Wallie on Instagram")} onMouseLeave={hideTip}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="0.7" fill="currentColor" stroke="none" /></svg>
          </button>
          {!collapsed && <span className="sb-label">Socials</span>}
        </div>

        <div className="sb-divider" />

        <div className="sb-icon-btn" onClick={() => { hideTip(); window.dispatchEvent(new CustomEvent("wallie:open-settings", { detail: { section: "plan" } })); }} onMouseEnter={(e) => showTip(e, "Unlock more with Pro")} onMouseLeave={hideTip}>
          <Sparkles size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">Upgrade Plan</span>}
        </div>

        <div className="sb-icon-btn" onClick={() => { hideTip(); window.dispatchEvent(new CustomEvent("wallie:open-settings", { detail: { section: "general" } })); }} onMouseEnter={(e) => showTip(e, "Make it yours")} onMouseLeave={hideTip}>
          <Settings size={20} strokeWidth={1.8} />
          {!collapsed && <span className="sb-label">Settings</span>}
        </div>

        <div className="sb-icon-btn" onClick={() => { hideTip(); toggleTheme(); }} onMouseEnter={(e) => showTip(e, theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} onMouseLeave={hideTip}>
          {theme === "dark" ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
          {!collapsed && <span className="sb-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </div>

        <div className="sb-divider" />

        {/* Profile — moved here from the header */}
        <div className="sb-profile" ref={profileRef}>
          <div className="sb-profile-row" onClick={() => { hideTip(); setProfileOpen(!profileOpen); }} onMouseEnter={(e) => showTip(e, "Your account")} onMouseLeave={hideTip}>
            {user?.photoURL ? (
              <img className="sb-avatar" src={user.photoURL} alt="Profile" />
            ) : (
              <div className="sb-avatar sb-avatar-initials">{profileInitials}</div>
            )}
            {!collapsed && <span className="sb-label sb-profile-name">{profileName}</span>}
          </div>
          {profileOpen && createPortal(
            <div
              className="sb-profile-menu"
              ref={menuRef}
              style={{
                position: "fixed",
                left: collapsed ? 76 : 12,
                bottom: 78,
                top: "auto",
                width: collapsed ? 232 : 236,
                zIndex: 200,
              }}
            >
              <div className="sb-menu-item" onClick={() => { setProfileOpen(false); window.dispatchEvent(new CustomEvent("wallie:open-settings", { detail: { section: "plan" } })); }}>
                <Sparkles size={16} strokeWidth={1.8} /> Upgrade Plan
              </div>
              <div className="sb-menu-item" onClick={() => { setProfileOpen(false); navigate("/community"); }}>
                <Users size={16} strokeWidth={1.8} /> Community
              </div>
              <div className="sb-menu-item" onClick={handleAdmin}>
                <Lock size={16} strokeWidth={1.8} /> Admin Dashboard
              </div>
              <div className="sb-menu-divider" />
              <div className="sb-menu-item" onClick={handleLogout}>
                <LogOut size={16} strokeWidth={1.8} /> Log Out
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
      {tip && createPortal(
        <div className="sb-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Sidebar;

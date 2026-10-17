import "./Sidebar.css";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Context } from "../../context/Context";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Menu,
  SquarePen,
  X,
  TrendingUp,
  MessageCircle,
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
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const { user, logout } = useAuth();
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

  // The app rail's chat bubble opens and closes this history column.
  useEffect(() => {
    const toggle = () => setCollapsed((c) => !c);
    window.addEventListener("wallie:toggle-history", toggle);
    return () => window.removeEventListener("wallie:toggle-history", toggle);
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

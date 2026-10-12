import "./SettingsModal.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Sparkles, LogOut, Trash2, Mail, HardDrive, Sun, Moon } from "lucide-react";
import { doc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import ConnectCard from "../Connect/ConnectCard";

const PERM_DEFS = [
  {
    key: "wallie_perm_alerts",
    title: "Market move alerts",
    body: "Let Wallie flag big moves on your watchlist (like a Bitcoin spike) even between sessions.",
  },
  {
    key: "wallie_perm_watch",
    title: "Watch my session",
    body: "Allow screen sampling while you trade so Wallie can read your chart and coach live.",
  },
  {
    key: "wallie_perm_memory",
    title: "Personalized memory",
    body: "Use your soul files and journal habits to personalize every answer.",
  },
];

const readPerm = (key) => {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
};

const SettingsModal = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("general");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [perms, setPerms] = useState(() =>
    Object.fromEntries(PERM_DEFS.map((p) => [p.key, readPerm(p.key)])),
  );
  const planRef = useRef(null);
  const appRef = useRef(null);
  const connRef = useRef(null);
  const permRef = useRef(null);
  const acctRef = useRef(null);

  // Appearance: the data-theme attribute on <html> is the source of truth;
  // a MutationObserver keeps this control in sync with the sidebar toggle.
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

  const applyTheme = async (next) => {
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

  useEffect(() => {
    const handler = (e) => {
      setSection(e.detail?.section || "general");
      setConfirmDelete(false);
      setOpen(true);
    };
    window.addEventListener("wallie:open-settings", handler);
    return () => window.removeEventListener("wallie:open-settings", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const target =
      section === "plan"
        ? planRef.current
        : section === "appearance"
          ? appRef.current
          : section === "connections"
            ? connRef.current
            : section === "permissions"
              ? permRef.current
              : null;
    if (target) {
      const t = setTimeout(
        () => target.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
      return () => clearTimeout(t);
    }
  }, [open, section]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const togglePerm = (key) => {
    setPerms((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(key, next[key] ? "on" : "off");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/");
  };

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
      await deleteDoc(doc(db, "users", `${user.uid}.soul`)).catch(() => {});
      await deleteDoc(doc(db, "users", `${user.uid}.connections`)).catch(
        () => {},
      );
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

  if (!open) return null;

  return createPortal(
    <div className="sm-backdrop" onClick={() => setOpen(false)}>
      <aside className="sm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <span className="sm-title">Settings</span>
          <button
            className="sm-close"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sm-scroll">
          {/* Plan */}
          <section className="sm-section" ref={planRef}>
            <h3 className="sm-section-title">Plan</h3>
            <div className="sm-plan-card">
              <div>
                <div className="sm-plan-name">Free plan</div>
                <div className="sm-plan-sub">
                  You're in the beta — everything is open while we build.
                </div>
              </div>
              <button
                className="sm-upgrade-btn"
                onClick={() => {
                  setOpen(false);
                  navigate("/pricing");
                }}
              >
                <Sparkles size={15} /> See plans
              </button>
            </div>
          </section>

          {/* Appearance */}
          <section className="sm-section" ref={appRef}>
            <h3 className="sm-section-title">Appearance</h3>
            <div className="sm-theme-row">
              <button
                className={`sm-theme-btn ${theme === "dark" ? "active" : ""}`}
                onClick={() => applyTheme("dark")}
                aria-pressed={theme === "dark"}
              >
                <Moon size={15} /> Dark
              </button>
              <button
                className={`sm-theme-btn ${theme === "light" ? "active" : ""}`}
                onClick={() => applyTheme("light")}
                aria-pressed={theme === "light"}
              >
                <Sun size={15} /> Light
              </button>
            </div>
          </section>

          {/* Connections */}
          <section className="sm-section" ref={connRef}>
            <h3 className="sm-section-title">Connections</h3>
            <ConnectCard />
            <div className="sm-soon-rows">
              <div className="sm-soon-row">
                <Mail size={17} />
                <div>
                  <div className="sm-soon-name">Gmail</div>
                  <div className="sm-soon-sub">
                    Market briefs and journal recaps by email
                  </div>
                </div>
                <span className="sm-soon-tag">Coming soon</span>
              </div>
              <div className="sm-soon-row">
                <HardDrive size={17} />
                <div>
                  <div className="sm-soon-name">Google Drive</div>
                  <div className="sm-soon-sub">
                    Import trading journals and statements
                  </div>
                </div>
                <span className="sm-soon-tag">Coming soon</span>
              </div>
            </div>
          </section>

          {/* Permissions */}
          <section className="sm-section" ref={permRef}>
            <h3 className="sm-section-title">Permissions</h3>
            {PERM_DEFS.map((p) => (
              <div key={p.key} className="sm-perm-row">
                <div>
                  <div className="sm-perm-name">{p.title}</div>
                  <div className="sm-perm-body">{p.body}</div>
                </div>
                <button
                  className={`sm-toggle ${perms[p.key] ? "on" : ""}`}
                  role="switch"
                  aria-checked={perms[p.key]}
                  aria-label={p.title}
                  onClick={() => togglePerm(p.key)}
                >
                  <span className="sm-toggle-dot" />
                </button>
              </div>
            ))}
          </section>

          {/* Account */}
          <section className="sm-section" ref={acctRef}>
            <h3 className="sm-section-title">Account</h3>
            {user?.email && <div className="sm-email">{user.email}</div>}
            <button className="sm-row-btn" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </button>
            {!confirmDelete ? (
              <button
                className="sm-row-btn danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} /> Delete my data
              </button>
            ) : (
              <div className="sm-delete-box">
                <div className="sm-delete-title">Delete your Wallie data?</div>
                <p className="sm-delete-body">
                  This removes your profile, soul files, connections and
                  preferences, clears this device, and signs you out. This
                  can't be undone.
                </p>
                <div className="sm-delete-actions">
                  <button
                    className="sm-cancel-btn"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep my data
                  </button>
                  <button
                    className="sm-confirm-btn"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Yes, delete it"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export default SettingsModal;

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { Eye, Bell } from "lucide-react";

// Watches & reminders the user set from chart-read action chips. They live
// on the user doc (users/{uid}.watches / .reminders) so they follow the
// account, and this card is where Wallie surfaces them — due reminders
// first-class, flagged when their time comes.
const fmtDue = (iso) => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function WatchCard() {
  const { user } = useAuth();
  const [watches, setWatches] = useState([]);
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    if (!user) {
      setWatches([]);
      setReminders([]);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const d = snap.data() || {};
        setWatches(Array.isArray(d.watches) ? d.watches : []);
        setReminders(Array.isArray(d.reminders) ? d.reminders : []);
      },
      () => {}
    );
    return unsub;
  }, [user]);

  const remove = async (field, id, list) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { [field]: list.filter((x) => x.id !== id) },
        { merge: true }
      );
    } catch (e) {
      console.error("WatchCard remove failed:", e);
    }
  };

  if (!watches.length && !reminders.length) return null;
  const now = Date.now();
  const isDue = (r) => new Date(r.dueAt).getTime() <= now;

  return (
    <div className="pp-card wc-card">
      <div className="pp-card-head">
        <span className="pp-card-title">Wallie is on it</span>
      </div>
      {reminders.map((r) => (
        <div key={r.id} className={`wc-row ${isDue(r) ? "wc-due" : ""}`}>
          <Bell size={14} strokeWidth={2.1} className="wc-ic" />
          <span className="wc-main">
            {r.symbol ? `${r.symbol} — ` : ""}
            {isDue(r) ? "time to re-check this chart" : `re-check · ${fmtDue(r.dueAt)} ET`}
          </span>
          <button
            className="wc-x"
            title="Remove reminder"
            aria-label="Remove reminder"
            onClick={() => remove("reminders", r.id, reminders)}
          >
            ×
          </button>
        </div>
      ))}
      {watches.map((w) => (
        <div key={w.id} className="wc-row">
          <Eye size={14} strokeWidth={2.1} className="wc-ic" />
          <span className="wc-main">{w.label}</span>
          <button
            className="wc-x"
            title="Stop watching"
            aria-label="Stop watching this level"
            onClick={() => remove("watches", w.id, watches)}
          >
            ×
          </button>
        </div>
      ))}
      <p className="pp-card-note">
        Set from your chart reads — tap a chip under any analysis and it lands
        here. Due reminders flag themselves whenever you're in the app.
      </p>
    </div>
  );
}

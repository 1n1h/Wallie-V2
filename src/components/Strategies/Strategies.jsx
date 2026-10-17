import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { Lightbulb, Plus } from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext.jsx";
import { Context } from "../../context/Context.jsx";
import "./Strategies.css";

export default function StrategiesPage() {
  const { user } = useAuth();
  const { onSent } = useContext(Context);
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (!alive) return;
        const list = snap.exists() ? snap.data().strategies : null;
        setStrategies(Array.isArray(list) ? list : []);
      })
      .catch(() => alive && setStrategies([]));
    return () => {
      alive = false;
    };
  }, [user]);

  const addStrategy = () => {
    // Takes the user into a chat with Wallie to describe, paste or upload
    // the strategy. The structured intake + backtest arrive with the
    // backtesting build; the conversation starts here.
    if (typeof onSent === "function") onSent("I want to add a trading strategy");
    navigate("/chat");
  };

  return (
    <div className="strat-page">
      <header className="strat-head">
        <div>
          <h1><Lightbulb size={28} /> Saved Strategies</h1>
          <p className="strat-sub">
            Strategies you have backtested with Wallie live here — rules, results and all.
            Run one and Wallie marks up the chart the way the strategy calls for.
          </p>
        </div>
        <button className="strat-add" onClick={addStrategy}>
          <Plus size={18} /> Add a strategy
        </button>
      </header>

      {strategies === null && <p className="strat-note">Loading your strategies…</p>}

      {strategies !== null && strategies.length === 0 && (
        <div className="strat-empty">
          <h2>No saved strategies yet</h2>
          <p>
            Tap <strong>Add a strategy</strong> and tell Wallie about one — paste a video link,
            drop in a transcript, or just explain how it works. Wallie will pull out the rules,
            backtest it on real data, and save the ones worth keeping.
          </p>
          <button className="strat-add" onClick={addStrategy}>
            <Plus size={18} /> Add your first strategy
          </button>
        </div>
      )}

      {strategies !== null && strategies.length > 0 && (
        <div className="strat-grid">
          {strategies.map((s, i) => (
            <article key={s.id || i} className="strat-card">
              <h3>{s.name || "Strategy"}</h3>
              <p className="strat-meta">
                {[s.symbol, s.timeframe].filter(Boolean).join(" · ") || "—"}
              </p>
              {s.lastBacktest ? (
                <p className="strat-stats">
                  Win rate {s.lastBacktest.winRate ?? "—"}% · Profit factor {s.lastBacktest.profitFactor ?? "—"} ·{" "}
                  {s.lastBacktest.trades ?? "—"} trades
                </p>
              ) : (
                <p className="strat-stats">Not backtested yet</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

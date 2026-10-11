import "./ConnectCard.css";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";

// Connect tools — like Muse's connectors. Brokers and tools plug into
// Wallie READ-ONLY: it can learn from a user's accounts and journal, it can
// never place a trade. Live integrations are rolling out, so brokers sit on
// a waitlist the user can join with one tap (saved to users/{uid}.connections).

const CONNECTED = [
  { id: "tradingview", name: "TradingView", detail: "Chart context via the Wallie extension" },
  { id: "news", name: "Market News & Data", detail: "Live prices, TA data, and headlines in chat" },
  { id: "demo", name: "Demo Account", detail: "Paper trading practice inside Wallie" },
];

const BROKERS = [
  { id: "robinhood", name: "Robinhood", detail: "Stocks & crypto" },
  { id: "coinbase", name: "Coinbase", detail: "Crypto" },
  { id: "webull", name: "Webull", detail: "Stocks & options" },
  { id: "binance", name: "Binance", detail: "Crypto" },
  { id: "mt5", name: "MetaTrader 5", detail: "Forex & futures" },
];

const TOOLS = [
  { id: "calendar", name: "Google Calendar", detail: "Pre-session & earnings reminders" },
  { id: "journal", name: "Trade Journal Import", detail: "Upload past trades — Wallie learns your habits" },
  { id: "alerts", name: "Price Alerts", detail: "Get pinged when your levels get hit" },
];

const ConnectCard = () => {
  const { user } = useAuth();
  const [waitlist, setWaitlist] = useState({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().connections) {
          setWaitlist(snap.data().connections);
        }
      } catch (err) {
        console.error("Error loading connections:", err);
      }
    })();
  }, [user]);

  const toggleWaitlist = async (id) => {
    const next = { ...waitlist, [id]: !waitlist[id] };
    setWaitlist(next);
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { connections: next }, { merge: true });
    } catch (err) {
      console.error("Error saving connection:", err);
    }
  };

  const renderSoon = (item) => {
    const joined = !!waitlist[item.id];
    return (
      <div key={item.id} className="conn-row">
        <span className="conn-main">
          <span className="conn-name">{item.name}</span>
          <span className="conn-detail">{item.detail}</span>
        </span>
        <button
          className={`conn-btn ${joined ? "joined" : ""}`}
          onClick={() => toggleWaitlist(item.id)}
        >
          {joined ? "On the list ✓" : "Connect"}
        </button>
      </div>
    );
  };

  return (
    <div className="pp-card conn-card">
      <div className="pp-card-head">
        <span className="pp-card-title">Connect tools</span>
        <span className="conn-count">{CONNECTED.length} on</span>
      </div>

      <div className="conn-group">Connected</div>
      {CONNECTED.map((c) => (
        <div key={c.id} className="conn-row">
          <span className="conn-main">
            <span className="conn-name">
              <span className="conn-dot" /> {c.name}
            </span>
            <span className="conn-detail">{c.detail}</span>
          </span>
          <span className="conn-on">On</span>
        </div>
      ))}

      <div className="conn-group">Brokers — read-only</div>
      {BROKERS.map(renderSoon)}

      <div className="conn-group">More tools</div>
      {TOOLS.map(renderSoon)}

      <p className="pp-card-note">
        Broker sync is read-only and rolling out — tap Connect to join the
        list. Wallie can learn from your account; it can never place a trade.
      </p>
    </div>
  );
};

export default ConnectCard;

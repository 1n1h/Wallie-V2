import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Newspaper } from "lucide-react";
import { fetchFeed } from "../../config/feed.js";
import "./Feed.css";

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "This week";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
}

function eventTime(iso) {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default function FeedPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [calFilter, setCalFilter] = useState("All");

  useEffect(() => {
    let watchlist = [];
    try {
      const raw = JSON.parse(localStorage.getItem("wallie_watchlist") || "[]");
      if (Array.isArray(raw)) watchlist = raw.filter((s) => typeof s === "string").slice(0, 4);
    } catch {}
    fetchFeed(watchlist)
      .then(setData)
      .catch((err) => setError(err.message || "Could not load the feed."));
  }, []);

  const currencies = useMemo(() => {
    const set = new Set((data?.calendar || []).map((e) => e.country).filter(Boolean));
    return ["All", ...[...set].sort()];
  }, [data]);

  const calendarDays = useMemo(() => {
    const events = (data?.calendar || []).filter(
      (e) => calFilter === "All" || e.country === calFilter || (calFilter === "High" && e.impact === "High")
    );
    const groups = new Map();
    for (const e of events) {
      const key = dayLabel(e.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.entries()];
  }, [data, calFilter]);

  const macroLines = (data?.macro || "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean);

  return (
    <div className="feed-page">
      <header className="feed-head">
        <h1>Feed</h1>
        <p className="feed-sub">News and the economic calendar, tuned to what you trade.</p>
      </header>

      {error && <div className="feed-error">{error}</div>}
      {!data && !error && <div className="feed-loading">Loading your feed…</div>}

      {data && (
        <>
          {macroLines.length > 0 && (
            <section className="feed-macro" aria-label="Macro snapshot">
              {macroLines.map((line, i) => (
                <span key={i} className="feed-macro-chip">{line}</span>
              ))}
            </section>
          )}

          <section className="feed-section">
            <h2><Newspaper size={18} /> Top stories</h2>
            <div className="feed-news-list">
              {data.headlines.general.map((item, i) => (
                <a key={i} className="feed-news-row" href={item.link} target="_blank" rel="noreferrer">
                  <span className="feed-news-title">{item.title}</span>
                  <span className="feed-news-meta">{timeAgo(item.date)}</span>
                </a>
              ))}
              {data.headlines.general.length === 0 && <p className="feed-empty">No headlines right now.</p>}
            </div>
          </section>

          {Object.entries(data.headlines.bySymbol || {}).map(([symbol, items]) => (
            <section className="feed-section" key={symbol}>
              <h2>{symbol} — on your watchlist</h2>
              <div className="feed-news-list">
                {items.map((item, i) => (
                  <a key={i} className="feed-news-row" href={item.link} target="_blank" rel="noreferrer">
                    <span className="feed-news-title">{item.title}</span>
                    <span className="feed-news-meta">{timeAgo(item.date)}</span>
                  </a>
                ))}
                {items.length === 0 && <p className="feed-empty">Nothing new on {symbol}.</p>}
              </div>
            </section>
          ))}

          <section className="feed-section">
            <h2><CalendarDays size={18} /> Economic calendar — this week</h2>
            <div className="feed-cal-filters">
              {currencies.map((c) => (
                <button
                  key={c}
                  className={`feed-chip ${calFilter === c ? "active" : ""}`}
                  onClick={() => setCalFilter(c)}
                >
                  {c}
                </button>
              ))}
              <button
                className={`feed-chip ${calFilter === "High" ? "active" : ""}`}
                onClick={() => setCalFilter("High")}
              >
                High impact
              </button>
            </div>
            {calendarDays.map(([day, events]) => (
              <div key={day} className="feed-cal-day">
                <h3>{day}</h3>
                {events.map((e, i) => (
                  <div key={i} className="feed-cal-row">
                    <span className="feed-cal-time">{eventTime(e.date)}</span>
                    <span className={`feed-impact impact-${(e.impact || "low").toLowerCase()}`}>{e.impact}</span>
                    <span className="feed-cal-ccy">{e.country}</span>
                    <span className="feed-cal-title">
                      {e.title}
                      {e.actual ? <em> · Actual {e.actual}</em> : e.forecast ? <em> · Forecast {e.forecast}</em> : null}
                      {e.previous ? <em> · Prev {e.previous}</em> : null}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {calendarDays.length === 0 && <p className="feed-empty">No events match that filter this week.</p>}
          </section>
        </>
      )}
    </div>
  );
}

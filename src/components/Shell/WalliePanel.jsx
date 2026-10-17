import { useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X, SendHorizonal, Mic } from "lucide-react";
import { Context } from "../../context/Context";
import wallieMark from "../../assets/wallie-mark.png";
import "../Demo/DemoDesk.css";
import "./WalliePanel.css";

// The floating Wallie chat panel for every non-desk page. Same brain
// and same conversation as the main chat (shared Context), opened
// in place by the round Wallie button. The current page rides along
// as hidden context so Wallie knows what the user is looking at.
const PAGE_NOTES = {
  feed: "The user is chatting from the Feed page of the app - market news headlines, watchlist news and this week's economic calendar.",
  education:
    "The user is chatting from the Education page (Wallie Academy - structured trading lessons from Preschool to College). Help them learn; explain simply and offer examples.",
  strategies:
    "The user is chatting from the Saved Strategies page, where they keep strategies they want backtested. If they describe a strategy, help them spell out its exact rules.",
  community:
    "The user is chatting from the Community page, where traders share posts and trade ideas.",
  settings: "The user is chatting from their Settings page.",
};

const PAGE_CHIPS = {
  feed: [
    { label: "What's moving the market?", run: "What's moving the market today? Give me the short version" },
    { label: "Explain the calendar", run: "Walk me through this week's big economic events and why traders care about them" },
    { label: "Top story, simply", run: "Take today's top market story and explain it like I'm new to trading" },
  ],
  education: [
    { label: "Explain it simpler", run: "Explain that again like I'm a complete beginner, with one example" },
    { label: "Quiz me", run: "Quiz me on trading basics - one question at a time, and tell me if I get it right" },
    { label: "Where do I start?", run: "I'm new. Where should I start learning in the Academy, and why?" },
  ],
  strategies: [
    { label: "Describe a strategy", run: "I want to save a trading strategy. Ask me the questions you need to write down its exact rules" },
    { label: "What makes it good?", run: "What makes a trading strategy worth backtesting? Give me the checklist" },
  ],
  community: [
    { label: "Show me a chart of GOLD", run: "Show me a chart of GOLD" },
    { label: "Teach me support and resistance", run: "Teach me support and resistance like I'm new, with an example" },
  ],
};

const DEFAULT_CHIPS = [
  { label: "Show me a chart of GOLD", run: "Show me a chart of GOLD" },
  { label: "Teach me support and resistance", run: "Teach me support and resistance like I'm new, with an example" },
  { label: "What's the sentiment on Tesla?", run: "What's the sentiment on Tesla?" },
];

export default function WalliePanel({ open, onClose, page }) {
  const { chatHistory, onSent, loading, isStreaming, setSelectedImage } = useContext(Context);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState("");
  const scrollRef = useRef(null);
  const recogRef = useRef(null);
  const msgs = chatHistory.slice(-30);
  const busy = loading || isStreaming;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open && recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        /* not running */
      }
      setListening(false);
    }
  }, [open ]);

  if (!open) return null;

  const sendText = (t) => {
    const clean = (t || "").trim();
    if (!clean || busy) return;
    setSelectedImage(null);
    onSent(clean, PAGE_NOTES[page] || null);
  };

  const send = () => {
    sendText(text);
    setText("");
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicNote("Voice input isn't supported in this browser — try Chrome or Edge.");
      return;
    }
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch {
        /* noop */
      }
      setListening(false);
      return;
    }
    setMicNote("");
    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = true;
    recog.continuous = false;
    recog.onresult = (e) => {
      let transcript = "";
      for (const result of e.results) transcript += result[0].transcript;
      setText(transcript.trim());
    };
    recog.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed")
        setMicNote("Mic access is blocked — allow the microphone for this site and try again.");
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    try {
      recog.start();
      setListening(true);
    } catch {
      /* already started */
    }
  };

  const chips = (PAGE_CHIPS[page] || DEFAULT_CHIPS).map((c) => ({
    label: c.label,
    run: () => sendText(c.run),
  }));

  return (
    <div className="wallie-panel" role="dialog" aria-label="Chat with Wallie">
      <div className="desk-chat">
        <div className="desk-chat-head">
          <img src={wallieMark} alt="" className="desk-chat-mark" />
          <div className="desk-chat-title">
            <strong>Wallie</strong>
            <span>
              <span className="desk-live-dot" /> Watching the markets
            </span>
          </div>
          <button className="desk-chat-x" onClick={onClose} aria-label="Close chat">
            <X size={18} />
          </button>
        </div>

        <div className="desk-chat-msgs" ref={scrollRef}>
          {msgs.length === 0 && (
            <div className="desk-chat-empty">
              Ask Wallie about a chart, a level, a headline, or anything you're learning — right
              here, without leaving this page.
            </div>
          )}
          {msgs.map((m, i) =>
            m.type === "user" ? (
              <div key={i} className="desk-msg user">
                {m.message}
              </div>
            ) : (
              <div key={i} className="desk-msg ai">
                <ReactMarkdown>{m.message || "…"}</ReactMarkdown>
              </div>
            ),
          )}
          {loading && <div className="desk-msg ai desk-typing">Wallie is thinking…</div>}
        </div>

        {chips.length > 0 && (
          <div className="desk-chips" aria-label="Suggestions">
            {chips.map((c) => (
              <button key={c.label} className="desk-chip" onClick={c.run} disabled={busy}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {micNote && <div className="desk-mic-note">{micNote}</div>}

        <div className="desk-chat-composer">
          <button
            className={`desk-mic ${listening ? "live" : ""}`}
            onClick={toggleMic}
            aria-label={listening ? "Stop dictation" : "Talk to Wallie"}
          >
            <Mic size={17} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder={listening ? "Listening… speak now" : "Ask Wallie anything…"}
            aria-label="Ask Wallie"
          />
          <button className="desk-chat-send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
            <SendHorizonal size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

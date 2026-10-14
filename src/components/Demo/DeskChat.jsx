import { useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X, SendHorizonal, Mic } from "lucide-react";
import { Context } from "../../context/Context";
import wallieMark from "../../assets/wallie-mark.png";

// "Ask Wallie" slide-over on the demo desk. Uses the SAME chat context as
// the main chat page — same conversation, same brain — with a snapshot of
// the desk (account + open positions) attached as hidden context per send.
// Extras: a mic button (speech-to-text dictation) and suggestion chips
// that adapt to what the desk is showing.
export default function DeskChat({ open, onClose, deskContext, actionLog, chipCtx, onQuickWatch }) {
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
  }, [chatHistory, open, actionLog]);

  // Stop dictation when the panel closes.
  useEffect(() => {
    if (!open && recogRef.current) {
      try { recogRef.current.stop(); } catch { /* not running */ }
      setListening(false);
    }
  }, [open ]);

  if (!open) return null;

  const sendText = (t) => {
    const clean = (t || "").trim();
    if (!clean || busy) return;
    setSelectedImage(null);
    onSent(clean, deskContext());
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
      try { recogRef.current?.stop(); } catch { /* noop */ }
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
      if (e.error === "not-allowed") setMicNote("Mic access is blocked — allow the microphone for this site and try again.");
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    try {
      recog.start();
      setListening(true);
    } catch { /* already started */ }
  };

  // ── Suggestion chips, adapted to the desk ──
  const chips = [];
  if (chipCtx) {
    const { symbol, interval, hasPosOnSymbol, alertLevel, nearestRes } = chipCtx;
    chips.push({ label: `Levels for ${symbol}`, run: () => sendText(`Show me the levels for ${symbol}`) });
    chips.push({ label: `Trade signal for ${symbol}`, run: () => sendText(`Generate a trade signal for ${symbol} on the ${interval} timeframe — entry, stop, target, and the reasoning`) });
    if (hasPosOnSymbol) {
      chips.push({ label: `Close my ${symbol} position`, run: () => sendText(`Close my ${symbol} position`) });
    }
    if (alertLevel != null && onQuickWatch) {
      chips.push({ label: `Alert me at ${symbol} ${nearestRes}`, run: () => onQuickWatch(symbol, alertLevel) });
    }
    if (!hasPosOnSymbol) {
      chips.push({ label: `Should I trade ${symbol}?`, run: () => sendText(`Should I trade ${symbol} right now? Give me the setup, the risk, and what would make you pass`) });
    }
  }

  return (
    <div className="desk-chat" role="dialog" aria-label="Chat with Wallie">
      <div className="desk-chat-head">
        <img src={wallieMark} alt="" className="desk-chat-mark" />
        <div className="desk-chat-title">
          <strong>Wallie</strong>
          <span><span className="desk-live-dot" /> Watching your desk</span>
        </div>
        <button className="desk-chat-x" onClick={onClose} aria-label="Close chat">
          <X size={18} />
        </button>
      </div>

      <div className="desk-chat-msgs" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="desk-chat-empty">
            Ask Wallie about your open trades, a level, or the plan for this position — or tap the mic and just say it.
            Try: "take a buy on dollar yen at 1:50, one-to-four risk to reward."
          </div>
        )}
        {msgs.map((m, i) =>
          m.type === "user" ? (
            <div key={i} className="desk-msg user">{m.message}</div>
          ) : (
            <div key={i} className="desk-msg ai">
              <ReactMarkdown>{m.message || "…"}</ReactMarkdown>
            </div>
          )
        )}
        {loading && <div className="desk-msg ai desk-typing">Wallie is thinking…</div>}
        {actionLog?.length > 0 && (
          <div className="desk-actlog">
            {actionLog.map((e) => (
              <div key={e.id} className={`desk-act ${e.ok ? "ok" : "fail"}`}>
                {e.ok ? "✓" : "✗"} {e.text}
              </div>
            ))}
          </div>
        )}
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
          title={listening ? "Listening… tap to stop" : "Talk to Wallie"}
        >
          <Mic size={17} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={listening ? "Listening… speak now" : "Ask Wallie anything…"}
          aria-label="Ask Wallie"
        />
        <button className="desk-chat-send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
          <SendHorizonal size={17} />
        </button>
      </div>
    </div>
  );
}

import { useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X, SendHorizonal } from "lucide-react";
import { Context } from "../../context/Context";
import wallieMark from "../../assets/wallie-mark.png";

// "Ask Wallie" slide-over on the demo desk. Uses the SAME chat context as
// the main chat page — same conversation, same brain — with a snapshot of
// the desk (account + open positions) attached as hidden context per send.
export default function DeskChat({ open, onClose, deskContext, actionLog }) {
  const { chatHistory, onSent, loading, isStreaming, setSelectedImage } = useContext(Context);
  const [text, setText] = useState("");
  const scrollRef = useRef(null);
  const msgs = chatHistory.slice(-30);
  const busy = loading || isStreaming;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, open]);

  if (!open) return null;

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    setSelectedImage(null);
    onSent(t, deskContext());
  };

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
            Ask Wallie about your open trades, a level, or the plan for this position.
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

      <div className="desk-chat-composer">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask Wallie anything…"
          aria-label="Ask Wallie"
        />
        <button className="desk-chat-send" onClick={send} disabled={busy || !text.trim()} aria-label="Send">
          <SendHorizonal size={17} />
        </button>
      </div>
    </div>
  );
}

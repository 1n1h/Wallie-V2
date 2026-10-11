import "./Main.css";
import { assets } from "../../assets/assets";
import { useContext, useState, useEffect, useRef } from "react";
import { Context } from "../../context/Context";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import ReactMarkdown from 'react-markdown';
import { Compass, TrendingUp, BookOpen, BarChart3 } from "lucide-react";

import { useNavigate } from "react-router-dom";

const GREETINGS = [
  "Hello,", "Welcome back,", "Howdy,", "Hey there,", "Good to see you,",
  "What's good,", "Yo,", "What's up,", "Glad you're here,", "Nice to see you,",
  "Ready to trade,", "Let's get it,", "Back at it,", "Rise and grind,",
  "Let's make moves,", "Time to trade,", "Welcome aboard,", "Salute,",
  "Great to have you,", "Let's secure the bag,",
];

const Main = ({ onMenuClick }) => {
  const [imageQuestion, setImageQuestion] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [recognition, setRecognition] = useState(null);
  const [firstName, setFirstName] = useState("Trader");
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  const profileRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const navigate = useNavigate();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const { user, logout } = useAuth();

  const {
    input,
    setInput,
    onSent,
    recentPrompt,
    showResult,
    loading,
    resultData,
    selectedImage,
    setSelectedImage,
    handleImageUpload,
    chatHistory,
    setShowResult,
    isStreaming,
    isSpeaking: ctxIsSpeaking,
    handleTextToSpeech: ctxHandleTextToSpeech,
    stopSpeaking: ctxStopSpeaking,
    // Subscription & usage
    isLimitedPlan,
    messagesUsed,
    freeLimit,
    hasReachedLimit,
    showPaywall,
    setShowPaywall,
  } = useContext(Context);

  const [greetLeaving, setGreetLeaving] = useState(false);

  // Greeting exit: when the first prompt is sent, keep the greeting mounted
  // briefly so it can fade out softly instead of vanishing.
  useEffect(() => {
    if (!showResult) {
      setGreetLeaving(false);
      return;
    }
    setGreetLeaving(true);
    const t = setTimeout(() => setGreetLeaving(false), 400);
    return () => clearTimeout(t);
  }, [showResult]);

  useEffect(() => {
    if (!user) return;
    const loadName = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().name) {
          setFirstName(snap.data().name.split(" ")[0]);
        } else if (user.displayName) {
          setFirstName(user.displayName.split(" ")[0]);
        }
      } catch (err) {
        if (user.displayName) setFirstName(user.displayName.split(" ")[0]);
      }
    };
    loadName();
  }, [user]);

  // Auto-scroll to bottom when new messages appear or while streaming
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading, isStreaming, resultData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target)) {
        setShowUploadMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');

        setInput(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (input.trim()) {
          onSent();
        }
      };

      setRecognition(recognition);
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
      stopSpeaking();
    };
  }, [input, onSent]);

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && (input.trim() || selectedImage)) {
      onSent();
    }
  };

  const submitImageQuestion = () => {
    if (!selectedImage) return;
    const q = imageQuestion.trim();
    if (q === "" || q.toLowerCase() === "analyze") {
      onSent("ANALYZE", ANALYZE_PROMPT);
    } else {
      onSent(q);
    }
    setImageQuestion("");
  };

  const handleImageQuestionKeyPress = (event) => {
    if (event.key === "Enter" && selectedImage) {
      event.preventDefault();
      submitImageQuestion();
    }
  };

  const startListening = () => {
    if (recognition) {
      recognition.start();
    } else {
      alert('Speech recognition is not supported in this browser.');
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleTextToSpeech = ctxHandleTextToSpeech;
  const stopSpeaking = ctxStopSpeaking;
  const isSpeaking = ctxIsSpeaking;

  const handleLogout = async () => {
    setIsProfileOpen(false);
    await logout();
    navigate("/");
  };

  const handleUpgrade = () => {
    navigate("/pricing");
  };

  const getInitials = () => {
    if (user?.displayName) {
      return user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  };

  const UserAvatar = ({ size = 40 }) => {
    if (user?.photoURL) {
      return <img src={user.photoURL} alt="Profile" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
    }
    return (
      <div className="user-initials-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
        {getInitials()}
      </div>
    );
  };

  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), { settings: { theme: newTheme } }, { merge: true });
      } catch (err) {
        console.error("Error saving theme:", err);
      }
    }
  };

  const handleCardClick = (message) => {
    setInput(message);
    setShowResult(true);
    onSent(message);
  };

  const handleScreenCapture = async (analyze = false) => {
    setShowUploadMenu(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window" },
        preferCurrentTab: false,
        surfaceSwitching: "exclude",
        selfBrowserSurface: "exclude",
      });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();

      // Bring focus back to this tab immediately after capture
      window.focus();

      const canvas = document.createElement("canvas");
      const capScale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * capScale);
      canvas.height = Math.round(bitmap.height * capScale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "screenshot.jpg", { type: "image/jpeg" });
          const fakeEvent = { target: { files: [file], value: "" } };
          if (analyze) pendingRef.current = { label: "ANALYZE", hidden: ANALYZE_PROMPT, ts: Date.now() };
          handleImageUpload(fakeEvent);
        }
      }, "image/jpeg", 0.85);
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        console.error("Screen capture failed:", err);
      }
    }
  };

  // ===== Chart analysis: verdict contract + watch mode =====
  const ANALYZE_PROMPT =
    "Analyze this chart like my trading coach. Start your reply with a verdict line in exactly this format: VERDICT: BULLISH 72% (or BEARISH, or NEUTRAL, with your confidence from 0 to 100). Then give me: the key support and resistance levels you see, the trend and any patterns, confluence if you spot it, and one lesson I should take from this chart. Educational analysis only — never tell me to buy or sell.";
  const WATCH_PROMPT =
    "Session watch update. Start with the verdict line in exactly this format: VERDICT: BULLISH 72% (or BEARISH, or NEUTRAL, with your confidence from 0 to 100). Then in one or two short lines: what changed on this chart since the last update, and what I should be watching now. Educational analysis only.";
  const pendingRef = useRef(null);
  const [watching, setWatching] = useState(false);
  const watchRef = useRef({ stream: null, video: null, timer: null, lastSig: null, lastSent: 0, busy: false });

  // When an analyze/watch capture lands an image, send it: the user sees a
  // one-word command (ANALYZE / LOOK); the full instructions ride along
  // hidden in the backend persona layer.
  useEffect(() => {
    const p = pendingRef.current;
    if (p && selectedImage) {
      pendingRef.current = null;
      if (Date.now() - p.ts < 30000) onSent(p.label, p.hidden);
    }
  }, [selectedImage]);

  // Uploading an image (not a capture) pre-fills the one-word command in the
  // text box, so the composer lands ready: picture on top, "Analyze" below,
  // Enter sends it.
  useEffect(() => {
    if (selectedImage && !pendingRef.current) {
      setImageQuestion((prev) => prev || "Analyze");
    }
  }, [selectedImage]);



  const stopWatching = () => {
    const w = watchRef.current;
    if (w.timer) clearInterval(w.timer);
    if (w.stream) w.stream.getTracks().forEach((t) => t.stop());
    watchRef.current = { stream: null, video: null, timer: null, lastSig: null, lastSent: 0, busy: false };
    setWatching(false);
  };

  const startWatching = async () => {
    setShowUploadMenu(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window" },
        preferCurrentTab: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      const w = watchRef.current;
      w.stream = stream;
      w.video = video;
      w.lastSig = null;
      w.lastSent = 0;
      stream.getVideoTracks()[0].addEventListener("ended", stopWatching);
      setWatching(true);
      const tick = () => {
        const ww = watchRef.current;
        if (!ww.video || ww.busy || !ww.video.videoWidth) return;
        const v = ww.video;
        const sc = document.createElement("canvas");
        sc.width = 24;
        sc.height = 24;
        const sctx = sc.getContext("2d");
        sctx.drawImage(v, 0, 0, 24, 24);
        const data = sctx.getImageData(0, 0, 24, 24).data;
        const sig = [];
        for (let i = 0; i < data.length; i += 4) sig.push((data[i] + data[i + 1] + data[i + 2]) / 3);
        let changed = true;
        if (ww.lastSig) {
          let diff = 0;
          for (let i = 0; i < sig.length; i++) diff += Math.abs(sig[i] - ww.lastSig[i]);
          changed = diff / sig.length > 5;
        }
        ww.lastSig = sig;
        const now = Date.now();
        if (changed && now - ww.lastSent > 45000) {
          ww.busy = true;
          ww.lastSent = now;
          const fc = document.createElement("canvas");
          const scale = Math.min(1, 1280 / v.videoWidth);
          fc.width = Math.round(v.videoWidth * scale);
          fc.height = Math.round(v.videoHeight * scale);
          fc.getContext("2d").drawImage(v, 0, 0, fc.width, fc.height);
          fc.toBlob((blob) => {
            if (blob) {
              pendingRef.current = { label: "LOOK", hidden: WATCH_PROMPT, ts: Date.now() };
              handleImageUpload({
                target: { files: [new File([blob], "watch-frame.jpg", { type: "image/jpeg" })], value: "" },
              });
            }
            watchRef.current.busy = false;
          }, "image/jpeg", 0.85);
        }
      };
      w.timer = setInterval(tick, 5000);
    } catch (err) {
      if (err.name !== "NotAllowedError") console.error("Watch mode failed:", err);
    }
  };

  return (
    <div className="main">
      <div className="nav">
        {onMenuClick && (
          <button className="mobile-menu-btn" onClick={onMenuClick}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}
        <div className="nav-profile" ref={profileRef} style={{ display: "none" }}>
          <div onClick={() => setIsProfileOpen(!isProfileOpen)}>
            <UserAvatar size={40} />
          </div>
          {isProfileOpen && (
            <div className={`profile-dropdown ${isProfileOpen ? 'active' : ''}`}>
              <div className="dropdown-item" onClick={handleUpgrade}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Upgrade Plan
              </div>
              <div className="dropdown-item" onClick={() => navigate("/community")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                Community
              </div>
              <div className="dropdown-item" onClick={() => {
                const pin = prompt("Enter admin PIN:");
                if (pin === import.meta.env.VITE_ADMIN_PIN) {
                  sessionStorage.setItem("wallie_admin", "true");
                  navigate("/admin/dashboard");
                }
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                Admin Dashboard
              </div>
              <div className="dropdown-divider" />
              <div className="dropdown-item" onClick={handleLogout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Log Out
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="main-container">
        {watching && (
          <div className="watch-bar">
            <span className="watch-dot" />
            <span>Wallie is watching your session — new verdicts land here as your chart changes.</span>
            <button onClick={stopWatching}>Stop watching</button>
          </div>
        )}
        {!showResult || greetLeaving ? (
          <div className="empty-state">
            <div className={showResult ? "greet leaving" : "greet"}>
              <p>
                <span>Welcome back{firstName ? `, ${firstName}` : ""}</span>
              </p>
              <p>{[0, 6].includes(new Date().getDay()) ? "How can I help you today?" : "How can I assist you in the markets today?"}</p>
            </div>
          </div>
        ) : (
          <div className="result">
            <div className="result-wrapper">
              {chatHistory.map((message, index) => {
                const isLastAi = message.type === 'ai' && index === chatHistory.length - 1;
                const showCursor = isLastAi && isStreaming;
                return (
                <div key={index} className={message.type === 'user' ? 'user-message' : 'result-data'}>
                  {message.type === 'user' ? (
                    <>
                      <div className="result-title">
                        <p>{message.message}</p>
                      </div>
                      {message.image && (
                        <div className="chat-image">
                          <img src={message.image} alt="Uploaded" />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="response-container">
                        {(() => {
                          const vm = message.message.match(/VERDICT:\s*(BULLISH|BEARISH|NEUTRAL)\s+(\d{1,3})\s*%/i);
                          if (!vm) return null;
                          const bias = vm[1].toUpperCase();
                          const conf = Math.min(100, parseInt(vm[2], 10));
                          return (
                            <div className={`verdict-card verdict-${bias.toLowerCase()}`}>
                              <div className="verdict-main">
                                <span className="verdict-bias">{bias === "BULLISH" ? "▲" : bias === "BEARISH" ? "▼" : "◆"} {bias}</span>
                                <span className="verdict-conf-label">Confidence</span>
                                <div className="verdict-bar"><div className="verdict-fill" style={{ width: `${conf}%` }} /></div>
                                <span className="verdict-pct">{conf}%</span>
                              </div>
                              <span className="verdict-note">Wallie's educational read — not a trade signal. The decision is always yours.</span>
                            </div>
                          );
                        })()}
                        <div className={`markdown-content ${showCursor ? "streaming-cursor" : ""}`}>
                          <ReactMarkdown>{message.message.replace(/^\s*VERDICT:\s*(BULLISH|BEARISH|NEUTRAL)\s+\d{1,3}\s*%.*$/im, "").trim()}</ReactMarkdown>
                        </div>
                        <div className="response-controls">
                          <div className="control-buttons">
                            <button
                              className={`control-btn ${isSpeaking ? "active" : ""}`}
                              onClick={() => isSpeaking ? stopSpeaking() : handleTextToSpeech(message.message)}
                              title={isSpeaking ? "Stop Speaking" : "Play Response"}
                            >
                              {isSpeaking ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                                  <path d="M15.54 8.46a5 5 0 010 7.07"/>
                                  <path d="M19.07 4.93a10 10 0 010 14.14"/>
                                </svg>
                              )}
                            </button>
                            <button
                              className={`control-btn ${copiedIndex === index ? "copied" : ""}`}
                              onClick={() => {
                                navigator.clipboard.writeText(message.message);
                                setCopiedIndex(index);
                                setTimeout(() => setCopiedIndex(null), 2000);
                              }}
                              title={copiedIndex === index ? "Copied!" : "Copy Response"}
                            >
                              {copiedIndex === index ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
              })}

              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        <div className="main-bottom">
          {!showResult && (
            <div className="suggest-chips suggest-chips-above">
              <button className="suggest-chip" onClick={() => handleCardClick("Tell me about your capabilities")}>
                <Compass size={15} className="chip-icon" />
                <span>Tell me about your capabilities</span>
              </button>
              <button className="suggest-chip" onClick={() => handleCardClick("What is the current market sentiment on Tesla?")}>
                <TrendingUp size={15} className="chip-icon" />
                <span>Market sentiment on Tesla?</span>
              </button>
              <button className="suggest-chip" onClick={() => handleCardClick("How can I improve my trading strategy today?")}>
                <BookOpen size={15} className="chip-icon" />
                <span>Improve my strategy today</span>
              </button>
              <button className="suggest-chip" onClick={() => handleCardClick("Can you teach me to interpret market volatility")}>
                <BarChart3 size={15} className="chip-icon" />
                <span>Teach me market volatility</span>
              </button>
            </div>
          )}
          <div className={selectedImage ? "search-box has-image" : "search-box"}>
            {selectedImage && (
              <div className="image-preview">
                <div className="uploaded-image">
                  <img
                    src={URL.createObjectURL(selectedImage)}
                    alt="Uploaded"
                  />
                  <button
                    className="preview-remove"
                    aria-label="Remove image"
                    onClick={() => { setSelectedImage(null); setImageQuestion(""); }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            <input
              onChange={(event) => {
                if (selectedImage) {
                  setImageQuestion(event.target.value);
                } else {
                  setInput(event.target.value);
                }
              }}
              onKeyPress={(event) => {
                if (selectedImage) {
                  handleImageQuestionKeyPress(event);
                } else {
                  handleKeyPress(event);
                }
              }}
              value={selectedImage ? imageQuestion : input}
              type="text"
              placeholder={selectedImage ? "Analyze..." : "Ask Wallie anything..."}
            />
            <div className="search-box-icon">
              <div className="upload-menu-wrapper" ref={uploadMenuRef}>
                <div
                  className="image-upload-label"
                  onClick={() => {
                    if (isMobile) {
                      fileInputRef.current?.click();
                    } else {
                      setShowUploadMenu(!showUploadMenu);
                    }
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  <span className="tooltip">Upload charts to Wallie</span>
                </div>
                {showUploadMenu && (
                  <div className="upload-dropdown">
                    {!isMobile && (
                      <div className="upload-dropdown-item" onClick={() => handleScreenCapture(true)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18"/>
                          <path d="M7 15l4-5 3 3 5-7"/>
                        </svg>
                        Analyze My Chart
                      </div>
                    )}
                    {!isMobile && (
                      <div className="upload-dropdown-item" onClick={watching ? stopWatching : startWatching}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {watching ? "Stop Watching" : "Watch My Session"}
                      </div>
                    )}
                    {!isMobile && (
                      <div className="upload-dropdown-item" onClick={() => handleScreenCapture(false)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        Screenshot Window
                      </div>
                    )}

                    <div className="upload-dropdown-item" onClick={() => { setShowUploadMenu(false); fileInputRef.current?.click(); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      {isMobile ? "Upload Chart Photo" : "Upload from Device"}
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />

              <div className="mic-button-wrapper" onClick={handleMicClick}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isListening ? "#4B90FF" : "rgba(255,255,255,0.7)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isListening ? "mic-listening" : ""}
                >
                  <rect x="9" y="1" width="6" height="12" rx="3"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <span className="tooltip">Talk to Wallie</span>
                {isListening && (
                  <div className="speaking-animation">
                    <div className="speaking-dot"></div>
                    <div className="speaking-dot"></div>
                    <div className="speaking-dot"></div>
                  </div>
                )}
              </div>
              {(input || selectedImage) && (
                <div className="send-button-wrapper" onClick={() => (selectedImage ? submitImageQuestion() : onSent())}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  <span className="tooltip">Send Message</span>
                </div>
              )}
            </div>
          </div>
          {isLimitedPlan && (
            <p className="free-tier-counter">
              {hasReachedLimit
                ? "Daily messages used — resets in 24 hours"
                : `${freeLimit - messagesUsed} message${freeLimit - messagesUsed !== 1 ? "s" : ""} remaining today`
              }
            </p>
          )}
          <p className="bottom-info">
          Wallie AI offers guidance but is not a substitute for professional advice. Verify crucial details independently.          </p>
        </div>
      </div>

      {/* Paywall Overlay */}
      {showPaywall && (
        <div className="paywall-overlay">
          <div className="paywall-modal">
            <div className="paywall-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <h2>You've used all your free messages today</h2>
            <p>Your {freeLimit} daily messages will reset in 24 hours. Upgrade to a paid plan for unlimited access, advanced chart analysis, and more.</p>
            <button className="paywall-upgrade-btn" onClick={() => navigate("/pricing")}>
              View Plans
            </button>
            <button className="paywall-dismiss-btn" onClick={() => setShowPaywall(false)}>
              I'll wait for the reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Main;

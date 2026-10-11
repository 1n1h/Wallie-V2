import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { VOICE_OPTIONS } from "../../config/tts";
import "./Settings.css";

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Settings state
  const [theme, setTheme] = useState("dark");
  const [userPersona, setUserPersona] = useState("");
  const [voiceId, setVoiceId] = useState("am_adam");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [fontSize, setFontSize] = useState("medium");

  // Load settings from Firestore
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const s = snap.data().settings || {};
          if (s.theme) setTheme(s.theme);
          if (s.userPersona) setUserPersona(s.userPersona);
          if (s.voiceId) setVoiceId(s.voiceId);
          if (s.ttsEnabled !== undefined) setTtsEnabled(s.ttsEnabled);
          if (s.fontSize) setFontSize(s.fontSize);
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      }
    };
    load();
  }, [user]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Apply font size
  useEffect(() => {
    document.documentElement.setAttribute("data-font-size", fontSize);
  }, [fontSize]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        settings: { theme, userPersona, voiceId, ttsEnabled, fontSize },
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleClearChats = async () => {
    if (!window.confirm("Clear all chat history? This cannot be undone.")) return;
    try {
      await setDoc(doc(db, "users", user.uid), { savedChats: [] }, { merge: true });
      alert("Chat history cleared. Refresh to see changes.");
    } catch (err) {
      console.error("Error clearing chats:", err);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="settings-back" onClick={() => navigate("/chat")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
          Back to Chat
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings-grid">
        {/* Theme */}
        <div className="settings-card">
          <h2>Appearance</h2>
          <div className="settings-field">
            <label>Theme</label>
            <div className="settings-toggle-group">
              {["dark", "light"].map((t) => (
                <button
                  key={t}
                  className={`settings-toggle ${theme === t ? "active" : ""}`}
                  onClick={() => setTheme(t)}
                >
                  {t === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-field">
            <label>Font Size</label>
            <div className="settings-toggle-group">
              {["small", "medium", "large"].map((s) => (
                <button
                  key={s}
                  className={`settings-toggle ${fontSize === s ? "active" : ""}`}
                  onClick={() => setFontSize(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Persona / System Prompt */}
        <div className="settings-card settings-card-wide">
          <h2>Your Trading Profile</h2>
          <p className="settings-desc">
            Tell Wallie about yourself so it can tailor responses to your trading style.
            This is saved to your account and included in every conversation.
          </p>
          <textarea
            className="settings-textarea"
            value={userPersona}
            onChange={(e) => setUserPersona(e.target.value)}
            placeholder="e.g. I trade forex and crypto. I'm a beginner with 6 months of experience focusing on swing trades. I want to learn more about risk management and reading price action."
            rows={5}
            maxLength={500}
          />
          <span className="settings-char-count">{userPersona.length}/500</span>
        </div>

        {/* Voice */}
        <div className="settings-card">
          <h2>Voice & Audio</h2>
          <div className="settings-field">
            <label>Text-to-Speech</label>
            <div className="settings-toggle-group">
              <button
                className={`settings-toggle ${ttsEnabled ? "active" : ""}`}
                onClick={() => setTtsEnabled(true)}
              >On</button>
              <button
                className={`settings-toggle ${!ttsEnabled ? "active" : ""}`}
                onClick={() => setTtsEnabled(false)}
              >Off</button>
            </div>
          </div>
          {ttsEnabled && (
            <div className="settings-field">
              <label>Voice</label>
              <div className="settings-voice-grid">
                {VOICE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    className={`settings-voice-btn ${voiceId === v.id ? "active" : ""}`}
                    onClick={() => setVoiceId(v.id)}
                  >
                    <span className="voice-name">{v.name}</span>
                    <span className="voice-desc">{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Data */}
        <div className="settings-card">
          <h2>Data & Privacy</h2>
          <div className="settings-field">
            <label>Chat History</label>
            <button className="settings-danger-btn" onClick={handleClearChats}>
              Clear All Chats
            </button>
          </div>
          <p className="settings-hint">
            Your chat history is stored in your account. Clearing it removes all saved conversations.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="settings-save-bar">
        <button
          className={`settings-save-btn ${saved ? "saved" : ""}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
};

export default Settings;

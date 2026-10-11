import "./SoulCard.css";
import { useContext, useState } from "react";
import { Context } from "../../context/Context";
import { SOUL_FILES } from "../../config/wallieSoul";

// Wallie's Soul & Memory — the user's own IDENTITY.md / SOUL.md / MEMORY.md.
// Wallie reads all three before every conversation, layered on top of its
// core prompt. Everything here is editable by the user and saved to their
// account (users/{uid}.soul).
const SoulCard = () => {
  const { wallieSoul, saveSoulFile } = useContext(Context);
  const [editing, setEditing] = useState(null); // SOUL_FILES entry being edited
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const openEditor = (f) => {
    setEditing(f);
    setDraft(wallieSoul?.[f.key] ?? "");
    setSavedTick(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    await saveSoulFile(editing.key, draft);
    setSaving(false);
    setSavedTick(true);
    setTimeout(() => setEditing(null), 450);
  };

  const preview = (key) => {
    const text = (wallieSoul?.[key] ?? "").trim();
    if (!text) return "Nothing saved yet — tap Edit to start.";
    const firstLine = text.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
    return firstLine.length > 64 ? firstLine.slice(0, 64) + "…" : firstLine;
  };

  return (
    <>
      <div className="pp-card soul-card">
        <div className="pp-card-head">
          <span className="pp-card-title">Soul &amp; Memory</span>
          <span className="soul-live">Active</span>
        </div>
        <div className="soul-files">
          {SOUL_FILES.map((f) => (
            <button key={f.key} className="soul-file" onClick={() => openEditor(f)}>
              <span className="soul-file-main">
                <span className="soul-file-name">{f.file}</span>
                <span className="soul-file-preview">{preview(f.key)}</span>
              </span>
              <span className="soul-file-edit">Edit</span>
            </button>
          ))}
        </div>
        <p className="pp-card-note">
          Wallie reads these before every chat — its identity, its soul, and
          what it remembers about you. Make them yours.
        </p>
      </div>

      {editing && (
        <div className="soul-overlay" onClick={() => !saving && setEditing(null)}>
          <div className="soul-modal" onClick={(e) => e.stopPropagation()}>
            <div className="soul-modal-head">
              <span className="soul-modal-file">{editing.file}</span>
              <span className="soul-modal-label">{editing.label}</span>
            </div>
            <p className="soul-modal-hint">{editing.hint}</p>
            <textarea
              className="soul-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              maxLength={4000}
              autoFocus
              spellCheck={false}
            />
            <span className="soul-char-count">{draft.length}/4000</span>
            <div className="soul-modal-actions">
              <button
                className="soul-btn soul-btn-ghost"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="soul-btn soul-btn-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : savedTick ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SoulCard;

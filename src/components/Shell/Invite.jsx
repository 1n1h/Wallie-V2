import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, Check, Copy, UserPlus, X } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext.jsx";
import { db } from "../../firebase";
import wallieMark from "../../assets/wallie-mark.png";
import "./Invite.css";

// A user's referral code is derived from their account id: stable,
// unique enough, and never exposes their email.
export function referralCodeFor(uid) {
  return (uid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
}

function InviteCard({ onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    (async () => {
      const fallback = { code: "", joined: 0, coupons: 0, myReward: false };
      if (!user) {
        setData(fallback);
        return;
      }
      const code = referralCodeFor(user.uid);
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        const d = snap.exists() ? snap.data() : {};
        if (snap.exists() && d.referralCode !== code) {
          updateDoc(ref, { referralCode: code }).catch(() => {});
        }
        if (!live) return;
        setData({
          code,
          joined: (d.referrals && d.referrals.joined) || 0,
          coupons: (d.referrals && d.referrals.coupons) || 0,
          myReward: !!(d.refReward && d.refReward.status === "banked"),
        });
      } catch {
        if (live) setData({ ...fallback, code });
      }
    })();
    return () => {
      live = false;
    };
  }, [user]);

  const link = data && data.code ? window.location.origin + "/?ref=" + data.code : "";
  const displayLink = data && data.code ? "wallieai.com/?ref=" + data.code : "Loading your link…";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joined = data ? data.joined : 0;
  const coupons = data ? data.coupons : 0;

  return (
    <div className="inv-wrap">
      <div className="inv-catcher" onClick={onClose} />
      <div className="inv-card" role="dialog" aria-label="Invite friends">
        <button className="inv-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <div className="inv-logo">
          <img src={wallieMark} alt="Wallie" />
        </div>
        <h3 className="inv-title">Invite friends</h3>
        <p className="inv-sub">
          Share Wallie with a friend. When they join with your link, you both get 20% off your
          first month of Pro — applied automatically.
        </p>
        <div className="inv-link" title={link}>
          {displayLink}
        </div>
        <button className="inv-copy" onClick={copy} disabled={!link}>
          {copied ? (
            <>
              <Check size={17} /> Copied
            </>
          ) : (
            <>
              <Copy size={17} /> Copy referral link
            </>
          )}
        </button>
        <div className="inv-status">
          <span className="inv-status-icon">
            <BadgePercent size={19} />
          </span>
          <span className="inv-status-text">
            <strong>
              {coupons > 0 ? "You've banked " + coupons + " × 20% off" : "No rewards yet"}
            </strong>
            <span>
              {joined === 0
                ? "Your first reward lands the moment a friend joins with your link."
                : joined + (joined === 1 ? " friend" : " friends") + " joined with your link."}
              {data && data.myReward ? " Your own 20% welcome reward is banked too." : ""}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function InviteButton() {
  const [open, setOpen] = useState(false);

  // Settings (and anywhere else) can ask this pop-out to open.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener("wallie:open-invite", openIt);
    return () => window.removeEventListener("wallie:open-invite", openIt);
  }, []);
  return (
    <>
      <button className="invite-pill" onClick={() => setOpen(true)}>
        <UserPlus size={15} strokeWidth={2} /> Invite
      </button>
      {open && createPortal(<InviteCard onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

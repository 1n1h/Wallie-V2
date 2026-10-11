import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import wallieLogo from "../../assets/wallie-mark.png";
import "./MaintenancePage.css";

const ADMIN_PASSWORD = "1906";

const MaintenancePage = ({ onUnlock }) => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [showPasscode, setShowPasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const id = email.replace(/[^a-zA-Z0-9]/g, "");
      await setDoc(doc(db, "waitlist", id), {
        name,
        phone,
        email,
        source,
        timestamp: serverTimestamp(),
      });
      setSuccess(true);
      setName("");
      setPhone("");
      setEmail("");
      setSource("");
    } catch {
      alert("Error joining waitlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasscode = (e) => {
    e.preventDefault();
    if (passcode === ADMIN_PASSWORD) {
      sessionStorage.setItem("wallie_bypass", "true");
      sessionStorage.setItem("wallie_admin", "true");
      onUnlock();
      navigate("/admin/dashboard");
    } else {
      setPasscodeError("Invalid passcode");
      setPasscode("");
    }
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-content">
        <img src={wallieLogo} alt="Wallie AI" className="maintenance-logo" />
        <h1 className="maintenance-title">We're Upgrading Your Experience</h1>
        <p className="maintenance-subtitle">
          Wallie AI is getting some major improvements. Join the waitlist to be the first to know when we're back.
        </p>

        {success ? (
          <div className="maintenance-success">
            <span className="maintenance-check">&#10003;</span>
            <h2>You're on the list!</h2>
            <p>We'll notify you as soon as Wallie AI is live again.</p>
          </div>
        ) : (
          <form className="maintenance-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">How did you hear about us?</option>
              <option value="twitter">Twitter</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="friend">Friend / Referral</option>
              <option value="reddit">Reddit</option>
              <option value="discord">Discord</option>
              <option value="google">Google Search</option>
              <option value="other">Other</option>
            </select>
            <button type="submit" disabled={loading}>
              {loading ? "Joining..." : "Join the Waitlist"}
            </button>
          </form>
        )}

        <div className="maintenance-footer">
          <p>Questions? Reach out at <a href="mailto:support@wallieai.com">support@wallieai.com</a></p>
          <div className="maintenance-socials">
            <a href="https://twitter.com/wallieai" target="_blank" rel="noreferrer">Twitter</a>
            <a href="https://instagram.com/wallieai" target="_blank" rel="noreferrer">Instagram</a>
            <a href="https://tiktok.com/@wallieai" target="_blank" rel="noreferrer">TikTok</a>
          </div>
        </div>

        {/* Admin bypass */}
        <div className="maintenance-admin">
          {!showPasscode ? (
            <button
              className="maintenance-admin-btn"
              onClick={() => setShowPasscode(true)}
            >
              Admin Access
            </button>
          ) : (
            <form className="maintenance-passcode-form" onSubmit={handlePasscode}>
              <input
                type="password"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => { setPasscode(e.target.value); setPasscodeError(""); }}
                autoFocus
              />
              <button type="submit">Unlock</button>
              {passcodeError && <p className="maintenance-passcode-error">{passcodeError}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;

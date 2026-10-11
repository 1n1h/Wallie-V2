import { useState } from "react";
import { Link } from "react-router-dom";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import "./Affiliates.css";

const Affiliates = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [signupForm, setSignupForm] = useState({ name: "", phone: "", email: "", socialHandle: "" });
  const [submitted, setSubmitted] = useState(false);

  const generateCode = (email) => {
    return email.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const code = generateCode(signupForm.email);
      const ref = doc(db, "affiliates", code);
      const existing = await getDoc(ref);

      if (existing.exists()) {
        // Already applied
        setSubmitted(true);
      } else {
        const data = {
          name: signupForm.name,
          phone: signupForm.phone,
          email: signupForm.email,
          socialHandle: signupForm.socialHandle,
          code,
          referralLink: `${window.location.origin}?ref=${code}`,
          signups: 0,
          earnings: 0,
          balance: 0,
          paidOut: 0,
          commissionRate: 40,
          status: "pending", // pending | approved | rejected
          createdAt: serverTimestamp(),
          userId: user?.uid || null,
        };
        await setDoc(ref, data);
        setSubmitted(true);
      }
    } catch (err) {
      console.error("Affiliate signup error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aff-page">
      <nav className="aff-nav">
        <Link to="/" className="aff-back">&larr; Back to Home</Link>
      </nav>

      <div className="aff-container">
        <h1 className="aff-title">
          <span className="aff-gradient-text">Affiliate</span> Program
        </h1>
        <p className="aff-subtitle">
          Earn commission for life when you invite somebody to join Wallie AI.
        </p>

        {!submitted ? (
          <form className="aff-signup-form" onSubmit={handleJoin}>
            <input
              type="text"
              placeholder="Full Name"
              value={signupForm.name}
              onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
              required
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={signupForm.phone}
              onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email Address"
              value={signupForm.email}
              onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
              required
            />
            <input
              type="text"
              placeholder="Social Media Handle (e.g. @yourname)"
              value={signupForm.socialHandle}
              onChange={(e) => setSignupForm({ ...signupForm, socialHandle: e.target.value })}
              required
            />
            <button type="submit" className="aff-join-btn" disabled={loading}>
              {loading ? "Submitting..." : "APPLY TO BECOME AN AFFILIATE"}
            </button>
          </form>
        ) : (
          <div className="aff-success-card">
            <div className="aff-success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>Thanks for Applying!</h2>
            <p>
              We're excited you want to join the Wallie AI Affiliate Program.
              Affiliates earn <strong>40–60% commission</strong> per month on every paying subscriber they refer.
            </p>
            <p className="aff-success-contact">
              Someone from our team will be contacting you shortly at the email you provided to finalize your application and get you set up with your unique referral link.
            </p>
            <Link to="/" className="aff-home-btn">Back to Home</Link>
          </div>
        )}

        {/* How it works */}
        <div className="aff-how">
          <h2>How it works</h2>
          <div className="aff-how-steps">
            <div className="aff-how-step">
              <div className="aff-how-num">1</div>
              <h3>Apply</h3>
              <p>Submit your application and our team will review it.</p>
            </div>
            <div className="aff-how-step">
              <div className="aff-how-num">2</div>
              <h3>Get Your Link</h3>
              <p>Once approved, you'll receive a unique referral link to share.</p>
            </div>
            <div className="aff-how-step">
              <div className="aff-how-num">3</div>
              <h3>Earn 40–60%</h3>
              <p>Earn recurring commission on every paying subscriber you refer.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Affiliates;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import "./Pricing.css";

const FREE_MESSAGE_LIMIT = 20;

const PLANS = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    features: [
      "20 AI messages per day",
      "AI-powered market discussion",
      "Community access",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 9,
    features: [
      "75 AI messages per day",
      "AI-powered market discussion",
      "Priority support",
      "Chart analysis tools",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 29,
    featured: true,
    features: [
      "Unlimited AI responses",
      "In-depth market discussion",
      "Priority 24/7 support",
      "Market news summaries",
      "Personalized AI conversations",
    ],
  },
];

// Payment Link URLs from Stripe Dashboard (create at https://dashboard.stripe.com/payment-links)
const PAYMENT_LINKS = {
  basic_monthly: import.meta.env.VITE_STRIPE_LINK_BASIC_MONTHLY || "",
  basic_annual: import.meta.env.VITE_STRIPE_LINK_BASIC_ANNUAL || "",
  pro_monthly: import.meta.env.VITE_STRIPE_LINK_PRO_MONTHLY || "",
  pro_annual: import.meta.env.VITE_STRIPE_LINK_PRO_ANNUAL || "",
};

const DISCLAIMER_TEXT = `Wallie AI provides educational content and general market commentary only. Nothing provided by Wallie AI constitutes financial advice, investment advice, trading advice, or any other form of professional advice.

Trading stocks, options, forex, cryptocurrency, and other financial instruments involves substantial risk of loss and is not suitable for every investor. Past performance is not indicative of future results. You should consult with a qualified financial advisor before making any investment decisions.

By using Wallie AI, you acknowledge that you are solely responsible for your own trading and investment decisions, and Wallie AI, its creators, affiliates, and partners shall not be held liable for any financial losses incurred as a result of using this service.`;

const Pricing = () => {
  const [billing, setBilling] = useState("monthly");
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [existingSub, setExistingSub] = useState(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check existing subscription + disclaimer status on mount
  useEffect(() => {
    if (!user) return;
    const checkSub = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const sub = data.subscription;
          setExistingSub(sub || null);
          // If already accepted disclaimer, remember it
          if (data.disclaimerAccepted) {
            setDisclaimerAgreed(true);
          }
          // If user already has an active paid subscription, skip straight to chat
          if (sub?.status === "active") {
            navigate("/chat", { replace: true });
          }
        }
      } catch (err) {
        console.error("Subscription check error:", err);
      }
    };
    checkSub();
  }, [user, navigate]);

  const proceedWithFree = async () => {
    setLoadingPlan("free");
    try {
      const subData = {
        plan: "free",
        messageLimit: FREE_MESSAGE_LIMIT,
      };
      if (!existingSub || existingSub.plan !== "free") {
        subData.messagesUsed = 0;
        subData.startedAt = serverTimestamp();
      }
      await setDoc(doc(db, "users", user.uid), {
        subscription: subData,
        disclaimerAccepted: true,
      }, { merge: true });
      navigate("/chat");
    } catch (err) {
      console.error("Free plan error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleContinueFree = async () => {
    if (!user) {
      navigate("/signup");
      return;
    }
    // If already accepted disclaimer, skip it
    if (disclaimerAgreed) {
      return proceedWithFree();
    }
    setPendingPlan({ id: "free" });
    setShowDisclaimer(true);
  };

  const getPrice = (plan) => {
    if (billing === "annual") {
      return Math.round(plan.monthlyPrice * 0.8);
    }
    return plan.monthlyPrice;
  };

  const getAnnualTotal = (plan) => {
    return Math.round(plan.monthlyPrice * 0.8 * 12);
  };

  const proceedWithPaid = async (plan) => {
    const paymentLink = PAYMENT_LINKS[`${plan.id}_${billing}`];

    if (!paymentLink) {
      alert("Stripe is not fully configured yet. Please contact support.");
      return;
    }

    setLoadingPlan(plan.id);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        "subscription.selectedPlan": plan.id,
        "subscription.selectedBilling": billing,
        "subscription.updatedAt": serverTimestamp(),
      });

      // Save disclaimer acceptance before redirecting to Stripe
      await setDoc(doc(db, "users", user.uid), {
        disclaimerAccepted: true,
      }, { merge: true });

      const successUrl = encodeURIComponent(`${window.location.origin}/chat?subscription=success`);
      const prefillEmail = encodeURIComponent(user.email || "");

      window.location.href = `${paymentLink}?prefilled_email=${prefillEmail}&client_reference_id=${user.uid}&success_url=${successUrl}`;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong. Please try again.");
      setLoadingPlan(null);
    }
  };

  const handleSelectPlan = async (plan) => {
    if (!user) {
      navigate("/signup");
      return;
    }

    // Free plan uses its own handler
    if (plan.id === "free") {
      return handleContinueFree();
    }

    // If already accepted disclaimer, skip it
    if (disclaimerAgreed) {
      return proceedWithPaid(plan);
    }

    setPendingPlan(plan);
    setShowDisclaimer(true);
  };

  const handleDisclaimerAccept = () => {
    setDisclaimerAgreed(true);
    setShowDisclaimer(false);
    if (pendingPlan?.id === "free") {
      proceedWithFree();
    } else if (pendingPlan) {
      proceedWithPaid(pendingPlan);
    }
  };

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <button onClick={() => navigate(-1)} className="back-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1>Choose Your Plan</h1>
        <p>Pick the plan that fits your <strong>needs</strong></p>
      </div>

      <div className="billing-toggle">
        <button
          className={billing === "monthly" ? "active" : ""}
          onClick={() => setBilling("monthly")}
        >
          Monthly
        </button>
        <button
          className={billing === "annual" ? "active" : ""}
          onClick={() => setBilling("annual")}
        >
          Annual
          <span className="save-badge">Save 20%</span>
        </button>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <div className={`pricing-card ${plan.featured ? "featured" : ""}`} key={plan.id}>
            {plan.featured && <div className="popular-badge">Most Popular</div>}
            <div className="plan-header">
              <h2>{plan.name}</h2>
              <div className="price">
                <span className="amount">${plan.id === "free" ? 0 : getPrice(plan)}</span>
                <span className="period">/month</span>
              </div>
              {plan.id !== "free" && billing === "annual" && (
                <div className="annual-note">
                  ${getAnnualTotal(plan)}/year — save ${(plan.monthlyPrice * 12) - getAnnualTotal(plan)}/yr
                </div>
              )}
              {plan.id === "free" ? (
                <div className="trial-badge">No card required</div>
              ) : (
                <div className="trial-badge">Cancel anytime</div>
              )}
            </div>
            <ul className="features">
              {plan.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button
              className={`select-plan ${plan.featured ? "featured" : ""}`}
              onClick={() => handleSelectPlan(plan)}
              disabled={loadingPlan === plan.id}
            >
              {loadingPlan === plan.id
                ? (plan.id === "free" ? "Setting up..." : "Redirecting...")
                : (plan.id === "free" ? "Start Free Trial" : "Subscribe")
              }
            </button>
          </div>
        ))}
      </div>

      <p className="pricing-footer">
        Cancel or change your plan anytime. No long-term commitments.
      </p>

      {/* Trading Disclaimer Modal */}
      {showDisclaimer && (
        <div className="disclaimer-overlay" onClick={() => setShowDisclaimer(false)}>
          <div className="disclaimer-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Trading Disclaimer</h2>
            <div className="disclaimer-text">
              {DISCLAIMER_TEXT.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <label className="disclaimer-checkbox">
              <input
                type="checkbox"
                checked={disclaimerAgreed}
                onChange={(e) => setDisclaimerAgreed(e.target.checked)}
              />
              <span>I have read and agree to the above disclaimer</span>
            </label>
            <div className="disclaimer-actions">
              <button
                className="disclaimer-cancel"
                onClick={() => {
                  setShowDisclaimer(false);
                  setDisclaimerAgreed(false);
                  setPendingPlan(null);
                }}
              >
                Cancel
              </button>
              <button
                className="disclaimer-accept"
                disabled={!disclaimerAgreed}
                onClick={handleDisclaimerAccept}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;

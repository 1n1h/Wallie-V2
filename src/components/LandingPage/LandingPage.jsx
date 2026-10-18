import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import wallieLogo from "../../assets/wallie-mark.png";
import { BrainCircuit, BarChart3, Globe, Mic, TrendingUp, Users, HandCoins } from "lucide-react";
import "./LandingPage.css";
import { TiltedGridHero } from "@/components/ui/tilted-grid-hero";
import heroImg1 from "../../assets/hero/hero-1.jpg";
import heroImg2 from "../../assets/hero/hero-2.jpg";
import heroImg3 from "../../assets/hero/hero-3.jpg";
import heroImg4 from "../../assets/hero/hero-4.jpg";
import heroImg5 from "../../assets/hero/hero-5.jpg";
import heroImg6 from "../../assets/hero/hero-6.jpg";
import heroImg7 from "../../assets/hero/hero-7.jpg";
import heroImg8 from "../../assets/hero/hero-8.jpg";
import heroImg9 from "../../assets/hero/hero-9.jpg";
import heroImg10 from "../../assets/hero/hero-10.jpg";
import heroImg11 from "../../assets/hero/hero-11.jpg";

// Hero band imagery (Travis's picks) — the band cycles the list.
const HERO_IMAGES = [
  { src: heroImg1, alt: "" },
  { src: heroImg2, alt: "" },
  { src: heroImg3, alt: "" },
  { src: heroImg4, alt: "" },
  { src: heroImg5, alt: "" },
  { src: heroImg6, alt: "" },
  { src: heroImg7, alt: "" },
  { src: heroImg8, alt: "" },
  { src: heroImg9, alt: "" },
  { src: heroImg10, alt: "" },
  { src: heroImg11, alt: "" },
];

// Scroll-reveal hook
const useReveal = () => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); observer.unobserve(el); } },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, loginWithGoogle, loginWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reveal refs
  const statsRef = useReveal();
  const aboutRef = useReveal();
  const featuresRef = useReveal();
  const howRef = useReveal();
  const faqRef = useReveal();
  const reviewsRef = useReveal();
  const appsRef = useReveal();
  const chartRef = useReveal();
  const controlRef = useReveal();

  // Redirect to chat if already logged in (handles mobile redirect sign-in)
  useEffect(() => {
    if (user) {
      navigate("/chat");
    }
  }, [user, navigate]);

  // Capture affiliate referral code from URL
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("wallie_ref", ref);
  });
  const [openFaq, setOpenFaq] = useState(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const u = await loginWithGoogle();
      if (!u) return; // Mobile redirect
      navigate("/chat");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const u = await loginWithApple();
      if (!u) return; // Mobile redirect
      navigate("/chat");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: <BrainCircuit size={28} />,
      title: "AI-Powered Discussion",
      desc: "Explore market topics and discuss trading concepts with AI-powered conversational tools.",
    },
    {
      icon: <BarChart3 size={28} />,
      title: "Chart Discussion",
      desc: "Upload any chart and discuss indicators, patterns, and potential scenarios with Wallie.",
    },
    {
      icon: <Globe size={28} />,
      title: "Real-Time Web Search",
      desc: "Wallie searches the web in real-time to bring you the latest news, data, and market updates.",
    },
    {
      icon: <Mic size={28} />,
      title: "Voice Interaction",
      desc: "Talk to Wallie with voice input and listen to responses with natural text-to-speech.",
    },
    {
      icon: <TrendingUp size={28} />,
      title: "Educational Insights",
      desc: "Explore bullish and bearish scenarios, learn about support/resistance levels and risk concepts.",
    },
    {
      icon: <Users size={28} />,
      title: "Wallie Community",
      desc: "Share ideas, post charts, like and comment — connect with traders and climb the ranks.",
    },
    {
      icon: <HandCoins size={28} />,
      title: "Affiliate Program",
      desc: "Earn commissions by referring traders to Wallie. Share your link, get paid when they sign up.",
    },
  ];

  const faqs = [
    {
      q: "What is Wallie AI?",
      a: "Wallie AI is an AI-powered trading companion. It combines powerful language models with real-time web search to help you discuss charts, explore market topics, and learn about trading concepts.",
    },
    {
      q: "Is Wallie AI free to use?",
      a: "Yes! Wallie AI is currently in beta and free to use. Sign up with Google, Apple, or email to get started instantly.",
    },
    {
      q: "Can Wallie discuss my charts?",
      a: "Absolutely. Upload any chart image and Wallie will help you explore key indicators like price action, volume, MACD, and RSI, and discuss potential scenarios and patterns.",
    },
    {
      q: "Does Wallie provide financial advice?",
      a: "No. Wallie is an educational and discussion tool, not a financial advisor. It does not provide financial advice, trading signals, or specific investment recommendations. Always do your own research and consult a licensed financial advisor before making investment decisions.",
    },
    {
      q: "How does the web search feature work?",
      a: "When you ask about current events, prices, or news, Wallie automatically searches the web to find the most up-to-date information and summarizes it for you.",
    },
    {
      q: "What markets does Wallie cover?",
      a: "Wallie can discuss stocks, crypto, forex, commodities, and more. If there's a chart or data available, Wallie can help you explore and learn about it.",
    },
  ];

  const reviews = [
    { name: "Marcus T.", role: "Day Trader", text: "Wallie changed how I approach my morning research. Having an AI to discuss charts with saves me so much time exploring ideas." },
    { name: "Sarah K.", role: "Crypto Enthusiast", text: "I've tried dozens of AI tools. Wallie is the only one that actually understands market context and helps me think through different scenarios." },
    { name: "David R.", role: "Swing Trader", text: "The web search integration is great. I ask Wallie about breaking news and get instant summaries to help me stay informed." },
    { name: "Jessica M.", role: "Forex Learner", text: "As someone new to forex, Wallie has been like having a study partner. It explains complex patterns in ways I can actually understand." },
    { name: "Anthony L.", role: "Options Enthusiast", text: "The voice feature is incredible. I talk to Wallie while watching charts and get responses without taking my eyes off the screen." },
    { name: "Priya S.", role: "Finance Professional", text: "I recommend Wallie for anyone doing their own research. It's a great tool for exploring market topics and learning new concepts." },
    { name: "Chris W.", role: "Retail Trader", text: "Finally an AI that doesn't just regurgitate generic info. Wallie actually discusses YOUR chart and helps you think through what you're seeing." },
    { name: "Nina P.", role: "Crypto Enthusiast", text: "The speed is great. I upload a chart and within seconds I can start a discussion about patterns, indicators, and what to research further." },
    { name: "Robert J.", role: "Stock Enthusiast", text: "Been using Wallie for 3 months and it's become part of my daily research routine. The real-time data integration is really helpful." },
    { name: "Elena V.", role: "Hobbyist Trader", text: "I use Wallie to discuss and explore ideas before making any decisions. It's a great companion for learning and staying informed." },
  ];

  const [isPaused, setIsPaused] = useState(false);

  return (
    <div className="lp">
      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-nav-left">
          <img src={wallieLogo} alt="Wallie" className="lp-nav-logo" />
          <span className="lp-nav-brand">Wallie AI</span>
        </div>
        <div className="lp-nav-actions">
          <Link to="/signup" className="lp-nav-cta">
            Get started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="lp-hero">
        <TiltedGridHero
          images={HERO_IMAGES}
          tileHeight={30}
          axis={60}
          curve={72}
          gap={10}
          speed={4.5}
          className="lp-hero-tilt"
        >
          <div className="lp-hero-content">
            <img src={wallieLogo} alt="Wallie" className="lp-hero-mark" />
            <h1 className="lp-hero-title">
              Wallie, AI that turns charts into clarity
            </h1>
            <div className="lp-hero-actions">
              <button
                className="lp-btn lp-btn-blue"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                Continue with Google
              </button>
              <button
                className="lp-btn lp-btn-gray"
                onClick={handleAppleLogin}
                disabled={loading}
              >
                Continue with Apple
              </button>
              <button
                className="lp-btn lp-btn-gray"
                onClick={() => navigate("/signup")}
                disabled={loading}
              >
                Sign up with email
              </button>
              {error && <p className="lp-hero-error">{error}</p>}
            </div>
            <p className="lp-hero-note">Free while in beta · No card required</p>
          </div>
        </TiltedGridHero>
      </header>

      {/* STATS */}
      <section className="lp-stats reveal" ref={statsRef}>
        <div className="lp-stat">
          <span className="lp-stat-num">50+</span>
          <span className="lp-stat-label">Markets Covered</span>
        </div>
        <div className="lp-stat">
          <span className="lp-stat-num">24/7</span>
          <span className="lp-stat-label">Always Available</span>
        </div>
      </section>

      {/* WHAT IS WALLIE — light card */}
      <section className="lp-about reveal" ref={aboutRef}>
        <div className="lp-light-card">
          <h2 className="lp-light-title">Wallie is your personal trading coach</h2>
          <p className="lp-light-text">
            Most new traders quit because nobody teaches them properly — they
            get sold dreams by people who don't trade. Wallie is the opposite:
            a patient AI coach that works the chart with you, out loud, step by
            step, until the plan makes sense.
          </p>
          <div className="lp-light-points">
            <div className="lp-light-point">
              <span className="lp-light-check">✓</span>
              Draws trendlines, support &amp; resistance, and Fibonacci
              confluence on your chart — and shows its work
            </div>
            <div className="lp-light-point">
              <span className="lp-light-check">✓</span>
              Learns your routine, your markets, and your past trades from
              your journal
            </div>
            <div className="lp-light-point">
              <span className="lp-light-check">✓</span>
              Watches your watchlist and taps your shoulder when price walks
              into a zone you care about
            </div>
            <div className="lp-light-point">
              <span className="lp-light-check">✓</span>
              Education only — Wallie never trades for you and never will
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-features lp-band-light reveal" id="features" ref={featuresRef}>
        <h2 className="lp-section-title">What Wallie can do</h2>
        <div className="lp-features-grid">
          {features.map((f, i) => (
            <div className="lp-feature-card" key={i}>
              <div className="lp-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SHOWCASE — chart drawing */}
      <section className="lp-showcase reveal" ref={chartRef}>
        <div className="lp-mock">
          <div className="lp-mock-head">
            <img src={wallieLogo} alt="" className="lp-mock-logo" />
            <div>
              <span className="lp-mock-name">Wallie</span>
              <span className="lp-mock-status">Drawing on BTC · 1H…</span>
            </div>
          </div>
          <svg viewBox="0 0 320 170" className="lp-mock-chart" aria-hidden="true">
            <line x1="0" y1="42" x2="320" y2="42" stroke="#2E2E30" strokeWidth="1" />
            <line x1="0" y1="84" x2="320" y2="84" stroke="#2E2E30" strokeWidth="1" />
            <line x1="0" y1="126" x2="320" y2="126" stroke="#2E2E30" strokeWidth="1" />
            <line x1="10" y1="118" x2="310" y2="34" stroke="#F5F5F7" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" />
            <line x1="0" y1="58" x2="320" y2="58" stroke="#0A84FF" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
            <line x1="0" y1="98" x2="320" y2="98" stroke="#0A84FF" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.55" />
            <text x="6" y="52" fill="#A1A1A6" fontSize="8">61.8%</text>
            <text x="6" y="92" fill="#A1A1A6" fontSize="8">50%</text>
            <polyline points="8,128 52,96 84,112 118,66 150,84 186,48 220,66 254,40 286,52 312,30" fill="none" stroke="#4B93FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="254" cy="40" r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          </svg>
          <div className="lp-mock-bubble">
            Two levels land in the same zone — the trendline and the 61.8%
            retracement. That overlap is called confluence, and it is where
            patient traders pay attention.
          </div>
          <div className="lp-mock-actions">
            <span className="lp-mock-btn lp-mock-btn-blue">Explain it</span>
            <span className="lp-mock-btn">Save to journal</span>
            <span className="lp-mock-btn">Set an alert</span>
          </div>
        </div>
        <div className="lp-showcase-copy">
          <h2 className="lp-showcase-title">Wallie draws the chart with you</h2>
          <p className="lp-showcase-text">
            Ask about any market and Wallie works it the way a disciplined
            trader does: trend first, then the levels that matter, then the
            retracement — and when independent levels agree, Wallie points at
            the confluence and explains why it matters, in plain language.
          </p>
          <p className="lp-showcase-text">
            No black box. Every line comes with the lesson behind it.
          </p>
        </div>
      </section>

      {/* SHOWCASE — control */}
      <section className="lp-showcase lp-showcase-flip lp-band-light reveal" ref={controlRef}>
        <div className="lp-mock">
          <div className="lp-mock-head">
            <img src={wallieLogo} alt="" className="lp-mock-logo" />
            <div>
              <span className="lp-mock-name">Wallie</span>
              <span className="lp-mock-status">Heads-up from your watchlist</span>
            </div>
          </div>
          <div className="lp-mock-bubble">
            BTC is walking into the confluence zone you marked this morning.
            Want a breakdown of what to watch — or just an alert if it gets
            there?
          </div>
          <div className="lp-mock-actions lp-mock-actions-stack">
            <span className="lp-mock-btn lp-mock-btn-blue lp-mock-btn-wide">Break it down</span>
            <span className="lp-mock-btn lp-mock-btn-wide">Just alert me</span>
            <span className="lp-mock-btn lp-mock-btn-wide">Dismiss</span>
          </div>
          <div className="lp-mock-note">
            Wallie suggests. You decide. Nothing is ever traded for you.
          </div>
        </div>
        <div className="lp-showcase-copy">
          <h2 className="lp-showcase-title">You stay in control of your coach</h2>
          <p className="lp-showcase-text">
            Wallie is proactive, not pushy. It prepares the analysis, watches
            the zones, and drafts the plan — then it asks. Every suggestion is
            a card you can accept, question, or dismiss.
          </p>
          <p className="lp-showcase-text">
            And because Wallie teaches instead of executing, it belongs in
            your pocket — web and iOS, one account, your journal and your
            routine in sync.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-how reveal" ref={howRef}>
        <h2 className="lp-section-title">How it works</h2>
        <div className="lp-steps">
          <div className="lp-step">
            <div className="lp-step-num">1</div>
            <h3>Sign Up Free</h3>
            <p>Create your account in seconds with Google, Apple, or email.</p>
          </div>
          <div className="lp-step-arrow">→</div>
          <div className="lp-step">
            <div className="lp-step-num">2</div>
            <h3>Ask Wallie</h3>
            <p>Type or speak your question — upload a chart for analysis.</p>
          </div>
          <div className="lp-step-arrow">→</div>
          <div className="lp-step">
            <div className="lp-step-num">3</div>
            <h3>Explore Ideas</h3>
            <p>Discuss trading topics and explore ideas with AI-powered responses in seconds.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-faq lp-band-light reveal" id="faq" ref={faqRef}>
        <h2 className="lp-section-title">Frequently asked questions</h2>
        <div className="lp-faq-list">
          {faqs.map((faq, i) => (
            <div
              className={`lp-faq-item ${openFaq === i ? "open" : ""}`}
              key={i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="lp-faq-q">
                <span>{faq.q}</span>
                <span className="lp-faq-toggle">
                  {openFaq === i ? "−" : "+"}
                </span>
              </div>
              {openFaq === i && <div className="lp-faq-a">{faq.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* REVIEWS */}
      <section className="lp-reviews lp-band-light reveal" ref={reviewsRef}>
        <h2 className="lp-section-title">What traders are saying</h2>
        <div className="lp-reviews-grid">
          {reviews.slice(0, 6).map((r, i) => (
            <div className="lp-review-card" key={i}>
              <div className="lp-review-stars">★★★★★</div>
              <p className="lp-review-text">"{r.text}"</p>
              <div className="lp-review-author">
                <div className="lp-review-avatar">{r.name[0]}</div>
                <div>
                  <span className="lp-review-name">{r.name}</span>
                  <span className="lp-review-role">{r.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GET THE APP */}
      <section className="lp-apps reveal" ref={appsRef}>
        <h2 className="lp-section-title">Get the app</h2>
        <p className="lp-apps-sub">Coming soon to all your favorite platforms</p>
        <div className="lp-apps-grid">
          <div className="lp-app-badge" onClick={() => alert("Coming Soon!")}>
            <svg width="24" height="24" viewBox="0 0 384 512" fill="white">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-62.1 24-72.5-24 1.3-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
            </svg>
            <div>
              <span className="lp-app-label">Download on the</span>
              <span className="lp-app-name">App Store</span>
            </div>
          </div>
          <div className="lp-app-badge" onClick={() => alert("Coming Soon!")}>
            <svg width="24" height="24" viewBox="0 0 512 512" fill="white">
              <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
            </svg>
            <div>
              <span className="lp-app-label">GET IT ON</span>
              <span className="lp-app-name">Google Play</span>
            </div>
          </div>
          <div className="lp-app-badge" onClick={() => alert("Coming Soon!")}>
            <svg width="24" height="24" viewBox="0 0 512 512" fill="white">
              <path d="M0 256C0 209.4 14.3 165.7 39.4 128.4l173.3 200.3L39.1 384.1C14.2 346.5 0 302.4 0 256zm256-256c70.7 0 134.5 28.7 180.8 75l-131.4 73.7L142.8 6.5C176.8 2.2 215.6 0 256 0zM474.6 437C428.2 483.3 364.5 512 256 512c-40.4 0-79.2-6.2-113.2-17.5L305.4 346.5l131.4 73.7c5.4 5.1 25 17.7 37.8 16.8zM472.6 128.4C497.7 165.7 512 209.4 512 256c0 46.4-14.2 90.5-39.1 128.1L299.6 183.7 472.6 128.4z" />
            </svg>
            <div>
              <span className="lp-app-label">Available in the</span>
              <span className="lp-app-name">Chrome Web Store</span>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-login-row">
        <Link to="/chat" className="lp-btn lp-btn-gray lp-login-btn">
          Log in
        </Link>
      </div>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-top">
            <div className="lp-footer-left">
              <div className="lp-footer-brand">
                <img src={wallieLogo} alt="Wallie" className="lp-footer-logo" />
                <span>Wallie AI</span>
              </div>
              <p className="lp-footer-disc">
                Wallie AI is for educational and informational purposes only and does not constitute financial advice, investment advice, trading advice, or any other form of professional advice. Trading stocks, options, forex, cryptocurrency, and other financial instruments involves substantial risk of loss and is not suitable for every investor. Past performance is not indicative of future results. You should consult with a qualified financial advisor before making any investment decisions. By using Wallie AI, you acknowledge that you are solely responsible for your own trading and investment decisions.
              </p>
              <div className="lp-socials">
                <a href="https://www.tiktok.com/@t.thetiktoktrader" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                  <svg width="20" height="20" viewBox="0 0 448 512" fill="currentColor"><path d="M448 209.9a210.1 210.1 0 01-122.8-39.3v178.8A162.6 162.6 0 11185 188.3v89.9a74.6 74.6 0 1052.2 71.2V0h88a121 121 0 00122.8 121.2z" /></svg>
                </a>
                <a href="https://www.instagram.com/t.thetiktoktrader/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <svg width="20" height="20" viewBox="0 0 448 512" fill="currentColor"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9S160.5 370.9 224.1 370.9 339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" /></svg>
                </a>
                <a href="https://www.skool.com/traders-hub-1034/about" target="_blank" rel="noopener noreferrer" aria-label="Skool">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                </a>
                <a href="https://www.youtube.com/@TradersHubSkool" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                  <svg width="20" height="20" viewBox="0 0 576 512" fill="currentColor"><path d="M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z" /></svg>
                </a>
              </div>
            </div>
            <div className="lp-footer-right">
              <div className="lp-footer-links">
                <Link to="/affiliates">Affiliate Program</Link>
                <Link to="/policy/privacy">Privacy Policy</Link>
                <Link to="/policy/terms">Terms of Service</Link>
                <Link to="/policy/refund">Refund Policy</Link>
                <Link to="/admin">Admin</Link>
              </div>
            </div>
          </div>
          <p className="lp-footer-copy">
            &copy; {new Date().getFullYear()} Wallie AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

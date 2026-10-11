import { useState } from "react";
import { Link } from "react-router-dom";
import wallieLogo from "../../assets/wallie-mark.png";
import "../Policies/PolicyPage.css";

const faqs = [
  {
    q: "What is Wallie AI?",
    a: "Wallie AI is your personal AI trading assistant. It combines powerful language models with real-time web search to help you analyze charts, understand market sentiment, and make more informed trading decisions.",
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

const Support = () => {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="policy-container">
      <div className="policy-card">
        <Link to="/" className="policy-back">← Back to Home</Link>

        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img src={wallieLogo} alt="Wallie AI" style={{ width: "80px", borderRadius: "16px" }} />
        </div>

        <h1 className="policy-title">Support</h1>
        <p className="policy-updated">We're here to help</p>

        <div className="policy-section">
          <h2>Contact Us</h2>
          <p>
            Have a question, issue, or feedback? Reach out to us at{" "}
            <a href="mailto:wallieai4@gmail.com"><strong>support@wallieai.com</strong></a> and
            we'll get back to you as soon as possible.
          </p>
        </div>

        <div className="policy-section">
          <h2>Common Topics</h2>
          <p>
            • Account issues (login, profile, password reset)<br />
            • Subscription and billing questions<br />
            • Bug reports and feature requests<br />
            • General questions about Wallie AI
          </p>
        </div>

        <div className="policy-section">
          <h2>Frequently Asked Questions</h2>
          {faqs.map((faq, i) => (
            <div
              key={i}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                padding: "0.75rem 0",
                cursor: "pointer",
              }}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 600 }}>
                <span>{faq.q}</span>
                <span style={{ fontSize: "1.2rem", opacity: 0.5 }}>{openFaq === i ? "−" : "+"}</span>
              </div>
              {openFaq === i && (
                <p style={{ marginTop: "0.5rem", opacity: 0.8, lineHeight: 1.6 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>

        <div className="policy-section">
          <h2>Policies</h2>
          <p>
            <Link to="/policy/privacy">Privacy Policy</Link><br />
            <Link to="/policy/terms">Terms of Service</Link><br />
            <Link to="/policy/refund">Refund Policy</Link>
          </p>
        </div>

        <div className="policy-contact">
          <p>Response time is typically within 24 hours.</p>
        </div>
      </div>
    </div>
  );
};

export default Support;

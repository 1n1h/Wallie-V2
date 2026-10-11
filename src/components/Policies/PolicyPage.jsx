import { Link, useParams } from "react-router-dom";
import "./PolicyPage.css";

const policies = {
  privacy: {
    title: "Privacy Policy",
    updated: "March 24, 2026",
    content: [
      {
        heading: "1. Information We Collect",
        text: "We collect information you provide directly, including your name, email address, and profile picture when you create an account. We also collect usage data such as chat interactions and features used to improve our services. If you subscribe to a paid plan, we collect purchase history and subscription status through Apple In-App Purchases or Stripe. We do not collect or store your payment card details — these are handled entirely by Apple or Stripe.",
      },
      {
        heading: "2. How We Use Your Information",
        text: "We use your information to provide and maintain the Wallie AI service, personalize your experience, process and manage your subscription, send service updates, analyze usage patterns to improve our product, and ensure platform security.",
      },
      {
        heading: "3. Data Storage & Security",
        text: "Your data is stored securely using Google Firebase infrastructure with industry-standard encryption. We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.",
      },
      {
        heading: "4. Third-Party Services",
        text: "We use the following third-party services that may process your data: Google Gemini AI (chat responses), Tavily/Serper (web search functionality), ElevenLabs (text-to-speech), Apple (in-app purchases and subscription management), and Stripe (web payment processing). These services process your data only as necessary to provide their respective functions. We do not sell your personal data to third parties.",
      },
      {
        heading: "5. Your Rights & Account Deletion",
        text: "You have the right to access, update, or delete your personal information at any time. You can delete your account directly within the app by going to Settings > Delete Account. This will permanently remove your profile, chat history, and all associated data. Alternatively, you may request data deletion by contacting support@wallieai.com. We will respond to all requests within 30 days.",
      },
      {
        heading: "6. Cookies & Tracking",
        text: "Our web application uses essential cookies for authentication and session management. Our iOS application does not use cookies or third-party tracking. You can disable cookies in your browser settings for the web version, though this may affect functionality. We do not track users across third-party apps or websites.",
      },
      {
        heading: "7. Children's Privacy",
        text: "Wallie AI is not intended for users under the age of 18. We do not knowingly collect personal information from minors. If we discover that a minor has provided us with personal data, we will delete it immediately.",
      },
      {
        heading: "8. Changes to This Policy",
        text: "We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the 'Last Updated' date. Continued use of the service constitutes acceptance of the updated policy.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "March 24, 2026",
    content: [
      {
        heading: "1. Acceptance of Terms",
        text: "By accessing or using Wallie AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the service. We reserve the right to modify these terms at any time.",
      },
      {
        heading: "2. Description of Service",
        text: "Wallie AI is an AI-powered trading companion that facilitates market discussion, chart exploration, and educational content through a chat interface. The service is provided on an 'as-is' basis. Wallie AI is an informational and educational tool only.",
      },
      {
        heading: "3. Not Financial Advice",
        text: "IMPORTANT: Wallie AI does not provide financial, investment, or trading advice. All information, discussion, and content provided by Wallie AI are for educational and informational purposes only. You should not make any financial decisions based solely on information from Wallie AI. Always do your own research and consult a licensed financial advisor before making investment decisions. Trading involves substantial risk of loss and is not suitable for every investor. Past performance is not indicative of future results.",
      },
      {
        heading: "4. User Accounts",
        text: "You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate information during registration and to keep your profile up to date. You are solely responsible for all activities that occur under your account. You may delete your account at any time from the Settings screen in the app.",
      },
      {
        heading: "5. Subscriptions & Payments",
        text: "Wallie AI offers free and paid subscription plans. Paid subscriptions on iOS are processed through Apple In-App Purchases and are subject to Apple's terms and conditions. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. You can manage and cancel subscriptions through your Apple ID account settings or your Stripe account for web subscriptions.",
      },
      {
        heading: "6. Acceptable Use",
        text: "You agree not to use Wallie AI for any unlawful purpose, to harass or harm other users, to attempt to reverse-engineer our AI models, to scrape or extract data from our service, or to transmit viruses or malicious code.",
      },
      {
        heading: "7. Intellectual Property",
        text: "All content, features, and functionality of Wallie AI are owned by Wallie AI and are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.",
      },
      {
        heading: "8. Service Availability",
        text: "We strive to maintain high uptime but do not guarantee uninterrupted access. We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable notice where possible.",
      },
      {
        heading: "9. Limitation of Liability",
        text: "To the maximum extent permitted by law, Wallie AI shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service. This includes, but is not limited to, financial losses incurred from trading or investment decisions.",
      },
      {
        heading: "10. Termination",
        text: "We may terminate or suspend your account at any time for violation of these terms. Upon termination, your right to use the service ceases immediately. You may delete your account at any time through the app's Settings screen or by contacting support@wallieai.com.",
      },
    ],
  },
  refund: {
    title: "Refund Policy",
    updated: "March 24, 2026",
    content: [
      {
        heading: "1. Free Plan",
        text: "Wallie AI offers a free plan with limited daily messages. No payment is required for the free plan and no charges will be applied to your account.",
      },
      {
        heading: "2. iOS Subscriptions (Apple In-App Purchases)",
        text: "Subscriptions purchased through the iOS app are processed by Apple. All refund requests for iOS subscriptions must be submitted directly to Apple. You can request a refund through Apple's Report a Problem page (reportaproblem.apple.com) or by contacting Apple Support. Wallie AI does not have the ability to process refunds for Apple In-App Purchases.",
      },
      {
        heading: "3. Web Subscriptions (Stripe)",
        text: "Subscriptions purchased through our website are processed by Stripe. If you are not satisfied with Wallie AI, you may request a refund within 14 days of your initial purchase by contacting support@wallieai.com. Refunds are processed within 5-10 business days and will be returned to your original payment method.",
      },
      {
        heading: "4. Cancellation",
        text: "You may cancel your subscription at any time. For iOS subscriptions, manage your subscription through your Apple ID account settings (Settings > Apple ID > Subscriptions). For web subscriptions, contact support@wallieai.com. Upon cancellation, you will retain access to paid features until the end of your current billing period.",
      },
      {
        heading: "5. Free Trial",
        text: "Paid plans may include a free trial period. If you cancel before the free trial ends, you will not be charged. If you do not cancel before the trial ends, your subscription will automatically begin and you will be charged the applicable subscription fee.",
      },
      {
        heading: "6. Contact",
        text: "For any billing questions or concerns, contact us at support@wallieai.com. For iOS purchase issues, please contact Apple Support directly as they manage all App Store transactions.",
      },
    ],
  },
};

const PolicyPage = () => {
  const { type } = useParams();
  const policy = policies[type];

  if (!policy) {
    return (
      <div className="policy-container">
        <div className="policy-card">
          <h1>Page Not Found</h1>
          <Link to="/" className="policy-back">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="policy-container">
      <div className="policy-card">
        <Link to="/" className="policy-back">← Back to Home</Link>
        <h1 className="policy-title">{policy.title}</h1>
        <p className="policy-updated">Last updated: {policy.updated}</p>

        {policy.content.map((section, i) => (
          <div className="policy-section" key={i}>
            <h2>{section.heading}</h2>
            <p>{section.text}</p>
          </div>
        ))}

        <div className="policy-contact">
          <p>Questions about this policy? Contact us at <strong>support@wallieai.com</strong></p>
        </div>
      </div>
    </div>
  );
};

export default PolicyPage;

import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import "./Signup.css";
import GatewayFlow from "@/components/ui/gateway-flow";

const Signup = () => {
  const [step, setStep] = useState(1); // 1 = auth, 2 = profile setup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Profile fields
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [tradingExp, setTradingExp] = useState("");
  const [profilePic, setProfilePic] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const fileInputRef = useRef(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithGoogle, loginWithApple, signupWithEmail, loginWithEmail, user } = useAuth();
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const ref = searchParams.get("ref") || localStorage.getItem("wallie_ref") || "";
    if (ref) {
      setReferralCode(ref);
      localStorage.setItem("wallie_ref", ref);
    }
  }, [searchParams]);

  // Check if user has an active subscription or free plan
  const getPostAuthRoute = (userData) => {
    const sub = userData?.subscription;
    if (sub?.status === "active" || sub?.plan === "free") {
      return "/chat";
    }
    return "/pricing";
  };

  // Handle redirect from mobile Google/Apple sign-in
  useEffect(() => {
    const checkRedirectUser = async () => {
      if (user && step === 1) {
        setLoading(true);
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && userDoc.data().name) {
            navigate(getPostAuthRoute(userDoc.data()));
          } else {
            setDisplayName(user.displayName || "");
            if (user.photoURL) setProfilePicPreview(user.photoURL);
            setStep(2);
          }
        } catch (err) {
          console.error("Redirect user check error:", err);
        } finally {
          setLoading(false);
        }
      }
    };
    checkRedirectUser();
  }, [user, step, navigate]);


  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        const u = await loginWithEmail(email, password);
        const userDoc = await getDoc(doc(db, "users", u.uid));
        navigate(getPostAuthRoute(userDoc.exists() ? userDoc.data() : null));
      } else {
        await signupWithEmail(email, password, name);
        setDisplayName(name);
        setStep(2);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const u = await loginWithGoogle();
      if (!u) return; // Mobile redirect — page will reload
      // Check if user already has a Firestore profile (returning user)
      const userDoc = await getDoc(doc(db, "users", u.uid));
      if (userDoc.exists() && userDoc.data().name) {
        navigate(getPostAuthRoute(userDoc.data()));
        return;
      }
      // New user — go to profile setup
      setDisplayName(u.displayName || "");
      if (u.photoURL) setProfilePicPreview(u.photoURL);
      setStep(2);
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
      if (!u) return; // Mobile redirect — page will reload
      // Check if user already has a Firestore profile (returning user)
      const userDoc = await getDoc(doc(db, "users", u.uid));
      if (userDoc.exists() && userDoc.data().name) {
        navigate(getPostAuthRoute(userDoc.data()));
        return;
      }
      setDisplayName(u.displayName || "");
      setStep(2);
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be under 5MB");
        return;
      }
      setProfilePic(file);
      const reader = new FileReader();
      reader.onloadend = () => setProfilePicPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const currentUser = auth.currentUser;

      // Convert profile pic to base64 for Firestore storage
      let photoData = profilePicPreview || "";

      // Update Firebase Auth profile
      await updateProfile(currentUser, {
        displayName: displayName,
        photoURL: photoData.startsWith("http") ? photoData : "",
      });

      // Save full profile to Firestore
      await setDoc(doc(db, "users", currentUser.uid), {
        name: displayName,
        email: currentUser.email || "",
        bio: bio,
        tradingExperience: tradingExp,
        profilePic: photoData,
        referralCode: referralCode || "",
        lastLogin: serverTimestamp(),
      }, { merge: true });

      // Track affiliate referral
      if (referralCode) {
        try {
          const affRef = doc(db, "affiliates", referralCode);
          const affSnap = await getDoc(affRef);
          if (affSnap.exists()) {
            await updateDoc(affRef, {
              signups: increment(1),
              lifetimeSignups: increment(1),
            });
          }
          localStorage.removeItem("wallie_ref");
        } catch (err) {
          console.error("Referral tracking error:", err);
        }
      }

      navigate("/pricing");
    } catch (err) {
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Profile setup
  if (step === 2) {
    return (
      <div className="signup-container">
        <div className="signup-card profile-card">
          <div className="header">
            <h2 className="title">Set Up Your Profile</h2>
            <p className="subtitle">Tell us a bit about yourself</p>
          </div>

          <form onSubmit={handleProfileSubmit} className="form">
            <div className="profile-pic-section">
              <div
                className="profile-pic-upload"
                onClick={() => fileInputRef.current.click()}
              >
                {profilePicPreview ? (
                  <img src={profilePicPreview} alt="Profile" className="profile-pic-preview" />
                ) : (
                  <div className="profile-pic-placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span>Add Photo</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicChange}
                style={{ display: "none" }}
              />
              <p className="profile-pic-hint">Click to upload profile picture</p>
            </div>

            <div className="input-group">
              <input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="input"
              />
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </span>
            </div>

            <div className="input-group">
              <input
                type="text"
                placeholder="Short bio (e.g. Day trader, crypto enthusiast)"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input"
              />
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </span>
            </div>

            <div className="input-group">
              <select
                value={tradingExp}
                onChange={(e) => setTradingExp(e.target.value)}
                className="input select-input"
              >
                <option value="" disabled>Trading Experience</option>
                <option value="beginner">Beginner — Just getting started</option>
                <option value="intermediate">Intermediate — 1-3 years</option>
                <option value="advanced">Advanced — 3+ years</option>
                <option value="pro">Professional — Full-time trader</option>
                <option value="curious">Just curious</option>
              </select>
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
              </span>
            </div>

            {error && <p className="error-message">{error}</p>}

            <button type="submit" disabled={loading} className="button">
              {loading ? "Saving..." : "COMPLETE PROFILE"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/pricing")}
              className="skip-button"
            >
              Skip for now
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Auth
  return (
    <div className="signup-container">
      <GatewayFlow className="su-gateway" />
      <div className="signup-card">
        <div className="header">
          <h2 className="title">Wallie AI</h2>
          <p className="subtitle">{isLogin ? "Welcome back" : "Create your account"}</p>
        </div>

        <div className="oauth-buttons">
          <button onClick={handleGoogleLogin} disabled={loading} className="oauth-btn google-btn">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button onClick={handleAppleLogin} disabled={loading} className="oauth-btn apple-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>
        </div>

        <div className="divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailSubmit} className="form">
          {!isLogin && (
            <div className="input-group">
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                className="input"
              />
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </span>
            </div>
          )}

          <div className="input-group">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
            />
            <span className="input-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </span>
          </div>

          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input"
            />
            <span className="input-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </span>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading} className="button">
            {loading ? "Please wait..." : isLogin ? "LOG IN" : "SIGN UP"}
          </button>

          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="skip-button"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Signup;

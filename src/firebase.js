import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, OAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCnd7ps1cC-ozSLvmh0sv-QQZHbcrEwi2c",
  authDomain: "wallie-ai-37522.firebaseapp.com",
  projectId: "wallie-ai-37522",
  storageBucket: "wallie-ai-37522.firebasestorage.app",
  messagingSenderId: "17389863721",
  appId: "1:17389863721:web:28578242d8de2a2aa22d38",
  measurementId: "G-9YCJEXRSR5",
};

const app = initializeApp(firebaseConfig);

// Initialize App Check with reCAPTCHA v3 (browser-only)
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider("6LfQJZYsAAAAAOh88QwBDMzFZ5yFv7FCCOgoS-UH"),
    isTokenAutoRefreshEnabled: true,
  });
}

export const db = getFirestore(app);
export const auth = getAuth(app);

// Keep users signed in across browser sessions
// Export as a promise so AuthContext can wait for persistence to be configured
// before listening to auth state changes
export const authReady = setPersistence(auth, browserLocalPersistence).catch(console.error);

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope('email');
appleProvider.addScope('name');

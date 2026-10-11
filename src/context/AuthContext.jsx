import { createContext, useContext, useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider, appleProvider, authReady } from "../firebase";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;
    // Wait for persistence to be configured before listening to auth changes
    authReady.then(() => {
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      });
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handle redirect result on page load (for mobile sign-in)
  useEffect(() => {
    authReady.then(() =>
      getRedirectResult(auth).then(async (result) => {
        if (result?.user) {
          await saveUserToFirestore(result.user);
        }
      })
    ).catch((err) => {
      console.error("Redirect sign-in error:", err);
    });
  }, []);

  const saveUserToFirestore = async (user) => {
    const ref = doc(db, "users", user.uid);
    await setDoc(ref, {
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastLogin: serverTimestamp(),
    }, { merge: true });
  };

  const loginWithGoogle = async () => {
    try {
      // Try popup first (works on most mobile browsers now)
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserToFirestore(result.user);
      setUser(result.user);
      return result.user;
    } catch (err) {
      // Fall back to redirect if popup was blocked (e.g. mobile Safari)
      if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, googleProvider);
        return null;
      }
      throw err;
    }
  };

  const loginWithApple = async () => {
    try {
      const result = await signInWithPopup(auth, appleProvider);
      await saveUserToFirestore(result.user);
      setUser(result.user);
      return result.user;
    } catch (err) {
      if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, appleProvider);
        return null;
      }
      throw err;
    }
  };

  const signupWithEmail = async (email, password, name) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await saveUserToFirestore({ ...result.user, displayName: name });
    setUser(result.user);
    return result.user;
  };

  const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await saveUserToFirestore(result.user);
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    user,
    loading,
    loginWithGoogle,
    loginWithApple,
    signupWithEmail,
    loginWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;

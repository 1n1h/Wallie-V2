// Referral capture + claim.
// A friend's invite link lands on any page with ?ref=CODE. The code
// is stashed on first touch; once the visitor is signed in, the
// claimReferral function credits both accounts server-side.
import { auth } from "../firebase";

const REF_KEY = "wallie_ref";
const FN_URL = "https://us-central1-wallie-ai-37522.cloudfunctions.net/claimReferral";

export function captureRefFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    const clean = (code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    if (clean && !localStorage.getItem(REF_KEY)) {
      localStorage.setItem(REF_KEY, clean);
    }
  } catch {
    /* storage unavailable */
  }
}

export function stashedRef() {
  try {
    return localStorage.getItem(REF_KEY) || "";
  } catch {
    return "";
  }
}

export function clearRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

async function waitForUser(timeoutMs = 6000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (auth.currentUser || Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        resolve(auth.currentUser);
      }
    }, 200);
  });
}

export async function claimReferral(code) {
  const user = await waitForUser();
  if (!user || !code) return { ok: false, reason: "no_user" };
  const token = await user.getIdToken();
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ data: { refCode: code } }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error("claimReferral " + res.status);
  return (json && json.result) || { ok: false };
}

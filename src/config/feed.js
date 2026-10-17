import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

// Feed page data access — headlines + economic calendar + macro from the
// `feed` Cloud Function, same callable envelope as demo.js / gemini.js.
const PROJECT_ID = "wallie-ai-37522";
const REGION = "us-central1";

function getFunctionUrl(name) {
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

function waitForAuth() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function callFunction(name, data) {
  const user = await waitForAuth();
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(getFunctionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(`Function ${name} failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

export async function fetchFeed(symbols) {
  const result = await callFunction("feed", { symbols: symbols || [] });
  return {
    macro: result?.macro || null,
    calendar: Array.isArray(result?.calendar) ? result.calendar : [],
    headlines: result?.headlines || { general: [], bySymbol: {} },
    asOf: result?.asOf || Date.now(),
  };
}

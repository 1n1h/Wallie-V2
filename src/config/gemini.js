import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

const PROJECT_ID = "wallie-ai-37522";
const REGION = "us-central1";

function getFunctionUrl(name) {
  return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve({ data: base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Function ${name} failed: ${res.status} ${errText}`);
  }

  const json = await res.json();
  return json.result;
}

export default async function runChat(prompt, imageFile = null, chatHistory = [], userPersona = "") {
  try {
    const history = chatHistory.map((msg) => ({
      role: msg.type === "user" ? "user" : "model",
      text: msg.message,
      hadImage: !!msg.hadImage,
    }));

    const payload = { prompt, history };
    if (userPersona) payload.userPersona = userPersona;

    if (imageFile) {
      const { data, mimeType } = await fileToBase64(imageFile);
      payload.imageBase64 = data;
      payload.imageMimeType = mimeType;
    }

    const result = await callFunction("chat", payload);
    return {
      text: result.response,
      plot: result.plot || null,
      actions: result.actions || null,
    };
  } catch (error) {
    console.error("Error in runChat:", error);
    return {
      text: "I'm sorry, I encountered an error while processing your request. Please try again later.",
      plot: null,
      actions: null,
    };
  }
}

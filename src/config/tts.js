import { KokoroTTS } from "kokoro-js";

// Wallie's voice: Kokoro (in-browser AI voice) is the studio voice. If it
// fails for ANY reason — model download, WebGPU/WASM, memory — the caller
// falls back to the device's built-in voice (speakWithDeviceVoice below),
// which always makes sound. Failures must never be silent again.

let ttsInstance = null;
let loadingPromise = null;

export const VOICE_OPTIONS = [
  { id: "am_adam", name: "Adam", desc: "Strong & confident" },
  { id: "am_michael", name: "Michael", desc: "Deep & steady" },
  { id: "bm_george", name: "George", desc: "British & composed" },
  { id: "af_heart", name: "Heart", desc: "Warm & expressive" },
  { id: "af_bella", name: "Bella", desc: "Friendly & clear" },
  { id: "af_sarah", name: "Sarah", desc: "Soft & calm" },
  { id: "bf_emma", name: "Emma", desc: "British & warm" },
];

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export async function initTTS() {
  if (ttsInstance) return ttsInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const hasWebGPU = typeof navigator !== "undefined" && navigator.gpu;
    if (hasWebGPU) {
      try {
        const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: "fp32",
          device: "webgpu",
        });
        console.log("Kokoro TTS: using WebGPU");
        return instance;
      } catch (e) {
        console.warn("WebGPU init failed, falling back to WASM:", e);
      }
    }
    const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
    });
    console.log("Kokoro TTS: using WASM");
    return instance;
  })();

  try {
    ttsInstance = await loadingPromise;
    loadingPromise = null;
    return ttsInstance;
  } catch (e) {
    // Never cache a failed load — the old code kept the rejected promise
    // forever, so one transient failure killed the voice for the whole
    // session. Clear it so the next tap retries cleanly.
    loadingPromise = null;
    throw e;
  }
}

// Kokoro only knows its own voice ids (am_adam, af_heart, …). A saved
// setting can hold anything else — e.g. an Apple device-voice URI written
// by the iOS app into the shared settings doc ("com.apple.voice.…") —
// and Kokoro throws `Voice "…" not found` on every generate. Defend here:
// anything that isn't Kokoro-shaped falls back to Adam (male default).
export function resolveKokoroVoice(voiceId) {
  if (typeof voiceId === "string" && /^[a-z]{2}_[a-z0-9]+$/i.test(voiceId)) return voiceId;
  return "am_adam";
}

export async function textToSpeech(text, voiceId = "am_adam") {
  const tts = await initTTS();
  const audio = await tts.generate(text, { voice: resolveKokoroVoice(voiceId) });
  return audio.toBlob();
}

export function withTimeout(promise, ms, label = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Strip markdown so the voice doesn't read asterisks and hashes aloud.
export function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/^\s*VERDICT:.*$/im, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Device voice fallback (built-in speechSynthesis, male voice) ──
const MALE_HINTS =
  /(^|\b)(male|david|guy|christopher|eric|brian|matthew|justin|joey|ryan|daniel|george|james|john|michael|alex|fred|thomas|aaron|arthur)\b/i;
const FEMALE_HINTS =
  /(female|zira|samantha|victoria|karen|susan|linda|heather|fiona|moira|tessa|allison|ava|joanna|salli|kimberly|kendra|amy|emma|nicole|jenny|aria|michelle|catherine|elizabeth|jessica|google us english)/i;

function pickMaleVoice() {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en/i.test(v.lang));
  return (
    en.find((v) => MALE_HINTS.test(v.name)) ||
    en.find((v) => !FEMALE_HINTS.test(v.name)) ||
    en[0] ||
    voices[0] ||
    null
  );
}

let deviceSession = 0;

export function stopDeviceVoice() {
  deviceSession++;
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}

// Speaks with the device's own voice (always male-picked). Long replies
// are chunked by sentence — some browsers cut off long utterances.
export function speakWithDeviceVoice(text, { onEnd, onError } = {}) {
  if (!("speechSynthesis" in window) || !text) return false;
  const session = ++deviceSession;
  const chunks =
    text.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g)?.map((c) => c.trim()).filter(Boolean) || [text];

  const start = () => {
    if (session !== deviceSession) return;
    // iOS: cancelling an idle synth can swallow the next utterance, and
    // the synth can sit paused — only cancel when busy, then resume.
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      try { synth.cancel(); } catch { /* noop */ }
    }
    try { synth.resume(); } catch { /* noop */ }
    let idx = 0;
    const speakNext = () => {
      if (session !== deviceSession) return;
      if (idx >= chunks.length) { onEnd?.(); return; }
      const u = new SpeechSynthesisUtterance(chunks[idx++]);
      const voice = pickMaleVoice();
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.pitch = 0.85; // deepen — reads male even on a neutral voice
      u.onend = speakNext;
      u.onerror = (e) => {
        if (e.error === "canceled" || e.error === "interrupted") return;
        if (session === deviceSession) onError?.(e);
      };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  };

  if (window.speechSynthesis.getVoices().length) {
    start();
  } else {
    // Voices often arrive async; wait briefly, then speak regardless.
    const fallback = setTimeout(start, 600);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(fallback);
      window.speechSynthesis.onvoiceschanged = null;
      start();
    };
  }
  return true;
}

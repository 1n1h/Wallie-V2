import { KokoroTTS } from "kokoro-js";

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

  ttsInstance = await loadingPromise;
  loadingPromise = null;
  return ttsInstance;
}

export async function textToSpeech(text, voiceId = "am_adam") {
  const tts = await initTTS();
  const audio = await tts.generate(text, { voice: voiceId });
  return audio.toBlob();
}

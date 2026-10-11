// src/components/LiveAPIButton.jsx
import React, { useState } from "react";

const LiveAPIButton = () => {
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState(null);

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      setStream(screenStream);
      setIsSharing(true);
      console.log("🎥 Live screen sharing started");

      // (Optional) Add logic to pipe frames to Gemini Live API here
    } catch (err) {
      console.error("Failed to start screen share:", err);
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      console.log("⛔ Screen sharing stopped");
    }
    setIsSharing(false);
  };

  return (
    <button
      onClick={isSharing ? stopScreenShare : startScreenShare}
      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition"
    >
      {isSharing ? "⛔ Stop Live" : "🎥 Start Live"}
    </button>
  );
};

export default LiveAPIButton;

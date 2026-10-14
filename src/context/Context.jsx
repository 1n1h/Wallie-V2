import { createContext, useState, useRef, useEffect } from "react";
import runChat from "../config/gemini";
import { textToSpeech } from "../config/tts";
import { useAuth } from "./AuthContext";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_SOUL_STATE } from "../config/wallieSoul";

export const Context = createContext();

const FREE_MESSAGE_LIMIT = 20;
const BASIC_MESSAGE_LIMIT = 75;

const ContextProvider = (props) => {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [recentPrompt, setRecentPrompt] = useState("");
  const [prevPrompts, setPrevPrompts] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedModel, setSelectedModel] = useState("wallie-1");
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(Date.now());
  const [userSettings, setUserSettings] = useState({});
  const [wallieSoul, setWallieSoul] = useState(DEFAULT_SOUL_STATE);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const streamingRef = useRef(null);
  const audioRef = useRef(new Audio());

  // Load saved chats + settings + subscription from Firestore
  useEffect(() => {
    if (!user) {
      setPrevPrompts([]);
      setUserSettings({});
      setWallieSoul(DEFAULT_SOUL_STATE);
      setSubscription(null);
      setMessagesUsed(0);
      setShowPaywall(false);
      return;
    }
    const loadUserData = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          // Support both old format (string[]) and new format (object[])
          if (data.savedChats) {
            setPrevPrompts(data.savedChats);
          } else if (data.chatHistoryList) {
            // Migrate old string format to new object format
            const migrated = data.chatHistoryList.map((title) => ({
              title: typeof title === "string" ? title : title.title || "Chat",
              messages: [],
            }));
            setPrevPrompts(migrated);
          }
          if (data.soul) {
            setWallieSoul({
              identity: data.soul.identity ?? DEFAULT_SOUL_STATE.identity,
              soul: data.soul.soul ?? DEFAULT_SOUL_STATE.soul,
              memory: data.soul.memory ?? "",
            });
          }
          if (data.settings) {
            setUserSettings(data.settings);
            if (data.settings.theme) {
              document.documentElement.setAttribute("data-theme", data.settings.theme);
            }
            if (data.settings.fontSize) {
              document.documentElement.setAttribute("data-font-size", data.settings.fontSize);
            }
          }
          // Load subscription data + 24h reset logic
          if (data.subscription) {
            const sub = data.subscription;
            const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
            const lastReset = sub.lastResetDate || "";

            // Reset message count if it's a new day (free and basic plans)
            if ((sub.plan === "free" || sub.plan === "basic") && lastReset !== today) {
              sub.messagesUsed = 0;
              sub.lastResetDate = today;
              // Persist the reset to Firestore
              setDoc(doc(db, "users", user.uid), {
                subscription: { messagesUsed: 0, lastResetDate: today },
              }, { merge: true }).catch((err) => console.error("Reset error:", err));
            }

            setSubscription(sub);
            setMessagesUsed(sub.messagesUsed || 0);
          }
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };
    loadUserData();
  }, [user]);

  // Save chats to Firestore
  const saveChatsToFirestore = async (updatedList) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        savedChats: updatedList,
      }, { merge: true });
    } catch (err) {
      console.error("Error saving chats:", err);
    }
  };

  // Save one of Wallie's soul files (identity / soul / memory) to Firestore
  const saveSoulFile = async (key, text) => {
    const next = { ...wallieSoul, [key]: text };
    setWallieSoul(next);
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        soul: { [key]: text },
      }, { merge: true });
    } catch (err) {
      console.error("Error saving soul file:", err);
    }
  };

  // Save current conversation into prevPrompts
  const saveCurrentChat = (messages) => {
    if (messages.length === 0) return;
    const title = messages[0]?.message || "Chat";
    // Strip image blob URLs (not serializable)
    const cleaned = messages.map(({ type, message }) => ({ type, message }));

    // Check if this chat already exists (by matching first message)
    const existingIdx = prevPrompts.findIndex((c) => c.title === title);
    let updated;
    if (existingIdx >= 0) {
      updated = [...prevPrompts];
      updated[existingIdx] = { title, messages: cleaned };
    } else {
      updated = [{ title, messages: cleaned }, ...prevPrompts].slice(0, 20);
    }
    setPrevPrompts(updated);
    saveChatsToFirestore(updated);
  };

  // Load a saved chat
  const loadChat = (index) => {
    const chat = prevPrompts[index];
    if (!chat) return;
    stopSpeaking();
    setShowResult(true);
    setRecentPrompt(chat.title);
    setChatHistory(chat.messages || []);
    setCurrentChatId(Date.now());
    const lastAi = [...(chat.messages || [])].reverse().find((m) => m.type === "ai");
    setResultData(lastAi?.message || "");
  };

  // Delete a single chat from history
  const deleteChat = (index) => {
    const updated = prevPrompts.filter((_, i) => i !== index);
    setPrevPrompts(updated);
    saveChatsToFirestore(updated);
  };

  const delayPrint = (text) => {
    let index = 0;
    setResultData("");
    const interval = setInterval(() => {
      setResultData((prev) => prev + text[index]);
      index++;
      if (index === text.length) {
        clearInterval(interval);
      }
    }, 10);
  };

  const handleTextToSpeech = async (text) => {
    if (userSettings.ttsEnabled === false) return;
    try {
      setIsSpeaking(true);
      const blob = await textToSpeech(text, userSettings.voiceId || "am_adam");
      const url = URL.createObjectURL(blob);

      audioRef.current.src = url;
      await audioRef.current.play();

      audioRef.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error("Error in speech:", error);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  };

  const newChat = () => {
    // Save the current chat before starting a new one
    if (chatHistory.length > 0) {
      saveCurrentChat(chatHistory);
    }
    // Cancel any ongoing streaming
    if (streamingRef.current) {
      clearInterval(streamingRef.current);
      streamingRef.current = null;
    }
    setIsStreaming(false);
    setStreamingText("");
    stopSpeaking();
    setLoading(false);
    setShowResult(false);
    setSelectedImage(null);
    setInput("");
    setResultData("");
    setChatHistory([]);
    setCurrentChatId(Date.now());
  };

  // Check if user is on a limited plan (free or basic) and has hit their limit
  const isFreePlan = subscription?.plan === "free" && subscription?.status !== "active";
  const isBasicPlan = subscription?.plan === "basic";
  const isLimitedPlan = isFreePlan || isBasicPlan;
  const freeLimit = isBasicPlan
    ? BASIC_MESSAGE_LIMIT
    : (subscription?.messageLimit || FREE_MESSAGE_LIMIT);
  const hasReachedLimit = isLimitedPlan && messagesUsed >= freeLimit;

  // Increment message count for limited plan users (free & basic)
  const incrementMessageCount = async () => {
    if (!user || !isLimitedPlan) return;
    const newCount = messagesUsed + 1;
    const today = new Date().toISOString().split("T")[0];
    setMessagesUsed(newCount);
    try {
      await setDoc(doc(db, "users", user.uid), {
        subscription: { messagesUsed: newCount, lastResetDate: today },
      }, { merge: true });
    } catch (err) {
      console.error("Error updating message count:", err);
    }
    // Show paywall when limit is reached
    if (newCount >= freeLimit) {
      setShowPaywall(true);
    }
  };

  const onSent = async (imageQuestion = null, hiddenContext = null) => {
    // Block if free user has hit their limit
    if (hasReachedLimit) {
      setShowPaywall(true);
      return;
    }

    try {
      stopSpeaking();
      // Cancel any ongoing streaming animation
      if (streamingRef.current) {
        clearInterval(streamingRef.current);
        streamingRef.current = null;
      }
      setIsStreaming(false);
      setStreamingText("");
      setLoading(true);
      setShowResult(true);

      const userMessage = imageQuestion || input;
      setRecentPrompt(userMessage);
      setInput("");
      setSelectedImage(null);

      const newUserMsg = {
        type: 'user',
        message: userMessage,
        image: selectedImage ? URL.createObjectURL(selectedImage) : null,
        hadImage: !!selectedImage,
        chatId: currentChatId
      };

      const updatedHistory = [...chatHistory, newUserMsg];
      setChatHistory(updatedHistory);

      // Layer Wallie's soul files + the user's profile on top of the core
      // system prompt (the Cloud Function appends this as the user profile).
      const personaParts = [];
      if (wallieSoul?.identity?.trim()) {
        personaParts.push(`WALLIE'S IDENTITY (from the user's IDENTITY.md)\n${wallieSoul.identity.trim()}`);
      }
      if (wallieSoul?.soul?.trim()) {
        personaParts.push(`WALLIE'S SOUL (personality rules from the user's SOUL.md — follow these)\n${wallieSoul.soul.trim()}`);
      }
      if (wallieSoul?.memory?.trim()) {
        personaParts.push(`WHAT WALLIE REMEMBERS ABOUT THIS USER (from MEMORY.md — treat as true and use it)\n${wallieSoul.memory.trim()}`);
      }
      if (userSettings.userPersona?.trim()) {
        personaParts.push(userSettings.userPersona.trim());
      }
      if (hiddenContext) {
        personaParts.push(hiddenContext);
      }
      const composedPersona = personaParts.length ? personaParts.join("\n\n") : undefined;

      const res = await runChat(userMessage, selectedImage, chatHistory, composedPersona);
      const response = res.text;
      const aiPlot = res.plot ? { image: newUserMsg.image, drawings: res.plot.drawings || [] } : null;
      const aiActions = res.actions || null;
      const aiChart = res.chart || null;
      const aiDesk = res.desk || null;
      setLoading(false);

      // Increment message count for free users after successful response
      await incrementMessageCount();

      // Add AI message with empty text initially, then stream it in
      const newAiMsg = {
        type: 'ai',
        message: "",
        plot: aiPlot,
        actions: aiActions,
        chart: aiChart,
        desk: aiDesk,
        chatId: currentChatId
      };
      const historyWithAi = [...updatedHistory, newAiMsg];
      setChatHistory(historyWithAi);

      // Start streaming animation
      setIsStreaming(true);
      setStreamingText("");
      let charIndex = 0;
      const speed = Math.max(10, Math.min(36, 7000 / response.length)); // adaptive speed — slowed down for readability

      streamingRef.current = setInterval(() => {
        // Stream in chunks of characters for longer responses
        const chunkSize = response.length > 500 ? 2 : 1;
        charIndex = Math.min(charIndex + chunkSize, response.length);
        const partial = response.slice(0, charIndex);
        setStreamingText(partial);

        // Update the AI message in chat history as it streams
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], message: partial };
          return updated;
        });

        if (charIndex >= response.length) {
          clearInterval(streamingRef.current);
          streamingRef.current = null;
          setIsStreaming(false);
          setStreamingText("");

          // Final update with complete message
          const finalHistory = [...updatedHistory, { type: 'ai', message: response, plot: aiPlot, actions: aiActions, chart: aiChart, desk: aiDesk, chatId: currentChatId }];
          setChatHistory(finalHistory);
          saveCurrentChat(finalHistory);
          setResultData(response);
        }
      }, speed);
    } catch (error) {
      console.error("Error in onSent:", error);
      setLoading(false);
      setIsStreaming(false);
      setResultData("I apologize, but I encountered an error. Please try again.");
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (selectedImage) {
        URL.revokeObjectURL(URL.createObjectURL(selectedImage));
      }

      if (file.type.startsWith('image/')) {
        if (file.size <= 20 * 1024 * 1024) {
          setSelectedImage(file);
        } else {
          alert("Image size should be less than 20MB");
          event.target.value = null;
        }
      } else {
        alert("Please upload a valid image file");
        event.target.value = null;
      }
    }
    event.target.value = null;
  };

  const contextValue = {
    input,
    setInput,
    recentPrompt,
    setRecentPrompt,
    prevPrompts,
    setPrevPrompts,
    showResult,
    setShowResult,
    loading,
    resultData,
    selectedImage,
    setSelectedImage,
    handleImageUpload,
    isSpeaking,
    handleTextToSpeech,
    stopSpeaking,
    onSent,
    newChat,
    selectedModel,
    setSelectedModel,
    chatHistory,
    deleteChat,
    loadChat,
    userSettings,
    wallieSoul,
    saveSoulFile,
    isStreaming,
    // Subscription & usage
    subscription,
    messagesUsed,
    freeLimit,
    isFreePlan,
    isBasicPlan,
    isLimitedPlan,
    hasReachedLimit,
    showPaywall,
    setShowPaywall,
  };

  return (
    <Context.Provider value={contextValue}>{props.children}</Context.Provider>
  );
};

export default ContextProvider;

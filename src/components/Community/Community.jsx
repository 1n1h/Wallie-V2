import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc,
  query, orderBy, serverTimestamp, arrayUnion, arrayRemove, increment, onSnapshot, where, limit
} from "firebase/firestore";
import { db } from "../../firebase";
import { ROSTER } from "../../config/demo";
import wallieLogo from "../../assets/wallie-mark.png";
import "./Community.css";

// ── Wallie Community ─────────────────────────────────────────────────
// A traders' social feed: share setups, charts (pictures + text) and
// actual trades (pulled from your Demo Desk journal or entered by hand),
// follow other traders, learn from their posts, level up with XP.
// Data model is unchanged from the original community build so every
// existing post, like, comment, follow and DM keeps working.

const Community = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Navigation
  const [activeView, setActiveView] = useState("home"); // home, search, notifications, messages, profile
  const [selectedPost, setSelectedPost] = useState(null);

  // Posts
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [newPostText, setNewPostText] = useState("");
  const [newPostImage, setNewPostImage] = useState(null);
  const [newPostImagePreview, setNewPostImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [commentText, setCommentText] = useState({});
  const [expandedComments, setExpandedComments] = useState({});
  const [feedFilter, setFeedFilter] = useState("all"); // all, trades, charts, following

  // Trade sharing (composer)
  const [tradePanel, setTradePanel] = useState(false);
  const [tradeSource, setTradeSource] = useState("demo"); // demo, manual
  const [demoTrades, setDemoTrades] = useState(null); // null = not loaded yet
  const [tradeDraft, setTradeDraft] = useState(null); // {symbol, direction, entry, exit, pnl, rMultiple, pnlPct, source}
  const [manSymbol, setManSymbol] = useState("GOLD");
  const [manDir, setManDir] = useState("buy");
  const [manEntry, setManEntry] = useState("");
  const [manExit, setManExit] = useState("");

  // User
  const [userProfile, setUserProfile] = useState(null);
  const [profileViewUser, setProfileViewUser] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
  const [profileTab, setProfileTab] = useState("posts"); // posts, pictures, trades
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);

  // Messages
  const [conversations, setConversations] = useState([]);
  const [activeDM, setActiveDM] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmInput, setDmInput] = useState("");
  const [showNewDm, setShowNewDm] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [newDmUser, setNewDmUser] = useState("");

  // Notifications
  const [notifications, setNotifications] = useState([]);

  const fileInputRef = useRef(null);
  const dmEndRef = useRef(null);
  const composerRef = useRef(null);

  // ===== DATA LOADING =====

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setUserProfile({ id: user.uid, ...snap.data() });
      } else {
        setUserProfile({ id: user.uid, name: user.displayName || "Trader", xp: 0, level: 1 });
      }
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, "communityPosts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingPosts(false);
    }, (err) => {
      console.error("Posts listener error:", err);
      setLoadingPosts(false);
    });
    return () => unsub();
  }, []);

  // Load leaderboard for right sidebar
  useEffect(() => {
    const loadLB = async () => {
      const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(10));
      const snap = await getDocs(q);
      setLeaderboard(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadLB();
  }, []);

  // DM conversations
  useEffect(() => {
    if (!user || activeView !== "messages") return;
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.uid),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, activeView]);

  // DM messages
  useEffect(() => {
    if (!activeDM) return;
    const q = query(collection(db, "conversations", activeDM, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setDmMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => dmEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => unsub();
  }, [activeDM]);

  // Load users for new DM / search
  useEffect(() => {
    if (!showNewDm && activeView !== "search") return;
    const loadUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user?.uid));
    };
    loadUsers();
  }, [showNewDm, activeView, user]);

  // Load profile posts when viewing profile
  useEffect(() => {
    if (activeView !== "profile" || !profileViewUser) return;
    const loadProfilePosts = async () => {
      try {
        const q = query(
          collection(db, "communityPosts"),
          where("authorId", "==", profileViewUser.id),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setProfilePosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("Profile posts query failed (index may be needed), using client-side filter:", err.message);
        const filtered = posts
          .filter(p => p.authorId === profileViewUser.id)
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            return bTime - aTime;
          });
        setProfilePosts(filtered);
      }
    };
    loadProfilePosts();
  }, [activeView, profileViewUser, posts]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const filtered = allUsers.filter(u =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(filtered.slice(0, 20));
  }, [searchQuery, allUsers]);

  // Load notifications
  useEffect(() => {
    if (!user || activeView !== "notifications") return;
    const loadNotifs = async () => {
      const myPosts = posts.filter(p => p.authorId === user.uid);
      const notifs = myPosts.flatMap(p => {
        const items = [];
        if (p.likes?.length > 0) {
          items.push({
            type: "like",
            count: p.likes.length,
            postText: p.text?.slice(0, 40) || (p.trade ? `${p.trade.symbol} trade` : "your post"),
            time: p.createdAt,
          });
        }
        if (p.commentCount > 0) {
          items.push({
            type: "comment",
            count: p.commentCount,
            postText: p.text?.slice(0, 40) || (p.trade ? `${p.trade.symbol} trade` : "your post"),
            time: p.createdAt,
          });
        }
        return items;
      });
      setNotifications(notifs.slice(0, 20));
    };
    loadNotifs();
  }, [user, activeView, posts]);

  // ===== HELPERS =====

  const awardXP = async (uid, amount) => {
    try {
      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, { xp: increment(amount) });
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const xp = snap.data().xp || 0;
        await updateDoc(userRef, { level: Math.floor(xp / 100) + 1 });
      }
    } catch (err) {
      console.error("XP error:", err);
    }
  };

  const getRankTitle = (level) => {
    if (level >= 50) return { title: "Legend", color: "#FFD700", badge: "👑" };
    if (level >= 30) return { title: "Master", color: "#E040FB", badge: "💎" };
    if (level >= 20) return { title: "Expert", color: "#FF6D00", badge: "🔥" };
    if (level >= 10) return { title: "Pro", color: "#00E676", badge: "⚡" };
    if (level >= 5) return { title: "Rising", color: "#40C4FF", badge: "📈" };
    return { title: "Rookie", color: "#0A84FF", badge: "🌱" };
  };

  const levelProgress = (xp) => ((xp || 0) % 100) / 100;

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 604800)}w`;
  };

  const fmtPrice = (n) => {
    if (n == null || isNaN(n)) return "—";
    const v = Number(n);
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (Math.abs(v) >= 1) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return v.toFixed(5);
  };

  const fmtMoney = (n) => {
    if (n == null || isNaN(n)) return "";
    const v = Number(n);
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return `${sign}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const tradePnlPct = (t) => {
    if (!t || !t.entry) return null;
    const dir = t.direction === "sell" ? -1 : 1;
    return dir * ((t.exit - t.entry) / t.entry) * 100;
  };

  // ===== ACTIONS =====

  const loadDemoTrades = async () => {
    if (demoTrades !== null || !user) return;
    try {
      const q = query(
        collection(db, "users", user.uid, "demoTrades"),
        orderBy("closedAt", "desc"),
        limit(15)
      );
      const snap = await getDocs(q);
      setDemoTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Demo trades load error:", err);
      setDemoTrades([]);
    }
  };

  const pickDemoTrade = (t) => {
    setTradeDraft({
      symbol: t.symbol,
      direction: t.direction,
      entry: t.entryPrice,
      exit: t.exitPrice,
      pnl: t.pnl,
      rMultiple: t.rMultiple,
      source: "demo",
    });
  };

  const applyManualTrade = () => {
    const entry = parseFloat(manEntry);
    const exit = parseFloat(manExit);
    if (!manSymbol || isNaN(entry) || isNaN(exit) || entry <= 0 || exit <= 0) return;
    setTradeDraft({
      symbol: manSymbol,
      direction: manDir,
      entry,
      exit,
      pnl: null,
      rMultiple: null,
      source: "manual",
    });
  };

  const handleCreatePost = async () => {
    if (!newPostText.trim() && !newPostImage && !tradeDraft) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "communityPosts"), {
        authorId: user.uid,
        authorName: userProfile?.name || user.displayName || "Anonymous",
        authorPic: userProfile?.profilePic || "",
        authorLevel: userProfile?.level || 1,
        text: newPostText,
        image: newPostImagePreview || "",
        trade: tradeDraft || null,
        likes: [],
        commentCount: 0,
        shareCount: 0,
        views: 0,
        createdAt: serverTimestamp(),
      });
      await awardXP(user.uid, tradeDraft ? 15 : 10);
      setNewPostText("");
      setNewPostImage(null);
      setNewPostImagePreview(null);
      setTradeDraft(null);
      setTradePanel(false);
      setActiveView("home");
    } catch (err) {
      console.error("Post error:", err);
      alert("Failed to create post. Image may be too large — try a smaller image.");
    }
    setPosting(false);
  };

  const handleLike = async (postId, likes) => {
    const isLiked = likes.includes(user.uid);
    await updateDoc(doc(db, "communityPosts", postId), {
      likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
    if (!isLiked) await awardXP(user.uid, 1);
  };

  const handleComment = async (postId) => {
    const text = commentText[postId]?.trim();
    if (!text) return;
    await addDoc(collection(db, "communityPosts", postId, "comments"), {
      authorId: user.uid,
      authorName: userProfile?.name || "Anonymous",
      authorPic: userProfile?.profilePic || "",
      authorLevel: userProfile?.level || 1,
      text,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "communityPosts", postId), { commentCount: increment(1) });
    await awardXP(user.uid, 5);
    setCommentText(prev => ({ ...prev, [postId]: "" }));
    toggleComments(postId, true);
  };

  const toggleComments = async (postId, forceOpen = false) => {
    if (expandedComments[postId] && !forceOpen) {
      setExpandedComments(prev => ({ ...prev, [postId]: null }));
      return;
    }
    const q = query(collection(db, "communityPosts", postId, "comments"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    setExpandedComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
  };

  const handleShare = async (postId) => {
    navigator.clipboard.writeText(`${window.location.origin}/community?post=${postId}`);
    await updateDoc(doc(db, "communityPosts", postId), { shareCount: increment(1) });
    await awardXP(user.uid, 2);
  };

  const handleFollow = async (targetId) => {
    if (!user || !targetId || targetId === user.uid) return;
    const isFollowing = userProfile?.following?.includes(targetId);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        following: isFollowing ? arrayRemove(targetId) : arrayUnion(targetId),
      });
      await updateDoc(doc(db, "users", targetId), {
        followers: isFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      setUserProfile(prev => ({
        ...prev,
        following: isFollowing
          ? (prev.following || []).filter(id => id !== targetId)
          : [...(prev.following || []), targetId],
      }));
      if (profileViewUser?.id === targetId) {
        setProfileViewUser(prev => ({
          ...prev,
          followers: isFollowing
            ? (prev.followers || []).filter(id => id !== user.uid)
            : [...(prev.followers || []), user.uid],
        }));
      }
    } catch (err) {
      console.error("Follow error:", err);
    }
  };

  const trackView = async (postId) => {
    try {
      await updateDoc(doc(db, "communityPosts", postId), { views: increment(1) });
    } catch (err) {
      // ignore
    }
  };

  const compressImage = (file, targetBytes = 700000) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const tryCompress = (maxW, q) => {
            const canvas = document.createElement("canvas");
            let w = img.width;
            let h = img.height;
            if (w > maxW) { h = (h * maxW) / w; w = maxW; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            const result = canvas.toDataURL("image/jpeg", q);
            if (result.length > targetBytes * 1.37 && q > 0.1) {
              return tryCompress(maxW * 0.8, q - 0.1);
            }
            return result;
          };
          resolve(tryCompress(600, 0.6));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePostImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    setNewPostImage(file);
    try {
      const compressed = await compressImage(file);
      setNewPostImagePreview(compressed);
    } catch (err) {
      const reader = new FileReader();
      reader.onloadend = () => setNewPostImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSendDM = async () => {
    if (!dmInput.trim() || !activeDM) return;
    await addDoc(collection(db, "conversations", activeDM, "messages"), {
      senderId: user.uid, text: dmInput, createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "conversations", activeDM), {
      lastMessage: dmInput, lastMessageAt: serverTimestamp(),
    });
    await awardXP(user.uid, 2);
    setDmInput("");
  };

  const handleStartDM = async (otherUser) => {
    const existing = conversations.find(c =>
      c.participants.includes(user.uid) && c.participants.includes(otherUser.id)
    );
    if (existing) { setActiveDM(existing.id); setShowNewDm(false); return; }
    const convRef = await addDoc(collection(db, "conversations"), {
      participants: [user.uid, otherUser.id],
      participantNames: { [user.uid]: userProfile?.name || "You", [otherUser.id]: otherUser.name || "Trader" },
      lastMessage: "", lastMessageAt: serverTimestamp(),
    });
    setActiveDM(convRef.id);
    setShowNewDm(false);
  };

  const viewProfile = async (userId) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) {
        setProfileViewUser({ id: userId, ...snap.data() });
      } else {
        setProfileViewUser({ id: userId, name: "Trader", xp: 0, level: 1 });
      }
      setProfileTab("posts");
      setActiveView("profile");
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  const viewMyProfile = () => {
    if (userProfile) {
      setProfileViewUser(userProfile);
      setProfileTab("posts");
      setActiveView("profile");
      setEditingBio(false);
    }
  };

  const handleSaveBio = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { bio: bioText });
      setUserProfile(prev => ({ ...prev, bio: bioText }));
      setProfileViewUser(prev => ({ ...prev, bio: bioText }));
      setEditingBio(false);
    } catch (err) {
      console.error("Error saving bio:", err);
    }
  };

  if (!user) { navigate("/signup"); return null; }

  // ===== SHARED PIECES =====

  const Avatar = ({ pic, name, cls = "cm-avatar" }) => (
    <div className={cls}>
      {pic ? <img src={pic} alt="" /> : <span>{(name || "T")[0]}</span>}
    </div>
  );

  const TradeCard = ({ trade }) => {
    if (!trade) return null;
    const pct = tradePnlPct(trade);
    const pnlKnown = trade.pnl != null;
    const won = pnlKnown ? trade.pnl > 0 : (pct || 0) > 0;
    return (
      <div className={`cm-trade ${won ? "won" : "lost"}`}>
        <div className="cm-trade-top">
          <span className="cm-trade-symbol">{trade.symbol}</span>
          <span className={`cm-trade-dir ${trade.direction}`}>
            {trade.direction === "sell" ? "SHORT" : "LONG"}
          </span>
          {trade.source === "demo" && <span className="cm-trade-src">Demo Desk</span>}
        </div>
        <div className="cm-trade-nums">
          <div className="cm-trade-num">
            <span className="cm-trade-label">Entry</span>
            <span className="cm-trade-val">{fmtPrice(trade.entry)}</span>
          </div>
          <span className="cm-trade-arrow">→</span>
          <div className="cm-trade-num">
            <span className="cm-trade-label">Exit</span>
            <span className="cm-trade-val">{fmtPrice(trade.exit)}</span>
          </div>
          <div className="cm-trade-result">
            {pnlKnown && <span className={`cm-trade-pnl ${won ? "pos" : "neg"}`}>{fmtMoney(trade.pnl)}</span>}
            {pct != null && (
              <span className={`cm-trade-pct ${won ? "pos" : "neg"}`}>
                {pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct).toFixed(2)}%
              </span>
            )}
            {trade.rMultiple != null && (
              <span className="cm-trade-r">{Number(trade.rMultiple).toFixed(1)}R</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ===== POST CARD =====
  const renderPost = (post) => {
    const rank = getRankTitle(post.authorLevel || 1);
    const isLiked = post.likes?.includes(user.uid);
    const comments = expandedComments[post.id];

    return (
      <article className="cm-post" key={post.id}>
        <div className="cm-post-head">
          <div onClick={() => viewProfile(post.authorId)} style={{ cursor: "pointer" }}>
            <Avatar pic={post.authorPic} name={post.authorName} />
          </div>
          <div className="cm-post-user" onClick={() => viewProfile(post.authorId)}>
            <span className="cm-username">{post.authorName}</span>
            <span className="cm-rank" style={{ color: rank.color }}>
              {rank.badge} {rank.title} · Lvl {post.authorLevel || 1}
            </span>
          </div>
          {post.authorId !== user.uid && (
            <button
              className={`cm-follow-btn ${userProfile?.following?.includes(post.authorId) ? "following" : ""}`}
              onClick={() => handleFollow(post.authorId)}
            >
              {userProfile?.following?.includes(post.authorId) ? "Following" : "Follow"}
            </button>
          )}
          <span className="cm-post-time">{formatTime(post.createdAt)}</span>
        </div>

        {post.text && <p className="cm-post-text">{post.text}</p>}

        <TradeCard trade={post.trade} />

        {post.image && (
          <div className="cm-post-image">
            <img src={post.image} alt="Chart shared by a trader" onLoad={() => trackView(post.id)} />
          </div>
        )}

        <div className="cm-post-actions">
          <button
            className={`cm-action ${isLiked ? "liked" : ""}`}
            onClick={() => handleLike(post.id, post.likes || [])}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? "#ff3040" : "none"} stroke={isLiked ? "#ff3040" : "currentColor"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span>{post.likes?.length || ""}</span>
          </button>
          <button className="cm-action" onClick={() => toggleComments(post.id)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span>{post.commentCount || ""}</span>
          </button>
          <button className="cm-action" onClick={() => handleShare(post.id)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>{post.shareCount || ""}</span>
          </button>
          {(post.views || 0) > 0 && <span className="cm-post-views">{post.views} views</span>}
        </div>

        {post.commentCount > 0 && !comments && (
          <button className="cm-view-comments" onClick={() => toggleComments(post.id)}>
            View all {post.commentCount} comments
          </button>
        )}

        {comments && (
          <div className="cm-comments">
            {comments.map((c) => (
              <div className="cm-comment" key={c.id}>
                <div onClick={() => viewProfile(c.authorId)} style={{ cursor: "pointer" }}>
                  <Avatar pic={c.authorPic} name={c.authorName} cls="cm-avatar cm-avatar-xs" />
                </div>
                <p className="cm-comment-body">
                  <span className="cm-comment-user" onClick={() => viewProfile(c.authorId)}>
                    {c.authorName}
                    <span className="cm-comment-badge" style={{ color: getRankTitle(c.authorLevel || 1).color }}>
                      {getRankTitle(c.authorLevel || 1).badge}
                    </span>
                  </span>
                  {c.text}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="cm-add-comment">
          <Avatar pic={userProfile?.profilePic} name={userProfile?.name} cls="cm-avatar cm-avatar-xs" />
          <input
            placeholder="Add a comment..."
            value={commentText[post.id] || ""}
            onChange={(e) => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
          />
          {commentText[post.id]?.trim() && (
            <button className="cm-comment-post" onClick={() => handleComment(post.id)}>Post</button>
          )}
        </div>
      </article>
    );
  };

  // ===== COMPOSER =====
  const manualPct = (() => {
    const e = parseFloat(manEntry);
    const x = parseFloat(manExit);
    if (isNaN(e) || isNaN(x) || e <= 0) return null;
    return (manDir === "sell" ? -1 : 1) * ((x - e) / e) * 100;
  })();

  const renderComposer = () => (
    <div className="cm-composer" ref={composerRef}>
      <div className="cm-composer-top">
        <Avatar pic={userProfile?.profilePic} name={userProfile?.name} />
        <textarea
          className="cm-composer-input"
          placeholder="Share a setup, a chart, or a lesson from a trade..."
          value={newPostText}
          onChange={(e) => setNewPostText(e.target.value)}
          rows={2}
        />
      </div>

      {newPostImagePreview && (
        <div className="cm-composer-preview">
          <img src={newPostImagePreview} alt="Attached chart" />
          <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(null); }}>✕</button>
        </div>
      )}

      {tradeDraft && (
        <div className="cm-draft-wrap">
          <TradeCard trade={tradeDraft} />
          <button className="cm-draft-x" onClick={() => setTradeDraft(null)}>Remove trade ✕</button>
        </div>
      )}

      {tradePanel && !tradeDraft && (
        <div className="cm-trade-panel">
          <div className="cm-trade-tabs">
            <button
              className={tradeSource === "demo" ? "active" : ""}
              onClick={() => { setTradeSource("demo"); loadDemoTrades(); }}
            >
              From my Demo Desk
            </button>
            <button
              className={tradeSource === "manual" ? "active" : ""}
              onClick={() => setTradeSource("manual")}
            >
              Enter a trade
            </button>
          </div>

          {tradeSource === "demo" && (
            <div className="cm-demo-list">
              {demoTrades === null ? (
                <p className="cm-hint">Loading your demo trades…</p>
              ) : demoTrades.length === 0 ? (
                <p className="cm-hint">
                  No closed demo trades yet. Take a trade on the Demo Desk and it will show up here, ready to share.
                </p>
              ) : (
                demoTrades.map(t => (
                  <button className="cm-demo-row" key={t.id} onClick={() => pickDemoTrade(t)}>
                    <span className={`cm-demo-dir ${t.direction}`}>{t.direction === "sell" ? "SHORT" : "LONG"}</span>
                    <span className="cm-demo-sym">{t.symbol}</span>
                    <span className="cm-demo-px">{fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}</span>
                    <span className={`cm-demo-pnl ${t.pnl >= 0 ? "pos" : "neg"}`}>{fmtMoney(t.pnl)}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {tradeSource === "manual" && (
            <div className="cm-manual">
              <div className="cm-manual-row">
                <select className="cm-input" value={manSymbol} onChange={(e) => setManSymbol(e.target.value)}>
                  {ROSTER.map(r => (
                    <option key={r.symbol} value={r.symbol}>{r.symbol}</option>
                  ))}
                </select>
                <div className="cm-dir-toggle">
                  <button className={manDir === "buy" ? "active long" : ""} onClick={() => setManDir("buy")}>Long</button>
                  <button className={manDir === "sell" ? "active short" : ""} onClick={() => setManDir("sell")}>Short</button>
                </div>
              </div>
              <div className="cm-manual-row">
                <input className="cm-input" type="number" step="any" placeholder="Entry price" value={manEntry} onChange={(e) => setManEntry(e.target.value)} />
                <input className="cm-input" type="number" step="any" placeholder="Exit price" value={manExit} onChange={(e) => setManExit(e.target.value)} />
                {manualPct != null && (
                  <span className={`cm-manual-pct ${manualPct >= 0 ? "pos" : "neg"}`}>
                    {manualPct >= 0 ? "+" : "−"}{Math.abs(manualPct).toFixed(2)}%
                  </span>
                )}
              </div>
              <button className="cm-attach-btn" onClick={applyManualTrade} disabled={manualPct == null}>
                Attach trade
              </button>
            </div>
          )}
        </div>
      )}

      <div className="cm-composer-actions">
        <button className="cm-tool-btn" onClick={() => fileInputRef.current.click()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          Photo
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePostImage} style={{ display: "none" }} />
        <button
          className={`cm-tool-btn ${tradePanel ? "active" : ""}`}
          onClick={() => { setTradePanel(p => !p); if (!tradePanel) loadDemoTrades(); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          Share a trade
        </button>
        <button
          className="cm-post-btn"
          onClick={handleCreatePost}
          disabled={posting || (!newPostText.trim() && !newPostImage && !tradeDraft)}
        >
          {posting ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );

  // ===== FEED FILTERING =====
  const visiblePosts = posts.filter(p => {
    if (feedFilter === "trades") return !!p.trade;
    if (feedFilter === "charts") return !!p.image;
    if (feedFilter === "following") {
      return p.authorId === user.uid || (userProfile?.following || []).includes(p.authorId);
    }
    return true;
  });

  const myRank = getRankTitle(userProfile?.level || 1);

  // ===== MAIN LAYOUT =====
  return (
    <div className="cm-layout">
      {/* ===== LEFT NAV ===== */}
      <aside className="cm-nav">
        <div className="cm-nav-logo" onClick={() => setActiveView("home")}>
          <img src={wallieLogo} alt="Wallie" />
          <span>Community</span>
        </div>

        <nav className="cm-nav-list">
          <button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={activeView === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Feed</span>
          </button>
          <button className={activeView === "search" ? "active" : ""} onClick={() => setActiveView("search")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Find traders</span>
          </button>
          <button className={activeView === "notifications" ? "active" : ""} onClick={() => setActiveView("notifications")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={activeView === "notifications" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span>Activity</span>
          </button>
          <button className={activeView === "messages" ? "active" : ""} onClick={() => { setActiveView("messages"); setActiveDM(null); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span>Messages</span>
          </button>
          <button className={activeView === "profile" ? "active" : ""} onClick={viewMyProfile}>
            <Avatar pic={userProfile?.profilePic} name={userProfile?.name} cls="cm-avatar cm-avatar-nav" />
            <span>Profile</span>
          </button>
        </nav>

        <div className="cm-nav-bottom">
          <button onClick={() => navigate("/demo")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            <span>Demo Desk</span>
          </button>
          <button onClick={() => navigate("/chat")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 016 6c0 2.4-1.4 4.2-3 5.3V17a3 3 0 01-6 0v-2.7C7.4 13.2 6 11.4 6 9a6 6 0 016-6z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
            <span>Ask Wallie</span>
          </button>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="cm-main">
        {activeView === "home" && (
          <div className="cm-home">
            <div className="cm-feed-col">
              <div className="cm-feed-head">
                <h1>Trader Community</h1>
                <p>Real trades, real charts, real lessons — learn from how other traders work.</p>
              </div>

              {renderComposer()}

              <div className="cm-filters">
                {[
                  ["all", "All posts"],
                  ["trades", "Trades"],
                  ["charts", "Charts"],
                  ["following", "Following"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`cm-filter ${feedFilter === key ? "active" : ""}`}
                    onClick={() => setFeedFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="cm-feed">
                {loadingPosts ? (
                  <div className="cm-empty">Loading the feed…</div>
                ) : visiblePosts.length === 0 ? (
                  <div className="cm-empty">
                    {feedFilter === "trades" && "No trade posts yet — share one of your Demo Desk trades to start it."}
                    {feedFilter === "charts" && "No chart posts yet — post a picture of your setup."}
                    {feedFilter === "following" && "Nothing here yet — follow some traders and their posts will land in this tab."}
                    {feedFilter === "all" && "No posts yet. Be the first to share a trade or a chart."}
                  </div>
                ) : (
                  visiblePosts.map(renderPost)
                )}
              </div>
            </div>

            {/* Right rail */}
            <aside className="cm-rail">
              <div className="cm-card cm-me" onClick={viewMyProfile}>
                <Avatar pic={userProfile?.profilePic} name={userProfile?.name} cls="cm-avatar cm-avatar-lg" />
                <div className="cm-me-info">
                  <span className="cm-me-name">{userProfile?.name || "Trader"}</span>
                  <span className="cm-me-rank" style={{ color: myRank.color }}>
                    {myRank.badge} {myRank.title} · Level {userProfile?.level || 1}
                  </span>
                  <div className="cm-xp-bar">
                    <div className="cm-xp-fill" style={{ width: `${levelProgress(userProfile?.xp) * 100}%` }} />
                  </div>
                  <span className="cm-me-xp">
                    {userProfile?.xp || 0} XP · {(userProfile?.xp || 0) % 100}/100 to Level {(userProfile?.level || 1) + 1}
                  </span>
                </div>
              </div>

              <div className="cm-card">
                <h3 className="cm-card-title">Top Traders</h3>
                {leaderboard.slice(0, 8).map((u, i) => {
                  const rank = getRankTitle(u.level || 1);
                  return (
                    <div className="cm-lb-row" key={u.id} onClick={() => viewProfile(u.id)}>
                      <span className="cm-lb-pos">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                      <Avatar pic={u.profilePic} name={u.name} cls="cm-avatar cm-avatar-sm" />
                      <div className="cm-lb-info">
                        <span className="cm-lb-name">{u.name || "Trader"}</span>
                        <span className="cm-lb-rank" style={{ color: rank.color }}>{rank.badge} Lvl {u.level || 1}</span>
                      </div>
                      <span className="cm-lb-xp">{u.xp || 0} XP</span>
                    </div>
                  );
                })}
                {leaderboard.length === 0 && <p className="cm-hint">Post, comment and share trades to earn XP and climb the board.</p>}
              </div>

              <div className="cm-card cm-learn">
                <h3 className="cm-card-title">Learn the Wallie way</h3>
                <p>Post your trades — wins <em>and</em> losses. The community levels up by studying real decisions, and Wallie grades the process, not just the P&amp;L.</p>
              </div>

              <p className="cm-footer">Wallie AI Community · {new Date().getFullYear()}</p>
            </aside>
          </div>
        )}

        {/* SEARCH */}
        {activeView === "search" && (
          <div className="cm-page">
            <h2 className="cm-page-title">Find traders</h2>
            <div className="cm-search-bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search traders by name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
            </div>
            <div className="cm-search-results">
              {searchResults.map(u => {
                const rank = getRankTitle(u.level || 1);
                return (
                  <div className="cm-search-row" key={u.id} onClick={() => viewProfile(u.id)}>
                    <Avatar pic={u.profilePic} name={u.name} />
                    <div className="cm-search-info">
                      <span className="cm-search-name">{u.name}</span>
                      <span className="cm-search-rank" style={{ color: rank.color }}>
                        {rank.badge} {rank.title} · Lvl {u.level || 1} · {u.xp || 0} XP
                      </span>
                    </div>
                  </div>
                );
              })}
              {searchQuery && searchResults.length === 0 && <div className="cm-empty">No traders found</div>}
              {!searchQuery && <div className="cm-empty">Search for traders by name — tap one to see their trades and pictures.</div>}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeView === "notifications" && (
          <div className="cm-page">
            <h2 className="cm-page-title">Activity</h2>
            {notifications.length === 0 ? (
              <div className="cm-empty">No activity yet. Post a trade or a chart to get the conversation going.</div>
            ) : (
              notifications.map((n, i) => (
                <div className="cm-notif-row" key={i}>
                  <span className="cm-notif-icon">{n.type === "like" ? "❤️" : "💬"}</span>
                  <p>
                    <strong>{n.count}</strong> {n.type === "like" ? "likes" : "comments"} on "{n.postText}..."
                  </p>
                  <span className="cm-notif-time">{formatTime(n.time)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* MESSAGES */}
        {activeView === "messages" && (
          <div className="cm-page cm-messages-page">
            {!activeDM ? (
              <>
                <div className="cm-msg-header">
                  <h2 className="cm-page-title">Messages</h2>
                  <button className="cm-new-dm" onClick={() => setShowNewDm(true)} aria-label="New message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>

                {showNewDm && (
                  <div className="cm-new-dm-panel">
                    <input placeholder="Search users..." value={newDmUser} onChange={(e) => setNewDmUser(e.target.value)} />
                    {allUsers.filter(u => u.name?.toLowerCase().includes(newDmUser.toLowerCase())).slice(0, 8).map(u => (
                      <div className="cm-dm-user-row" key={u.id} onClick={() => handleStartDM(u)}>
                        <Avatar pic={u.profilePic} name={u.name} cls="cm-avatar cm-avatar-sm" />
                        <span>{u.name || "Trader"}</span>
                      </div>
                    ))}
                    <button className="cm-cancel" onClick={() => setShowNewDm(false)}>Cancel</button>
                  </div>
                )}

                <div className="cm-conv-list">
                  {conversations.length === 0 ? (
                    <div className="cm-empty">No conversations yet — open a trader's profile and tap Message.</div>
                  ) : conversations.map(conv => {
                    const otherName = Object.entries(conv.participantNames || {}).find(([k]) => k !== user.uid)?.[1] || "Trader";
                    return (
                      <div className="cm-conv-row" key={conv.id} onClick={() => setActiveDM(conv.id)}>
                        <Avatar pic="" name={otherName} />
                        <div className="cm-conv-info">
                          <span className="cm-conv-name">{otherName}</span>
                          <span className="cm-conv-preview">{conv.lastMessage || "Start chatting"}</span>
                        </div>
                        <span className="cm-conv-time">{formatTime(conv.lastMessageAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="cm-dm-chat">
                <div className="cm-dm-chat-header">
                  <button onClick={() => setActiveDM(null)} aria-label="Back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <span>Chat</span>
                </div>
                <div className="cm-dm-messages">
                  {dmMessages.map(msg => (
                    <div className={`cm-dm-bubble ${msg.senderId === user.uid ? "mine" : "theirs"}`} key={msg.id}>
                      <p>{msg.text}</p>
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>
                  ))}
                  <div ref={dmEndRef} />
                </div>
                <div className="cm-dm-input">
                  <input
                    placeholder="Message..."
                    value={dmInput}
                    onChange={(e) => setDmInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendDM()}
                  />
                  <button onClick={handleSendDM}>Send</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROFILE */}
        {activeView === "profile" && profileViewUser && (() => {
          const pRank = getRankTitle(profileViewUser.level || 1);
          const isMe = profileViewUser.id === user.uid;
          const tabPosts =
            profileTab === "pictures" ? profilePosts.filter(p => p.image) :
            profileTab === "trades" ? profilePosts.filter(p => p.trade) :
            profilePosts;
          const picPosts = profilePosts.filter(p => p.image);
          return (
            <div className="cm-profile-page">
              <div className="cm-profile-header cm-card">
                <Avatar pic={profileViewUser.profilePic} name={profileViewUser.name} cls="cm-avatar cm-avatar-xl" />
                <div className="cm-profile-info">
                  <div className="cm-profile-top">
                    <h2>{profileViewUser.name || "Trader"}</h2>
                    {!isMe && (
                      <>
                        <button
                          className={`cm-follow-btn big ${userProfile?.following?.includes(profileViewUser.id) ? "following" : ""}`}
                          onClick={() => handleFollow(profileViewUser.id)}
                        >
                          {userProfile?.following?.includes(profileViewUser.id) ? "Following" : "Follow"}
                        </button>
                        <button className="cm-msg-btn" onClick={() => { handleStartDM(profileViewUser); setActiveView("messages"); }}>
                          Message
                        </button>
                      </>
                    )}
                  </div>
                  <span className="cm-profile-rank" style={{ color: pRank.color }}>
                    {pRank.badge} {pRank.title} · Level {profileViewUser.level || 1} · {profileViewUser.xp || 0} XP
                  </span>
                  <div className="cm-xp-bar cm-profile-xpbar">
                    <div className="cm-xp-fill" style={{ width: `${levelProgress(profileViewUser.xp) * 100}%` }} />
                  </div>
                  <div className="cm-profile-stats">
                    <div><strong>{profilePosts.length}</strong><span>posts</span></div>
                    <div><strong>{profilePosts.filter(p => p.trade).length}</strong><span>trades</span></div>
                    <div><strong>{picPosts.length}</strong><span>pictures</span></div>
                    <div><strong>{profileViewUser.followers?.length || 0}</strong><span>followers</span></div>
                    <div><strong>{profileViewUser.following?.length || 0}</strong><span>following</span></div>
                  </div>
                  {isMe ? (
                    editingBio ? (
                      <div className="cm-bio-edit">
                        <textarea
                          className="cm-bio-textarea"
                          value={bioText}
                          onChange={(e) => setBioText(e.target.value)}
                          placeholder="Write a bio — your markets, your style, your rules..."
                          rows={3}
                          maxLength={200}
                          autoFocus
                        />
                        <div className="cm-bio-actions">
                          <button className="cm-bio-save" onClick={handleSaveBio}>Save</button>
                          <button className="cm-bio-cancel" onClick={() => setEditingBio(false)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="cm-profile-bio editable" onClick={() => { setBioText(profileViewUser.bio || ""); setEditingBio(true); }}>
                        {profileViewUser.bio || "Tap to add a bio..."}
                      </p>
                    )
                  ) : (
                    <p className="cm-profile-bio">{profileViewUser.bio || "No bio yet."}</p>
                  )}
                  {profileViewUser.tradingExperience && (
                    <span className="cm-profile-exp">{profileViewUser.tradingExperience}</span>
                  )}
                </div>
              </div>

              <div className="cm-profile-tabs">
                {[
                  ["posts", "Posts"],
                  ["pictures", "Pictures"],
                  ["trades", "Trades"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`cm-ptab ${profileTab === key ? "active" : ""}`}
                    onClick={() => setProfileTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {profileTab === "pictures" ? (
                <div className="cm-pic-grid">
                  {tabPosts.length === 0 ? (
                    <div className="cm-empty">No pictures yet.</div>
                  ) : (
                    tabPosts.map(p => (
                      <div className="cm-pic-item" key={p.id} onClick={() => setSelectedPost(p)}>
                        <img src={p.image} alt="Trader's chart" />
                        <div className="cm-pic-overlay">
                          <span>❤️ {p.likes?.length || 0}</span>
                          <span>💬 {p.commentCount || 0}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : tabPosts.length === 0 ? (
                <div className="cm-empty">
                  {profileTab === "trades" ? "No trades shared yet." : "No posts yet."}
                </div>
              ) : (
                <div className="cm-feed cm-profile-feed">
                  {tabPosts.map(renderPost)}
                </div>
              )}
            </div>
          );
        })()}

        {/* POST MODAL */}
        {selectedPost && (
          <div className="cm-modal-overlay" onClick={() => setSelectedPost(null)}>
            <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
              <button className="cm-modal-close" onClick={() => setSelectedPost(null)}>✕</button>
              {renderPost(selectedPost)}
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="cm-mobile-nav">
        <button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")} aria-label="Feed">
          <svg width="24" height="24" viewBox="0 0 24 24" fill={activeView === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <button className={activeView === "search" ? "active" : ""} onClick={() => setActiveView("search")} aria-label="Find traders">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button onClick={() => { setActiveView("home"); setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }} aria-label="New post">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>
        <button className={activeView === "messages" ? "active" : ""} onClick={() => { setActiveView("messages"); setActiveDM(null); }} aria-label="Messages">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
        <button className={activeView === "profile" ? "active" : ""} onClick={viewMyProfile} aria-label="Profile">
          <Avatar pic={userProfile?.profilePic} name={userProfile?.name} cls="cm-avatar cm-avatar-nav" />
        </button>
      </nav>
    </div>
  );
};

export default Community;

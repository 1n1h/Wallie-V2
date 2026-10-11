import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, addDoc, getDocs, getDoc, updateDoc,
  query, orderBy, serverTimestamp, arrayUnion, arrayRemove, increment, onSnapshot, where, limit
} from "firebase/firestore";
import { db } from "../../firebase";
import wallieLogo from "../../assets/wallie-mark.png";
import "./Community.css";

const Community = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Navigation
  const [activeView, setActiveView] = useState("home"); // home, search, notifications, create, messages, profile
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

  // User
  const [userProfile, setUserProfile] = useState(null);
  const [profileViewUser, setProfileViewUser] = useState(null);
  const [profilePosts, setProfilePosts] = useState([]);
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
        // Composite index may not exist — fallback to filtering from all loaded posts
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
    // Load recent activity on user's posts
    const loadNotifs = async () => {
      const myPosts = posts.filter(p => p.authorId === user.uid);
      const notifs = myPosts.flatMap(p => {
        const items = [];
        if (p.likes?.length > 0) {
          items.push({
            type: "like",
            count: p.likes.length,
            postText: p.text?.slice(0, 40) || "your post",
            time: p.createdAt,
          });
        }
        if (p.commentCount > 0) {
          items.push({
            type: "comment",
            count: p.commentCount,
            postText: p.text?.slice(0, 40) || "your post",
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

  // ===== ACTIONS =====

  const handleCreatePost = async () => {
    if (!newPostText.trim() && !newPostImage) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "communityPosts"), {
        authorId: user.uid,
        authorName: userProfile?.name || user.displayName || "Anonymous",
        authorPic: userProfile?.profilePic || "",
        authorLevel: userProfile?.level || 1,
        text: newPostText,
        image: newPostImagePreview || "",
        likes: [],
        commentCount: 0,
        shareCount: 0,
        views: 0,
        createdAt: serverTimestamp(),
      });
      await awardXP(user.uid, 10);
      setNewPostText("");
      setNewPostImage(null);
      setNewPostImagePreview(null);
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
    // Reload comments
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
      // Update local state
      setUserProfile(prev => ({
        ...prev,
        following: isFollowing
          ? (prev.following || []).filter(id => id !== targetId)
          : [...(prev.following || []), targetId],
      }));
      // Update profileViewUser if viewing this user
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
            // base64 string length is ~1.37x the byte size
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
      // Fallback to raw base64
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
      setActiveView("profile");
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  const viewMyProfile = () => {
    if (userProfile) {
      setProfileViewUser(userProfile);
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

  // ===== RENDER POST CARD =====
  const renderPost = (post) => {
    const rank = getRankTitle(post.authorLevel || 1);
    const isLiked = post.likes?.includes(user.uid);
    const comments = expandedComments[post.id];

    return (
      <div className="ig-post" key={post.id}>
        {/* Post header */}
        <div className="ig-post-header">
          <div className="ig-avatar" onClick={() => viewProfile(post.authorId)}>
            {post.authorPic ? <img src={post.authorPic} alt="" /> : <span>{(post.authorName || "T")[0]}</span>}
          </div>
          <div className="ig-post-user" onClick={() => viewProfile(post.authorId)}>
            <span className="ig-username">{post.authorName}</span>
            <span className="ig-rank-badge" style={{ color: rank.color }}>{rank.badge} {rank.title}</span>
          </div>
          {post.authorId !== user.uid && (
            <button
              className={`ig-follow-btn ${userProfile?.following?.includes(post.authorId) ? "following" : ""}`}
              onClick={(e) => { e.stopPropagation(); handleFollow(post.authorId); }}
            >
              {userProfile?.following?.includes(post.authorId) ? "Following" : "Follow"}
            </button>
          )}
          <span className="ig-post-time">{formatTime(post.createdAt)}</span>
        </div>

        {/* Post image */}
        {post.image && (
          <div className="ig-post-image">
            <img src={post.image} alt="Post" onLoad={() => trackView(post.id)} />
          </div>
        )}

        {/* Post actions */}
        <div className="ig-post-actions">
          <div className="ig-actions-left">
            <button className={`ig-action ${isLiked ? "liked" : ""}`} onClick={() => handleLike(post.id, post.likes || [])}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={isLiked ? "#ff3040" : "none"} stroke={isLiked ? "#ff3040" : "currentColor"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            </button>
            <button className="ig-action" onClick={() => toggleComments(post.id)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </button>
            <button className="ig-action" onClick={() => handleShare(post.id)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <button className="ig-action">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          </button>
        </div>

        {/* Stats row */}
        <div className="ig-post-stats">
          {post.likes?.length > 0 && (
            <span className="ig-likes">{post.likes.length} {post.likes.length === 1 ? "like" : "likes"}</span>
          )}
          {(post.views || 0) > 0 && (
            <span className="ig-views">{post.views} {post.views === 1 ? "view" : "views"}</span>
          )}
          {(post.shareCount || 0) > 0 && (
            <span className="ig-shares">{post.shareCount} {post.shareCount === 1 ? "share" : "shares"}</span>
          )}
        </div>

        {/* Caption */}
        {post.text && (
          <p className="ig-caption">
            <span className="ig-caption-user" onClick={() => viewProfile(post.authorId)}>{post.authorName}</span>
            {" "}{post.text}
          </p>
        )}

        {/* View comments link */}
        {post.commentCount > 0 && !comments && (
          <button className="ig-view-comments" onClick={() => toggleComments(post.id)}>
            View all {post.commentCount} comments
          </button>
        )}

        {/* Comments */}
        {comments && (
          <div className="ig-comments">
            {comments.map((c) => (
              <div className="ig-comment" key={c.id}>
                <span className="ig-comment-user" onClick={() => viewProfile(c.authorId)}>
                  {c.authorName}
                  <span className="ig-comment-badge" style={{ color: getRankTitle(c.authorLevel || 1).color }}>
                    {getRankTitle(c.authorLevel || 1).badge}
                  </span>
                </span>
                {" "}{c.text}
              </div>
            ))}
          </div>
        )}

        {/* Add comment */}
        <div className="ig-add-comment">
          <input
            placeholder="Add a comment..."
            value={commentText[post.id] || ""}
            onChange={(e) => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
          />
          {commentText[post.id]?.trim() && (
            <button className="ig-post-comment-btn" onClick={() => handleComment(post.id)}>Post</button>
          )}
        </div>
      </div>
    );
  };

  // ===== MAIN LAYOUT =====
  return (
    <div className="ig-layout">
      {/* ===== LEFT SIDEBAR ===== */}
      <aside className="ig-sidebar">
        <div className="ig-sidebar-logo" onClick={() => setActiveView("home")}>
          <img src={wallieLogo} alt="Wallie" />
          <span>Wallie</span>
        </div>

        <nav className="ig-sidebar-nav">
          <button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill={activeView === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Home</span>
          </button>
          <button className={activeView === "search" ? "active" : ""} onClick={() => setActiveView("search")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Search</span>
          </button>
          <button className={activeView === "notifications" ? "active" : ""} onClick={() => setActiveView("notifications")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill={activeView === "notifications" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span>Notifications</span>
          </button>
          <button className={activeView === "create" ? "active" : ""} onClick={() => setActiveView("create")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span>Create</span>
          </button>
          <button className={activeView === "messages" ? "active" : ""} onClick={() => { setActiveView("messages"); setActiveDM(null); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span>Messages</span>
          </button>
          <button className={activeView === "profile" ? "active" : ""} onClick={viewMyProfile}>
            <div className="ig-nav-avatar">
              {userProfile?.profilePic ? <img src={userProfile.profilePic} alt="" /> : <span>{(userProfile?.name || "T")[0]}</span>}
            </div>
            <span>Profile</span>
          </button>
        </nav>

        <div className="ig-sidebar-bottom">
          <button onClick={() => navigate("/chat")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M14 9a2 2 0 11-4 0"/></svg>
            <span>Wallie Chat</span>
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="ig-main">
        {/* HOME FEED */}
        {activeView === "home" && (
          <div className="ig-home">
            <div className="ig-feed">
              {loadingPosts ? (
                <div className="ig-empty">Loading...</div>
              ) : posts.length === 0 ? (
                <div className="ig-empty">No posts yet. Be the first to share!</div>
              ) : (
                posts.map(renderPost)
              )}
            </div>

            {/* Right sidebar */}
            <aside className="ig-right-sidebar">
              {/* Current user */}
              <div className="ig-rs-user" onClick={viewMyProfile}>
                <div className="ig-avatar-md">
                  {userProfile?.profilePic ? <img src={userProfile.profilePic} alt="" /> : <span>{(userProfile?.name || "T")[0]}</span>}
                </div>
                <div className="ig-rs-user-info">
                  <span className="ig-rs-username">{userProfile?.name || "Trader"}</span>
                  <span className="ig-rs-rank" style={{ color: getRankTitle(userProfile?.level || 1).color }}>
                    {getRankTitle(userProfile?.level || 1).badge} {getRankTitle(userProfile?.level || 1).title} · Lvl {userProfile?.level || 1}
                  </span>
                </div>
                <span className="ig-rs-xp">{userProfile?.xp || 0} XP</span>
              </div>

              {/* Top Traders */}
              <div className="ig-rs-section">
                <div className="ig-rs-section-header">
                  <span>Top Traders</span>
                </div>
                {leaderboard.slice(0, 8).map((u, i) => {
                  const rank = getRankTitle(u.level || 1);
                  return (
                    <div className="ig-rs-suggestion" key={u.id} onClick={() => viewProfile(u.id)}>
                      <span className="ig-rs-pos">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                      <div className="ig-avatar-sm">
                        {u.profilePic ? <img src={u.profilePic} alt="" /> : <span>{(u.name || "T")[0]}</span>}
                      </div>
                      <div className="ig-rs-sug-info">
                        <span className="ig-rs-sug-name">{u.name || "Trader"}</span>
                        <span className="ig-rs-sug-rank" style={{ color: rank.color }}>{rank.badge} Lvl {u.level || 1}</span>
                      </div>
                      <span className="ig-rs-sug-xp">{u.xp || 0}</span>
                    </div>
                  );
                })}
              </div>

              <p className="ig-rs-footer">Wallie AI Community · {new Date().getFullYear()}</p>
            </aside>
          </div>
        )}

        {/* SEARCH */}
        {activeView === "search" && (
          <div className="ig-search-page">
            <div className="ig-search-bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search traders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
            </div>
            <div className="ig-search-results">
              {searchResults.map(u => {
                const rank = getRankTitle(u.level || 1);
                return (
                  <div className="ig-search-row" key={u.id} onClick={() => viewProfile(u.id)}>
                    <div className="ig-avatar">
                      {u.profilePic ? <img src={u.profilePic} alt="" /> : <span>{(u.name || "T")[0]}</span>}
                    </div>
                    <div className="ig-search-info">
                      <span className="ig-search-name">{u.name}</span>
                      <span className="ig-search-rank" style={{ color: rank.color }}>{rank.badge} {rank.title} · Lvl {u.level || 1} · {u.xp || 0} XP</span>
                    </div>
                  </div>
                );
              })}
              {searchQuery && searchResults.length === 0 && (
                <div className="ig-empty">No traders found</div>
              )}
              {!searchQuery && (
                <div className="ig-empty">Search for traders by name</div>
              )}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeView === "notifications" && (
          <div className="ig-notifs-page">
            <h2 className="ig-page-title">Notifications</h2>
            {notifications.length === 0 ? (
              <div className="ig-empty">No notifications yet. Start posting to get engagement!</div>
            ) : (
              notifications.map((n, i) => (
                <div className="ig-notif-row" key={i}>
                  <span className="ig-notif-icon">{n.type === "like" ? "❤️" : "💬"}</span>
                  <p>
                    <strong>{n.count}</strong> {n.type === "like" ? "likes" : "comments"} on "{n.postText}..."
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* CREATE POST */}
        {activeView === "create" && (
          <div className="ig-create-page">
            <h2 className="ig-page-title">Create Post</h2>
            <div className="ig-create-card">
              <div className="ig-create-top">
                <div className="ig-avatar">
                  {userProfile?.profilePic ? <img src={userProfile.profilePic} alt="" /> : <span>{(userProfile?.name || "T")[0]}</span>}
                </div>
                <span className="ig-create-name">{userProfile?.name || "Trader"}</span>
              </div>
              <textarea
                className="ig-create-textarea"
                placeholder="Share a trade idea, chart analysis, or market insight..."
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value)}
                rows={5}
              />
              {newPostImagePreview && (
                <div className="ig-create-preview">
                  <img src={newPostImagePreview} alt="Preview" />
                  <button onClick={() => { setNewPostImage(null); setNewPostImagePreview(null); }}>✕</button>
                </div>
              )}
              <div className="ig-create-bottom">
                <button className="ig-create-upload" onClick={() => fileInputRef.current.click()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  Add Photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePostImage} style={{ display: "none" }} />
                <button className="ig-create-submit" onClick={handleCreatePost} disabled={posting || (!newPostText.trim() && !newPostImage)}>
                  {posting ? "Sharing..." : "Share"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MESSAGES */}
        {activeView === "messages" && (
          <div className="ig-messages-page">
            {!activeDM ? (
              <>
                <div className="ig-msg-header">
                  <h2>Messages</h2>
                  <button className="ig-new-dm" onClick={() => setShowNewDm(true)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>

                {showNewDm && (
                  <div className="ig-new-dm-panel">
                    <input placeholder="Search users..." value={newDmUser} onChange={(e) => setNewDmUser(e.target.value)} />
                    {allUsers.filter(u => u.name?.toLowerCase().includes(newDmUser.toLowerCase())).slice(0, 8).map(u => (
                      <div className="ig-dm-user-row" key={u.id} onClick={() => handleStartDM(u)}>
                        <div className="ig-avatar-sm">{u.profilePic ? <img src={u.profilePic} alt="" /> : <span>{(u.name || "T")[0]}</span>}</div>
                        <span>{u.name || "Trader"}</span>
                      </div>
                    ))}
                    <button className="ig-cancel" onClick={() => setShowNewDm(false)}>Cancel</button>
                  </div>
                )}

                <div className="ig-conv-list">
                  {conversations.length === 0 ? (
                    <div className="ig-empty">No conversations yet</div>
                  ) : conversations.map(conv => {
                    const otherName = Object.entries(conv.participantNames || {}).find(([k]) => k !== user.uid)?.[1] || "Trader";
                    return (
                      <div className="ig-conv-row" key={conv.id} onClick={() => setActiveDM(conv.id)}>
                        <div className="ig-avatar"><span>{otherName[0]}</span></div>
                        <div className="ig-conv-info">
                          <span className="ig-conv-name">{otherName}</span>
                          <span className="ig-conv-preview">{conv.lastMessage || "Start chatting"}</span>
                        </div>
                        <span className="ig-conv-time">{formatTime(conv.lastMessageAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="ig-dm-chat">
                <div className="ig-dm-chat-header">
                  <button onClick={() => setActiveDM(null)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <span>Chat</span>
                </div>
                <div className="ig-dm-messages">
                  {dmMessages.map(msg => (
                    <div className={`ig-dm-bubble ${msg.senderId === user.uid ? "mine" : "theirs"}`} key={msg.id}>
                      <p>{msg.text}</p>
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>
                  ))}
                  <div ref={dmEndRef} />
                </div>
                <div className="ig-dm-input">
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
        {activeView === "profile" && profileViewUser && (
          <div className="ig-profile-page">
            <div className="ig-profile-header">
              <div className="ig-profile-pic">
                {profileViewUser.profilePic ? <img src={profileViewUser.profilePic} alt="" /> : <span>{(profileViewUser.name || "T")[0]}</span>}
              </div>
              <div className="ig-profile-info">
                <div className="ig-profile-top-row">
                  <h2>{profileViewUser.name || "Trader"}</h2>
                  {profileViewUser.id !== user.uid && (
                    <>
                      <button
                        className={`ig-profile-follow-btn ${userProfile?.following?.includes(profileViewUser.id) ? "following" : ""}`}
                        onClick={() => handleFollow(profileViewUser.id)}
                      >
                        {userProfile?.following?.includes(profileViewUser.id) ? "Following" : "Follow"}
                      </button>
                      <button className="ig-profile-msg-btn" onClick={() => { handleStartDM(profileViewUser); setActiveView("messages"); }}>Message</button>
                    </>
                  )}
                </div>
                <div className="ig-profile-stats">
                  <div><strong>{profilePosts.length}</strong> posts</div>
                  <div><strong>{profileViewUser.followers?.length || 0}</strong> followers</div>
                  <div><strong>{profileViewUser.following?.length || 0}</strong> following</div>
                  <div><strong>{profileViewUser.xp || 0}</strong> XP</div>
                  <div><strong>Lvl {profileViewUser.level || 1}</strong></div>
                </div>
                <div className="ig-profile-rank" style={{ color: getRankTitle(profileViewUser.level || 1).color }}>
                  {getRankTitle(profileViewUser.level || 1).badge} {getRankTitle(profileViewUser.level || 1).title}
                </div>

                {/* Bio section */}
                {profileViewUser.id === user.uid ? (
                  editingBio ? (
                    <div className="ig-bio-edit">
                      <textarea
                        className="ig-bio-textarea"
                        value={bioText}
                        onChange={(e) => setBioText(e.target.value)}
                        placeholder="Write a bio..."
                        rows={3}
                        maxLength={200}
                        autoFocus
                      />
                      <div className="ig-bio-actions">
                        <button className="ig-bio-save" onClick={handleSaveBio}>Save</button>
                        <button className="ig-bio-cancel" onClick={() => setEditingBio(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="ig-profile-bio ig-bio-editable"
                      onClick={() => { setBioText(profileViewUser.bio || ""); setEditingBio(true); }}
                    >
                      {profileViewUser.bio || "Tap to add a bio..."}
                    </p>
                  )
                ) : (
                  <p className="ig-profile-bio">{profileViewUser.bio || "No bio yet."}</p>
                )}

                {profileViewUser.tradingExperience && (
                  <span className="ig-profile-exp">{profileViewUser.tradingExperience}</span>
                )}
              </div>
            </div>

            {/* Post grid */}
            <div className="ig-profile-grid">
              {profilePosts.length === 0 ? (
                <div className="ig-empty">No posts yet</div>
              ) : (
                profilePosts.map(p => (
                  <div className="ig-grid-item" key={p.id} onClick={() => { setSelectedPost(p); }}>
                    {p.image ? (
                      <img src={p.image} alt="" />
                    ) : (
                      <div className="ig-grid-text"><p>{p.text?.slice(0, 80)}</p></div>
                    )}
                    <div className="ig-grid-overlay">
                      <span>❤️ {p.likes?.length || 0}</span>
                      <span>💬 {p.commentCount || 0}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* POST MODAL */}
        {selectedPost && (
          <div className="ig-modal-overlay" onClick={() => setSelectedPost(null)}>
            <div className="ig-modal" onClick={(e) => e.stopPropagation()}>
              <button className="ig-modal-close" onClick={() => setSelectedPost(null)}>✕</button>
              {renderPost(selectedPost)}
            </div>
          </div>
        )}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="ig-mobile-nav">
        <button className={activeView === "home" ? "active" : ""} onClick={() => setActiveView("home")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill={activeView === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <button className={activeView === "search" ? "active" : ""} onClick={() => setActiveView("search")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button className={activeView === "create" ? "active" : ""} onClick={() => setActiveView("create")}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </button>
        <button className={activeView === "messages" ? "active" : ""} onClick={() => { setActiveView("messages"); setActiveDM(null); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </button>
        <button className={activeView === "profile" ? "active" : ""} onClick={viewMyProfile}>
          <div className="ig-nav-avatar">
            {userProfile?.profilePic ? <img src={userProfile.profilePic} alt="" /> : <span>{(userProfile?.name || "T")[0]}</span>}
          </div>
        </button>
      </nav>
    </div>
  );
};

export default Community;

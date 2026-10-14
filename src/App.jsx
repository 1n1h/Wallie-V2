import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import MaintenancePage from './components/MaintenancePage/MaintenancePage';
import Main from "./components/Main/Main";
import Sidebar from "./components/Sidebar/Sidebar";
import PlayPanel from "./components/PlayPanel/PlayPanel";
import SettingsModal from "./components/Settings/SettingsModal";
import { MessageCircle, List, BarChart3, Eye, Fingerprint } from "lucide-react";

const MOBILE_TABS = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "activity", label: "Activity", icon: List },
  { id: "charts", label: "Charts", icon: BarChart3 },
  { id: "watchlist", label: "Watchlist", icon: Eye },
  { id: "identity", label: "Identity", icon: Fingerprint },
];
// Mobile tab ids -> PlayPanel section ids
const MOBILE_SECTIONS = {
  activity: "activity",
  charts: "approvals",
  watchlist: "upcoming",
  identity: "identity",
};
import DemoDesk from "./components/Demo/DemoDesk";
import LandingPage from './components/LandingPage/LandingPage';
import Signup from "./components/Signup";
import Pricing from "./components/Pricing";
import AdminLogin from "./components/Admin/AdminLogin";
import AdminDashboard from "./components/Admin/AdminDashboard";
import PolicyPage from "./components/Policies/PolicyPage";
import Affiliates from "./components/Affiliates/Affiliates";
import Support from "./components/Support/Support";
import Community from "./components/Community/Community";
import Settings from "./components/Settings/Settings";
import { useAuth } from "./context/AuthContext";
import './App.css';

// ============================================================
// MAINTENANCE MODE
// To disable: set MAINTENANCE_MODE to false and redeploy
// To bypass: use the Admin Access button on the waitlist page
// ============================================================
const MAINTENANCE_MODE = false;

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const isAdmin = sessionStorage.getItem("wallie_admin") === "true";
  if (loading) return null;
  return (user || isAdmin) ? children : <Navigate to="/signup" />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/chat" /> : children;
};

function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState("chat");
  return (
    <div className="chat-container">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Main onMenuClick={() => setSidebarOpen(true)} />
      {(panelOpen || mobileTab !== "chat") && (
        <PlayPanel
          onCollapse={panelOpen ? () => setPanelOpen(false) : undefined}
          mobileSection={mobileTab === "chat" ? null : MOBILE_SECTIONS[mobileTab]}
        />
      )}
      {!panelOpen && (
        <button className="panel-reopen" onClick={() => setPanelOpen(true)} title="Open Wallie panel" aria-label="Open Wallie panel">
          «
        </button>
      )}
      <SettingsModal />
      <nav className="mobile-tabbar" aria-label="Primary">
        {MOBILE_TABS.map((t) => {
          const Icon = t.icon;
          const active = mobileTab === t.id;
          return (
            <button
              key={t.id}
              className={`mtab ${active ? "active" : ""}`}
              onClick={() => setMobileTab(t.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function DemoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="chat-container">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <DemoDesk />
      <SettingsModal />
    </div>
  );
}

function App() {
  const [bypassed, setBypassed] = useState(
    () => sessionStorage.getItem("wallie_bypass") === "true"
  );

  const showMaintenance = MAINTENANCE_MODE && !bypassed;

  return (
    <Router>
      <div className="app">
        <Routes>
          {/* Admin routes always accessible */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />

          {showMaintenance ? (
            <Route path="*" element={<MaintenancePage onUnlock={() => setBypassed(true)} />} />
          ) : (
            <>
              <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/policy/:type" element={<PolicyPage />} />
              <Route path="/affiliates" element={<Affiliates />} />
              <Route path="/support" element={<Support />} />
              <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="/demo" element={<ProtectedRoute><DemoPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            </>
          )}
        </Routes>
      </div>
    </Router>
  );
}

export default App;

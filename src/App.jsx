import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import MaintenancePage from './components/MaintenancePage/MaintenancePage';
import Main from "./components/Main/Main";
import Sidebar from "./components/Sidebar/Sidebar";
import PlayPanel from "./components/PlayPanel/PlayPanel";
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
  return (
    <div className="chat-container">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Main onMenuClick={() => setSidebarOpen(true)} />
      <PlayPanel />
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
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            </>
          )}
        </Routes>
      </div>
    </Router>
  );
}

export default App;

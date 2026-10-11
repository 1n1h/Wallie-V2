import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PIN;

const AdminLogin = () => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem("wallie_admin", "true");
      navigate("/admin/dashboard");
    } else {
      setError("Invalid password");
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <h2 className="admin-login-title">Admin Access</h2>
        <p className="admin-login-sub">Enter your admin password to continue</p>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            className="admin-login-input"
          />
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" className="admin-login-btn">
            LOG IN
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;

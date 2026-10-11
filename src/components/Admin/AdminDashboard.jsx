import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import "./Admin.css";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiSpend, setApiSpend] = useState({ totalCalls: 0, totalTokens: 0, estimatedCost: 0, dailyLog: [] });
  const [affiliates, setAffiliates] = useState([]);

  useEffect(() => {
    if (sessionStorage.getItem("wallie_admin") !== "true") {
      navigate("/admin");
      return;
    }
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const usersSnap = await getDocs(query(collection(db, "users")));
      const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(usersData);

      const waitlistSnap = await getDocs(query(collection(db, "waitlist")));
      const waitlistData = waitlistSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWaitlist(waitlistData);

      // Fetch API spend data
      const spendSnap = await getDoc(doc(db, "admin", "apiSpend"));
      if (spendSnap.exists()) {
        setApiSpend(spendSnap.data());
      }

      // Fetch affiliates
      const affSnap = await getDocs(query(collection(db, "affiliates")));
      const affData = affSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAffiliates(affData);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("wallie_admin");
    navigate("/");
  };

  const exportWaitlistCSV = () => {
    const headers = ["Name", "Email", "Phone", "Source", "Date"];
    const rows = waitlist.map((w) => [
      w.name || "",
      w.email || "",
      w.phone || "",
      w.source || "",
      w.timestamp?.toDate?.()?.toLocaleDateString() || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallie-waitlist-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportUsersCSV = () => {
    const headers = ["Name", "Email", "Bio", "Experience", "Last Login"];
    const rows = users.map((u) => [
      u.name || "",
      u.email || "",
      u.bio || "",
      u.tradingExperience || "",
      u.lastLogin?.toDate?.()?.toLocaleDateString() || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallie-users-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute stats
  const totalMembers = users.length;
  const totalWaitlist = waitlist.length;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const newMembersThisMonth = users.filter((u) => {
    const d = u.lastLogin?.toDate?.();
    return d && d >= thirtyDaysAgo;
  }).length;

  const activeThisWeek = users.filter((u) => {
    const d = u.lastLogin?.toDate?.();
    return d && d >= sevenDaysAgo;
  }).length;

  const experienceBreakdown = users.reduce((acc, u) => {
    const exp = u.tradingExperience || "unknown";
    acc[exp] = (acc[exp] || 0) + 1;
    return acc;
  }, {});

  const sourceBreakdown = waitlist.reduce((acc, w) => {
    const src = w.source || "unknown";
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  const churnRate = totalMembers > 0
    ? Math.max(0, ((totalMembers - activeThisWeek) / totalMembers) * 100).toFixed(1)
    : 0;

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dash">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <h3>Wallie Admin</h3>
        </div>
        <nav className="admin-sidebar-nav">
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
          <button className={activeTab === "members" ? "active" : ""} onClick={() => setActiveTab("members")}>Members</button>
          <button className={activeTab === "waitlist" ? "active" : ""} onClick={() => setActiveTab("waitlist")}>Waitlist</button>
          <button className={activeTab === "analytics" ? "active" : ""} onClick={() => setActiveTab("analytics")}>Analytics</button>
          <button className={activeTab === "mrr" ? "active" : ""} onClick={() => setActiveTab("mrr")}>MRR</button>
          <button className={activeTab === "apiSpend" ? "active" : ""} onClick={() => setActiveTab("apiSpend")}>API Spend</button>
          <button className={activeTab === "affiliates" ? "active" : ""} onClick={() => setActiveTab("affiliates")}>Affiliates</button>
        </nav>
        <div className="admin-sidebar-actions">
          <button className="admin-chat-btn" onClick={() => navigate("/chat")}>Go to Chat</button>
          <button className="admin-logout-btn" onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      <main className="admin-main">
        {activeTab === "overview" && (
          <>
            <h1 className="admin-page-title">Dashboard Overview</h1>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <span className="admin-stat-label">Total Members</span>
                <span className="admin-stat-value">{totalMembers}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Waitlist Signups</span>
                <span className="admin-stat-value">{totalWaitlist}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">New This Month</span>
                <span className="admin-stat-value">{newMembersThisMonth}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Active This Week</span>
                <span className="admin-stat-value">{activeThisWeek}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Churn Rate</span>
                <span className="admin-stat-value">{churnRate}%</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Retention Rate</span>
                <span className="admin-stat-value">{(100 - churnRate).toFixed(1)}%</span>
              </div>
            </div>

            <div className="admin-section">
              <h2>Experience Breakdown</h2>
              <div className="admin-breakdown">
                {Object.entries(experienceBreakdown).map(([key, val]) => (
                  <div className="admin-breakdown-row" key={key}>
                    <span className="admin-breakdown-label">{key}</span>
                    <div className="admin-breakdown-bar">
                      <div
                        className="admin-breakdown-fill"
                        style={{ width: `${(val / totalMembers) * 100}%` }}
                      ></div>
                    </div>
                    <span className="admin-breakdown-count">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-section">
              <h2>Waitlist Sources</h2>
              <div className="admin-breakdown">
                {Object.entries(sourceBreakdown).map(([key, val]) => (
                  <div className="admin-breakdown-row" key={key}>
                    <span className="admin-breakdown-label">{key}</span>
                    <div className="admin-breakdown-bar">
                      <div
                        className="admin-breakdown-fill"
                        style={{ width: `${totalWaitlist > 0 ? (val / totalWaitlist) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <span className="admin-breakdown-count">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "members" && (
          <>
            <div className="admin-page-header">
              <h1 className="admin-page-title">Members ({totalMembers})</h1>
              <button className="admin-export-btn" onClick={exportUsersCSV}>Export CSV</button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Bio</th>
                    <th>Experience</th>
                    <th>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name || "—"}</td>
                      <td>{u.email || "—"}</td>
                      <td>{u.bio || "—"}</td>
                      <td>{u.tradingExperience || "—"}</td>
                      <td>{u.lastLogin?.toDate?.()?.toLocaleDateString() || "—"}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="admin-empty">No members yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "waitlist" && (
          <>
            <div className="admin-page-header">
              <h1 className="admin-page-title">Waitlist ({totalWaitlist})</h1>
              <button className="admin-export-btn" onClick={exportWaitlistCSV}>Export CSV</button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name || "—"}</td>
                      <td>{w.email || "—"}</td>
                      <td>{w.phone || "—"}</td>
                      <td>{w.source || "—"}</td>
                      <td>{w.timestamp?.toDate?.()?.toLocaleDateString() || "—"}</td>
                    </tr>
                  ))}
                  {waitlist.length === 0 && (
                    <tr><td colSpan={5} className="admin-empty">No waitlist signups yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "analytics" && (
          <>
            <h1 className="admin-page-title">Analytics</h1>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <span className="admin-stat-label">Total Signups</span>
                <span className="admin-stat-value">{totalMembers + totalWaitlist}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Conversion (Waitlist to Member)</span>
                <span className="admin-stat-value">
                  {totalWaitlist > 0 ? ((totalMembers / (totalMembers + totalWaitlist)) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Weekly Active Rate</span>
                <span className="admin-stat-value">
                  {totalMembers > 0 ? ((activeThisWeek / totalMembers) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Avg. Daily Signups (30d)</span>
                <span className="admin-stat-value">
                  {(newMembersThisMonth / 30).toFixed(1)}
                </span>
              </div>
            </div>

            <div className="admin-section">
              <h2>Membership Tiers</h2>
              <div className="admin-tier-grid">
                <div className="admin-tier-card">
                  <h3>Free</h3>
                  <span className="admin-tier-count">{users.filter((u) => !u.subscription?.plan || u.subscription?.plan === "free").length}</span>
                  <span className="admin-tier-label">members</span>
                </div>
                <div className="admin-tier-card">
                  <h3>Basic ($9/mo)</h3>
                  <span className="admin-tier-count">{users.filter((u) => u.subscription?.plan === "basic").length}</span>
                  <span className="admin-tier-label">members</span>
                </div>
                <div className="admin-tier-card">
                  <h3>Pro ($29/mo)</h3>
                  <span className="admin-tier-count">{users.filter((u) => u.subscription?.plan === "pro").length}</span>
                  <span className="admin-tier-label">members</span>
                </div>
                <div className="admin-tier-card">
                  <h3>Enterprise</h3>
                  <span className="admin-tier-count">{users.filter((u) => u.subscription?.plan === "enterprise").length}</span>
                  <span className="admin-tier-label">members</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "mrr" && (() => {
          const PLAN_PRICES_MRR = { basic: 9, pro: 29, enterprise: 99 };

          const basicUsers = users.filter((u) => u.subscription?.plan === "basic" && u.subscription?.status !== "canceled");
          const proUsers = users.filter((u) => u.subscription?.plan === "pro" && u.subscription?.status !== "canceled");
          const enterpriseUsers = users.filter((u) => u.subscription?.plan === "enterprise" && u.subscription?.status !== "canceled");
          const freeUsers = users.filter((u) => !u.subscription?.plan || u.subscription?.plan === "free");

          const basicMRR = basicUsers.length * PLAN_PRICES_MRR.basic;
          const proMRR = proUsers.length * PLAN_PRICES_MRR.pro;
          const enterpriseMRR = enterpriseUsers.length * PLAN_PRICES_MRR.enterprise;
          const totalMRR = basicMRR + proMRR + enterpriseMRR;
          const totalARR = totalMRR * 12;
          const totalPaying = basicUsers.length + proUsers.length + enterpriseUsers.length;
          const arpu = totalPaying > 0 ? (totalMRR / totalPaying) : 0;
          const paidRate = users.length > 0 ? ((totalPaying / users.length) * 100) : 0;

          // Revenue by user table
          const payingUsers = users.filter((u) => u.subscription?.plan && u.subscription.plan !== "free" && u.subscription?.status !== "canceled");

          return (
            <>
              <h1 className="admin-page-title">Monthly Recurring Revenue</h1>

              {/* MRR Summary Cards */}
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total MRR</span>
                  <span className="admin-stat-value" style={{ color: "#22c55e" }}>${totalMRR.toLocaleString()}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">ARR (Annual)</span>
                  <span className="admin-stat-value">${totalARR.toLocaleString()}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Paying Users</span>
                  <span className="admin-stat-value">{totalPaying}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">ARPU</span>
                  <span className="admin-stat-value">${arpu.toFixed(2)}/mo</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Free Users</span>
                  <span className="admin-stat-value">{freeUsers.length}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Paid Conversion</span>
                  <span className="admin-stat-value">{paidRate.toFixed(1)}%</span>
                </div>
              </div>

              {/* MRR Breakdown by Plan */}
              <div className="admin-section">
                <h2>MRR Breakdown by Plan</h2>
                <div className="admin-tier-grid">
                  <div className="admin-tier-card">
                    <h3>Basic ($9/mo)</h3>
                    <span className="admin-tier-count" style={{ color: "#3b82f6" }}>${basicMRR}</span>
                    <span className="admin-tier-label">{basicUsers.length} user{basicUsers.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="admin-tier-card">
                    <h3>Pro ($29/mo)</h3>
                    <span className="admin-tier-count" style={{ color: "#006CED" }}>${proMRR}</span>
                    <span className="admin-tier-label">{proUsers.length} user{proUsers.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="admin-tier-card">
                    <h3>Enterprise ($99/mo)</h3>
                    <span className="admin-tier-count" style={{ color: "#f59e0b" }}>${enterpriseMRR}</span>
                    <span className="admin-tier-label">{enterpriseUsers.length} user{enterpriseUsers.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>

              {/* MRR Visual Bar */}
              {totalMRR > 0 && (
                <div className="admin-section">
                  <h2>Revenue Distribution</h2>
                  <div style={{ display: "flex", height: "32px", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {basicMRR > 0 && (
                      <div style={{ width: `${(basicMRR / totalMRR) * 100}%`, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, color: "#fff", minWidth: "40px" }}>
                        Basic ${basicMRR}
                      </div>
                    )}
                    {proMRR > 0 && (
                      <div style={{ width: `${(proMRR / totalMRR) * 100}%`, background: "#006CED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, color: "#fff", minWidth: "40px" }}>
                        Pro ${proMRR}
                      </div>
                    )}
                    {enterpriseMRR > 0 && (
                      <div style={{ width: `${(enterpriseMRR / totalMRR) * 100}%`, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, color: "#fff", minWidth: "40px" }}>
                        Ent ${enterpriseMRR}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Paying Users Table */}
              <div className="admin-section">
                <h2>Paying Users ({payingUsers.length})</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th>MRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payingUsers.map((u) => (
                        <tr key={u.id}>
                          <td>{u.name || "—"}</td>
                          <td>{u.email || "—"}</td>
                          <td style={{ textTransform: "capitalize", fontWeight: 600 }}>{u.subscription?.plan}</td>
                          <td>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: "9999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              background: u.subscription?.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                              color: u.subscription?.status === "active" ? "#22c55e" : "#ef4444",
                            }}>
                              {u.subscription?.status || "active"}
                            </span>
                          </td>
                          <td style={{ color: "#22c55e", fontWeight: 700 }}>
                            ${PLAN_PRICES_MRR[u.subscription?.plan] || 0}/mo
                          </td>
                        </tr>
                      ))}
                      {payingUsers.length === 0 && (
                        <tr><td colSpan={5} className="admin-empty">No paying users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}

        {activeTab === "apiSpend" && (
          <>
            <h1 className="admin-page-title">API Spend Tracker</h1>
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <span className="admin-stat-label">Total API Calls</span>
                <span className="admin-stat-value">{apiSpend.totalCalls?.toLocaleString() || 0}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Total Tokens Used</span>
                <span className="admin-stat-value">{apiSpend.totalTokens?.toLocaleString() || 0}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Estimated Cost</span>
                <span className="admin-stat-value">${(apiSpend.estimatedCost || 0).toFixed(4)}</span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Avg Tokens / Call</span>
                <span className="admin-stat-value">
                  {apiSpend.totalCalls > 0 ? Math.round(apiSpend.totalTokens / apiSpend.totalCalls).toLocaleString() : 0}
                </span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Cost / 1K Tokens</span>
                <span className="admin-stat-value">
                  ${apiSpend.totalTokens > 0 ? ((apiSpend.estimatedCost / apiSpend.totalTokens) * 1000).toFixed(4) : "0.0000"}
                </span>
              </div>
              <div className="admin-stat-card">
                <span className="admin-stat-label">Model</span>
                <span className="admin-stat-value" style={{ fontSize: "1.2rem" }}>Together AI (Llama 3.3)</span>
              </div>
            </div>

            <div className="admin-section">
              <h2>Daily Usage (Last 7 Days)</h2>
              {apiSpend.dailyLog && apiSpend.dailyLog.length > 0 ? (
                <div className="admin-breakdown">
                  {apiSpend.dailyLog.slice(-7).map((day) => (
                    <div className="admin-breakdown-row" key={day.date}>
                      <span className="admin-breakdown-label">{day.date}</span>
                      <div className="admin-breakdown-bar">
                        <div
                          className="admin-breakdown-fill"
                          style={{
                            width: `${Math.min(100, (day.calls / Math.max(...apiSpend.dailyLog.map((d) => d.calls), 1)) * 100)}%`,
                          }}
                        ></div>
                      </div>
                      <span className="admin-breakdown-count">{day.calls}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-api-empty">
                  <p>No API usage data yet.</p>
                  <p className="admin-api-hint">
                    API usage is automatically tracked via Together AI calls.
                    Data is saved to Firestore at <code>admin/apiSpend</code>.
                  </p>
                </div>
              )}
            </div>

            <div className="admin-section">
              <h2>Pricing Reference (Together AI)</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Input (per 1M tokens)</th>
                      <th>Output (per 1M tokens)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Llama 3.3 70B Instruct Turbo</td>
                      <td>$0.88</td>
                      <td>$0.88</td>
                    </tr>
                    <tr>
                      <td>Llama 4 Maverick (Vision)</td>
                      <td>$0.27</td>
                      <td>$0.85</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "affiliates" && (() => {
          const pendingAffs = affiliates.filter((a) => a.status === "pending");
          const approvedAffs = affiliates.filter((a) => a.status === "approved");
          const rejectedAffs = affiliates.filter((a) => a.status === "rejected");
          const totalReferrals = affiliates.reduce((sum, a) => sum + (a.signups || 0), 0);
          const totalOwed = affiliates.reduce((sum, a) => sum + (a.balance || 0), 0);
          const totalPaid = affiliates.reduce((sum, a) => sum + (a.paidOut || 0), 0);

          const handleApprove = async (aff) => {
            if (!window.confirm(`Approve ${aff.name} as an affiliate?`)) return;
            const ref = doc(db, "affiliates", aff.id);
            await setDoc(ref, { status: "approved" }, { merge: true });
            fetchData();
          };

          const handleReject = async (aff) => {
            if (!window.confirm(`Reject ${aff.name}'s affiliate application?`)) return;
            const ref = doc(db, "affiliates", aff.id);
            await setDoc(ref, { status: "rejected" }, { merge: true });
            fetchData();
          };

          const handleSetRate = async (aff) => {
            const rate = prompt(`Set commission rate for ${aff.name} (40-60):`, aff.commissionRate || 40);
            if (!rate) return;
            const num = parseInt(rate, 10);
            if (isNaN(num) || num < 1 || num > 100) { alert("Invalid rate"); return; }
            const ref = doc(db, "affiliates", aff.id);
            await setDoc(ref, { commissionRate: num }, { merge: true });
            fetchData();
          };

          const handleMarkPaid = async (aff) => {
            if (!window.confirm(`Mark $${(aff.balance || 0).toFixed(2)} as paid to ${aff.name}?`)) return;
            const ref = doc(db, "affiliates", aff.id);
            await setDoc(ref, {
              paidOut: (aff.paidOut || 0) + (aff.balance || 0),
              balance: 0,
            }, { merge: true });
            fetchData();
          };

          const exportAffCSV = () => {
            const headers = ["Name", "Email", "Phone", "Social", "Status", "Code", "Rate%", "Referrals", "Earnings", "Balance", "Paid Out"];
            const rows = affiliates.map((a) => [
              a.name || "", a.email || "", a.phone || "", a.socialHandle || "",
              a.status || "pending", a.code || "", a.commissionRate || 40,
              a.signups || 0, (a.earnings || 0).toFixed(2),
              (a.balance || 0).toFixed(2), (a.paidOut || 0).toFixed(2),
            ]);
            const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const el = document.createElement("a");
            el.href = url;
            el.download = `wallie-affiliates-${new Date().toISOString().split("T")[0]}.csv`;
            el.click();
            URL.revokeObjectURL(url);
          };

          const copyLink = (link) => {
            navigator.clipboard.writeText(link);
            alert("Referral link copied!");
          };

          // Monthly plan prices for commission calculation
          const PLAN_PRICES = { basic: 9, pro: 29 };

          const recalcCommissions = async () => {
            if (!window.confirm("Recalculate all affiliate commissions based on current referred users with active paid plans?")) return;
            let updated = 0;
            for (const aff of approvedAffs) {
              const referredUsers = users.filter((u) => u.referralCode === aff.code);
              const paidUsers = referredUsers.filter((u) => {
                const sub = u.subscription;
                return sub && (sub.status === "active" || sub.plan === "basic" || sub.plan === "pro") && sub.plan !== "free";
              });
              const rate = (aff.commissionRate || 40) / 100;
              const monthlyEarnings = paidUsers.reduce((sum, u) => {
                const price = PLAN_PRICES[u.subscription?.plan] || 0;
                return sum + (price * rate);
              }, 0);
              // Update earnings and balance (balance = earnings - paidOut)
              const newEarnings = monthlyEarnings;
              const newBalance = Math.max(0, newEarnings - (aff.paidOut || 0));
              const ref = doc(db, "affiliates", aff.id);
              await setDoc(ref, {
                signups: referredUsers.length,
                earnings: newEarnings,
                balance: newBalance,
              }, { merge: true });
              updated++;
            }
            alert(`Updated commissions for ${updated} affiliates.`);
            fetchData();
          };

          return (
            <>
              <div className="admin-page-header">
                <h1 className="admin-page-title">Affiliates ({affiliates.length})</h1>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="admin-export-btn" onClick={recalcCommissions} style={{ background: "linear-gradient(90deg, #16a34a, #22c55e)" }}>
                    Recalculate Commissions
                  </button>
                  <button className="admin-export-btn" onClick={exportAffCSV}>Export CSV</button>
                </div>
              </div>

              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Pending Applications</span>
                  <span className="admin-stat-value" style={{ color: pendingAffs.length > 0 ? "#f59e0b" : undefined }}>{pendingAffs.length}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Approved Affiliates</span>
                  <span className="admin-stat-value">{approvedAffs.length}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total Referrals</span>
                  <span className="admin-stat-value">{totalReferrals}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Commissions Owed</span>
                  <span className="admin-stat-value" style={{ color: totalOwed > 0 ? "#22c55e" : undefined }}>${totalOwed.toFixed(2)}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Total Paid Out</span>
                  <span className="admin-stat-value">${totalPaid.toFixed(2)}</span>
                </div>
                <div className="admin-stat-card">
                  <span className="admin-stat-label">Rejected</span>
                  <span className="admin-stat-value">{rejectedAffs.length}</span>
                </div>
              </div>

              {/* Pending Applications */}
              {pendingAffs.length > 0 && (
                <div className="admin-section">
                  <h2 style={{ color: "#f59e0b" }}>Pending Applications ({pendingAffs.length})</h2>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Social</th>
                          <th>Applied</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingAffs.map((a) => (
                          <tr key={a.id}>
                            <td>{a.name || "—"}</td>
                            <td>{a.email || "—"}</td>
                            <td>{a.phone || "—"}</td>
                            <td>{a.socialHandle || "—"}</td>
                            <td>{a.createdAt?.toDate?.()?.toLocaleDateString() || "—"}</td>
                            <td>
                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                  className="admin-export-btn"
                                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem", background: "linear-gradient(90deg, #16a34a, #22c55e)" }}
                                  onClick={() => handleApprove(a)}
                                >
                                  Approve
                                </button>
                                <button
                                  className="admin-export-btn"
                                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem", background: "linear-gradient(90deg, #dc2626, #ef4444)" }}
                                  onClick={() => handleReject(a)}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Approved Affiliates */}
              <div className="admin-section">
                <h2>Approved Affiliates ({approvedAffs.length})</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Social</th>
                        <th>Code</th>
                        <th>Referral Link</th>
                        <th>Rate</th>
                        <th>Referrals</th>
                        <th>Earnings</th>
                        <th>Balance</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvedAffs.map((a) => (
                        <tr key={a.id}>
                          <td>{a.name || "—"}</td>
                          <td>{a.email || "—"}</td>
                          <td>{a.phone || "—"}</td>
                          <td>{a.socialHandle || "—"}</td>
                          <td><code style={{ color: "#4B93FF", fontSize: "0.8rem" }}>{a.code}</code></td>
                          <td>
                            <button
                              className="admin-export-btn"
                              style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                              onClick={() => copyLink(a.referralLink)}
                              title={a.referralLink}
                            >
                              Copy Link
                            </button>
                          </td>
                          <td>
                            <button
                              style={{ background: "none", border: "none", color: "#4B93FF", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem" }}
                              onClick={() => handleSetRate(a)}
                              title="Click to change"
                            >
                              {a.commissionRate || 40}%
                            </button>
                          </td>
                          <td>{a.signups || 0}</td>
                          <td>${(a.earnings || 0).toFixed(2)}</td>
                          <td style={{ color: (a.balance || 0) > 0 ? "#22c55e" : "inherit", fontWeight: 700 }}>
                            ${(a.balance || 0).toFixed(2)}
                          </td>
                          <td>
                            {(a.balance || 0) > 0 && (
                              <button
                                className="admin-export-btn"
                                style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
                                onClick={() => handleMarkPaid(a)}
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {approvedAffs.length === 0 && (
                        <tr><td colSpan={11} className="admin-empty">No approved affiliates yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Referred Users - show which users were referred by affiliates */}
              {approvedAffs.some((a) => (a.signups || 0) > 0) && (
                <div className="admin-section">
                  <h2>Referred Users</h2>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th>Referred By</th>
                          <th>Affiliate Code</th>
                          <th>Plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.filter((u) => u.referralCode).map((u) => {
                          const aff = affiliates.find((a) => a.code === u.referralCode);
                          return (
                            <tr key={u.id}>
                              <td>{u.name || "—"}</td>
                              <td>{u.email || "—"}</td>
                              <td>{aff?.name || "Unknown"}</td>
                              <td><code style={{ color: "#4B93FF", fontSize: "0.8rem" }}>{u.referralCode}</code></td>
                              <td>{u.subscription?.plan || "—"}</td>
                            </tr>
                          );
                        })}
                        {users.filter((u) => u.referralCode).length === 0 && (
                          <tr><td colSpan={5} className="admin-empty">No referred users yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </main>
    </div>
  );
};

export default AdminDashboard;

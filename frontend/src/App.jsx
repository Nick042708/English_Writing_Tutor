import React, { useEffect, useState } from "react";
import ProfileSelector from "./components/ProfileSelector.jsx";
import MaterialsPage from "./components/MaterialsPage.jsx";
import FeedbackPage from "./components/FeedbackPage.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import AdminUsersPage from "./components/AdminUsersPage.jsx";
import AccountModal from "./components/AccountModal.jsx";
import AuthPage from "./components/AuthPage.jsx";
import { Loading } from "./components/shared.jsx";
import { fetchHealth, get, post, setToken, getToken } from "./api.js";

const DEFAULT_PROFILE = { mode: "exam", target: "cet4", cefr: null, challenge: "match" };

const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }) : "";

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState("materials");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [task, setTask] = useState("");
  const [health, setHealth] = useState(null);
  const [showAccount, setShowAccount] = useState(false);

  const refreshMe = () =>
    get("/api/me")
      .then((d) => setUser(d.user))
      .catch(() => {});

  useEffect(() => {
    fetchHealth().then(setHealth);
    if (getToken()) {
      get("/api/me")
        .then((d) => setUser(d.user))
        .catch(() => setToken(null))
        .finally(() => setBooting(false));
    } else {
      setBooting(false);
    }
  }, []);

  const logout = async () => {
    try {
      await post("/api/logout");
    } catch {
      /* 忽略 */
    }
    setToken(null);
    setUser(null);
    setTab("materials");
  };

  if (booting) {
    return (
      <div className="app" style={{ paddingTop: 80 }}>
        <Loading text="加载中…" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={setUser} />;
  }

  const isMember = user.plan === "member" || user.role === "admin";

  // 画像与任务在两个模块之间共享，切换 Tab 不丢内容
  return (
    <div className="app">
      <header className="header" style={{ alignItems: "center" }}>
        <div>
          <h1>English Writing Tutor</h1>
          <span className="sub">英语写作助教 · 按你的水平和目标定制素材与批改</span>
        </div>
        <div className="user-chip">
          {user.role !== "admin" && (
            <span className={`plan-badge ${isMember ? "member" : "guest"}`} title={isMember ? `会员有效期至 ${fmtDate(user.memberUntil)}` : "每天 5 次免费额度"}>
              {isMember ? `会员 · 至 ${fmtDate(user.memberUntil)}` : `游客 ${user.usedToday}/${user.dailyLimit}`}
            </span>
          )}
          <button className="link-btn username" onClick={() => setShowAccount(true)} title="账号设置">
            {user.username}
          </button>
          <span className={`role-badge ${user.role}`}>{user.role === "admin" ? "管理员" : "学员"}</span>
          <button className="btn-ghost" onClick={logout}>退出</button>
        </div>
      </header>

      {health && !health.ok && (
        <div className="banner">后端服务未启动：请先在 backend 目录运行 npm start，刷新页面即可</div>
      )}
      {health?.demoMode && (
        <div className="banner">
          演示模式：当前使用预置示例数据。在 backend/.env 中配置 DEEPSEEK_API_KEY 并重启后端，即可体验真实 AI 生成。
        </div>
      )}

      <nav className="tabs">
        <button className={`tab ${tab === "materials" ? "active" : ""}`} onClick={() => setTab("materials")}>
          素材提供
        </button>
        <button className={`tab ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")}>
          写作批改
        </button>
        <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          历史记录
        </button>
        {user.role === "admin" && (
          <>
            <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>
              全部学员记录
            </button>
            <button className={`tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>
              账号管理
            </button>
          </>
        )}
      </nav>

      {tab !== "users" && tab !== "admin" && <ProfileSelector profile={profile} onChange={setProfile} />}

      {tab === "materials" && <MaterialsPage profile={profile} task={task} setTask={setTask} onUsed={refreshMe} />}
      {tab === "feedback" && <FeedbackPage profile={profile} task={task} setTask={setTask} onUsed={refreshMe} />}
      {tab === "history" && <HistoryPage scope="mine" />}
      {tab === "admin" && user.role === "admin" && <HistoryPage scope="all" />}
      {tab === "users" && user.role === "admin" && <AdminUsersPage />}

      {showAccount && (
        <AccountModal user={user} onUpdate={setUser} onClose={() => setShowAccount(false)} />
      )}

      <footer style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, marginTop: 30 }}>
        English Writing Tutor · 基于 DeepSeek 的 AI 写作助教 · 演示项目
      </footer>
    </div>
  );
}

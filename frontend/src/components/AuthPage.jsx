import React, { useState } from "react";
import { post, setToken } from "../api.js";

// 登录 / 注册页：第一个注册的用户自动成为管理员
export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await post(mode === "login" ? "/api/login" : "/api/register", { username, password });
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">English Writing Tutor</h1>
        <p className="auth-sub">英语写作助教 · 登录后可保存并回看你的素材与批改报告</p>

        <div className="field-label">用户名</div>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="2-20 个字符"
          autoComplete="username"
        />
        <div className="field-label">密码</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 6 位"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

        <button className="btn" style={{ width: "100%" }} disabled={loading}>
          {loading ? "请稍候…" : mode === "login" ? "登录" : "注册"}
        </button>

        <div style={{ marginTop: 14, fontSize: 13, textAlign: "center" }}>
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <button type="button" className="link-btn" onClick={() => { setMode("register"); setError(""); }}>
                注册一个
              </button>
            </>
          ) : (
            <>
              已有账号？{" "}
              <button type="button" className="link-btn" onClick={() => { setMode("login"); setError(""); }}>
                直接登录
              </button>
            </>
          )}
        </div>
        <div className="auth-hint">
          提示：第一个注册的账号将自动成为管理员，可查看所有学员的素材与批改记录
        </div>
      </form>
    </div>
  );
}

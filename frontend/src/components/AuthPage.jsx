import React, { useState } from "react";
import { post, setToken } from "../api.js";

// 登录 / 注册页：第一个注册的用户自动成为管理员
export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [realName, setRealName] = useState("");
  const [school, setSchool] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await post(mode === "login" ? "/api/login" : "/api/register", {
        username,
        password,
        realName,
        school,
      });
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

        {mode === "register" && (
          <>
            <div className="field-label">真实姓名</div>
            <input
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="用于管理员核对身份"
            />
            <div className="field-label">学校</div>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="如：XX中学 / XX大学"
            />
          </>
        )}

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
        {mode === "register" && (
          <div className="auth-hint">注册后默认为游客账号（每天 5 次），联系管理员可升级为会员不限次数</div>
        )}
        {mode === "login" && (
          <div className="auth-hint">
            提示：第一个注册的账号将自动成为管理员，可查看所有学员的素材与批改记录
          </div>
        )}
      </form>
    </div>
  );
}

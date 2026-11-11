import React, { useState } from "react";
import { updateProfile } from "../api.js";

const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "";

// 账号设置弹窗：查看/修改真实姓名与学校，显示会员状态与今日用量
export default function AccountModal({ user, onUpdate, onClose }) {
  const [realName, setRealName] = useState(user.realName || "");
  const [school, setSchool] = useState(user.school || "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isMember = user.plan === "member" || user.role === "admin";

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const data = await updateProfile({ realName, school });
      onUpdate(data.user);
      setMsg("已保存");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>账号设置</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>

        <div className="account-summary">
          <div className="sum-row"><span>用户名</span><b>{user.username}</b></div>
          <div className="sum-row">
            <span>账号类型</span>
            <b>
              {user.role === "admin"
                ? "管理员（不限次数）"
                : isMember
                  ? `会员 · ${user.memberUntil ? `有效期至 ${fmtDate(user.memberUntil)}` : "永久"}`
                  : "游客"}
            </b>
          </div>
          {!isMember && (
            <div className="sum-row">
              <span>今日用量</span>
              <b>{user.usedToday} / {user.dailyLimit} 次</b>
            </div>
          )}
        </div>

        <div className="field-label">真实姓名</div>
        <input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="用于管理员核对身份" />
        <div className="field-label">学校</div>
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="如：XX中学 / XX大学" />

        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
        {msg && <div className="ok-box" style={{ marginTop: 10 }}>{msg}</div>}

        <button className="btn" style={{ marginTop: 14, width: "100%" }} onClick={save} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

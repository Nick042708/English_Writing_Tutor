import React, { useEffect, useState } from "react";
import { fetchAllUsers, setMembership, revokeMembership, deleteUser } from "../api.js";

const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }) : "";

const DURATION_OPTIONS = [
  { label: "1 周", months: 0.25 },
  { label: "1 个月", months: 1 },
  { label: "3 个月", months: 3 },
  { label: "6 个月", months: 6 },
  { label: "12 个月", months: 12 },
];

// 管理员：账号目录（查看所有账号 + 开通/续费/取消会员 + 删除用户）
export default function AdminUsersPage() {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    fetchAllUsers()
      .then((d) => setUsers(d.users))
      .catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  const act = async (fn, okText) => {
    setError("");
    setMsg("");
    try {
      await fn();
      await load();
      setMsg(okText);
    } catch (err) {
      setError(err.message);
    }
  };

  const grant = (u, months) =>
    act(() => setMembership(u.id, months), `已为 ${u.username} 开通/续费会员`);
  const revoke = (u) =>
    act(() => revokeMembership(u.id), `已将 ${u.username} 恢复为游客`);
  const remove = (u) => {
    if (!window.confirm(`确定删除账号「${u.username}（${u.realName || "未填姓名"}）」？\n该用户的所有记录也会一并删除，此操作不可恢复。`)) return;
    act(() => deleteUser(u.id), `已删除 ${u.username}`);
  };

  if (error && !users) return <div className="error-box">{error}</div>;
  if (!users) return <div className="card">加载中…</div>;

  return (
    <>
      <div className="card">
        <h2>账号目录</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          共 {users.length} 个账号 · 点击“开通”给游客升级会员，已是会员可续费（从到期日叠加）或取消
        </p>
        {msg && <div className="ok-box">{msg}</div>}
        {error && <div className="error-box">{error}</div>}

        <div className="table-wrap">
          <table className="user-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>姓名</th>
                <th>学校</th>
                <th>类型</th>
                <th>今日用量</th>
                <th>记录数</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="en">{u.username}</td>
                  <td>{u.realName || <span className="muted">未填写</span>}</td>
                  <td>{u.school || <span className="muted">未填写</span>}</td>
                  <td>
                    {u.role === "admin" ? (
                      <span className={`role-badge admin`}>管理员</span>
                    ) : u.plan === "member" ? (
                      <span className="plan-badge member" title={`有效期至 ${fmtDate(u.memberUntil)}`}>
                        会员 · 至 {fmtDate(u.memberUntil)}
                      </span>
                    ) : (
                      <span className="plan-badge guest">游客</span>
                    )}
                  </td>
                  <td>{u.role === "admin" ? "—" : `${u.usedToday}/5`}</td>
                  <td>{u.recordCount}</td>
                  <td className="muted">{fmtDate(u.createdAt)}</td>
                  <td>
                    {u.role === "admin" ? (
                      <span className="muted">—</span>
                    ) : (
                      <div className="row-actions">
                        <select
                          defaultValue="1"
                          onChange={(e) => {
                            const months = Number(e.target.value);
                            if (months) grant(u, months);
                            e.target.value = "1";
                          }}
                        >
                          {DURATION_OPTIONS.map((o) => (
                            <option key={o.months} value={o.months}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost" onClick={() => grant(u, 1)}>开通</button>
                        {u.plan === "member" && (
                          <button className="btn-ghost" onClick={() => revoke(u)}>取消会员</button>
                        )}
                        <button className="btn-ghost danger" onClick={() => remove(u)}>删除</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

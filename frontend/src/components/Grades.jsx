import React, { useEffect, useState } from "react";
import { get } from "../api.js";
import { Loading } from "./shared.jsx";

// 课程成绩统计（管理员）：作业作文成绩（复核分优先，AI 分兜底）+ 阅读练习成绩 → 汇总排名
// 支持导出 CSV（Excel 可直接打开）
export default function GradesSection({ courseId, courseName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    get(`/api/courses/${courseId}/grades`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [courseId]);

  const exportCsv = () => {
    if (!data) return;
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["学员", "用户名", "学校", ...data.columns.map((c) => `${c.title}（${c.kind === "essay" ? "作文" : "练习"}）`), "总分"];
    const lines = [head.map(esc).join(",")];
    for (const r of data.rows) {
      const cells = data.columns.map((c) => {
        const item = r.items.find((i) => i.refId === c.refId);
        if (!item) return "";
        if (item.status === "unsubmitted") return "未提交";
        if (item.status === "pending-review") return "待批改";
        return item.score ?? "";
      });
      lines.push([r.realName, r.username, r.school, ...cells, r.total].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${courseName || "课程"}成绩表.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <Loading text="统计成绩中…" />;

  const hasContent = data.columns.length > 0 && data.rows.length > 0;
  const syl = data.syllabus;
  const kindLabel = { assignment: "作业", lesson: "在线学习", exam: "考试" };

  return (
    <div className="card">
      <h2><span className="dot" />课程成绩统计</h2>
      {!hasContent ? (
        <p className="empty-hint">还没有可统计的成绩——发布作业或阅读练习，等学生提交后这里会自动汇总。</p>
      ) : (
        <>
          <div className="row-actions" style={{ marginBottom: 8 }}>
            <button className="btn-ghost" onClick={exportCsv}>导出 CSV 成绩表</button>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              共 {data.rows.length} 名学员 · {data.columns.length} 项成绩 · 作文取历次最高分（复核分优先），练习以最后一次作答为准
              {syl ? " · 加权总评按 Syllabus 计算" : " · 加权总评按默认比例（作业40/在线学习30）折算"}
            </span>
          </div>
          <div className="table-wrap">
            <table className="user-table grade-table">
              <thead>
                <tr>
                  <th>学员</th>
                  {data.columns.map((c) => (
                    <th key={c.refId} title={c.title}>
                      {c.kind === "essay" ? "作文·" : "练习·"}
                      {c.title.length > 10 ? c.title.slice(0, 10) + "…" : c.title}
                    </th>
                  ))}
                  <th>加权总评</th>
                  <th>原始总分</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <b>{r.realName || r.username}</b>
                      {r.realName && <span style={{ color: "var(--ink-3)", fontSize: 12 }}> {r.username}</span>}
                    </td>
                    {data.columns.map((c) => {
                      const item = r.items.find((i) => i.refId === c.refId);
                      return (
                        <td key={c.refId}>
                          {item?.status === "unsubmitted" ? (
                            <span className="course-meta">未提交</span>
                          ) : item?.status === "pending-review" ? (
                            <span className="plan-badge guest">待批改</span>
                          ) : item?.score != null ? (
                            <b>
                              {item.score}{item.max != null && `/${item.max}`}
                              {item.attempts > 1 && <span style={{ color: "var(--ink-3)", fontSize: 11 }}> ×{item.attempts}次</span>}
                              {item.late && <span style={{ color: "#b3372a", fontSize: 11 }}> 补交</span>}
                            </b>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td>
                      {r.weighted ? (
                        <b title={r.weighted.parts.map((p) => `${kindLabel[p.kind]} ${p.score}分×${p.weight}%`).join("，")}>
                          {r.weighted.total} 分
                        </b>
                      ) : (
                        <span className="course-meta">—</span>
                      )}
                    </td>
                    <td><span className="course-meta">{r.total}{r.maxTotal > 0 && `/${r.maxTotal}`}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="empty-hint" style={{ marginTop: 8 }}>
            加权总评 = 各类别得分率按占比加权（未提交按 0 计）；考试未发布前自动在剩余类别间归一化。得分率口径：
            {syl ? `作文按满分 ${syl.essayFullMark} 折算` : "作文按满分 100 折算"}
            ，练习按题目满分折算。悬停「加权总评」可查看各类别明细。
          </p>
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { get } from "../api.js";
import { Loading } from "./shared.jsx";
import MaterialsResult from "./MaterialsResult.jsx";
import FeedbackResult from "./FeedbackResult.jsx";

const fmtDate = (ts) => new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 历史记录页：scope = "mine" 看自己的记录；scope = "all" 管理员看全部学员记录
export default function HistoryPage({ scope }) {
  const [records, setRecords] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(() => {
    const path = scope === "all" ? "/api/admin/records" : "/api/records";
    get(path)
      .then((d) => setRecords(d.records || []))
      .catch((e) => setError(e.message));
  }, [scope]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openRecord = async (id) => {
    setLoadingDetail(true);
    setError("");
    try {
      const d = await get(`/api/records/${id}`);
      setDetail(d.record);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (detail) {
    const r = detail;
    return (
      <>
        <div className="card record-detail-head">
          <button className="btn-ghost" onClick={() => setDetail(null)}>← 返回列表</button>
          <div className="rec-sub" style={{ marginTop: 10 }}>
            {scope === "all" && <>学员：{r.username} · </>}
            {r.type === "materials" ? "素材生成" : "写作批改"} · {fmtDate(r.createdAt)} · 目标：{r.profile?.target}
            {r.profile?.challenge ? ` · ${r.profile.challenge === "match" ? "匹配水平" : r.profile.challenge === "stretch" ? "拔高挑战" : "冲刺高分"}` : ""}
          </div>
          <div className="rec-task-full">{r.task}</div>
          {r.type === "feedback" && r.essay && (
            <details className="essay-collapse">
              <summary>查看当时的作文原文</summary>
              <div className="en-text">{r.essay}</div>
            </details>
          )}
        </div>
        {r.type === "materials" ? (
          <MaterialsResult result={r.result} profile={r.profile} task={r.task} />
        ) : (
          <FeedbackResult result={r.result} profile={r.profile} task={r.task} essay={r.essay} />
        )}
      </>
    );
  }

  // 按修订链合并：同一份作业的多次批改合并为一组（其他记录独立展示）
  const groups = React.useMemo(() => {
    if (!records) return [];
    const out = [];
    const chainMap = new Map(); // assignmentId -> { chain records（按次数升序） }
    for (const r of records) {
      if (r.assignmentId) {
        if (!chainMap.has(r.assignmentId)) {
          chainMap.set(r.assignmentId, { key: `asg-${r.assignmentId}`, assignmentId: r.assignmentId, records: [] });
          out.push(chainMap.get(r.assignmentId));
        }
        chainMap.get(r.assignmentId).records.push(r);
      } else {
        out.push({ key: r.id, record: r });
      }
    }
    // 组内按次数升序（第 1 次在前）
    for (const g of out) if (g.records) g.records.sort((a, b) => (a.attempt || 1) - (b.attempt || 1));
    return out;
  }, [records]);

  const renderRow = (r) => (
    <div className="rec-row" key={r.id}>
      <span className={`rec-type ${r.type}`}>{r.type === "materials" ? "素材" : "批改"}</span>
      <div className="rec-main">
        <div className="rec-task">
          {r.assignmentId && `（第 ${r.attempt || "?"} 次批改）`}{r.task}
        </div>
        <div className="rec-sub">
          {scope === "all" && <>{r.username} · </>}
          {fmtDate(r.createdAt)} · {r.profile?.target}
          {r.profile?.challenge ? ` · ${r.profile.challenge === "match" ? "匹配" : r.profile.challenge === "stretch" ? "拔高" : "冲刺"}` : ""}
        </div>
      </div>
      <button className="btn-ghost" onClick={() => openRecord(r.id)}>
        查看
      </button>
    </div>
  );

  return (
    <div className="card">
      <h2>
        <span className="dot" />
        {scope === "all" ? "全部学员记录" : "我的历史记录"}
      </h2>
      {error && <div className="error-box">{error}</div>}
      {!records && !error && <Loading text="加载中…" />}
      {records && records.length === 0 && (
        <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {scope === "all" ? "还没有学员生成过记录" : "还没有记录——去生成一次素材或批改一篇作文吧"}
        </span>
      )}
      {records &&
        groups.map((g) =>
          g.record ? (
            renderRow(g.record)
          ) : (
            <details key={g.key} className="essay-collapse" style={{ borderBottom: "1px solid var(--line, #eee)" }}>
              <summary>
                📝 {g.records[0].task.slice(0, 24) || "课程作业"}… · {g.records.length} 次批改记录（点击展开）
              </summary>
              {g.records.map(renderRow)}
            </details>
          )
        )}
      {loadingDetail && <Loading text="正在打开报告…" />}
    </div>
  );
}

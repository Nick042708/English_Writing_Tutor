import React, { useEffect, useState } from "react";
import { fetchFeedback, get, post } from "../api.js";
import { Loading } from "./shared.jsx";
import FeedbackResult from "./FeedbackResult.jsx";
import { EXAMS, PRACTICAL } from "../examOptions.js";

// 写作批改页：自由练习 + 作业提交两种模式
// 作业模式下任务/类型/难度由老师锁定，提交后不可重交，AI 批改结果同时进入老师复核队列
export default function FeedbackPage({ profile, task, setTask, onUsed }) {
  const [essay, setEssay] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 作业模式
  const [asgMode, setAsgMode] = useState(false);
  const [assignments, setAssignments] = useState(null);
  const [selectedId, setSelectedId] = useState("");

  const loadAssignments = () =>
    get("/api/assignments/available")
      .then((d) => setAssignments(d.assignments))
      .catch(() => setAssignments([]));

  useEffect(() => {
    if (asgMode && assignments === null) loadAssignments();
  }, [asgMode, assignments]);

  const selected = assignments?.find((a) => a.assignmentId === selectedId);
  const unsubmitted = assignments?.filter((a) => !a.submitted) || [];

  const switchAsgMode = (on) => {
    setAsgMode(on);
    setResult(null);
    setError("");
    if (!on) setTask("");
  };

  const pickAssignment = (id) => {
    setSelectedId(id);
    const a = assignments.find((x) => x.assignmentId === id);
    if (a) setTask(a.task); // 任务自动填入（输入框锁定）
    setResult(null);
  };

  const submit = async () => {
    if (essay.trim().length < 30) {
      setError("作文内容太短，请至少写 30 个字符");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (asgMode) {
        if (!selected) {
          setError("请先选择要提交的作业");
          setLoading(false);
          return;
        }
        // 作业提交：类型/难度/任务由老师锁定，一次提交后不可修改
        const r = await post(`/api/assignments/${selected.assignmentId}/submit`, { essay: essay.trim() });
        setResult(r);
        loadAssignments();
      } else {
        if (!task.trim()) {
          setError("请先填写写作任务（题目原文或主题描述）");
          setLoading(false);
          return;
        }
        setResult(await fetchFeedback({ ...profile, task: task.trim(), essay: essay.trim() }));
      }
      onUsed?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const asgLabel = (a) =>
    `${a.courseName} · ${a.title}（${a.mode === "practical" ? PRACTICAL.find((p) => p.id === a.target)?.label || a.target : EXAMS.find((e) => e.id === a.target)?.label || a.target}）`;

  return (
    <>
      <div className="card">
        <h2><span className="dot" />写作批改</h2>
        <div className="row-actions" style={{ marginBottom: 10 }}>
          <label className="row-actions" style={{ cursor: "pointer", gap: 6 }}>
            <input type="checkbox" checked={asgMode} onChange={(e) => switchAsgMode(e.target.checked)} />
            <b>作业提交模式</b>
          </label>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            勾选后可提交老师布置的课程作业（类型与难度按老师设置锁定）
          </span>
        </div>

        {asgMode && (
          <>
            {!assignments ? (
              <Loading text="加载作业列表…" />
            ) : unsubmitted.length === 0 ? (
              <p className="empty-hint">目前没有待提交的作业（可能全部已提交，或你还未被拉入任何课程）。</p>
            ) : (
              <>
                <div className="field-label">选择要提交的作业</div>
                <select value={selectedId} onChange={(e) => pickAssignment(e.target.value)}>
                  <option value="">— 选择作业 —</option>
                  {unsubmitted.map((a) => (
                    <option key={a.assignmentId} value={a.assignmentId}>{asgLabel(a)}</option>
                  ))}
                </select>
              </>
            )}
            {assignments?.some((a) => a.submitted) && (
              <p className="ok-box" style={{ marginTop: 8 }}>
                已提交的作业：{assignments.filter((a) => a.submitted).map((a) => a.title).join("、")}（提交后不可修改，复核结果可在课程页查看）
              </p>
            )}
          </>
        )}

        <div className="field-label">写作任务</div>
        <textarea
          value={asgMode ? selected?.task || "" : task}
          onChange={(e) => !asgMode && setTask(e.target.value)}
          disabled={asgMode}
          placeholder="粘贴题目原文或描述任务要求，批改会据此判断你是否完成了写作目标"
        />
        {asgMode && selected && (
          <div style={{ fontSize: 12, color: "var(--brand-ink)", marginTop: 4 }}>
            作业模式下任务与难度已由老师锁定，请直接输入作文提交。
          </div>
        )}

        <div className="field-label">你的作文</div>
        <textarea
          className="essay"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder="在这里粘贴或输入你的完整作文……"
        />
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
          当前字数：{essay.trim().length}
        </div>
        <button className="btn" onClick={submit} disabled={loading}>
          {loading ? (asgMode ? "正在批改并提交…" : "正在批改…") : asgMode ? "提交作业" : "提交批改"}
        </button>
        {result && !loading && result.demo && <span className="demo-tag">演示数据</span>}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && (
        <div className="card">
          <Loading text={asgMode ? "正在批改并提交给老师，大约需要 30-60 秒…" : "正在逐句分析你的作文，内容较多，大约需要 30-60 秒…"} />
        </div>
      )}

      {result && !loading && (
        <FeedbackResult
          result={result}
          profile={asgMode && selected ? { mode: selected.mode, target: selected.target, cefr: selected.cefr, challenge: selected.challenge } : profile}
          task={asgMode ? selected?.task || "" : task.trim()}
          essay={essay.trim()}
        />
      )}
    </>
  );
}

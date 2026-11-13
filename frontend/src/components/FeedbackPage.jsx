import React, { useEffect, useState } from "react";
import { fetchFeedback, get, post } from "../api.js";
import { Loading } from "./shared.jsx";
import FeedbackResult from "./FeedbackResult.jsx";
import { EXAMS, PRACTICAL } from "../examOptions.js";

// 英文词数：按空白切分（与后端校验口径一致）
const countWords = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

// 写作批改页：自由练习 + 作业提交两种模式
// 作业模式下任务/类型/难度由老师锁定；按老师设置的次数可多次提交，
// 修改重交时会参考上一次的作文与批改（AI 对比评估进步）
export default function FeedbackPage({ profile, task, setTask, onUsed }) {
  const [essay, setEssay] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 作业模式
  const [asgMode, setAsgMode] = useState(false);
  const [assignments, setAssignments] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [revisionHint, setRevisionHint] = useState(""); // 修改重交提示

  const loadAssignments = () =>
    get("/api/assignments/available")
      .then((d) => setAssignments(d.assignments))
      .catch(() => setAssignments([]));

  useEffect(() => {
    if (asgMode && assignments === null) loadAssignments();
  }, [asgMode, assignments]);

  const selected = assignments?.find((a) => a.assignmentId === selectedId);
  const submittable = assignments?.filter((a) => a.canSubmit) || [];

  const switchAsgMode = (on) => {
    setAsgMode(on);
    setResult(null);
    setError("");
    setRevisionHint("");
    if (!on) setTask("");
  };

  const pickAssignment = async (id) => {
    setSelectedId(id);
    setResult(null);
    setError("");
    setRevisionHint("");
    const a = assignments.find((x) => x.assignmentId === id);
    if (!a) return;
    setTask(a.task); // 任务自动填入（输入框锁定）
    // 重交：自动载入上一版作文，方便在此基础上修改
    if (a.attempts > 0 && a.latestSubmissionId) {
      try {
        const d = await get(`/api/my/submissions/${id}`);
        const latest = d.submissions?.[0];
        if (latest?.essay) {
          setEssay(latest.essay);
          const limitText = a.maxAttempts ? `第 ${a.attempts + 1}/${a.maxAttempts} 次` : `第 ${a.attempts + 1} 次（不限次数）`;
          setRevisionHint(
            `已载入你的上一版作文（第 ${latest.attempt || a.attempts} 次提交），可直接修改后再次提交。AI 会对照上次批改，点评你的进步。`
          );
        }
      } catch {
        /* 载入失败则保持空作文 */
      }
    } else {
      setEssay("");
    }
  };

  const submit = async () => {
    const wc = countWords(essay);
    if (essay.trim().length < 30) {
      setError("作文内容太短，请至少写 30 个字符");
      return;
    }
    // 作业词数要求（老师布置时设定）
    if (asgMode && selected) {
      if (selected.minWords && wc < selected.minWords) {
        setError(`词数不足：当前 ${wc} 词，作业要求至少 ${selected.minWords} 词`);
        return;
      }
      if (selected.maxWords && wc > selected.maxWords) {
        setError(`词数超出：当前 ${wc} 词，作业要求不超过 ${selected.maxWords} 词`);
        return;
      }
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

  // 作业下拉项标签：首次提交 / 修改重交 / 截止时间
  const asgOptionLabel = (a) => {
    let base = asgLabel(a);
    if (a.deadline) {
      const t = new Date(a.deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      base += a.overdue ? ` · 已截止${t}(可补交)` : ` · 截止 ${t}`;
    }
    if (a.attempts === 0) return base;
    const times = a.maxAttempts ? `第 ${a.attempts + 1}/${a.maxAttempts} 次` : `第 ${a.attempts + 1} 次 · 不限`;
    return `${base} · 修改重交（${times}）`;
  };

  const wc = countWords(essay);
  const outOfRange =
    asgMode && !!selected &&
    ((selected.minWords && wc < selected.minWords) || (selected.maxWords && wc > selected.maxWords));
  const wordColor = outOfRange ? "#b3372a" : "var(--ink-3)";

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
            勾选后可提交老师布置的课程作业（次数限制由老师设置，修改重交会参考上次批改）
          </span>
        </div>

        {asgMode && (
          <>
            {!assignments ? (
              <Loading text="加载作业列表…" />
            ) : submittable.length === 0 ? (
              <p className="empty-hint">目前没有可提交的作业（可能次数已用完，或你还未被拉入任何课程）。</p>
            ) : (
              <>
                <div className="field-label">选择要提交的作业</div>
                <select value={selectedId} onChange={(e) => pickAssignment(e.target.value)}>
                  <option value="">— 选择作业 —</option>
                  {submittable.map((a) => (
                    <option key={a.assignmentId} value={a.assignmentId}>{asgOptionLabel(a)}</option>
                  ))}
                </select>
              </>
            )}
            {assignments?.some((a) => a.submitted) && (
              <p className="ok-box" style={{ marginTop: 8 }}>
                已提交 {assignments.filter((a) => a.submitted).map((a) => a.attempts > 0 ? `${a.title}×${a.attempts}` : a.title).join("、")}
                ；还有剩余次数的作业可在上方选择「修改重交」，成绩取历次最高分。
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
            {revisionHint || "作业模式下任务与难度已由老师锁定，请直接输入作文提交。"}
          </div>
        )}

        <div className="field-label">你的作文</div>
        <textarea
          className="essay"
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          placeholder="在这里粘贴或输入你的完整作文……"
        />
        <div style={{ fontSize: 12, marginTop: 6, color: wordColor }}>
          当前 {countWords(essay)} 词
          {asgMode && selected && (selected.minWords || selected.maxWords)
            ? `（作业要求 ${selected.minWords || "?"}—${selected.maxWords || "不限"} 词）`
            : ""}
          {asgMode && selected && (selected.minWords || selected.maxWords) && outOfRange ? " · 不满足要求，无法提交" : ""}
        </div>
        {asgMode && selected?.overdue && (
          <div className="ok-box" style={{ marginTop: 6, fontSize: 12 }}>
            该作业已过截止时间（课程允许补交）。本次提交会被标记为「补交」，是否扣分由老师复核决定。
          </div>
        )}
        <button className="btn" onClick={submit} disabled={loading || (asgMode && !!selected && outOfRange)}>
          {loading
            ? asgMode
              ? selected?.attempts > 0
                ? "正在对比批改并提交…"
                : "正在批改并提交…"
              : "正在批改…"
            : asgMode
              ? selected?.attempts > 0
                ? "提交修改版"
                : "提交作业"
              : "提交批改"}
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

      {asgMode && result && !loading && (
        <div className="card">
          <div className="ok-box">
            {result.attempt
              ? `本次是第 ${result.attempt}${result.maxAttempts ? `/${result.maxAttempts}` : ""} 次提交。`
              : "提交成功。"}
            {result.attemptsLeft == null
              ? "该作业不限提交次数，欢迎继续修改打磨。"
              : result.attemptsLeft > 0
                ? `还可提交 ${result.attemptsLeft} 次——根据上面的建议修改后，回到上方重新选择这份作业即可重交。`
                : "提交次数已用完，等待老师复核。"}
          </div>
        </div>
      )}
    </>
  );
}

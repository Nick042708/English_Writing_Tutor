import React, { useState } from "react";
import { fetchFeedback } from "../api.js";
import { Loading } from "./shared.jsx";
import FeedbackResult from "./FeedbackResult.jsx";

// 写作批改页：填写任务与作文 → 批改 → 复用 FeedbackResult 展示（历史回看也用它）
export default function FeedbackPage({ profile, task, setTask, onUsed }) {
  const [essay, setEssay] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!task.trim()) {
      setError("请先填写写作任务（题目原文或主题描述）");
      return;
    }
    if (essay.trim().length < 30) {
      setError("作文内容太短，请至少写 30 个字符");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResult(await fetchFeedback({ ...profile, task: task.trim(), essay: essay.trim() }));
      onUsed?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2><span className="dot" />写作任务</h2>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="粘贴题目原文或描述任务要求，批改会据此判断你是否完成了写作目标"
        />
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
          {loading ? "正在批改…" : "提交批改"}
        </button>
        {result && !loading && result.demo && <span className="demo-tag">演示数据</span>}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && (
        <div className="card">
          <Loading text="正在逐句分析你的作文，内容较多，大约需要 30-60 秒…" />
        </div>
      )}

      {result && !loading && (
        <FeedbackResult result={result} profile={profile} task={task.trim()} essay={essay.trim()} />
      )}
    </>
  );
}

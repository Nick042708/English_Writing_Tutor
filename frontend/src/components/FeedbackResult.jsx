import React, { useState } from "react";
import { CopyButton } from "./shared.jsx";
import PrintPortal from "./PrintPortal.jsx";
import { FeedbackReport } from "./reports.jsx";
import { CHALLENGES } from "../examOptions.js";
import { sanitizeFeedbackResult } from "../sanitize.js";

const STATUS_LABEL = { good: "良好", warn: "一般", bad: "待提升" };

// 批改结果展示（五段式 + 导出）：批改页与历史记录回看共用
export default function FeedbackResult({ result, profile, task, essay }) {
  const [printContent, setPrintContent] = useState(null);
  const challengeLabel = CHALLENGES.find((c) => c.id === profile?.challenge)?.label || "匹配我的水平";
  // 深度净化：AI 返回形状偶发不符（历史记录里存的原始数据也会经过这里），先归一化再渲染
  result = sanitizeFeedbackResult(result);

  return (
    <>
      {result.notice && <div className="banner">{result.notice}</div>}

      <div className="card overall-card">
        <h2><span className="dot" />总评</h2>
        <p style={{ marginTop: 0, fontSize: 14, color: "var(--ink-2)" }}>{result.overall}</p>
        {result.score && (
          <div style={{ marginTop: 10 }}>
            <span className="score-pill">{result.score.label}</span>
            <span className="score-note">{result.score.comment}</span>
          </div>
        )}
        {result.progress && (
          <div className="ok-box" style={{ marginTop: 12 }}>
            <b>📈 与上一版相比：</b>
            {result.progress}
          </div>
        )}
      </div>

      <div className="card">
        <h2><span className="dot" />分维度点评</h2>
        <div className="dim-grid">
          {(result.dimensions || []).map((d, i) => (
            <div className="dim-card" key={i}>
              <b>
                <span className={`status ${d.status}`} />
                {d.name}
                <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>
                  {STATUS_LABEL[d.status] || ""}
                </span>
              </b>
              <p>{d.comment}</p>
            </div>
          ))}
        </div>
      </div>

      {result.bonus?.length > 0 && (
        <div className="card">
          <h2><span className="dot" />加分项</h2>
          <ul className="bonus-list">
            {result.bonus.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {result.annotations?.length > 0 && (
        <div className="card">
          <h2><span className="dot" />逐句批注</h2>
          {result.annotations.map((a, i) => (
            <div className="annotation" key={i}>
              <div className="quote">“{a.quote}”</div>
              <div className="meta">
                <span className="type-tag">{a.type}</span>
                <CopyButton text={a.suggestion || ""} />
              </div>
              <div className="comment">{a.comment}</div>
              {a.suggestion && <div className="suggestion">{a.suggestion}</div>}
            </div>
          ))}
        </div>
      )}

      {result.upgrades?.length > 0 && (
        <div className="card">
          <h2><span className="dot" />句子升级对比</h2>
          {result.upgrades.map((u, i) => (
            <div className="upgrade-card" key={i}>
              <div className="row before">{u.original}</div>
              <div className="row after">{u.improved}</div>
              <div className="note-row">{u.note}</div>
            </div>
          ))}
        </div>
      )}

      {result.actionPlan?.length > 0 && (
        <div className="card">
          <h2><span className="dot" />接下来的努力方向</h2>
          <ol className="plan-list">
            {result.actionPlan.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ textAlign: "right" }}>
        <button
          className="btn-ghost"
          onClick={() =>
            setPrintContent(
              <FeedbackReport profile={profile || {}} challengeLabel={challengeLabel} task={task || ""} essay={essay || ""} result={result} />
            )
          }
        >
          导出批改报告 PDF
        </button>
      </div>

      <PrintPortal content={printContent} onDone={() => setPrintContent(null)} />
    </>
  );
}

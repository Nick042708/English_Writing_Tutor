import React from "react";
import { EXAMS, PRACTICAL, CEFR_LEVELS, CHALLENGES } from "../examOptions.js";

const CHALLENGE_DESC = {
  match: "素材难度贴合你的档位，稳步积累",
  stretch: "整体拔高约一档，适合学有余力想突破的同学",
  sprint: "瞄准考试最高档，高级表达为主，附使用风险提示",
};

// 画像选择器：第一步选模式，第二步选具体目标（实用模式加自评水平），第三步选难度偏好
export default function ProfileSelector({ profile, onChange }) {
  const { mode, target, cefr, challenge } = profile;

  const setMode = (m) => {
    const fallback = m === "exam" ? "cet4" : "life";
    onChange({ ...profile, mode: m, target: fallback, cefr: null });
  };

  const options = mode === "exam" ? EXAMS : PRACTICAL;

  return (
    <div className="card">
      <h2><span className="dot" />第一步：选择你的模式</h2>
      <div className="mode-row">
        <div
          className={`mode-card ${mode === "exam" ? "active" : ""}`}
          onClick={() => setMode("exam")}
        >
          <b>备考模式</b>
          <span>四六级 / 考研 / 雅思托福等，按考试套路与评分标准来</span>
        </div>
        <div
          className={`mode-card ${mode === "practical" ? "active" : ""}`}
          onClick={() => setMode("practical")}
        >
          <b>实用模式</b>
          <span>生活 / 校园 / 职场真实写作，地道自然为先</span>
        </div>
      </div>

      <div className="field-label">第二步：{mode === "exam" ? "你备考哪项考试？" : "主要用在什么场景？"}</div>
      <div className="chip-row">
        {options.map((o) => (
          <button
            key={o.id}
            className={`chip ${target === o.id ? "active" : ""}`}
            onClick={() => onChange({ ...profile, target: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "practical" && (
        <>
          <div className="field-label">自评英语水平（CEFR，不确定就选接近的档位）</div>
          <div className="chip-row">
            {CEFR_LEVELS.map((lv) => (
              <button
                key={lv}
                className={`chip ${cefr === lv ? "active" : ""}`}
                onClick={() => onChange({ ...profile, cefr: lv })}
              >
                {lv}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="field-label">第三步：难度偏好（觉得素材太简单？往上调一档试试）</div>
      <div className="chip-row">
        {CHALLENGES.map((c) => (
          <button
            key={c.id}
            className={`chip ${challenge === c.id ? "active" : ""}`}
            onClick={() => onChange({ ...profile, challenge: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
        {CHALLENGE_DESC[challenge]}
      </div>
    </div>
  );
}

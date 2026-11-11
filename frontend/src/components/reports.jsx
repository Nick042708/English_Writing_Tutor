import React from "react";

// 三类可打印报告：素材 / 批改 / 收藏。仅用于打印视图，与界面渲染分离

function Meta({ profile, challengeLabel, extra }) {
  return (
    <div className="r-meta">
      目标：{profile.target}（基础档位 {profile.cefr}）· 难度偏好：{challengeLabel}
      {extra ? <> · {extra}</> : null} · 生成时间：{new Date().toLocaleString("zh-CN")}
    </div>
  );
}

export function MaterialsReport({ profile, challengeLabel, task, result }) {
  const phrases = result.vocab?.phrases || [];
  const structures = result.vocab?.structures || [];
  const sentences = result.sentences || [];
  const paragraphs = result.paragraphs || [];

  return (
    <div className="report">
      <h1>English Writing Tutor · 写作素材报告</h1>
      <Meta profile={profile} challengeLabel={challengeLabel} extra={`任务：${task.slice(0, 120)}`} />

      {result.taskBrief && (
        <>
          <h2>任务理解</h2>
          <p>{result.taskBrief}</p>
        </>
      )}

      <h2>短语与搭配</h2>
      {phrases.map((p, i) => (
        <div className="r-item" key={i}>
          <div className="r-en">{p.item}</div>
          <div className="r-zh">{p.meaning}</div>
          {p.example && <div className="r-ex">{p.example}</div>}
          {p.note && <div className="r-note">提示：{p.note}</div>}
        </div>
      ))}

      <h2>句式结构</h2>
      {structures.map((s, i) => (
        <div className="r-item" key={i}>
          <div className="r-en">
            {s.item}
            {s.pattern && <span className="r-tag">{s.pattern}</span>}
          </div>
          {s.meaning && <div className="r-zh">{s.meaning}</div>}
          {s.example && <div className="r-ex">{s.example}</div>}
        </div>
      ))}

      <h2>句子素材</h2>
      {sentences.map((s, i) => (
        <div className="r-item" key={i}>
          <div className="r-ex" style={{ marginLeft: 0 }}>
            {s.sentence}
            {s.device && <span className="r-tag">{s.device}</span>}
          </div>
          <div className="r-zh">{s.translation}</div>
          {s.usage && <div className="r-note">化用场景：{s.usage}</div>}
        </div>
      ))}

      <h2>段落素材</h2>
      {paragraphs.map((p, i) => (
        <div className="r-item" key={i}>
          <div className="r-para">{p.text}</div>
          {p.style && <div className="r-note">风格：{p.style}</div>}
          {p.highlights?.length > 0 && <div className="r-note">亮点：{p.highlights.join("；")}</div>}
        </div>
      ))}
    </div>
  );
}

export function FeedbackReport({ profile, challengeLabel, task, essay, result }) {
  const STATUS = { good: "良好", warn: "一般", bad: "待提升" };

  return (
    <div className="report">
      <h1>English Writing Tutor · 批改报告</h1>
      <Meta profile={profile} challengeLabel={challengeLabel} extra={`任务：${task.slice(0, 120)}`} />

      <h2>总评</h2>
      <p>{result.overall}</p>
      {result.score && (
        <p>
          <b>{result.score.label}</b> — {result.score.comment}
        </p>
      )}

      <h2>分维度点评</h2>
      {(result.dimensions || []).map((d, i) => (
        <div className="r-item" key={i}>
          <div className="r-en">
            {d.name}
            <span className="r-tag">{STATUS[d.status] || d.status}</span>
          </div>
          <div className="r-zh">{d.comment}</div>
        </div>
      ))}

      {result.bonus?.length > 0 && (
        <>
          <h2>加分项</h2>
          <ul>
            {result.bonus.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}

      {result.annotations?.length > 0 && (
        <>
          <h2>逐句批注</h2>
          {result.annotations.map((a, i) => (
            <div className="r-item" key={i}>
              <div className="r-ex" style={{ marginLeft: 0 }}>“{a.quote}”{a.type && <span className="r-tag">{a.type}</span>}</div>
              <div className="r-zh">{a.comment}</div>
              {a.suggestion && <div className="r-note">改法：{a.suggestion}</div>}
            </div>
          ))}
        </>
      )}

      {result.upgrades?.length > 0 && (
        <>
          <h2>句子升级对比</h2>
          {result.upgrades.map((u, i) => (
            <div className="r-row" key={i}>
              <div className="r-before">原句：{u.original}</div>
              <div className="r-after">升级：{u.improved}</div>
              {u.note && <div className="r-why">{u.note}</div>}
            </div>
          ))}
        </>
      )}

      {result.actionPlan?.length > 0 && (
        <>
          <h2>努力方向</h2>
          <ol>
            {result.actionPlan.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </>
      )}

      <h2>附：原文</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{essay}</p>
    </div>
  );
}

export function FavoritesReport({ favorites }) {
  return (
    <div className="report">
      <h1>English Writing Tutor · 我的收藏</h1>
      <div className="r-meta">
        共 {favorites.length} 条 · 导出时间：{new Date().toLocaleString("zh-CN")} · 建议遮住释义自测记忆
      </div>
      <ol>
        {favorites.map((f) => (
          <li key={f.key}>
            <span className="r-en">{f.en}</span>
            {f.zh && <span className="r-zh"> — {f.zh}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

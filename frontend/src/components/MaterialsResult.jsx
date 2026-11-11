import React, { useState } from "react";
import { CopyButton, FavButton, useFavorites } from "./shared.jsx";
import PrintPortal from "./PrintPortal.jsx";
import { MaterialsReport, FavoritesReport } from "./reports.jsx";
import { CHALLENGES } from "../examOptions.js";

// 素材结果展示（三层素材 + 收藏夹 + 导出）：素材页与历史记录回看共用
export default function MaterialsResult({ result, profile, task }) {
  const fav = useFavorites();
  const [printContent, setPrintContent] = useState(null);
  const challengeLabel = CHALLENGES.find((c) => c.id === profile?.challenge)?.label || "匹配我的水平";

  const phrases = result.vocab?.phrases || [];
  const structures = result.vocab?.structures || [];
  const sentences = result.sentences || [];
  const paragraphs = result.paragraphs || [];

  return (
    <>
      {result.notice && <div className="banner">{result.notice}</div>}
      {result.taskBrief && <div className="task-brief">任务理解：{result.taskBrief}</div>}

      <div className="card">
        <h2>
          <span className="dot" />词汇素材 · 短语与搭配
          <span className="count-badge">{phrases.length} 条</span>
        </h2>
        <div className="mat-grid">
          {phrases.map((p, i) => {
            const key = `phrase-${i}-${p.item}`;
            return (
              <div className="mat-item" key={key}>
                <div className="head">
                  <span className="en">{p.item}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <CopyButton text={p.item} />
                    <FavButton
                      faved={fav.has(key)}
                      onClick={() => fav.toggle({ key, en: p.item, zh: p.meaning })}
                    />
                  </div>
                </div>
                <span className="zh">{p.meaning}</span>
                {p.example && <div className="ex">{p.example}</div>}
                {p.note && <span className="note">{p.note}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="dot" />词汇素材 · 句式结构
          <span className="count-badge">{structures.length} 条</span>
        </h2>
        <div className="mat-grid">
          {structures.map((s, i) => {
            const key = `structure-${i}-${s.item}`;
            return (
              <div className="mat-item" key={key}>
                <div className="head">
                  <span className="en">{s.item}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <CopyButton text={s.item} />
                    <FavButton
                      faved={fav.has(key)}
                      onClick={() => fav.toggle({ key, en: s.item, zh: s.meaning })}
                    />
                  </div>
                </div>
                <span className="pattern-tag">{s.pattern}</span>
                <span className="zh">{s.meaning}</span>
                {s.example && <div className="ex">{s.example}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="dot" />句子素材
          <span className="count-badge">{sentences.length} 条</span>
        </h2>
        <div className="mat-grid">
          {sentences.map((s, i) => (
            <div className="mat-item" key={`sentence-${i}`}>
              <div className="head">
                <span className="pattern-tag">{s.device}</span>
                <CopyButton text={s.sentence} />
              </div>
              <div className="ex" style={{ borderLeft: "3px solid var(--blue-weak)" }}>
                {s.sentence}
              </div>
              <span className="zh">{s.translation}</span>
              {s.usage && <span className="note">化用场景：{s.usage}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>
          <span className="dot" />段落素材（已融入上面的词汇与句式）
          <span className="count-badge">{paragraphs.length} 段</span>
        </h2>
        {paragraphs.map((p, i) => (
          <div className="para-item" key={`para-${i}`}>
            <div className="para-head">
              <span className="style-tag">{p.style}</span>
              <CopyButton text={p.text} />
            </div>
            <div className="en-text">{p.text}</div>
            {p.highlights?.length > 0 && (
              <div className="hl">
                {p.highlights.map((h, j) => (
                  <span key={j}>{h}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2><span className="dot" />我的收藏（{fav.favorites.length}）</h2>
        {fav.favorites.length === 0 ? (
          <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
            点击词汇卡片上的「收藏」，把想背的表达存到这里（保存在浏览器本地）
          </span>
        ) : (
          <>
            <div className="fav-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setPrintContent(<FavoritesReport favorites={fav.favorites} />)}>
                导出收藏 PDF
              </button>
            </div>
            {fav.favorites.map((f) => (
              <div className="fav-row" key={f.key}>
                <div>
                  <span className="en">{f.en}</span>
                  {f.zh && <span className="zh"> — {f.zh}</span>}
                </div>
                <button className="btn-ghost" onClick={() => fav.remove(f.key)}>
                  移除
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <button
          className="btn-ghost"
          onClick={() =>
            setPrintContent(
              <MaterialsReport profile={profile || {}} challengeLabel={challengeLabel} task={task || ""} result={result} />
            )
          }
        >
          导出素材 PDF
        </button>
      </div>

      <PrintPortal content={printContent} onDone={() => setPrintContent(null)} />
    </>
  );
}

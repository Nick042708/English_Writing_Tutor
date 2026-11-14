import React, { useEffect, useMemo, useState } from "react";
import { get, post, del, patch } from "../api.js";
import { Loading } from "./shared.jsx";
import Markdown from "./Markdown.jsx";

const fmt = (ts) =>
  ts ? new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const isOverdue = (d) => d != null && Date.now() > d;

// 进度保存在浏览器本地：{ page, answers, done }
const progressKey = (lessonId) => `ewt-lesson-progress-${lessonId}`;
const loadProgress = (lessonId) => {
  try {
    return JSON.parse(localStorage.getItem(progressKey(lessonId)) || "null") || {};
  } catch {
    return {};
  }
};
const saveProgress = (lessonId, data) => {
  try {
    localStorage.setItem(progressKey(lessonId), JSON.stringify(data));
  } catch {
    /* 隐私模式等场景下忽略 */
  }
};
export const lessonDone = (lessonId) => !!loadProgress(lessonId).done;

// ---------- 在线学习（讲解/练习穿插 · 卡片式学习） ----------
// 管理员：按「讲解(Markdown) / 练习题」块自由编排内容，可设作答次数与截止时间
// 学生：卡片弹窗一页页翻阅，进度与草稿自动保存在本地；练习以最后一次为准
export default function LessonsSection({ course, lessons, isAdmin, myLessonGrades, myLessonAnswers, onChanged }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // 老师正在编辑的阅读
  const [studying, setStudying] = useState(null); // 学生正在学习的阅读
  const [gradingLesson, setGradingLesson] = useState(null); // 老师批改的阅读
  const [editingDeadline, setEditingDeadline] = useState(null);

  const myAttempts = (lessonId) =>
    (myLessonGrades || [])
      .filter((g) => g.lessonId === lessonId)
      .sort((a, b) => (b.attempt || 1) - (a.attempt || 1));
  const myAnswerList = (lessonId) => (myLessonAnswers || []).filter((a) => a.lessonId === lessonId);

  // 学生视角的单篇阅读徽章：优先逐题模型，兼容旧整卷作答
  const studentBadge = (l) => {
    const ans = myAnswerList(l.id);
    if (ans.length > 0) {
      const byEx = {};
      for (const a of ans) {
        if (!byEx[a.exerciseId] || a.attempt > byEx[a.exerciseId].attempt) byEx[a.exerciseId] = a;
      }
      let score = 0;
      let pending = false;
      for (const e of l.exercises) {
        const s = byEx[e.id];
        if (!s) continue;
        if (s.pendingReview) {
          if (s.adminScore != null) score += Number(s.adminScore) || 0;
          else pending = true;
        } else {
          score += s.auto || 0;
        }
      }
      const totalPts = l.exercises.reduce((s, e) => s + e.points, 0);
      const answered = Object.keys(byEx).length;
      const anyRetry = l.exercises.some((e) => {
        const s = byEx[e.id];
        return !s || (!s.pendingReview && !s.correct && (!l.maxAttempts || s.attempt < l.maxAttempts));
      });
      return (
        <span className="plan-badge member">
          已答 {answered}/{l.exercises.length} 题 · 得分 {score}/{totalPts}
          {pending ? " · 含待批改" : ""}
          {anyRetry ? " · 可继续作答" : ""}
        </span>
      );
    }
    const attempts = myAttempts(l.id);
    const g = attempts[0];
    if (!g) return null;
    return (
      <span className="plan-badge member">
        已作答 {attempts.length} 次 · {g.pendingReview ? `最新得分 ${g.autoScore}/${g.maxScore}，写作题待老师批改` : `最新得分 ${g.totalScore}/${g.maxScore}`}
      </span>
    );
  };

  return (
    <div className="card">
      <h2><span className="dot" />在线学习</h2>
      <p className="empty-hint" style={{ marginTop: 0 }}>
        讲解与练习穿插编排，学生以卡片形式逐页学习；支持 Markdown 排版，进度自动保存。
      </p>
      {isAdmin && (
        <button
          className="btn"
          onClick={() => {
            setEditing(null);
            setCreating(!creating);
          }}
        >
          {creating ? "收起编辑器" : "发布新学习内容"}
        </button>
      )}
      {(isAdmin && creating) || editing ? (
        <LessonEditor
          key={editing ? `edit-${editing.id}` : "new"}
          courseId={course.id}
          initialLesson={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      {lessons.length === 0 ? (
        <p className="empty-hint">
          {isAdmin ? "还没有发布学习内容。用讲解 + 练习穿插的方式编排一节课吧。" : "老师还没有发布学习内容。"}
        </p>
      ) : (
        lessons.map((l) => {
          const attempts = myAttempts(l.id);
          const g = attempts[0];
          const canRetry = !l.maxAttempts || attempts.length < l.maxAttempts;
          const mdCount = (l.blocks || []).filter((b) => b.type === "md").length;
          const done = lessonDone(l.id);
          const overdue = l.deadline && Date.now() > l.deadline;
          return (
            <div className="notice-item" key={l.id}>
              <div className="notice-head">
                <b>{l.title}</b>
                <span className="count-badge">{mdCount} 段讲解</span>
                <span className="count-badge">{l.exercises.length} 道练习</span>
                {l.exercises.length > 0 && (
                  <span className="count-badge">{l.exercises.reduce((s, e) => s + e.points, 0)} 分</span>
                )}
                <span className="count-badge">{l.maxAttempts ? `限 ${l.maxAttempts} 次作答` : "不限作答次数"}</span>
                {l.deadline && (
                  <span className={overdue ? "count-badge deadline-passed" : "count-badge"}>
                    {overdue ? "已截止" : `截止 ${fmt(l.deadline)}`}
                  </span>
                )}
                {done && <span className="plan-badge member">已学完 ✓</span>}
                {isAdmin ? (
                  <>
                    <button className="btn-ghost" onClick={() => setStudying(l)}>预览学习模式</button>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setCreating(false);
                        setEditing(editing?.id === l.id ? null : l);
                      }}
                    >
                      {editing?.id === l.id ? "收起编辑" : "编辑"}
                    </button>
                    {l.exercises.length > 0 && (
                      <button className="btn-ghost" onClick={() => setGradingLesson(l)}>查看作答与批改</button>
                    )}
                    <button className="btn-ghost" onClick={() => setEditingDeadline(l)}>改截止/次数</button>
                    <button
                      className="btn-ghost danger"
                      onClick={async () => {
                        if (!confirm(`确定删除「${l.title}」？`)) return;
                        try {
                          await del(`/api/courses/${course.id}/lessons/${l.id}`);
                          onChanged();
                        } catch (e) {
                          alert(e.message);
                        }
                      }}
                    >
                      删除
                    </button>
                  </>
                ) : (
                  studentBadge(l)
                )}
                {!isAdmin && (
                  <button className="btn" onClick={() => setStudying(l)}>
                    {done || g || myAnswerList(l.id).length ? "继续学习" : "开始学习"}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
      {studying && (
        <LessonCard
          lesson={studying}
          myAnswers={myAnswerList(studying.id)}
          isAdmin={isAdmin}
          onClose={() => setStudying(null)}
          onSubmitted={() => { setStudying(null); onChanged(); }}
        />
      )}
      {gradingLesson && (
        <LessonGrading
          lessonId={gradingLesson.id}
          lessonTitle={gradingLesson.title}
          onClose={() => setGradingLesson(null)}
        />
      )}
      {editingDeadline && (
        <DeadlineEditor
          title={`调整「${editingDeadline.title}」`}
          initialDeadline={editingDeadline.deadline}
          initialMaxAttempts={editingDeadline.maxAttempts}
          withAttempts
          onSave={async (deadline, maxAttempts) => {
            await patch(`/api/courses/${course.id}/lessons/${editingDeadline.id}`, { deadline, maxAttempts });
            setEditingDeadline(null);
            onChanged();
          }}
          onClose={() => setEditingDeadline(null)}
        />
      )}
    </div>
  );
}

// ---------- Deadline / 次数调整弹窗（在线学习与作业共用） ----------
// 时间戳 → datetime-local 输入框的本地格式
export function toLocalDatetime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DeadlineEditor({ title, initialDeadline, initialMaxAttempts, withAttempts, onSave, onClose }) {
  const toLocal = toLocalDatetime;
  const [deadline, setDeadline] = useState(toLocal(initialDeadline));
  const [maxAttempts, setMaxAttempts] = useState(initialMaxAttempts || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(deadline ? new Date(deadline).getTime() : null, withAttempts ? (maxAttempts ? Number(maxAttempts) : null) : undefined);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="field-label">截止时间（留空 = 不设截止）</div>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        {withAttempts && (
          <>
            <div className="field-label" style={{ marginTop: 10 }}>作答/提交次数</div>
            <select value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)}>
              <option value="">不限次数</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>限 {n} 次</option>)}
            </select>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
          <button
            className="btn-ghost"
            onClick={() => { setDeadline(""); setMaxAttempts(""); }}
          >
            清除
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 管理员：块编辑器（讲解 + 练习穿插；initialLesson 传入时为编辑模式） ----------
let blockKeySeq = 1;
const nextKey = () => `bk-${Date.now()}-${blockKeySeq++}`;

// 从已发布的阅读还原编辑器状态
function stateFromLesson(l) {
  const exById = new Map((l.exercises || []).map((e) => [e.id, e]));
  // 材料的 appliesTo（exerciseId 列表）还原为题目序号列表，便于编辑器勾选
  const exIndex = new Map((l.exercises || []).map((e, i) => [e.id, i]));
  const blocks = (l.blocks || (l.content ? [{ type: "md", text: l.content }] : [])).map((b) => {
    if (b.type === "md") return { key: nextKey(), type: "md", text: b.text };
    if (b.type === "material") {
      const scope = (b.appliesTo || []).map((id) => exIndex.get(id)).filter((v) => v != null);
      return { key: nextKey(), type: "material", text: b.text, scope: scope.length ? scope : null };
    }
    const e = exById.get(b.exerciseId);
    if (!e) return null;
    return {
      key: nextKey(),
      type: "exercise",
      data:
        e.type === "choice"
          ? { type: "choice", prompt: e.prompt, options: [...e.options], answer: e.answer, points: e.points }
          : {
              type: "blank",
              mode: e.mode,
              prompt: e.prompt,
              answersText: (e.answers || []).join("\n"),
              minWords: e.minWords || "",
              maxWords: e.maxWords || "",
              points: e.points,
            },
    };
  }).filter(Boolean);
  return {
    title: l.title || "",
    blocks,
    maxAttempts: l.maxAttempts ? String(l.maxAttempts) : "",
    deadline: toLocalDatetime(l.deadline),
  };
}

function LessonEditor({ courseId, initialLesson, onDone }) {
  const init = useMemo(() => (initialLesson ? stateFromLesson(initialLesson) : null), [initialLesson]);
  const [title, setTitle] = useState(init?.title || "");
  const [blocks, setBlocks] = useState(init?.blocks || []); // {key, type:'md', text} | {key, type:'exercise', data}
  const [maxAttempts, setMaxAttempts] = useState(init?.maxAttempts || ""); // 空 = 不限
  const [deadline, setDeadline] = useState(init?.deadline || "");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addMd = () => setBlocks([...blocks, { key: nextKey(), type: "md", text: "" }]);
  const addMaterial = () => setBlocks([...blocks, { key: nextKey(), type: "material", text: "", scope: null }]); // scope: null=全部题目，数组=关联的题目序号
  const addChoice = () =>
    setBlocks([...blocks, { key: nextKey(), type: "exercise", data: { type: "choice", prompt: "", options: ["", ""], answer: 0, points: 2 } }]);
  const addBlank = () =>
    setBlocks([...blocks, { key: nextKey(), type: "exercise", data: { type: "blank", mode: "unique", prompt: "", answersText: "", minWords: "", maxWords: "", points: 2 } }]);

  const patchBlock = (key, kv) => setBlocks(blocks.map((b) => (b.key === key ? { ...b, ...kv } : b)));
  const patchEx = (key, kv) =>
    setBlocks(blocks.map((b) => (b.key === key ? { ...b, data: { ...b.data, ...kv } } : b)));
  const removeBlock = (key) => setBlocks(blocks.filter((b) => b.key !== key));
  const move = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[to]] = [next[to], next[idx]];
    setBlocks(next);
  };

  const publish = async () => {
    setError("");
    const exercises = [];
    const outBlocks = [];
    for (const b of blocks) {
      if (b.type === "md") {
        outBlocks.push({ type: "md", text: b.text });
      } else if (b.type === "material") {
        // scope 为空 = 全局材料；指定题目时以「题目序号」提交，后端转换为 exerciseId
        outBlocks.push(b.scope && b.scope.length ? { type: "material", text: b.text, appliesTo: b.scope } : { type: "material", text: b.text });
      } else {
        const d = b.data;
        exercises.push(
          d.type === "choice"
            ? { type: "choice", prompt: d.prompt, options: d.options, answer: Number(d.answer), points: Number(d.points) }
            : {
                type: "blank",
                mode: d.mode,
                prompt: d.prompt,
                answers: (d.answersText || "").split("\n").map((s) => s.trim()).filter(Boolean),
                minWords: d.minWords || undefined,
                maxWords: d.maxWords || undefined,
                points: Number(d.points),
              }
        );
        outBlocks.push({ type: "exercise", index: exercises.length - 1 });
      }
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        blocks: outBlocks,
        exercises,
        maxAttempts: maxAttempts || undefined,
        deadline: deadline ? new Date(deadline).getTime() : undefined,
      };
      if (initialLesson) {
        await patch(`/api/courses/${courseId}/lessons/${initialLesson.id}`, payload);
      } else {
        await post(`/api/courses/${courseId}/lessons`, payload);
      }
      onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // 题目清单（按出现顺序编号）：材料关联选择与预览共用
  const exItems = [];
  for (const b of blocks) {
    if (b.type === "exercise") {
      exItems.push({
        key: b.key,
        kind: b.data.type === "choice" ? "选择题" : b.data.mode === "unique" ? "填空题" : "写作填空",
        label: String(b.data.prompt || "").replace(/\s+/g, " ").slice(0, 18),
      });
    }
  }
  const toggleScope = (key, idx, on) =>
    setBlocks(
      blocks.map((b) => {
        if (b.key !== key || b.type !== "material") return b;
        const cur = Array.isArray(b.scope) ? b.scope : [];
        return { ...b, scope: on ? [...cur, idx] : cur.filter((x) => x !== idx) };
      })
    );

  if (preview) {
    const exNoOf = (key) => exItems.findIndex((x) => x.key === key) + 1;
    return (
      <div style={{ marginTop: 12 }}>
        <div className="row-actions" style={{ marginBottom: 10 }}>
          <button className="btn-ghost" onClick={() => setPreview(false)}>← 返回编辑</button>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>学生将看到的顺序（不含标准答案）</span>
        </div>
        {blocks.map((b) =>
          b.type === "exercise" ? (
            <div className="notice-item" key={b.key}>
              <b>{b.data.type === "choice" ? "选择题" : "填空题"}</b>
              <div className="notice-body" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{b.data.prompt}</div>
            </div>
          ) : (
            <div className="notice-item" key={b.key}>
              <b>{b.type === "material" ? "📄 共享材料（学生作答时同屏对照）" : "📖 讲解"}</b>
              {b.type === "material" && Array.isArray(b.scope) && b.scope.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  仅关联：{b.scope.map((i) => `第${i + 1}题`).join("、")}
                </div>
              )}
              <div className="notice-body" style={{ marginTop: 6 }}><Markdown text={b.text} /></div>
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="标题，例如：Paragraph Structure 段落结构" />

      <div className="field-label" style={{ marginTop: 14 }}>内容块（讲解与练习按此顺序穿插，学生逐卡学习）</div>
      {blocks.length === 0 && (
        <p className="empty-hint">还没有内容块。先用下方按钮添加一段讲解（支持 Markdown），再插入练习题。</p>
      )}
      {blocks.map((b, i) => (
        <div className="notice-item block-editor" key={b.key}>
          <div className="notice-head">
            <b>{b.type === "md" ? "📖 讲解（Markdown）" : b.type === "material" ? "📄 共享材料" : b.data.type === "choice" ? "✏️ 选择题" : b.data.mode === "unique" ? "✏️ 填空题（唯一答案）" : "✏️ 写作填空（老师批改）"}</b>
            <span className="row-actions">
              <button className="btn-ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button className="btn-ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
              <button className="btn-ghost danger" onClick={() => removeBlock(b.key)}>移除</button>
            </span>
          </div>
          {b.type === "md" ? (
            <textarea
              className="lesson-editor"
              style={{ minHeight: 120 }}
              value={b.text}
              onChange={(e) => patchBlock(b.key, { text: e.target.value })}
              placeholder={"支持 Markdown：## 小标题、**加粗**、- 列表、> 引用、表格、代码块……\n写知识点讲解、范文示例、技巧总结……"}
            />
          ) : b.type === "material" ? (
            <>
              <textarea
                className="lesson-editor"
                style={{ minHeight: 120 }}
                value={b.text}
                onChange={(e) => patchBlock(b.key, { text: e.target.value })}
                placeholder={"共享材料：粘贴短文 / 对话 / 图表描述……（保留换行，学生作答时可同屏对照，不用在每道题里重复粘贴）"}
              />
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>关联题目：</span>
                <select
                  value={b.scope == null ? "all" : "custom"}
                  onChange={(e) => patchBlock(b.key, { scope: e.target.value === "all" ? null : [] })}
                >
                  <option value="all">全部题目（全局材料）</option>
                  <option value="custom">指定题目…</option>
                </select>
                {b.scope != null && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6 }}>
                    {exItems.length === 0 && (
                      <span style={{ color: "var(--ink-3)" }}>这篇还没有练习题——先在下方添加题目，再回来勾选关联</span>
                    )}
                    {exItems.map((ex, n) => (
                      <label key={ex.key} style={{ fontSize: 12.5, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={b.scope.includes(n)}
                          onChange={(e) => toggleScope(b.key, n, e.target.checked)}
                        />{" "}
                        第{n + 1}题 {ex.kind}
                        {ex.label ? `·${ex.label}` : ""}
                      </label>
                    ))}
                    {exItems.length > 0 && b.scope.length === 0 && (
                      <span style={{ color: "#b3372a" }}>还没勾选任何题目：保存后将不会在任何题目旁显示，请至少勾选一题</span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <ExerciseFields data={b.data} patch={(kv) => patchEx(b.key, kv)} />
          )}
        </div>
      ))}

      <div className="row-actions" style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={addMd}>+ 讲解块</button>
        <button className="btn-ghost" onClick={addMaterial}>+ 材料块</button>
        <button className="btn-ghost" onClick={addChoice}>+ 选择题</button>
        <button className="btn-ghost" onClick={addBlank}>+ 填空题</button>
        <button className="btn-ghost" onClick={() => setPreview(true)} disabled={blocks.length === 0}>👁 预览</button>
      </div>

      <div className="row-actions" style={{ marginTop: 14 }}>
        <span style={{ fontSize: 13 }}>作答次数：</span>
        <select value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)}>
          <option value="">不限次数</option>
          <option value="1">限 1 次</option>
          <option value="2">限 2 次</option>
          <option value="3">限 3 次</option>
          <option value="5">限 5 次</option>
        </select>
        <span style={{ fontSize: 13 }}>截止时间：</span>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ maxWidth: 220 }} />
        <button className="btn-ghost" onClick={() => setDeadline("")}>清除</button>
      </div>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
        以最后一次作答为准；有标准答案的题目在答对或次数用尽前不揭示答案。逾期是否可补学由 Syllabus 规定控制。
      </span>

      {error && <div className="error-box">{error}</div>}
      <button className="btn" style={{ marginTop: 10 }} onClick={publish} disabled={saving || !title.trim() || blocks.length === 0}>
        {saving ? (initialLesson ? "保存中…" : "发布中…") : initialLesson ? "保存修改" : "发布学习内容"}
      </button>
    </div>
  );
}

// 单道练习题的编辑字段（从旧编辑器迁移）
function ExerciseFields({ data, patch }) {
  if (data.type === "choice") {
    return (
      <>
        <textarea
          className="lesson-editor"
          style={{ minHeight: 56 }}
          value={data.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
          placeholder={"题干（可换行）：例如\nRead the following sample paragraph...\nWhich sentence is the topic sentence?"}
        />
        {data.options.map((o, oi) => (
          <div className="row-actions" key={oi} style={{ marginBottom: 6 }}>
            <label className="row-actions" style={{ gap: 4, cursor: "pointer" }}>
              <input type="radio" name={`ans-editor-${data.prompt.length}-${oi}`} checked={Number(data.answer) === oi} onChange={() => patch({ answer: oi })} />
              <b style={{ fontSize: 12 }}>正确</b>
            </label>
            <input
              style={{ flex: 1 }}
              value={o}
              onChange={(e) => {
                const options = [...data.options];
                options[oi] = e.target.value;
                patch({ options });
              }}
              placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
            />
            {data.options.length > 2 && (
              <button className="btn-ghost danger" onClick={() => patch({ options: data.options.filter((_, x) => x !== oi), answer: 0 })}>×</button>
            )}
          </div>
        ))}
        {data.options.length < 6 && <button className="btn-ghost" onClick={() => patch({ options: [...data.options, "" ] })}>+ 加一个选项</button>}
      </>
    );
  }
  return (
    <>
      <textarea
        className="lesson-editor"
        style={{ minHeight: 56 }}
        value={data.prompt}
        onChange={(e) => patch({ prompt: e.target.value })}
        placeholder={"题干（可换行）：例如粘贴一段短文后提问，或直接写出题目"}
      />
      <div className="row-actions" style={{ marginBottom: 8 }}>
        <select value={data.mode} onChange={(e) => patch({ mode: e.target.value })}>
          <option value="unique">唯一答案（自动判分）</option>
          <option value="flexible">灵活写作（老师批改）</option>
        </select>
        <span className="row-actions">
          词数
          <input type="number" min="10" style={{ width: 64 }} value={data.minWords} onChange={(e) => patch({ minWords: e.target.value })} placeholder="最低" />
          ~
          <input type="number" style={{ width: 64 }} value={data.maxWords} onChange={(e) => patch({ maxWords: e.target.value })} placeholder="最高" />
        </span>
        <span className="row-actions">
          分值
          <input type="number" min="1" max="100" style={{ width: 60 }} value={data.points} onChange={(e) => patch({ points: e.target.value })} />
        </span>
      </div>
      {data.mode === "unique" && (
        <textarea
          style={{ minHeight: 60 }}
          value={data.answersText}
          onChange={(e) => patch({ answersText: e.target.value })}
          placeholder={"可接受的答案，每行一个（忽略大小写与标点差异）"}
        />
      )}
      {data.mode === "flexible" && (
        <p className="empty-hint" style={{ margin: 0 }}>
          学生需写一段文字，提交后由你在「查看作答与批改」里逐题打分。
        </p>
      )}
    </>
  );
}

// ---------- 学生/预览：卡片式学习弹窗（分页 + 逐题提交 + 材料同屏 + 进度保存） ----------
function LessonCard({ lesson, myAnswers = [], isAdmin, onClose, onSubmitted }) {
  const initial = useMemo(() => loadProgress(lesson.id), [lesson.id]);
  const [page, setPage] = useState(Math.min(initial.page || 0, lesson.blocks.length - 1));
  const [drafts, setDrafts] = useState(initial.drafts || {}); // 每题未提交的草稿
  const [matOpen, setMatOpen] = useState(initial.matOpen || false);
  const [saved, setSaved] = useState(() => {
    // 服务端已提交的每题最新记录
    const map = {};
    for (const a of myAnswers) {
      const cur = map[a.exerciseId];
      if (!cur || a.attempt > cur.attempt) map[a.exerciseId] = a;
    }
    return map;
  });
  const [feedback, setFeedback] = useState({}); // 刚提交一题的即时反馈 {exerciseId: resp}
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  const total = lesson.blocks.length;
  const isLast = page >= total - 1;
  // 材料按题关联：appliesTo 缺省/为空 = 全局材料（兼容旧数据），否则只在关联的题目旁显示
  const materialBlocks = lesson.blocks.filter((b) => b.type === "material");
  const materialsFor = (exId) =>
    materialBlocks
      .filter((m) => !m.appliesTo || m.appliesTo.length === 0 || m.appliesTo.includes(exId))
      .map((m) => m.text);

  useEffect(() => {
    saveProgress(lesson.id, { page, drafts, matOpen, done: initial.done });
  }, [page, drafts, matOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 键盘翻页
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" && !isLast) setPage((p) => Math.min(p + 1, total - 1));
      if (e.key === "ArrowLeft" && page > 0) setPage((p) => p - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, isLast, total]);

  const wc = (id) => String(drafts[id] ?? saved[id]?.answer ?? "").trim().split(/\s+/).filter(Boolean).length;
  const exerciseOf = (b) => lesson.exercises.find((e) => e.id === b.exerciseId);
  const hasExercises = lesson.exercises.length > 0;

  const finishReadonly = () => {
    saveProgress(lesson.id, { page: 0, drafts: {}, matOpen: false, done: true });
    onSubmitted();
  };

  // 逐题提交：每题单独计次数，答对或次数用尽后揭示该题答案
  const submitOne = async (e) => {
    setError("");
    const answer = String(drafts[e.id] ?? saved[e.id]?.answer ?? "").trim();
    if (!answer) {
      setError("请先作答再提交");
      return;
    }
    setSavingId(e.id);
    try {
      const resp = await post(`/api/lessons/${lesson.id}/answer`, { exerciseId: e.id, answer });
      setSaved((m) => ({
        ...m,
        [e.id]: { ...(m[e.id] || {}), answer, attempt: resp.attempt, correct: resp.correct, auto: resp.auto, pendingReview: resp.pendingReview, revealAnswer: resp.revealAnswer },
      }));
      setFeedback((f) => ({ ...f, [e.id]: resp }));
      setDrafts((d) => ({ ...d, [e.id]: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const exhaustedOf = (e) => lesson.maxAttempts && (saved[e.id]?.attempt || 0) >= lesson.maxAttempts;
  const doneState = (e) => {
    const s = saved[e.id];
    if (!s) return null;
    if (s.pendingReview) return s.adminScore != null ? "reviewed" : "pending";
    return s.correct ? "correct" : exhaustedOf(e) ? "exhausted" : "wrong";
  };
  const attemptsLeftOf = (e) =>
    lesson.maxAttempts ? Math.max(0, lesson.maxAttempts - (saved[e.id]?.attempt || 0)) : null;
  const revealOf = (e) => saved[e.id]?.revealAnswer || feedback[e.id]?.revealAnswer || null;

  const lessonScoreSummary = () => {
    let score = 0;
    let totalPts = 0;
    let pending = false;
    for (const e of lesson.exercises) {
      totalPts += e.points;
      const s = saved[e.id];
      if (!s) continue;
      if (s.pendingReview) {
        if (s.adminScore != null) score += Number(s.adminScore) || 0;
        else pending = true;
      } else {
        score += s.auto || 0;
      }
    }
    return { score, total: totalPts, pending };
  };

  const renderExerciseInput = (e) => {
    const st = doneState(e);
    const left = attemptsLeftOf(e);
    const rv = revealOf(e);
    const locked = !isAdmin && (st === "correct" || st === "exhausted");
    return (
      <>
        <div className="notice-head">
          <b>{e.type === "choice" ? "选择题" : "填空题"}</b>
          <span className="count-badge">{e.points} 分</span>
          {e.type === "blank" && (
            <span className="course-meta">
              {e.mode === "unique" ? "有唯一答案" : "灵活写作 · 老师批改"}
              {e.minWords ? ` · ${e.minWords}${e.maxWords ? `-${e.maxWords}` : "+"} 词` : ""}
            </span>
          )}
          {!isAdmin && st === "correct" && <span className="plan-badge member">✓ 正确 +{e.points} 分</span>}
          {!isAdmin && st === "exhausted" && <span className="plan-badge guest">✗ 次数用完 +0 分</span>}
          {!isAdmin && st === "pending" && <span className="plan-badge guest">老师批改中</span>}
          {!isAdmin && st === "reviewed" && <span className="plan-badge member">老师评分：{saved[e.id].adminScore}/{e.points}</span>}
          {!isAdmin && st === "wrong" && (
            <span className="plan-badge guest">✗ 还不对{left != null ? ` · 还可 ${left} 次` : " · 再试一次"}</span>
          )}
        </div>
        <div className="notice-body" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>{e.prompt}</div>
        {locked ? (
          e.type === "choice" ? (
            <div className="notice-body">
              你的选择：{e.options[Number(saved[e.id].answer)]}
              {st === "exhausted" && !saved[e.id].correct ? `（正确答案：${e.options[e.answer]}）` : " ✓"}
            </div>
          ) : (
            <>
              <div className="essay-view">{saved[e.id].answer || "（未作答）"}</div>
              {e.mode === "unique" && st === "exhausted" && (
                <div className="notice-body" style={{ color: "var(--brand-ink)" }}>参考答案：{e.answers.join(" / ")}</div>
              )}
            </>
          )
        ) : (
          <>
            {e.type === "choice" ? (
              e.options.map((o, oi) => (
                <label className="row-actions" key={oi} style={{ gap: 8, cursor: "pointer", marginBottom: 6 }}>
                  <input
                    type="radio"
                    name={`q-${e.id}`}
                    checked={String(drafts[e.id] ?? saved[e.id]?.answer ?? "") === String(oi)}
                    onChange={() => setDrafts({ ...drafts, [e.id]: String(oi) })}
                  />
                  {o}
                </label>
              ))
            ) : (
              <>
                <textarea
                  style={{ minHeight: 80 }}
                  value={drafts[e.id] ?? saved[e.id]?.answer ?? ""}
                  onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value })}
                  placeholder="在这里写下你的句子/段落……"
                />
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  当前 {wc(e.id)} 词{e.minWords ? `（要求 ${e.minWords}${e.maxWords ? `-${e.maxWords}` : " 以上"} 词）` : ""}
                </div>
              </>
            )}
            {!isAdmin && (
              <div className="row-actions" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => submitOne(e)} disabled={savingId === e.id}>
                  {savingId === e.id ? "提交中…" : saved[e.id] ? "再试一次" : "提交本题"}
                </button>
                {rv ? (
                  <span style={{ fontSize: 12.5, color: "var(--brand-ink)" }}>
                    {rv.kind === "choice" ? `正确答案：${e.options[rv.index]}` : `参考答案：${rv.answers.join(" / ")}`}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    {lesson.maxAttempts ? `本题还可作答 ${left} 次` : "本题不限次数"}；答对或次数用尽后揭示答案
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const cur = lesson.blocks[page];
  const curEx = cur?.type === "exercise" ? exerciseOf(cur) : null;
  const curMaterials = curEx ? materialsFor(curEx.id) : [];
  const overall = hasExercises && !isAdmin ? lessonScoreSummary() : null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card lesson-card-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{lesson.title}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>

        {/* 进度条 */}
        <div className="lesson-progress">
          <div className="lesson-progress-bar" style={{ width: `${((page + 1) / total) * 100}%` }} />
        </div>
        <div className="lesson-card-meta">
          <span>第 {page + 1} / {total} 页</span>
          <span>{cur?.type === "md" ? "📖 讲解" : cur?.type === "material" ? "📄 材料" : "✏️ 练习"}</span>
          {overall && (
            <span>
              得分 {overall.score}/{overall.total}
              {overall.pending ? " · 含待批改" : ""}
            </span>
          )}
        </div>

        <div
          className="lesson-card-body"
          style={curEx && matOpen && curMaterials.length > 0 ? { display: "flex", gap: 14, alignItems: "flex-start" } : undefined}
        >
          {curEx && matOpen && curMaterials.length > 0 && (
            <div className="notice-item" style={{ flex: "0 0 45%", maxHeight: "45vh", overflowY: "auto", marginBottom: 0 }}>
              <b>📄 共享材料{materialBlocks.length > 1 ? `（本题相关 ${curMaterials.length} 篇）` : ""}</b>
              <div className="notice-body" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{curMaterials.join("\n\n———\n\n")}</div>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {cur?.type === "md" ? (
              <Markdown text={cur.text} />
            ) : cur?.type === "material" ? (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14.5, lineHeight: 1.8 }}>{cur.text}</div>
            ) : curEx ? (
              renderExerciseInput(curEx)
            ) : null}
            {isAdmin && <div className="course-meta" style={{ marginTop: 10 }}>（预览模式：不会提交、不计成绩）</div>}
          </div>
        </div>

        {curEx && curMaterials.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button className="btn-ghost" onClick={() => setMatOpen(!matOpen)}>
              {matOpen ? "收起材料" : "📄 对照材料"}
            </button>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="lesson-card-nav">
          <button className="btn-ghost" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
            ← 上一页
          </button>
          {isLast ? (
            isAdmin ? (
              <button className="btn-ghost" onClick={onClose}>结束预览</button>
            ) : (
              <button className="btn" onClick={finishReadonly}>完成学习 ✓</button>
            )
          ) : (
            <button className="btn" onClick={() => setPage(page + 1)}>下一页 →</button>
          )}
        </div>
        {!isAdmin && hasExercises && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            逐题提交，每题单独判分{lesson.maxAttempts ? `，每题最多作答 ${lesson.maxAttempts} 次` : "（每题不限次数）"}；
            答对或次数用尽后揭示该题答案。进度与草稿已自动保存。
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 老师：批改某份阅读（逐题模型优先，兼容旧整卷记录） ----------
function LessonGrading({ lessonId, lessonTitle, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null); // 逐题模型：正在批改的 userId
  const [editing, setEditing] = useState(null); // 旧模型：正在批改的 grade id

  const load = () =>
    get(`/api/lessons/${lessonId}/grades`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [lessonId]);

  if (error) {
    return (
      <div className="modal-mask" onClick={onClose}>
        <div className="modal-card review-modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="modal-head">
            <h2>批改 · {lessonTitle}</h2>
            <button className="btn-ghost" onClick={onClose}>关闭</button>
          </div>
          <div className="error-box">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card review-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2>批改 · {lessonTitle}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
        {!data ? (
          <Loading text="加载作答记录…" />
        ) : (data.answersByUser || []).length === 0 && data.grades.length === 0 ? (
          <p className="empty-hint">还没有学生作答。</p>
        ) : (
          <>
            {(data.answersByUser || []).length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 6 }}>逐题作答（每题以最后一次为准）</div>
                <div className="table-wrap">
                  <table className="user-table">
                    <thead>
                      <tr><th>学员</th><th>已答</th><th>最后提交</th><th>得分</th><th>状态</th><th>操作</th></tr>
                    </thead>
                    <tbody>
                      {data.answersByUser.map((r) => {
                        const exs = data.lesson.exercises || [];
                        let score = 0;
                        let pending = false;
                        for (const e of exs) {
                          const s = r.answers[e.id];
                          if (!s) continue;
                          if (s.pendingReview) {
                            if (s.adminScore != null) score += Number(s.adminScore) || 0;
                            else pending = true;
                          } else {
                            score += s.auto || 0;
                          }
                        }
                        const totalPts = exs.reduce((s, e) => s + e.points, 0);
                        const answered = Object.keys(r.answers).length;
                        return (
                          <tr key={r.userId}>
                            <td>{r.realName ? `${r.realName}（${r.username}）` : r.username}</td>
                            <td><span className="count-badge">{answered}/{exs.length} 题</span></td>
                            <td>{fmt(r.lastAt)}</td>
                            <td><b>{score}/{totalPts}</b></td>
                            <td>
                              {pending ? <span className="plan-badge guest">待批改</span> : <span className="plan-badge member">{answered < exs.length ? "部分作答" : "已完成"}</span>}
                            </td>
                            <td>
                              <button className="btn-ghost" onClick={() => setEditingUser(editingUser === r.userId ? null : r.userId)}>
                                {pending ? "批改" : "查看"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {data.grades.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 14 }}>旧版整卷作答记录</div>
                <div className="table-wrap">
                  <table className="user-table">
                    <thead>
                      <tr><th>学员</th><th>次数</th><th>提交时间</th><th>客观题</th><th>总分</th><th>状态</th><th>操作</th></tr>
                    </thead>
                    <tbody>
                      {data.grades.map((g) => (
                        <tr key={g.id}>
                          <td>{g.realName ? `${g.realName}（${g.username}）` : g.username}</td>
                          <td><span className="count-badge">{g.attempt || 1}</span></td>
                          <td>{fmt(g.submittedAt)}</td>
                          <td>{g.autoScore}/{g.maxAutoScore}</td>
                          <td><b>{g.pendingReview ? "—" : `${g.totalScore}/${g.maxScore}`}</b></td>
                          <td>
                            {g.pendingReview ? <span className="plan-badge guest">待批改</span> : <span className="plan-badge member">已批改</span>}
                          </td>
                          <td>
                            <button className="btn-ghost" onClick={() => setEditing(editing === g.id ? null : g.id)}>
                              {g.pendingReview ? "批改" : "查看"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
        {editingUser && (
          <AnswerDetail
            row={data.answersByUser.find((r) => r.userId === editingUser)}
            lesson={data.lesson}
            onSaved={() => { setEditingUser(null); load(); }}
          />
        )}
        {editing && <GradeDetail grade={data.grades.find((g) => g.id === editing)} lesson={data.lesson} onSaved={() => { setEditing(null); load(); }} />}
      </div>
    </div>
  );
}

// 逐题模型的学生作答详情（含灵活写作批改）
function AnswerDetail({ row, lesson, onSaved }) {
  const [scores, setScores] = useState(() => {
    const init = {};
    lesson.exercises.filter((e) => e.type === "blank" && e.mode === "flexible").forEach((e) => {
      init[e.id] = row.answers[e.id]?.adminScore ?? "";
    });
    return init;
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await post(`/api/lessons/${lesson.id}/review`, { userId: row.userId, scores, comment });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="field-label">{row.realName ? `${row.realName}（${row.username}）` : row.username} 的作答</div>
      {lesson.exercises.map((e) => {
        const s = row.answers[e.id];
        return (
          <div className="notice-item" key={e.id}>
            <div className="notice-head">
              <b>{e.type === "choice" ? "选择题" : "填空题"}</b>
              <span className="count-badge">{s ? `${s.attempt} 次` : "未作答"}</span>
              {s && !s.pendingReview && <span className={s.correct ? "plan-badge member" : "plan-badge guest"}>{s.correct ? `✓ +${e.points}` : "✗ +0"}</span>}
              {s?.adminScore != null && <span className="plan-badge member">批改：{s.adminScore}/{e.points}</span>}
            </div>
            <div className="notice-body" style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>{e.prompt}</div>
            {e.type === "choice" ? (
              <div className="notice-body">学生选择：{s ? e.options[Number(s.answer)] : "—"} ｜ 正确答案：{e.options[e.answer]}</div>
            ) : (
              <div className="essay-view">{s?.answer || "（未作答）"}</div>
            )}
            {e.type === "blank" && e.mode === "unique" && s && !s.correct && (
              <div className="notice-body" style={{ color: "var(--brand-ink)" }}>参考答案：{e.answers.join(" / ")}</div>
            )}
            {e.type === "blank" && e.mode === "flexible" && s && (
              <div className="row-actions" style={{ marginTop: 6 }}>
                <span>得分（0-{e.points}）：</span>
                <input
                  type="number"
                  min="0"
                  max={e.points}
                  step="0.5"
                  style={{ width: 70 }}
                  value={scores[e.id]}
                  onChange={(ev) => setScores({ ...scores, [e.id]: ev.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="field-label">总评（可选）</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="给这位同学的评语…" />
      {error && <div className="error-box">{error}</div>}
      <button className="btn" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
        {saving ? "保存中…" : "保存批改结果"}
      </button>
    </div>
  );
}

function GradeDetail({ grade, lesson, onSaved }) {
  const [scores, setScores] = useState(() => {
    const init = {};
    lesson.exercises.filter((e) => e.type === "blank" && e.mode === "flexible").forEach((e) => {
      init[e.id] = grade.adminReview?.scores?.[e.id] ?? "";
    });
    return init;
  });
  const [comment, setComment] = useState(grade.adminReview?.comment || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await post(`/api/lesson-grades/${grade.id}/review`, { scores, comment });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const answerOf = (eid) => grade.answers.find((a) => a.exerciseId === eid);

  return (
    <div style={{ marginTop: 14 }}>
      {lesson.exercises.map((e) => {
        const a = answerOf(e.id);
        return (
          <div className="notice-item" key={e.id}>
            <div className="notice-head">
              <b>{e.type === "choice" ? "选择题" : "填空题"}</b>
              {a?.auto != null && (
                <span className={a.correct ? "plan-badge member" : "plan-badge guest"}>
                  {a.correct ? `✓ +${e.points}` : "✗ +0"}
                </span>
              )}
            </div>
            <div className="notice-body" style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>{e.prompt}</div>
            {e.type === "choice" ? (
              <div className="notice-body">学生选择：{e.options[Number(a?.answer)]} ｜ 正确答案：{e.options[e.answer]}</div>
            ) : (
              <div className="essay-view">{a?.answer || "（未作答）"}</div>
            )}
            {e.type === "blank" && e.mode === "unique" && !a?.correct && (
              <div className="notice-body" style={{ color: "var(--brand-ink)" }}>参考答案：{e.answers.join(" / ")}</div>
            )}
            {e.type === "blank" && e.mode === "flexible" && (
              <div className="row-actions" style={{ marginTop: 6 }}>
                <span>得分（0-{e.points}）：</span>
                <input
                  type="number"
                  min="0"
                  max={e.points}
                  step="0.5"
                  style={{ width: 70 }}
                  value={scores[e.id]}
                  onChange={(ev) => setScores({ ...scores, [e.id]: ev.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="field-label">总评（可选）</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="给这位同学的评语…" />
      {error && <div className="error-box">{error}</div>}
      <button className="btn" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
        {saving ? "保存中…" : grade.pendingReview ? "保存批改结果" : "更新批改"}
      </button>
    </div>
  );
}

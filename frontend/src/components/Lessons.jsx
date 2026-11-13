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
export default function LessonsSection({ course, lessons, isAdmin, myLessonGrades, onChanged }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // 老师正在编辑的阅读
  const [studying, setStudying] = useState(null); // 学生正在学习的阅读
  const [gradingLesson, setGradingLesson] = useState(null); // 老师批改的阅读
  const [editingDeadline, setEditingDeadline] = useState(null);

  const myAttempts = (lessonId) =>
    (myLessonGrades || [])
      .filter((g) => g.lessonId === lessonId)
      .sort((a, b) => (b.attempt || 1) - (a.attempt || 1));

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
                ) : g ? (
                  <>
                    <span className="plan-badge member">
                      已作答 {attempts.length} 次 · {g.pendingReview ? `最新得分 ${g.autoScore}/${g.maxScore}，写作题待老师批改` : `最新得分 ${g.totalScore}/${g.maxScore}`}
                      {canRetry && " · 可再试"}
                    </span>
                  </>
                ) : null}
                {!isAdmin && (canRetry || !g) && (
                  <button className="btn" onClick={() => setStudying(l)}>
                    {done || g ? "继续学习" : "开始学习"}
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
          attemptsUsed={myAttempts(studying.id).length}
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
  const blocks = (l.blocks || (l.content ? [{ type: "md", text: l.content }] : [])).map((b) => {
    if (b.type === "md") return { key: nextKey(), type: "md", text: b.text };
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

  if (preview) {
    return (
      <div style={{ marginTop: 12 }}>
        <div className="row-actions" style={{ marginBottom: 10 }}>
          <button className="btn-ghost" onClick={() => setPreview(false)}>← 返回编辑</button>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>学生将看到的顺序（不含标准答案）</span>
        </div>
        {blocks.map((b) =>
          b.type === "md" ? (
            <div className="notice-item" key={b.key}><Markdown text={b.text} /></div>
          ) : (
            <div className="notice-item" key={b.key}>
              <b>{b.data.type === "choice" ? "选择题" : "填空题"}</b>
              <div className="notice-body" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{b.data.prompt}</div>
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
            <b>{b.type === "md" ? "📖 讲解（Markdown）" : b.data.type === "choice" ? "✏️ 选择题" : b.data.mode === "unique" ? "✏️ 填空题（唯一答案）" : "✏️ 写作填空（老师批改）"}</b>
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
          ) : (
            <ExerciseFields data={b.data} patch={(kv) => patchEx(b.key, kv)} />
          )}
        </div>
      ))}

      <div className="row-actions" style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={addMd}>+ 讲解块</button>
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

// ---------- 学生/预览：卡片式学习弹窗（分页 + 进度保存） ----------
function LessonCard({ lesson, attemptsUsed = 0, isAdmin, onClose, onSubmitted }) {
  const initial = useMemo(() => loadProgress(lesson.id), [lesson.id]);
  const [page, setPage] = useState(Math.min(initial.page || 0, lesson.blocks.length - 1));
  const [answers, setAnswers] = useState(initial.answers || {});
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const total = lesson.blocks.length;
  const isLast = page >= total - 1;

  useEffect(() => {
    if (!result) saveProgress(lesson.id, { page, answers, done: initial.done });
  }, [page, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  // 键盘翻页
  useEffect(() => {
    const onKey = (e) => {
      if (result) return;
      if (e.key === "ArrowRight" && !isLast) setPage((p) => Math.min(p + 1, total - 1));
      if (e.key === "ArrowLeft" && page > 0) setPage((p) => p - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, isLast, total, result]);

  const wc = (id) => String(answers[id] || "").trim().split(/\s+/).filter(Boolean).length;
  const exerciseOf = (b) => lesson.exercises.find((e) => e.id === b.exerciseId);
  const hasExercises = lesson.exercises.length > 0;

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const d = await post(`/api/lessons/${lesson.id}/submit`, { answers });
      setResult(d);
      saveProgress(lesson.id, { page: 0, answers: {}, done: true });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const finishReadonly = () => {
    saveProgress(lesson.id, { page: 0, answers: {}, done: true });
    onSubmitted();
  };

  const retry = () => {
    setAnswers({});
    setResult(null);
    setError("");
    setPage(0);
  };

  const exResult = (e) => result?.grade?.answers.find((a) => a.exerciseId === e.id);
  const reveal = result?.revealAnswers; // 次数用尽后才揭示标准答案

  const renderExerciseInput = (e) => (
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
      </div>
      <div className="notice-body" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>{e.prompt}</div>
      {e.type === "choice" ? (
        e.options.map((o, oi) => (
          <label className="row-actions" key={oi} style={{ gap: 8, cursor: "pointer", marginBottom: 6 }}>
            <input
              type="radio"
              name={`q-${e.id}`}
              checked={answers[e.id] === String(oi)}
              onChange={() => setAnswers({ ...answers, [e.id]: String(oi) })}
            />
            {o}
          </label>
        ))
      ) : (
        <>
          <textarea
            style={{ minHeight: 80 }}
            value={answers[e.id] || ""}
            onChange={(ev) => setAnswers({ ...answers, [e.id]: ev.target.value })}
            placeholder="在这里写下你的句子/段落……"
          />
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            当前 {wc(e.id)} 词{e.minWords ? `（要求 ${e.minWords}${e.maxWords ? `-${e.maxWords}` : " 以上"} 词）` : ""}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card lesson-card-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 17 }}>{lesson.title}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>

        {result ? (
          <>
            <div className="ok-box">
              第 {result.attempt}{result.maxAttempts ? `/${result.maxAttempts}` : ""} 次作答已提交
              {result.grade.pendingReview
                ? "：客观题已自动判分，写作题待老师批改。"
                : `，本次得分 ${result.grade.totalScore}/${result.grade.maxScore}。`}
              {result.canRetry
                ? "客观题答错的题目可以先回头看看讲解，再试一次（标准答案会在次数用尽后揭示）。"
                : "作答次数已用完，标准答案已在下方揭示，成绩以本次为准。"}
            </div>
            {lesson.exercises.map((e) => {
              const r = exResult(e);
              return (
                <div className="notice-item" key={e.id}>
                  <div className="notice-head">
                    <b>{e.type === "choice" ? "选择题" : "填空题"}</b>
                    {r.auto != null ? (
                      <span className={r.correct ? "plan-badge member" : "plan-badge guest"}>
                        {r.correct ? `✓ 正确 +${e.points} 分` : reveal ? "✗ 错误 +0 分" : "✗ 还不对，再试一下"}
                      </span>
                    ) : (
                      <span className="plan-badge guest">老师批改中</span>
                    )}
                  </div>
                  <div className="notice-body" style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>{e.prompt}</div>
                  {e.type === "choice" ? (
                    <div className="notice-body">
                      你的选择：{e.options[Number(r?.answer)]}
                      {r.correct ? " ✓" : reveal ? `（正确答案：${e.options[e.answer]}）` : "（答案暂不揭示，再试一次）"}
                    </div>
                  ) : (
                    <>
                      <div className="essay-view">{r?.answer || "（未作答）"}</div>
                      {e.mode === "unique" && !r?.correct && reveal && (
                        <div className="notice-body" style={{ color: "var(--brand-ink)" }}>参考答案：{e.answers.join(" / ")}</div>
                      )}
                      {e.mode === "unique" && !r?.correct && !reveal && (
                        <div className="notice-body" style={{ color: "var(--ink-3)" }}>答案暂不揭示——对照讲解材料再试试看</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            <div className="row-actions">
              {result.canRetry && <button className="btn" onClick={retry}>再试一次{result.attemptsLeft != null ? `（还可 ${result.attemptsLeft} 次）` : ""}</button>}
              <button className="btn-ghost" onClick={onSubmitted}>完成</button>
            </div>
          </>
        ) : (
          <>
            {/* 进度条 */}
            <div className="lesson-progress">
              <div className="lesson-progress-bar" style={{ width: `${((page + 1) / total) * 100}%` }} />
            </div>
            <div className="lesson-card-meta">
              <span>第 {page + 1} / {total} 页</span>
              <span>{lesson.blocks[page].type === "md" ? "📖 讲解" : "✏️ 练习"}</span>
            </div>

            <div className="lesson-card-body">
              {lesson.blocks[page].type === "md" ? (
                <Markdown text={lesson.blocks[page].text} />
              ) : (
                renderExerciseInput(exerciseOf(lesson.blocks[page]))
              )}
              {isAdmin && <div className="course-meta" style={{ marginTop: 10 }}>（预览模式：不会提交、不计成绩）</div>}
            </div>

            {error && <div className="error-box">{error}</div>}

            <div className="lesson-card-nav">
              <button className="btn-ghost" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                ← 上一页
              </button>
              {isLast ? (
                isAdmin ? (
                  <button className="btn-ghost" onClick={onClose}>结束预览</button>
                ) : hasExercises ? (
                  <button className="btn" onClick={submit} disabled={saving}>
                    {saving ? "提交中…" : "提交作答"}
                  </button>
                ) : (
                  <button className="btn" onClick={finishReadonly}>完成学习 ✓</button>
                )
              ) : (
                <button className="btn" onClick={() => setPage(page + 1)}>下一页 →</button>
              )}
            </div>
            {!isAdmin && hasExercises && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                {lesson.maxAttempts
                  ? `本次为第 ${attemptsUsed + 1}/${lesson.maxAttempts} 次作答，以最后一次为准`
                  : `本次为第 ${attemptsUsed + 1} 次作答（不限次数），以最后一次为准`}
                ；进度与草稿已自动保存，答对或次数用尽前不揭示标准答案
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 老师：批改某份阅读 ----------
function LessonGrading({ lessonId, lessonTitle, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // 正在批改的 grade id

  const load = () =>
    get(`/api/lessons/${lessonId}/grades`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [lessonId]);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card review-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2>批改 · {lessonTitle}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
        {error && <div className="error-box">{error}</div>}
        {!data ? (
          <Loading text="加载作答记录…" />
        ) : data.grades.length === 0 ? (
          <p className="empty-hint">还没有学生作答。</p>
        ) : (
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
        )}
        {editing && <GradeDetail grade={data.grades.find((g) => g.id === editing)} lesson={data.lesson} onSaved={() => { setEditing(null); load(); }} />}
      </div>
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

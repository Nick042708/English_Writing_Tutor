import React, { useEffect, useState } from "react";
import { get, post, del } from "../api.js";
import { Loading } from "./shared.jsx";

const fmt = (ts) =>
  ts ? new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// ---------- 在线阅读与练习 ----------
// 管理员：发布阅读文档 + 内嵌练习题（选择题 / 填空题：唯一答案自动判分，灵活写作题人工批改），可设作答次数
// 学生：阅读学习 → 作答练习（次数内可重试，以最后一次为准）→ 查看得分；答对或次数用尽前不揭示标准答案
export default function LessonsSection({ course, lessons, isAdmin, myLessonGrades, onChanged }) {
  const [creating, setCreating] = useState(false);
  const [answering, setAnswering] = useState(null); // 学生作答的阅读
  const [gradingLesson, setGradingLesson] = useState(null); // 老师批改的阅读

  const myAttempts = (lessonId) =>
    (myLessonGrades || [])
      .filter((g) => g.lessonId === lessonId)
      .sort((a, b) => (b.attempt || 1) - (a.attempt || 1));
  const myGrade = (lessonId) => myAttempts(lessonId)[0];

  return (
    <div className="card">
      <h2><span className="dot" />在线阅读与练习</h2>
      {isAdmin && (
        <button className="btn" onClick={() => setCreating(!creating)}>
          {creating ? "收起编辑器" : "发布新阅读"}
        </button>
      )}
      {creating && isAdmin && (
        <LessonEditor courseId={course.id} onDone={() => { setCreating(false); onChanged(); }} />
      )}
      {error_box(creating)}
      {lessons.length === 0 ? (
        <p className="empty-hint">
          {isAdmin ? "还没有发布阅读内容。发布一篇知识讲解并配上即时反馈练习题吧。" : "老师还没有发布阅读内容。"}
        </p>
      ) : (
        lessons.map((l) => {
          const attempts = myAttempts(l.id);
          const g = attempts[0];
          const canRetry = !l.maxAttempts || attempts.length < l.maxAttempts;
          return (
            <div className="notice-item" key={l.id}>
              <div className="notice-head">
                <b>{l.title}</b>
                <span className="count-badge">{l.exercises.length} 道练习</span>
                <span className="count-badge">{l.exercises.reduce((s, e) => s + e.points, 0)} 分</span>
                <span className="count-badge">{l.maxAttempts ? `限 ${l.maxAttempts} 次作答` : "不限作答次数"}</span>
                {isAdmin ? (
                  <>
                    <button className="btn-ghost" onClick={() => setGradingLesson(l)}>查看作答与批改</button>
                    <button
                      className="btn-ghost danger"
                      onClick={async () => {
                        if (!confirm(`确定删除阅读「${l.title}」？`)) return;
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
                    {canRetry && <button className="btn-ghost" onClick={() => setAnswering(l)}>再次作答</button>}
                  </>
                ) : (
                  <button className="btn" onClick={() => setAnswering(l)}>开始作答</button>
                )}
              </div>
              <div className="notice-body lesson-content">{l.content}</div>
            </div>
          );
        })
      )}
      {answering && (
        <LessonAnswer
          lesson={answering}
          attemptsUsed={myAttempts(answering.id).length}
          onClose={() => setAnswering(null)}
          onSubmitted={() => { setAnswering(null); onChanged(); }}
        />
      )}
      {gradingLesson && (
        <LessonGrading
          lessonId={gradingLesson.id}
          lessonTitle={gradingLesson.title}
          onClose={() => setGradingLesson(null)}
        />
      )}
    </div>
  );
}

// 占位：错误提示由子组件各自管理
function error_box() {
  return null;
}

// ---------- 管理员：阅读编辑器 ----------
function LessonEditor({ courseId, onDone }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [exercises, setExercises] = useState([]);
  const [maxAttempts, setMaxAttempts] = useState(""); // 空 = 不限
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addChoice = () => setExercises([...exercises, { type: "choice", prompt: "", options: ["", ""], answer: 0, points: 2 }]);
  const addBlank = () => setExercises([...exercises, { type: "blank", mode: "unique", prompt: "", answersText: "", minWords: "", maxWords: "", points: 2 }]);

  const patch = (i, kv) => setExercises(exercises.map((e, idx) => (idx === i ? { ...e, ...kv } : e)));
  const remove = (i) => setExercises(exercises.filter((_, idx) => idx !== i));

  const publish = async () => {
    setError("");
    setSaving(true);
    try {
      await post(`/api/courses/${courseId}/lessons`, {
        title: title.trim(),
        content: content.trim(),
        maxAttempts: maxAttempts || undefined,
        exercises: exercises.map((e) =>
          e.type === "choice"
            ? { type: "choice", prompt: e.prompt, options: e.options, answer: Number(e.answer), points: Number(e.points) }
            : {
                type: "blank",
                mode: e.mode,
                prompt: e.prompt,
                answers: (e.answersText || "").split("\n").map((s) => s.trim()).filter(Boolean),
                minWords: e.minWords || undefined,
                maxWords: e.maxWords || undefined,
                points: Number(e.points),
              }
        ),
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="阅读标题，例如：议论文开头段的三种写法" />
      <textarea
        className="lesson-editor"
        style={{ minHeight: 140 }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="阅读正文：写知识点讲解、范文示例、技巧总结……学生提交练习前会先阅读这里的内容。"
      />

      <div className="field-label" style={{ marginTop: 14 }}>练习题（作答后即时反馈，计入课程成绩）</div>
      <div className="row-actions" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>作答次数：</span>
        <select value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)}>
          <option value="">不限次数</option>
          <option value="1">限 1 次</option>
          <option value="2">限 2 次</option>
          <option value="3">限 3 次</option>
          <option value="5">限 5 次</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          以最后一次为准；有标准答案的题目在答对或次数用尽前不揭示答案，鼓励学生反复尝试
        </span>
      </div>
      {exercises.map((e, i) => (
        <div className="notice-item" key={i}>
          <div className="notice-head">
            <b>{e.type === "choice" ? "选择题" : e.mode === "unique" ? "填空题（唯一答案，自动判分）" : "写作填空（灵活判分，老师批改）"}</b>
            <span className="row-actions">
              分值
              <input
                type="number"
                min="1"
                max="100"
                style={{ width: 60 }}
                value={e.points}
                onChange={(ev) => patch(i, { points: ev.target.value })}
              />
            </span>
            <button className="btn-ghost danger" onClick={() => remove(i)}>移除本题</button>
          </div>
          <input value={e.prompt} onChange={(ev) => patch(i, { prompt: ev.target.value })} placeholder="题干：例如 Choose the best linking word: ____ the exam was hard, she passed." />

          {e.type === "choice" ? (
            <>
              {e.options.map((o, oi) => (
                <div className="row-actions" key={oi} style={{ marginBottom: 6 }}>
                  <label className="row-actions" style={{ gap: 4, cursor: "pointer" }}>
                    <input type="radio" name={`ans-${i}`} checked={Number(e.answer) === oi} onChange={() => patch(i, { answer: oi })} />
                    <b style={{ fontSize: 12 }}>正确</b>
                  </label>
                  <input
                    style={{ flex: 1 }}
                    value={o}
                    onChange={(ev) => {
                      const options = [...e.options];
                      options[oi] = ev.target.value;
                      patch(i, { options });
                    }}
                    placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
                  />
                  {e.options.length > 2 && (
                    <button className="btn-ghost danger" onClick={() => patch(i, { options: e.options.filter((_, x) => x !== oi), answer: 0 })}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {e.options.length < 6 && <button className="btn-ghost" onClick={() => patch(i, { options: [...e.options, ""] })}>+ 加一个选项</button>}
            </>
          ) : (
            <>
              <div className="row-actions" style={{ marginBottom: 8 }}>
                <select value={e.mode} onChange={(ev) => patch(i, { mode: ev.target.value })}>
                  <option value="unique">唯一答案（自动判分）</option>
                  <option value="flexible">灵活写作（老师批改）</option>
                </select>
                <span className="row-actions">
                  词数
                  <input type="number" min="10" style={{ width: 64 }} value={e.minWords} onChange={(ev) => patch(i, { minWords: ev.target.value })} placeholder="最低" />
                  ~
                  <input type="number" style={{ width: 64 }} value={e.maxWords} onChange={(ev) => patch(i, { maxWords: ev.target.value })} placeholder="最高" />
                </span>
              </div>
              {e.mode === "unique" && (
                <textarea
                  style={{ minHeight: 60 }}
                  value={e.answersText}
                  onChange={(ev) => patch(i, { answersText: ev.target.value })}
                  placeholder={"可接受的答案，每行一个（忽略大小写与标点差异）。例如：\nAlthough he was tired, he finished the report\nEven though he was tired, he finished the report"}
                />
              )}
              {e.mode === "flexible" && (
                <p className="empty-hint" style={{ margin: 0 }}>
                  学生需写 {e.minWords || 10}-{e.maxWords || 50} 词左右的句子/段落，提交后由你在「查看作答与批改」里逐题打分。
                </p>
              )}
            </>
          )}
        </div>
      ))}

      <div className="row-actions" style={{ marginTop: 8 }}>
        <button className="btn-ghost" onClick={addChoice}>+ 选择题</button>
        <button className="btn-ghost" onClick={addBlank}>+ 填空题</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn" style={{ marginTop: 10 }} onClick={publish} disabled={saving}>
        {saving ? "发布中…" : "发布阅读与练习"}
      </button>
    </div>
  );
}

// ---------- 学生：作答 ----------
function LessonAnswer({ lesson, attemptsUsed = 0, onClose, onSubmitted }) {
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { grade, canRetry, revealAnswers, attemptsLeft, ... }

  const wc = (id) => String(answers[id] || "").trim().split(/\s+/).filter(Boolean).length;

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const d = await post(`/api/lessons/${lesson.id}/submit`, { answers });
      setResult(d);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const retry = () => {
    setAnswers({});
    setResult(null);
    setError("");
  };

  const exResult = (e) => result?.grade?.answers.find((a) => a.exerciseId === e.id);
  const reveal = result?.revealAnswers; // 次数用尽后才揭示标准答案

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card review-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-head">
          <h2>{lesson.title}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>

        <div className="lesson-content" style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, marginBottom: 16 }}>
          {lesson.content}
        </div>

        {result ? (
          <>
            <div className="ok-box">
              第 {result.attempt}{result.maxAttempts ? `/${result.maxAttempts}` : ""} 次作答已提交
              {result.grade.pendingReview
                ? "：客观题已自动判分，写作题待老师批改。"
                : `，本次得分 ${result.grade.totalScore}/${result.grade.maxScore}。`}
              {result.canRetry
                ? "客观题答错的题目可以先回头看看阅读材料，再试一次（标准答案会在次数用尽后揭示）。"
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
                  <div className="notice-body" style={{ marginBottom: 6 }}>{e.prompt}</div>
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
                        <div className="notice-body" style={{ color: "var(--ink-3)" }}>答案暂不揭示——对照阅读材料再试试看</div>
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
            {lesson.exercises.map((e) => (
              <div className="notice-item" key={e.id}>
                <div className="notice-head">
                  <b>{e.type === "choice" ? "选择题" : "填空题"}</b>
                  <span className="count-badge">{e.points} 分</span>
                  {e.type === "blank" && <span className="course-meta">{e.mode === "unique" ? "有唯一答案" : "灵活写作 · 老师批改"}{e.minWords ? ` · ${e.minWords}${e.maxWords ? `-${e.maxWords}` : "+"} 词` : ""}</span>}
                </div>
                <div className="notice-body" style={{ marginBottom: 8 }}>{e.prompt}</div>
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
              </div>
            ))}
            {error && <div className="error-box">{error}</div>}
            <div className="row-actions">
              <button className="btn" onClick={submit} disabled={saving}>{saving ? "提交中…" : "提交作答"}</button>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {lesson.maxAttempts
                  ? `本次为第 ${attemptsUsed + 1}/${lesson.maxAttempts} 次作答，以最后一次为准`
                  : `本次为第 ${attemptsUsed + 1} 次作答（不限次数），以最后一次为准`}
                ；答对或次数用尽前不揭示标准答案
              </span>
            </div>
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

  useEffect(() => {
    get(`/api/lessons/${lessonId}/grades`)
      .then(setData)
      .catch((e) => setError(e.message));
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
        {editing && <GradeDetail grade={data.grades.find((g) => g.id === editing)} lesson={data.lesson} onSaved={() => { setEditing(null); get(`/api/lessons/${lessonId}/grades`).then(setData); }} />}
      </div>
    </div>
  );
}

function GradeDetail({ grade, lesson, onSaved }) {
  const [scores, setScores] = useState(() => {
    const init = {};
    (grade.adminReview?.scores || []).length; // no-op
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

  const flexible = lesson.exercises.filter((e) => e.type === "blank" && e.mode === "flexible");
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
            <div className="notice-body" style={{ marginBottom: 6 }}>{e.prompt}</div>
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

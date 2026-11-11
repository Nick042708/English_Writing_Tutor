import React, { useEffect, useState } from "react";
import { get, post, del } from "../api.js";
import { Loading } from "./shared.jsx";
import FeedbackResult from "./FeedbackResult.jsx";
import { EXAMS, PRACTICAL, CEFR_LEVELS, CHALLENGES } from "../examOptions.js";

const fmt = (ts) =>
  ts ? new Date(ts).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const targetLabel = (mode, target) =>
  mode === "practical"
    ? PRACTICAL.find((p) => p.id === target)?.label || target
    : EXAMS.find((e) => e.id === target)?.label || target;

// ---------- 课程列表页 ----------
export default function CoursesPage({ user }) {
  const [courses, setCourses] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  // 建课表单（管理员）
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () =>
    get("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const createCourse = async () => {
    if (!name.trim() || !startAt || !endAt) {
      setError("请完整填写课程名称、开始与结束时间");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await post("/api/courses", { name: name.trim(), startAt, endAt });
      setName("");
      setStartAt("");
      setEndAt("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (openId) {
    return <CourseDetail courseId={openId} user={user} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <>
      {user.role === "admin" && (
        <div className="card">
          <h2><span className="dot" />创建新课程</h2>
          <div className="field-label">课程名称</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：高二（3）班英语写作提升课" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="field-label">开始时间</div>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="field-label">结束时间</div>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={createCourse} disabled={creating}>
            {creating ? "创建中…" : "创建课程"}
          </button>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h2><span className="dot" />{user.role === "admin" ? "全部课程" : "我的课程"}</h2>
        {!courses ? (
          <Loading text="加载中…" />
        ) : courses.length === 0 ? (
          <p className="empty-hint">
            {user.role === "admin" ? "还没有课程，用上方表单创建第一门课吧。" : "你还没有加入任何课程，请联系老师把你拉进课程。"}
          </p>
        ) : (
          <div className="course-list">
            {courses.map((c) => (
              <button key={c.id} className="course-row" onClick={() => setOpenId(c.id)}>
                <div>
                  <div className="course-name">{c.name}</div>
                  <div className="course-meta">
                    {fmt(c.startAt)} — {fmt(c.endAt)} · 授课 {c.teacher}
                  </div>
                </div>
                <div className="course-stats">
                  {user.role === "admin" && <span className="count-badge">{c.memberCount} 名学员</span>}
                  <span className="count-badge">{c.assignmentCount} 份作业</span>
                  <span className="count-badge">{c.noticeCount} 条通知</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- 课程详情 ----------
function CourseDetail({ courseId, user, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    get(`/api/courses/${courseId}`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [courseId]);

  if (error) return <div className="error-box">{error} <button className="btn-ghost" onClick={onBack}>返回</button></div>;
  if (!data) return <Loading text="加载课程中…" />;

  const { course, notices, assignments, members, submissions, mySubmissions } = data;
  const isAdmin = user.role === "admin";

  return (
    <>
      <div className="card">
        <button className="btn-ghost" onClick={onBack}>← 返回课程列表</button>
        <h2 style={{ marginTop: 10 }}><span className="dot" />{course.name}</h2>
        <div className="course-meta">
          {fmt(course.startAt)} — {fmt(course.endAt)} · 授课 {course.teacher}
          {isAdmin && ` · ${course.memberCount} 名学员`}
        </div>
      </div>

      <NoticesSection course={course} notices={notices} isAdmin={isAdmin} onChanged={load} />
      <AssignmentsSection
        course={course}
        assignments={assignments}
        isAdmin={isAdmin}
        mySubmissions={mySubmissions}
        onChanged={load}
      />
      {isAdmin && <MembersSection course={course} members={members} onChanged={load} />}
      {isAdmin && <ReviewSection assignments={assignments} submissions={submissions} />}
    </>
  );
}

// ---------- 通知 ----------
function NoticesSection({ course, notices, isAdmin, onChanged }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const publish = async () => {
    setError("");
    try {
      await post(`/api/courses/${course.id}/notices`, { title, content });
      setTitle("");
      setContent("");
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card">
      <h2><span className="dot" />课程通知</h2>
      {isAdmin && (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="通知标题" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="通知内容…" />
          <button className="btn" onClick={publish}>发布通知</button>
        </>
      )}
      {error && <div className="error-box">{error}</div>}
      {notices.length === 0 ? (
        <p className="empty-hint">暂无通知。</p>
      ) : (
        notices.map((n) => (
          <div className="notice-item" key={n.id}>
            <div className="notice-head">
              <b>{n.title}</b>
              <span className="course-meta">{fmt(n.createdAt)}</span>
              {isAdmin && (
                <button
                  className="btn-ghost danger"
                  onClick={async () => {
                    await del(`/api/courses/${course.id}/notices/${n.id}`);
                    onChanged();
                  }}
                >
                  删除
                </button>
              )}
            </div>
            <div className="notice-body">{n.content}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------- 作业 ----------
function AssignmentsSection({ course, assignments, isAdmin, mySubmissions, onChanged }) {
  const [title, setTitle] = useState("");
  const [task, setTask] = useState("");
  const [mode, setMode] = useState("exam");
  const [target, setTarget] = useState("cet4");
  const [cefr, setCefr] = useState("B1");
  const [challenge, setChallenge] = useState("match");
  const [error, setError] = useState("");

  const publish = async () => {
    setError("");
    try {
      await post(`/api/courses/${course.id}/assignments`, { title, task, mode, target, cefr, challenge });
      setTitle("");
      setTask("");
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card">
      <h2><span className="dot" />课程作业</h2>
      {isAdmin && (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="作业标题，例如：第一次议论文写作" />
          <textarea value={task} onChange={(e) => setTask(e.target.value)} placeholder="作文任务（题目原文与要求），学生提交时会锁定为此任务" />
          <div className="field-label">作文类型与难度（布置后锁定，学生不可修改）</div>
          <div className="row-actions" style={{ marginBottom: 8 }}>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="exam">备考</option>
              <option value="practical">实用</option>
            </select>
            {mode === "exam" ? (
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {EXAMS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            ) : (
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {PRACTICAL.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            )}
            {mode === "practical" && (
              <select value={cefr} onChange={(e) => setCefr(e.target.value)}>
                {CEFR_LEVELS.map((l) => <option key={l} value={l}>CEFR {l}</option>)}
              </select>
            )}
            <select value={challenge} onChange={(e) => setChallenge(e.target.value)}>
              {CHALLENGES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <button className="btn" onClick={publish}>发布作业</button>
        </>
      )}
      {error && <div className="error-box">{error}</div>}

      {assignments.length === 0 ? (
        <p className="empty-hint">暂无作业。</p>
      ) : (
        assignments.map((a) => {
          const mine = mySubmissions?.find((s) => s.assignmentId === a.id);
          return (
            <div className="notice-item" key={a.id}>
              <div className="notice-head">
                <b>{a.title}</b>
                <span className="count-badge">{targetLabel(a.mode, a.target)} · {a.challenge === "sprint" ? "冲刺" : a.challenge === "stretch" ? "拔高" : "匹配水平"}</span>
                {isAdmin ? (
                  <>
                    <span className="course-meta">已提交 {a.submissionCount} 份</span>
                    <button
                      className="btn-ghost danger"
                      onClick={async () => {
                        if (!confirm("确定删除该作业？")) return;
                        try {
                          await del(`/api/courses/${course.id}/assignments/${a.id}`);
                          onChanged();
                        } catch (e) {
                          alert(e.message);
                        }
                      }}
                    >
                      删除
                    </button>
                  </>
                ) : mine ? (
                  <span className="plan-badge member">
                    已提交{mine.status === "reviewed" ? ` · 老师复核：${mine.reviewScore}` : " · 待老师复核"}
                  </span>
                ) : (
                  <span className="plan-badge guest">未提交 · 请到「写作批改」页选择作业模式提交</span>
                )}
              </div>
              <div className="notice-body">{a.task}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------- 学员管理（管理员） ----------
function MembersSection({ course, members, onChanged }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    try {
      await post(`/api/courses/${course.id}/members`, { username: username.trim() });
      setUsername("");
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card">
      <h2><span className="dot" />课程学员</h2>
      <div className="row-actions">
        <input
          style={{ maxWidth: 240 }}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="输入学员的用户名拉入课程"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn" onClick={add}>添加学员</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!members || members.length === 0 ? (
        <p className="empty-hint">还没有学员，用上方输入框按用户名添加。</p>
      ) : (
        <div className="table-wrap">
          <table className="user-table">
            <thead>
              <tr><th>用户名</th><th>姓名</th><th>学校</th><th>操作</th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.username}</td>
                  <td>{m.realName || "未填写"}</td>
                  <td>{m.school || "未填写"}</td>
                  <td>
                    <button
                      className="btn-ghost danger"
                      onClick={async () => {
                        if (!confirm(`将 ${m.username} 移出课程？`)) return;
                        await del(`/api/courses/${course.id}/members/${m.id}`);
                        onChanged();
                      }}
                    >
                      移出
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- 评分复核（管理员） ----------
function ReviewSection({ assignments, submissions }) {
  const [openAsg, setOpenAsg] = useState(null);
  const [detail, setDetail] = useState(null); // 展开的提交详情（含 AI 批改全文）

  const withSubs = assignments.filter((a) => submissions.some((s) => s.assignmentId === a.id));

  if (withSubs.length === 0) {
    return (
      <div className="card">
        <h2><span className="dot" />作业批改复核</h2>
        <p className="empty-hint">还没有学生提交作业。</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2><span className="dot" />作业批改复核</h2>
      {withSubs.map((a) => {
        const subs = submissions.filter((s) => s.assignmentId === a.id);
        const open = openAsg === a.id;
        return (
          <div className="notice-item" key={a.id}>
            <div className="notice-head">
              <b>{a.title}</b>
              <span className="count-badge">{subs.length} 份提交</span>
              <button className="btn-ghost" onClick={() => setOpenAsg(open ? null : a.id)}>
                {open ? "收起" : "展开提交列表"}
              </button>
            </div>
            {open && (
              <div className="table-wrap">
                <table className="user-table">
                  <thead>
                    <tr><th>学员</th><th>提交时间</th><th>AI 评分</th><th>复核状态</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id}>
                        <td>{s.realName ? `${s.realName}（${s.username}）` : s.username}</td>
                        <td>{fmt(s.submittedAt)}</td>
                        <td>{s.aiScore ?? "—"}</td>
                        <td>
                          {s.status === "reviewed" ? (
                            <span className="plan-badge member">已复核：{s.reviewScore}</span>
                          ) : (
                            <span className="plan-badge guest">待复核</span>
                          )}
                        </td>
                        <td>
                          <button className="btn-ghost" onClick={() => setDetail(detail?.id === s.id ? null : s.id)}>
                            查看与复核
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {detail && <SubmissionReview submissionId={detail.id} onClose={() => setDetail(null)} />}
    </div>
  );
}

function SubmissionReview({ submissionId, onClose }) {
  const [sub, setSub] = useState(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get(`/api/submissions/${submissionId}`)
      .then((d) => {
        setSub(d.submission);
        if (d.submission.adminReview) {
          setScore(d.submission.adminReview.score);
          setComment(d.submission.adminReview.comment || "");
        }
      })
      .catch((e) => setError(e.message));
  }, [submissionId]);

  const saveReview = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await post(`/api/submissions/${submissionId}/review`, { score, comment });
      setSub((prev) => ({ ...prev, ...d.submission }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !sub) return <div className="error-box">{error}</div>;
  if (!sub) return <Loading text="加载提交详情…" />;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>批改复核 · {sub.username}</h2>
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="account-summary">
          <div className="sum-row"><span>作文任务</span><b>{sub.task}</b></div>
          <div className="sum-row"><span>AI 评分</span><b>{sub.aiResult?.score ?? "—"}</b></div>
          <div className="sum-row"><span>复核状态</span><b>{sub.status === "reviewed" ? `已复核：${sub.adminReview?.score}` : "待复核"}</b></div>
        </div>
        <div className="field-label">学生作文</div>
        <div className="essay-view">{sub.essay}</div>
        {error && <div className="error-box">{error}</div>}
        <div className="field-label">复核分数 / 等级</div>
        <input value={score} onChange={(e) => setScore(e.target.value)} placeholder="例如：7 分 / B+ / 良好" />
        <div className="field-label">复核意见</div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="给这位同学的评语…" />
        <button className="btn" onClick={saveReview} disabled={saving}>
          {saving ? "保存中…" : "保存复核结果"}
        </button>
        {sub.aiResult && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", color: "var(--brand-ink)" }}>展开 AI 批改全文</summary>
            <FeedbackResult result={sub.aiResult} profile={sub.profile} task={sub.task} essay={sub.essay} />
          </details>
        )}
      </div>
    </div>
  );
}

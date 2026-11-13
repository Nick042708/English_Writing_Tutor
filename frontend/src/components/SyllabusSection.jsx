import React, { useState } from "react";
import { put } from "../api.js";
import Markdown from "./Markdown.jsx";

const fmt = (ts) =>
  ts ? new Date(ts).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const KIND_LABEL = { assignment: "作业作文", lesson: "在线学习", exam: "考试" };

// ---------- Syllabus（教学大纲） ----------
// 管理员：设置三类成绩占比、各类别内任务权重（可后期再调，前期默认平均）、
//          补交/补学规定、参考阅读与参考用书、课程说明；随时可修改
// 学生：只读查看
export default function SyllabusSection({ course, syllabus, assignments, lessons, isAdmin, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFrom(syllabus));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const weightSum = form.weights.assignment + form.weights.lesson + form.weights.exam;

  const patch = (kv) => setForm({ ...form, ...kv });
  const patchWeights = (kv) => patch({ weights: { ...form.weights, ...kv } });
  const patchPolicies = (kv) => patch({ policies: { ...form.policies, ...kv } });
  const taskWeight = (id) => form.taskWeights[id] ?? "";
  const setTaskWeight = (id, v) =>
    patch({ taskWeights: { ...form.taskWeights, [id]: v } });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      // 任务权重：空值剔除（= 默认平均）
      const taskWeights = {};
      for (const [k, v] of Object.entries(form.taskWeights)) {
        const n = Number(v);
        if (v !== "" && Number.isFinite(n) && n > 0) taskWeights[k] = n;
      }
      await put(`/api/courses/${course.id}/syllabus`, {
        syllabus: { ...form, taskWeights },
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return <SyllabusView syllabus={syllabus} course={course} />;
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="notice-head">
          <h2 style={{ margin: 0 }}><span className="dot" />教学大纲（Syllabus）</h2>
          <button className="btn" onClick={() => { setForm(formFrom(syllabus)); setEditing(true); }}>
            {syllabus ? "修改大纲" : "设置大纲"}
          </button>
        </div>
        <SyllabusView syllabus={syllabus} course={course} />
      </div>
    );
  }

  return (
    <div className="card">
      <h2><span className="dot" />编辑教学大纲</h2>

      <div className="field-label">成绩分配（三类合计须为 100%，当前 {Math.round(weightSum * 10) / 10}%）</div>
      <div className="row-actions" style={{ marginBottom: 6 }}>
        {["assignment", "lesson", "exam"].map((k) => (
          <span className="row-actions" key={k} style={{ gap: 4 }}>
            {KIND_LABEL[k]}
            <input
              type="number"
              min="0"
              max="100"
              style={{ width: 70 }}
              value={form.weights[k]}
              onChange={(e) => patchWeights({ [k]: Number(e.target.value) })}
            />
            %
          </span>
        ))}
      </div>
      <p className="empty-hint" style={{ margin: "0 0 10px" }}>
        考试系统尚未上线：发布考试前，加权总评只在「作业 / 在线学习」之间按比例折算，考试占比自动保留。
      </p>

      <div className="field-label">作文满分（用于把作文分数折算成百分比；雅思可填 9，百分制填 100）</div>
      <input type="number" min="1" style={{ maxWidth: 140 }} value={form.essayFullMark} onChange={(e) => patch({ essayFullMark: Number(e.target.value) })} />

      {assignments.length > 0 && (
        <>
          <div className="field-label">每次作业在「作业」中的权重（留空 = 平均；可等作业都布置完后再调）</div>
          {assignments.map((a) => (
            <div className="row-actions" key={a.id} style={{ marginBottom: 4 }}>
              <span style={{ minWidth: 180, fontSize: 13 }}>{a.title}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                style={{ width: 80 }}
                placeholder="默认 1"
                value={taskWeight(a.id)}
                onChange={(e) => setTaskWeight(a.id, e.target.value)}
              />
            </div>
          ))}
        </>
      )}

      {lessons.length > 0 && (
        <>
          <div className="field-label">每个学习任务在「在线学习」中的权重（留空 = 平均）</div>
          {lessons.map((l) => (
            <div className="row-actions" key={l.id} style={{ marginBottom: 4 }}>
              <span style={{ minWidth: 180, fontSize: 13 }}>{l.title}</span>
              <input
                type="number"
                min="0"
                step="0.5"
                style={{ width: 80 }}
                placeholder="默认 1"
                value={taskWeight(l.id)}
                onChange={(e) => setTaskWeight(l.id, e.target.value)}
              />
            </div>
          ))}
        </>
      )}

      <div className="field-label" style={{ marginTop: 12 }}>基本规定</div>
      <label className="row-actions" style={{ gap: 6, cursor: "pointer", marginBottom: 4 }}>
        <input type="checkbox" checked={form.policies.lateAssignment} onChange={(e) => patchPolicies({ lateAssignment: e.target.checked })} />
        允许逾期补交作业（截止后仍可提交，会标记「补交」）
      </label>
      <label className="row-actions" style={{ gap: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={form.policies.lateLesson} onChange={(e) => patchPolicies({ lateLesson: e.target.checked })} />
        允许逾期补学在线学习任务
      </label>

      <div className="field-label" style={{ marginTop: 12 }}>参考阅读与参考用书</div>
      {form.readings.map((r, i) => (
        <div className="row-actions" key={i} style={{ marginBottom: 6 }}>
          <input
            style={{ maxWidth: 220 }}
            value={r.title}
            onChange={(e) => {
              const readings = [...form.readings];
              readings[i] = { ...readings[i], title: e.target.value };
              patch({ readings });
            }}
            placeholder="书名 / 篇目"
          />
          <input
            style={{ flex: 1 }}
            value={r.detail}
            onChange={(e) => {
              const readings = [...form.readings];
              readings[i] = { ...readings[i], detail: e.target.value };
              patch({ readings });
            }}
            placeholder="作者 / 版本 / 链接或说明（可选）"
          />
          <button className="btn-ghost danger" onClick={() => patch({ readings: form.readings.filter((_, x) => x !== i) })}>移除</button>
        </div>
      ))}
      <button className="btn-ghost" onClick={() => patch({ readings: [...form.readings, { title: "", detail: "" }] })}>+ 添加参考阅读 / 用书</button>

      <div className="field-label" style={{ marginTop: 12 }}>课程说明（支持 Markdown，会展示给学生）</div>
      <textarea
        style={{ minHeight: 80 }}
        value={form.description}
        onChange={(e) => patch({ description: e.target.value })}
        placeholder="课程目标、考核方式说明、纪律要求……"
      />

      {error && <div className="error-box">{error}</div>}
      <div className="row-actions" style={{ marginTop: 10 }}>
        <button className="btn" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存大纲"}</button>
        <button className="btn-ghost" onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>
  );
}

function formFrom(syllabus) {
  const s = syllabus || {};
  return {
    weights: { assignment: 40, lesson: 30, exam: 30, ...(s.weights || {}) },
    essayFullMark: s.essayFullMark ?? 100,
    taskWeights: s.taskWeights || {},
    policies: { lateAssignment: true, lateLesson: true, ...(s.policies || {}) },
    readings: (s.readings || []).map((r) => ({ title: r.title || "", detail: r.detail || "" })),
    description: s.description || "",
  };
}

function SyllabusView({ syllabus, course }) {
  if (!syllabus) {
    return (
      <p className="empty-hint">
        还未设置教学大纲。默认按 作业 40% / 在线学习 30% / 考试 30% 计算加权总评（各类别内任务平均权重），老师可随时设置并调整。
      </p>
    );
  }
  const w = syllabus.weights || {};
  return (
    <div>
      <div className="row-actions" style={{ margin: "6px 0" }}>
        {["assignment", "lesson", "exam"].map((k) =>
          (w[k] ?? 0) > 0 ? (
            <span className="count-badge" key={k}>{KIND_LABEL[k]} {w[k]}%</span>
          ) : null
        )}
        <span className="count-badge">作文满分 {syllabus.essayFullMark}</span>
        <span className="count-badge">{syllabus.policies?.lateAssignment === false ? "不允许补交" : "允许补交"}</span>
        <span className="count-badge">{syllabus.policies?.lateLesson === false ? "不允许补学" : "允许补学"}</span>
      </div>
      {syllabus.readings?.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 8 }}>参考阅读与参考用书</div>
          <ul style={{ margin: "4px 0", paddingLeft: 20, fontSize: 13.5 }}>
            {syllabus.readings.map((r, i) => (
              <li key={i}>
                <b>{r.title}</b>
                {r.detail && <span style={{ color: "var(--ink-3)" }}> — {r.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {syllabus.description && (
        <>
          <div className="field-label" style={{ marginTop: 8 }}>课程说明</div>
          <Markdown text={syllabus.description} className="syllabus-desc" />
        </>
      )}
      <div className="course-meta" style={{ marginTop: 8 }}>最近更新：{fmt(syllabus.updatedAt)}</div>
    </div>
  );
}

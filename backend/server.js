import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeProfile } from "./profile.js";
import { materialsPrompt, feedbackPrompt } from "./prompts.js";
import { chatJSON, hasAPIKey } from "./llm.js";
import { mockMaterials, mockFeedback } from "./mock.js";
import { db, save, initDb, cloudDbEnabled, dbStatus, hash, newId, newToken } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- 认证 ----------

function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const session = db.sessions.find((s) => s.token === token);
  const user = session && db.users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: "请先登录" });
  req.user = user;
  next();
}

function adminRequired(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  next();
}

// ---------- 会员与配额 ----------

const DAILY_GUEST_LIMIT = 5;

// 日期按东八区计算（服务器可能部署在任意时区）
const todayStr = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// 会员是否有效（管理员视为永久会员，不限次数）
function membershipActive(u) {
  return u.role === "admin" || (u.membership?.plan === "member" && (!u.membership.expiresAt || u.membership.expiresAt > Date.now()));
}

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  realName: u.realName || "",
  school: u.school || "",
  plan: membershipActive(u) ? "member" : "guest",
  memberUntil: u.membership?.expiresAt || null,
  usedToday: u.usage?.date === todayStr() ? u.usage.count : 0,
  dailyLimit: membershipActive(u) ? null : DAILY_GUEST_LIMIT,
});

// 游客每日限额校验：超限返回 429，否则记录本次使用
function quotaRequired(req, res, next) {
  const u = req.user;
  if (membershipActive(u)) return next();
  const t = todayStr();
  if (!u.usage || u.usage.date !== t) u.usage = { date: t, count: 0 };
  if (u.usage.count >= DAILY_GUEST_LIMIT) {
    return res.status(429).json({
      error: `今日免费额度已用完（每天 ${DAILY_GUEST_LIMIT} 次）。联系管理员开通会员后可不限次数使用。`,
      quotaExceeded: true,
    });
  }
  next(); // 只做检查；额度在成功调用 AI 之后由 consumeQuota 计入（被拒的提交不消耗额度）
}

// 成功消耗一次额度（在 AI 生成完成后调用）
function consumeQuota(u) {
  if (membershipActive(u)) return;
  const t = todayStr();
  if (!u.usage || u.usage.date !== t) u.usage = { date: t, count: 0 };
  u.usage.count++;
  save();
}

app.post("/api/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const realName = String(req.body.realName || "").trim();
  const school = String(req.body.school || "").trim();
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: "用户名需要 2-20 个字符" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }
  if (!realName) return res.status(400).json({ error: "请填写真实姓名" });
  if (!school) return res.status(400).json({ error: "请填写学校" });
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ error: "用户名已被占用" });
  }
  // 第一个注册的用户自动成为管理员，之后注册的都是学生（默认游客：每天 5 次）
  const user = {
    id: newId(),
    username,
    passwordHash: hash(password),
    role: db.users.length === 0 ? "admin" : "student",
    realName,
    school,
    membership: { plan: "guest", expiresAt: null },
    usage: { date: todayStr(), count: 0 },
    createdAt: Date.now(),
  };
  db.users.push(user);
  const token = newToken();
  db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
  save();
  res.json({ token, user: publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.users.find((u) => u.username === username);
  if (!user || user.passwordHash !== hash(password)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  const token = newToken();
  db.sessions.push({ token, userId: user.id, createdAt: Date.now() });
  save();
  res.json({ token, user: publicUser(user) });
});

app.post("/api/logout", authRequired, (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  db.sessions = db.sessions.filter((s) => s.token !== token);
  save();
  res.json({ ok: true });
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// 账号设置：补充或修改真实姓名、学校
app.post("/api/profile", authRequired, (req, res) => {
  const realName = String(req.body.realName || "").trim();
  const school = String(req.body.school || "").trim();
  if (!realName) return res.status(400).json({ error: "真实姓名不能为空" });
  if (!school) return res.status(400).json({ error: "学校不能为空" });
  req.user.realName = realName;
  req.user.school = school;
  save();
  res.json({ user: publicUser(req.user) });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiEnabled: hasAPIKey(),
    demoMode: !hasAPIKey(),
    cloudDb: cloudDbEnabled,
    dbUsers: db.users.length,
    dbLoadOk: dbStatus.cloudLoadOk,
    dbLoadedAt: dbStatus.loadedAt,
    dbLastError: dbStatus.lastError,
  });
});

// ---------- 生成（需登录，自动存档） ----------

async function generate({ prompt, mock, res }) {
  try {
    const data = await chatJSON(prompt);
    if (data) return { ...data, demo: false };
  } catch (err) {
    console.error("[LLM] 调用失败，降级为演示模式：", err.message);
    return { ...mock, demo: true, notice: `大模型调用失败，已返回演示数据：${err.message}` };
  }
  return { ...mock, demo: true, notice: "未配置 DEEPSEEK_API_KEY，当前为演示模式（预置示例数据）。在 backend/.env 中配置后即可体验真实 AI 生成。" };
}

function saveRecord(userId, type, body, profile, result, meta = {}) {
  const record = {
    id: newId(),
    userId,
    type,
    profile: { target: profile.target, cefr: profile.cefr, challenge: profile.challenge },
    task: body.task || "",
    essay: body.essay || "",
    result,
    ...meta,
    createdAt: Date.now(),
  };
  db.records.push(record);
  save();
  return record.id;
}

app.post("/api/materials", authRequired, quotaRequired, async (req, res) => {
  const profile = normalizeProfile(req.body);
  const task = (req.body.task || "").trim();
  if (!task) return res.status(400).json({ error: "请填写写作任务" });

  const data = await generate({ prompt: materialsPrompt(profile, task), mock: mockMaterials(profile, task) });
  consumeQuota(req.user);
  const recordId = saveRecord(req.user.id, "materials", { task }, profile, data);
  res.json({ ...data, recordId });
});

app.post("/api/feedback", authRequired, quotaRequired, async (req, res) => {
  const profile = normalizeProfile(req.body);
  const task = (req.body.task || "").trim();
  const essay = (req.body.essay || "").trim();
  if (!task) return res.status(400).json({ error: "请填写写作任务" });
  if (!essay) return res.status(400).json({ error: "请粘贴你的作文" });
  if (essay.length < 30) return res.status(400).json({ error: "作文内容太短，请至少写 30 个字符" });

  const data = await generate({ prompt: feedbackPrompt(profile, task, essay), mock: mockFeedback(profile, task, essay) });
  consumeQuota(req.user);
  const recordId = saveRecord(req.user.id, "feedback", { task, essay }, profile, data);
  res.json({ ...data, recordId });
});

// ---------- 历史记录 ----------

const recordSummary = (r, withUser = false) => ({
  id: r.id,
  type: r.type,
  task: r.task,
  profile: r.profile,
  createdAt: r.createdAt,
  ...(r.assignmentId
    ? { assignmentId: r.assignmentId, attempt: r.attempt || 1, revisionOf: r.revisionOf || null }
    : {}),
  ...(withUser ? { username: db.users.find((u) => u.id === r.userId)?.username || "未知" } : {}),
});

app.get("/api/records", authRequired, (req, res) => {
  const mine = db.records
    .filter((r) => r.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => recordSummary(r));
  res.json({ records: mine });
});

app.get("/api/records/:id", authRequired, (req, res) => {
  const record = db.records.find((r) => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: "记录不存在" });
  if (record.userId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "只能查看自己的记录" });
  }
  res.json({ record: { ...record, username: db.users.find((u) => u.id === record.userId)?.username } });
});

app.get("/api/admin/records", authRequired, adminRequired, (req, res) => {
  const all = db.records
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => recordSummary(r, true));
  res.json({ records: all, totalUsers: db.users.length });
});

// ---------- 管理员：账号目录与会员管理 ----------

const userSummary = (u) => ({
  id: u.id,
  username: u.username,
  realName: u.realName || "",
  school: u.school || "",
  role: u.role,
  plan: membershipActive(u) ? "member" : "guest",
  memberUntil: u.membership?.expiresAt || null,
  usedToday: u.usage?.date === todayStr() ? u.usage.count : 0,
  recordCount: db.records.filter((r) => r.userId === u.id).length,
  createdAt: u.createdAt,
});

app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const users = db.users.map(userSummary).sort((a, b) => a.createdAt - b.createdAt);
  res.json({ users });
});

// 开通/续费会员（months 支持小数，如 0.25 = 一周；不传 months 且 revoke=true 则取消会员）
app.post("/api/admin/users/:id/membership", authRequired, adminRequired, (req, res) => {
  const target = db.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (target.role === "admin") return res.status(400).json({ error: "管理员无需会员，天然不限次数" });

  if (req.body.revoke) {
    target.membership = { plan: "guest", expiresAt: null };
  } else {
    const months = Number(req.body.months);
    if (!Number.isFinite(months) || months <= 0 || months > 36) {
      return res.status(400).json({ error: "会员时长无效（0.25-36 个月）" });
    }
    // 已是有效会员则从到期时间续费叠加，否则从现在起算
    const base =
      target.membership?.plan === "member" && target.membership.expiresAt > Date.now()
        ? target.membership.expiresAt
        : Date.now();
    target.membership = { plan: "member", expiresAt: base + Math.round(months * 30 * 24 * 3600 * 1000) };
  }
  save();
  res.json({ user: userSummary(target) });
});

app.delete("/api/admin/users/:id", authRequired, adminRequired, (req, res) => {
  const target = db.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (target.role === "admin") return res.status(400).json({ error: "不能删除管理员账号" });
  db.users = db.users.filter((u) => u.id !== target.id);
  db.records = db.records.filter((r) => r.userId !== target.id);
  db.sessions = db.sessions.filter((s) => s.userId !== target.id);
  save();
  res.json({ ok: true });
});

// ---------- 课程系统 ----------

// 课程：{ id, name, startAt, endAt, teacherId, members[], notices[], assignments[], lessons[], createdAt }
// 作业：{ id, title, task, mode, target, cefr, challenge, minWords, maxWords, createdAt }（类型/难度/词数要求由老师锁定）
// 提交：{ id, courseId, assignmentId, userId, essay, wordCount, task, profile, aiResult, adminReview, status, submittedAt }
// 阅读：{ id, title, content, exercises[{id,type,prompt,options,answer,answers,mode,minWords,maxWords,points}], createdAt }
// 练习成绩：{ id, courseId, lessonId, userId, answers[{exerciseId,answer,auto,correct}], autoScore, maxAutoScore,
//            pendingReview, adminReview{scores,comment,reviewedAt}, totalScore, maxScore, submittedAt }

// 英文作文词数：按空白切分（中英混排也按空格计）
const countWords = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

// 从自由文本评分里提取数字（如 "7 分" → 7），用于成绩统计
const numScore = (v) => {
  const m = String(v ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// 批改结果的 score 可能是对象 {label, comment}（真实 AI 与演示模式均如此），统一转成可展示的文本
const scoreText = (v) => {
  if (v == null) return null;
  if (typeof v === "object") return v.label ?? v.comment ?? null;
  return v;
};

// deadline：时间戳或 ISO/日期字符串 → 时间戳（无效则 null）
const parseDeadline = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const isOverdue = (d) => d != null && Date.now() > d;

// 默认成绩分配：作业 40% / 在线学习 30% / 考试 30%（考试系统上线前自动按可用类别折算）
const DEFAULT_WEIGHTS = { assignment: 40, lesson: 30, exam: 30 };

// 讲解/练习穿插的块结构：[{type:"md", text} | {type:"exercise", exerciseId}]
// 校验并规范化 blocks，返回 { blocks } 或 { error }
function validateBlocks(raw, exercises) {
  if (raw == null) return { blocks: null };
  if (!Array.isArray(raw)) return { error: "内容块格式无效" };
  const ids = new Set(exercises.map((e) => e.id));
  const out = [];
  let mdCount = 0;
  for (const b of raw) {
    if (b?.type === "md") {
      const text = String(b.text || "").replace(/\s+$/g, "");
      if (!text.trim()) return { error: "讲解内容不能为空块" };
      out.push({ type: "md", text });
      mdCount++;
    } else if (b?.type === "material") {
      // 共享材料块：短文/对话等，只贴一次，学生作答时同屏对照
      const text = String(b.text || "").replace(/\s+$/g, "");
      if (!text.trim()) return { error: "材料内容不能为空块" };
      out.push({ type: "material", text });
    } else if (b?.type === "exercise") {
      const eid = String(b.exerciseId ?? b.index ?? "");
      // 允许前端用「在 exercises 中的下标」引用，转换为真实 id
      const ref = ids.has(eid) ? eid : exercises[Number(eid)]?.id;
      if (!ref || !ids.has(ref)) return { error: "练习块引用的题目不存在" };
      out.push({ type: "exercise", exerciseId: ref });
    } else {
      return { error: "内容块类型无效" };
    }
  }
  if (out.length === 0) return { error: "请至少添加一个讲解或练习块" };
  return { blocks: out, mdCount };
}

// 兼容旧数据：没有 blocks 的阅读按「全文讲解 + 全部练习」展开
function blocksOf(l) {
  if (Array.isArray(l.blocks) && l.blocks.length) return l.blocks;
  return [
    ...(l.content ? [{ type: "md", text: l.content }] : []),
    ...(l.exercises || []).map((e) => ({ type: "exercise", exerciseId: e.id })),
  ];
}

const courseSummary = (c) => ({
  id: c.id,
  name: c.name,
  startAt: c.startAt,
  endAt: c.endAt,
  teacher: db.users.find((u) => u.id === c.teacherId)?.username || "未知",
  memberCount: c.members.length,
  noticeCount: c.notices.length,
  assignmentCount: c.assignments.length,
  lessonCount: (c.lessons || []).length,
  createdAt: c.createdAt,
});

const submissionSummary = (s, withUser = true) => ({
  id: s.id,
  assignmentId: s.assignmentId,
  userId: s.userId,
  username: withUser ? db.users.find((u) => u.id === s.userId)?.username || "未知" : undefined,
  realName: withUser ? db.users.find((u) => u.id === s.userId)?.realName || "" : undefined,
  attempt: s.attempt || 1,
  revisionOf: s.revisionOf || null,
  late: s.late || false,
  wordCount: s.wordCount ?? null,
  status: s.status,
  submittedAt: s.submittedAt,
  aiScore: scoreText(s.aiResult?.score),
  reviewScore: s.adminReview?.score ?? null,
  reviewComment: s.adminReview?.comment ?? null,
  reviewedAt: s.adminReview?.reviewedAt ?? null,
});

function requireCourseMember(req, res, next) {
  const course = db.courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: "课程不存在" });
  if (req.user.role !== "admin" && !course.members.includes(req.user.id)) {
    return res.status(403).json({ error: "你不在这门课程中" });
  }
  req.course = course;
  next();
}

// 创建课程（管理员）
app.post("/api/courses", authRequired, adminRequired, (req, res) => {
  const name = String(req.body.name || "").trim();
  const startAt = Date.parse(req.body.startAt);
  const endAt = Date.parse(req.body.endAt);
  if (!name) return res.status(400).json({ error: "请填写课程名称" });
  if (Number.isNaN(startAt) || Number.isNaN(endAt)) {
    return res.status(400).json({ error: "请填写有效的开始与结束时间" });
  }
  if (endAt <= startAt) return res.status(400).json({ error: "结束时间必须晚于开始时间" });
  const course = {
    id: newId(),
    name,
    startAt,
    endAt,
    teacherId: req.user.id,
    members: [],
    notices: [],
    assignments: [],
    createdAt: Date.now(),
  };
  db.courses.push(course);
  save();
  res.json({ course: courseSummary(course) });
});

// 课程列表：管理员看到全部，学生看到自己加入的
app.get("/api/courses", authRequired, (req, res) => {
  const list = db.courses
    .filter((c) => req.user.role === "admin" || c.members.includes(req.user.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(courseSummary);
  res.json({ courses: list });
});

// 学生视角的课程内容（阅读练习不暴露标准答案）
const lessonPublic = (l, withAnswers) => ({
  id: l.id,
  title: l.title,
  content: l.content,
  blocks: blocksOf(l),
  deadline: l.deadline || null,
  overdue: isOverdue(l.deadline),
  createdAt: l.createdAt,
  maxAttempts: l.maxAttempts || null,
  exercises: (l.exercises || []).map((e) => ({
    id: e.id,
    type: e.type,
    prompt: e.prompt,
    options: e.type === "choice" ? e.options : undefined,
    mode: e.type === "blank" ? e.mode : undefined,
    minWords: e.minWords || null,
    maxWords: e.maxWords || null,
    points: e.points,
    ...(withAnswers ? { answer: e.answer, answers: e.answers } : {}),
  })),
});

const lessonGradeSummary = (g, withUser = true) => ({
  id: g.id,
  lessonId: g.lessonId,
  userId: g.userId,
  username: withUser ? db.users.find((u) => u.id === g.userId)?.username || "未知" : undefined,
  realName: withUser ? db.users.find((u) => u.id === g.userId)?.realName || "" : undefined,
  attempt: g.attempt || 1,
  revisionOf: g.revisionOf || null,
  late: g.late || false,
  autoScore: g.autoScore,
  maxAutoScore: g.maxAutoScore,
  totalScore: g.totalScore,
  maxScore: g.maxScore,
  pendingReview: g.pendingReview,
  adminComment: g.adminReview?.comment ?? null,
  reviewedAt: g.adminReview?.reviewedAt ?? null,
  submittedAt: g.submittedAt,
});

// 课程详情（成员或管理员）
app.get("/api/courses/:id", authRequired, requireCourseMember, (req, res) => {
  const c = req.course;
  const isAdmin = req.user.role === "admin";
  const assignments = c.assignments.map((a) => ({
    ...a,
    submissionCount: db.submissions.filter((s) => s.assignmentId === a.id).length,
  }));
  res.json({
    course: courseSummary(c),
    syllabus: c.syllabus || null,
    notices: c.notices.slice().sort((a, b) => b.createdAt - a.createdAt),
    assignments,
    lessons: (c.lessons || []).slice().sort((a, b) => b.createdAt - a.createdAt).map((l) => lessonPublic(l, isAdmin)),
    members: isAdmin
      ? c.members.map((id) => userSummary(db.users.find((u) => u.id === id))).filter((u) => u.id)
      : undefined,
    mySubmissions: isAdmin
      ? undefined
      : db.submissions
          .filter((s) => s.courseId === c.id && s.userId === req.user.id)
          .map((s) => submissionSummary(s, false)),
    myLessonGrades: isAdmin
      ? undefined
      : db.lessonGrades.filter((g) => g.courseId === c.id && g.userId === req.user.id).map((g) => lessonGradeSummary(g, false)),
    // 逐题作答记录（新模型）：学生看自己的，用于卡片恢复每题状态
    myLessonAnswers: isAdmin
      ? undefined
      : db.lessonAnswers
          .filter((a) => a.courseId === c.id && a.userId === req.user.id)
          .sort((a, b) => a.submittedAt - b.submittedAt)
          .map((a) => lessonAnswerSummary(a, (c.lessons || []).find((l) => l.id === a.lessonId))),
    submissions: isAdmin
      ? db.submissions.filter((s) => s.courseId === c.id).map((s) => submissionSummary(s))
      : undefined,
    lessonGrades: isAdmin
      ? db.lessonGrades.filter((g) => g.courseId === c.id).map((g) => lessonGradeSummary(g))
      : undefined,
  });
});

// 批量添加学员（按用户 id 列表，自动跳过管理员与已在课程中的账号）
app.post("/api/courses/:id/members/batch", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const ids = Array.isArray(req.body.userIds) ? req.body.userIds : [];
  if (ids.length === 0) return res.status(400).json({ error: "请至少选择一名学员" });
  let added = 0;
  let skipped = 0;
  for (const id of ids) {
    const u = db.users.find((x) => x.id === id);
    if (!u || u.role === "admin") { skipped++; continue; }
    if (req.course.members.includes(u.id)) { skipped++; continue; }
    req.course.members.push(u.id);
    added++;
  }
  if (added > 0) save();
  res.json({
    added,
    skipped,
    members: req.course.members.map((mid) => userSummary(db.users.find((u) => u.id === mid))),
  });
});

// 添加学员（按用户名）
app.post("/api/courses/:id/members", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const username = String(req.body.username || "").trim();
  const user = db.users.find((u) => u.username === username);
  if (!user) return res.status(404).json({ error: `找不到用户「${username}」` });
  if (req.course.members.includes(user.id)) {
    return res.status(400).json({ error: "该学员已在课程中" });
  }
  req.course.members.push(user.id);
  save();
  res.json({ members: req.course.members.map((id) => userSummary(db.users.find((u) => u.id === id))) });
});

// 移除学员
app.delete("/api/courses/:id/members/:userId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  if (!req.course.members.includes(req.params.userId)) {
    return res.status(404).json({ error: "该用户不在课程中" });
  }
  req.course.members = req.course.members.filter((id) => id !== req.params.userId);
  save();
  res.json({ ok: true });
});

// 发布通知
app.post("/api/courses/:id/notices", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  if (!title) return res.status(400).json({ error: "请填写通知标题" });
  if (!content) return res.status(400).json({ error: "请填写通知内容" });
  const notice = { id: newId(), title, content, createdAt: Date.now() };
  req.course.notices.push(notice);
  save();
  res.json({ notice });
});

app.delete("/api/courses/:id/notices/:noticeId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  req.course.notices = req.course.notices.filter((n) => n.id !== req.params.noticeId);
  save();
  res.json({ ok: true });
});

// 发布作业（类型/难度/任务由老师设定并锁定）
app.post("/api/courses/:id/assignments", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const title = String(req.body.title || "").trim();
  const task = String(req.body.task || "").trim();
  if (!title) return res.status(400).json({ error: "请填写作业标题" });
  if (!task) return res.status(400).json({ error: "请填写作文任务（题目/要求）" });
  const minWords = Number(req.body.minWords);
  const maxWords = Number(req.body.maxWords);
  const minW = Number.isFinite(minWords) && minWords > 0 ? Math.round(minWords) : null;
  const maxW = Number.isFinite(maxWords) && maxWords > 0 ? Math.round(maxWords) : null;
  if (minW && maxW && maxW < minW) return res.status(400).json({ error: "最高词数不能小于最低词数" });
  const maxAttemptsRaw = Number(req.body.maxAttempts);
  const maxAttempts = Number.isInteger(maxAttemptsRaw) && maxAttemptsRaw > 0 ? maxAttemptsRaw : null; // null = 不限次数
  const deadline = parseDeadline(req.body.deadline);
  const assignment = {
    id: newId(),
    title,
    task,
    mode: req.body.mode === "practical" ? "practical" : "exam",
    target: String(req.body.target || "cet4"),
    cefr: String(req.body.cefr || "B1"),
    challenge: String(req.body.challenge || "match"),
    minWords: minW,
    maxWords: maxW,
    maxAttempts,
    deadline,
    createdAt: Date.now(),
  };
  req.course.assignments.push(assignment);
  save();
  res.json({ assignment });
});

app.delete("/api/courses/:id/assignments/:assignmentId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const a = req.course.assignments.find((x) => x.id === req.params.assignmentId);
  if (!a) return res.status(404).json({ error: "作业不存在" });
  if (db.submissions.some((s) => s.assignmentId === a.id)) {
    return res.status(400).json({ error: "已有学生提交，不能删除该作业" });
  }
  req.course.assignments = req.course.assignments.filter((x) => x.id !== a.id);
  save();
  res.json({ ok: true });
});

// 调整作业截止时间（null/空 = 取消截止）
app.patch("/api/courses/:id/assignments/:assignmentId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const a = req.course.assignments.find((x) => x.id === req.params.assignmentId);
  if (!a) return res.status(404).json({ error: "作业不存在" });
  a.deadline = req.body.deadline === undefined ? a.deadline : parseDeadline(req.body.deadline);
  if (req.body.title != null) a.title = String(req.body.title).trim() || a.title;
  save();
  res.json({ assignment: a });
});

// 调整阅读：截止时间 / 作答次数 / 完整内容编辑（标题、blocks、练习题）
app.patch("/api/courses/:id/lessons/:lessonId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const l = (req.course.lessons || []).find((x) => x.id === req.params.lessonId);
  if (!l) return res.status(404).json({ error: "阅读不存在" });
  l.deadline = req.body.deadline === undefined ? l.deadline : parseDeadline(req.body.deadline);
  if (req.body.maxAttempts !== undefined) {
    const n = Number(req.body.maxAttempts);
    l.maxAttempts = Number.isInteger(n) && n > 0 ? n : null;
  }
  // 内容编辑：传了 title/blocks/exercises 任一即按整篇更新处理
  if (req.body.title !== undefined || req.body.blocks !== undefined || req.body.exercises !== undefined) {
    const title = String(req.body.title ?? l.title).trim();
    if (!title) return res.status(400).json({ error: "请填写阅读标题" });
    const v = validateExercises(req.body.exercises !== undefined ? req.body.exercises : l.exercises);
    if (v.error) return res.status(400).json({ error: v.error });
    // 编辑时尽量保留原练习题 id（按下标对应），这样学员历次作答记录仍能对上题干
    v.exercises.forEach((e, i) => { e.id = l.exercises[i]?.id || newId(); });
    const bv = validateBlocks(req.body.blocks !== undefined ? req.body.blocks : l.blocks, v.exercises);
    if (bv.error) return res.status(400).json({ error: bv.error });
    const blocks = bv.blocks || [{ type: "md", text: String(l.content || "") }];
    l.title = title;
    l.blocks = blocks;
    l.exercises = v.exercises;
    l.content = blocks.filter((b) => b.type === "md").map((b) => b.text).join("\n\n");
  }
  save();
  res.json({ lesson: lessonPublic(l, true) });
});

// 学生可提交的作业列表（跨课程，含提交状态与剩余次数）
app.get("/api/assignments/available", authRequired, (req, res) => {
  const myCourses = db.courses.filter((c) => c.members.includes(req.user.id));
  const items = [];
  for (const c of myCourses) {
    for (const a of c.assignments) {
      const mine = db.submissions
        .filter((s) => s.assignmentId === a.id && s.userId === req.user.id)
        .sort((x, y) => y.submittedAt - x.submittedAt);
      const attempts = mine.length;
      items.push({
        assignmentId: a.id,
        courseId: c.id,
        courseName: c.name,
        title: a.title,
        task: a.task,
        mode: a.mode,
        target: a.target,
        cefr: a.cefr,
        challenge: a.challenge,
        minWords: a.minWords || null,
        maxWords: a.maxWords || null,
        maxAttempts: a.maxAttempts || null,
        deadline: a.deadline || null,
        overdue: isOverdue(a.deadline),
        attempts,
        attemptsLeft: a.maxAttempts ? Math.max(0, a.maxAttempts - attempts) : null,
        canSubmit: !a.maxAttempts || attempts < a.maxAttempts,
        submitted: attempts > 0,
        latestSubmissionId: mine[0]?.id || null,
      });
    }
  }
  res.json({ assignments: items });
});

// 学生提交作业：按老师设置的次数限制可多次提交（修改重交会参考上次的作文与批改）
app.post("/api/assignments/:id/submit", authRequired, quotaRequired, async (req, res) => {
  const course = db.courses.find((c) => c.assignments.some((a) => a.id === req.params.id));
  const assignment = course?.assignments.find((a) => a.id === req.params.id);
  if (!course || !assignment) return res.status(404).json({ error: "作业不存在" });
  if (req.user.role !== "admin" && !course.members.includes(req.user.id)) {
    return res.status(403).json({ error: "你不在这门课程中，不能提交该作业" });
  }
  const prevSubs = db.submissions
    .filter((s) => s.assignmentId === assignment.id && s.userId === req.user.id)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  if (assignment.maxAttempts && prevSubs.length >= assignment.maxAttempts) {
    return res.status(400).json({
      error: `已达到提交次数上限（${assignment.maxAttempts} 次）。如需再次修改，请联系老师调整次数。`,
    });
  }
  // 截止时间：逾期默认拒绝；syllabus 开启「允许补交」时可补交（标记 late）
  const late = isOverdue(assignment.deadline);
  if (late && course.syllabus?.policies?.lateAssignment === false) {
    return res.status(400).json({ error: "该作业已过截止时间，且本课程未开放补交。请联系老师。" });
  }
  const attemptNo = prevSubs.length + 1;
  // 修订链：默认基于最近一次提交；也可显式指定以哪一次为底稿
  const prev = prevSubs.find((s) => s.id === req.body.resubmitOf) || prevSubs[0] || null;
  const essay = (req.body.essay || "").trim();
  if (essay.length < 30) return res.status(400).json({ error: "作文内容太短，请至少写 30 个字符" });
  const wordCount = countWords(essay);
  if (assignment.minWords && wordCount < assignment.minWords) {
    return res.status(400).json({ error: `词数不足：当前 ${wordCount} 词，要求至少 ${assignment.minWords} 词` });
  }
  if (assignment.maxWords && wordCount > assignment.maxWords) {
    return res.status(400).json({ error: `词数超出：当前 ${wordCount} 词，要求不超过 ${assignment.maxWords} 词` });
  }

  // 画像由老师布置作业时锁定，学生无法修改
  const profile = normalizeProfile({
    mode: assignment.mode,
    target: assignment.target,
    cefr: assignment.cefr,
    challenge: assignment.challenge,
  });
  const data = await generate({
    prompt: feedbackPrompt(
      profile,
      assignment.task,
      essay,
      prev ? { essay: prev.essay, feedback: prev.aiResult, attempt: prev.attempt || 1 } : null
    ),
    mock: mockFeedback(profile, assignment.task, essay),
  });
  consumeQuota(req.user);
  const submission = {
    id: newId(),
    courseId: course.id,
    assignmentId: assignment.id,
    userId: req.user.id,
    essay,
    wordCount,
    attempt: attemptNo,
    revisionOf: prev?.id || null,
    late: late || undefined,
    task: assignment.task,
    profile: { target: profile.target, cefr: profile.cefr, challenge: profile.challenge },
    aiResult: data,
    adminReview: null,
    status: "pending",
    submittedAt: Date.now(),
  };
  db.submissions.push(submission);
  const recordId = saveRecord(req.user.id, "feedback", { task: assignment.task, essay }, profile, data, {
    assignmentId: assignment.id,
    courseId: course.id,
    attempt: attemptNo,
    revisionOf: prev?.id || null,
  });
  save();
  res.json({
    ...data,
    recordId,
    submissionId: submission.id,
    courseName: course.name,
    assignmentTitle: assignment.title,
    attempt: attemptNo,
    maxAttempts: assignment.maxAttempts || null,
    attemptsLeft: assignment.maxAttempts ? Math.max(0, assignment.maxAttempts - attemptNo) : null,
  });
});

// 老师查看某作业的全部提交
app.get("/api/assignments/:id/submissions", authRequired, adminRequired, (req, res) => {
  const submissions = db.submissions
    .filter((s) => s.assignmentId === req.params.id)
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((s) => submissionSummary(s));
  res.json({ submissions });
});

// 老师查看单份提交详情（含作文与 AI 批改全文）
app.get("/api/submissions/:id", authRequired, adminRequired, (req, res) => {
  const s = db.submissions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "提交不存在" });
  res.json({ submission: { ...s, username: db.users.find((u) => u.id === s.userId)?.username } });
});

// 老师评分复核
app.post("/api/submissions/:id/review", authRequired, adminRequired, (req, res) => {
  const s = db.submissions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "提交不存在" });
  const score = String(req.body.score || "").trim();
  const comment = String(req.body.comment || "").trim();
  if (!score) return res.status(400).json({ error: "请填写复核分数/等级" });
  s.adminReview = { score, comment, reviewerId: req.user.id, reviewedAt: Date.now() };
  s.status = "reviewed";
  save();
  res.json({ submission: submissionSummary(s) });
});

// 学生查看自己的提交（全部尝试，新的在前）
app.get("/api/my/submissions/:assignmentId", authRequired, (req, res) => {
  const subs = db.submissions
    .filter((x) => x.assignmentId === req.params.assignmentId && x.userId === req.user.id)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  if (subs.length === 0) return res.status(404).json({ error: "尚未提交该作业" });
  const assignment = db.courses.flatMap((c) => c.assignments).find((a) => a.id === req.params.assignmentId);
  res.json({ submissions: subs, maxAttempts: assignment?.maxAttempts || null });
});

// ---------- 在线阅读与练习 ----------

// 阅读文档 + 内嵌练习：选择题自动判分；填空题分「唯一答案」（自动判分）和「灵活」（老师人工批改）
// 练习作答不调用 AI，不消耗每日额度

const normAnswer = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[.,!?;:"'’“”。！？；：、]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// 校验并规范化练习题，返回错误信息或 null（允许 0 题：纯讲解的阅读不配练习）
function validateExercises(raw) {
  if (raw == null) return { exercises: [] };
  if (!Array.isArray(raw)) return { error: "练习题格式无效" };
  if (raw.length === 0) return { exercises: [] };
  const out = [];
  for (const e of raw) {
    const prompt = String(e.prompt || "").trim();
    const points = Number(e.points);
    if (!prompt) return { error: "练习题的题干不能为空" };
    if (!Number.isFinite(points) || points <= 0 || points > 100) return { error: "每题分值需在 0-100 之间" };
    if (e.type === "choice") {
      const options = (Array.isArray(e.options) ? e.options : []).map((o) => String(o || "").trim()).filter(Boolean);
      if (options.length < 2) return { error: "选择题至少需要 2 个选项" };
      const answer = Number(e.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        return { error: "请为每道选择题指定正确选项" };
      }
      out.push({ type: "choice", prompt, options, answer, points: points });
    } else if (e.type === "blank") {
      const mode = e.mode === "unique" ? "unique" : "flexible";
      const minWords = Number(e.minWords);
      const maxWords = Number(e.maxWords);
      const item = {
        type: "blank",
        prompt,
        mode,
        points: points,
        minWords: Number.isFinite(minWords) && minWords > 0 ? Math.round(minWords) : null,
        maxWords: Number.isFinite(maxWords) && maxWords > 0 ? Math.round(maxWords) : null,
      };
      if (item.minWords && item.maxWords && item.maxWords < item.minWords) {
        return { error: "填空题的最高词数不能小于最低词数" };
      }
      if (mode === "unique") {
        const answers = (Array.isArray(e.answers) ? e.answers : []).map((a) => String(a || "").trim()).filter(Boolean);
        if (answers.length === 0) return { error: "唯一答案的填空题请至少填写一个可接受的答案" };
        item.answers = answers;
      }
      out.push(item);
    } else {
      return { error: "练习题类型无效" };
    }
  }
  return { exercises: out };
}

// 发布在线阅读（讲解/练习穿插的 blocks 结构 + 练习题 + 截止时间）
app.post("/api/courses/:id/lessons", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  if (!title) return res.status(400).json({ error: "请填写阅读标题" });
  const v = validateExercises(req.body.exercises);
  if (v.error) return res.status(400).json({ error: v.error });
  // 先给练习题分配 id，再校验 blocks 的引用（编辑器按下标引用，也兼容直接传 id）
  const exercises = v.exercises.map((e) => ({ id: newId(), ...e }));
  const bv = validateBlocks(req.body.blocks, exercises);
  if (bv.error) return res.status(400).json({ error: bv.error });
  // 兼容旧编辑器：未传 blocks 时，正文即唯一讲解块
  const blocks = bv.blocks || (content ? [{ type: "md", text: content }] : null);
  if (!blocks) return res.status(400).json({ error: "请至少添加一段讲解或一道练习题" });
  const maxAttemptsRaw = Number(req.body.maxAttempts);
  const maxAttempts = Number.isInteger(maxAttemptsRaw) && maxAttemptsRaw > 0 ? maxAttemptsRaw : null; // null = 不限次数
  const lesson = {
    id: newId(),
    title,
    content: blocks.filter((b) => b.type === "md").map((b) => b.text).join("\n\n"),
    blocks,
    exercises,
    maxAttempts,
    deadline: parseDeadline(req.body.deadline),
    createdAt: Date.now(),
  };
  req.course.lessons = req.course.lessons || [];
  req.course.lessons.push(lesson);
  save();
  res.json({ lesson: lessonPublic(lesson, true) });
});

app.delete("/api/courses/:id/lessons/:lessonId", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const lesson = (req.course.lessons || []).find((l) => l.id === req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: "阅读不存在" });
  if (db.lessonGrades.some((g) => g.lessonId === lesson.id)) {
    return res.status(400).json({ error: "已有学生作答，不能删除该阅读（成绩统计需要）" });
  }
  req.course.lessons = req.course.lessons.filter((l) => l.id !== lesson.id);
  save();
  res.json({ ok: true });
});

// 学生提交阅读练习：选择题与唯一答案填空自动判分，灵活填空等待老师批改
// 可多次作答（次数由老师设置），以最后一次为准；答对或次数用尽前不揭示标准答案
app.post("/api/lessons/:id/submit", authRequired, (req, res) => {
  const course = db.courses.find((c) => (c.lessons || []).some((l) => l.id === req.params.id));
  const lesson = course?.lessons.find((l) => l.id === req.params.id);
  if (!course || !lesson) return res.status(404).json({ error: "阅读不存在" });
  if (req.user.role !== "admin" && !course.members.includes(req.user.id)) {
    return res.status(403).json({ error: "你不在这门课程中，不能作答该阅读" });
  }
  const prevGrades = db.lessonGrades
    .filter((g) => g.lessonId === lesson.id && g.userId === req.user.id)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  if (lesson.maxAttempts && prevGrades.length >= lesson.maxAttempts) {
    return res.status(400).json({ error: `已达到作答次数上限（${lesson.maxAttempts} 次）。` });
  }
  // 截止时间：逾期默认拒绝；syllabus 开启「允许补学」时可补作（标记 late）
  const late = isOverdue(lesson.deadline);
  if (late && course.syllabus?.policies?.lateLesson === false) {
    return res.status(400).json({ error: "该练习已过截止时间，且本课程未开放补学。请联系老师。" });
  }
  const attemptNo = prevGrades.length + 1;
  const prev = prevGrades[0] || null;
  if (db.lessonGrades.some((g) => g.lessonId === lesson.id && g.userId === req.user.id && g.attempt === attemptNo)) {
    return res.status(400).json({ error: "该阅读已作答过，不能重复作答" });
  }

  const submitted = req.body.answers || {}; // { exerciseId: answer }
  const answers = [];
  let autoScore = 0;
  let maxAutoScore = 0;
  let pendingReview = false;

  for (const e of lesson.exercises) {
    const answer = String(submitted[e.id] ?? "").trim();
    let auto = null;
    let correct = null;
    if (e.type === "choice") {
      correct = Number(answer) === e.answer;
      auto = correct ? e.points : 0;
      autoScore += auto;
      maxAutoScore += e.points;
    } else if (e.mode === "unique") {
      correct = e.answers.some((a) => normAnswer(a) === normAnswer(answer));
      auto = correct ? e.points : 0;
      autoScore += auto;
      maxAutoScore += e.points;
    } else {
      // 灵活填空：老师人工批改
      pendingReview = true;
      if (e.minWords && countWords(answer) < e.minWords) {
        return res.status(400).json({ error: `有填空题词数不足（要求至少 ${e.minWords} 词），请补充后再提交` });
      }
    }
    answers.push({ exerciseId: e.id, answer, auto, correct });
  }

  const maxScore = lesson.exercises.reduce((sum, e) => sum + e.points, 0);
  const grade = {
    id: newId(),
    courseId: course.id,
    lessonId: lesson.id,
    userId: req.user.id,
    attempt: attemptNo,
    revisionOf: prev?.id || null,
    late: late || undefined,
    answers,
    autoScore,
    maxAutoScore,
    pendingReview,
    adminReview: null,
    totalScore: autoScore,
    maxScore,
    submittedAt: Date.now(),
  };
  db.lessonGrades.push(grade);
  save();
  const canRetry = !lesson.maxAttempts || attemptNo < lesson.maxAttempts;
  res.json({
    grade: { ...grade, username: req.user.username },
    lessonTitle: lesson.title,
    courseName: course.name,
    attempt: attemptNo,
    maxAttempts: lesson.maxAttempts || null,
    attemptsLeft: lesson.maxAttempts ? Math.max(0, lesson.maxAttempts - attemptNo) : null,
    canRetry,
    // 次数用尽后才揭示标准答案；还有机会时只告知对错，鼓励再试
    revealAnswers: !canRetry,
  });
});

// ---------- 逐题作答（新模型：每题单独计次数、单独判分） ----------

// 逐题作答：POST /api/lessons/:id/answer { exerciseId, answer }
// 规则与整卷模式一致：每题的作答次数受 lesson.maxAttempts 限制（null=不限）；
// 答对、或该题次数用尽后才揭示标准答案；灵活写作题记为待老师批改
app.post("/api/lessons/:id/answer", authRequired, (req, res) => {
  const course = db.courses.find((c) => (c.lessons || []).some((l) => l.id === req.params.id));
  const lesson = course?.lessons.find((l) => l.id === req.params.id);
  if (!course || !lesson) return res.status(404).json({ error: "阅读不存在" });
  if (req.user.role !== "admin" && !course.members.includes(req.user.id)) {
    return res.status(403).json({ error: "你不在这门课程中，不能作答该阅读" });
  }
  const e = (lesson.exercises || []).find((x) => x.id === String(req.body.exerciseId || ""));
  if (!e) return res.status(404).json({ error: "题目不存在（阅读可能刚被编辑过，请刷新页面）" });
  // 截止时间：逾期默认拒绝；syllabus 开启「允许补学」时可补作（标记 late）
  const late = isOverdue(lesson.deadline);
  if (late && course.syllabus?.policies?.lateLesson === false) {
    return res.status(400).json({ error: "该练习已过截止时间，且本课程未开放补学。请联系老师。" });
  }
  const answer = String(req.body.answer ?? "").trim();
  if (!answer) return res.status(400).json({ error: "请先作答再提交" });

  const prev = db.lessonAnswers
    .filter((a) => a.lessonId === lesson.id && a.userId === req.user.id && a.exerciseId === e.id)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  if (lesson.maxAttempts && prev.length >= lesson.maxAttempts) {
    return res.status(400).json({ error: `本题已达到作答次数上限（${lesson.maxAttempts} 次）。` });
  }
  if (e.type === "blank" && e.mode === "flexible" && e.minWords && countWords(answer) < e.minWords) {
    return res.status(400).json({ error: `词数不足（要求至少 ${e.minWords} 词），请补充后再提交` });
  }
  if (e.type === "choice" && !/^\d+$/.test(answer)) {
    return res.status(400).json({ error: "请选择一个选项" });
  }

  const attemptNo = prev.length + 1;
  let correct = null;
  let auto = 0;
  let pendingReview = false;
  if (e.type === "choice") {
    correct = Number(answer) === e.answer;
    auto = correct ? e.points : 0;
  } else if (e.mode === "unique") {
    correct = e.answers.some((a) => normAnswer(a) === normAnswer(answer));
    auto = correct ? e.points : 0;
  } else {
    pendingReview = true; // 灵活写作：老师批改
  }
  const record = {
    id: newId(),
    courseId: course.id,
    lessonId: lesson.id,
    userId: req.user.id,
    exerciseId: e.id,
    attempt: attemptNo,
    answer,
    auto,
    correct,
    pendingReview,
    late: late || undefined,
    adminReview: null,
    submittedAt: Date.now(),
  };
  db.lessonAnswers.push(record);
  save();

  const exhausted = lesson.maxAttempts && attemptNo >= lesson.maxAttempts;
  const reveal = !pendingReview && (correct || exhausted);
  res.json({
    attempt: attemptNo,
    attemptsLeft: lesson.maxAttempts ? Math.max(0, lesson.maxAttempts - attemptNo) : null,
    correct,
    auto,
    points: e.points,
    pendingReview,
    // 答对或该题次数用尽后揭示标准答案
    revealAnswer: reveal ? (e.type === "choice" ? { kind: "choice", index: e.answer } : { kind: "answers", answers: e.answers }) : null,
  });
});

// 逐题作答的汇总状态（学生端恢复界面用；不暴露标准答案，但答对/次数用尽的题返回揭示信息）
const lessonAnswerSummary = (a, lesson) => {
  const e = lesson?.exercises?.find((x) => x.id === a.exerciseId);
  const reveal =
    e &&
    !a.pendingReview &&
    (a.correct || (lesson.maxAttempts && a.attempt >= lesson.maxAttempts));
  return {
    id: a.id,
    lessonId: a.lessonId,
    exerciseId: a.exerciseId,
    attempt: a.attempt,
    answer: a.answer,
    auto: a.auto,
    correct: a.correct,
    pendingReview: a.pendingReview,
    adminScore: a.adminReview?.score ?? null,
    late: a.late || false,
    submittedAt: a.submittedAt,
    revealAnswer: reveal
      ? e.type === "choice"
        ? { kind: "choice", index: e.answer }
        : { kind: "answers", answers: e.answers }
      : null,
  };
};

// 老师批改逐题模式下的灵活写作（按学生 + 每题打分）
app.post("/api/lessons/:id/review", authRequired, adminRequired, (req, res) => {
  const course = db.courses.find((c) => (c.lessons || []).some((l) => l.id === req.params.id));
  const lesson = course?.lessons.find((l) => l.id === req.params.id);
  if (!course || !lesson) return res.status(404).json({ error: "阅读不存在" });
  const userId = String(req.body.userId || "");
  if (!course.members.includes(userId)) return res.status(404).json({ error: "该学生不在这门课程中" });
  const scores = req.body.scores || {}; // { exerciseId: 得分 }
  const comment = String(req.body.comment || "").trim();
  let touched = 0;
  for (const e of lesson.exercises || []) {
    if (!(e.type === "blank" && e.mode === "flexible")) continue;
    if (!(e.id in scores)) continue; // 允许只批改部分题（未打分的保持待批改）
    const v = Number(scores[e.id]);
    if (!Number.isFinite(v) || v < 0 || v > e.points) {
      return res.status(400).json({ error: `「${e.prompt.slice(0, 12)}…」的得分需在 0-${e.points} 之间` });
    }
    const latest = db.lessonAnswers
      .filter((a) => a.lessonId === lesson.id && a.userId === userId && a.exerciseId === e.id)
      .sort((a, b) => a.submittedAt - b.submittedAt)
      .pop();
    if (latest) {
      latest.adminReview = { score: v, comment, reviewerId: req.user.id, reviewedAt: Date.now() };
      latest.pendingReview = false;
      touched++;
    }
  }
  if (!touched) return res.status(400).json({ error: "没有可批改的灵活写作题作答" });
  save();
  res.json({ ok: true, reviewed: touched });
});

// 老师查看某份阅读的逐题作答（新模型，按学生汇总）
const lessonAnswersByUser = (lesson) => {
  const rows = db.lessonAnswers
    .filter((a) => a.lessonId === lesson.id)
    .reduce((map, a) => {
      (map[a.userId] = map[a.userId] || { userId: a.userId, byEx: {}, lastAt: 0 });
      const cur = map[a.userId].byEx[a.exerciseId];
      if (!cur || a.attempt > cur.attempt) map[a.userId].byEx[a.exerciseId] = a;
      map[a.userId].lastAt = Math.max(map[a.userId].lastAt, a.submittedAt);
      return map;
    }, {});
  return Object.values(rows)
    .map((r) => {
      const u = db.users.find((x) => x.id === r.userId);
      return {
        userId: r.userId,
        username: u?.username || "未知",
        realName: u?.realName || "",
        lastAt: r.lastAt,
        answers: Object.fromEntries(
          Object.entries(r.byEx).map(([eid, a]) => [eid, lessonAnswerSummary(a)])
        ),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
};

// 学生查看自己某份阅读的作答结果（返回全部尝试，新的在前；最多展示最近 5 次）
app.get("/api/my/lesson-grades/:lessonId", authRequired, (req, res) => {
  const grades = db.lessonGrades
    .filter((x) => x.lessonId === req.params.lessonId && x.userId === req.user.id)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  if (grades.length === 0) return res.status(404).json({ error: "尚未作答该阅读" });
  const lesson = db.courses.flatMap((c) => c.lessons || []).find((l) => l.id === req.params.lessonId);
  res.json({ grades, latest: grades[0], maxAttempts: lesson?.maxAttempts || null });
});

// 老师查看某份阅读的全部作答（含学生答案与标准答案）
app.get("/api/lessons/:id/grades", authRequired, adminRequired, (req, res) => {
  const course = db.courses.find((c) => (c.lessons || []).some((l) => l.id === req.params.id));
  const lesson = course?.lessons.find((l) => l.id === req.params.id);
  if (!course || !lesson) return res.status(404).json({ error: "阅读不存在" });
  const grades = db.lessonGrades
    .filter((g) => g.lessonId === lesson.id)
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((g) => ({
      ...g,
      username: db.users.find((u) => u.id === g.userId)?.username || "未知",
      realName: db.users.find((u) => u.id === g.userId)?.realName || "",
    }));
  res.json({ lesson: lessonPublic(lesson, true), grades, answersByUser: lessonAnswersByUser(lesson) });
});

// 老师批改灵活填空（逐题给分）并写总评
app.post("/api/lesson-grades/:id/review", authRequired, adminRequired, (req, res) => {
  const g = db.lessonGrades.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "作答记录不存在" });
  const lesson = db.courses.flatMap((c) => c.lessons || []).find((l) => l.id === g.lessonId);
  if (!lesson) return res.status(404).json({ error: "阅读不存在" });

  const scores = req.body.scores || {}; // { exerciseId: 得分 }
  let flexibleTotal = 0;
  for (const e of lesson.exercises) {
    if (e.type === "blank" && e.mode === "flexible") {
      const v = Number(scores[e.id]);
      if (!Number.isFinite(v) || v < 0 || v > e.points) {
        return res.status(400).json({ error: `请为所有灵活填空题打分（0-${e.points} 分）` });
      }
      flexibleTotal += v;
    }
  }
  const comment = String(req.body.comment || "").trim();
  g.adminReview = { scores, comment, reviewerId: req.user.id, reviewedAt: Date.now() };
  g.totalScore = g.autoScore + flexibleTotal;
  g.pendingReview = false;
  save();
  res.json({ grade: lessonGradeSummary(g) });
});

// ---------- Syllabus（教学大纲） ----------

// syllabus 结构：{
//   weights: { assignment, lesson, exam },   // 三类成绩占比（合计 100）
//   essayFullMark: number,                   // 作文满分（用于折算百分比，如雅思 9 / 百分制 100）
//   taskWeights: { [refId]: weight },        // 类别内每个任务/作业的权重（缺省为 1，即平均）
//   policies: { lateAssignment, lateLesson },// 是否允许逾期补交/补学
//   readings: [{ title, detail }],           // 参考阅读与参考用书
//   description: string,                     // 课程说明
//   updatedAt
// }

// 校验 syllabus，返回 { syllabus } 或 { error }
function validateSyllabus(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const w = src.weights || {};
  const weights = {
    assignment: Number(w.assignment),
    lesson: Number(w.lesson),
    exam: Number(w.exam),
  };
  for (const k of Object.keys(weights)) {
    if (!Number.isFinite(weights[k]) || weights[k] < 0 || weights[k] > 100) {
      return { error: "成绩占比需为 0-100 的数字" };
    }
  }
  const wSum = weights.assignment + weights.lesson + weights.exam;
  if (Math.round(wSum) !== 100) return { error: `三类成绩占比之和需为 100%，当前为 ${Math.round(wSum * 10) / 10}%` };
  const essayFullMark = Number(src.essayFullMark);
  if (!Number.isFinite(essayFullMark) || essayFullMark <= 0) {
    return { error: "作文满分需为正数（如百分制填 100，雅思填 9）" };
  }
  const taskWeights = {};
  if (src.taskWeights && typeof src.taskWeights === "object") {
    for (const [k, v] of Object.entries(src.taskWeights)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return { error: "任务权重需为正数" };
      taskWeights[k] = n;
    }
  }
  const readings = (Array.isArray(src.readings) ? src.readings : [])
    .map((r) => ({ title: String(r?.title || "").trim(), detail: String(r?.detail || "").trim() }))
    .filter((r) => r.title);
  return {
    syllabus: {
      weights,
      essayFullMark,
      taskWeights,
      policies: {
        lateAssignment: src.policies?.lateAssignment !== false,
        lateLesson: src.policies?.lateLesson !== false,
      },
      readings,
      description: String(src.description || "").trim(),
      updatedAt: Date.now(),
    },
  };
}

// 保存（新建或修改）syllabus
app.put("/api/courses/:id/syllabus", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const v = validateSyllabus(req.body.syllabus ?? req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  req.course.syllabus = v.syllabus;
  save();
  res.json({ syllabus: req.course.syllabus });
});

// ---------- 课程成绩统计 ----------

// 汇总一门课的成绩：作业作文（复核分优先，AI 分兜底，取数字部分）+ 阅读练习（自动+人工合计）
app.get("/api/courses/:id/grades", authRequired, adminRequired, requireCourseMember, (req, res) => {
  const c = req.course;
  const rows = c.members
    .map((uid) => {
      const u = db.users.find((x) => x.id === uid);
      if (!u) return null;
      const items = [];
      for (const a of c.assignments) {
        // 多次提交取最高分（奖励努力修改的同学）
        const subs = db.submissions
          .filter((x) => x.assignmentId === a.id && x.userId === uid)
          .sort((x, y) => x.submittedAt - y.submittedAt);
        if (subs.length === 0) {
          items.push({ kind: "essay", refId: a.id, title: a.title, score: null, status: "unsubmitted" });
        } else {
          const scores = subs.map((s) => numScore(scoreText(s.adminReview?.score)) ?? numScore(scoreText(s.aiResult?.score)));
          const best = Math.max(...scores.filter((v) => v != null));
          const latest = subs[subs.length - 1];
          items.push({
            kind: "essay",
            refId: a.id,
            title: a.title,
            score: Number.isFinite(best) ? best : null,
            attempts: subs.length,
            wordCount: latest.wordCount ?? null,
            late: latest.late || false,
            status: latest.status,
            reviewScore: latest.adminReview?.score ?? null,
            aiScore: scoreText(latest.aiResult?.score),
          });
        }
      }
      for (const l of c.lessons || []) {
        // 逐题作答模型（优先）：每题取最后一次作答；灵活题取老师批改分
        const perUser = db.lessonAnswers.filter((x) => x.lessonId === l.id && x.userId === uid);
        const maxScore = (l.exercises || []).reduce((s, e) => s + e.points, 0);
        if (perUser.length > 0 && maxScore > 0) {
          let score = 0;
          let pending = false;
          let maxAttempt = 0;
          let answered = 0;
          for (const e of l.exercises || []) {
            const list = perUser.filter((x) => x.exerciseId === e.id).sort((x, y) => x.submittedAt - y.submittedAt);
            const last = list[list.length - 1];
            if (!last) continue;
            answered++;
            maxAttempt = Math.max(maxAttempt, last.attempt);
            if (last.pendingReview) {
              pending = true;
            } else {
              score += last.adminReview ? Number(last.adminReview.score) || 0 : last.auto || 0;
            }
          }
          items.push({
            kind: "lesson",
            refId: l.id,
            title: l.title,
            // 有待批改的灵活题时先不计入得分（与整卷模式口径一致）
            score: pending ? null : score,
            max: maxScore,
            attempts: maxAttempt,
            late: perUser.some((x) => x.late),
            status: pending ? "pending-review" : "graded",
            answered,
            totalCount: (l.exercises || []).length,
          });
          continue;
        }
        // 兼容旧整卷作答：以最后一次为准
        const gs = db.lessonGrades
          .filter((x) => x.lessonId === l.id && x.userId === uid)
          .sort((x, y) => x.submittedAt - y.submittedAt);
        const g = gs[gs.length - 1];
        if (!g) {
          items.push({ kind: "lesson", refId: l.id, title: l.title, score: null, max: null, status: "unsubmitted" });
        } else {
          items.push({
            kind: "lesson",
            refId: l.id,
            title: l.title,
            score: g.pendingReview ? null : g.totalScore,
            max: g.maxScore,
            attempts: gs.length,
            late: g.late || false,
            status: g.pendingReview ? "pending-review" : "graded",
          });
        }
      }
      const scored = items.filter((i) => i.score != null);

      // ---- 按 syllabus 计算加权总评 ----
      // 类别内：每个任务按权重（缺省 1）加权平均其得分百分比；
      // 作文百分比 = 分数 / 作文满分，练习百分比 = 得分 / 满分；未提交按 0 计。
      // 考试类尚无成绩时，仅在已存在的类别间归一化。
      const syl = c.syllabus || null;
      const essayFull = syl?.essayFullMark > 0 ? Number(syl.essayFullMark) : 100;
      const weights = { ...DEFAULT_WEIGHTS, ...(syl?.weights || {}) };
      const tw = syl?.taskWeights || {};
      const parts = [];
      for (const kind of ["assignment", "lesson", "exam"]) {
        const list = items.filter((i) => i.kind === (kind === "assignment" ? "essay" : kind));
        if (list.length === 0) continue; // 该类别还没有任务，跳过
        let sum = 0;
        let wsum = 0;
        for (const it of list) {
          // 纯讲解（无练习题）的阅读没有分值，不拖低类别得分率
          if (it.kind === "lesson" && it.max == null) continue;
          const wRaw = Number(tw[it.refId]);
          const weight = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
          const max = it.kind === "lesson" ? it.max : essayFull;
          const pct = it.score != null && max > 0 ? Math.min(1, it.score / max) : 0;
          sum += weight * pct;
          wsum += weight;
        }
        const catScore = wsum > 0 ? (100 * sum) / wsum : 0;
        parts.push({ kind, weight: weights[kind] ?? 0, score: Math.round(catScore * 10) / 10 });
      }
      const weightSum = parts.reduce((s, p) => s + p.weight, 0);
      const weighted =
        weightSum > 0
          ? Math.round((parts.reduce((s, p) => s + (p.score * p.weight) / 100, 0) * 100) / weightSum * 10) / 10
          : null;

      return {
        userId: uid,
        username: u.username,
        realName: u.realName || "",
        school: u.school || "",
        items,
        weighted: weighted == null ? null : { total: weighted, parts },
        total: scored.reduce((sum, i) => sum + i.score, 0),
        maxTotal: items.filter((i) => i.max != null).reduce((sum, i) => sum + i.max, 0),
        doneCount: scored.length,
        totalCount: items.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.weighted?.total ?? b.total) - (a.weighted?.total ?? a.total));

  res.json({
    course: courseSummary(c),
    syllabus: c.syllabus || null,
    defaultWeights: DEFAULT_WEIGHTS,
    columns: [
      ...c.assignments.map((a) => ({ kind: "essay", refId: a.id, title: a.title, max: a.maxWords })),
      ...(c.lessons || []).map((l) => ({ kind: "lesson", refId: l.id, title: l.title })),
    ],
    rows,
  });
});

// ---------- 页面托管 ----------

const distDir = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

// 先加载数据库，再启动服务
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`English Writing Tutor backend listening on http://localhost:${PORT}`);
    console.log(`AI 模式：${hasAPIKey() ? "DeepSeek 已接入" : "演示模式（未配置 DEEPSEEK_API_KEY）"}`);
    console.log(`数据存储：${cloudDbEnabled ? "Upstash 云端数据库" : "本地文件 data/db.json"}`);
    console.log(`已注册用户：${db.users.length} 人${db.users.length === 0 ? "（第一个注册的用户将成为管理员）" : ""}`);
  });
});

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
  u.usage.count++;
  save();
  next();
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

function saveRecord(userId, type, body, profile, result) {
  const record = {
    id: newId(),
    userId,
    type,
    profile: { target: profile.target, cefr: profile.cefr, challenge: profile.challenge },
    task: body.task || "",
    essay: body.essay || "",
    result,
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

// 课程：{ id, name, startAt, endAt, teacherId, members[], notices[], assignments[], createdAt }
// 作业：{ id, title, task, mode, target, cefr, challenge, createdAt }（类型/难度由老师锁定）
// 提交：{ id, courseId, assignmentId, userId, essay, task, profile, aiResult, adminReview, status, submittedAt }

const courseSummary = (c) => ({
  id: c.id,
  name: c.name,
  startAt: c.startAt,
  endAt: c.endAt,
  teacher: db.users.find((u) => u.id === c.teacherId)?.username || "未知",
  memberCount: c.members.length,
  noticeCount: c.notices.length,
  assignmentCount: c.assignments.length,
  createdAt: c.createdAt,
});

const submissionSummary = (s, withUser = true) => ({
  id: s.id,
  assignmentId: s.assignmentId,
  userId: s.userId,
  username: withUser ? db.users.find((u) => u.id === s.userId)?.username || "未知" : undefined,
  realName: withUser ? db.users.find((u) => u.id === s.userId)?.realName || "" : undefined,
  status: s.status,
  submittedAt: s.submittedAt,
  aiScore: s.aiResult?.score ?? null,
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
    notices: c.notices.slice().sort((a, b) => b.createdAt - a.createdAt),
    assignments,
    members: isAdmin
      ? c.members.map((id) => userSummary(db.users.find((u) => u.id === id))).filter((u) => u.id)
      : undefined,
    mySubmissions: isAdmin
      ? undefined
      : db.submissions
          .filter((s) => s.courseId === c.id && s.userId === req.user.id)
          .map((s) => submissionSummary(s, false)),
    submissions: isAdmin
      ? db.submissions.filter((s) => s.courseId === c.id).map((s) => submissionSummary(s))
      : undefined,
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
  const assignment = {
    id: newId(),
    title,
    task,
    mode: req.body.mode === "practical" ? "practical" : "exam",
    target: String(req.body.target || "cet4"),
    cefr: String(req.body.cefr || "B1"),
    challenge: String(req.body.challenge || "match"),
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

// 学生可提交的作业列表（跨课程，含提交状态）
app.get("/api/assignments/available", authRequired, (req, res) => {
  const myCourses = db.courses.filter((c) => c.members.includes(req.user.id));
  const items = [];
  for (const c of myCourses) {
    for (const a of c.assignments) {
      const submitted = db.submissions.some((s) => s.assignmentId === a.id && s.userId === req.user.id);
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
        submitted,
      });
    }
  }
  res.json({ assignments: items });
});

// 学生提交作业：一次锁定，AI 批改并进入老师复核队列
app.post("/api/assignments/:id/submit", authRequired, quotaRequired, async (req, res) => {
  const course = db.courses.find((c) => c.assignments.some((a) => a.id === req.params.id));
  const assignment = course?.assignments.find((a) => a.id === req.params.id);
  if (!course || !assignment) return res.status(404).json({ error: "作业不存在" });
  if (req.user.role !== "admin" && !course.members.includes(req.user.id)) {
    return res.status(403).json({ error: "你不在这门课程中，不能提交该作业" });
  }
  if (db.submissions.some((s) => s.assignmentId === assignment.id && s.userId === req.user.id)) {
    return res.status(400).json({ error: "该作业已提交过，不能重复提交。如需修改请联系老师。" });
  }
  const essay = (req.body.essay || "").trim();
  if (essay.length < 30) return res.status(400).json({ error: "作文内容太短，请至少写 30 个字符" });

  // 画像由老师布置作业时锁定，学生无法修改
  const profile = normalizeProfile({
    mode: assignment.mode,
    target: assignment.target,
    cefr: assignment.cefr,
    challenge: assignment.challenge,
  });
  const data = await generate({
    prompt: feedbackPrompt(profile, assignment.task, essay),
    mock: mockFeedback(profile, assignment.task, essay),
  });
  const submission = {
    id: newId(),
    courseId: course.id,
    assignmentId: assignment.id,
    userId: req.user.id,
    essay,
    task: assignment.task,
    profile: { target: profile.target, cefr: profile.cefr, challenge: profile.challenge },
    aiResult: data,
    adminReview: null,
    status: "pending",
    submittedAt: Date.now(),
  };
  db.submissions.push(submission);
  const recordId = saveRecord(req.user.id, "feedback", { task: assignment.task, essay }, profile, data);
  save();
  res.json({ ...data, recordId, submissionId: submission.id, courseName: course.name, assignmentTitle: assignment.title });
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

// 学生查看自己的提交详情（含老师复核结果）
app.get("/api/my/submissions/:assignmentId", authRequired, (req, res) => {
  const s = db.submissions.find(
    (x) => x.assignmentId === req.params.assignmentId && x.userId === req.user.id
  );
  if (!s) return res.status(404).json({ error: "尚未提交该作业" });
  res.json({ submission: { ...s } });
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

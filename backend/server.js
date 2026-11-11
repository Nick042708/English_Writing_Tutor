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

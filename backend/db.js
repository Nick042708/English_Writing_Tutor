// 数据层：默认本地 JSON 文件；配置 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 后
// 自动切换为云端持久化（用于 Render 等免费平台休眠重启后数据不丢失）
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR 环境变量可覆盖数据目录（用于测试隔离），默认为项目根目录下的 data/
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const cloudDbEnabled = Boolean(REDIS_URL && REDIS_TOKEN);

// 内存中的数据库对象（内存读写永远走这里，持久化由 save() 负责）
export const db = { users: [], records: [], sessions: [] };

// 诊断信息：/api/health 会暴露，便于排查部署环境的数据加载问题
export const dbStatus = {
  cloudEnabled: cloudDbEnabled,
  cloudLoadOk: false, // 是否已成功从云端加载过数据
  loadedAt: null,
  lastError: null,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function redisCmd(command, ...args) {
  // 10 秒超时，避免启动阶段被挂起的请求卡死
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify([command, ...args]),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Redis ${command} 失败：HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Redis ${command} 失败：${data.error}`);
  return data.result;
}

function applyParsed(parsed) {
  db.users = parsed.users || [];
  db.records = parsed.records || [];
  db.sessions = parsed.sessions || [];
}

// 启动时调用：从云端或本地文件加载已有数据
// 云端模式下失败会自动重试 3 次；仍然失败则启动后台补加载，
// 并在补加载成功前禁止 save() 写云端，防止空数据覆盖云端真实数据
export async function initDb() {
  if (cloudDbEnabled) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await redisCmd("GET", "wt:db");
        if (raw) {
          applyParsed(JSON.parse(raw));
          console.log(`[DB] 云端数据库加载完成（用户 ${db.users.length}，记录 ${db.records.length}）`);
        } else {
          console.log("[DB] 云端数据库为空，全新开始");
        }
        dbStatus.cloudLoadOk = true;
        dbStatus.loadedAt = new Date().toISOString();
        dbStatus.lastError = null;
        return;
      } catch (err) {
        dbStatus.lastError = `${new Date().toISOString()} 第${attempt}次: ${err.message}`;
        console.error(`[DB] 云端加载失败（第 ${attempt}/3 次）：`, err.message);
        if (attempt < 3) await sleep(2000);
      }
    }
    // 三次都失败：启动后台补加载，加载成功前 save() 不写云端
    console.error("[DB] 启动重试均失败，转为后台补加载（期间禁止写云端，保护云端数据）");
    backgroundLoad();
    return;
  }
  try {
    applyParsed(JSON.parse(fs.readFileSync(DB_PATH, "utf-8")));
    console.log(`[DB] 本地数据库加载完成（用户 ${db.users.length}，记录 ${db.records.length}）`);
  } catch {
    console.log("[DB] 本地数据库为空，全新开始");
  }
}

async function backgroundLoad() {
  while (!dbStatus.cloudLoadOk) {
    await sleep(10000);
    try {
      const raw = await redisCmd("GET", "wt:db");
      if (raw) applyParsed(JSON.parse(raw));
      dbStatus.cloudLoadOk = true;
      dbStatus.loadedAt = new Date().toISOString();
      console.log(`[DB] 后台补加载成功（用户 ${db.users.length}，记录 ${db.records.length}）`);
    } catch (err) {
      dbStatus.lastError = `${new Date().toISOString()} 后台补加载: ${err.message}`;
      console.error("[DB] 后台补加载仍失败：", err.message);
    }
  }
}

function writeLocal() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// 任何修改 db 后调用 save() 完成持久化（异步写入，不阻塞请求）
// 保护机制：云端模式下若尚未成功加载过云端数据，禁止写云端（防止空数据覆盖真实数据），
// 此时写入本地文件兜底，等后台补加载成功后恢复云端写入
export function save() {
  if (cloudDbEnabled && dbStatus.cloudLoadOk) {
    redisCmd("SET", "wt:db", JSON.stringify(db)).catch((err) => {
      console.error("[DB] 云端写入失败：", err.message);
      try { writeLocal(); } catch { /* 本地也失败则忽略 */ }
    });
  } else if (cloudDbEnabled) {
    console.warn("[DB] 云端尚未加载成功，本次变更暂存本地文件（不会丢失，下次部署时合并）");
    try { writeLocal(); } catch { /* 忽略 */ }
  } else {
    writeLocal();
  }
}

export const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const newId = () => crypto.randomBytes(8).toString("hex");
export const newToken = () => crypto.randomBytes(24).toString("hex");

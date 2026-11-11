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

async function redisCmd(command, ...args) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify([command, ...args]),
  });
  if (!res.ok) throw new Error(`Redis ${command} 失败：HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Redis ${command} 失败：${data.error}`);
  return data.result;
}

// 启动时调用：从云端或本地文件加载已有数据
export async function initDb() {
  if (cloudDbEnabled) {
    try {
      const raw = await redisCmd("GET", "wt:db");
      if (raw) {
        const parsed = JSON.parse(raw);
        db.users = parsed.users || [];
        db.records = parsed.records || [];
        db.sessions = parsed.sessions || [];
        console.log(`[DB] 云端数据库加载完成（用户 ${db.users.length}，记录 ${db.records.length}）`);
      } else {
        console.log("[DB] 云端数据库为空，全新开始");
      }
      return;
    } catch (err) {
      console.error("[DB] 云端加载失败，回退本地文件：", err.message);
    }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    db.users = parsed.users || [];
    db.records = parsed.records || [];
    db.sessions = parsed.sessions || [];
    console.log(`[DB] 本地数据库加载完成（用户 ${db.users.length}，记录 ${db.records.length}）`);
  } catch {
    console.log("[DB] 本地数据库为空，全新开始");
  }
}

function writeLocal() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// 任何修改 db 后调用 save() 完成持久化（异步写入，不阻塞请求）
export function save() {
  if (cloudDbEnabled) {
    redisCmd("SET", "wt:db", JSON.stringify(db)).catch((err) => {
      console.error("[DB] 云端写入失败：", err.message);
      try { writeLocal(); } catch { /* 本地也失败则忽略 */ }
    });
  } else {
    writeLocal();
  }
}

export const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const newId = () => crypto.randomBytes(8).toString("hex");
export const newToken = () => crypto.randomBytes(24).toString("hex");

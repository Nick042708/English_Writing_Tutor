// LLM 调用层：DeepSeek（OpenAI 兼容格式），要求 JSON 输出并做健壮解析
// 未配置 DEEPSEEK_API_KEY 时返回 null，由上层切换到演示模式

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function extractJSON(text) {
  if (!text) throw new Error("模型返回为空");
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型返回中未找到 JSON");
  return JSON.parse(t.slice(start, end + 1));
}

export function hasAPIKey() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export async function chatJSON({ system, user }) {
  if (!hasAPIKey()) return null;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API 请求失败（HTTP ${res.status}）：${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return extractJSON(data.choices?.[0]?.message?.content);
}

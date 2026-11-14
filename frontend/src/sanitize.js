// AI 返回的 JSON 形状偶发不符合预期（如数组元素是对象、progress 是对象、score 是字符串）。
// 这类数据存进历史记录后直接渲染会触发 React #31（Objects are not valid as a React child）整页白屏。
// 本模块把 AI 结果按已知 schema 深度净化为可安全渲染的形状，所有展示入口统一调用。

// 把任意值安全地转成可展示文本
export function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join("；");
  if (typeof v === "object") {
    // 常见包装对象：优先取里面最像正文内容的字段
    for (const k of ["text", "label", "comment", "content", "item", "meaning", "name", "title", "value", "detail"]) {
      if (typeof v[k] === "string" && v[k]) return v[k];
    }
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const optText = (v) => (v == null ? "" : asText(v));

// 批改结果：总评/维度/加分项/逐句批注/升级对比/行动计划
export function sanitizeFeedbackResult(result) {
  if (!result || typeof result !== "object") {
    return { notice: "（该记录的数据格式异常，仅能展示提示信息）" };
  }
  const r = { ...result };
  if (r.overall != null) r.overall = asText(r.overall);
  if (r.taskBrief != null) r.taskBrief = asText(r.taskBrief);
  if (r.notice != null) r.notice = asText(r.notice);
  // score 兼容对象 {label, comment} 与旧版字符串两种形态
  if (r.score != null) {
    r.score =
      typeof r.score === "object" && !Array.isArray(r.score)
        ? { label: asText(r.score.label), comment: asText(r.score.comment) }
        : { label: asText(r.score), comment: "" };
  }
  if (r.progress != null) r.progress = asText(r.progress);
  r.dimensions = arr(r.dimensions).map((d) =>
    !d || typeof d !== "object"
      ? { name: asText(d), status: "", comment: "" }
      : { ...d, name: asText(d.name), status: typeof d.status === "string" ? d.status : "", comment: asText(d.comment) }
  );
  r.bonus = arr(r.bonus).map(asText).filter(Boolean);
  r.annotations = arr(r.annotations).map((a) =>
    !a || typeof a !== "object"
      ? { quote: asText(a), type: "", comment: "", suggestion: "" }
      : { ...a, quote: asText(a.quote), type: typeof a.type === "string" ? a.type : "", comment: asText(a.comment), suggestion: optText(a.suggestion) }
  );
  r.upgrades = arr(r.upgrades).map((u) =>
    !u || typeof u !== "object"
      ? { original: asText(u), improved: "", note: "" }
      : { ...u, original: asText(u.original), improved: asText(u.improved), note: optText(u.note) }
  );
  r.actionPlan = arr(r.actionPlan).map(asText).filter(Boolean);
  return r;
}

// 素材结果：词汇短语/句式结构/句子/段落
export function sanitizeMaterialsResult(result) {
  if (!result || typeof result !== "object") {
    return { notice: "（该记录的数据格式异常，仅能展示提示信息）" };
  }
  const r = { ...result };
  if (r.taskBrief != null) r.taskBrief = asText(r.taskBrief);
  if (r.notice != null) r.notice = asText(r.notice);
  const vocab = r.vocab && typeof r.vocab === "object" && !Array.isArray(r.vocab) ? r.vocab : {};
  r.vocab = {
    phrases: arr(vocab.phrases).map((p) =>
      !p || typeof p !== "object"
        ? { item: asText(p), meaning: "", example: "", note: "" }
        : { ...p, item: asText(p.item), meaning: asText(p.meaning), example: optText(p.example), note: optText(p.note) }
    ),
    structures: arr(vocab.structures).map((s) =>
      !s || typeof s !== "object"
        ? { item: asText(s), pattern: "", meaning: "", example: "" }
        : { ...s, item: asText(s.item), pattern: typeof s.pattern === "string" ? s.pattern : "", meaning: asText(s.meaning), example: optText(s.example) }
    ),
  };
  r.sentences = arr(r.sentences).map((s) =>
    !s || typeof s !== "object"
      ? { device: "", sentence: asText(s), translation: "", usage: "" }
      : { ...s, device: typeof s.device === "string" ? s.device : "", sentence: asText(s.sentence), translation: asText(s.translation), usage: optText(s.usage) }
  );
  r.paragraphs = arr(r.paragraphs).map((p) =>
    !p || typeof p !== "object"
      ? { style: "", text: asText(p), highlights: [] }
      : { ...p, style: typeof p.style === "string" ? p.style : "", text: asText(p.text), highlights: arr(p.highlights).map(asText).filter(Boolean) }
  );
  return r;
}

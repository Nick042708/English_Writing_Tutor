// 两步画像系统：第一步选模式，第二步选具体目标，最终统一为「难度档位 + 语域风格」
// 难度档位(cefr) 决定词汇句式复杂度上限；语域(register) 决定考试套路 / academic / authentic 语言风格

export const EXAMS = [
  { id: "zhongkao", label: "中考", cefr: "A2", register: "exam", examRubric: "中考英语书面表达评分标准（内容要点覆盖、语言准确性、行文连贯）" },
  { id: "gaokao", label: "高考", cefr: "B1", register: "exam", examRubric: "高考英语书面表达评分标准（内容要点、词汇语法的准确与多样性、连贯衔接）" },
  { id: "cet4", label: "大学英语四级", cefr: "B1+", register: "exam", examRubric: "CET-4 作文评分档次（13/11/8/6/4 分档：切题、表达清楚、文字连贯）" },
  { id: "cet6", label: "大学英语六级", cefr: "B2", register: "exam", examRubric: "CET-6 作文评分档次（切题、表达思想清楚、文字通顺连贯、基本无语言错误）" },
  { id: "kaoyan", label: "考研英语", cefr: "B2+", register: "exam", examRubric: "考研英语写作评分标准（信息点完整性、语言准确性与多样性、格式与语域恰当性）" },
  { id: "ielts", label: "雅思", cefr: "B2–C1", register: "exam-academic", examRubric: "雅思写作评分标准：Task Response / Coherence & Cohesion / Lexical Resource / Grammatical Range and Accuracy" },
  { id: "toefl", label: "托福", cefr: "B2–C1", register: "academic", examRubric: "TOEFL Independent Writing rubric：topic development / language use / organization and coherence" },
];

export const PRACTICAL = [
  { id: "life", label: "生活运用", register: "authentic", cefrDefault: "B1" },
  { id: "campus", label: "校园运用", register: "semi-academic", cefrDefault: "B2" },
  { id: "workplace", label: "职场运用", register: "professional", cefrDefault: "B2" },
];

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const REGISTER_TEXT = {
  exam: "考试导向：提供符合中国英语考试阅卷偏好的「安全高分」表达，用词准确、句式规范、结构工整，避免过于口语化或生僻的表达",
  "exam-academic": "考试+学术导向：符合国际语言考试高分范文风格，准确且有区分度的搭配、多样的句式、清晰的逻辑连接",
  academic: "学术导向：正式书面语，academic collocations、名词化表达、客观审慎的语气（hedging），适合课程论文与学术写作",
  authentic: "真实场景导向：母语者日常真实使用的地道表达，自然、鲜活、允许口语化，避免教科书腔",
  "semi-academic": "校园场景导向：介于正式与自然之间，适合课堂展示、社团邮件、学生组织沟通",
  professional: "职场导向：商务书面语，简洁专业、礼貌得体，适合邮件、报告、申请材料",
};

// 难度偏好：在档位基础上的微调，解决「档位内的素材对高水平学习者太简单」的问题
export const CHALLENGES = {
  match: { id: "match", label: "匹配我的水平", text: "难度与 CEFR 档位精确匹配：素材主体落在该档位，少量素材略高一档作为学习增量" },
  stretch: { id: "stretch", label: "拔高挑战", text: "系统性拔高约一档：至少 70% 的素材达到更高一档的水平，讲解要清楚「比基础版高级在哪」，让学习者踮脚够得着" },
  sprint: { id: "sprint", label: "冲刺高分", text: "瞄准该考试/场景的最高档位：提供阅卷官眼中有辨识度的高级表达（目标档位上限），严禁出现低于目标档位的幼稚表达；每条素材附「使用风险提示」（什么场合能用、什么场合会翻车），防止学习者机械堆砌" },
};

// 把前端传来的画像参数规范化为统一的画像对象
export function normalizeProfile(body = {}) {
  const mode = body.mode === "practical" ? "practical" : "exam";
  const challenge = CHALLENGES[body.challenge] ? body.challenge : "match";
  let cefr, register, targetLabel, examRubric = null;

  if (mode === "exam") {
    const exam = EXAMS.find((e) => e.id === body.target) || EXAMS[2];
    cefr = exam.cefr;
    register = exam.register;
    targetLabel = exam.label;
    examRubric = exam.examRubric;
  } else {
    const scene = PRACTICAL.find((s) => s.id === body.target) || PRACTICAL[0];
    cefr = CEFR_LEVELS.includes(body.cefr) ? body.cefr : scene.cefrDefault;
    register = scene.register;
    targetLabel = scene.label;
  }

  return {
    mode,
    target: targetLabel,
    cefr,
    register,
    registerText: REGISTER_TEXT[register],
    examRubric,
    challenge,
    challengeText: CHALLENGES[challenge].text,
  };
}

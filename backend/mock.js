// 演示模式数据：未配置 API Key 或 API 调用失败时返回，保证产品可完整体验
// 内容按 CEFR B2 / 考试+学术语域编写，字段结构与真实接口完全一致

export function mockMaterials(profile, task) {
  return {
    taskBrief: `【演示数据】这是一道典型的观点论证类写作任务，要求表明立场并给出 2-3 个论据支撑，配一个让步段会更有说服力。`,
    vocab: {
      phrases: [
        { item: "play a pivotal role in", meaning: "在……中起关键作用", example: `Whether students should take a gap year plays a pivotal role in shaping their long-term career prospects.`, note: "比 important 高级，注意搭配介词 in + doing" },
        { item: "a double-edged sword", meaning: "双刃剑（有利有弊）", example: "Social media is a double-edged sword: it connects people yet distorts their attention.", note: "议论文引出利弊时的高频表达" },
        { item: "be conducive to", meaning: "有助于（+名词/doing）", example: "A structured plan is conducive to making the most of a gap year.", note: "正式书面语，避免写成 conducive for" },
        { item: "at the expense of", meaning: "以……为代价", example: "Chasing grades at the expense of genuine curiosity undermines the very purpose of education.", note: "用于让步段或警示句，含消极色彩" },
        { item: "strike a balance between A and B", meaning: "在 A 与 B 之间取得平衡", example: "Young people should strike a balance between exploring new options and staying committed to their goals.", note: "结论段的稳妥收束表达" },
        { item: "broaden one's horizons", meaning: "开阔眼界", example: "Traveling and volunteering during a gap year can significantly broaden students' horizons.", note: "经典话题词，可升级为 expand one's intellectual horizons" },
        { item: "be well-equipped to", meaning: "具备充分能力去……", example: "Students who work part-time are often better equipped to handle real-world pressure.", note: "常用于论证好处，注意 be equipped 被动形式" },
      ],
      structures: [
        { item: "Not only + 倒装 ..., but ... also ...", pattern: "倒装句", meaning: "强调两层递进的益处，倒装是明显的语法亮点", example: "Not only does a gap year refresh students' minds, but it also clarifies their academic direction." },
        { item: "It is ... that ...", pattern: "强调句", meaning: "强调句子核心信息，突出论点重心", example: "It is the ability to reflect, rather than the travel itself, that makes a gap year valuable." },
        { item: "Doing ..., students can ...", pattern: "非谓语（现在分词作状语）", meaning: "用分词短语作原因/条件状语，句式更紧凑", example: "Working before entering university, students gain a clearer sense of what they truly want." },
        { item: "While it is true that ..., ...", pattern: "让步复合句", meaning: "先承认对立观点再反驳，论证更立体", example: "While it is true that a gap year may delay graduation, the maturity it brings often outweighs the delay." },
        { item: "There is no denying that ...", pattern: "固定引导句型", meaning: "引出无争议的事实基础，再展开论证", example: "There is no denying that academic performance still matters in job markets." },
        { item: "..., which in turn ...", pattern: "非限制性定语从句", meaning: "表达因果链，体现逻辑深度", example: "Such experiences build confidence, which in turn helps students adapt to campus life." },
      ],
    },
    sentences: [
      { sentence: "Education is not the filling of a pail, but the lighting of a fire.", device: "金句·引用", translation: "教育不是注满一桶水，而是点燃一把火。", usage: "讨论教育与成长类话题时作为引子，署名叶芝更显积累" },
      { sentence: "The value of an experience lies not in what we do, but in how we reflect on what we have done.", device: "金句·对比", translation: "经历的价值不在于我们做了什么，而在于我们如何反思所做之事。", usage: "用于论证「行动 + 反思」类观点的核心句" },
      { sentence: "While some argue that immediate enrollment keeps knowledge fresh, others believe a pause fosters maturity.", device: "对比", translation: "有人认为直接入学能保持知识新鲜，另一些人则认为间隔一年能促进成熟。", usage: "开篇呈现对立观点，再表明立场" },
      { sentence: "Admittedly, a year away from textbooks may slow academic momentum; however, life itself is a classroom no less instructive.", device: "让步", translation: "诚然，离开课本一年会减缓学业势头；然而，生活本身就是一间毫不逊色的课堂。", usage: "让步段的主旨句，先退一步再反击" },
      { sentence: "A survey by the National Society of High School Scholars found that 90% of students who took a gap year returned to college with clearer goals.", device: "数据引用", translation: "一项调查显示，90% 休学一年的学生带着更清晰的目标重返大学。", usage: "需要增强说服力时引入具体数据支撑" },
    ],
    paragraphs: [
      { style: "稳妥考试型", text: "There is no denying that academic performance remains a key criterion in university admission. Working systematically before entering university, students can consolidate what they have learned and thus start college with confidence. Moreover, a well-structured review plan is conducive to maintaining academic momentum, which in turn helps them adapt quickly to the demanding pace of higher education.", highlights: ["使用了 no denying 引导句型", "用分词状语 Working systematically... 开头", "融入 is conducive to 与 which in turn 两个搭配"] },
      { style: "亮点加分型", text: "Not only does a gap year refresh tired minds, but it also reveals directions that a classroom never could. It is reflection, rather than the journey itself, that transforms a year of wandering into a year of growth. While critics worry that students may lose momentum, life itself is a classroom no less instructive; those who emerge from it are often better equipped to chart their own course.", highlights: ["开篇倒装 Not only does...", "强调句 It is ... that ...", "让步结构 While critics worry..., 后接 no less instructive 的对比修辞"] },
      { style: "简洁清晰型", text: "A gap year offers benefits that go beyond the classroom. Students who travel, work or volunteer learn to manage money, time and relationships on their own. These skills build confidence, which in turn makes the transition to university life much smoother. For many young people, one year of real-world experience is worth more than another year of preparation.", highlights: ["定语从句 Students who... 保持句式简洁", "which in turn 衔接因果", "结尾用对比句收束，朴素有力"] },
    ],
  };
}

export function mockFeedback(profile, task, essay) {
  const isExam = profile.mode === "exam";
  return {
    overall: `【演示数据】这篇作文立场明确、结构完整，能够围绕任务展开论述，整体达到了${profile.cefr}档位的合格线。主要问题在于：部分句子表达偏直译，论证以「摆观点」为主、缺少具体支撑（例子/数据/因果链），以及个别搭配使用不当。优先解决「论证展开不足」，分数档位会有明显提升。`,
    score: {
      label: isExam ? `${profile.target} 中档（演示）` : "良好（演示）",
      comment: "内容切题、无重大语法错误，但论证深度和语言多样性尚未进入上一档。",
    },
    dimensions: [
      { name: "目标达成", status: "good", comment: "观点清晰，任务要求的要点基本覆盖，读者能明确知道你的立场。" },
      { name: "内容充实", status: "warn", comment: "每个论点平均只有一句话支撑，缺少具体事例或数据的展开，「观点多、论证薄」是当前最大的失分点。" },
      { name: "逻辑连贯", status: "warn", comment: "段落之间缺少过渡信号词，第二段和第三段的论证跳跃较大，建议在段首补足逻辑桥。" },
      { name: "词汇运用", status: "good", comment: "用词总体准确，有 2 处搭配不当（见批注），整体词汇丰富度符合你的档位但亮点不足。" },
      { name: "语法句式", status: "bad", comment: "全文以简单句为主，句式单一；有一处主谓一致错误和一处时态混用，属于易改的硬伤。" },
    ],
    bonus: [
      "结尾句用了比喻，给文章留下了记忆点，是阅卷时的加分细节",
      "第二段的让步表达「Admittedly...」体现了思辨意识，方向值得保持",
    ],
    annotations: [
      { quote: "I think this is very important", type: "表达", comment: "表述过于空泛，important 是低区分度词汇，且 I think 削弱了论证力度", suggestion: "改为 This point is particularly significant because...，或直接用现象引出观点" },
      { quote: "it can make students to become more independent", type: "语法", comment: "make + sb + do（不带 to），这里是动词搭配错误", suggestion: "改为 it can make students more independent 或 enable students to become more independent" },
      { quote: "the society is developing quickly", type: "词汇", comment: "the society 是中式英语，且 developing quickly 表达笼统", suggestion: "改为 society is evolving at an unprecedented pace，去掉冠词并提升搭配" },
      { quote: "In a word, I said my opinion", type: "表达", comment: "In a word 用法没错但搭配的 I said my opinion 不地道", suggestion: "改为 In conclusion, the arguments above support the view that..." },
    ],
    upgrades: [
      { original: "Students can learn many things from society.", improved: "Stepping out of the classroom, students acquire skills that textbooks rarely offer.", note: "用分词状语开头增加句式变化，learn many things 升级为更精确的 acquire skills" },
      { original: "So I believe students should take a gap year.", improved: "Taken together, these benefits make a compelling case for students to spend a year exploring before college.", note: "结论句从口语化的 So I believe 升级为正式的归纳句式，呼应全文论证" },
      { original: "Some people agree, but some people do not agree.", improved: "Opinions on this issue vary: while some embrace it as an opportunity, others regard it as a detour.", note: "消除重复的 agree，用 while 对比结构呈现对立观点" },
    ],
    actionPlan: [
      "每周精写 1 段「观点 + 例证 + 因果分析」的论证段，重点练习把一个论点展开到 4-5 句",
      "建立个人搭配本：每学一个新搭配，仿写 2 个与本话题相关的句子",
      "每周朗读并抄写 5 个母语者例句（可复用本工具的句子素材），培养语感",
      "下次写作前先用 5 分钟列提纲，确保每段都有过渡信号词",
    ],
  };
}

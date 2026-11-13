// 逐题作答 + 材料块 功能回归测试
// 用法：先启动隔离实例 PORT=3002 DATA_DIR=<空目录> DEEPSEEK_API_KEY="" node test-perquestion.mjs
const BASE = "http://127.0.0.1:3002";
let passed = 0;
let failed = 0;
const ok = (name, cond) => {
  if (cond) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}`);
  }
};
const api = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const future = Date.now() + 7 * 864e5;

// ---- 注册账号 ----
const admin = (await api("POST", "/api/register", { username: "pq_admin", password: "pass123", realName: "管理员", school: "测试中学" })).data;
const stu = (await api("POST", "/api/register", { username: "pq_stu", password: "pass123", realName: "学生甲", school: "测试中学" })).data;
ok("注册管理员与学生", !!admin.token && !!stu.token && admin.user?.role === "admin");

// ---- 建课 + 加学员 ----
const course = (await api("POST", "/api/courses", { name: "逐题测试课", startAt: "2026-11-14", endAt: "2026-12-31" }, admin.token)).data.course;
ok("创建课程", !!course?.id);
await api("POST", `/api/courses/${course.id}/members`, { username: "pq_stu" }, admin.token);

// ---- 发布含材料块的阅读（2 选择 + 1 唯一答案填空，限 2 次）----
const pub = await api(
  "POST",
  `/api/courses/${course.id}/lessons`,
  {
    title: "材料同屏测试",
    blocks: [
      { type: "md", text: "## 讲解" },
      { type: "material", text: "[A] sentence one\n[B] sentence two\n[C] sentence three" },
      { type: "exercise", index: 0 },
      { type: "exercise", index: 1 },
      { type: "exercise", index: 2 },
    ],
    exercises: [
      { type: "choice", prompt: "Q1: which is one?", options: ["A1", "B2", "C3"], answer: 0, points: 2 },
      { type: "choice", prompt: "Q2: which is two?", options: ["A1", "B2", "C3"], answer: 1, points: 2 },
      { type: "blank", mode: "unique", prompt: "Q3: fill three", answers: ["three"], points: 2 },
    ],
    maxAttempts: 2,
    deadline: future,
  },
  admin.token
);
ok("发布含材料块的阅读", pub.status === 200 && pub.data.lesson.blocks.some((b) => b.type === "material"));
const lesson = pub.data.lesson;
const [q1, q2, q3] = lesson.exercises;

// ---- 学生视角：材料可见、答案不暴露 ----
const detail = (await api("GET", `/api/courses/${course.id}`, null, stu.token)).data;
ok("学生可见材料块", detail.lessons[0].blocks.some((b) => b.type === "material"));
ok("学生端不暴露标准答案", detail.lessons[0].exercises.every((e) => e.answer === undefined && e.answers === undefined));
ok("课程详情返回 myLessonAnswers 数组", Array.isArray(detail.myLessonAnswers));

// ---- 逐题作答：答错不揭示，答对揭示 ----
let r = await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q1.id, answer: "1" }, stu.token); // 答错
ok("Q1 第一次答错 correct=false", r.data.correct === false && r.data.attempt === 1);
ok("答错且还有次数时不揭示答案", r.data.revealAnswer == null);
r = await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q1.id, answer: "0" }, stu.token); // 答对
ok("Q1 第二次答对", r.data.correct === true && r.data.auto === 2);
ok("答对后揭示答案", r.data.revealAnswer?.kind === "choice" && r.data.revealAnswer.index === 0);

// ---- 次数上限：Q2 连错 2 次后揭示且拒绝再答 ----
await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q2.id, answer: "0" }, stu.token);
r = await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q2.id, answer: "2" }, stu.token);
ok("Q2 两次答错后 exhausted 揭示", r.data.correct === false && r.data.revealAnswer?.index === 1);
r = await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q2.id, answer: "1" }, stu.token);
ok("次数用尽后拒绝再答", r.status === 400 && /上限/.test(r.data.error || ""));

// ---- 唯一答案填空（忽略大小写）----
r = await api("POST", `/api/lessons/${lesson.id}/answer`, { exerciseId: q3.id, answer: "THREE!" }, stu.token);
ok("Q3 忽略大小写与标点判对", r.data.correct === true);

// ---- myLessonAnswers 恢复状态含揭示 ----
const d2 = (await api("GET", `/api/courses/${course.id}`, null, stu.token)).data;
const a1 = d2.myLessonAnswers.filter((a) => a.exerciseId === q1.id).pop();
ok("myLessonAnswers 已揭示的题带 revealAnswer", a1?.revealAnswer?.kind === "choice");
const a2 = d2.myLessonAnswers.filter((a) => a.exerciseId === q2.id).pop();
ok("次数用尽的题也带 revealAnswer", a2?.revealAnswer?.index === 1);

// ---- 成绩统计：逐题模型得分 4/6 ----
const grades = (await api("GET", `/api/courses/${course.id}/grades`, null, admin.token)).data;
const row = grades.rows.find((x) => x.username === "pq_stu");
const item = row.items.find((i) => i.kind === "lesson" && i.refId === lesson.id);
ok("成绩统计逐题得分 4/6", item?.score === 4 && item?.max === 6);

// ---- 教师批改视图：answersByUser ----
const gv = (await api("GET", `/api/lessons/${lesson.id}/grades`, null, admin.token)).data;
const ansRow = (gv.answersByUser || []).find((x) => x.username === "pq_stu");
ok("批改视图按学生汇总逐题作答", !!ansRow && Object.keys(ansRow.answers).length === 3);

// ---- 逐题模型拒绝未作答词数不足的灵活题 ----
const pub2 = await api(
  "POST",
  `/api/courses/${course.id}/lessons`,
  {
    title: "灵活题测试",
    blocks: [{ type: "material", text: "A short story." }, { type: "exercise", index: 0 }],
    exercises: [{ type: "blank", mode: "flexible", prompt: "Write a topic sentence.", minWords: 10, points: 5 }],
  },
  admin.token
);
const l2 = pub2.data.lesson;
let r2 = await api("POST", `/api/lessons/${l2.id}/answer`, { exerciseId: l2.exercises[0].id, answer: "too short" }, stu.token);
ok("灵活题词数不足被拒", r2.status === 400 && /词数不足/.test(r2.data.error || ""));
r2 = await api("POST", `/api/lessons/${l2.id}/answer`, { exerciseId: l2.exercises[0].id, answer: "A good topic sentence clearly captures the main idea of the whole paragraph." }, stu.token);
ok("灵活题提交待批改", r2.data.pendingReview === true);

// 老师批改 → 成绩更新
await api("POST", `/api/lessons/${l2.id}/review`, { userId: stu.user.id, scores: { [l2.exercises[0].id]: 4 }, comment: "不错" }, admin.token);
const grades2 = (await api("GET", `/api/courses/${course.id}/grades`, null, admin.token)).data;
const item2 = grades2.rows.find((x) => x.username === "pq_stu").items.find((i) => i.refId === l2.id);
ok("批改后成绩计入 4/5", item2?.score === 4 && item2?.max === 5);

// ---- 管理员编辑阅读：练习 id 保留，旧作答仍对应 ----
const exIdBefore = (await api("GET", `/api/courses/${course.id}`, null, admin.token)).data.lessons.find((l) => l.id === lesson.id).exercises[0].id;
await api(
  "PATCH",
  `/api/courses/${course.id}/lessons/${lesson.id}`,
  {
    title: "材料同屏测试（修订）",
    blocks: [
      { type: "material", text: "[A] sentence one\n[B] sentence two\n[C] sentence three\n[D] sentence four" },
      { type: "exercise", index: 0 },
      { type: "exercise", index: 1 },
      { type: "exercise", index: 2 },
    ],
    exercises: [
      { type: "choice", prompt: "Q1 revised", options: ["A1", "B2", "C3"], answer: 0, points: 2 },
      { type: "choice", prompt: "Q2", options: ["A1", "B2", "C3"], answer: 1, points: 2 },
      { type: "blank", mode: "unique", prompt: "Q3", answers: ["three"], points: 2 },
    ],
  },
  admin.token
);
const exAfter = (await api("GET", `/api/courses/${course.id}`, null, admin.token)).data.lessons.find((l) => l.id === lesson.id).exercises[0];
ok("编辑后练习题 id 保留", exAfter.id === exIdBefore);
const d3 = (await api("GET", `/api/courses/${course.id}`, null, stu.token)).data;
ok("编辑后学生作答记录仍对应题目", d3.myLessonAnswers.some((a) => a.exerciseId === exIdBefore));

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

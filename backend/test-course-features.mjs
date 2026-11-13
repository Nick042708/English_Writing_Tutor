// 本轮功能接口测试：blocks 穿插 / deadline / syllabus / 加权成绩
const BASE = "http://localhost:3002";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const main = async () => {
  // 注册：管理员 + 学员
  const admin = (await api("POST", "/api/register", { username: "admin_t13", password: "pass123", realName: "老师", school: "测试中学" })).data;
  const stu = (await api("POST", "/api/register", { username: "stu_t13", password: "pass123", realName: "学生甲", school: "测试中学" })).data;
  ok("注册管理员与学员", admin.token && stu.token);

  // 建课 + 拉学员
  const course = (await api("POST", "/api/courses", { name: "写作课T13", startAt: "2026-11-01", endAt: "2027-01-01" }, admin.token)).data.course;
  await api("POST", `/api/courses/${course.id}/members/batch`, { userIds: [stu.user.id] }, admin.token);
  ok("建课并导入学员", course.id);

  // --- 在线学习：blocks 穿插 + 截止时间 ---
  const future = Date.now() + 7 * 24 * 3600 * 1000;
  const lesson = (await api("POST", `/api/courses/${course.id}/lessons`, {
    title: "段落结构",
    blocks: [
      { type: "md", text: "## Topic Sentence\n\nA paragraph has a **topic sentence**.\n\n- point one\n- point two" },
      { type: "exercise", index: 0 },
      { type: "md", text: "## Concluding Sentence\n\nIt restates the main idea." },
      { type: "exercise", index: 1 },
    ],
    exercises: [
      { type: "choice", prompt: "Which is the topic sentence?", options: ["A", "B", "C"], answer: 1, points: 5 },
      { type: "blank", mode: "unique", prompt: "Fill: ____ the main idea.", answers: ["It restates"], points: 5 },
    ],
    maxAttempts: 2,
    deadline: future,
  }, admin.token)).data.lesson;
  ok("发布 blocks 穿插的在线学习", lesson?.blocks?.length === 4 && lesson.deadline === future);
  ok("学生端不暴露标准答案", (await api("GET", `/api/courses/${course.id}`, null, stu.token)).data.lessons[0].exercises[0].answer === undefined);

  // 纯讲解（0 题练习）也应允许
  const pure = (await api("POST", `/api/courses/${course.id}/lessons`, { title: "纯讲解", blocks: [{ type: "md", text: "# Only reading" }] }, admin.token)).data.lesson;
  ok("允许纯讲解（0 练习题）", pure?.blocks?.length === 1);

  // 学生作答（答对 1 题、填空答错）
  const ex1 = lesson.exercises[0].id, ex2 = lesson.exercises[1].id;
  let r = await api("POST", `/api/lessons/${lesson.id}/submit`, { answers: { [ex1]: "1", [ex2]: "wrong answer" } }, stu.token);
  ok("练习提交：客观题判分", r.data.grade?.autoScore === 5 && r.data.grade?.maxScore === 10, JSON.stringify(r.data).slice(0, 120));
  ok("未用尽次数不揭示答案", r.data.revealAnswers === false);

  // 学员视角 blocks 结构正确
  const lv = (await api("GET", `/api/courses/${course.id}`, null, stu.token)).data;
  ok("课程详情含 syllabus 字段", "syllabus" in lv);
  const lvLesson = lv.lessons.find((l) => l.id === lesson.id);
  ok("学员可见 blocks 与 deadline", lvLesson?.blocks[0].type === "md" && lvLesson?.deadline === future);

  // --- Syllabus ---
  r = await api("PUT", `/api/courses/${course.id}/syllabus`, { syllabus: { weights: { assignment: 50, lesson: 30, exam: 10 }, essayFullMark: 9 } }, stu.token);
  ok("学员不能改 syllabus（403）", r.status === 403);
  r = await api("PUT", `/api/courses/${course.id}/syllabus`, { syllabus: { weights: { assignment: 50, lesson: 30, exam: 10 }, essayFullMark: 9 } }, admin.token);
  ok("占比合计≠100 被拒", r.status === 400, JSON.stringify(r.data));
  r = await api("PUT", `/api/courses/${course.id}/syllabus`, {
    syllabus: {
      weights: { assignment: 60, lesson: 40, exam: 0 },
      essayFullMark: 9,
      taskWeights: {},
      policies: { lateAssignment: false, lateLesson: true },
      readings: [{ title: "Writing Academic English", detail: "Oshima & Hogue, 4th ed." }],
      description: "考核说明：**作业 60%** + 在线学习 40%",
    },
  }, admin.token);
  ok("保存 syllabus", r.status === 200 && r.data.syllabus.weights.assignment === 60);
  ok("readings 与 description 保存", r.data.syllabus.readings.length === 1 && r.data.syllabus.description.includes("60%"));
  ok("syllabus updatedAt 存在", !!r.data.syllabus.updatedAt);

  // --- 作业 + deadline + 补交规定 ---
  const past = Date.now() - 24 * 3600 * 1000;
  const asg = (await api("POST", `/api/courses/${course.id}/assignments`, {
    title: "第一次议论文", task: "Some people think..., Discuss.", mode: "exam", target: "cet4", challenge: "match",
    minWords: 20, deadline: past,
  }, admin.token)).data.assignment;
  ok("发布带过期 deadline 的作业", asg?.deadline === past);

  const essay = "English writing is an important skill for college students. Practice makes perfect, so we should write regularly and carefully every single week.";
  r = await api("POST", `/api/assignments/${asg.id}/submit`, { essay }, stu.token);
  ok("逾期 + 不允许补交 → 拒绝", r.status === 400, JSON.stringify(r.data));
  ok("available 标记 overdue", (await api("GET", "/api/assignments/available", null, stu.token)).data.assignments[0].overdue === true);

  // 开放补交
  await api("PUT", `/api/courses/${course.id}/syllabus`, { syllabus: { weights: { assignment: 60, lesson: 40, exam: 0 }, essayFullMark: 9, policies: { lateAssignment: true, lateLesson: true } } }, admin.token);
  r = await api("POST", `/api/assignments/${asg.id}/submit`, { essay }, stu.token);
  ok("逾期 + 允许补交 → 提交成功并标记 late", r.status === 200 && r.data.submissionId);
  const subs = (await api("GET", `/api/my/submissions/${asg.id}`, null, stu.token)).data.submissions;
  ok("提交记录含 late 标记", subs[0].late === true);

  // PATCH 调整 deadline 到未来 → 不再逾期
  const newDl = Date.now() + 3 * 24 * 3600 * 1000;
  r = await api("PATCH", `/api/courses/${course.id}/assignments/${asg.id}`, { deadline: newDl }, admin.token);
  ok("PATCH 作业截止时间", r.status === 200 && r.data.assignment.deadline === newDl);
  ok("available 更新 overdue=false", (await api("GET", "/api/assignments/available", null, stu.token)).data.assignments[0].overdue === false);

  // PATCH lesson deadline / maxAttempts
  r = await api("PATCH", `/api/courses/${course.id}/lessons/${lesson.id}`, { deadline: null, maxAttempts: 3 }, admin.token);
  ok("PATCH 阅读截止与次数", r.status === 200 && r.data.lesson.deadline === null && r.data.lesson.maxAttempts === 3);

  // --- 加权成绩 ---
  r = await api("GET", `/api/courses/${course.id}/grades`, null, admin.token);
  const row = r.data.rows.find((x) => x.username === "stu_t13");
  ok("成绩行含 weighted 明细", !!row?.weighted?.parts?.length, JSON.stringify(row?.weighted));
  const pAssign = row.weighted.parts.find((p) => p.kind === "assignment");
  const pLesson = row.weighted.parts.find((p) => p.kind === "lesson");
  // 作业：演示批改分数 numScore → 未知，但应为 0-100 百分比
  ok("作业类别得分率在 0-100", pAssign && pAssign.score >= 0 && pAssign.score <= 100, JSON.stringify(pAssign));
  // 在线学习：练习 5/10 = 50%
  ok("在线学习类别得分率=50（5/10）", pLesson?.score === 50, JSON.stringify(pLesson));
  ok("加权总评= 作业60%×作业率 + 在线40%×50", Math.abs(row.weighted.total - (pAssign.score * 0.6 + 50 * 0.4)) < 0.2, `total=${row.weighted.total}`);
  ok("排名按加权总评排序", r.data.rows.every((x, i, arr) => i === 0 || (arr[i - 1].weighted?.total ?? 0) >= (x.weighted?.total ?? 0)));
  ok("grades 返回 syllabus", r.data.syllabus?.weights?.assignment === 60);

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });

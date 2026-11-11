# English Writing Tutor · 英语写作助教

一个按学习者水平和目标定制的 AI 英语写作助教：**生成写作素材** + **批改作文**，二者共享同一套「用户画像」系统。

> 当前为演示模式可直接体验；配置 DeepSeek API Key 后即可使用真实 AI 生成。

## 功能特性

### 1. 素材提供
- **三层递进**：词汇（短语搭配 + 句式结构）→ 句子（金句 + 写作手法）→ 段落（多风格范文，自动融入前面生成的词汇句式）
- 每条素材配**与任务主题挂钩**的英文例句，支持复制、换一批、收藏（本地保存）

### 2. 写作批改
- **五段式反馈**：总评 → 分维度点评 → 加分项 → 逐句批注 → 句子升级对比 → 行动计划
- **逐句批注**：摘出原文原句，标注问题类型并给出改法
- **升级对比**：原句 vs 升级句，附一句话说明升级点

### 3. 两步画像系统（核心设计）
不做平行的水平选择器，而是两步收敛为统一的 prompt 变量「难度档位 + 语域风格」：

| 模式 | 第二步选择 | 语域风格 |
|------|-----------|---------|
| 备考 | 中考 / 高考 / 四级 / 六级 / 考研 / 雅思 / 托福 | 考试套路 / academic |
| 实用 | 生活 / 校园 / 职场 + 自评 CEFR | authentic / professional |

各考试自动映射 CEFR 难度档位（如中考≈A2、六级≈B2、雅思≈B2–C1），素材难度与讲解深度随之适配。

## 技术架构

```
React + Vite 前端 ──▶ Express 后端 ──▶ Prompt 模板层（按画像切换）──▶ DeepSeek API
                            │
                            └── 未配置 Key 或调用失败时自动降级为演示模式（预置数据）
```

- 前后端分离，后端保管 API Key，前端永不接触密钥
- LLM 强制 JSON 结构化输出（`response_format: json_object`），后端做健壮解析
- 批改逐句批注采用结构化数据 `{quote, type, comment, suggestion}`，前端渲染

## 本地运行

需要 Node.js 18+。

```bash
# 1. 首次使用：安装依赖并构建页面（只需做一次）
cd backend && npm install
cd ../frontend && npm install && npm run build

# 2. 以后每次打开：一条命令启动整个应用
cd backend && npm start
```

然后浏览器打开 http://localhost:3001 即可使用（后端同时托管页面和 API，无需分开启动）。

### 接入真实 AI（可选）

1. 注册 [DeepSeek 开放平台](https://platform.deepseek.com) 并创建 API Key
2. 复制 `backend/.env.example` 为 `backend/.env`，填入：
   ```
   DEEPSEEK_API_KEY=sk-your-api-key
   ```
3. 重启后端，页面顶部横幅消失即代表 AI 已接入

未配置 Key 时应用以**演示模式**运行（返回精心设计的预置数据），所有界面功能完整可用。

## 项目结构

```
├── DESIGN.md               # 产品设计文档（画像系统 / prompt 设计 / 迭代路线）
├── backend/
│   ├── server.js           # Express API
│   ├── profile.js          # 两步画像 → 统一画像映射
│   ├── prompts.js          # 素材 / 批改 prompt 模板
│   ├── llm.js              # DeepSeek 调用 + JSON 健壮解析
│   └── mock.js             # 演示模式数据
└── frontend/
    └── src/components/     # 画像选择器 / 素材页 / 批改页
```

## Roadmap

- [x] MVP：双模块 + 演示模式 + DeepSeek 接入
- [ ] 收藏夹云端同步、写作历史
- [ ] Taro 迁移微信小程序
- [ ] 学习数据统计与弱项分析

## License

MIT

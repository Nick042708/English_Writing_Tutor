# 部署指南：把应用上线给朋友们用

整个部署只需要三步，每步 2-5 分钟。完成后你会得到一个公开网址，发到群里朋友就能用。

## 前置说明

- **托管平台**：Render（免费额度，无需信用卡），自动从 GitHub 拉取代码并运行
- **云端数据库**：Upstash（免费额度），保存账号和历史记录，平台休眠重启后数据不丢
- **费用**：DeepSeek API 按量计费走你的 Key，单次生成约几厘到几分钱

---

## 第 1 步：创建 GitHub 仓库并推送代码

1. 打开 https://github.com/new （登录 GitHub 后的新建仓库页面）
2. Repository name 填 `english-writing-tutor`，选择 **Private**（私有仓库，Render 也能访问，且代码细节不给别人看），其他都不勾，点 **Create repository**
3. 创建后页面会显示仓库地址，形如 `https://github.com/你的用户名/english-writing-tutor.git`，复制它
4. 把地址发给我，我来执行推送（首次推送会弹出浏览器让你授权 GitHub 登录，点授权即可）

或者自己动手：

```bash
cd E:\文档\English_Writing_Tutor
git remote add origin https://github.com/你的用户名/english-writing-tutor.git
git push -u origin main
```

> 推送时若弹出 Git Credential Manager 登录窗口，用浏览器登录 GitHub 并授权即可。
> `.env`（API Key）和 `data/`（本地数据）已在 .gitignore 中排除，不会被上传。

## 第 2 步：注册 Upstash 创建云端数据库

1. 打开 https://upstash.com ，点右上角 **Sign Up**，直接选 **Continue with GitHub**（用 GitHub 账号登录，最方便）
2. 登录后进入 Console，点 **Create Database**
3. 配置：
   - Name：`writing-tutor`（随意）
   - Primary Region：选 `ap-southeast-1, Singapore` 或 `ap-south-1, Mumbai`（离中国近、延迟低）
   - 其他选项保持默认（Free 计划）
4. 创建成功后，在数据库详情页找到 **REST API** 区块，复制两个值：
   - `UPSTASH_REDIS_REST_URL`（形如 `https://xxx-xxxx.upstash.io`）
   - `UPSTASH_REDIS_REST_TOKEN`（一长串字符）
5. 把这两个值发给我（或直接填到 Render 环境变量里，见第 3 步）

## 第 3 步：在 Render 创建服务

1. 打开 https://dashboard.render.com/register ，同样选 **GitHub** 登录（和第 1 步同一账号）
2. 首次登录会要求授权 Render 访问你的 GitHub 仓库，点 **All repositories**（或只授权 `english-writing-tutor`）
3. 进入控制台后点右上角 **New +** → 选 **Web Service**
4. 在仓库列表中选中 `english-writing-tutor`，然后按下面填写：

| 配置项 | 填写内容 |
|---|---|
| Name | `english-writing-tutor`（会成为网址的一部分） |
| Language / Runtime | Node |
| Region | Singapore（离国内最近） |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `npm install && cd ../frontend && npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free** |

5. 展开 **Environment Variables**（环境变量），添加以下 4 条：

| Key | Value |
|---|---|
| `DEEPSEEK_API_KEY` | 你的 DeepSeek Key（和本地 backend/.env 里一样） |
| `UPSTASH_REDIS_REST_URL` | 第 2 步复制的 URL |
| `UPSTASH_REDIS_REST_TOKEN` | 第 2 步复制的 Token |
| `NODE_VERSION` | `22.12.0` |

6. 点 **Create Web Service**，等待 3-5 分钟构建部署
7. 部署成功后，页面顶部会显示你的应用网址，形如 `https://english-writing-tutor-xxxx.onrender.com`

## 部署后验证

1. 打开网址，能看到登录页即成功
2. **注册第一个账号——它会自动成为管理员**（就是你）
3. 生成一次素材、提交一次批改，到"历史记录"确认能回看
4. 把网址发给朋友，他们注册后都是学生账号

## 注意事项

- **免费实例会在闲置 15 分钟后休眠**：下一个人访问时需要等约 30-60 秒"预热"，属正常现象
- **数据已云端化**：休眠重启不影响账号和历史记录（Upstash 保存）
- **首次注册很重要**：管理员名额只有一个，部署后你自己先注册
- 后续改代码：改完后告诉我，我提交并推送，Render 会自动重新部署

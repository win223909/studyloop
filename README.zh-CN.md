# StudyLoop

[![CI](https://github.com/win223909/studyloop/actions/workflows/ci.yml/badge.svg)](https://github.com/win223909/studyloop/actions/workflows/ci.yml)

**把想学的内容变成课程，把做过的练习变成理解。**

[English](README.md) · [模型配置](docs/configuration.md) · [使用说明](docs/user-guide.md) · [OpenMAIC 接入](docs/openmaic.md) · [路线图](docs/roadmap.md)

StudyLoop 是一个可自行部署的学生学习平台。输入课程名称、学科关键词，或提供自己的课程资料，确认学习范围后生成有来源的练习；通过答卷回放、逐题讲解和巩固题继续学习。课程结构适用于不同学科，第一阶段重点打磨中小学生的使用体验。

**当前版本：`v0.1.0-alpha.1`，可以运行的早期版本。** 三门原创示例课无需模型 API；任意课程生成需要部署者配置自己的模型服务。公开仓库不包含作者的 API Key、学生答卷或私人学校资料。

> **特别感谢 OpenMAIC。** 感谢 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)、THU-MAIC 团队及所有贡献者，为开源 AI 互动教育提供的重要基础。StudyLoop 目前向 OpenMAIC 导出针对性的学习简报；本版本尚未内置改良后的 OpenMAIC 课堂运行时。[接入方式与致谢说明](docs/openmaic.md)。

![StudyLoop 学习工作台](docs/assets/workspace.png)

## 现在可以做什么

- **直接体验**：分数、光合作用、英语一般过去时三门原创示例课，不需要账户或 API Key。
- **创建课程**：输入关键词搜索、粘贴文字，或上传可提取文字的 PDF、TXT、Markdown；先确认知识点，再生成 4、6 或 8 道选择题。
- **查看依据**：保留课程来源和每题引用。关键词默认搜索 Wikipedia；可选 Brave Search，明确标记搜索摘要的性质。
- **练习与回放**：选择答案或“我不会”，查看固定保存的原始成绩和答卷；讲解后再做一道巩固题，原成绩保持不变。
- **衔接教学**：使用分步讲解和浏览器朗读，或导出 OpenMAIC 学习简报进行深入学习。
- **分享课程包**：导入、导出经过格式校验的课程 JSON。
- **选择模型服务**：支持 OpenAI 兼容接口、原生 Anthropic Messages、原生 Google Gemini；密钥只配置在服务器。
- **自行部署**：Node.js 或 Docker Compose，可运行于个人电脑、NAS 和服务器。

本版支持选择题、中英文界面和文字提取。OCR、直接导入任意网页、班级名单、跨设备学生账户，以及 OpenMAIC 课堂进度自动回传列在[后续计划](docs/roadmap.md)中。

## 快速开始

准备 Node.js **22.13 或更高版本**及 npm。

```bash
git clone https://github.com/win223909/studyloop.git
cd studyloop
npm ci
cp .env.example .env
npm run build
npm start
```

打开 **[http://localhost:3210](http://localhost:3210)**，先选择示例课程体验完整流程。默认模型配置留空，此时不会调用付费模型，也不能生成新课程。

需要生成新课程时，在自己的电脑或服务器编辑 `.env`，填入自己的服务类型、接口地址、模型 ID 和 API Key，然后重启。具体操作见[模型配置指南](docs/configuration.md)，包含 OpenAI、Anthropic、Gemini、DeepSeek、通义千问、MiniMax、OpenRouter、Ollama 等配置。不要把 `.env` 上传到 GitHub，也不要把密钥写进前端。

### Docker 启动

```bash
cp .env.example .env
docker compose up -d --build
```

同样打开 localhost 地址。提供的 Compose 文件将端口绑定在本机回环地址，并用独立卷保存数据。NAS、外部访问、HTTPS、更新和备份操作见[部署说明](docs/self-hosting.md)。

## 一次学习怎么进行

1. 选择示例课，或输入“六年级等值分数”等主题；创建新课时选择搜索、上传或粘贴资料。
2. 检查来源、学习水平和课程大纲，勾选要练习的知识点和题数。
3. 每题选择答案，确实不会时选择“我不会”，然后提交。
4. 查看答卷回放，阅读薄弱知识点的分步讲解，并完成独立的巩固题。
5. 如需互动课堂，下载 OpenMAIC 学习简报，在自己部署的 OpenMAIC 中添加为学习材料；学完后返回 StudyLoop 练习。

详细中英文操作步骤见[使用指南](docs/user-guide.md)。

## 题目质量与数据

生成的题库会经过结构检查及另一轮答案、来源复核。这可以减少错误，但不能保证所有题目绝对正确；发现题目或解析有疑问时，应结合来源核实。课程导出包含答案，适合学习与分享，不用于保密考试。

模型密钥保存在服务端。生成的课程和答卷由匿名浏览器会话隔离；可设置实例访问密码保护共享部署。此版没有跨设备账户和找回功能，清除浏览器 Cookie 后将无法访问原会话的记录。共享实例前请阅读[安全与隐私说明](SECURITY.md)。

## 开发与贡献

```bash
npm run dev
npm test
npm run check
npx playwright install chromium
npm run test:e2e
```

开发页面使用 5173 端口，API 使用 3210 端口。服务商测试使用可控制的模拟响应，不需要付费 API；测试证明的是协议处理逻辑，不代表已逐一验证所有服务商线上模型的教学质量。[架构](docs/architecture.md) · [课程包格式](docs/course-packs.md) · [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md)。

## 许可证与致谢

StudyLoop 原创代码使用 [MIT 许可证](LICENSE)，内置原创示例资料按各课程包的来源声明使用 CC0-1.0。导入资料、检索内容及独立安装的第三方项目遵循各自条款。

再次感谢 **[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)**。后续工作将围绕其课堂能力完善练习诊断与针对性教学衔接；当前学习简报适配层由 StudyLoop 原创实现，尚未嵌入 OpenMAIC 的代码或运行时。完整说明见[第三方声明](THIRD_PARTY_NOTICES.md)。

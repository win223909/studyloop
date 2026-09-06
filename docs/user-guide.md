# User guide / 使用指南

## Try a course without an API key / 无 API 体验

Open the app and choose an original example course: fractions, photosynthesis, or English past tense. Examples include sources, six questions, explanations, and separate follow-up questions. Their purpose is to show the learning flow; they are not dynamically generated in response to your keywords.

打开平台后选择分数、光合作用或一般过去时示例课。每门示例课含原创资料、六道题、解析和独立巩固题。示例用于体验完整流程，不会把预先编好的题冒充成根据你输入内容即时生成的题。

## Create a course / 创建课程

Your operator must first configure a [model provider](configuration.md). Choose the course language and a clear level, then select an input method:

| Method                    | Good input                                        | What happens                                                    |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Topic search / 关键词搜索 | “Grade 6 equivalent fractions” / “六年级等值分数” | Retrieves relevant Wikipedia text or configured search excerpts |
| Upload / 上传             | A text-based PDF, TXT, or Markdown chapter        | Extracts text and uses it as course material                    |
| Paste text / 粘贴文字     | Your notes or a passage you can use               | Uses that passage directly                                      |

The upload limit is 8 MB; PDFs must have at most 60 pages. Extracted or pasted text should be 400–36,000 characters. Images, scanned PDFs without text, audio, and videos are not parsed in this release. Direct URL ingestion is not implemented; provide the relevant text instead.

上传最大 8 MB，PDF 最多 60 页；文字内容需为 400–36,000 字符。本版不解析纯扫描件、图片、音视频，也没有直接抓取任意网址的入口。扫描件可以先 OCR，再上传可提取文字的 PDF。

Review the proposed course title, level, sources, and objectives. Select the objectives you want and choose 4, 6, or 8 questions. Generation includes a separate answer/evidence review, so it can take more than one model call. If material is insufficient or the bank fails review, refine the topic or add a fuller explanation before trying again.

先检查课程大纲和来源，勾选需要练习的知识点，再生成 4、6 或 8 道题。周计划只说明“学什么”时，通常需要补充真正的知识讲解。材料不足或题库复核不通过时，缩小主题、增加来源内容后再试。

## Practise / 做练习

Select one answer per question. Choose **“I don't know / 我不会”** if you need an introduction; it is a separate action, not a trick answer. Complete every question before submitting.

After submission, StudyLoop saves the original questions, choices, answers, and explanations with the result. The score is the percentage answered correctly. Wrong and unknown answers both receive no point, but remain separate learning signals.

每题选择一个答案，确实不会时选择“我不会”。提交后保存原题、选项、所选答案、标准答案和解析。成绩按答对比例计算；“答错”和“我不会”均不得分，但会分别记录，方便采用不同讲解方式。

## Review and learn / 回放与讲解

Open a submitted attempt from history to see the same saved result. Read a question's explanation and step-by-step lesson. Browser read-aloud is available when supported; voices and pronunciation depend on the device and browser.

Try the separate consolidation question and submit it for feedback. This practice does not rewrite the original attempt or its score. One correct answer or one mistake is only a clue; it does not prove long-term mastery or a learning difficulty.

从历史记录查看已提交答卷，可回放当时的原始结果。逐题查看解析、分步讲解，并完成新的巩固题。巩固练习单独保存，不修改原成绩。朗读功能依赖浏览器和设备语音能力。

For a deeper interactive lesson, download the OpenMAIC brief from the result. Follow the [OpenMAIC guide](openmaic.md) to use it in a separate classroom. Automatic classroom completion sync is not included.

## Course packs / 课程包

Use course export to download a complete JSON course pack, and import a compatible pack to add it to your browser's library. Packs include source text, questions, answers, explanations, and follow-up questions. They do not contain a student's attempt history, but their authored course material may contain personal or copyrighted content: check it before sharing.

导出课程得到完整 JSON 文件，包含来源正文、题目、答案、解析和巩固题；导入后加入当前浏览器的课程库。课程包不包含学生答卷记录，但课程资料本身仍可能包含私人或受版权保护的内容，分享前请检查。详见[课程格式](course-packs.md)。

## Where your data goes / 数据去了哪里

Example practice and grading use your StudyLoop server and do not require a model call. New-course generation sends the chosen topic, source material, and requested learning scope to the operator's configured model provider; search sends the topic to the configured search source. Browser read-aloud behaviour depends on the selected system/browser voice.

Practice history belongs to the current browser session. Clearing cookies, changing browsers, using private browsing, or waiting beyond the session lifetime can remove access to those records. Download course packs you want to keep portable. This alpha does not include student accounts or a history recovery screen.

示例练习与批改由自己的 StudyLoop 服务完成，无需模型调用。生成新课程时，主题、资料和学习范围会发送给部署者配置的模型服务；搜索主题会发送给搜索来源。学习记录绑定当前浏览器会话，清理 Cookie、换浏览器或会话过期后可能无法访问，本版没有账户找回界面。

## Report a questionable question / 反馈题目问题

Check the cited material and the expected answer first. For an original bundled example, open a [question-quality issue](https://github.com/win223909/studyloop/issues/new/choose) with the course title, question ID, and reasoning. For private generated material, provide a redacted or synthetic example; never post children's names, private documents, or API keys.

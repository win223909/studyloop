# OpenMAIC integration / OpenMAIC 接入

**Special thanks to [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and every contributor.** Their work on open-source interactive AI classrooms provides the foundation for the deeper teaching experience in StudyLoop's roadmap.

**特别感谢 OpenMAIC、THU-MAIC 团队及所有贡献者，为开源 AI 互动教育提供的重要基础。** StudyLoop 将围绕它的课堂能力，继续完善从练习发现问题、针对性讲解到再次巩固的衔接。

## What ships in this release / 当前实际交付

StudyLoop exports a **Markdown teaching brief** based on a saved practice attempt. It identifies incorrect and “I don't know” responses, includes the original questions and explanations, links relevant sources, and proposes a short interactive lesson. If every answer was correct, the brief requests consolidation instead of inventing weaknesses.

本版导出 **Markdown 学习简报**，根据已保存答卷整理错题、“我不会”、原题解析、教学线索与相关来源，供 OpenMAIC 生成一节短课。如果全部答对，简报会要求设计迁移和巩固活动，不会虚构薄弱点。

The bridge is original StudyLoop code. It does not bundle OpenMAIC, copy a user's existing classroom, call an undocumented remote API, or automatically create a classroom. A modified OpenMAIC runtime, direct course handoff, and completion callbacks are future work.

目前的适配层由 StudyLoop 原创实现，不内置 OpenMAIC，也不会自动创建课堂或回传成绩。改良的课堂运行时、直接交接与学习进度回传尚在后续计划中。

## Use the bridge / 操作步骤

1. Install and run OpenMAIC independently using its [official setup instructions](https://github.com/THU-MAIC/OpenMAIC#quick-start). Configure its own model and optional media services. StudyLoop does not forward its API key.
2. Optionally set `OPENMAIC_URL` in StudyLoop's `.env` to the clean HTTP(S) URL of that deployment and restart. Leave it blank if you only want to download the brief. Do not put access codes or credentials in this URL.
3. Complete a StudyLoop practice set and open its result. Download the **OpenMAIC lesson brief**.
4. Open OpenMAIC. Start a course-building session and add `studyloop-openmaic-lesson.md` as a material. If your installed release does not offer Markdown upload, open the file and paste its text into the course request.
5. Ask: **“Create a 5–10 minute interactive lesson from this brief. Check the evidence, explain the target concepts, pause for student answers, and finish with two new practice questions.”** Review the generated course before presenting it to a learner.
6. Return to StudyLoop and complete the consolidation questions. There is no automatic completion callback in this alpha.

中文操作：独立安装并配置 OpenMAIC → 在 StudyLoop 完成一组练习 → 下载“OpenMAIC 学习简报” → 在 OpenMAIC 创建课堂时添加该 Markdown 文件（或粘贴全文）→ 输入“请按这份简报生成 5–10 分钟互动微课，核对资料，分步解释，留出提问与作答机会，最后给出两道新题”→ 检查课堂 → 学完返回 StudyLoop 巩固练习。

Adding a source-based brief does not transfer the original full uploaded textbook. Attach the necessary source materials in OpenMAIC yourself if the brief is insufficient, subject to your rights to use them.

## Why Markdown / 为什么采用 Markdown

The upstream code inspected for this release accepts `.md` and `text/markdown` as learning material and provides a plain-text/Markdown extractor:

- [Workbench material upload policy](https://github.com/THU-MAIC/OpenMAIC/blob/dfebbcf33f3a56064129903faeab70a9e4243146/lib/workbench/material-upload-policy.ts)
- [Document MIME registry](https://github.com/THU-MAIC/OpenMAIC/blob/dfebbcf33f3a56064129903faeab70a9e4243146/lib/document/mime.ts)
- [Text and Markdown extraction](https://github.com/THU-MAIC/OpenMAIC/blob/dfebbcf33f3a56064129903faeab70a9e4243146/lib/document/extractors/text.ts)

Compatibility baseline: source commit `dfebbcf33f3a56064129903faeab70a9e4243146`. This is source-level material compatibility, not a claim that a remote classroom was generated or a full end-to-end OpenMAIC integration test was run. UI labels and setup requirements may differ in other upstream releases.

OpenMAIC's native classroom export is a different format. A StudyLoop course JSON or brief should not be renamed to `.maic.zip` and passed off as a generated classroom.

## Data boundary / 数据边界

The brief contains course-level subject, level and language; focused questions; selected answers; explanations; and relevant source metadata. It omits learner account fields, browser session tokens, attempt identifiers, API settings, and the full raw upload. Course text can still contain identifying information supplied by its author: review the downloaded file before sharing it.

Downloading the brief makes no call to OpenMAIC. Uploading or pasting it there shares its learning content with that deployment and its configured model/media providers. Opening the configured link does not transfer credentials or silently upload the file.

简报不主动写入学生姓名、账户、浏览器会话、答卷 ID、API 配置或完整上传资料。课程作者自行写进题目或资料的个人信息仍可能出现，分享前请检查。下载简报不会向 OpenMAIC 发送请求；手动上传后，内容会进入你选择的 OpenMAIC 部署及其配置的服务商。

## Planned deeper integration / 后续改良方向

- Introduce a versioned lesson request and completion receipt, with deliberate data selection and independently verifiable callbacks.
- Adapt short, age-appropriate lessons to wrong/unknown response patterns, with opportunities for the learner to answer before feedback.
- Improve phone layouts and loading/retry behaviour against real generated classrooms.
- Preserve upstream notices, document every downstream change, and contribute generally useful improvements upstream when appropriate.

The intended improvements are roadmap items, not features silently attributed to this alpha. See [roadmap](roadmap.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).

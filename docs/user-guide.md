# User guide / 使用指南

## Try a course without an API key / 无 API 体验

Open the app and choose an original example course: fractions, photosynthesis, or English past tense. Examples include sources, six questions, explanations, and separate follow-up questions. Their purpose is to show the learning flow; they are not dynamically generated in response to your keywords.

打开平台后选择分数、光合作用或一般过去时示例课。每门示例课含原创资料、六道题、解析和独立巩固题。示例用于体验完整流程，不会把预先编好的题冒充成根据你输入内容即时生成的题。

## Configure a model as the operator / 部署者配置模型

On the computer running StudyLoop, open its direct `localhost` or `127.0.0.1` address and choose **Models & settings / 模型与设置**. Sign in first if an instance password is enabled. Enter the provider, API base URL, model ID, and your own API key. **Test connection** can try unsaved input with a small real provider request and may incur a charge; it does not save the configuration or deduct from the daily outline/bank/classroom allowance. **Save** writes the private server configuration (`.env` by default, or the startup `SETTINGS_FILE` path) and makes it available to new generation requests immediately, without a restart.

The page does not display saved key values. Leave a key blank to keep it for the same service/address, or use the clear option to remove it. Changing the service or API address requires a fresh key. A saved configuration and a successful connection test are separate results; verify both, then try a small course.

在运行服务的电脑上直接打开本机地址，进入“模型与设置”；如有实例密码，先登录。填写服务商、API 地址、模型 ID 和自己的密钥。可以测试未保存的配置，测试会发出少量真实请求，可能产生费用；测试不会保存，也不扣大纲／题库／课堂的每日次数。点击保存后，配置写入私有文件（默认 `.env`，或启动时指定的 `SETTINGS_FILE`），立即用于新的生成请求，无需重启。

页面不会显示已保存的密钥。相同服务和地址下留空可保留已有值，明确清除时删除；更换服务或 API 地址需重填密钥。“已保存”不等于“连接测试通过”，核实后再尝试生成小课程。

Remote students see a read-only explanation and do not need API keys. A shared instance password is not a remote administrator credential; management through a reverse proxy is blocked. Operators using a NAS/server should follow the [SSH and deployment guidance](configuration.md#local-management-and-deployment-settings--本机管理与部署配置). The default bridged Docker deployment does not enable GUI management, and forwarding its host port through SSH does not change that. Network and instance-password changes still require file-based deployment configuration and a restart.

远程普通学生只看到只读提示，不需要提供 API Key。共享口令不等于远程管理员凭证，经反向代理访问不能管理配置。NAS／服务器部署者可按[SSH 与部署说明](configuration.md#local-management-and-deployment-settings--本机管理与部署配置)操作；默认桥接 Docker 未开放图形化管理，SSH 转发其宿主机端口也不会改变这一点。网络监听地址、端口、实例密码等仍需改部署文件并重启。

## Create a course / 创建课程

Your operator must first save a working [model configuration](configuration.md). Choose the course language and a clear level, then select an input method:

| Method                    | Good input                                        | What happens                                                    |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Topic search / 关键词搜索 | “Grade 6 equivalent fractions” / “六年级等值分数” | Retrieves relevant Wikipedia text or configured search excerpts |
| Upload / 上传             | A text-based PDF, TXT, or Markdown chapter        | Extracts text and uses it as course material                    |
| Paste text / 粘贴文字     | Your notes or a passage you can use               | Uses that passage directly                                      |

The upload limit is 8 MB; PDFs must have at most 60 pages. Extracted or pasted text should be 400–36,000 characters. Images, scanned PDFs without text, audio, and videos are not parsed in this release. Direct URL ingestion is not implemented; provide the relevant text instead.

上传最大 8 MB，PDF 最多 60 页；文字内容需为 400–36,000 字符。本版不解析纯扫描件、图片、音视频，也没有直接抓取任意网址的入口。扫描件可以先 OCR，再上传可提取文字的 PDF。

Review the proposed course title, level, sources, and objectives. Select the objectives you want and choose 4, 6, or 8 questions. Generation includes a separate answer/evidence review, so it can take more than one model call. If material is insufficient or the bank fails review, refine the topic or add a fuller explanation before trying again.

先检查课程大纲和来源，勾选需要练习的知识点，再生成 4、6 或 8 道题。周计划只说明“学什么”时，通常需要补充真正的知识讲解。材料不足或题库复核不通过时，缩小主题、增加来源内容后再试。

### Mainland China textbooks / 国内教材

Use **From a textbook / 从国内教材开始** on the home page to open the [National Smart Education Platform textbook catalogue](https://basic.smartedu.cn/tchMaterial). Choose the school stage, subject, edition and grade on the official site. Sign in there when the reader requires it. StudyLoop does not collect the platform password or login token.

在首页点击官方教材目录，按学段、学科、版本、年级选择教材；需要登录时在官方页面完成。目录可浏览不代表正文无需登录。StudyLoop 不收集平台账号、密码或登录令牌。

Choose **Import a textbook chapter / 导入教材章节**, then upload a chapter file you are allowed to use, or switch to **Paste text** and provide the relevant passage. Fill in the optional source title (including edition, grade, volume, chapter and printed page numbers) and the original textbook detail-page URL. These stay attached to the source in the plan, generated question bank and course export. The URL is a citation supplied by you; it is not fetched or independently verified, and a catalogue title alone is not teaching material.

点击“导入教材章节”，上传自己有权使用的章节文件，或切换到“粘贴资料”提供正文。建议在资料名称中写明版本、年级、册次、章节和书面页码，并填写教材详情页地址；信息会随来源保留在大纲、题库与课程导出中。地址仅用作来源引用，不会自动抓取或核验。教材目录、书名不能替代实际教学内容。

The same upload/text limits apply, so select a chapter rather than a whole long textbook. Some readers only offer online reading; StudyLoop does not add a download option to those sites. Observe each textbook's usage terms and check permission before sharing a course export containing its text. This release provides the official entry and attributed chapter import; automated catalogue synchronisation, authenticated retrieval and OCR are not implemented.

沿用上方文件和文字限制，请选择章节而非整本长教材；部分阅读器只提供在线阅读，StudyLoop 不会为其新增下载权限。教材正文依各自使用条款处理，分享含正文的课程包前须检查授权。本版提供官方入口和带来源的章节导入，尚未实现自动同步目录、代登录抓取或 OCR。

## Practise / 做练习

Select one answer per question. Choose **“I don't know / 我不会”** if you need an introduction; it is a separate action, not a trick answer. Complete every question before submitting.

After submission, StudyLoop saves the original questions, choices, answers, and explanations with the result. The score is the percentage answered correctly. Wrong and unknown answers both receive no point, but remain separate learning signals.

每题选择一个答案，确实不会时选择“我不会”。提交后保存原题、选项、所选答案、标准答案和解析。成绩按答对比例计算；“答错”和“我不会”均不得分，但会分别记录，方便采用不同讲解方式。

## Review and learn / 回放与讲解

Open a submitted attempt from history to see the same saved result. Read a question's explanation and step-by-step lesson. Browser read-aloud is available when supported; voices and pronunciation depend on the device and browser.

Try the separate consolidation question and submit it for feedback. This practice does not rewrite the original attempt or its score. One correct answer or one mistake is only a clue; it does not prove long-term mastery or a learning difficulty.

从历史记录查看已提交答卷，可回放当时的原始结果。逐题查看解析、分步讲解，并完成新的巩固题。巩固练习单独保存，不修改原成绩。朗读功能依赖浏览器和设备语音能力。

For a deeper lesson, choose **Generate an interactive classroom** on the saved result. StudyLoop passes the selected learning context to its bundled OpenMAIC classroom using the same configured model. Review the proposed outline, then generate a short classic classroom with slides, exercises, and standalone HTML interactions. Use **Return to attempt** to continue the original practice. The classroom library lists lessons already saved in this browser; new classrooms start from a StudyLoop result. Automatic completion or score sync is not included.

如需深入学习，在已保存的答卷结果中点击**“生成互动课堂”**，确认大纲后生成包含幻灯片、练习或独立 HTML 互动的短课。内置 OpenMAIC 复用同一组模型配置，不需要另外部署或填写密钥。课堂内可返回原答卷继续巩固；课堂首页展示本浏览器已保存的课堂，新课堂从答卷创建。每课最多六个场景，可能消耗多次模型请求；当前没有完成状态或成绩自动回传。详见 [OpenMAIC 使用与致谢](openmaic.md)。

## Delete a learning record / 删除学习记录

Choose **Delete record** beside a history entry or on its saved result. Review the course title and file counts, then confirm. This removes the attempt, its consolidation practice and handoff files from the local server. The generated/imported course bank is also removed when no other attempt references it; an associated generation plan is removed only when it can be identified and is not shared. Original sample courses remain available. The preview lists shared or ambiguous items that will be retained; a changed scope requires a new confirmation.

在学习记录列表或答卷详情点击“删除记录”，查看课程名称、删除数量和保留项目后确认。服务端会删除该答卷、巩固练习与课堂交接文件；没有其他答卷引用时，同时删除对应的生成／导入课程题库。生成计划只在关联明确且未共用时清理，示例课保留。范围变化后必须重新确认。

After server deletion, StudyLoop cleans precisely linked OpenMAIC classroom data in the current browser. A persisted cleanup task allows retry after a timeout, interrupted connection or page reload. Keep the same browser cookies and storage until cleanup finishes. A minimal server receipt holds identifiers, counts and completion time so cleanup can verify ownership after the original attempt is gone; it contains no course text or answers. Normal server I/O failures trigger a restoration attempt and an error, not a success notice. This local file store is not a crash-atomic database.

服务端删除成功后，会继续清理当前浏览器中能准确关联的 OpenMAIC 课堂数据。超时、断线或刷新后，待清理任务仍可重试；完成前请保留同一浏览器的 Cookie 和存储。服务端仅保留用于校验所有权和恢复清理的最小凭据，含标识、数量和完成时间，不含课程正文或答案。普通文件操作失败时尝试恢复并报错；文件存储不具备数据库级断电原子性。

Files you downloaded/exported into Downloads or another folder, backups, and classroom copies in other browsers/devices must be removed separately. Older classroom data without a reliable attempt association is retained: delete it from that browser's classroom library if needed. StudyLoop never guesses classroom ownership from a matching title.

已经下载／导出到“下载”等目录的副本、备份、其他浏览器或设备中的课堂，需要分别清理。旧课堂缺少可靠答卷关联时会保留，可到对应浏览器的课堂库手动删除；不会仅凭同名误删。

## Course packs / 课程包

Use course export to download a complete JSON course pack, and import a compatible pack to add it to your browser's library. Packs include source text, questions, answers, explanations, and follow-up questions. They do not contain a student's attempt history, but their authored course material may contain personal or copyrighted content: check it before sharing.

导出课程得到完整 JSON 文件，包含来源正文、题目、答案、解析和巩固题；导入后加入当前浏览器的课程库。课程包不包含学生答卷记录，但课程资料本身仍可能包含私人或受版权保护的内容，分享前请检查。详见[课程格式](course-packs.md)。

## Where your data goes / 数据去了哪里

Example practice and grading use your StudyLoop server and do not require a model call. New-course generation sends the chosen topic, source material, and requested learning scope to the operator's configured model provider; search sends the topic to the configured search source. Interactive classroom generation also sends the selected learning context and subsequent classroom prompts to that configured model. Browser read-aloud behaviour depends on the selected system/browser voice.

Practice history belongs to the current browser session. Clearing cookies, changing browsers, using private browsing, or waiting beyond the session lifetime can remove access to those records. Download course packs you want to keep portable. OpenMAIC classrooms are stored separately in this browser's IndexedDB. Export classrooms you want to keep before clearing site storage; backing up the server data volume does not back up those browser lessons. This alpha does not include student accounts or a history recovery screen.

示例练习与批改由自己的 StudyLoop 服务完成，无需模型调用。生成新课程时，主题、资料和学习范围会发送给部署者配置的模型服务；搜索主题会发送给搜索来源。学习记录绑定当前浏览器会话，清理 Cookie、换浏览器或会话过期后可能无法访问，本版没有账户找回界面。互动课堂生成会将选定的学习内容发送给同一模型服务；课堂本身另存于浏览器 IndexedDB，请使用课堂导出功能备份。服务端数据目录备份不包含这些浏览器课堂。

## Report a questionable question / 反馈题目问题

Check the cited material and the expected answer first. For an original bundled example, open a [question-quality issue](https://github.com/win223909/studyloop/issues/new/choose) with the course title, question ID, and reasoning. For private generated material, provide a redacted or synthetic example; never post children's names, private documents, or API keys.

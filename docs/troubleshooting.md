# Generation recovery and troubleshooting / 生成恢复与故障排查

A successful connection test proves that a short request works, not that a complete course will pass review. Start with a small course and record the displayed error code, phase, and request ID when available. A request ID is a correlation identifier, not an API key. The operator can match it to the server's `studyloop_generation` events.

连接测试成功只证明短请求可用，不代表完整题库一定通过复核。先用少量题目测试；失败时保留页面提供的错误类别、阶段和请求编号。请求编号不是 API Key，可由部署者在服务端的 `studyloop_generation` 日志中定位。

The phase diagnostics below cover StudyLoop outline and question-bank generation. / 下列阶段诊断用于 StudyLoop 大纲与题库生成。

| Phase / 阶段       | Meaning / 含义                                                                       |
| ------------------ | ------------------------------------------------------------------------------------ |
| `learning_request` | Organizing the subject, learning goal, and search terms / 整理学科、学习目标和检索词 |
| `search`           | Source retrieval / 查找资料                                                          |
| `outline`          | Course scope and evidence coverage / 大纲与资料覆盖核对                              |
| `questions`        | Question authoring / 生成题目                                                        |
| `answer_review`    | Independent solving without the author's answer key / 隐藏原答案的独立解题复核       |
| `teaching_review`  | Explanations, lesson steps, and evidence / 解析、教学步骤与依据复核                  |

## What automatic recovery can do / 自动恢复的边界

- **Learning request:** automatic search adds one preparation call, with at most 4,096 output tokens and a 30-second timeout. Malformed or truncated output, or an invalid result shape falls back to existing keyword extraction without another preparation call. An explicit refusal or a real service failure ends the request. The original topic remains the coverage target. Text/upload mode skips preparation and external search.
- **JSON:** only an intact, unambiguous JSON object is extracted from supported prose, Markdown fences, or leading thinking wrappers. Strings and values are not rewritten. Missing braces, invalid escapes, duplicate keys, competing JSON objects, and truncated output are rejected; partial questions are never salvaged.
- **Authoring:** if the first author response has invalid JSON, is cut short, or fails structural/citation validation (`bank_invalid`), discard it and make one recovery pass in batches of two questions. Each batch runs once. Validate every batch and the complete bank, then run the blind answer review and the explanation/evidence review on the complete bank. A failed recovery batch ends the request; source insufficiency does not trigger this recovery.
- **Outline and reviews:** a JSON-format failure retries only that stage once. The scoped official MiniMax-M3 review recovery below also permits a first timeout or truncation, within the same two-attempt limit. An actual wrong answer, inadequate evidence, model refusal, or context limit is not retried into acceptance. An invalid outline or a rejected review is not treated as a format failure.

自动搜索增加一次学习需求整理，输出最多 4,096 Token，超时上限 30 秒。JSON 格式无效、输出截断或结果结构无效时，降级到现有关键词提取，不再次调用整理；明确拒绝或真实服务故障则结束请求。原主题仍是覆盖审核目标，文字／上传模式跳过整理和外部检索。

JSON 只允许从明确的说明文字、代码围栏或前置思考标签中无损取出完整对象，不改写内部字符串或值，不补括号、不猜转义，也不接受重复字段、多个候选对象或截断片段。首次出题的 JSON 格式错误、截断或结构／引用校验失败（`bank_invalid`）可触发**一轮**恢复：丢弃原输出，按每批两题重新生成，每批只请求一次；各批和合并后的题库都须通过完整结构校验，随后对全题库重新做独立答案复核和解析／教学依据复核。任一恢复批失败就结束，资料不足不触发分批恢复。大纲或复核的 JSON 格式错误仅重试该阶段一次；大纲结构不合格、复核发现错答案或证据不足、模型拒绝、上下文限制均不会因此被放行。

The authoring prompt asks for flat teaching fields such as `lessonTitle`, `lessonSteps`, and `practicePrompt` to reduce nested-output mistakes. Once valid JSON is received, the server maps those fields into the existing `lesson`/`practice` course structure without inventing values. Missing or conflicting flat/nested fields fail validation. Objectives are supplied as stable `{id,text}` records; the model returns `objectiveId`, which the server maps to the exact original objective in the public `concept` field. The model does not need to copy the objective text character for character. Unknown IDs, conflicting fields, and uncovered objectives are rejected. The public course-pack format is unchanged.

出题提示使用 `lessonTitle`、`lessonSteps`、`practicePrompt` 等扁平字段，减少深层嵌套导致的输出错误。只有 JSON 本身完整合法后，服务端才将这些字段定向映射回原有 `lesson`／`practice` 结构，不补造内容；缺字段或扁平与嵌套字段混杂冲突时仍失败。学习目标以稳定编号的 `{id,text}` 提供，模型返回 `objectiveId`，服务端按编号将公开 `concept` 字段精确还原为原目标，避免要求模型逐字抄写导致的字符差异。未知编号、字段冲突或目标未覆盖仍会拒绝。公开课程包格式保持不变。

Recovery can increase latency and model charges. `DAILY_GENERATION_LIMIT` counts application generation requests; it is not a cap on model calls or spending. See [configuration and request budgets](configuration.md#model-quality-and-resource-controls--质量与资源限制).

恢复可能增加时间与费用。每日生成额度按应用请求计算，不是模型调用次数或金额上限；用量设置见[配置指南](configuration.md#model-quality-and-resource-controls--质量与资源限制)。

For official MiniMax-M3 endpoints, StudyLoop disables thinking during question-bank authoring and, separately, during the embedded classroom's scene-content and scene-actions requests. This addresses a provider response that can return HTTP 200 but consume its completion budget on reasoning, end with `finish_reason=length`, and contain no usable JSON; the classroom then reports a generation failure. Outlines, the first independent review attempt, classroom grading and other stages keep their defaults. The call ceilings are unchanged. See the [MiniMax configuration notes](configuration.md#minimax-model-id-example--minimax-模型-id-示例) for the exact protocol, endpoint, embedded-mode and model conditions. A successful direct provider comparison is not full classroom acceptance; verify the native generation, rendering and playback flow separately.

官方 MiniMax-M3 接口的题库出题，以及内置课堂的场景内容和讲解动作阶段会单独关闭思考。所针对的故障是：服务商虽返回 HTTP 200，但完成预算已被推理耗尽，`finish_reason=length` 且没有可用 JSON，随后课堂报告生成失败。大纲、首次独立复核、课堂评分及其他阶段保持默认，调用上限不变。精确协议、接口、内置模式与模型条件见 [MiniMax 配置说明](configuration.md#minimax-model-id-example--minimax-模型-id-示例)。直接请求服务商的对照成功不等于完整课堂验收，仍须单独核对原生生成、渲染与播放流程。

For a question-bank review using the OpenAI-compatible protocol, exactly `https://api.minimax.cn/v1` or `https://api.minimax.io/v1`, and an effective review model of exactly `MiniMax-M3`, a first format error, truncation or timeout retries only that review with thinking disabled. The already authored bank is reused within the active request; authoring does not restart. Both `answer_review` and `teaching_review` remain limited to two calls each, and the second failure ends the request. Semantic review rejection never triggers this fallback; other providers do not gain timeout/truncation retries. This can avoid repeating the whole generation, but it does not guarantee review success or resume an interrupted server process.

题库复核使用 OpenAI 兼容协议、根地址精确为 `https://api.minimax.cn/v1` 或 `https://api.minimax.io/v1`，且实际复核模型精确为 `MiniMax-M3` 时，首次格式错误、截断或超时可关闭思考后仅重试该复核。当前请求内复用已生成题库，不重新出题；`answer_review` 与 `teaching_review` 各仍最多两次，第二次失败即结束。语义复核拒绝不触发恢复，其他服务商也不会新增超时／截断重试。这样可避免因一次复核故障而整份重做，但不保证复核成功，也不支持中断后的跨进程续跑。

## Choose the next step / 根据错误处理

| Error / 错误                                                                        | Next step / 下一步                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model_format`                                                                      | Bounded recovery has failed. Use a model that follows structured-output instructions, fewer questions, or clearer material. Enable JSON mode only when that exact model supports it. / 有限恢复仍失败；换用格式遵循更好的模型、减少题量或整理资料；仅在对应模型支持时启用 JSON 模式。 |
| `model_truncated`                                                                   | Check the output-token allowance and model limit; reduce the question count. Do not accept a partial bank. / 核对输出 Token 上限与模型限制，或减少题数，不接受残缺题库。                                                                                                              |
| `bank_invalid`                                                                      | The first author response can restart in bounded batches; a failed batch or combined bank stops. Check duplicate options, question counts and source references. / 首次出题可分批重做一轮；批次或合并题库仍不合格则停止，可检查重复选项、题量与引用。                                 |
| `model_refused`, `provider_content_filter`                                          | Review the course material and provider restrictions before a new request. / 检查资料与服务商限制，再决定是否重新请求。                                                                                                                                                               |
| `model_context_limit`, `provider_context_limit`                                     | Use a shorter source section or an appropriate model/output limit. / 缩短资料范围，或调整模型与输出上限。                                                                                                                                                                             |
| `review_rejected`, `teaching_review_rejected`                                       | The answers or teaching content did not pass verification; provide better evidence or use another model. / 答案或教学内容未通过复核，补充可靠资料或更换模型。                                                                                                                         |
| `sources_missing`, `sources_insufficient`                                           | Use a suggested narrower topic or paste/upload a real chapter. Search recovery never fabricates missing source text. / 使用建议的细分主题，或粘贴／上传真实章节，补查不会编造正文。                                                                                                   |
| `provider_auth`, `provider_model`, `provider_endpoint`                              | Verify the saved key, account region, model ID, protocol and API root. / 核对已保存密钥、账户区域、模型 ID、协议及根地址。                                                                                                                                                            |
| `provider_quota`, `provider_rate_limit`, `provider_unavailable`, `provider_timeout` | Check provider billing, limits and availability. A manual retry can incur new charges. / 检查账单、额度与服务状态；手动重试可能产生新费用。                                                                                                                                           |

MiniMax HTTP 422 with an explicit `input new_sensitive (1026)` or `output new_sensitive (1027)` marker is a provider content-check refusal, reported as `provider_content_filter`, not a request-parameter error. This refusal is not retried automatically. Check whether the supplied or retrieved material is relevant to the course, or provide the relevant chapter. A successful short connection test does not exercise the material used in a full course request.

MiniMax 返回 HTTP 422，且明确包含 `input new_sensitive (1026)` 或 `output new_sensitive (1027)` 时，属于服务商内容检查拒绝，显示为 `provider_content_filter`，不归为请求参数错误，也不会自动重试。请核对提供或检索到的资料是否与课程相关，或提供对应章节。简短连接测试成功，不代表已检查完整课程请求使用的资料。

In the bundled classroom, short-answer grading failures preserve the answer and show a retry message. Invalid or unavailable grading never earns automatic partial credit. A successful retry must return a valid score before a graded result is saved.

内置课堂的简答题评分失败会保留答案并提示重试，不会因为服务不可用或结果无效就自动给基础分；合法评分返回后才保存成绩。

Classroom actions must match the playback/storage contract before reaching the browser. An explicit `text` alias is converted to speech only when it includes real text; empty placeholders, unknown actions and missing required fields are rejected. The generated action sequence must survive upstream parsing without dropped or substituted items. An invalid action response retries only the actions stage once, reusing the scene content; a second failure returns HTTP 422 without a partial scene. Browser storage must confirm the generated scene before navigation or completion, and leaving during a save cannot pull the user back into the old classroom.

课堂动作进入浏览器前必须符合播放与存储契约；只有带明确正文的 `text` 别名才能转换为讲解，空占位、未知动作或缺少必填字段均会拒绝。上游解析也不能静默丢弃或替换动作。无效动作只在当前请求内重做动作阶段一次，复用场景内容；再次失败返回 HTTP 422，不交付残缺场景。生成场景须确认保存成功后才导航或报告完成；保存期间离开页面，旧任务不会把用户拉回旧课堂。

## API retries with Idempotency-Key / API 幂等重试

These four POST endpoints accept an optional `Idempotency-Key` header:

| Endpoint                                 | Operation / 操作                                                      |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `/api/plans`                             | Create an outline, including uploaded material / 创建大纲，含上传材料 |
| `/api/courses`                           | Generate a bank from a confirmed outline / 按已确认大纲生成题库       |
| `/api/courses/:id/attempts`              | Submit an answer sheet / 提交答卷                                     |
| `/api/attempts/:id/practice/:questionId` | Submit follow-up practice / 提交巩固练习                              |

Generate a fresh UUID for each intentional operation. If its response is lost, retry the same endpoint, session cookie, key, and request content. Matching concurrent requests share their work; a completed request returns its original saved result without another generation. Reusing a key with different effective content returns **409**. Object field order does not matter, but array order and string contents do; uploads are compared using their extracted course input. Keys contain 1–100 ASCII characters, start with a letter or digit, and otherwise allow letters, digits, `.`, `_`, `:`, and `-`.

每次新的操作生成一个新 UUID。响应丢失时，用相同接口、会话 Cookie、编号和请求内容重试：并发的相同请求合并执行，已成功请求返回原保存结果，不重新生成。相同编号用于不同的有效内容会返回 **409**。对象字段顺序不影响判断，数组顺序与字符串内容会影响；上传按提取后的课程输入核对。编号为 1–100 个 ASCII 字符，首字符为字母或数字，其余允许字母、数字及 `. _ : -`。成功后开始另一项新操作，请换新编号。

The key and a request fingerprint are stored alongside the original plan/course/attempt/practice record. There is no separate completed-answer cache. Deleting the original record removes its replay metadata too, so an old key cannot recover deleted content and may be treated as a new operation. Keep this in mind before retrying a deleted request. Keys are scoped to the current browser session and operation; they do not grant access to another student's records.

编号和内容指纹随原大纲／课程／答卷／巩固记录保存，没有独立的完成答案缓存。原记录删除时，回放元数据也一并删除；旧编号不能找回已删内容，之后再次提交可能成为新操作。编号绑定当前浏览器会话与操作，不能用来访问别人的记录。

This is a synchronous server, not a durable job queue. If a process exits before saving, retrying may perform model work again. If it saved successfully before the connection was lost, the same key can retrieve that saved result, including after a server restart. Without a key, write requests retain their normal create/submit behaviour. Check the library after a timeout before starting a fresh operation.

服务仍使用同步请求，没有持久后台任务队列。进程在保存前退出，重试可能重新调用模型；已经保存但响应丢失时，可用原编号取回结果，重启后仍有效。不带编号则按普通创建／提交处理。超时后先查看课程库，再决定是否发起新操作。

## Diagnostics and verification scope / 日志与验收范围

Generation diagnostics keep only allowlisted operational metadata: request ID, operation, phase, event, bounded attempt/count/timing fields and error categories. They do not log topics, answers, source text, raw model responses or API keys. Ordinary private course and attempt records still retain the learning content needed by the app. Do not paste `.env`, authorization headers, private source material or full answer sheets into a public issue; report the code, phase, request ID, model ID and a synthetic reproduction.

生成诊断仅记录白名单运行信息：请求编号、操作、阶段、事件、受限计数／耗时字段和错误类别，不记录主题、答案、来源正文、模型原始响应或密钥。应用正常的私有课程与答卷记录仍保存学习所需内容。公开 issue 请提供错误类别、阶段、请求编号、模型 ID 和虚构示例，不上传 `.env`、认证头或完整私人资料。

The five `npm run test:classroom` integration tests passed on 2026-09-08. Three use the built Next runtime, a local synthetic model provider, and isolated browser storage where applicable. They exercise actual handoff, classroom generation and roles, mixed-action recovery and IndexedDB reload, invalid-action rejection, saved quiz recovery, grading failures and retry, return to the original attempt, receipt-verified deletion, shared-resource last-reference cleanup, and protection against late writes from a deleted classroom. Browser navigation also checks that fonts respect the existing CSP and that no upstream access-code or stage-metadata request is made. Another test uses the actual classroom SDK with a synthetic fetch implementation to verify the scoped MiniMax-M3 thinking setting, unchanged token limit, and unaffected grading/third-party/model cases without a network connection. The final test checks strict mixed-action normalization against the actual DSL and detects upstream action filtering, truncation and fallback substitution. These tests do not call MiniMax-M3 or prove live availability or teaching quality across the provider directory. Live provider checks are separate evidence; a passing short connection test does not establish full-course success.

2026-09-08 已通过五项 `npm run test:classroom` 集成测试。其中三项使用真实构建的 Next 课堂、本地模拟模型服务，浏览器部分使用隔离存储，覆盖交接、生成与角色、混合动作恢复与 IndexedDB 重载、无效动作拒绝、测验保存恢复、坏评分与重试、返回答卷、删除凭据验证、共享资源最后引用清理，以及已删课堂的迟到写入防护；浏览器导航同时确认字体符合现有 CSP，没有上游访问码或场景元数据请求。另两项分别使用真实 SDK 与不联网的模拟 fetch 验证 MiniMax-M3 参数范围，以及按实际 DSL 核对严格动作规范化、上游丢项／截尾／默认替换检测。这里的模型服务是测试替身，不是 MiniMax-M3 实测，也不代表目录中每家服务的实时可用性或教学质量；真实模型结果须单独验证。

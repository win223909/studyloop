# Model and service configuration / 模型与服务配置

StudyLoop offers **45 service and region presets**, plus custom services, through three implemented protocols. Browse the [complete provider directory](model-providers.md) for addresses, account regions, and official documentation. The operator can use **Models & settings / 模型与设置** when accessing the app directly on its local machine. The form stores configuration in a private server file (`.env` in the project root by default, configurable with `SETTINGS_FILE`); ordinary students do not enter or receive the operator's keys. The tracked [`.env.example`](../.env.example) contains **no working key**. One provider configuration serves both StudyLoop course generation and the bundled OpenMAIC classroom in this alpha.

内置 **45 个服务与区域预设**，另支持自定义服务，采用三类模型协议。[完整服务商目录](model-providers.md)列出各项地址、账户地域和官方文档。部署者在服务所在电脑上直接访问本机地址后，可通过 **“模型与设置”** 表单填写配置；提交的密钥只保存在服务端私有配置文件中，默认是项目根目录 `.env`，可由 `SETTINGS_FILE` 指定其他位置。普通学生无需填写，也无法读取部署者的密钥。本版一个实例使用一组服务商配置，题库与内置 OpenMAIC 课堂共用，公开模板不含可用密钥。

## 1. Configure through the local interface / 使用本机配置界面

1. Start StudyLoop and open [http://127.0.0.1:3210](http://127.0.0.1:3210) or [http://localhost:3210](http://localhost:3210) directly on the machine running the app. If the instance has a password, sign in first.
2. Open **Models & settings / 模型与设置**. Search the provider directory by Chinese or English name, or browse its China mainland, international, and local/self-hosted groups. Choose the correct account region, confirm the API base URL, then enter an accessible model ID and your own key in the password field. Model IDs are entered manually; a preset does not choose or verify a model for you.
3. Optionally use **Test connection / 测试连接** before saving. This sends a small real model request using the form values and may incur a provider charge. Testing does not save the form or prove that a full course can pass the content review. Tests do not consume `DAILY_GENERATION_LIMIT` (the outline/bank/classroom request allowance); only one connection test runs at a time.
4. Choose **Save / 保存**. A successful save updates the private configuration file and applies to new generation requests immediately; no app restart is needed for these form settings. Saving validates and persists settings; it does not itself prove the provider is reachable.

中文操作：启动服务 → 在服务所在电脑直接打开本机地址 → 如有实例密码，先登录 → 进入“模型与设置” → 搜索服务商名称或按国内／国际／本地分组选择 → 核对账户地域与地址 → 自行填写模型 ID、自己的 API Key → 可先测试连接 → 保存。表单保存后对新生成请求立即生效，不必重启；“已保存”和“连接测试成功”是不同结果。连接测试不扣大纲／题库／课堂的每日生成次数，但仍可能产生服务商费用，同一时间只允许一个测试运行。

**Existing secrets are never returned to the browser.** A blank key field keeps the saved key for the same provider and API address; use the explicit clear option to remove it. Changing the service or API address requires a new key instead of forwarding the previous service's key. For an intentionally keyless local model, select keyless mode and explicitly clear any previously saved key.

**已有密钥不会回传到浏览器。** 同一服务和 API 地址下，密钥留空表示保留已有值，需要删除时使用明确的清除选项；更换服务或 API 地址时必须重新填写密钥，不能沿用原服务的密钥。无密钥本地模型需明确开启免密模式，并清除之前保存的密钥。

### File-based configuration / 手动编辑配置

You can still configure a deployment by editing its private environment file or environment variables. For a fresh checkout:

```bash
cp .env.example .env
```

Open `.env` in a local text editor. Choose the protocol and set the API base URL, a model ID your account can access, and your own key. Manual file/environment changes need an app restart. Replace every placeholder model ID below. API roots are not browser chat websites. Do not append `/chat/completions`, `/messages`, or `/models/...:generateContent`; StudyLoop appends the endpoint.

也可以用本地文本编辑器打开 `.env`，填写服务类型、API 根地址、账户可用的模型 ID 和自己的密钥；手动改文件或环境变量后需要重启服务。下面的 `your-model-id` 都需要替换。不要填写网页版聊天地址，也不要在根地址后重复添加具体 API 路径。

Keep `.env` and any custom private settings directory out of version control and container build contexts. Do not use a `VITE_` prefix for secrets: frontend build variables can become public. Entering a key into the local management form does not make it a frontend build variable. If you already have a `.env`, edit it instead of copying over it. To clear a key manually, keep an explicit empty entry such as `LLM_API_KEY=`; deleting the entry can leave a startup environment value in effect.

## 2. Select a protocol / 选择协议

| `LLM_PROVIDER`      | Request and authentication / 请求与鉴权                                        | Choose when / 适用情况                                                                                   |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `openai-compatible` | Chat Completions JSON; `Authorization: Bearer`                                 | A listed compatible endpoint or a custom service with the same contract / 兼容目录或相同协议的自定义服务 |
| `anthropic`         | Native Messages with Anthropic API headers / 原生 Messages 及 Anthropic 请求头 | Anthropic Claude or a verified native-protocol endpoint / Claude 或已核对的原生协议接口                  |
| `gemini`            | Native `generateContent` / 原生 `generateContent`                              | Google Gemini API or a verified native-protocol endpoint / Gemini API 或已核对的原生协议接口             |

The [complete 45-preset directory](model-providers.md) is the address reference. Mainland China and international accounts have separate entries where the service requires them; select the region of your API account, not just the model brand. Model IDs, deployment names, permissions, and output limits remain specific to that account. The directory was checked against linked official documentation; the project does **not** claim live testing of every service or model. A compatible model must still follow the course JSON contract.

地址以[完整 45 项目录](model-providers.md)为准。国内与国际账户、不同地域有独立入口时分别列出；按 API 账户所在平台与地域选择，不要只看模型品牌。模型 ID 或部署名称需要自行填写，权限和输出限制以对应账户为准。目录根据官方文档核对，**不代表已经逐服务商、逐模型实测**，也不保证每个模型都能生成合格题库。

Azure OpenAI / Foundry uses your resource-specific `/openai/v1` root, a deployment name, and an API key. The older deployment URL with an `api-version` query is not supported directly. Amazon Bedrock has a US East (N. Virginia) Chat Completions preset using a **Bedrock API key**; StudyLoop does not perform SigV4 signing or accept an AWS Access Key/Secret Key pair. Other services needing custom headers, signing, or a different request shape need a compatible gateway. See the [Azure v1 documentation](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle) and [Bedrock Chat Completions guide](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions-mantle.html).

Azure 需填写资源专属 `/openai/v1` 根地址、部署名称和 API Key；旧版带 `api-version` 查询参数的部署接口仍不直接支持。Bedrock 已提供美国弗吉尼亚区域的 Chat Completions 预设，密钥填写 **Bedrock API Key**；当前不执行 SigV4 签名，也不接受 AWS Access Key / Secret Key 组合。需要其他认证头、签名或专有请求格式的服务，可通过兼容网关接入。

### OpenAI-compatible example / 兼容接口示例

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=your-model-id
LLM_API_KEY=
```

Fill the last line with **your own** key in `.env`. The empty line above is deliberate. To switch vendors, change the base URL, model, and key together.

最后一行请在自己的 `.env` 中填写自己的密钥；文档和模板故意留空。更换服务商时同时检查地址、模型 ID 和密钥。DeepSeek 预设使用官方根域 `https://api.deepseek.com`；已保存的兼容 `/v1` 地址不会被静默改写。

### MiniMax model ID example / MiniMax 模型 ID 示例

For a mainland China API account, the following uses the model ID from [MiniMax's official example](https://platform.minimaxi.com/docs/api-reference/text-openai-api):

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.minimax.cn/v1
LLM_MODEL=MiniMax-M3
LLM_TOKEN_PARAMETER=max_completion_tokens
LLM_API_KEY=
```

**Model ID names the model**, such as `MiniMax-M3`; do not enter a numeric account/Group ID or an API key in this field. The official model list also includes `MiniMax-M2.7` and `MiniMax-M2.5`; check access for your account. For an international account, use `https://api.minimax.io/v1` and that account's own key, as shown in the [international documentation](https://platform.minimax.io/docs/api-reference/text-openai-api). Model suggestions are editable starting points, not a guarantee of account access or course quality. The key above is deliberately blank; enter your own key only in the private settings form or `.env`.

上方是国内账户示例，主模型填写 `MiniMax-M3`。**模型 ID 是模型名称**，不要填写数字账户编号、Group ID 或 API Key。官方也列出 `MiniMax-M2.7`、`MiniMax-M2.5`，可用权限以自己的账户为准。国际账户改用 `https://api.minimax.io/v1` 及国际账户自己的密钥，国内和国际配置分别选择。界面中的模型建议仍可自行修改，不代表已验证账户权限或出题质量；示例密钥始终留空，仅在自己的私有配置中填写。

If a complete question bank is cut short, increase **Maximum output tokens** in advanced settings within the model's limit, or choose fewer questions. For a six-question MiniMax-M3 bank, try `LLM_MAX_OUTPUT_TOKENS=16384` and `LLM_TIMEOUT_MS=180000`; these are adjustable starting values, not a guarantee that every request will fit. Longer outputs can take more time and incur more usage. A successful short connection test does not check this full-generation budget.

如果完整题库提示输出截断，可在高级参数中调高**最大输出 token 数**（不超过模型限制），或减少题数。MiniMax-M3 生成六题时可尝试 `LLM_MAX_OUTPUT_TOKENS=16384`、`LLM_TIMEOUT_MS=180000`，再按实际结果调整；更长输出会增加耗时和用量，不能保证任意请求都能完成。简短的连接测试通过，不代表完整题库的输出预算已足够。

### Native Anthropic / 原生 Anthropic

```dotenv
LLM_PROVIDER=anthropic
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_MODEL=your-claude-model-id
LLM_API_KEY=
```

The adapter uses the Messages endpoint with Anthropic's API headers; it does not send an OpenAI-shaped request to Anthropic.

### Native Gemini / 原生 Gemini

```dotenv
LLM_PROVIDER=gemini
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_MODEL=your-gemini-model-id
LLM_API_KEY=
```

The adapter uses `generateContent`. Use the model ID from your Gemini API account, not a web subscription name.

### Local Ollama / 本地 Ollama

Install and start Ollama, pull a model able to produce structured JSON, then configure:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_MODEL=your-installed-model-name
LLM_API_KEY=
LLM_ALLOW_KEYLESS=true
```

`LLM_ALLOW_KEYLESS=true` explicitly enables a keyless local service. Keep it `false` for hosted providers. Container loopback addresses point inside the container, not at your host. On Docker Desktop, a host service may be reachable through `host.docker.internal`; Linux/NAS networks need an explicitly reachable local address. Limit that model service to a trusted network.

本地模型需要先安装并拉取。容器中的 `127.0.0.1` 是容器自身；若模型运行在宿主机，请使用容器可访问的地址。云端模型通常应保持 `LLM_ALLOW_KEYLESS=false`。

Some presets supply an output-token parameter recommendation. For manual configuration, copy the directory's `LLM_TOKEN_PARAMETER` note when present; for example, MiniMax, SenseCore, and Azure use `max_completion_tokens` in the listed preset. `auto` is not vendor detection: it selects that field for the official OpenAI host and `max_tokens` elsewhere. Keep `LLM_JSON_MODE=false` unless the chosen model supports JSON mode.

部分预设附有输出长度参数建议；手动配置时需要同时填写目录注明的 `LLM_TOKEN_PARAMETER`。例如目录中的 MiniMax、SenseCore、Azure 使用 `max_completion_tokens`。`auto` 不会识别全部厂商：它仅对 OpenAI 官方主机选择该字段，其他地址使用 `max_tokens`。除非具体模型支持，保持 `LLM_JSON_MODE=false`。

## 3. Save, test, then try a small course / 保存、测试并试一门小课

After saving through the local form, new generation requests use the saved values immediately. Connection tests can also use unsaved values; remember to save a working configuration afterward. A successful connection test checks a small provider response, not question quality, all optional services, or every stage of course generation.

通过表单保存后，新生成请求立即使用新配置。连接测试也可以测试未保存的输入，测试通过后仍需保存。连接测试仅检查少量模型响应，不代表所有搜索、课堂服务或完整出题复核流程都已验证。

If you edited the file or deployment environment manually, restart Node.js by stopping and rerunning `npm start`. For Compose environment changes:

```bash
docker compose up -d --force-recreate
```

Open StudyLoop, create a plan from a short subject, confirm one or two objectives, and generate four questions first. Check its sources and answers before using it more broadly. The app exposes availability through `/api/config`, never key values.

先用一个范围清楚的主题，选择 1–2 个知识点、4 道题，核查内容后再扩大使用。`/api/config` 只提供功能是否已配置，不显示密钥。

## Local management and deployment settings / 本机管理与部署配置

Management is restricted to authenticated **direct loopback requests**. A remote student sees a read-only explanation and setup instructions; knowing the shared instance password does not grant a remote administrator role. Requests forwarded through a reverse proxy are not eligible for management. The app does not introduce a separate remote administrator password in this version.

管理接口要求**本机回环直连**，如设置了实例密码，还需先登录。远程学生只看到只读提示和配置说明；共享学生口令不等于远程管理员身份。经反向代理转发的请求不能使用管理功能，本版本不新增远程管理员口令。

For a Node.js instance on a NAS/server, an operator can use an SSH local port forward to the server's loopback listener:

```bash
ssh -N -L 13210:127.0.0.1:3210 your-user@your-server
```

Keep that SSH session open, then visit [http://127.0.0.1:13210](http://127.0.0.1:13210). Replace the placeholder SSH user and host with your own. This assumes the app is directly reachable on the server's loopback port; Docker networking may introduce an additional non-loopback hop and is not equivalent to a direct Node.js listener.

NAS 或服务器可通过 SSH 本地端口转发操作：将示例中的 SSH 用户和主机替换成自己的值，保持终端连接，再打开 `http://127.0.0.1:13210`。此例适用于服务直接监听服务器本机回环端口的情况；Docker 端口映射可能引入另一层网络跳转，不能保证获得本机管理权限。

The form edits **model settings, optional Brave Search, and generation limits**. It preserves unrelated `.env` entries. Saves replace the file atomically with private permissions; the parent directory must already exist and be writable, and the configuration target cannot be a symbolic link or a non-regular file. Listener and access settings—`HOST`, `PORT`, `DATA_DIR`, `INSTANCE_PASSWORD`, `COOKIE_SECURE`, and `TRUST_PROXY`—remain deployment configuration: edit them privately and restart. A successful form save is not a change to the shared instance password or network exposure.

表单只修改**模型、可选 Brave 搜索和生成额度**，保留 `.env` 中其他项目。保存采用私有权限和原子替换；父目录需要已存在且可写，目标不能是符号链接或其他非普通文件。`HOST`、`PORT`、`DATA_DIR`、`INSTANCE_PASSWORD`、`COOKIE_SECURE`、`TRUST_PROXY` 仍在部署时私下修改文件并重启，不通过本次表单更改。

### Configuration file selection / 指定配置文件

Set `SETTINGS_FILE` in the startup environment to an absolute path or a path relative to the process's working directory. The default is `.env` in the project root. At startup, only the managed model/search/generation-limit entries present in this file override matching startup environment values. Other deployment settings still come from the normal startup configuration; putting `HOST` or an instance password into a separate settings file does not change those settings. The form preserves unrelated entries and updates the active managed values after a successful save.

在启动环境变量中设置 `SETTINGS_FILE`，可使用绝对路径或相对于进程工作目录的路径，默认指向项目根目录 `.env`。启动时，该文件中属于模型／搜索／生成额度白名单的值优先于同名启动环境变量；`HOST`、实例密码等部署项仍使用正常启动配置，不会因为写进单独的设置文件就被覆盖。表单保留非管理项，保存成功后立即更新运行中的管理配置。

Manual file edits still require a restart (or an explicit form save) to update active model settings. Reloading the settings page can show the edited file without applying it to generation. When clearing a secret by hand, use an explicit empty assignment rather than removing the line.

手动修改文件后，仍需重启或明确通过表单保存才会更新运行中的模型配置；仅刷新配置页面看到新值不代表生成服务已切换。手动清除密钥请保留 `LLM_API_KEY=` 等明确的空值，不要只删除这一行。

### Docker persistence / Docker 配置持久化

**The default bridged Docker deployment does not enable GUI management.** Management checks the real socket peer for loopback; publishing a container port on host `127.0.0.1` or forwarding that host port through SSH does not make the connection loopback inside the container. Use manual configuration by default. An advanced local management path would need to operate within the container's own network namespace under controlled access; a normal reverse proxy cannot grant this access.

**默认桥接网络 Docker 部署未开放图形化管理。** 管理接口检查真实连接是否来自容器内部回环地址；端口发布在宿主机 `127.0.0.1`，或通过 SSH 转发该宿主机端口，都不等于容器内部回环连接。默认请手动配置。受控的高级本机管理方式需要在容器自身网络命名空间内建立访问，普通反向代理不能授予管理权限。

Compose `env_file: .env` supplies startup variables; it does **not** mount a writable configuration file. For persistent managed settings, create a private host directory and add the following entries to the existing service definition, keeping its existing learning-data volume:

```bash
mkdir -p private-settings
```

```yaml
services:
  studyloop:
    environment:
      SETTINGS_FILE: /app/private-settings/settings.env
    volumes:
      - ./private-settings:/app/private-settings
```

This illustrates a persistence location, **not** a way to enable the management interface. The image runs as the non-root `node` user; give that user write access to the mounted private directory using your host's appropriate ownership settings. Mount the **whole directory**, not a single settings file: atomic saves need a writable parent directory and a rename operation. Even with a read-only container filesystem, this mount must remain writable. Keep the directory out of Git and image build contexts.

`env_file: .env` 只注入启动变量，不会挂载可写配置文件。上例仅说明如何持久化设置文件，**不会启用管理界面**。镜像以非 root 的 `node` 用户运行，应按宿主机权限规则让该用户可写私有目录。必须挂载**整个目录**，不能只挂载单个文件，原子保存需要可写父目录和重命名操作；容器主体即使只读，此配置卷也必须可写。私有目录不得进入 Git 或镜像构建上下文。

You may edit `private-settings/settings.env` privately on the host and restart the app. Its managed entries take priority over `env_file` values on startup. Without this custom file arrangement, edit the original deployment environment and recreate the container. Neither approach requires putting keys into an image or public repository.

可在宿主机私下编辑 `private-settings/settings.env` 后重启应用，该文件的白名单配置在启动时优先于 `env_file` 值。未采用自定义文件方案时，继续修改原部署环境并重建容器即可。

## Model quality and resource controls / 质量与资源限制

| Variable                     | Default                   | Meaning                                                                                                                                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SETTINGS_FILE`              | Project-root `.env`       | Startup-only path to the private managed settings file; absolute or relative to the process working directory                                                |
| `LLM_PROVIDER`               | `openai-compatible`       | `openai-compatible`, `anthropic`, or `gemini`                                                                                                                |
| `LLM_BASE_URL`               | Protocol-specific default | Explicit value in `.env` overrides it; change it when switching provider                                                                                     |
| `LLM_API_KEY`                | Empty                     | Server-only credential                                                                                                                                       |
| `LLM_MODEL`                  | Empty                     | Required model ID; an empty value disables generation                                                                                                        |
| `LLM_REVIEW_MODEL`           | Primary model             | Optional second model ID on the same provider/base URL for the independent review pass                                                                       |
| `LLM_ALLOW_KEYLESS`          | `false`                   | Explicit opt-in for a local/keyless model endpoint                                                                                                           |
| `LLM_TIMEOUT_MS`             | `90000`                   | Timeout for a model request                                                                                                                                  |
| `LLM_MAX_OUTPUT_TOKENS`      | `8192`                    | Requested output bound per model request                                                                                                                     |
| `LLM_TOKEN_PARAMETER`        | Automatic                 | Compatible API only: `max_completion_tokens` for the official OpenAI host, `max_tokens` elsewhere; override with either field when your endpoint requires it |
| `LLM_JSON_MODE`              | `false`                   | Optional compatible-API `json_object` mode; enable only when your vendor/model supports it                                                                   |
| `DAILY_GENERATION_LIMIT`     | `20`                      | Shared daily cap on plan, question-bank, and classroom generation requests                                                                                   |
| `MAX_CONCURRENT_GENERATIONS` | `2`                       | Concurrent generation requests for the instance                                                                                                              |

Creating a plan normally uses one model call. Keyword search may add one focused retrieval round and a second model coverage check, for at most two planning calls. Creating the question bank normally uses three more calls (authoring, blind answer review, and explanation/evidence review). One UI action can therefore consume several model calls; the daily limit is an application request cap, **not a currency budget**. A classroom has at most six scenes and commonly uses two generation requests per scene after its outline. Classroom requests share this allowance, so the default 20 does not mean 20 classrooms. Failed requests also consume the application's daily allowance. Set financial limits in your provider console as well. A review model shares the primary provider's base URL and key; cross-provider review routing is a future feature.

生成大纲通常使用一次模型调用；关键词覆盖不足时，最多增加一轮补查和一次模型核对，大纲阶段合计最多两次。生成题库通常再调用三次，分别用于出题、独立解答复核、解析与教学依据复核。课堂最多六个场景，生成大纲后每个场景通常还有两次生成请求，额度与题库共用。每日限制按应用请求计数，默认 20 次不等于 20 门课堂，也不等于金额上限；失败请求也计入应用额度。费用上限需要同时在服务商控制台设置。复核模型与主模型共用服务商、地址和密钥，目前不支持单独跨服务商配置。

## Optional search and OpenMAIC / 可选搜索与课堂

- **Search:** default Wikipedia search needs no API key. The first round uses the entered topic; the model checks whether the retrieved material supports that topic and learning level. When coverage is insufficient, it can supply up to three concepts or synonyms for one follow-up search, then check the combined evidence again. There is no open-ended search loop or relaxation of the evidence requirement. Pasted/uploaded sources do not trigger this external-search fallback.

默认无需搜索密钥，先按用户主题检索 Wikipedia，再由模型核对主题和学习水平的覆盖情况。覆盖不足时，模型可提出最多三个概念或同义词，自动补查一轮，再核对合并后的资料；不会无限搜索，也不会放宽资料要求。粘贴与上传的材料不触发此自动外搜流程。

Each Wikipedia query makes one search request and fetches up to three article bodies: at most four requests initially and twelve in the follow-up round, with duplicate requests reused within that round. After deduplication, the planning input contains at most eight sources and 36,000 characters in total. Long articles retain their introduction and topic-relevant original passages; `[…]` marks omitted passages. Open the linked source page for the full article.

Wikipedia 每个检索词对应一次搜索及最多三篇正文请求：初搜最多四次，补查最多十二次，同一轮的重复请求会复用。来源去重后最多保留八个来源、合计 36,000 字符。长文章保留导言及与主题相关的原文段落，`[…]` 表示省略部分，可打开来源页查看全文。

Wikipedia is an encyclopedia and may not cover a school chapter, textbook edition, or combined curriculum topic. Add your own `BRAVE_SEARCH_API_KEY` in the local settings form or private configuration to broaden retrieval to web search excerpts; search-provider charges and quotas are separate from model usage. StudyLoop labels these as excerpts and does not download arbitrary result pages, so this is not a guarantee of textbook coverage. If the second check still fails, choose a suggested narrower topic or paste/upload a relevant chapter. The official Smart Education entry and attributed chapter import remain available; this fallback does not log in to or scrape its textbook reader.

Wikipedia 属于百科资料，不保证覆盖学校章节、特定教材版本或组合知识点。可在本机设置表单或私有配置中填写自己的 `BRAVE_SEARCH_API_KEY`，扩展到网页搜索摘要；搜索服务的费用与额度独立于模型。StudyLoop 会标明摘要来源，不会抓取任意结果页面，也不保证由此获得完整教材覆盖。第二次核对仍失败时，可选择建议的细分主题，或粘贴／上传相关章节。现有智慧教育官网入口与带来源的章节导入仍可使用；自动补查不会代登录或抓取其教材阅读器。

- **OpenMAIC:** the real classic classroom is bundled by `npm run build` and starts automatically when first opened. It reuses the saved model configuration; no second key or external classroom address is needed. Create a classroom from a saved StudyLoop attempt and confirm its outline. The classroom library lists lessons saved in this browser. The former `OPENMAIC_URL` variable is retained only for legacy file compatibility and no longer controls navigation. [Classroom and rebuild guide](openmaic.md).

  **内置课堂：** `npm run build` 会同时构建真实经典课堂，首次打开时自动启动，复用已保存的模型配置，无需另填地址或密钥。创建入口在 StudyLoop 答卷中；课堂首页展示当前浏览器已保存的课堂。旧地址变量不再用于导航。

- **Speech:** the first release uses the browser/system speech API when available. It does not include a cloud TTS API adapter. Browser voices, languages, and offline operation depend on the browser and operating system.

## Common problems / 常见问题

| Symptom                                                   | Check                                                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Examples work, generation is unavailable                  | Save a model ID and key in the local form, or explicitly enable keyless mode for a local server; manual file edits need a restart                   |
| Settings are read-only                                    | Open the direct loopback address on the app's host, sign in if required, and avoid a reverse proxy; remote shared access is not management access   |
| The saved key field is blank                              | Saved keys are never read back; blank preserves the existing key for the same service/address, while the clear option removes it                    |
| Changing the service/address asks for a key               | Enter that endpoint's own key; the old endpoint's key is deliberately not reused                                                                    |
| Connection test works but generation is still unavailable | Save the tested form; testing unsaved values does not persist them                                                                                  |
| GUI changes disappear after replacing a container         | Configure a writable persistent private settings location, or use host environment configuration and recreate the container                         |
| Saving fails with a file/permission error                 | Ensure the private configuration's parent directory exists and is writable; use a regular file rather than a symlink                                |
| 401/403 from a provider                                   | Check your key, account region, API permissions, and selected API product; a consumer chat subscription may not cover API calls                     |
| 404 or model not found                                    | Verify the base root and model/deployment ID; avoid duplicated `/v1` or API path suffixes                                                           |
| JSON parsing or review rejection                          | Use a stronger instruction-following model, a smaller course scope, more source material, or a supported JSON mode                                  |
| Timeout                                                   | Reduce the question count; inspect provider availability; increase `LLM_TIMEOUT_MS` only within your hosting limits                                 |
| “Material insufficient”                                   | Keyword search has exhausted its one follow-up round or the supplied material is inadequate; use a suggested narrower topic or provide chapter text |
| Local model works outside Docker only                     | Use a model-server address reachable from the container                                                                                             |
| Daily request cap reached                                 | Wait for the server's UTC date reset or intentionally adjust the instance limit; check actual provider usage separately                             |

**MiniMax HTTP 400 with `unknown model` (2013):** check the primary model ID first. An account/Group ID in `LLM_MODEL` is not a model name; replace it with an available ID such as `MiniMax-M3` and check any separate review model too. Keep the correct regional endpoint and its key. Test the corrected configuration, then save it; a test does not save changes. This error alone does not establish that the key is invalid.

**MiniMax 返回 HTTP 400、`unknown model`（2013）：** 先核对“主模型 ID”，把误填的账户编号／Group ID 改为账户可用的模型名称，例如 `MiniMax-M3`；如果单独填写了复核模型，也要检查。确认地址和密钥属于同一区域，测试修正后的配置，再点击保存；测试本身不会保存。仅凭这个错误不能判定密钥失效。

Generation is a synchronous HTTP operation in this alpha, not a durable background job. A follow-up source search with two planning calls, or three sequential bank calls on a slow model, can exceed a reverse proxy's request timeout even when each model call is within its own timeout. Check the course library after reconnecting before retrying: the server may have finished after the browser lost its connection. There is no automatic job resume or exactly-once retry guarantee. Start with direct local access and a small bank when diagnosing this.

本版生成使用同步 HTTP 请求，没有可恢复的后台任务。补查检索加两次大纲核对，或慢模型的三轮题库调用，都可能超过反向代理的请求时限；断线后先检查课程库再重试，避免服务端已经生成完成却重复消耗额度。可先在本地直连环境用较少题数排查。

Do not paste `.env`, authorization headers, or full student work into a public issue. Report the protocol, redacted base hostname, model ID, error category, and a synthetic reproduction instead.

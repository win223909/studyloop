# Model and service configuration / 模型与服务配置

StudyLoop supports multiple providers through three implemented protocols. All values belong in your local `.env` or deployment environment. The tracked [`.env.example`](../.env.example) contains **no working key**. One provider configuration serves the instance in this alpha; students do not enter keys in the browser.

支持三类模型协议，部署者可以选择不同服务商。所有配置只保存在本地 `.env` 或服务器环境变量中，学生不需要在网页里填写密钥。本版一个实例使用一组服务商配置。

## 1. Prepare your own configuration / 准备自己的配置

```bash
cp .env.example .env
```

Open `.env` in a local text editor. Choose the protocol and set the API base URL, a model ID your account can access, and your own key. Replace every placeholder model ID below. API roots are not browser chat websites. Do not append `/chat/completions`, `/messages`, or `/models/...:generateContent`; StudyLoop appends the endpoint.

用本地文本编辑器打开 `.env`，填写服务类型、API 根地址、账户可用的模型 ID 和自己的密钥。下面的 `your-model-id` 都需要替换。不要填写网页版聊天地址，也不要在根地址后重复添加具体 API 路径。

Keep `.env` out of version control. Do not use a `VITE_` prefix for secrets: frontend build variables can become public. If you already have a `.env`, edit it instead of copying over it.

## 2. Select a protocol / 选择协议

| Service                        | `LLM_PROVIDER`      | `LLM_BASE_URL`                                           | Model selection                                 |
| ------------------------------ | ------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| OpenAI                         | `openai-compatible` | `https://api.openai.com/v1`                              | An available Chat Completions model             |
| Anthropic Claude               | `anthropic`         | `https://api.anthropic.com/v1`                           | Your Claude model ID                            |
| Google Gemini                  | `gemini`            | `https://generativelanguage.googleapis.com/v1beta`       | Your Gemini model ID                            |
| DeepSeek                       | `openai-compatible` | `https://api.deepseek.com/v1`                            | Your available DeepSeek model                   |
| Qwen / 通义千问, China Beijing | `openai-compatible` | `https://dashscope.aliyuncs.com/compatible-mode/v1`      | Your Model Studio model ID                      |
| Qwen, Singapore                | `openai-compatible` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | A model from the same region as the key         |
| MiniMax, international         | `openai-compatible` | `https://api.minimax.io/v1`                              | Your available MiniMax model                    |
| OpenRouter                     | `openai-compatible` | `https://openrouter.ai/api/v1`                           | The exact catalog slug, including vendor prefix |
| Ollama, on the same host       | `openai-compatible` | `http://127.0.0.1:11434/v1`                              | A locally installed model name                  |
| Other compatible services      | `openai-compatible` | The vendor's Chat Completions API root                   | The vendor's model or deployment ID             |

The compatible adapter sends Bearer authentication and Chat Completions JSON. Services such as Moonshot/Kimi, Doubao, GLM, and custom gateways can be configured when their selected endpoint supports that contract. Vendor-specific request signing, custom headers, Azure deployment routing, and AWS Bedrock are not implemented directly; use a compatible gateway if needed. A compatible endpoint still needs a model that follows the course JSON contract.

OpenAI 兼容模式使用 Bearer 认证和 Chat Completions 请求。Kimi、豆包、智谱及其他服务可在其接口满足该协议时接入；不同区域、账号类型或订阅计划可能使用不同地址。当前没有直接实现 AWS 请求签名、Azure 专用部署路由或任意认证头，必要时使用兼容网关。协议兼容并不代表每个模型都能稳定生成合格题库。

Endpoint references: [DeepSeek](https://api-docs.deepseek.com/), [Qwen region endpoints](https://help.aliyun.com/en/model-studio/base-url), [MiniMax compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api), [OpenRouter](https://openrouter.ai/docs/quickstart), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [Gemini generateContent](https://ai.google.dev/api/generate-content). Provider offerings can change; check the documentation for your account region and model access.

### OpenAI-compatible example / 兼容接口示例

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=your-model-id
LLM_API_KEY=
```

Fill the last line with **your own** key in `.env`. The empty line above is deliberate. To switch vendors, change the base URL, model, and key together.

最后一行请在自己的 `.env` 中填写自己的密钥；文档和模板故意留空。更换服务商时同时检查地址、模型 ID 和密钥。

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

## 3. Restart and try a small course / 重启并试一门小课

For Node.js, stop and rerun `npm start`. For Compose:

```bash
docker compose up -d --force-recreate
```

Open StudyLoop, create a plan from a short subject, confirm one or two objectives, and generate four questions first. Check its sources and answers before using it more broadly. The app exposes availability through `/api/config`, never key values.

先用一个范围清楚的主题，选择 1–2 个知识点、4 道题，核查内容后再扩大使用。`/api/config` 只提供功能是否已配置，不显示密钥。

## Model quality and resource controls / 质量与资源限制

| Variable                     | Default                   | Meaning                                                                                                                                                      |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
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
| `DAILY_GENERATION_LIMIT`     | `20`                      | Shared daily cap on plan/question-bank requests                                                                                                              |
| `MAX_CONCURRENT_GENERATIONS` | `2`                       | Concurrent generation requests for the instance                                                                                                              |

Creating a plan uses one model call; creating its question bank normally uses three more (authoring, blind answer review, and explanation/evidence review). One UI action can therefore consume several model calls; the daily limit is an application request cap, **not a currency budget**. Failed requests also consume the application's daily allowance. Set financial limits in your provider console as well. A review model shares the primary provider's base URL and key; cross-provider review routing is a future feature.

生成大纲使用一次模型调用；生成题库通常再调用三次，分别用于出题、独立解答复核、解析与教学依据复核。每日限制按应用请求计数，不等于金额上限；失败请求也计入应用额度。费用上限需要同时在服务商控制台设置。复核模型与主模型共用服务商、地址和密钥，目前不支持单独跨服务商配置。

## Optional search and OpenMAIC / 可选搜索与课堂

- **Search:** default Wikipedia search needs no API key. Add your own `BRAVE_SEARCH_API_KEY` to use Brave Search excerpts. This version does not download arbitrary search-result pages; a short excerpt may be insufficient for a reliable course. Upload richer material when asked.
- **OpenMAIC:** set `OPENMAIC_URL` to the clean HTTP(S) address of your own classroom deployment. The value becomes an “open classroom” link; it must not contain a username, password, query token, or fragment. Brief download works with this value blank. OpenMAIC's own model/media configuration is separate. [Guide](openmaic.md).
- **Speech:** the first release uses the browser/system speech API when available. It does not include a cloud TTS API adapter. Browser voices, languages, and offline operation depend on the browser and operating system.

## Common problems / 常见问题

| Symptom                                  | Check                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Examples work, generation is unavailable | Fill `LLM_MODEL` and `LLM_API_KEY`, or explicitly enable keyless mode for a local server; restart after edits                   |
| 401/403 from a provider                  | Check your key, account region, API permissions, and selected API product; a consumer chat subscription may not cover API calls |
| 404 or model not found                   | Verify the base root and model/deployment ID; avoid duplicated `/v1` or API path suffixes                                       |
| JSON parsing or review rejection         | Use a stronger instruction-following model, a smaller course scope, more source material, or a supported JSON mode              |
| Timeout                                  | Reduce the question count; inspect provider availability; increase `LLM_TIMEOUT_MS` only within your hosting limits             |
| “Material insufficient”                  | A timetable or keyword is not teaching evidence; upload relevant explanations or chapter text                                   |
| Local model works outside Docker only    | Use a model-server address reachable from the container                                                                         |
| Daily request cap reached                | Wait for the server's UTC date reset or intentionally adjust the instance limit; check actual provider usage separately         |

Generation is a synchronous HTTP operation in this alpha, not a durable background job. A slow model's three sequential bank calls can exceed a reverse proxy's request timeout even when each model call is within its own timeout. Check the course library after reconnecting before retrying: the server may have finished after the browser lost its connection. There is no automatic job resume or exactly-once retry guarantee. Start with direct local access and a small bank when diagnosing this.

本版生成使用同步 HTTP 请求，没有可恢复的后台任务。慢模型的三轮题库调用可能超过反向代理的请求时限；断线后先检查课程库再重试，避免服务端已经生成完成却重复消耗额度。可先在本地直连环境用较少题数排查。

Do not paste `.env`, authorization headers, or full student work into a public issue. Report the protocol, redacted base hostname, model ID, error category, and a synthetic reproduction instead.

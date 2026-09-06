# Security and privacy

## Supported version

The current alpha release receives fixes on `main`. This is an early personal/small-group learning tool, not a production school identity system or a confidential examination platform.

## Reporting a vulnerability

Use the repository's private **Security → Advisories → Report a vulnerability** flow when available: [private reporting](https://github.com/win223909/studyloop/security/advisories/new). Include the affected version, impact, and minimal reproduction with synthetic data. Do not include real keys, cookies, private course material, or student identities.

If private reporting is unavailable, open an issue that only asks the maintainer for a private reporting channel; do not publish the exploit or private data there. No paid bounty or response-time guarantee is offered.

## Credentials

- Model/search keys and the optional instance password are read on the server from `.env` or environment variables. The public configuration endpoint reports feature availability, not secret values.
- `.env`, data directories, logs, backups, and browser profiles must stay out of Git and container build contexts. `.env.example` contains no working credentials.
- Frontend build variables such as `VITE_*` are public; do not put secrets in them. Do not embed credentials in `LLM_BASE_URL` or `OPENMAIC_URL`.
- Use your own keys and provider spending caps. If a key was exposed, revoke it at the provider and replace it privately; removing a line from the latest commit does not revoke the old key.

## Access and learning records

The server issues a random HttpOnly, SameSite=Strict browser session cookie. It uses a hash of that token as the private record owner. Requests for generated courses, plans, and attempts must belong to the current browser session. Shared original samples are available to every authorized browser.

An optional `INSTANCE_PASSWORD` gates access to a shared instance. It is **not an individual student account**: entering the same password in another browser does not recover the first browser's history. Cookies last 90 days. Clearing or losing a cookie, changing browser, or using another device can lose access to the original records. Cross-device accounts, guardian/teacher roles, invitations, record recovery, and user-managed deletion are not implemented.

Records are saved locally under `DATA_DIR`, without application-level encryption. The operator and anyone with host/volume access can read them. The alpha has no automatic retention cleanup; operators must manage retention, access, and private backups. Do not treat anonymous session isolation as an institutional privacy compliance claim.

未配置姓名不等于资料完全匿名。课程和答卷正文仍可能含作者输入的个人信息。记录保存在部署者的数据目录中，当前没有应用层加密、自动过期删除或跨设备账户找回。实例密码只是共享入口保护，各浏览器的记录仍分别保存。

## Data sent to external services

| Operation                                     | Data and destination                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Bundled example practice, grading, and replay | Handled by your StudyLoop server; no model API needed                                                    |
| Topic search                                  | Topic/keywords sent to Wikipedia or the configured Brave Search API                                      |
| New-course planning/generation/review         | Topic, level, objectives, source material, and generated course content sent to the configured model API |
| Browser read-aloud                            | Handled by the browser/system voice implementation; behaviour depends on that implementation             |
| OpenMAIC brief download                       | Generated locally by StudyLoop; does not contact OpenMAIC                                                |
| Manual brief upload/paste in OpenMAIC         | Shares selected learning content with that deployment and its configured providers                       |

Search text and uploaded material are treated as untrusted data. The prompt asks models to ignore embedded commands; schema/source validation and separate reviews also constrain output. These measures do not eliminate prompt injection or model mistakes. Review output before sharing it with learners.

## Deployment boundary

The default local listener and Compose port publication use loopback. When sharing an instance, use HTTPS, an instance password, and appropriate network/identity controls. Enable `COOKIE_SECURE=true` under HTTPS. Configure `TRUST_PROXY=1` only for one trusted proxy hop with direct untrusted app access blocked. Do not expose a developer server, private data volume, or model endpoint directly to the internet.

The app blocks cross-origin browser mutations, hides raw provider errors, validates course packs, limits upload sizes, bounds generation concurrency, and uses a persisted daily generation-request cap. These controls do not replace provider spending limits or broad abuse protection for a public service. Login throttling is process-local. File-based storage and update serialization support one app process per data volume.

## Answer visibility

Normal question responses omit answer keys until submission, and saved attempts preserve their original course content. **Course exports and bundled example JSON include answers by design.** This is an educational application; it does not claim exam secrecy, anti-cheating protection, psychometric diagnosis, or certified answer accuracy.

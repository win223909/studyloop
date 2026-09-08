# Self-hosting / 自行部署

StudyLoop runs as one StudyLoop API process with a local data directory and a managed internal OpenMAIC process. The first release is suitable for personal use and small trusted groups. A public GitHub repository does not mean your running instance should be open to everyone.

本版由一个 StudyLoop API 进程管理本地数据目录及内部 OpenMAIC 课堂进程，适合个人或小范围可信用户。开源代码公开与学习记录公开是两回事；共享运行实例时需要配置访问保护。

## Local computer

Follow the [README quick start](../README.md#quick-start). The default listener is `127.0.0.1:3210`. Set `HOST` and `PORT` in `.env` only when a different listener is needed.

```bash
npm ci
npm run build
npm start
```

Use Node.js 22 (22.13 or later in the 22 release line), npm, and Corepack. The first build installs the pinned classroom dependencies and compiles Next.js; allow several minutes and several GB of working disk space. The classroom starts lazily on first access and stops with StudyLoop. No separate classroom address or provider setup is needed.

`DATA_DIR` defaults to `./data`. The server stores sessions, generated courses, course plans, immutable attempts, practice responses, and generation counters there. Provider keys are read from the environment and are not written to the course store. Keep both the data directory and `.env` private.

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Health can be inspected locally:

```bash
curl http://127.0.0.1:3210/api/health
```

The [Compose file](../compose.yaml) publishes only `127.0.0.1:3210`, runs the app as a non-root container user, and mounts the `studyloop-data` named volume at `/app/data`. The application listens on all interfaces inside the container so Docker can forward to it. Container environment values fix the internal port and data path; changing `.env` alone does not change the published port mapping.

One image contains both production servers, the pinned upstream source archive, overlay, and license notices. Only the StudyLoop port is published; the classroom child stays internal. See [classroom rebuilding](openmaic.md#rebuild-or-modify-the-classroom--重建与修改课堂) to modify or replace its bundled libraries.

The build excludes `.env`, local data, and other private files through `.dockerignore`. Secrets are supplied at runtime, not baked into the image. Review local changes before building a shareable image.

## NAS and shared access / NAS 与共享访问

On a NAS with Docker/Container Manager, put this clean repository in a project directory, create your own private `.env`, and build the Compose project. Use an x86-64 or ARM64 Node 22 compatible environment. This repository provides a deployment recipe; it does not include any author's NAS address, password, Cloudflare token, or private account policy.

For access from another computer, choose a controlled access path:

- **Same trusted LAN:** change the published host IP in `compose.yaml` to the NAS's LAN interface, and set a strong `INSTANCE_PASSWORD`. HTTP has no transport encryption; use HTTPS for ongoing shared use.
- **HTTPS reverse proxy:** keep the app on a private interface. Point a trusted proxy at the service, preserve the original `Host`, set `COOKIE_SECURE=true`, and set `TRUST_PROXY=1` only when there is exactly one trusted proxy hop and direct untrusted access to the app is blocked.
- **Outbound tunnel:** a tunnel can reach the local service without an inbound port-forward. Configure an identity access policy at the tunnel provider and keep the instance password as an additional gate. The repository does not create or configure a Cloudflare account or Access policy for you.

NAS 上可通过 Container Manager 创建 Compose 项目。局域网共享时设置实例密码；外网访问建议使用 HTTPS 和身份访问控制。反向代理必须保留原始 Host。只有明确采用一个可信代理跳转且阻止直接访问时，才设置 `TRUST_PROXY=1`；多层代理配置需要自行验证，不能照抄。

If a tunnel agent runs **on the host**, it can target the host's loopback publication. If it runs **in another container**, its own `localhost` is not StudyLoop: attach it to the intended private Docker network and target `http://studyloop:3210`. Keep tunnel credentials outside the repository.

`INSTANCE_PASSWORD` is a shared instance gate, not a student login system. Browser sessions remain separate after entering the same password. Individual accounts, invitations, parent/teacher roles, and account recovery are not included.

## Limits, persistence, and backups

- Run **one StudyLoop API process per data volume**. Its internal classroom child does not own this JSON store. The JSON store's update queue coordinates within one process; it is not a distributed database.
- Model requests have a timeout, bounded question counts, a shared daily request cap, and a concurrency limit. These are not a monetary quota; configure spending limits with the provider.
- Generation uses synchronous HTTP with sequential model calls. A proxy can time out before the server finishes; there is no durable background job/resume. Check the library before retrying and test your proxy's request limits with your chosen model.
- Files are processed in memory. Uploads are limited to **8 MB**, PDF documents to **60 pages**, and extracted/pasted text to **36,000 characters**. Text below 400 characters is rejected. Scanned PDFs require OCR before upload.
- Session cookies last 90 days. There is no cross-device login, cookie recovery, automated record retention policy, or user-facing deletion workflow in this alpha. Operators control stored data and backups.
- OpenMAIC classrooms are stored in each browser's IndexedDB, not in `DATA_DIR`. Export them from the classroom before clearing browser storage or changing devices. Server-volume backups do not contain those lessons. The `.runtime` directory contains rebuildable code/dependencies; rebuilding it does not erase browser storage.
- Stop the app before copying the data directory or taking a consistent volume backup. Back up `.env` separately in private storage. Restore into the same single-instance deployment and check a known course and attempt afterward.

For a Compose volume backup, create a private backup directory and use a temporary container from the same service definition:

```bash
mkdir -p backups
docker compose stop studyloop
docker compose run --rm --no-deps -v "$PWD/backups:/backup" studyloop tar -czf /backup/studyloop-data.tgz -C /app/data .
docker compose start studyloop
```

The command writes `backups/studyloop-data.tgz`; keep it private and copy it elsewhere before the next backup overwrites it. The backup directory must be writable by the container user. If the platform's permissions differ, use the NAS volume backup tool instead of making the app run as root.

## Update

Read the [changelog](../CHANGELOG.md), stop and back up your instance, then update the checkout. Review your `.env` against the new template without overwriting your key values.

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3210/api/health
```

For a non-Docker installation, install with `npm ci`, rebuild, and restart. Check a sample course, a saved attempt, and a small generated course before restoring regular access. Early versions may introduce schema changes; review release notes first.

## Troubleshooting

| Problem                                            | Action                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Another device cannot connect                      | The default published address is deliberately loopback; configure the chosen private LAN/proxy path |
| Login succeeds but is requested again              | Check cookies; `COOKIE_SECURE=true` requires HTTPS, and browser storage must be permitted           |
| Requests fail through a proxy                      | Preserve the original Host and verify proxy trust and same-origin handling                          |
| Existing history disappears in a different browser | Records belong to the original anonymous browser session; this alpha has no cross-device account    |
| Model error                                        | Follow [configuration troubleshooting](configuration.md#common-problems--常见问题)                  |
| Empty scanned PDF                                  | Run OCR outside StudyLoop and upload a text-based PDF or paste the extracted text                   |
| Insufficient storage                               | Stop and inspect the private data volume and backups; the alpha has no automated retention cleanup  |

For a vulnerability, use the [private reporting process](../SECURITY.md). Redact API keys, cookie values, uploaded material, and student content from operational logs and issue attachments.

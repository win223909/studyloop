# StudyLoop

[![CI](https://github.com/win223909/studyloop/actions/workflows/ci.yml/badge.svg)](https://github.com/win223909/studyloop/actions/workflows/ci.yml)

**Turn a topic into a course. Turn practice into understanding.**

[简体中文](README.zh-CN.md) · [Get started](#quick-start) · [Model configuration](docs/configuration.md) · [45 provider presets](docs/model-providers.md) · [Troubleshooting](docs/troubleshooting.md) · [OpenMAIC integration](docs/openmaic.md) · [Roadmap](docs/roadmap.md)

StudyLoop is a self-hosted learning app for students. Start with a subject, a few keywords, or your own course material; review the learning scope; practise with source-linked questions; revisit mistakes; and work through a short follow-up exercise. The course structure is subject-neutral, with a first focus on school-age learners.

**Status: `v0.1.0-alpha.1` — an early, runnable release.** Three original example courses work without a model key. Creating new courses requires your own configured model API. This repository does not contain the author's API keys, student records, or private teaching materials.

> **Thank you, OpenMAIC.** We gratefully acknowledge [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and all contributors for their work on open-source interactive AI education. StudyLoop bundles OpenMAIC's real classroom runtime with shared model configuration and focused handoff from practice results. The pinned source, StudyLoop changes, and original notices are included. [Integration and attribution](docs/openmaic.md).

![StudyLoop learning workspace](docs/assets/workspace.png)

## What you can do today

- **Explore immediately:** original courses on fractions, photosynthesis, and English past tense; no account or API key needed for examples.
- **Create a course:** search by topic, paste text, or upload a text-based PDF, TXT, or Markdown file. Review the proposed objectives before generating 4, 6, or 8 multiple-choice questions.
- **Use textbooks:** open the official Smart Education textbook catalogue, then provide a permitted chapter with its edition/page information and source link. Authenticated textbook retrieval is not automated. [Textbook guide](docs/user-guide.md#mainland-china-textbooks--国内教材).
- **Manage learning records:** preview and delete an attempt with its practice and local files; retain shared courses, and retry linked classroom cleanup when interrupted.
- **Inspect the evidence:** course sources and question source references remain available. Keyword search uses Wikipedia by default, extracts explicit concepts from exercise-style prompts, and screens candidate titles, summaries, and short introductions for relevance. The model still checks the complete original topic. If coverage is insufficient, it can suggest up to three focused search terms for one additional search and review round. A course is still refused when evidence is inadequate; optional Brave Search broadens discovery to clearly identified web excerpts.
- **Practise and revisit:** submit an answer or “I don't know,” get an immutable result, review explanations, and try a separate consolidation question without changing your original score.
- **Teach the next step:** use a short explanation and browser read-aloud, then generate a focused lesson in the bundled OpenMAIC classroom without leaving the project.
- **Keep courses portable:** export and import validated JSON course packs.
- **Choose your model:** search [45 service and region presets](docs/model-providers.md), grouped into China mainland, international, and local services, or configure a custom endpoint. Three protocols are supported; model IDs are entered manually, and secrets stay on the server.
- **Run it yourself:** one project and Docker image manage the StudyLoop server and its internal classroom process; no independent OpenMAIC setup is required.

The alpha supports multiple-choice practice, English/Chinese presentation, and text extraction. OCR, arbitrary webpage importing, a classroom roster, cross-device student accounts, and automatic OpenMAIC progress sync are on the [roadmap](docs/roadmap.md).

## Quick start

Use **Node.js 22.13+ in the Node 22 release line**, npm, and Corepack. The classroom uses pinned pnpm 10.28.0; if Corepack is not installed with your Node distribution, install it before building.

```bash
git clone https://github.com/win223909/studyloop.git
cd studyloop
npm ci
cp .env.example .env
npm run build
npm start
```

The first build installs and compiles the bundled classroom and can take several minutes and several gigabytes of working disk space. Later builds reuse a source/overlay cache. No model key is required to build.

Open **[http://localhost:3210](http://localhost:3210)** and choose an example course. The blank model configuration intentionally leaves new-course generation disabled.

To generate a course, open **Models & settings / 模型与设置** through direct localhost access on the machine running StudyLoop. Search or browse the provider groups, select the correct account region, and enter your API base URL, model ID, and key. You can test the connection before saving; the test makes a small real model request and may incur a charge. Saving writes the private settings file (`.env` by default, or the startup `SETTINGS_FILE` path) and applies to new generation requests immediately, without a restart. Existing keys are never read back: blank keeps the current key, explicit clearing removes it, and changing the service or API address requires a new key.

Ordinary remote students see read-only setup information; the shared instance password does not give remote management access. Manual `.env` configuration remains available and requires a restart. Follow the [configuration guide](docs/configuration.md) for provider examples, SSH access, and container persistence. Never commit private configuration or embed a key in frontend code.

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open the same localhost address. The provided Compose file binds the published port to loopback and keeps learning data in a named volume. **The default bridged Docker deployment does not enable GUI management**; configure it manually. `env_file` supplies startup values, not a writable persistent settings file. A custom `SETTINGS_FILE` needs a private writable directory mount, and does not bypass the local socket access check. See [configuration](docs/configuration.md#docker-persistence--docker-配置持久化) and [self-hosting](docs/self-hosting.md) for details.

## A learning session

1. Choose an example or enter a topic such as **“Grade 6 equivalent fractions.”** For a new course, select search, uploaded material, or pasted notes.
2. Check the sources, course level, and proposed objectives. Select the objectives and question count.
3. Answer every question, including “I don't know” when needed, and submit.
4. Review the saved answer sheet. Open a short explanation and try its follow-up question.
5. For a deeper lesson, choose **Generate an interactive classroom** on the result. Confirm its outline, learn in the bundled OpenMAIC classroom, then return to the original attempt for practice.

Wikipedia is an encyclopedia, so a school textbook chapter may have little coverage or use different terminology. Try the suggested narrower topics or paste/upload the relevant chapter when coverage remains insufficient. Automatic follow-up search applies only to keyword search; pasted and uploaded material is not sent to a search engine. The extra review can increase model cost and waiting time. See the [user guide](docs/user-guide.md) for the complete English/Chinese walkthrough.

## How it works

```mermaid
flowchart LR
  A[Topic or material] --> B[Sources and course plan]
  B --> C[Student confirms objectives]
  C --> D[Generate and review questions]
  D --> E[Practice and saved result]
  E --> F[Explanation and follow-up practice]
  E --> G[Focused lesson request]
  G --> H[Built-in OpenMAIC classroom]
  H -. Return to StudyLoop .-> F
```

Generated banks pass structural validation and a separate model review of answers and evidence. This reduces errors; it does not certify that every question is correct. Review source material and report questionable questions. Course exports include answer keys by design: StudyLoop is a learning tool, not a secure examination system.

Generation has bounded recovery: it can remove unambiguous wrappers, retry a formatting failure, or restart the first malformed, truncated, or structurally invalid authoring response in small batches. Scoped official MiniMax-M3 review recovery can retry a first timeout or truncation without repeating authoring, within the existing two-attempt review limit. It never guesses missing JSON or saves a partially validated bank; failed recovery batches or rejected reviews stop the request. Errors include safe stage and request identifiers where available; supported write APIs accept `Idempotency-Key` for replaying a saved result after a lost response. See [recovery, request replay, and test evidence](docs/troubleshooting.md).

The operator can submit a key through the local management form; the server stores it privately and never returns saved keys to the browser. Generated courses and attempts belong to an anonymous browser session. An optional instance password protects access to a shared deployment, while session cookies separate learning records. Clearing cookies loses access to that session; this alpha does not offer account recovery. Classic classroom documents are stored separately in browser IndexedDB; export them for backup. Read [security and privacy](SECURITY.md) before sharing an instance.

## Develop and contribute

```bash
npm run classroom:install # Build the classroom before first use
npm run dev              # Vite on 5173; API on 3210
npm test                 # Schema, provider, grading, integration, and security checks
npm run check            # Tests, UI + classroom build, and public-file scan
npx playwright install chromium
npm run test:classroom   # Built runtime, synthetic model, and isolated browser storage
npm run test:e2e          # Browser acceptance tests
```

The provider directory links official documentation; it does not claim that every service or model has been tested live. Provider tests use controlled responses and do not require paid API keys. They verify request/response handling, not every vendor's live availability or every model's teaching quality. [Architecture](docs/architecture.md) · [Course pack format](docs/course-packs.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md).

## License and acknowledgments

StudyLoop's original code is available under the [MIT License](LICENSE). Bundled original example-course material uses CC0-1.0, as declared in each pack's sources. Imported materials, search results, and separately installed projects retain their own terms.

Special thanks again to **[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)** and its contributors. The bundled classroom pins upstream commit `dfebbcf33f3a56064129903faeab70a9e4243146`; our changes live in a separate overlay. The upstream application is MIT, while its `mathml2omml` library uses LGPL-3.0-or-later. Source and rebuilding instructions accompany the distribution. See [third-party notices](THIRD_PARTY_NOTICES.md).

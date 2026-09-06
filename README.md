# StudyLoop

[![CI](https://github.com/win223909/studyloop/actions/workflows/ci.yml/badge.svg)](https://github.com/win223909/studyloop/actions/workflows/ci.yml)

**Turn a topic into a course. Turn practice into understanding.**

[简体中文](README.zh-CN.md) · [Get started](#quick-start) · [Model configuration](docs/configuration.md) · [OpenMAIC integration](docs/openmaic.md) · [Roadmap](docs/roadmap.md)

StudyLoop is a self-hosted learning app for students. Start with a subject, a few keywords, or your own course material; review the learning scope; practise with source-linked questions; revisit mistakes; and work through a short follow-up exercise. The course structure is subject-neutral, with a first focus on school-age learners.

**Status: `v0.1.0-alpha.1` — an early, runnable release.** Three original example courses work without a model key. Creating new courses requires your own configured model API. This repository does not contain the author's API keys, student records, or private teaching materials.

> **Thank you, OpenMAIC.** We gratefully acknowledge [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC), the THU-MAIC team, and all contributors for their work on open-source interactive AI education. StudyLoop exports focused teaching briefs for OpenMAIC. The current release does not bundle or claim to ship a modified OpenMAIC classroom runtime. [Integration and attribution](docs/openmaic.md).

![StudyLoop learning workspace](docs/assets/workspace.png)

## What you can do today

- **Explore immediately:** original courses on fractions, photosynthesis, and English past tense; no account or API key needed for examples.
- **Create a course:** search by topic, paste text, or upload a text-based PDF, TXT, or Markdown file. Review the proposed objectives before generating 4, 6, or 8 multiple-choice questions.
- **Inspect the evidence:** course sources and question source references remain available. Keyword search uses Wikipedia by default; an optional Brave Search adapter uses clearly identified search excerpts.
- **Practise and revisit:** submit an answer or “I don't know,” get an immutable result, review explanations, and try a separate consolidation question without changing your original score.
- **Teach the next step:** use the built-in step-by-step lesson and browser read-aloud, or export a targeted OpenMAIC lesson brief.
- **Keep courses portable:** export and import validated JSON course packs.
- **Choose your model:** OpenAI-compatible APIs, native Anthropic Messages, and native Google Gemini, configured on the server.
- **Run it yourself:** one Node.js app and a data directory, with Docker Compose for local machines, NAS devices, or servers.

The alpha supports multiple-choice practice, English/Chinese presentation, and text extraction. OCR, arbitrary webpage importing, a classroom roster, cross-device student accounts, and automatic OpenMAIC progress sync are on the [roadmap](docs/roadmap.md).

## Quick start

Use Node.js **22.13 or newer** and npm.

```bash
git clone https://github.com/win223909/studyloop.git
cd studyloop
npm ci
cp .env.example .env
npm run build
npm start
```

Open **[http://localhost:3210](http://localhost:3210)** and choose an example course. The blank model configuration intentionally leaves new-course generation disabled.

To generate a course, edit `.env` locally and supply your own provider, base URL, model ID, and API key. Restart the app after changes. Follow the [step-by-step model configuration guide](docs/configuration.md), which includes OpenAI, Anthropic, Gemini, DeepSeek, Qwen, MiniMax, OpenRouter, and local Ollama examples. No credentials belong in the frontend or in Git.

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open the same localhost address. The provided Compose file binds the published port to loopback and keeps data in a named volume. For NAS access, HTTPS, shared instances, updates, and backups, see [self-hosting](docs/self-hosting.md).

## A learning session

1. Choose an example or enter a topic such as **“Grade 6 equivalent fractions.”** For a new course, select search, uploaded material, or pasted notes.
2. Check the sources, course level, and proposed objectives. Select the objectives and question count.
3. Answer every question, including “I don't know” when needed, and submit.
4. Review the saved answer sheet. Open a short explanation and try its follow-up question.
5. For a deeper lesson, download the OpenMAIC brief and add it as material in your own OpenMAIC instance. After the lesson, return to StudyLoop for practice.

See the [user guide](docs/user-guide.md) for the complete English/Chinese walkthrough.

## How it works

```mermaid
flowchart LR
  A[Topic or material] --> B[Sources and course plan]
  B --> C[Student confirms objectives]
  C --> D[Generate and review questions]
  D --> E[Practice and saved result]
  E --> F[Explanation and follow-up practice]
  E --> G[OpenMAIC lesson brief]
  G --> H[Separately hosted OpenMAIC classroom]
  H -. Return to StudyLoop .-> F
```

Generated banks pass structural validation and a separate model review of answers and evidence. This reduces errors; it does not certify that every question is correct. Review source material and report questionable questions. Course exports include answer keys by design: StudyLoop is a learning tool, not a secure examination system.

The server keeps API keys outside the browser. Generated courses and attempts belong to an anonymous browser session. An optional instance password protects access to a shared deployment, while session cookies separate learning records. Clearing cookies loses access to that session; this alpha does not offer account recovery. Read [security and privacy](SECURITY.md) before sharing an instance.

## Develop and contribute

```bash
npm run dev              # Vite on 5173; API on 3210
npm test                 # Schema, provider, grading, integration, and security checks
npm run check            # Tests, production build, and public-file scan
npx playwright install chromium
npm run test:e2e          # Browser acceptance tests
```

Provider tests use controlled responses and do not require paid API keys. They verify request/response handling, not every vendor's live availability or every model's teaching quality. [Architecture](docs/architecture.md) · [Course pack format](docs/course-packs.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md).

## License and acknowledgments

StudyLoop's original code is available under the [MIT License](LICENSE). Bundled original example-course material uses CC0-1.0, as declared in each pack's sources. Imported materials, search results, and separately installed projects retain their own terms.

Special thanks again to **[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)** and its contributors. Our integration roadmap builds on their classroom capabilities with practice diagnosis and targeted learning handoffs. The current bridge is original StudyLoop code, with no vendored OpenMAIC runtime. See [third-party notices](THIRD_PARTY_NOTICES.md).

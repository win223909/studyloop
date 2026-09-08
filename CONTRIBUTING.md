# Contributing to StudyLoop

Contributions that improve learning quality, source transparency, accessibility, and provider compatibility are welcome. Discuss large changes in an issue before implementing them so the scope can be reviewed.

欢迎改进教学质量、题目准确性、来源透明度、无障碍和模型兼容性。较大的改动请先提交 issue 讨论范围。

## Local development

Use Node.js 22 (22.13 or later in the 22 release line), npm, and Corepack. Work in a new branch and use the repository's lockfile.

```bash
npm ci
cp .env.example .env
npm run classroom:install
npm run dev
```

The frontend is at `http://localhost:5173`, with the API on port 3210. Original examples work without any model API. For provider development, use mocked network responses in tests before optionally trying your own live key locally. Never require contributors or CI to use a paid key just to run the test suite.

## Before opening a pull request

```bash
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:classroom
```

Run browser acceptance checks for changes to learner flows, accessibility, or API interactions. Include what changed, why, and how it was verified. Call out limitations: a mocked provider response is not a verified live vendor call, and exporting a brief is not a completed OpenMAIC classroom.

Keep changes focused. Preserve the immutable submitted-attempt contract, answer visibility rules, source references, anonymous session ownership, and separation of unknown from incorrect answers. Interface changes should support both English and Chinese and work on narrow screens with keyboard navigation.

## Course contributions

- Contribute original material or material with clear reuse permission. Identify its source and license.
- Use the [course format](docs/course-packs.md). Verify every answer and follow-up question independently.
- Prefer plausible distractors that diagnose a misconception. Keep “I don't know yet” separate from answer choices.
- Never upload actual children's names, school-only files, email attachments, or completed student answer sheets.
- Describe the intended age/level and learning objectives. Avoid claiming that one exercise certifies mastery.

## Provider and OpenMAIC contributions

Document request protocol, authentication, endpoint configuration, model IDs, failure cases, and a mock-backed test. Do not embed a new vendor's key or the maintainer's local configuration. Unsupported custom authentication must be explicit.

The bundled OpenMAIC source is pinned and verified by hash. Make classroom changes in `integrations/openmaic/overlay/`, then rebuild with `npm run classroom:install`. Preserve upstream copyright/license notices, the LGPL library source and replacement path, and prominent thanks to OpenMAIC. See [the integration guide](docs/openmaic.md). Test the actual generated classroom, including student interaction and return-to-practice behaviour. The `test:classroom` suite exercises the real bundled Next.js server against a local synthetic model fixture and verifies classroom cleanup in isolated browser storage; it requires a completed classroom build and Playwright Chromium. Use temporary test data, never a learner's real history, for deletion tests.

## Reporting bugs and security issues

Use an issue template with a minimal synthetic reproduction, expected/actual behaviour, and your version. Redact sensitive data from logs and screenshots. Report vulnerabilities through [SECURITY.md](SECURITY.md), not an ordinary public bug report.

By submitting original code you agree to its inclusion under the project's MIT license. Original example-course material should explicitly declare its content license (the bundled examples use CC0-1.0). Third-party content retains its own license.

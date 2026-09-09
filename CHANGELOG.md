# Changelog

## Unreleased — 2026-09-09

- Extract explicit concepts from exercise-style search prompts and screen candidate titles, summaries, and short introductions for relevance; retain the full original topic for model coverage checks and preserve evidence requirements.
- Classify MiniMax HTTP 422 `input/output new_sensitive` (1026/1027) as a provider content-check refusal rather than a parameter error, without automatically retrying the refusal.
- Strengthen authoring and blind-review instructions to check every option, reject equivalent true distractors, and explain actual errors.
- Recover malformed or truncated model output within bounded stage retries and small authoring batches; preserve strict source, answer and explanation checks and never save partial banks.
- Adapt official MiniMax-M3 authoring and embedded scene generation to avoid exhausting the output budget on reasoning; retry a failed M3 review once without repeating authoring.
- Make interrupted submissions replay their original saved result, prevent duplicate work on repeated clicks, and show safe failure stages and request identifiers.
- Preserve classroom answers when grading fails, require valid scores before saving, and keep embedded fonts and access checks within the local StudyLoop deployment.
- Validate classroom playback actions before returning scenes and confirm browser persistence before navigating or reporting generation complete.
- Add owned learning-record deletion with a scope preview, shared-course preservation, local file cleanup, and resumable browser classroom cleanup.
- Add an official Smart Education textbook entry and optional source title/URL for chapter imports; retain provenance throughout course generation without fetching authenticated pages.
- Bundle the real OpenMAIC classic classroom from pinned upstream commit `dfebbcf33f3a56064129903faeab70a9e4243146`, with a visible source overlay, integrity-checked build, standalone runtime, source archive, and preserved license notices.
- Generate a focused classroom from a saved attempt, confirm its outline, learn through up to six slide/exercise/HTML scenes, and return to the original practice. Classroom state stays in browser IndexedDB; completion/score sync is not included.
- Share the server model configuration and request limits with classrooms. Internal routes require StudyLoop access; client keys and model endpoint overrides are ignored. Pro/PBL, server classroom storage/uploads, cloud media, and MP4 export are disabled.
- Add local visual configuration with private atomic saves, immediate application, connection testing, and a searchable directory of 45 provider/region presets.
- Refresh the bilingual interface and original StudyLoop identity; package both servers in one Docker image. No separate OpenMAIC deployment is required.

The original alpha release below used a Markdown-only bridge. The changes above replace that handoff with the bundled runtime; the downloadable brief remains available.

## 0.1.0-alpha.1 — 2026-09-06

Initial runnable release of StudyLoop, a self-hosted subject-neutral learning platform with a first focus on school-age learners.

- Three original example courses: fractions, photosynthesis, and English past tense.
- Course planning from topic search, pasted text, and text-based PDF/TXT/Markdown uploads; objective selection before question generation.
- OpenAI-compatible, native Anthropic, and native Gemini model adapters with environment-only credentials, configurable review model, and mocked provider tests.
- Structural validation, blind answer review, and separate explanation/evidence review for generated banks.
- Source-linked multiple-choice practice, a separate unknown-answer action, immutable submitted-attempt replay, short lessons, browser read-aloud, and distinct follow-up practice.
- Validated course-pack import/export and browser-session ownership for private generated courses and attempts.
- Optional instance password, generation limits, bounded uploads, same-origin mutation checks, and private server persistence.
- Original OpenMAIC Markdown lesson-brief bridge with prominent upstream acknowledgment.
- English/Chinese interface and documentation, Docker Compose deployment, tests, and contribution templates.

This alpha does not include a bundled or modified OpenMAIC runtime, automatic classroom completion sync, OCR, arbitrary URL ingestion, student accounts, or teacher rosters. Live model quality and availability vary by deployment; provider protocol tests do not claim all vendors have been exercised with paid credentials.

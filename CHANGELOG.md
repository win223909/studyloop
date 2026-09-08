# Changelog

## Unreleased — 2026-09-08

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

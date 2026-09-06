# Changelog

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

# Roadmap

StudyLoop aims to connect finding reliable material, practising, understanding mistakes, and returning to a new exercise. The data model stays subject-neutral; initial learner experience work focuses on school-age students. This roadmap describes intended work, not a promise that it has shipped or a dated delivery commitment.

## Available in v0.1.0-alpha.1

- Original fractions, photosynthesis, and English past-tense examples.
- Topic search, pasted text, and text-based PDF/TXT/Markdown inputs.
- Source-backed course outline and learner-selected objectives before generation.
- Multi-provider model protocols, answer/evidence reviews, and validated course packs.
- Multiple-choice practice, unknown-answer tracking, immutable replay, short lessons, browser read-aloud, and separate follow-up questions.
- Original OpenMAIC teaching-brief export with explicit attribution.
- Anonymous browser ownership, optional shared instance access gate, Docker deployment, and bilingual documentation.

## Next: improve the teaching handoff

- A versioned OpenMAIC integration against a pinned upstream release; explicit sharing of selected learning context and a verified completion receipt.
- A clearly documented downstream adaptation or upstream contribution for short lessons, age-appropriate prompts, mobile usability, and return-to-practice controls.
- Real-classroom acceptance checks for loading, narration, interactions, failure recovery, and completion. A static export alone will not count as completion.
- Source excerpts attached to individual questions with precise references, stronger checking for arithmetic and other deterministic subject content, and a review workflow for disputed questions.

## Later: durable learning and broader curricula

- Explicit student accounts, cross-device recovery, parent/teacher roles, and user-controlled retention/deletion.
- Spaced review based on repeated evidence, with conservative mastery estimates and transparent recommendations.
- Carefully scoped OCR and webpage ingestion with source permissions, extraction diagnostics, and network isolation.
- Additional question types and subject validators; language-specific and accessibility testing.
- Shareable licensed course collections and course revision history that preserves prior attempt snapshots.
- Database-backed deployments, monitoring, and cost reporting suitable for larger groups.

## Decisions that stay visible

The project will distinguish generated content from original examples, material snippets from full sources, adapter tests from real-provider tests, and proposed integrations from shipped classroom behaviour. OpenMAIC acknowledgments and license obligations remain part of the interface, repository, and any future adapted runtime.

中文说明：下一阶段优先完善 OpenMAIC 的真实课堂衔接、短课体验、移动端与异常恢复，并提高逐题来源和可计算内容的核验能力。学生账户、跨设备恢复、家长/教师角色、间隔复习、OCR 与更多题型随后扩展。路线图中的功能不代表当前版本已经具备。

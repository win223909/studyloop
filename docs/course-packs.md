# Course pack format, version 1

A course pack is a UTF-8 JSON object containing a course and its teaching material. It has no provider configuration, learner account, or attempt history. Exported packs include answer keys and source text; review them before sharing. Imported packs receive a new instance-generated ID and are owned by the importing browser session.

课程包是 UTF-8 JSON 文件，包含课程内容和教学资料，不包含模型配置或学生答卷。导出文件含答案与来源正文，分享前需要检查。导入后会分配新的课程 ID 并加入当前浏览器的课程库。

## Required course fields

| Field                  | Type / meaning                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | Safe alphanumeric/hyphen/underscore identifier; import assigns a new ID                                                              |
| `version`              | Literal `1`                                                                                                                          |
| `title`, `description` | Human-readable course description                                                                                                    |
| `subject`, `level`     | Subject and suitable learner level; not restricted to a fixed grade list                                                             |
| `language`             | `zh` or `en`                                                                                                                         |
| `objectives`           | 1–12 unique learning objectives                                                                                                      |
| `sources`              | 1–8 source objects with reusable local IDs                                                                                           |
| `questions`            | 1–40 valid questions; the generation UI offers 4, 6, or 8                                                                            |
| `origin`               | `sample`, `generated`, or `imported`; importing forces `imported`, so a user pack cannot impersonate a bundled or AI-reviewed course |
| `createdAt`            | ISO timestamp; import assigns its own creation time                                                                                  |

## Sources

A source has `id`, `title`, `text`, and `kind` (`original`, `web`, or `upload`). Optional fields are `url`, `license`, and `retrievedAt`. URLs must be HTTP(S) without embedded credentials. Every question must reference at least one source ID present in the same pack. A reference establishes traceability; it does not by itself prove that the source supports the answer.

The parser retains PDF page labels in extracted text where available. The first format uses source-level references; dedicated machine-readable per-question page/line ranges are a future enhancement. Source copyright and access conditions remain separate from the application license.

## Questions

Each question has:

- `id`, `prompt`, 2–6 unique `choices`, and zero-based `answerIndex`.
- `explanation`, a named `concept`, 1–8 `sourceIds`, and `difficulty` (`foundation`, `practice`, or `challenge`).
- `lesson`: `title`, 1–8 `steps`, and a `takeaway`.
- `practice`: a different `prompt`, its own `choices`, zero-based `answerIndex`, and `explanation`.

The separate “I don't know / 我不会” action must not appear as an answer choice. Main and practice prompts must differ. The minimal example below is valid course data but is intentionally short; it does not meet the richer material requirement for _generating_ a new course.

```json
{
  "id": "fraction-mini",
  "version": 1,
  "title": "Equivalent fractions",
  "description": "Recognise equal amounts written with different denominators.",
  "subject": "Mathematics",
  "level": "Upper primary",
  "language": "en",
  "objectives": ["Identify equivalent fractions"],
  "sources": [
    {
      "id": "notes",
      "title": "Original fraction notes",
      "text": "Multiplying the numerator and denominator by the same nonzero number leaves the fraction unchanged. For example, 1/2 = 2/4 and 1/3 = 2/6.",
      "kind": "original",
      "license": "CC0-1.0"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "prompt": "Which fraction is equivalent to 1/2?",
      "choices": ["1/4", "2/4", "3/4"],
      "answerIndex": 1,
      "explanation": "Multiply both 1 and 2 by 2: 1/2 = 2/4.",
      "concept": "Equivalent fractions",
      "sourceIds": ["notes"],
      "difficulty": "foundation",
      "lesson": {
        "title": "Same amount, different pieces",
        "steps": [
          "Shade one of two equal parts.",
          "Split each part in half. Two of four parts are now shaded."
        ],
        "takeaway": "Scale the top and bottom by the same factor."
      },
      "practice": {
        "prompt": "Which fraction is equivalent to 1/3?",
        "choices": ["1/6", "2/6", "3/6"],
        "answerIndex": 1,
        "explanation": "Multiplying both numerator and denominator by 2 gives 2/6."
      }
    }
  ],
  "origin": "sample",
  "createdAt": "2026-09-06T00:00:00.000Z"
}
```

Use the exported [original examples](../examples/) for fuller models of the format. The authoritative validator is [`server/core/schema.js`](../server/core/schema.js); unknown object fields are not preserved by validation. Import validates structure and references but does not call a model to reverify a pack's educational accuracy. Imported content receives the distinct `imported` origin label regardless of the input label.

## Licensing and privacy

Declaring `CC0-1.0` is appropriate only for content you can release under those terms. Do not relabel a textbook extract or web page as your own. Preserve URLs, attribution, and known license terms. Review raw source text as well as visible questions before publishing a pack; course export is an intentional full-content export.

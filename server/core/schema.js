// The course format is intentionally independent of a model vendor or school.
const DIFFICULTIES = ['foundation', 'practice', 'challenge'];
const UNKNOWN_CHOICES = /^(unknown|i (?:do not|don't) know|i'?m not sure|我不会|不知道|不确定)$/i;

function fail(field, detail = 'is invalid') {
  throw new Error(`Course validation: ${field} ${detail}.`);
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field, 'must be an object');
  return value;
}

function string(value, field, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(field, `must be nonempty text of at most ${max} characters`);
  return value.trim();
}

function list(value, field, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail(field, `must contain ${min}–${max} items`);
  return value;
}

function unique(values, field) {
  if (new Set(values.map((value) => value.toLowerCase().trim())).size !== values.length)
    fail(field, 'contains duplicates');
  return values;
}

function id(value, field) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value))
    fail(field, 'must be a safe identifier');
  return value;
}

function choices(value, field) {
  const result = unique(
    list(value, field, 2, 6).map((item, i) => string(item, `${field}[${i}]`, 1000)),
    field,
  );
  if (result.some((item) => UNKNOWN_CHOICES.test(item)))
    fail(field, 'must not include the separate “I don’t know” action');
  return result;
}

function answerIndex(value, options, field) {
  if (!Number.isInteger(value) || value < 0 || value >= options.length)
    fail(field, 'must identify an existing choice');
  return value;
}

function date(value, field) {
  const result = string(value, field, 50);
  if (!Number.isFinite(Date.parse(result))) fail(field, 'must be an ISO date');
  return result;
}

export function validateSource(input) {
  const source = object(input, 'source');
  if (!['original', 'web', 'upload'].includes(source.kind)) fail('source.kind');
  const result = {
    id: id(source.id, 'source.id'),
    title: string(source.title, 'source.title', 300),
    text: string(source.text, 'source.text', 50000),
    kind: source.kind,
  };
  if (source.url !== undefined) {
    let url;
    try {
      url = new URL(source.url);
    } catch {
      fail('source.url');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      fail('source.url', 'must be an HTTP(S) URL without credentials');
    result.url = url.href;
  }
  if (source.license !== undefined) result.license = string(source.license, 'source.license', 300);
  if (source.retrievedAt !== undefined)
    result.retrievedAt = date(source.retrievedAt, 'source.retrievedAt');
  return result;
}

function validateQuestion(input, sourceIds) {
  const q = object(input, 'question');
  const options = choices(q.choices, 'question.choices');
  const citations = unique(
    list(q.sourceIds, 'question.sourceIds', 1, 8).map((value) => id(value, 'question.sourceIds')),
    'question.sourceIds',
  );
  if (citations.some((value) => !sourceIds.has(value)))
    fail('question.sourceIds', 'references a source outside this course');
  if (!DIFFICULTIES.includes(q.difficulty)) fail('question.difficulty');
  const lesson = object(q.lesson, 'question.lesson');
  const practice = object(q.practice, 'question.practice');
  const practiceChoices = choices(practice.choices, 'practice.choices');
  const prompt = string(q.prompt, 'question.prompt', 3000);
  const practicePrompt = string(practice.prompt, 'practice.prompt', 3000);
  if (prompt.toLowerCase() === practicePrompt.toLowerCase())
    fail('practice.prompt', 'must be a distinct transfer question');
  return {
    id: id(q.id, 'question.id'),
    prompt,
    choices: options,
    answerIndex: answerIndex(q.answerIndex, options, 'question.answerIndex'),
    explanation: string(q.explanation, 'question.explanation', 5000),
    concept: string(q.concept, 'question.concept', 250),
    sourceIds: citations,
    difficulty: q.difficulty,
    lesson: {
      title: string(lesson.title, 'lesson.title', 300),
      steps: list(lesson.steps, 'lesson.steps', 1, 8).map((item) =>
        string(item, 'lesson.steps', 2000),
      ),
      takeaway: string(lesson.takeaway, 'lesson.takeaway', 1000),
    },
    practice: {
      prompt: practicePrompt,
      choices: practiceChoices,
      answerIndex: answerIndex(practice.answerIndex, practiceChoices, 'practice.answerIndex'),
      explanation: string(practice.explanation, 'practice.explanation', 3000),
    },
  };
}

export function validateCourse(input) {
  const course = object(input, 'course');
  if (course.version !== 1) fail('version', 'must be 1');
  if (!['zh', 'en'].includes(course.language)) fail('language', 'must be zh or en');
  if (!['sample', 'generated', 'imported'].includes(course.origin)) fail('origin');
  const sources = list(course.sources, 'sources', 1, 8).map(validateSource);
  unique(
    sources.map((source) => source.id),
    'sources.id',
  );
  if (sources.reduce((sum, source) => sum + source.text.length, 0) > 120000)
    fail('sources', 'exceeds the combined text limit');
  const sourceIds = new Set(sources.map((source) => source.id));
  const questions = list(course.questions, 'questions', 1, 40).map((question) =>
    validateQuestion(question, sourceIds),
  );
  unique(
    questions.map((question) => question.id),
    'questions.id',
  );
  unique(
    questions.map((question) => question.prompt),
    'questions.prompt',
  );
  unique(
    questions.flatMap((question) => [question.prompt, question.practice.prompt]),
    'question and practice prompts',
  );
  return {
    id: id(course.id, 'id'),
    version: 1,
    title: string(course.title, 'title', 200),
    description: string(course.description, 'description', 2000),
    subject: string(course.subject, 'subject', 100),
    level: string(course.level, 'level', 100),
    language: course.language,
    objectives: unique(
      list(course.objectives, 'objectives', 1, 12).map((item) => string(item, 'objectives', 250)),
      'objectives',
    ),
    sources,
    questions,
    origin: course.origin,
    createdAt: date(course.createdAt, 'createdAt'),
  };
}

export function publicCourse(course) {
  const { questions, ...metadata } = course;
  return structuredClone({
    ...metadata,
    questions: questions.map(
      ({ answerIndex, explanation, lesson, practice, ...question }) => question,
    ),
  });
}

function selectedAnswer(value, options, field) {
  if (value === 'unknown') return value;
  if (!Number.isInteger(value) || value < 0 || value >= options.length)
    throw new Error(`${field}: choose one of the available answers or “I don’t know”.`);
  return value;
}

export function gradeAttempt(course, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Answers must be an object.');
  const questionIds = new Set(course.questions.map((q) => q.id));
  if (
    Object.keys(input).length !== questionIds.size ||
    Object.keys(input).some((key) => !questionIds.has(key))
  )
    throw new Error(
      'Answer every question before submitting; unknown question IDs are not accepted.',
    );
  const results = course.questions.map((q) => {
    if (!Object.hasOwn(input, q.id)) throw new Error('Answer every question before submitting.');
    const selected = selectedAnswer(input[q.id], q.choices, q.id);
    return structuredClone({
      questionId: q.id,
      prompt: q.prompt,
      choices: q.choices,
      concept: q.concept,
      sourceIds: q.sourceIds,
      status:
        selected === 'unknown' ? 'unknown' : selected === q.answerIndex ? 'correct' : 'incorrect',
      selected,
      correctIndex: q.answerIndex,
      explanation: q.explanation,
      lesson: q.lesson,
      practice: { prompt: q.practice.prompt, choices: q.practice.choices },
    });
  });
  const correct = results.filter((result) => result.status === 'correct').length;
  const unknown = results.filter((result) => result.status === 'unknown').length;
  return {
    score: Math.round((correct / results.length) * 100),
    total: results.length,
    correct,
    unknown,
    results,
  };
}

export function gradePractice(question, input) {
  const value = selectedAnswer(input, question.practice.choices, 'Practice answer');
  return {
    correct: value === question.practice.answerIndex,
    answerIndex: question.practice.answerIndex,
    explanation: question.practice.explanation,
  };
}

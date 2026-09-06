import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSamples } from '../server/core/samples.js';
import {
  validateCourse,
  publicCourse,
  gradeAttempt,
  gradePractice,
} from '../server/core/schema.js';

const samples = loadSamples();

test('three original course packs have six distinct practice pairs with citations', () => {
  assert.equal(samples.length, 3);
  assert.deepEqual(samples.map((c) => c.id).sort(), ['fractions', 'past-tense', 'photosynthesis']);
  for (const course of samples) {
    assert.equal(course.questions.length, 6);
    assert.ok(
      course.sources.every((source) => source.kind === 'original' && source.license === 'CC0-1.0'),
    );
    assert.equal(validateCourse(course).title, course.title);
    const allCorrect = Object.fromEntries(course.questions.map((q) => [q.id, q.answerIndex]));
    assert.equal(gradeAttempt(course, allCorrect).score, 100);
  }
});

test('fraction answer keys match independent arithmetic and transfer calculations', () => {
  const { questions } = samples.find((course) => course.id === 'fractions');
  const evaluate = (choice) => {
    const match = choice.match(/^(\d+)(?:\/(\d+))?/);
    return Number(match[1]) / Number(match[2] || 1);
  };
  const expected = [2 / 3, null, 1 / 4 + 1 / 2, 5 / 6 - 1 / 3, (18 * 2) / 3, 3 / 4 / 3];
  const transfer = [3 / 5, null, 1 / 3 + 1 / 6, 7 / 8 - 1 / 4, (24 * 3) / 4, 2 / 3 / 2];
  questions.forEach((question, index) => {
    if (expected[index] === null) {
      assert.equal(question.choices[question.answerIndex], '3/4 > 2/3');
      assert.equal(question.practice.choices[question.practice.answerIndex], '2/5 < 1/2');
      return;
    }
    assert.ok(Math.abs(evaluate(question.choices[question.answerIndex]) - expected[index]) < 1e-10);
    assert.ok(
      Math.abs(
        evaluate(question.practice.choices[question.practice.answerIndex]) - transfer[index],
      ) < 1e-10,
    );
  });
});

test('answer payload is absent from public courses and practice previews', () => {
  const course = samples[0];
  const visible = publicCourse(course);
  for (const question of visible.questions) {
    for (const field of ['answerIndex', 'explanation', 'lesson', 'practice'])
      assert.equal(Object.hasOwn(question, field), false);
  }
  visible.sources[0].text = 'changed';
  assert.notEqual(visible.sources[0].text, course.sources[0].text);
  const answers = Object.fromEntries(course.questions.map((q) => [q.id, 'unknown']));
  const attempt = gradeAttempt(course, answers);
  for (const result of attempt.results) {
    assert.equal(Object.hasOwn(result.practice, 'answerIndex'), false);
    assert.equal(Object.hasOwn(result.practice, 'explanation'), false);
    assert.ok(result.prompt && result.concept && result.sourceIds.length);
  }
});

test('grading distinguishes incorrect and unknown, and takes immutable snapshots', () => {
  const course = structuredClone(samples[0]);
  const answers = Object.fromEntries(
    course.questions.map((q, i) => [
      q.id,
      i === 0 ? 'unknown' : i === 1 ? (q.answerIndex + 1) % q.choices.length : q.answerIndex,
    ]),
  );
  const result = gradeAttempt(course, answers);
  assert.deepEqual(
    { score: result.score, total: result.total, correct: result.correct, unknown: result.unknown },
    { score: 67, total: 6, correct: 4, unknown: 1 },
  );
  assert.equal(result.results[0].status, 'unknown');
  assert.equal(result.results[1].status, 'incorrect');
  const previous = result.results[0].lesson.steps[0];
  course.questions[0].lesson.steps[0] = 'changed';
  assert.equal(result.results[0].lesson.steps[0], previous);
  const practice = gradePractice(course.questions[0], course.questions[0].practice.answerIndex);
  assert.equal(practice.correct, true);
  assert.equal(result.score, 67);
  assert.equal(gradePractice(course.questions[0], 'unknown').correct, false);
});

test('grading refuses missing, extra, string or out-of-range answers', () => {
  const course = samples[0];
  const answers = Object.fromEntries(course.questions.map((q) => [q.id, q.answerIndex]));
  assert.throws(() => gradeAttempt(course, {}), /every question/);
  assert.throws(() => gradeAttempt(course, { ...answers, unexpected: 0 }), /unknown question IDs/);
  for (const invalid of ['1', -1, 99, null, true])
    assert.throws(
      () => gradeAttempt(course, { ...answers, [course.questions[0].id]: invalid }),
      /choose one/,
    );
});

test('imports reject forged references, repeated questions, invalid answers and unsafe URLs', () => {
  assert.equal(validateCourse({ ...samples[0], origin: 'imported' }).origin, 'imported');
  const mutations = [
    (course) => {
      course.questions[0].sourceIds = ['invented'];
    },
    (course) => {
      course.questions[0].answerIndex = 9;
    },
    (course) => {
      course.questions[0].practice.answerIndex = -1;
    },
    (course) => {
      course.questions[1].id = course.questions[0].id;
    },
    (course) => {
      course.questions[1].prompt = course.questions[0].prompt;
    },
    (course) => {
      course.questions[0].choices[0] = "I don't know";
    },
    (course) => {
      course.questions[0].choices[1] = course.questions[0].choices[0];
    },
    (course) => {
      course.questions[0].practice.prompt = course.questions[0].prompt;
    },
    (course) => {
      course.sources[0].url = 'javascript:alert(1)';
    },
    (course) => {
      course.sources[0].url = 'https://user:secret@example.com/';
    },
  ];
  for (const mutate of mutations) {
    const course = structuredClone(samples[0]);
    mutate(course);
    assert.throws(() => validateCourse(course), /Course validation/);
  }
});

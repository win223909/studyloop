import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, generateCourse } from '../server/core/providers.js';
import { loadSamples } from '../server/core/samples.js';
import {
  createGenerationDiagnostics,
  publicGenerationDetails,
} from '../server/generation-diagnostics.js';

const env = { LLM_API_KEY: 'test-placeholder', LLM_MODEL: 'test-model' };
const sample = loadSamples().find((course) => course.id === 'fractions');
const topic = 'Compare fractions';
const plan = { ...sample, objectives: [topic] };
const outline = {
  sufficient: true,
  title: topic,
  description: 'Practice fractions.',
  subject: 'Math',
  objectives: [topic],
};
const input = {
  mode: 'text',
  topic,
  language: 'en',
  level: 'Beginner',
  text: sample.sources[0].text,
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const envelope = (content, finish = 'stop') =>
  json({ choices: [{ message: { content }, finish_reason: finish }] });
function provider(outputs) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      assert.ok(outputs.length, 'No unbounded model retries');
      const value = outputs.shift();
      if (value instanceof Error) throw value;
      return value instanceof Response ? value : envelope(JSON.stringify(value));
    },
  };
}
function fixture(count) {
  const questions = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(sample.questions[index % sample.questions.length]),
    id: `q${index + 1}`,
    concept: topic,
    prompt: `${sample.questions[index % sample.questions.length].prompt} (${index + 1})`,
    practice: {
      ...structuredClone(sample.questions[index % sample.questions.length].practice),
      prompt: `${sample.questions[index % sample.questions.length].practice.prompt} (${index + 1})`,
    },
  }));
  const review = {
    reviews: questions.map((q) => ({
      id: q.id,
      answerIndex: q.answerIndex,
      practiceAnswerIndex: q.practice.answerIndex,
      supported: true,
      unambiguous: true,
      sourceIds: q.sourceIds,
      reason: 'Verified by the supplied arithmetic rules.',
    })),
  };
  return { questions, review, teaching: { valid: true, checkedIds: questions.map((q) => q.id) } };
}

function withObjectiveId(question, objectiveId) {
  const { concept: _concept, lesson, practice, ...rest } = question;
  return {
    ...rest,
    objectiveId,
    lessonTitle: lesson.title,
    lessonSteps: lesson.steps,
    lessonTakeaway: lesson.takeaway,
    practicePrompt: practice.prompt,
    practiceChoices: practice.choices,
    practiceAnswerIndex: practice.answerIndex,
    practiceExplanation: practice.explanation,
  };
}

test('stable authoring objective IDs map exactly to selected public concepts and preserve review inputs', async () => {
  const other = 'Calculate an equivalent fraction using the supplied rules.';
  const selected = [other, topic];
  const scopedPlan = { ...plan, objectives: ['Unselected objective', topic, other] };
  const { questions, review, teaching } = fixture(4);
  questions.forEach((question, index) => {
    question.concept = selected[index % selected.length];
  });
  const flat = questions.map((question, index) =>
    withObjectiveId(question, index % 2 ? 'objective-2' : 'objective-3'),
  );
  // A legacy concept may coexist only when it exactly agrees with the ID.
  flat[2].concept = other;
  const mock = provider([{ sufficient: true, questions: flat }, review, teaching]);
  const course = await generateCourse(
    scopedPlan,
    { objectives: selected, questionCount: 4 },
    { env, fetch: mock.fetch },
  );
  assert.deepEqual(course.questions, questions);
  assert.deepEqual(course.objectives, selected);
  assert.ok(course.questions.every((question) => !Object.hasOwn(question, 'objectiveId')));
  const authorInput = JSON.parse(
    mock.calls[0].body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
  );
  assert.deepEqual(authorInput.objectives, [
    { id: 'objective-3', text: other },
    { id: 'objective-2', text: topic },
  ]);
  assert.match(mock.calls[0].body.messages[1].content, /"objectiveId":"objective-3"/);
  const blindInput = JSON.parse(
    mock.calls[1].body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
  );
  assert.deepEqual(blindInput.objectives, selected);
  assert.equal(mock.calls.length, 3, 'Authoring and both independent reviews still run');
});

test('objective IDs stay stable across recovery batches with different objective subsets', async () => {
  const selected = ['Selected third goal', topic, 'Selected second goal'];
  const scopedPlan = {
    ...plan,
    objectives: ['Unselected goal', topic, selected[2], selected[0]],
  };
  const { questions, review, teaching } = fixture(6);
  const ids = ['objective-4', 'objective-2', 'objective-3'];
  questions.forEach((question, index) => {
    question.concept = selected[index % selected.length];
  });
  const flat = questions.map((question, index) =>
    withObjectiveId(question, ids[index % ids.length]),
  );
  const mock = provider([
    envelope('not JSON'),
    { sufficient: true, questions: flat.slice(0, 2) },
    { sufficient: true, questions: flat.slice(2, 4) },
    { sufficient: true, questions: flat.slice(4, 6) },
    review,
    teaching,
  ]);
  const course = await generateCourse(
    scopedPlan,
    { objectives: selected, questionCount: 6 },
    { env, fetch: mock.fetch },
  );
  assert.deepEqual(course.questions, questions);
  const batchIds = mock.calls.slice(1, 4).map((call) => {
    const body = JSON.parse(call.body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1]);
    return body.objectives.map((objective) => objective.id);
  });
  assert.deepEqual(batchIds, [
    ['objective-4', 'objective-2'],
    ['objective-3', 'objective-4'],
    ['objective-2', 'objective-3'],
  ]);
});

test('unknown, unselected, mistyped, or conflicting objective IDs never guess a concept', async () => {
  const scopedPlan = { ...plan, objectives: [topic, 'Unselected objective'] };
  const { questions } = fixture(4);
  for (const mutation of [
    { objectiveId: 'objective-999' },
    { objectiveId: 'objective-2' },
    { objectiveId: 1 },
    { objectiveId: '' },
    { objectiveId: 'objective-1', concept: 'A paraphrase of the selected objective' },
    { objectiveId: 'objective-1', concept: `${topic} ` },
  ]) {
    const bad = questions.map((question) => withObjectiveId(question, 'objective-1'));
    Object.assign(bad[0], mutation);
    const mock = provider([
      { sufficient: true, questions: bad },
      { sufficient: true, questions: bad.slice(0, 2) },
    ]);
    await assert.rejects(
      generateCourse(
        scopedPlan,
        { objectives: [topic], questionCount: 4 },
        { env, fetch: mock.fetch },
      ),
      (error) => error.code === 'bank_invalid',
    );
    assert.equal(mock.calls.length, 2, 'An invalid recovery batch must stop before reviews');
  }
});

test('valid objective IDs cannot hide an uncovered objective or reference another recovery batch', async () => {
  const selected = [topic, 'Second selected goal', 'Third selected goal'];
  const scopedPlan = { ...plan, objectives: selected };
  const { questions } = fixture(6);
  for (const batchIds of [
    ['objective-1', 'objective-1'],
    ['objective-1', 'objective-3'],
  ]) {
    const bad = questions.map((question) => withObjectiveId(question, 'objective-1'));
    const batch = questions
      .slice(0, 2)
      .map((question, index) => withObjectiveId(question, batchIds[index]));
    const mock = provider([
      { sufficient: true, questions: bad },
      { sufficient: true, questions: batch },
    ]);
    await assert.rejects(
      generateCourse(
        scopedPlan,
        { objectives: selected, questionCount: 6 },
        { env, fetch: mock.fetch },
      ),
      (error) => error.code === 'bank_invalid',
    );
    assert.equal(mock.calls.length, 2);
  }
});

for (const count of [4, 6, 8])
  test(`${count} questions recover malformed authoring in bounded small batches before both reviews`, async () => {
    const { questions, review, teaching } = fixture(count);
    const outputs = [envelope('{"sufficient":true,"questions":[{"id":"q1"}},{"id":"q2"}]}')];
    for (let i = 0; i < count; i += 2)
      outputs.push({ sufficient: true, questions: questions.slice(i, i + 2) });
    outputs.push(review, teaching);
    const mock = provider(outputs);
    const events = [];
    const course = await generateCourse(
      plan,
      { objectives: plan.objectives, questionCount: count },
      { env, fetch: mock.fetch, onDiagnostic: (event) => events.push(event) },
    );
    assert.equal(course.questions.length, count);
    assert.equal(mock.calls.length, 1 + count / 2 + 2);
    assert.equal(events.filter((event) => event.event === 'recovering').length, 1);
    for (let i = 0; i < count / 2; i++) {
      const request = JSON.parse(
        mock.calls[i + 1].body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
      );
      assert.equal(request.previousQuestions.length, i * 2);
    }
    const blind = JSON.parse(
      mock.calls.at(-2).body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
    );
    assert.equal(blind.questions.length, count);
    assert.ok(
      blind.questions.every(
        (q) =>
          !Object.hasOwn(q, 'answerIndex') &&
          !Object.hasOwn(q, 'explanation') &&
          !Object.hasOwn(q.practice, 'answerIndex'),
      ),
    );
  });

test('truncated authoring never accepts a valid-looking partial course', async () => {
  const { questions, review, teaching } = fixture(4);
  const mock = provider([
    envelope(JSON.stringify({ sufficient: true, questions }), 'length'),
    { sufficient: true, questions: questions.slice(0, 2) },
    { sufficient: true, questions: questions.slice(2) },
    review,
    teaching,
  ]);
  const course = await generateCourse(
    plan,
    { objectives: [topic], questionCount: 4 },
    { env, fetch: mock.fetch },
  );
  assert.equal(course.questions.length, 4);
  assert.equal(mock.calls.length, 5);
});

test('a complete eight-question JSON draft with repeated options is discarded before bounded recovery', async () => {
  const { questions, review, teaching } = fixture(8);
  const invalid = structuredClone(questions);
  invalid.forEach((question) => {
    question.prompt += ' Rejected initial draft.';
    question.practice.prompt += ' Rejected initial draft.';
  });
  invalid[4].choices[2] = invalid[4].choices[1];
  const outputs = [{ sufficient: true, questions: invalid }];
  for (let offset = 0; offset < 8; offset += 2)
    outputs.push({ sufficient: true, questions: questions.slice(offset, offset + 2) });
  outputs.push(review, teaching);
  const mock = provider(outputs);
  const events = [];
  const course = await generateCourse(
    plan,
    { objectives: [topic], questionCount: 8 },
    { env, fetch: mock.fetch, onDiagnostic: (event) => events.push(event) },
  );
  assert.deepEqual(course.questions, questions);
  assert.equal(mock.calls.length, 7, 'One discarded draft, four batches, and both reviews');
  assert.deepEqual(
    events.filter((event) => event.event === 'recovering').map((event) => event.code),
    ['bank_invalid'],
  );
  for (const call of mock.calls.slice(1))
    assert.ok(!call.body.messages[1].content.includes('Rejected initial draft.'));
});

test('an invalid recovery batch stops immediately without repairing choices or starting another recovery', async () => {
  const { questions } = fixture(4);
  const invalidDraft = structuredClone(questions);
  invalidDraft[0].choices[1] = invalidDraft[0].choices[0];
  const invalidBatch = structuredClone(questions.slice(0, 2));
  invalidBatch[1].practice.choices[2] = invalidBatch[1].practice.choices[0];
  const mock = provider([
    { sufficient: true, questions: invalidDraft },
    { sufficient: true, questions: invalidBatch },
  ]);
  const events = [];
  await assert.rejects(
    generateCourse(
      plan,
      { objectives: [topic], questionCount: 4 },
      { env, fetch: mock.fetch, onDiagnostic: (event) => events.push(event) },
    ),
    (error) => error.code === 'bank_invalid' && error.phase === 'questions',
  );
  assert.equal(mock.calls.length, 2);
  assert.equal(events.filter((event) => event.event === 'recovering').length, 1);
});

test('individually valid recovery batches still fail merged-bank duplicate validation before review', async () => {
  const { questions } = fixture(4);
  const invalidDraft = structuredClone(questions);
  invalidDraft[0].choices[1] = invalidDraft[0].choices[0];
  const firstBatch = questions.slice(0, 2);
  const duplicateBatch = firstBatch.map((question, index) => ({
    ...question,
    id: `q${index + 3}`,
  }));
  const mock = provider([
    { sufficient: true, questions: invalidDraft },
    { sufficient: true, questions: firstBatch },
    { sufficient: true, questions: duplicateBatch },
  ]);
  await assert.rejects(
    generateCourse(plan, { objectives: [topic], questionCount: 4 }, { env, fetch: mock.fetch }),
    (error) => error.code === 'bank_invalid',
  );
  assert.equal(
    mock.calls.length,
    3,
    'Failed merged validation must not run reviews or another author',
  );
});

test('insufficient evidence does not enter authoring recovery', async () => {
  const mock = provider([{ sufficient: false, questions: [] }]);
  const events = [];
  await assert.rejects(
    generateCourse(
      plan,
      { objectives: [topic], questionCount: 4 },
      { env, fetch: mock.fetch, onDiagnostic: (event) => events.push(event) },
    ),
    (error) => error.code === 'sources_insufficient',
  );
  assert.equal(mock.calls.length, 1);
  assert.equal(events.filter((event) => event.event === 'recovering').length, 0);
});

test('flat authoring fields map losslessly to the stable course format before independent reviews', async () => {
  const { questions, review, teaching } = fixture(4);
  const flat = questions.map(({ lesson, practice, ...question }) => ({
    ...question,
    lessonTitle: lesson.title,
    lessonSteps: lesson.steps,
    lessonTakeaway: lesson.takeaway,
    practicePrompt: practice.prompt,
    practiceChoices: practice.choices,
    practiceAnswerIndex: practice.answerIndex,
    practiceExplanation: practice.explanation,
  }));
  const mock = provider([{ sufficient: true, questions: flat }, review, teaching]);
  const course = await generateCourse(
    plan,
    { objectives: [topic], questionCount: 4 },
    { env, fetch: mock.fetch },
  );
  assert.deepEqual(course.questions, questions);
  assert.match(mock.calls[0].body.messages[1].content, /lessonTitle/);
});

test('incomplete or conflicting flat authoring fields never fill missing teaching content', async () => {
  const { questions } = fixture(4);
  for (const mutation of [
    { lessonTitle: 'Only one field' },
    {
      lessonTitle: 'Conflicts',
      lessonSteps: [],
      lessonTakeaway: 'Rule',
      practicePrompt: 'Other',
      practiceChoices: [],
      practiceAnswerIndex: 0,
      practiceExplanation: 'Explanation',
    },
  ]) {
    const mock = provider([
      { sufficient: true, questions: [{ ...questions[0], ...mutation }, ...questions.slice(1)] },
      { sufficient: true, questions: [{ ...questions[0], ...mutation }, questions[1]] },
    ]);
    await assert.rejects(
      () =>
        generateCourse(plan, { objectives: [topic], questionCount: 4 }, { env, fetch: mock.fetch }),
      (e) => e.code === 'bank_invalid',
    );
    assert.equal(mock.calls.length, 2);
  }
});

test('a malformed recovery batch fails without accepting partial questions or looping', async () => {
  const mock = provider([envelope('not JSON'), envelope('{"broken":')]);
  await assert.rejects(
    () =>
      generateCourse(plan, { objectives: [topic], questionCount: 4 }, { env, fetch: mock.fetch }),
    (e) => e.code === 'model_format' && e.phase === 'questions',
  );
  assert.equal(mock.calls.length, 2);
});

test('review formatting retries only that review with blind inputs, never the author', async () => {
  const { questions, review, teaching } = fixture(4);
  const mock = provider([
    { sufficient: true, questions },
    envelope('{"reviews":['),
    review,
    teaching,
  ]);
  await generateCourse(plan, { objectives: [topic], questionCount: 4 }, { env, fetch: mock.fetch });
  assert.equal(mock.calls.length, 4);
  for (const index of [1, 2]) {
    const data = JSON.parse(
      mock.calls[index].body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1],
    );
    assert.ok(
      data.questions.every(
        (q) => !Object.hasOwn(q, 'answerIndex') && !Object.hasOwn(q, 'explanation'),
      ),
    );
  }
});

test('an actual wrong answer or weak evidence is never retried into acceptance', async () => {
  const { questions, review } = fixture(4);
  review.reviews[0].supported = false;
  const mock = provider([{ sufficient: true, questions }, review]);
  await assert.rejects(
    () =>
      generateCourse(plan, { objectives: [topic], questionCount: 4 }, { env, fetch: mock.fetch }),
    (e) => e.code === 'review_rejected',
  );
  assert.equal(mock.calls.length, 2);
});

const miniMaxEnv = {
  ...env,
  LLM_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://api.minimax.cn/v1',
  LLM_MODEL: 'MiniMax-M3',
};
const reviewFailure = (code) =>
  code === 'provider_timeout'
    ? new DOMException('private timeout details', 'TimeoutError')
    : code === 'model_truncated'
      ? envelope('', 'length')
      : envelope('{"private-material":');
const requestData = (call) =>
  JSON.parse(call.body.messages[1].content.split('UNTRUSTED_INPUT_JSON:\n')[1]);

for (const phase of ['answer_review', 'teaching_review'])
  for (const failureCode of ['provider_timeout', 'model_truncated', 'model_format'])
    test(`official M3 ${phase} recovers ${failureCode} once without authoring again`, async () => {
      const { questions, review, teaching } = fixture(6);
      const outputs = [{ sufficient: true, questions }];
      if (phase === 'teaching_review') outputs.push(review);
      outputs.push(reviewFailure(failureCode), phase === 'answer_review' ? review : teaching);
      if (phase === 'answer_review') outputs.push(teaching);
      const mock = provider(outputs);
      const events = [];
      const course = await generateCourse(
        plan,
        { objectives: [topic], questionCount: 6 },
        {
          env: {
            ...miniMaxEnv,
            LLM_MODEL: phase === 'teaching_review' ? 'author-fixture-model' : 'MiniMax-M3',
            LLM_REVIEW_MODEL: 'MiniMax-M3',
            LLM_BASE_URL:
              phase === 'teaching_review' ? 'https://api.minimax.io/v1' : miniMaxEnv.LLM_BASE_URL,
          },
          fetch: mock.fetch,
          onDiagnostic: (event) => events.push(event),
        },
      );
      assert.deepEqual(course.questions, questions);
      assert.equal(mock.calls.length, 4, 'One author and two reviews, with one review-only retry');
      const first = phase === 'answer_review' ? 1 : 2;
      assert.equal(
        mock.calls[first].body.thinking,
        undefined,
        'First review keeps default reasoning',
      );
      assert.deepEqual(mock.calls[first + 1].body.thinking, { type: 'disabled' });
      assert.deepEqual(requestData(mock.calls[first]), requestData(mock.calls[first + 1]));
      if (phase === 'answer_review') {
        assert.ok(
          requestData(mock.calls[first + 1]).questions.every(
            (q) => !Object.hasOwn(q, 'answerIndex') && !Object.hasOwn(q, 'explanation'),
          ),
        );
        assert.equal(
          mock.calls[3].body.thinking,
          undefined,
          'The next review has its own first attempt',
        );
      }
      const retryPrompt = mock.calls[first + 1].body.messages[1].content;
      if (failureCode !== 'model_format')
        assert.doesNotMatch(retryPrompt, /previous response was not valid JSON/);
      assert.match(
        retryPrompt,
        failureCode === 'provider_timeout'
          ? /timed out/
          : failureCode === 'model_truncated'
            ? /cut short/
            : /not valid JSON/,
      );
      assert.deepEqual(
        events
          .filter(
            (event) =>
              event.phase === phase && ['started', 'retrying', 'succeeded'].includes(event.event),
          )
          .map(({ event, attempt, code }) => ({ event, attempt, code })),
        [
          { event: 'started', attempt: 1, code: undefined },
          { event: 'retrying', attempt: 1, code: failureCode },
          { event: 'started', attempt: 2, code: undefined },
          { event: 'succeeded', attempt: 2, code: undefined },
        ],
      );
      assert.doesNotMatch(JSON.stringify(events), /private-material|private timeout/);
    });

test('each M3 review has at most two attempts and a second operational failure stops immediately', async () => {
  const { questions, review, teaching } = fixture(4);
  const mock = provider([
    { sufficient: true, questions },
    reviewFailure('provider_timeout'),
    review,
    reviewFailure('model_truncated'),
    teaching,
  ]);
  await generateCourse(
    plan,
    { objectives: [topic], questionCount: 4 },
    { env: miniMaxEnv, fetch: mock.fetch },
  );
  assert.equal(mock.calls.length, 5, 'Both review budgets stay at two calls each');
  assert.deepEqual(
    mock.calls.slice(1).map((call) => call.body.thinking?.type),
    [undefined, 'disabled', undefined, 'disabled'],
  );

  for (const code of ['provider_timeout', 'model_truncated', 'model_format']) {
    const failed = provider([
      { sufficient: true, questions },
      reviewFailure(code),
      reviewFailure(code),
    ]);
    const events = [];
    await assert.rejects(
      generateCourse(
        plan,
        { objectives: [topic], questionCount: 4 },
        {
          env: miniMaxEnv,
          fetch: failed.fetch,
          onDiagnostic: (event) => events.push(event),
        },
      ),
      (error) => error.code === code && error.phase === 'answer_review' && error.attempts === 2,
    );
    assert.equal(failed.calls.length, 3);
    assert.equal(events.at(-1).event, 'failed');
    assert.equal(events.at(-1).attempt, 2);
  }
});

test('M3 review timeout recovery excludes other hosts, protocols, review models and non-review phases', async () => {
  const { questions } = fixture(4);
  for (const changes of [
    { LLM_BASE_URL: 'https://compatible.example/v1' },
    { LLM_BASE_URL: 'https://api.minimax.cn.example/v1' },
    { LLM_BASE_URL: 'http://api.minimax.cn/v1' },
    { LLM_BASE_URL: 'https://api.minimax.cn:8443/v1' },
    { LLM_MODEL: 'MiniMax-M2.7' },
    { LLM_REVIEW_MODEL: 'MiniMax-M2.7' },
    { LLM_PROVIDER: 'anthropic' },
    { LLM_PROVIDER: 'gemini' },
  ]) {
    const configured = { ...miniMaxEnv, ...changes };
    const author = { sufficient: true, questions };
    const authorResponse =
      configured.LLM_PROVIDER === 'anthropic'
        ? json({
            content: [{ type: 'text', text: JSON.stringify(author) }],
            stop_reason: 'end_turn',
          })
        : configured.LLM_PROVIDER === 'gemini'
          ? json({
              candidates: [
                { content: { parts: [{ text: JSON.stringify(author) }] }, finishReason: 'STOP' },
              ],
            })
          : author;
    const mock = provider([authorResponse, reviewFailure('provider_timeout')]);
    await assert.rejects(
      generateCourse(
        plan,
        { objectives: [topic], questionCount: 4 },
        { env: configured, fetch: mock.fetch },
      ),
      (error) => error.code === 'provider_timeout' && error.attempts === 1,
    );
    assert.equal(mock.calls.length, 2);
  }
  const outlineMock = provider([reviewFailure('provider_timeout')]);
  await assert.rejects(
    createPlan(input, { env: miniMaxEnv, fetch: outlineMock.fetch }),
    (error) => error.code === 'provider_timeout' && error.attempts === 1,
  );
  assert.equal(outlineMock.calls.length, 1);
  const authorMock = provider([reviewFailure('provider_timeout')]);
  await assert.rejects(
    generateCourse(
      plan,
      { objectives: [topic], questionCount: 4 },
      { env: miniMaxEnv, fetch: authorMock.fetch },
    ),
    (error) => error.code === 'provider_timeout' && error.attempts === 1,
  );
  assert.equal(authorMock.calls.length, 1);
});

test('M3 semantic answer and teaching rejections are never retried into acceptance', async () => {
  for (const phase of ['answer_review', 'teaching_review']) {
    for (const recovered of [false, true]) {
      const { questions, review, teaching } = fixture(4);
      if (phase === 'answer_review')
        review.reviews[0].answerIndex =
          (review.reviews[0].answerIndex + 1) % questions[0].choices.length;
      else teaching.valid = false;
      const outputs = [{ sufficient: true, questions }];
      if (phase === 'teaching_review') outputs.push(review);
      if (recovered) outputs.push(reviewFailure('provider_timeout'));
      outputs.push(phase === 'answer_review' ? review : teaching);
      const expectedCalls = outputs.length;
      const mock = provider(outputs);
      await assert.rejects(
        generateCourse(
          plan,
          { objectives: [topic], questionCount: 4 },
          { env: miniMaxEnv, fetch: mock.fetch },
        ),
        (error) =>
          error.code ===
          (phase === 'answer_review' ? 'review_rejected' : 'teaching_review_rejected'),
      );
      assert.equal(mock.calls.length, expectedCalls);
    }
  }
});

test('outline formatting retries once and reports phase without original output', async () => {
  const mock = provider([
    envelope('{"secret":"private-material",'),
    envelope('{"secret":"private-material",'),
  ]);
  const events = [];
  await assert.rejects(
    () =>
      createPlan(input, { env, fetch: mock.fetch, onDiagnostic: (event) => events.push(event) }),
    (e) =>
      e.code === 'model_format' &&
      e.phase === 'outline' &&
      e.attempts === 2 &&
      !JSON.stringify(e).includes('private-material'),
  );
  assert.equal(mock.calls.length, 2);
  assert.ok(!JSON.stringify(events).includes('private-material'));
});

test('Gemini split text parts join without inserting new characters into JSON strings', async () => {
  const raw = JSON.stringify(outline);
  const split = raw.indexOf('fractions') + 3;
  const mock = provider([
    json({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: raw.slice(0, split) }, { text: raw.slice(split) }] },
        },
      ],
    }),
  ]);
  const result = await createPlan(input, {
    env: { ...env, LLM_PROVIDER: 'gemini' },
    fetch: mock.fetch,
  });
  assert.equal(result.title, outline.title);
  assert.equal(mock.calls.length, 1);
});

test('provider refusals and context limits retain their meaning and are not format retries', async () => {
  for (const [protocol, response, code] of [
    [
      'openai-compatible',
      { choices: [{ message: { refusal: 'private-refusal' } }] },
      'model_refused',
    ],
    ['anthropic', { stop_reason: 'refusal', content: [] }, 'model_refused'],
    [
      'anthropic',
      { stop_reason: 'model_context_window_exceeded', content: [] },
      'model_context_limit',
    ],
    ['gemini', { promptFeedback: { blockReason: 'SAFETY' } }, 'model_refused'],
  ]) {
    const mock = provider([json(response)]);
    await assert.rejects(
      () => createPlan(input, { env: { ...env, LLM_PROVIDER: protocol }, fetch: mock.fetch }),
      (e) => e.code === code && !JSON.stringify(e).includes('private-refusal'),
    );
    assert.equal(mock.calls.length, 1);
  }
});

test('invalid native content envelopes fail safely instead of throwing raw TypeErrors', async () => {
  for (const [protocol, response] of [
    ['anthropic', { content: {} }],
    ['gemini', { candidates: [{ content: { parts: {} } }] }],
  ]) {
    const mock = provider([json(response), json(response)]);
    await assert.rejects(
      () => createPlan(input, { env: { ...env, LLM_PROVIDER: protocol }, fetch: mock.fetch }),
      (e) => e.code === 'model_format' && e.attempts === 2,
    );
  }
});

test('separate reasoning is scoped to verified official MiniMax hosts', async () => {
  for (const host of ['api.minimax.cn', 'api.minimax.io', 'compatible.example']) {
    const mock = provider([outline]);
    await createPlan(input, {
      env: { ...env, LLM_BASE_URL: `https://${host}/v1` },
      fetch: mock.fetch,
    });
    assert.equal(
      mock.calls[0].body.reasoning_split,
      host === 'compatible.example' ? undefined : true,
    );
  }
});

test('thinking is disabled only for exact M3 authoring on official MiniMax hosts, never outlines or first reviews', async () => {
  for (const [host, model, disabled] of [
    ['api.minimax.cn', 'MiniMax-M3', true],
    ['api.minimax.io', 'MiniMax-M3', true],
    ['api.minimax.cn', 'MiniMax-M2.7', false],
    ['api.minimax.io', 'MiniMax-M2.7', false],
    ['compatible.example', 'MiniMax-M3', false],
    ['api.minimax.cn.example', 'MiniMax-M3', false],
    ['api.minimax.cn', 'MiniMax-M3-custom', false],
  ]) {
    const configuredEnv = {
      ...env,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: `https://${host}/v1`,
      LLM_MODEL: model,
    };
    const { questions, review, teaching } = fixture(4);
    const mock = provider([{ sufficient: true, questions }, review, teaching, outline]);
    await generateCourse(
      plan,
      { objectives: [topic], questionCount: 4 },
      { env: configuredEnv, fetch: mock.fetch },
    );
    assert.equal(mock.calls.length, 3, `${host}/${model}: author and both independent reviews`);
    assert.deepEqual(
      mock.calls[0].body.thinking,
      disabled ? { type: 'disabled' } : undefined,
      `${host}/${model}: authoring parameter scope`,
    );
    for (const call of mock.calls.slice(1))
      assert.equal(
        Object.hasOwn(call.body, 'thinking'),
        false,
        `${host}/${model}: review defaults`,
      );

    await createPlan(input, { env: configuredEnv, fetch: mock.fetch });
    assert.equal(mock.calls.length, 4);
    assert.equal(
      Object.hasOwn(mock.calls[3].body, 'thinking'),
      false,
      `${host}/${model}: outline defaults`,
    );
  }
});

test('diagnostics use a strict whitelist and cannot fail a successful operation', () => {
  const events = [];
  const diagnostic = createGenerationDiagnostics('course', (event) => events.push(event));
  diagnostic.record({
    phase: 'questions',
    event: 'retrying',
    attempt: 2,
    code: 'model_format',
    prompt: 'private-material',
    apiKey: 'private-key',
    outputChars: 45,
  });
  assert.equal(events.length, 1);
  assert.ok(!JSON.stringify(events).includes('private-'));
  assert.deepEqual(Object.keys(events[0]).sort(), [
    'attempt',
    'code',
    'event',
    'operation',
    'outputChars',
    'phase',
    'requestId',
    'type',
  ]);
  assert.equal(
    publicGenerationDetails({ ...diagnostic.details(), secret: 'hidden' }).secret,
    undefined,
  );
  assert.equal(
    publicGenerationDetails({ ...diagnostic.details(), phase: 'private-material' }),
    undefined,
  );
  assert.doesNotThrow(() =>
    createGenerationDiagnostics('plan', () => {
      throw new Error('logger down');
    }).record({ phase: 'outline', event: 'succeeded' }),
  );
});

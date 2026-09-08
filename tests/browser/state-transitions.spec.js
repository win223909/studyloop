import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sample = JSON.parse(
  await readFile(new URL('../../examples/fractions.json', import.meta.url), 'utf8'),
);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Every generated course, answer and delayed/error response belongs to this page.
// No model, persistent user data or real classroom runtime is used.
async function fixture(page, options = {}) {
  const planGate = deferred();
  const practiceGate = deferred();
  const bankGate = deferred();
  const attemptGate = deferred();
  if (!options.holdPlan) planGate.resolve();
  if (!options.holdPractice) practiceGate.resolve();
  if (!options.holdBank) bankGate.resolve();
  if (!options.holdAttempt) attemptGate.resolve();
  const courses = new Map();
  const attempts = new Map();
  const state = {
    planCalls: 0,
    planKeys: [],
    bankCalls: [],
    bankKeys: [],
    attemptCalls: 0,
    attemptKeys: [],
    practiceCalls: 0,
    practiceKeys: [],
    failLists: 0,
    bankErrors: [],
    planErrors: [],
    attemptErrors: [],
    practiceErrors: [],
    courses,
    attempts,
  };
  const createCourse = (count) => ({
    ...sample,
    id: `fixture-course-${count}`,
    title: `状态测试 ${count} 题`,
    origin: 'generated',
    questionCount: count,
    questions: Array.from({ length: count }, (_, i) => ({
      ...sample.questions[i % sample.questions.length],
      id: `q-${i + 1}`,
    })),
  });
  const publicCourse = (course) => ({
    ...course,
    questions: course.questions.map(
      ({ answerIndex, explanation, lesson, practice, ...question }) => question,
    ),
  });
  const courseSummary = (course) => ({
    ...publicCourse(course),
    questionCount: course.questions.length,
  });
  const reply = (route, json, status = 200) => route.fulfill({ status, json });
  await page.route('**/api/plans', async (route) => {
    state.planCalls += 1;
    state.planKeys.push(route.request().headers()['idempotency-key']);
    if (state.planCalls === 1) await planGate.promise;
    const code = state.planErrors.shift();
    if (code)
      return reply(
        route,
        {
          code,
          error: 'raw-model-response',
          generation: {
            requestId: '11111111-2222-4333-8444-555555555555',
            operation: 'plan',
            phase: 'outline',
            attempts: 2,
          },
        },
        502,
      );
    const form = await new Response(route.request().postDataBuffer(), {
      headers: { 'content-type': route.request().headers()['content-type'] },
    }).formData();
    return reply(route, {
      plan: {
        id: `fixture-plan-${state.planCalls}`,
        title: form.get('topic'),
        description: 'Isolated course state fixture',
        objectives: sample.objectives,
        sources: sample.sources,
      },
    });
  });
  await page.route('**/api/courses', async (route) => {
    if (route.request().method() === 'GET') {
      if (state.failLists > 0) {
        state.failLists -= 1;
        return reply(route, { error: 'List unavailable' }, 503);
      }
      return reply(route, { courses: [...courses.values()].map(courseSummary) });
    }
    const body = route.request().postDataJSON();
    state.bankCalls.push(body);
    state.bankKeys.push(route.request().headers()['idempotency-key']);
    await bankGate.promise;
    const code = state.bankErrors.shift();
    if (code) return reply(route, { code, error: 'raw-model-response' }, 502);
    const course = createCourse(body.questionCount);
    courses.set(course.id, course);
    if (options.failRefreshAfterCourse) state.failLists = 1;
    return reply(route, { course: publicCourse(course) });
  });
  await page.route(/\/api\/courses\/fixture-course-\d+$/, (route) =>
    reply(route, {
      course: publicCourse(courses.get(new URL(route.request().url()).pathname.split('/')[3])),
    }),
  );
  await page.route(/\/api\/courses\/fixture-course-\d+\/attempts$/, async (route) => {
    state.attemptCalls += 1;
    state.attemptKeys.push(route.request().headers()['idempotency-key']);
    await attemptGate.promise;
    const code = state.attemptErrors.shift();
    if (code === 'network') return route.abort('failed');
    if (code) return reply(route, { code, error: 'raw-model-response' }, 502);
    const course = courses.get(new URL(route.request().url()).pathname.split('/')[3]);
    const { answers } = route.request().postDataJSON();
    const results = course.questions.map((question) => ({
      ...question,
      questionId: question.id,
      selected: answers[question.id],
      correctIndex: question.answerIndex,
      status:
        answers[question.id] === 'unknown'
          ? 'unknown'
          : answers[question.id] === question.answerIndex
            ? 'correct'
            : 'incorrect',
      sources: course.sources,
    }));
    const attempt = {
      id: `fixture-attempt-${state.attemptCalls}`,
      courseId: course.id,
      courseTitle: course.title,
      createdAt: '2026-09-10T00:00:00.000Z',
      total: results.length,
      correct: results.filter((r) => r.status === 'correct').length,
      unknown: results.filter((r) => r.status === 'unknown').length,
      results,
    };
    attempts.set(attempt.id, attempt);
    if (options.failRefreshAfterAttempt) state.failLists = 1;
    return reply(route, { attempt });
  });
  await page.route('**/api/attempts', (route) =>
    reply(route, { attempts: [...attempts.values()] }),
  );
  await page.route(/\/api\/attempts\/fixture-attempt-\d+$/, (route) =>
    reply(route, { attempt: attempts.get(new URL(route.request().url()).pathname.split('/')[3]) }),
  );
  await page.route(/\/api\/attempts\/fixture-attempt-\d+\/practice\/q-\d+$/, async (route) => {
    state.practiceCalls += 1;
    state.practiceKeys.push(route.request().headers()['idempotency-key']);
    const answer = route.request().postDataJSON().answer;
    await practiceGate.promise;
    const code = state.practiceErrors.shift();
    if (code) return reply(route, { code, error: 'raw-model-response' }, 502);
    return reply(route, {
      correct: answer === 0,
      answerIndex: 0,
      explanation: '分子和分母同时乘以相同的非零数。',
    });
  });
  return {
    state,
    releasePlan: planGate.resolve,
    releasePractice: practiceGate.resolve,
    releaseBank: bankGate.resolve,
    releaseAttempt: attemptGate.resolve,
  };
}

async function openPlan(page, topic = '分数学习') {
  await page.locator('#course-topic').fill(topic);
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.objective-list')).toBeVisible();
}
async function answerUnknown(page, count) {
  for (let i = 0; i < count; i++) {
    await page.locator('.unknown-option').click();
    await page.locator('.question-actions .primary-button').click();
  }
}

test('late outline responses do not pull the learner away from a newer page', async ({ page }) => {
  const f = await fixture(page, { holdPlan: true });
  await page.goto('/');
  await page.locator('#course-topic').fill('旧请求主题');
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.source-search-progress')).toBeVisible();
  await page.getByRole('button', { name: '模型与设置', exact: true }).click();
  await expect(page.locator('.settings-page')).toBeVisible();
  await expect(page.locator('.source-search-progress')).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await expect(page.locator('#course-topic')).toBeEnabled();
  await openPlan(page, '新请求主题');
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/plans') &&
      response.request().postData()?.includes('旧请求主题'),
  );
  f.releasePlan();
  await oldResponse;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator('.content-title')).toHaveText('新请求主题');
  expect(f.state.planCalls).toBe(2);
});

test('successful course and answer writes survive failed list refreshes without resubmission', async ({
  page,
}) => {
  const f = await fixture(page, {
    failRefreshAfterCourse: true,
    failRefreshAfterAttempt: true,
    holdAttempt: true,
  });
  await page.goto('/');
  await openPlan(page);
  await page.locator('.question-count').getByRole('button', { name: '4 题', exact: true }).click();
  await page.locator('.generate-button').click();
  await expect(page.locator('.question-prompt')).toBeVisible();
  await expect(page.locator('.library-refresh-notice')).toBeVisible();
  expect(f.state.bankCalls).toHaveLength(1);
  await page.locator('.library-refresh-notice button').click();
  await expect(page.locator('.library-refresh-notice')).toHaveCount(0);
  await answerUnknown(page, 4);
  await expect(page.locator('.answer-options input').first()).toBeDisabled();
  await expect(page.locator('.question-grid button').first()).toBeDisabled();
  await page.locator('.question-actions .primary-button').dispatchEvent('click');
  expect(f.state.attemptCalls).toBe(1);
  f.releaseAttempt();
  await expect(page.locator('.result-item')).toHaveCount(4);
  await expect(page).toHaveURL(/attempt=fixture-attempt-1/);
  await expect(page.locator('.library-refresh-notice')).toBeVisible();
  expect(f.state.attemptCalls).toBe(1);
  await page.reload();
  await expect(page.locator('.result-item')).toHaveCount(4);
  expect(f.state.attemptCalls).toBe(1);
});

test('leaving a pending bank keeps the completed course discoverable and blocks duplicate clicks', async ({
  page,
}) => {
  const f = await fixture(page, { holdBank: true });
  await page.goto('/');
  await openPlan(page);
  await page.locator('.generate-button').click();
  await expect(page.locator('.objective-list input').first()).toBeDisabled();
  await expect(page.locator('.question-count button').first()).toBeDisabled();
  await page.locator('.generate-button').dispatchEvent('click');
  expect(f.state.bankCalls).toHaveLength(1);
  await page.getByRole('button', { name: '关于项目', exact: true }).click();
  const completed = page.waitForResponse(
    (response) => response.url().endsWith('/api/courses') && response.request().method() === 'POST',
  );
  f.releaseBank();
  await completed;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator('.about-page')).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await expect(page.locator('.course-row')).toHaveCount(1);
  await page.locator('.course-start').click();
  await expect(page.locator('.question-grid button')).toHaveCount(6);
  expect(f.state.bankCalls).toHaveLength(1);
});

test('format failures retain chosen objectives and support explicit retry at 4, 6 and 8 questions', async ({
  page,
}) => {
  const f = await fixture(page);
  f.state.planErrors.push('model_format');
  await page.goto('/');
  await page.locator('#course-topic').fill('课程格式重试');
  await page.locator('.composer-footer .primary-button').click();
  await expect(page.locator('.error-message')).toContainText('JSON');
  await expect(page.locator('.generation-diagnostics')).toContainText('课程大纲');
  await expect(page.locator('.generation-diagnostics')).toContainText(
    '11111111-2222-4333-8444-555555555555',
  );
  await expect(page.locator('#course-topic')).toHaveValue('课程格式重试');
  for (const count of [4, 6, 8]) {
    await openPlan(page, `课程格式重试 ${count}`);
    await page.locator('.objective-list input').last().uncheck();
    await page
      .locator('.question-count')
      .getByRole('button', { name: `${count} 题`, exact: true })
      .click();
    f.state.bankErrors.push('model_format');
    await page.locator('.generate-button').click();
    await expect(page.locator('.error-message')).toContainText('JSON');
    await expect(page.locator('.objective-list input:checked')).toHaveCount(2);
    await expect(page.locator('.question-count button[aria-pressed="true"]')).toHaveText(
      `${count} 题`,
    );
    await page.locator('.generate-button').click();
    await expect(page.locator('.question-grid button')).toHaveCount(count);
    await answerUnknown(page, count);
    await expect(page.locator('.result-item')).toHaveCount(count);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /^学习工作台/ })
      .click();
  }
  expect(f.state.bankCalls.map((call) => call.questionCount)).toEqual([4, 4, 6, 6, 8, 8]);
  expect(f.state.bankCalls.every((call) => call.objectives.length === 2)).toBe(true);
  expect(f.state.attemptCalls).toBe(3);
});

test('follow-up answers cannot change while their grade is pending', async ({ page }) => {
  const f = await fixture(page, { holdPractice: true });
  await page.goto('/');
  await openPlan(page);
  await page.locator('.question-count').getByRole('button', { name: '4 题', exact: true }).click();
  await page.locator('.generate-button').click();
  await answerUnknown(page, 4);
  await page.locator('.lesson-toggle').first().click();
  await page.locator('.mini-choices input').first().check();
  await page.locator('.followup-practice .secondary-button').click();
  await expect(page.locator('.mini-choices input').first()).toBeDisabled();
  f.releasePractice();
  await expect(page.locator('.practice-feedback')).toBeVisible();
  await expect(page.locator('.mini-choices input').first()).toBeEnabled();
  expect(f.state.practiceCalls).toBe(1);
});

test('unchanged retries reuse submission keys while changed topics, counts and answers start new submissions', async ({
  page,
}) => {
  const f = await fixture(page);
  f.state.planErrors.push('model_format', 'model_format');
  await page.goto('/');
  await page.locator('#course-topic').fill('可重试课程');
  for (let i = 0; i < 2; i++) {
    await page.locator('.composer-footer .primary-button').click();
    await expect(page.locator('.error-message')).toContainText('JSON');
  }
  await openPlan(page, '调整后的课程');
  expect(f.state.planKeys[1]).toBe(f.state.planKeys[0]);
  expect(f.state.planKeys[2]).not.toBe(f.state.planKeys[0]);

  f.state.bankErrors.push('model_format', 'model_format');
  await page.locator('.question-count').getByRole('button', { name: '4 题', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.locator('.generate-button').click();
    await expect(page.locator('.error-message')).toContainText('JSON');
  }
  await page.locator('.question-count').getByRole('button', { name: '6 题', exact: true }).click();
  await page.locator('.generate-button').click();
  await expect(page.locator('.question-grid button')).toHaveCount(6);
  expect(f.state.bankKeys[1]).toBe(f.state.bankKeys[0]);
  expect(f.state.bankKeys[2]).not.toBe(f.state.bankKeys[0]);

  f.state.attemptErrors.push('network', 'model_format');
  await answerUnknown(page, 6);
  await expect(page.locator('.error-message')).toBeVisible();
  await page.locator('.question-actions .primary-button').click();
  await expect(page.locator('.error-message')).toContainText('JSON');
  await page.locator('.answer-options input').first().check();
  await page.locator('.question-actions .primary-button').click();
  await expect(page.locator('.result-item')).toHaveCount(6);
  expect(f.state.attemptKeys[1]).toBe(f.state.attemptKeys[0]);
  expect(f.state.attemptKeys[2]).not.toBe(f.state.attemptKeys[0]);
  expect(f.state.attempts.size).toBe(1);

  f.state.practiceErrors.push('model_format', 'model_format');
  await page.locator('.lesson-toggle').first().click();
  await page.locator('.mini-choices input').first().check();
  for (let i = 0; i < 2; i++) {
    await page.locator('.followup-practice .secondary-button').click();
    await expect(page.locator('.error-message')).toContainText('JSON');
  }
  await page.locator('.mini-choices input').nth(1).check();
  await page.locator('.followup-practice .secondary-button').click();
  await expect(page.locator('.practice-feedback')).toBeVisible();
  expect(f.state.practiceKeys[1]).toBe(f.state.practiceKeys[0]);
  expect(f.state.practiceKeys[2]).not.toBe(f.state.practiceKeys[0]);
  await page.locator('.followup-practice .secondary-button').click();
  await expect.poll(() => f.state.practiceCalls).toBe(4);
  expect(f.state.practiceKeys[3]).not.toBe(f.state.practiceKeys[2]);
  for (const key of [
    ...f.state.planKeys,
    ...f.state.bankKeys,
    ...f.state.attemptKeys,
    ...f.state.practiceKeys,
  ])
    expect(key).toMatch(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i);
});

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sample = JSON.parse(
  await readFile(new URL('../../examples/fractions.json', import.meta.url), 'utf8'),
);
const originalTopic = '求一个数比另一个多（少）百分之几的实际问题练习';
const learningRequest = {
  originalTopic,
  subject: '小学数学 · 百分数',
  goal: '识别比较量与单位一，理解并计算一个数比另一个数增加或减少的百分比。',
  searchQueries: ['百分比', '百分比变化'],
};
const plan = (request) => ({
  id: 'learning-request-fixture',
  title: '百分数实际问题',
  description: '选择要练习的知识点。',
  objectives: ['识别单位一', '计算增加或减少的百分比'],
  sources: sample.sources,
  ...(request === undefined ? {} : { learningRequest: request }),
});
const submit = async (page) => {
  await page.locator('#course-topic').fill(originalTopic);
  await page.locator('.composer-footer .primary-button').click();
};
const noOverflow = async (page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

test('outline reveals the clarified request and exact original input on demand', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 808 });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/plans', async (route) => {
    await gate;
    await route.fulfill({ json: { plan: plan(learningRequest) } });
  });
  await page.goto('/');
  await submit(page);
  await expect(page.locator('.source-search-progress')).toContainText('正在整理学习需求');
  await expect(page.locator('.composer-footer .primary-button')).toContainText(
    '正在整理学习需求并检索资料',
  );
  release();
  const details = page.locator('.learning-request-details');
  await expect(details.locator('summary')).toHaveText('整理后的学习需求');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('dl')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('dd')).toHaveText([
    learningRequest.subject,
    learningRequest.goal,
    learningRequest.searchQueries.join(''),
    originalTopic,
  ]);
  await expect(details.locator('li')).toHaveText(learningRequest.searchQueries);
  await expect(page.getByRole('button', { name: '生成课程与题库', exact: true })).toBeEnabled();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(details.locator('summary')).toHaveText('Clarified learning request');
  await expect(details.locator('dt')).toHaveText([
    'Subject',
    'Learning goal',
    'First search keywords',
    'Original input',
  ]);
  await expect(details.locator('dd').last()).toHaveText(originalTopic);
  await noOverflow(page);
  await details.screenshot({ path: testInfo.outputPath('learning-request.png') });
});

test('legacy plans and malformed optional learning requests keep the outline usable', async ({
  page,
}) => {
  let request;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/plans', (route) => route.fulfill({ json: { plan: plan(request) } }));
  await page.goto('/');
  for (const value of [
    undefined,
    null,
    { ...learningRequest, subject: { invalid: 'object' } },
    { ...learningRequest, goal: [] },
    { ...learningRequest, searchQueries: [{ invalid: 'object' }, null, 42] },
    { ...learningRequest, searchQueries: null },
  ]) {
    request = value;
    await submit(page);
    await expect(page.locator('.content-title')).toHaveText('百分数实际问题');
    await expect(page.locator('.learning-request-details')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '生成课程与题库', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '返回', exact: true }).click();
  }
  request = { ...learningRequest, searchQueries: [null, { invalid: 'object' }, '百分比'] };
  await submit(page);
  await page.locator('.learning-request-details summary').click();
  await expect(page.locator('.learning-request-details li')).toHaveText(['百分比']);
  expect(errors).toEqual([]);
});

test('request preparation failures show the correct diagnostic stage in both languages', async ({
  page,
}) => {
  const requestId = '11111111-2222-4333-8444-555555555555';
  await page.route('**/api/plans', (route) =>
    route.fulfill({
      status: 502,
      json: {
        code: 'content_filter',
        error: 'private upstream rejection detail',
        generation: { requestId, operation: 'plan', phase: 'learning_request', attempts: 1 },
      },
    }),
  );
  await page.goto('/');
  await submit(page);
  const error = page.locator('.error-message');
  await expect(error).toContainText('学习需求整理');
  await expect(error).toContainText(requestId);
  await expect(error).not.toContainText('private upstream');
  await expect(page.locator('#course-topic')).toHaveValue(originalTopic);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(error).toContainText('Learning request');
});

test('source recovery shows every actual query including a single-character subject', async ({
  page,
}) => {
  const queries = ['力', '机械运动', '牛顿运动定律', '物体受力', '力的作用', '作用力与反作用力'];
  await page.route('**/api/plans', (route) =>
    route.fulfill({
      status: 422,
      json: {
        code: 'sources_insufficient',
        error: 'Source coverage is incomplete',
        sourceSearch: { topic: '物体受力', rounds: 2, queries, suggestedTopics: [] },
      },
    }),
  );
  await page.goto('/');
  await page.locator('#course-topic').fill('物体受力');
  await page.locator('.composer-footer .primary-button').click();
  const error = page.locator('.error-message');
  await error.locator('summary').click();
  await expect(error.locator('.source-search-queries li')).toHaveText(queries);
  await noOverflow(page);
});

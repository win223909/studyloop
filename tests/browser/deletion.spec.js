import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sample = JSON.parse(
  await readFile(new URL('../../examples/fractions.json', import.meta.url), 'utf8'),
);
const QUEUE_KEY = 'studyloop.pending-classroom-cleanups';

async function pendingCleanupJobs(page) {
  return page.evaluate(
    (prefix) =>
      Object.keys(localStorage)
        .filter(
          (key) => key.startsWith(`${prefix}.staged.`) || key.startsWith(`${prefix}.confirmed.`),
        )
        .map((key) => JSON.parse(localStorage.getItem(key))),
    QUEUE_KEY,
  );
}

// These routes own all record/course/delete/receipt state. The classroom iframe
// is a protocol fixture; it never opens or removes any real IndexedDB classroom.
async function deletionFixture(
  page,
  {
    shared = false,
    holdPreview = false,
    holdDelete = false,
    failures = [],
    cleanupFailsOnce = false,
    loseDeleteResponse = false,
    receiptFailures = 0,
  } = {},
) {
  const course = {
    ...sample,
    id: 'fixture-course',
    title: '删除测试课程 · Shared fractions',
    origin: 'generated',
    questionCount: sample.questions.length,
  };
  const createAttempt = (id) => ({
    id,
    courseId: course.id,
    courseTitle: course.title,
    createdAt: '2026-09-09T01:00:00.000Z',
    total: sample.questions.length,
    correct: 0,
    unknown: sample.questions.length,
    results: sample.questions.map((question) => ({
      ...question,
      questionId: question.id,
      selected: 'unknown',
      correctIndex: question.answerIndex,
      status: 'unknown',
      sources: sample.sources,
    })),
  });
  const records = new Map([['fixture-attempt-a', createAttempt('fixture-attempt-a')]]);
  if (shared) records.set('fixture-attempt-b', createAttempt('fixture-attempt-b'));
  const state = {
    records,
    coursePresent: true,
    revision: 1,
    deleteCalls: [],
    previewCalls: 0,
    cleanupCalls: 0,
    receipts: new Map(),
    failures: [...failures],
    receiptFailures,
  };
  let releasePreview;
  const previewGate = new Promise((resolve) => {
    releasePreview = resolve;
  });
  if (!holdPreview) releasePreview();
  let releaseDelete;
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });
  if (!holdDelete) releaseDelete();
  const respond = (route, json, status = 200) => route.fulfill({ status, json });
  await page.route('**/api/courses', (route) =>
    respond(route, { courses: state.coursePresent ? [course] : [] }),
  );
  await page.route('**/api/attempts', (route) =>
    respond(route, { attempts: [...records.values()] }),
  );
  await page.route(
    /\/api\/attempts\/fixture-attempt-[ab](?:\/deletion-preview)?$/,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const id = path.split('/')[3];
      if (path.endsWith('/deletion-preview')) {
        state.previewCalls += 1;
        await previewGate;
        if (!records.has(id)) return respond(route, { error: 'Fixture record not found.' }, 404);
        const kept = records.size > 1;
        return respond(route, {
          attemptId: id,
          courseId: course.id,
          courseTitle: course.title,
          revision: `fixture-revision-${state.revision}`,
          counts: {
            attempts: 1,
            practice: 2,
            handoffs: shared ? 0 : 1,
            courses: kept ? 0 : 1,
            plans: kept ? 0 : 1,
          },
          handoffIds: shared ? [] : ['fixture-handoff'],
          retained: kept
            ? [
                { resource: 'course', reason: 'shared', count: 1, references: 1 },
                { resource: 'plan', reason: 'shared', count: 1, references: 1 },
              ]
            : [],
        });
      }
      if (route.request().method() === 'DELETE') {
        const body = route.request().postDataJSON();
        state.deleteCalls.push({ id, body });
        await deleteGate;
        const failure = state.failures.shift();
        if (failure === 409) {
          state.revision += 1;
          return respond(route, { error: 'Fixture scope changed.' }, 409);
        }
        if (failure) return respond(route, { error: 'Fixture deletion failed.' }, failure);
        if (body.revision !== `fixture-revision-${state.revision}`)
          return respond(route, { error: 'Fixture stale revision.' }, 409);
        records.delete(id);
        state.coursePresent = records.size > 0;
        const receipt = {
          attemptId: id,
          completed: true,
          deletedAt: '2026-09-09T02:00:00.000Z',
          handoffIds: shared ? [] : ['fixture-handoff'],
          deleted: {
            attempts: 1,
            practice: 2,
            handoffs: shared ? 0 : 1,
            courses: state.coursePresent ? 0 : 1,
            plans: state.coursePresent ? 0 : 1,
          },
          retained: [],
        };
        state.receipts.set(id, receipt);
        if (loseDeleteResponse && state.deleteCalls.length === 1) return route.abort('failed');
        return respond(route, receipt);
      }
      return records.has(id)
        ? respond(route, { attempt: records.get(id) })
        : respond(route, { error: 'Fixture record not found.' }, 404);
    },
  );
  await page.route(/\/api\/attempt-deletions\/fixture-attempt-[ab]$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    if (state.receiptFailures > 0) {
      state.receiptFailures -= 1;
      return respond(route, { error: 'Fixture receipt temporarily unavailable.' }, 503);
    }
    return state.receipts.has(id)
      ? respond(route, state.receipts.get(id))
      : respond(route, { error: 'Fixture deletion not confirmed.' }, 404);
  });
  await page.route('**/studyloop-cleanup', (route) => {
    state.cleanupCalls += 1;
    const ok = !(cleanupFailsOnce && state.cleanupCalls === 1);
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Classroom cleanup protocol fixture</title><script>
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'studyloop:cleanup') return;
        parent.postMessage({type:'studyloop:cleanup-result', requestId:event.data.requestId, attemptId:event.data.attemptId, ok:${ok}, deleted:${ok ? 1 : 0}, pending:${ok ? 0 : 1}}, location.origin);
      });
      parent.postMessage({type:'studyloop:cleanup-ready'}, location.origin);
    </script>`,
    });
  });
  return { state, releasePreview, releaseDelete };
}

async function noHorizontalOverflow(page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('.deletion-dialog')
        .evaluateAll((dialogs) =>
          dialogs.every((dialog) => dialog.scrollWidth <= dialog.clientWidth),
        ),
    )
    .toBe(true);
}

test('deletion preview is keyboard-safe and shared courses are retained', async ({ page }) => {
  const fixture = await deletionFixture(page, {
    shared: true,
    holdPreview: true,
    holdDelete: true,
  });
  await page.goto('/');
  await page.getByRole('button', { name: '学习记录', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  expect(await page.locator('.history-entry button button').count()).toBe(0);
  const opener = page.locator('.history-delete').first();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('正在核对删除范围');
  fixture.releasePreview();
  await expect(dialog.locator('[data-count="courses"] dd')).toHaveText('0');
  await expect(dialog.locator('[data-count="practice"] dd')).toHaveText('2');
  await expect(dialog).toContainText('仍由其他 1 条学习记录引用');
  await expect(dialog).toContainText('此操作不可恢复');
  await expect(dialog).toContainText('需你手动删除');
  await expect(dialog).toContainText('能准确关联');
  await expect(dialog).toContainText('其他浏览器中的课堂需分别清理');
  await expect(dialog).toContainText('生成或导入课程与题库');
  const close = dialog.getByRole('button', { name: '关闭删除预览', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(fixture.state.deleteCalls).toHaveLength(0);
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeEnabled();
  await noHorizontalOverflow(page);
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '正在删除…', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  expect(fixture.state.deleteCalls).toHaveLength(1);
  expect(await pendingCleanupJobs(page)).toEqual([
    { attemptId: 'fixture-attempt-a', handoffIds: [], phase: 'staged' },
  ]);
  fixture.releaseDelete();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.success-message')).toContainText('已删除');
  expect(fixture.state.deleteCalls).toHaveLength(1);
  expect(fixture.state.deleteCalls[0].body.revision).toBe('fixture-revision-1');
  expect(fixture.state.cleanupCalls).toBe(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /^学习工作台/ })
    .click();
  await expect(page.locator('.course-row')).toHaveCount(1);
});

test('deletion refreshes changed scope, preserves failures and retries persisted classroom cleanup', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === 'mobile' ? 320 : 607,
    height: 808,
  });
  const fixture = await deletionFixture(page, { failures: [409, 503], cleanupFailsOnce: true });
  await page.goto('/?attempt=fixture-attempt-a');
  await expect(page.locator('.result-item')).toHaveCount(6);
  await page.getByRole('button', { name: '删除记录', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('[data-count="courses"] dd')).toHaveText('1');
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('deletion-preview.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('引用关系已发生变化');
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
  expect(fixture.state.records.size).toBe(1);
  expect(await pendingCleanupJobs(page)).toEqual([]);
  await dialog.getByRole('button', { name: '重新预览', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '重试删除', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '重试删除', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(fixture.state.records.size).toBe(1);
  expect(fixture.state.cleanupCalls).toBe(0);
  await expect(page.locator('.result-item')).toHaveCount(6);
  await dialog.getByRole('button', { name: '重试删除', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/attempt=/);
  await expect(page.locator('.history-row')).toHaveCount(0);
  await expect(page.locator('.result-item')).toHaveCount(0);
  await expect(page.locator('.cleanup-notice')).toContainText('课堂清理待完成');
  await expect(page.locator('.success-message')).toHaveCount(0);
  expect(fixture.state.deleteCalls).toHaveLength(3);
  expect(fixture.state.deleteCalls[1].body.revision).toBe('fixture-revision-2');
  await page.reload();
  await expect(page.locator('.cleanup-notice')).toContainText('课堂清理待完成');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('.cleanup-notice')).toContainText('Classroom cleanup is pending');
  await page.getByRole('button', { name: 'Retry classroom cleanup', exact: true }).click();
  await expect(page.locator('.cleanup-notice')).toHaveCount(0);
  await expect(page.locator('.success-message')).toContainText('cleanup is complete');
  expect(await pendingCleanupJobs(page)).toEqual([]);
  expect(fixture.state.deleteCalls).toHaveLength(3);
  expect(fixture.state.cleanupCalls).toBe(2);
  await expect(page.locator('.course-row')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('lost DELETE responses recover through a receipt immediately or after cleanup retry', async ({
  page,
}) => {
  for (const receiptFailures of [0, 1]) {
    const fixture = await deletionFixture(page, { loseDeleteResponse: true, receiptFailures });
    await page.goto('/?attempt=fixture-attempt-a');
    await expect(page.locator('.result-item')).toHaveCount(6);
    await page.getByRole('button', { name: '删除记录', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    if (receiptFailures) {
      await expect(dialog.getByRole('alert')).toContainText('尚未确认删除结果');
      await expect(page.locator('.result-item')).toHaveCount(6);
      await expect(page.locator('.success-message')).toHaveCount(0);
      expect(fixture.state.cleanupCalls).toBe(0);
      fixture.state.failures.push(403);
      await dialog.getByRole('button', { name: '重试删除', exact: true }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      expect(await pendingCleanupJobs(page)).toHaveLength(1);
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '删除记录', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('「重试课堂清理」核对删除凭据');
      await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '重试课堂清理', exact: true }).click();
    }
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/attempt=/);
    await expect(page.locator('.result-item')).toHaveCount(0);
    await expect(page.locator('.history-row')).toHaveCount(0);
    await expect(page.locator('.cleanup-notice')).toHaveCount(0);
    await expect(page.locator('.success-message')).toContainText('能准确关联的课堂已完成清理');
    await expect(page.locator('.success-message')).toContainText('旧课堂可能保留');
    expect(await pendingCleanupJobs(page)).toEqual([]);
    expect(fixture.state.deleteCalls).toHaveLength(receiptFailures ? 2 : 1);
    expect(fixture.state.cleanupCalls).toBe(1);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /^学习工作台/ })
      .click();
    await expect(page.locator('.course-row')).toHaveCount(0);
  }
});

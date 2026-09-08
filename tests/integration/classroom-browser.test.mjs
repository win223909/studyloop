import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../../server/app.js';
import { createOpenMAICRuntime } from '../../server/integrations/openmaic-runtime.js';
import { loadSamples } from '../../server/core/samples.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const question = 'Why do two quarters equal one half?';
const answer = 'Both fractions describe the same two of four equal parts.';
const replies = [
  {
    languageDirective: 'Teach in English.',
    courseTitle: 'Browser classroom fixture',
    outlines: [
      {
        id: 'browser-outline',
        type: 'quiz',
        title: 'Equivalent fractions',
        description: 'Recognize and explain equivalent fractions.',
        order: 0,
        keyPoints: ['Equal parts'],
        quizConfig: {
          questionCount: 2,
          difficulty: 'easy',
          questionTypes: ['single', 'short_answer'],
        },
      },
    ],
  },
  {
    agents: [
      {
        name: 'Fixture Teacher',
        role: 'teacher',
        persona: 'Explains equal parts clearly.',
        priority: 10,
      },
      { name: 'Fixture Learner', role: 'student', persona: 'Asks concise questions.', priority: 5 },
    ],
  },
  [
    {
      id: 'browser-choice',
      type: 'single',
      question: 'Which fraction equals one half?',
      points: 1,
      options: [
        { value: 'A', label: '2/4' },
        { value: 'B', label: '1/4' },
      ],
      answer: 'A',
      explanation: 'Two of four equal parts make one half.',
    },
    {
      id: 'browser-written',
      type: 'short_answer',
      question,
      points: 4,
      commentPrompt: 'Explain equivalent fractions using equal parts.',
    },
  ],
  [
    { type: 'text', content: 'Two quarters equal one half. Complete the practice.' },
    { type: 'action', name: 'text', params: {} },
  ],
  [
    { type: 'text', content: 'Two quarters equal one half. Complete the practice.' },
    { type: 'action', name: 'wb_open', params: {} },
    { type: 'action', name: 'wb_draw_text', params: { content: '2/4 = 1/2', x: 100, y: 100 } },
    { type: 'action', name: 'wb_close', params: {} },
    { type: 'action', name: 'text', params: { content: 'Explain the equal parts.' } },
  ],
];

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

// Read the application's real IndexedDB data; never import its JS or substitute
// a storage mock. Opening absent databases is avoided to keep this read-only.
async function storageSnapshot() {
  const known = await indexedDB.databases();
  const databases = {};
  for (const name of ['maic-documents', 'maic-runtime', 'MAIC-Database']) {
    if (!known.some((entry) => entry.name === name)) continue;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    databases[name] = {};
    for (const table of db.objectStoreNames) {
      databases[name][table] = await new Promise((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
  }
  return {
    databases,
    links: JSON.parse(localStorage.getItem('studyloop.classroom-links') || '{}'),
    deleted: JSON.parse(localStorage.getItem('studyloop.classroom-deletions') || '{}'),
  };
}

async function cleanupThroughBridge(page, attemptId) {
  return page.evaluate(
    (attemptId) =>
      new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        const requestId = crypto.randomUUID();
        const timer = setTimeout(() => finish(new Error('Cleanup bridge timed out.')), 30000);
        const finish = (error, result) => {
          clearTimeout(timer);
          removeEventListener('message', listener);
          iframe.remove();
          if (error) reject(error);
          else resolve(result);
        };
        const listener = (event) => {
          if (event.origin !== location.origin || event.source !== iframe.contentWindow) return;
          if (event.data?.type === 'studyloop:cleanup-ready') {
            iframe.contentWindow.postMessage(
              {
                type: 'studyloop:cleanup',
                requestId,
                attemptId,
                handoffIds: [],
              },
              location.origin,
            );
          } else if (
            event.data?.type === 'studyloop:cleanup-result' &&
            event.data.requestId === requestId &&
            event.data.attemptId === attemptId
          ) {
            finish(null, event.data);
          }
        };
        addEventListener('message', listener);
        iframe.hidden = true;
        iframe.src = '/studyloop-cleanup';
        document.body.append(iframe);
      }),
    attemptId,
  );
}

test(
  'browser handoff saves a classroom, recovers grading errors, returns to results and fences an open deleted classroom',
  { timeout: 180000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-classroom-flow-'));
    const calls = [];
    let gradeMode = 'unavailable';
    let generationCalls = 0;
    let releaseGrade;
    let gradeStarted;
    let gradeFinished;
    const delayedGradeStarted = new Promise((resolve) => {
      gradeStarted = resolve;
    });
    const delayedGradeFinished = new Promise((resolve) => {
      gradeFinished = resolve;
    });
    const provider = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const grading = JSON.stringify(body.messages).includes('professional educational assessor');
      calls.push({ grading, body });
      if (grading && gradeMode === 'delayed') {
        res.once('close', gradeFinished);
        gradeStarted();
        await new Promise((resolve) => {
          releaseGrade = resolve;
        });
      }
      if (grading && gradeMode === 'unavailable') {
        res
          .writeHead(500, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'Synthetic grading outage.' } }));
        return;
      }
      const reply = grading
        ? {
            score:
              gradeMode === 'null-score'
                ? null
                : gradeMode === 'text-score'
                  ? '4'
                  : gradeMode === 'out-of-range'
                    ? 99
                    : 4,
            comment: 'Correct explanation of equal parts.',
          }
        : replies[generationCalls++];
      if (!reply) {
        res.writeHead(500).end('Unexpected fixture model request.');
        return;
      }
      const content =
        grading && gradeMode === 'malformed'
          ? 'This is not a grade JSON response.'
          : JSON.stringify(reply);
      if (body.stream) {
        res.setHeader('content-type', 'text/event-stream');
        const chunk = (delta, finish_reason = null) =>
          `data: ${JSON.stringify({
            id: 'browser-fixture',
            object: 'chat.completion.chunk',
            created: 1,
            model: body.model,
            choices: [{ index: 0, delta, finish_reason }],
          })}\n\n`;
        res.end(chunk({ role: 'assistant', content }) + chunk({}, 'stop') + 'data: [DONE]\n\n');
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'browser-fixture',
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        );
      }
    });
    const providerUrl = await listen(provider);
    const env = {
      DATA_DIR: directory,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: providerUrl + '/v1',
      LLM_API_KEY: 'fixture-local-only',
      LLM_MODEL: 'studyloop-fixture',
      LLM_MAX_OUTPUT_TOKENS: '4096',
      LLM_TIMEOUT_MS: '30000',
      DAILY_GENERATION_LIMIT: '40',
    };
    const runtime = createOpenMAICRuntime({ root, env });
    assert.equal(runtime.status().installed, true, 'Build the bundled classroom before this test.');
    const server = http.createServer(await createApp({ root, env, openmaicRuntime: runtime }));
    const base = await listen(server);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors = [];
    const policyErrors = [];
    const accessCodeRequests = [];
    const stageMetaRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) policyErrors.push(message.text());
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/access-code/'))
        accessCodeRequests.push(request.url());
      if (new URL(request.url()).pathname.startsWith('/api/stage-meta/'))
        stageMetaRequests.push(request.url());
    });
    t.after(async () => {
      releaseGrade?.();
      await browser.close();
      server.closeAllConnections();
      provider.closeAllConnections();
      await runtime.stop();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => provider.close(resolve)),
      ]);
      await rm(directory, { recursive: true, force: true });
    });
    const sample = (await loadSamples()).find((course) => course.language === 'en');
    const submitted = await context.request.post(base + `/api/courses/${sample.id}/attempts`, {
      data: { answers: Object.fromEntries(sample.questions.map((q) => [q.id, 'unknown'])) },
    });
    assert.equal(submitted.status(), 201);
    const { attempt } = await submitted.json();
    const handoff = await (
      await context.request.post(base + `/api/attempts/${attempt.id}/classroom-handoff`, {
        data: {},
      })
    ).json();

    // An unrelated browser cannot launch another owner's material or call its model.
    const stranger = await browser.newContext();
    const deniedPage = await stranger.newPage();
    await deniedPage.goto(base + handoff.url);
    await expect(
      deniedPage.getByRole('alert').filter({ hasText: 'The classroom could not be opened' }),
    ).toBeVisible();
    assert.equal(calls.length, 0);
    await stranger.close();

    await page.goto(base + handoff.url);
    await page.getByRole('button', { name: 'Confirm and generate course', exact: true }).click();
    await page.waitForURL(/\/classroom\/[^/]+$/, { timeout: 60000 });
    const classroomUrl = page.url();
    const stageId = new URL(classroomUrl).pathname.split('/').at(-1);
    const fontFamilies = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].map((font) => font.family.replaceAll(/['"]/g, ''));
    });
    assert.ok(fontFamilies.includes('Inter Variable'), 'The bundled UI font remains available.');
    for (const family of [
      'SourceHanSans',
      'SourceHanSerif',
      'LXGWWenKai',
      'ZhuQueFangSong',
      'WenDingPLKaiTi',
      'ZcoolHappy',
    ])
      assert.equal(fontFamilies.includes(family), false, 'Do not register external font faces.');
    await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
    await page.getByRole('button', { name: 'A 2/4', exact: true }).click();
    await page.getByPlaceholder('Type your answer here...').fill(answer);
    assert.equal(
      generationCalls,
      5,
      'One invalid action response retries only actions; outline, roles and content are reused.',
    );
    let snapshot = await page.evaluate(storageSnapshot);
    assert.equal(snapshot.links[stageId].attemptId, attempt.id);
    assert.equal(snapshot.links[stageId].handoffId, handoff.id);
    assert.equal(snapshot.databases['maic-documents'].stages.length, 1);
    assert.equal(snapshot.databases['maic-documents'].scenes.length, 1);
    const persistedActions = snapshot.databases['maic-documents'].scenes[0].actions;
    assert.deepEqual(
      persistedActions.map((action) => action.type),
      ['speech', 'wb_open', 'wb_draw_text', 'wb_close', 'speech'],
    );
    assert.equal(persistedActions.at(-1).text, 'Explain the equal parts.');
    assert.deepEqual(
      snapshot.databases['maic-documents'].stages[0].generatedAgentConfigs.map(
        (agent) => agent.name,
      ),
      ['Fixture Teacher', 'Fixture Learner'],
    );

    for (const mode of ['unavailable', 'malformed', 'null-score', 'text-score', 'out-of-range']) {
      gradeMode = mode;
      const response = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/quiz-grade',
      );
      await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
      assert.equal((await response).ok(), false, `${mode} must return a failed grading response.`);
      await expect(page.getByRole('alert').filter({ hasText: 'Your answers are saved' }))
        .toBeVisible()
        .catch(async (error) => {
          const failedState = await page.evaluate(storageSnapshot);
          t.diagnostic(
            JSON.stringify({
              mode,
              quizRecords: failedState.databases['maic-runtime']?.records.map((row) => row.payload),
            }),
          );
          throw error;
        });
      await expect(page.getByText('Quiz Report', { exact: true })).toHaveCount(0);
      await expect(page.getByPlaceholder('Type your answer here...')).toHaveValue(answer);
      snapshot = await page.evaluate(storageSnapshot);
      assert.equal(
        snapshot.databases['maic-runtime'].records.some((row) => row.payload?.phase === 'reviewed'),
        false,
        `${mode} grading must never persist a score.`,
      );
    }
    gradeMode = 'valid';
    await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
    await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
    await expect(page.getByText('100%', { exact: true })).toBeVisible();
    snapshot = await page.evaluate(storageSnapshot);
    const reviews = snapshot.databases['maic-runtime'].records.filter(
      (row) => row.payload?.phase === 'reviewed',
    );
    assert.equal(reviews.length, 1);
    assert.equal(
      reviews[0].payload.results.reduce((sum, result) => sum + result.earned, 0),
      5,
    );
    const callCount = calls.length;
    await page.reload();
    await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
    await expect(page.getByText('100%', { exact: true })).toBeVisible();
    assert.deepEqual(
      (await page.evaluate(storageSnapshot)).databases['maic-documents'].scenes[0].actions,
      persistedActions,
      'The mixed action list survives actual IndexedDB reload without an empty text action.',
    );
    assert.equal(
      calls.length,
      callCount,
      'Reloading a graded classroom must not call the model again.',
    );
    await page.getByRole('link', { name: 'Original attempt', exact: true }).click();
    await page.waitForURL(base + `/?attempt=${attempt.id}`);
    assert.equal((await context.request.get(base + `/api/attempts/${attempt.id}`)).status(), 200);
    await page.goto(base + '/studio');
    await page.getByRole('link', { name: /Browser classroom fixture/ }).click();
    await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();

    gradeMode = 'delayed';
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
    await page.getByRole('button', { name: 'A 2/4', exact: true }).click();
    await page.getByPlaceholder('Type your answer here...').fill(answer);
    await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
    await delayedGradeStarted;
    const callsWithPendingGrade = calls.length;

    // Unlike a presence mock, this is an actual mounted classroom with writers,
    // quiz state, speech hooks and the deletion listener still running.
    const control = await context.newPage();
    await control.goto(base + '/api/health');
    const preview = await (
      await context.request.get(base + `/api/attempts/${attempt.id}/deletion-preview`)
    ).json();
    const removed = await context.request.delete(base + `/api/attempts/${attempt.id}`, {
      data: { revision: preview.revision },
    });
    assert.equal(removed.status(), 200);
    let cleanup = await cleanupThroughBridge(control, attempt.id);
    await page.waitForURL(base + '/studio');
    await page.locator('.studyloop-library-saved[aria-busy="false"]').waitFor();
    if (!cleanup.ok && cleanup.pending > 0)
      cleanup = await cleanupThroughBridge(control, attempt.id);
    assert.equal(cleanup.ok, true, JSON.stringify(cleanup));
    releaseGrade();
    await delayedGradeFinished;
    snapshot = await page.evaluate(storageSnapshot);
    assert.ok(snapshot.deleted[attempt.id]);
    assert.equal(snapshot.links[stageId], undefined);
    assert.deepEqual(snapshot.databases['maic-documents'].stages, []);
    assert.deepEqual(snapshot.databases['maic-documents'].scenes, []);
    assert.deepEqual(snapshot.databases['maic-runtime'].sessions, []);
    assert.deepEqual(snapshot.databases['maic-runtime'].records, []);
    await page.goto(classroomUrl);
    await page.waitForURL(base + '/studio');
    await page.locator('.studyloop-library-saved[aria-busy="false"]').waitFor();
    assert.deepEqual((await page.evaluate(storageSnapshot)).databases['maic-documents'].stages, []);
    assert.equal(
      calls.length,
      callsWithPendingGrade,
      'Deleted classroom navigation cannot restart generation or grading.',
    );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(policyErrors, [], 'Classroom navigation must respect the existing CSP.');
    assert.deepEqual(accessCodeRequests, [], 'StudyLoop manages access without the upstream API.');
    assert.deepEqual(stageMetaRequests, [], 'Browser classrooms do not request a server sidecar.');
  },
);

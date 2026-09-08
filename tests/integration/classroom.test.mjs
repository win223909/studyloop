import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/app.js';
import { createOpenMAICRuntime } from '../../server/integrations/openmaic-runtime.js';
import { loadSamples } from '../../server/core/samples.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outline = {
  id: 'fixture-outline',
  type: 'quiz',
  title: 'Equivalent fractions',
  description: 'Understand one half and two quarters.',
  order: 0,
  keyPoints: ['Equal parts'],
  quizConfig: { questionCount: 1, difficulty: 'easy', questionTypes: ['single'] },
};
const replies = [
  {
    languageDirective: 'Teach in English.',
    courseTitle: 'Fractions classroom fixture',
    outlines: [outline],
  },
  [
    {
      id: 'fixture-question',
      type: 'single',
      question: 'Which fraction equals one half?',
      options: [
        { value: 'A', label: '2/4' },
        { value: 'B', label: '1/4' },
      ],
      answer: 'A',
      explanation: 'Two of four equal parts make one half.',
    },
  ],
  [{ type: 'text', content: 'Two quarters equal one half. Choose the matching fraction.' }],
];
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

// Exercise the shipped Next application and SDK. Only the billable provider is
// replaced by deterministic local HTTP responses; no user key or data is loaded.
test(
  'bundled OpenMAIC generates an outline, quiz and playable scene through StudyLoop',
  { timeout: 120000 },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'studyloop-native-classroom-'));
    const calls = [];
    let forcedActionReply;
    const provider = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const content = JSON.stringify(forcedActionReply ?? replies[calls.length] ?? []);
      calls.push({ path: req.url, body });
      if (body.stream) {
        res.setHeader('content-type', 'text/event-stream');
        const data = (delta, reason = null) =>
          `data: ${JSON.stringify({ id: 'fixture-completion', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
        res.write(data({ role: 'assistant', content }));
        res.end(data({}, 'stop') + 'data: [DONE]\n\n');
      } else {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'fixture-completion',
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
    };
    const runtime = createOpenMAICRuntime({ root, env });
    assert.equal(
      runtime.status().installed,
      true,
      'Run npm run classroom:install before the native integration test.',
    );
    const app = await createApp({ root, env, openmaicRuntime: runtime });
    const server = http.createServer(app);
    const base = await listen(server);
    t.after(async () => {
      server.closeAllConnections();
      await runtime.stop();
      provider.closeAllConnections();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => provider.close(resolve)),
      ]);
      await rm(directory, { recursive: true, force: true });
    });
    let cookie = '';
    async function request(route, body, extra = {}) {
      const response = await fetch(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          cookie,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = response.headers
        .getSetCookie()
        .find(
          (entry) =>
            entry.startsWith('studyloop_session=') && !entry.startsWith('studyloop_session=;'),
        );
      if (value) cookie = value.split(';')[0];
      return response;
    }
    const sample = (await loadSamples())[0];
    const submitted = await request(`/api/courses/${sample.id}/attempts`, {
      answers: Object.fromEntries(sample.questions.map((q) => [q.id, 'unknown'])),
    });
    const { attempt } = await submitted.json();
    assert.equal(submitted.status, 201);
    const handoff = await (
      await request(`/api/attempts/${attempt.id}/classroom-handoff`, {})
    ).json();
    const brief = await (await request(`/api/classroom-handoffs/${handoff.id}`)).json();
    const launch = await request(handoff.url);
    assert.equal(launch.status, 200);
    assert.match(await launch.text(), /studyloop-launch|Preparing your interactive classroom/);
    const managedResponse = await request('/api/server-providers');
    assert.equal(managedResponse.status, 200);
    const managed = await managedResponse.json();
    assert.deepEqual(managed.providers.openai.models, ['studyloop-fixture']);
    assert.ok(Object.values(managed.image).every((p) => p.disabled));
    assert.doesNotMatch(JSON.stringify(managed), /fixture-local-only/);
    const internal = await runtime.ensureRunning();
    assert.equal((await fetch(internal.url + '/api/server-providers')).status, 404);
    const forged = {
      'x-model': 'anthropic:unmanaged-model',
      'x-api-key': 'ignored-fixture-key',
      'x-base-url': 'http://127.0.0.1:1/v1',
      'x-provider-type': 'anthropic',
    };
    const outlinesResponse = await request(
      '/api/generate/scene-outlines-stream',
      {
        requirements: {
          requirement: 'Explain equivalent fractions.',
          webSearch: false,
          interactiveMode: false,
        },
        pdfText: brief.brief,
        pdfImages: [],
        imageMapping: {},
      },
      forged,
    );
    assert.equal(outlinesResponse.status, 200);
    const stream = await outlinesResponse.text();
    const events = stream
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)));
    const done = events.find((event) => event.type === 'done');
    assert.ok(done, `Outline stream did not finish: ${stream.slice(0, 800)}`);
    assert.equal(done.outlines.length, 1);
    const common = {
      outline: done.outlines[0],
      allOutlines: done.outlines,
      stageId: 'fixture-stage',
      languageDirective: 'Teach in English.',
    };
    const contentResponse = await request('/api/generate/scene-content', common, forged);
    const content = await contentResponse.json();
    assert.equal(contentResponse.status, 200, JSON.stringify(content));
    assert.equal(content.content.questions.length, 1);
    const sceneResponse = await request(
      '/api/generate/scene-actions',
      { ...common, content: content.content },
      forged,
    );
    const scene = await sceneResponse.json();
    assert.equal(sceneResponse.status, 200, JSON.stringify(scene));
    assert.equal(scene.scene.type, 'quiz');
    assert.equal(scene.scene.actions[0].type, 'speech');
    assert.deepEqual(scene.scene.content.questions[0].answer, ['A']);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.path, '/v1/chat/completions');
      assert.equal(call.body.model, 'studyloop-fixture');
      assert.ok((call.body.max_tokens ?? call.body.max_completion_tokens) <= 4096);
    }
    for (const invalid of [
      { type: 'action', name: 'text', params: {} },
      {
        type: 'action',
        name: 'unknown_action',
        params: { content: 'Do not silently discard me.' },
      },
      { type: 'action', name: 'spotlight', params: {} },
      { type: 'action', name: 'spotlight', params: { elementId: 'not-a-quiz-element' } },
    ]) {
      forcedActionReply = [...replies[2], invalid];
      const before = calls.length;
      const rejected = await request(
        '/api/generate/scene-actions',
        { ...common, content: content.content },
        forged,
      );
      assert.equal(rejected.status, 422);
      const failure = await rejected.json();
      assert.equal(failure.errorCode, 'GENERATION_FAILED');
      assert.equal(
        failure.scene,
        undefined,
        'An invalid mixed list must never reach the browser store.',
      );
      assert.equal(
        calls.length - before,
        2,
        'Only actions retry once; content is not regenerated.',
      );
    }
    assert.equal((await request('/api/persistence/classrooms')).status, 404);
    assert.equal((await request('/api/generate/tts', {})).status, 404);
  },
);

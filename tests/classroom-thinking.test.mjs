import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import {
  applyStudyLoopThinking,
  studyLoopThinkingContext,
} from '../integrations/openmaic/overlay/lib/ai/studyloop-thinking.ts';
import { patchOpenMAICProvider } from '../scripts/openmaic-provider-patch.mjs';
import { readSourceArchive } from '../scripts/openmaic-build-utils.mjs';

const official = 'https://api.minimax.cn/v1/chat/completions';
const request = () => ({
  method: 'POST',
  headers: { authorization: 'Bearer fixture-key' },
  signal: new AbortController().signal,
  body: JSON.stringify({
    model: 'MiniMax-M3',
    messages: [{ role: 'user', content: 'Synthetic classroom fixture' }],
    max_tokens: 16384,
    stream: false,
    thinking: { type: 'adaptive' },
  }),
});
const context = (source = 'scene-content') => studyLoopThinkingContext(undefined, source, true);

test('official M3 content and actions disable thinking while preserving the original request', () => {
  for (const host of ['api.minimax.cn', 'api.minimax.io']) {
    for (const source of ['scene-content', 'scene-actions']) {
      const original = request();
      const changed = applyStudyLoopThinking(
        new URL(`https://${host}/v1/chat/completions`),
        original,
        context(source),
        true,
      );
      assert.notEqual(changed, original);
      assert.equal(changed.headers, original.headers);
      assert.equal(changed.signal, original.signal);
      assert.deepEqual(JSON.parse(changed.body), {
        ...JSON.parse(original.body),
        thinking: { type: 'disabled' },
      });
      assert.equal(JSON.parse(original.body).thinking.type, 'adaptive');
    }
  }
});

test('outlines, grading, other phases and nonembedded requests retain thinking settings', () => {
  const thinking = { mode: 'enabled', budgetTokens: 6000 };
  for (const source of [
    'scene-outlines',
    'scene-outlines-stream',
    'quiz-grade',
    'agent-profiles',
    'chat',
    'scene-content-extra',
    '',
  ]) {
    const carried = studyLoopThinkingContext(thinking, source, true);
    assert.equal(carried, thinking);
    const original = request();
    assert.equal(applyStudyLoopThinking(official, original, carried, true), original);
  }
  assert.equal(studyLoopThinkingContext(thinking, 'scene-content', false), thinking);
  const original = request();
  assert.equal(applyStudyLoopThinking(official, original, context(), false), original);
  assert.equal(applyStudyLoopThinking(official, original, undefined, true), original);
});

test('third party gateways, URL lookalikes and different model IDs remain byte identical', () => {
  const original = request();
  for (const url of [
    'https://gateway.example/v1/chat/completions',
    'http://api.minimax.cn/v1/chat/completions',
    'https://api.minimax.cn.example/v1/chat/completions',
    'https://api.minimax.cn:8443/v1/chat/completions',
    'https://user@api.minimax.cn/v1/chat/completions',
    official + '?proxy=true',
    official + '#fragment',
    'https://api.minimax.cn/anthropic/v1/messages',
    'https://api.minimax.cn/v1/responses',
    'not a URL',
  ])
    assert.equal(applyStudyLoopThinking(url, original, context(), true), original);
  for (const model of ['MiniMax-M2.7', 'minimax-m3', 'MiniMax-M3-fast', 'gpt-5', '12345']) {
    const changed = { ...original, body: JSON.stringify({ ...JSON.parse(original.body), model }) };
    assert.equal(applyStudyLoopThinking(official, changed, context(), true), changed);
  }
});

test('malformed and non-POST requests are not repaired or changed', () => {
  for (const original of [
    undefined,
    { method: 'GET', body: request().body },
    { method: 'POST', body: '{invalid' },
    { method: 'POST', body: 'null' },
    { method: 'POST', body: '[]' },
    { method: 'POST', body: {} },
  ]) {
    assert.equal(applyStudyLoopThinking(official, original, context(), true), original);
  }
});

test('concurrent generation and grading contexts cannot change each other', async () => {
  const local = new AsyncLocalStorage();
  const results = await Promise.all(
    ['scene-content', 'quiz-grade', 'scene-actions'].map((source) =>
      local.run(context(source), async () => {
        await new Promise((resolve) => setTimeout(resolve, source === 'quiz-grade' ? 2 : 5));
        return JSON.parse(applyStudyLoopThinking(official, request(), local.getStore(), true).body)
          .thinking.type;
      }),
    ),
  );
  assert.deepEqual(results, ['disabled', 'adaptive', 'disabled']);
  assert.equal(local.getStore(), undefined);
});

test('provider patch matches the pinned archive and refuses missing, duplicate or repeated anchors', async () => {
  const vendor = new URL('../vendor/openmaic/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', vendor), 'utf8'));
  const entries = readSourceArchive(
    await readFile(new URL(manifest.archive, vendor)),
    manifest.sha256,
  );
  const entry = entries.find((item) => item.path === 'lib/ai/providers.ts');
  assert.ok(entry);
  const source = entry.data.toString();
  const patched = patchOpenMAICProvider(source);
  assert.equal((patched.match(/init = applyStudyLoopThinking\(/g) || []).length, 1);
  assert.ok(
    patched.indexOf('init = applyStudyLoopThinking(') <
      patched.indexOf('const response = useStreamingChatCompat'),
  );
  assert.throws(() => patchOpenMAICProvider(patched), /already been applied/);
  assert.throws(
    () =>
      patchOpenMAICProvider(source.replace("import { normalizeAzureBaseUrl } from './azure';", '')),
    /no longer matches/,
  );
  assert.throws(
    () => patchOpenMAICProvider(source + '\n          const response = useStreamingChatCompat\n'),
    /no longer matches/,
  );
});

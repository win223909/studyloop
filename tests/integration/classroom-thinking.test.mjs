import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  applyStudyLoopThinking,
  studyLoopThinkingContext,
} from '../../integrations/openmaic/overlay/lib/ai/studyloop-thinking.ts';

// Use the installed classroom SDK. The fetch implementation is synthetic and
// never opens a connection, including when the request URL is an official host.
const runtimeRequire = createRequire(
  new URL('../../.runtime/openmaic/package.json', import.meta.url),
);
const { createOpenAI } = runtimeRequire('@ai-sdk/openai');
const { generateText } = runtimeRequire('ai');

test('classroom SDK preserves max_tokens and applies only the scoped M3 wire override', async () => {
  const local = new AsyncLocalStorage();
  const cases = [
    { source: 'scene-content', host: 'api.minimax.cn', model: 'MiniMax-M3', disabled: true },
    { source: 'scene-actions', host: 'api.minimax.io', model: 'MiniMax-M3', disabled: true },
    { source: 'quiz-grade', host: 'api.minimax.cn', model: 'MiniMax-M3', disabled: false },
    { source: 'scene-content', host: 'gateway.example', model: 'MiniMax-M3', disabled: false },
    { source: 'scene-content', host: 'api.minimax.cn', model: 'MiniMax-M2.7', disabled: false },
  ];
  await Promise.all(
    cases.map(async (fixture) => {
      let sent;
      const provider = createOpenAI({
        apiKey: 'fixture-only',
        baseURL: `https://${fixture.host}/v1`,
        fetch: async (input, init) => {
          const adapted = applyStudyLoopThinking(input, init, local.getStore(), true);
          sent = JSON.parse(adapted.body);
          return Response.json({
            id: 'fixture-completion',
            object: 'chat.completion',
            created: 1,
            model: fixture.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"elements":[]}' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
              completion_tokens_details: { reasoning_tokens: 0 },
            },
          });
        },
      });
      const result = await local.run(
        studyLoopThinkingContext(undefined, fixture.source, true),
        () =>
          generateText({
            model: provider.chat(fixture.model),
            prompt: 'Synthetic classroom fixture',
            maxOutputTokens: 16384,
            maxRetries: 0,
          }),
      );
      assert.equal(sent.max_tokens, 16384);
      assert.deepEqual(sent.thinking, fixture.disabled ? { type: 'disabled' } : undefined);
      assert.equal(result.finishReason, 'stop');
      assert.equal(result.text, '{"elements":[]}');
      assert.equal(result.usage.outputTokenDetails.reasoningTokens, 0);
    }),
  );
});

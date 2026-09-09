import test from 'node:test';
import assert from 'node:assert/strict';
import { CoreError, testProvider } from '../server/core/providers.js';
import { createApiError, formatApiError, isModelConfigurationError } from '../src/api-errors.js';

const env = {
  LLM_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://api.minimax.cn/v1',
  LLM_MODEL: 'MiniMax-M3',
  LLM_API_KEY: 'synthetic-provider-rejection-key',
};

async function rejectedProbe(upstreamError, status = 422) {
  let calls = 0;
  const events = [];
  let failure;
  await assert.rejects(
    () =>
      testProvider({
        env,
        onDiagnostic: (event) => events.push(event),
        fetch: async () => {
          calls += 1;
          return new Response(JSON.stringify({ error: upstreamError }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }),
    (error) => {
      assert.ok(error instanceof CoreError);
      failure = error;
      return true;
    },
  );
  assert.equal(calls, 1, 'provider rejections must not enter the JSON-format retry loop');
  assert.equal(failure.attempts, 1);
  assert.equal(failure.phase, 'outline');
  assert.equal(events.at(-1).event, 'failed');
  assert.equal(events.at(-1).code, failure.code);
  return { failure, events };
}

test('MiniMax HTTP 422 input content rejection is not a parameter configuration error', async () => {
  const { failure } = await rejectedProbe({
    type: 'unprocessable_entity_error',
    message: 'input new_sensitive (1026)',
    http_code: '422',
  });
  assert.equal(failure.code, 'provider_content_filter');
  assert.equal(isModelConfigurationError(failure), false);
});

test('MiniMax output content rejection also stops without retrying the rejected request', async () => {
  const { failure } = await rejectedProbe({
    type: 'unprocessable_entity_error',
    message: 'output new_sensitive (1027)',
    http_code: '422',
  });
  assert.equal(failure.code, 'provider_content_filter');
});

test('genuine MiniMax invalid parameters remain parameter errors', async () => {
  const { failure } = await rejectedProbe(
    {
      type: 'bad_request_error',
      message: 'invalid params, unsupported parameter temperature (2013)',
    },
    400,
  );
  assert.equal(failure.code, 'provider_request');
  assert.equal(isModelConfigurationError(failure), true);
});

test('ordinary 4xx error numbers are not interpreted as content-rejection business codes', async () => {
  for (const [status, message] of [
    [400, 'invalid params, max_tokens must be greater than 1026 (2013)'],
    [422, 'invalid request parameter (1027)'],
    [422, 'request_id: 1026; invalid input parameter'],
    [400, 'output limit 1027 is unsupported'],
    [422, 'input new_sensitive (10260)'],
  ]) {
    const { failure } = await rejectedProbe(
      { type: 'unprocessable_entity_error', message },
      status,
    );
    assert.equal(failure.code, 'provider_request', message);
  }
});

test('content-rejection details and credentials stay out of public errors and diagnostics', async () => {
  const privateDetail = 'private-source-excerpt-not-for-the-browser';
  const message = `input new_sensitive (1026) ${privateDetail} ${env.LLM_API_KEY}`;
  const { failure, events } = await rejectedProbe({
    type: 'unprocessable_entity_error',
    message,
    http_code: '422',
  });
  assert.equal(failure.code, 'provider_content_filter');
  const clientError = createApiError({ code: failure.code, error: failure.publicMessage }, 502);
  const exposed = [
    JSON.stringify(failure),
    failure.message,
    failure.stack,
    JSON.stringify(events),
    JSON.stringify(clientError),
    formatApiError(clientError, 'zh'),
    formatApiError(clientError, 'en'),
  ].join('\n');
  for (const value of [message, privateDetail, env.LLM_API_KEY, 'new_sensitive', '1026'])
    assert.ok(!exposed.includes(value), `must not expose ${value}`);
  assert.equal(isModelConfigurationError(clientError), false);
});

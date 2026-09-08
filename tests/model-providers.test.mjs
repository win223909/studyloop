import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_PROVIDERS, PROVIDER_GROUPS, detectProvider } from '../src/model-providers.js';

test('saved endpoint aliases are identified without rewriting configuration or changing protocols', () => {
  const values = Object.freeze({
    LLM_PROVIDER: 'openai-compatible',
    LLM_BASE_URL: ' https://api.deepseek.com/v1/// ',
    LLM_MODEL: 'saved-model',
    LLM_TOKEN_PARAMETER: 'max_tokens',
  });
  const before = { ...values };
  assert.equal(detectProvider(values), 'deepseek');
  assert.deepEqual(values, before);
  assert.equal(detectProvider({ ...values, LLM_PROVIDER: 'anthropic' }), 'custom');
  assert.equal(detectProvider({ LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: '' }), 'custom');
});

test('Azure resource detection requires the official HTTPS hostname suffix and v1 resource path', () => {
  const detect = (base) =>
    detectProvider({ LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: base });
  for (const base of [
    'https://studyloop-resource.openai.azure.com/openai/v1',
    'https://studyloop-resource.services.ai.azure.com/openai/v1/',
  ]) {
    assert.equal(detect(base), 'azure-openai');
  }
  for (const base of [
    'https://studyloop-resource.openai.azure.com.attacker.example/openai/v1',
    'https://notopenai.azure.com/openai/v1',
    'https://user:password@studyloop-resource.openai.azure.com/openai/v1',
    'https://studyloop-resource.openai.azure.com/openai/v1?api-version=old',
    'https://studyloop-resource.openai.azure.com/openai/v1#fragment',
    'https://studyloop-resource.openai.azure.com/openai/v1/chat/completions',
    'http://studyloop-resource.openai.azure.com/openai/v1',
    'incomplete-url',
  ]) {
    assert.equal(detect(base), 'custom');
  }
});

test('selectable presets have safe API roots, visible groups and explicit handling of resource templates', () => {
  const groups = new Set(PROVIDER_GROUPS.map((group) => group.id));
  assert.equal(new Set(MODEL_PROVIDERS.map((item) => item.id)).size, MODEL_PROVIDERS.length);
  for (const item of MODEL_PROVIDERS.filter((item) => item.id !== 'custom')) {
    assert.ok(groups.has(item.group), `${item.id} must appear in a selectable group`);
    assert.ok(['openai-compatible', 'anthropic', 'gemini'].includes(item.protocol));
    if (!item.base) {
      assert.equal(item.requiresBase, true, `${item.id} must require a resource address`);
      continue;
    }
    const url = new URL(item.base);
    assert.ok(['https:', 'http:'].includes(url.protocol));
    assert.equal(url.username + url.password + url.search + url.hash, '');
    assert.doesNotMatch(url.pathname, /\/(chat\/completions|messages|generateContent)\/?$/);
    if (item.group !== 'local') {
      assert.equal(url.protocol, 'https:', `${item.id} sends credentials only over HTTPS`);
      assert.notEqual(item.keyless, true, `${item.id} must not enable keyless access`);
    }
  }
});

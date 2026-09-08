import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError, formatApiError, isModelConfigurationError } from '../src/api-errors.js';

test('model errors retain machine codes and show localized corrective action without provider text', () => {
  for (const result of [
    { code: 'provider_model', error: 'raw-provider-body-with-private-content' },
    { error: { code: 'provider_model', message: 'raw-provider-body-with-private-content' } },
  ]) {
    const error = createApiError(result, 502);
    assert.equal(error.code, 'provider_model');
    assert.equal(error.status, 502);
    assert.equal(isModelConfigurationError(error), true);
    assert.match(formatApiError(error, 'zh'), /模型与设置.*主模型 ID/);
    assert.match(formatApiError(error, 'en'), /Primary model ID.*Models & settings/);
    assert.match(formatApiError(error, 'zh'), /Group ID/);
    assert.doesNotMatch(error.message, /raw-provider/);
  }
});

test('known and future provider failures never display upstream bodies in either language', () => {
  for (const code of [
    'provider_request',
    'provider_endpoint',
    'provider_quota',
    'provider_auth',
    'provider_rate_limit',
    'provider_timeout',
    'provider_connection',
    'provider_response',
    'provider_http',
    'provider_unavailable',
    'provider_context_limit',
    'provider_content_filter',
    'PROVIDER_FUTURE_CODE',
  ]) {
    const error = createApiError({ code, error: 'raw-provider-body' }, 400);
    for (const lang of ['zh', 'en']) {
      const message = formatApiError(error, lang);
      assert.equal(typeof message, 'string');
      assert.ok(message.length > 20);
      assert.doesNotMatch(message, /raw-provider-body|HTTP 400/);
      assert.equal(/[\u4e00-\u9fff]/.test(message), lang === 'zh');
    }
  }
  assert.equal(formatApiError(new Error('Local input validation'), 'en'), 'Local input validation');
  assert.equal(
    formatApiError(createApiError({ error: 'Reload settings.' }, 409), 'en'),
    'Reload settings.',
  );
});

test('insufficient sources suggest better material without blaming model configuration', () => {
  for (const code of ['sources_insufficient', 'sources_missing']) {
    const error = createApiError({ code, error: 'English server message' }, 422);
    assert.match(formatApiError(error, 'zh'), /关键词.*上传/);
    assert.match(formatApiError(error, 'en'), /keywords.*upload/);
    assert.equal(isModelConfigurationError(error), false);
  }
});

test('course validation failures explain unsaved results without blaming model configuration', () => {
  for (const code of ['bank_invalid', 'plan_invalid', 'review_invalid', 'review_rejected']) {
    const error = createApiError({ code, error: 'Untranslated server validation detail' }, 422);
    const zh = formatApiError(error, 'zh');
    const en = formatApiError(error, 'en');
    assert.match(zh, /未保存/);
    assert.match(en, /not saved/);
    assert.match(zh, /重试|重新生成/);
    assert.match(en, /Retry|again/);
    assert.doesNotMatch(zh + en, /Untranslated|API 密钥|API key|模型配置/);
    assert.equal(isModelConfigurationError(error), false);
  }
});

test('known generation and search codes remain actionable above the generic HTTP 5xx fallback', () => {
  const truncated = createApiError({ code: 'model_truncated', error: 'raw-upstream-details' }, 503);
  assert.match(formatApiError(truncated, 'zh'), /提高最大输出 Token.*减少题目数量/);
  assert.match(formatApiError(truncated, 'en'), /Increase Maximum output tokens.*fewer questions/);
  const contextLimit = createApiError({ code: 'provider_context_limit' }, 503);
  assert.match(formatApiError(contextLimit, 'zh'), /减少资料长度.*调低最大输出 Token/);
  assert.match(formatApiError(contextLimit, 'en'), /shorter material.*lower Maximum output tokens/);
  const rejected = createApiError({ code: 'teaching_review_rejected' }, 502);
  assert.match(formatApiError(rejected, 'zh'), /未保存.*重试/);
  assert.match(formatApiError(rejected, 'en'), /not saved.*Retry/);
  for (const code of [
    'model_format',
    'model_truncated',
    'teaching_review_rejected',
    'search_auth',
    'search_rate_limit',
    'search_http',
    'search_timeout',
    'search_connection',
    'search_response',
  ]) {
    for (const lang of ['zh', 'en']) {
      const message = formatApiError(
        createApiError({ code, error: 'raw-upstream-details' }, 503),
        lang,
      );
      assert.doesNotMatch(message, /raw-upstream-details/);
      assert.notEqual(
        message,
        formatApiError(
          createApiError({ code: 'unknown', error: 'raw-upstream-details' }, 503),
          lang,
        ),
      );
      assert.equal(/[\u4e00-\u9fff]/.test(message), lang === 'zh');
    }
  }
});

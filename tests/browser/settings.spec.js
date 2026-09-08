import { test, expect } from '@playwright/test';

const INITIAL_VALUES = {
  LLM_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://api.openai.com/v1',
  LLM_MODEL: '',
  LLM_REVIEW_MODEL: '',
  LLM_ALLOW_KEYLESS: 'false',
  LLM_TIMEOUT_MS: '90000',
  LLM_MAX_OUTPUT_TOKENS: '8192',
  LLM_JSON_MODE: 'false',
  LLM_TOKEN_PARAMETER: 'auto',
  OPENMAIC_URL: '',
  DAILY_GENERATION_LIMIT: '20',
  MAX_CONCURRENT_GENERATIONS: '2',
};
const TEST_KEY = 'test-only-key-not-a-real-secret';

// This fixture intercepts every settings request. Its values and secret-presence
// flags are private to one page; nothing is written to the shared E2E server.
async function mockSettings(page, { values = {}, secrets = {}, reason } = {}) {
  const state = {
    values: { ...INITIAL_VALUES, ...values },
    secrets: { LLM_API_KEY: false, BRAVE_SEARCH_API_KEY: false, ...secrets },
    revision: 1,
  };
  const calls = [];
  const snapshot = () => ({
    editable: true,
    values: { ...state.values },
    secrets: { ...state.secrets },
    revision: `test-revision-${state.revision}`,
    csrfToken: 'test-settings-csrf-token',
  });
  await page.route(/\/api\/settings(?:\/test)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const body = method === 'POST' ? request.postDataJSON() : null;
    calls.push({ method, pathname, body, headers: request.headers() });
    const respond = (status, data) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify(data),
      });
    if (method === 'GET') {
      return respond(200, reason ? { editable: false, reason } : snapshot());
    }
    if (reason) return respond(403, { error: 'Local configuration access is unavailable.' });
    if (request.headers()['x-settings-token'] !== 'test-settings-csrf-token') {
      return respond(403, { error: 'Invalid settings token.' });
    }
    if (body?.revision !== snapshot().revision) {
      return respond(409, { error: 'Configuration changed. Reload settings before saving.' });
    }
    if (pathname === '/api/settings/test') {
      // Test requests never mutate the saved snapshot, even if they contain drafts.
      return respond(200, {
        ok: true,
        checkedAt: '2026-09-07T00:00:00.000Z',
        models: [...new Set([body.values.LLM_MODEL, body.values.LLM_REVIEW_MODEL].filter(Boolean))],
      });
    }
    state.values = { ...state.values, ...body.values };
    for (const key of ['LLM_API_KEY', 'BRAVE_SEARCH_API_KEY']) {
      if (body.secrets?.[key] === null) state.secrets[key] = false;
      else if (typeof body.secrets?.[key] === 'string' && body.secrets[key])
        state.secrets[key] = true;
    }
    state.revision += 1;
    return respond(200, {
      ...snapshot(),
      config: {
        version: 'browser-test',
        generationAvailable: Boolean(
          state.values.LLM_MODEL &&
          (state.secrets.LLM_API_KEY || state.values.LLM_ALLOW_KEYLESS === 'true'),
        ),
        searchAvailable: true,
        openmaicAvailable: Boolean(state.values.OPENMAIC_URL),
        accessRequired: false,
      },
    });
  });
  return {
    calls,
    snapshot,
    saves: () =>
      calls.filter((call) => call.method === 'POST' && call.pathname === '/api/settings'),
    tests: () =>
      calls.filter((call) => call.method === 'POST' && call.pathname === '/api/settings/test'),
    changeElsewhere: (changes) => {
      state.values = { ...state.values, ...changes };
      state.revision += 1;
    },
  };
}

async function openSettings(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '模型与设置', exact: true }).click();
  await expect(page.locator('.model-settings')).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test('model settings test drafts without saving, mask keys and retain saved configuration after reload', async ({
  page,
}) => {
  const mock = await mockSettings(page);
  await openSettings(page);
  await expect(page.getByLabel('模型服务商', { exact: true })).toHaveValue('openai');
  await expect(page.getByLabel('API 根地址', { exact: true })).toHaveValue(
    'https://api.openai.com/v1',
  );
  await expect(page.getByLabel('主模型 ID', { exact: true })).toBeVisible();

  await page.getByLabel('模型服务商', { exact: true }).selectOption('deepseek');
  await expect(page.getByLabel('API 根地址', { exact: true })).toHaveValue(
    'https://api.deepseek.com',
  );
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-primary-model');
  const keyInput = page.getByLabel('模型 API 密钥', { exact: true });
  await keyInput.fill(TEST_KEY);
  await expect(keyInput).toHaveAttribute('type', 'password');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(TEST_KEY);
  await expect(page.locator('.ms-dirty-state')).toContainText('有未保存的修改');

  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('当前修改尚未保存');
  expect(mock.tests()).toHaveLength(1);
  expect(mock.saves()).toHaveLength(0);
  expect(mock.tests()[0].body.secrets.LLM_API_KEY).toBe(TEST_KEY);
  expect(mock.tests()[0].headers['x-settings-token']).toBe('test-settings-csrf-token');
  expect(mock.snapshot().values.LLM_MODEL).toBe('');
  await expect(keyInput).toHaveValue(TEST_KEY);

  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('配置已保存');
  expect(mock.saves()).toHaveLength(1);
  expect(mock.snapshot().secrets.LLM_API_KEY).toBe(true);
  await expect(keyInput).toHaveValue('');
  await expect(page.locator('.ms-secret-field').first().locator('.ms-secret-status')).toHaveText(
    '已保存',
  );
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(TEST_KEY);

  await page.reload();
  await page.getByRole('button', { name: '模型与设置', exact: true }).click();
  await expect(page.getByLabel('主模型 ID', { exact: true })).toHaveValue('test-primary-model');
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toHaveAttribute(
    'placeholder',
    '已有密钥，留空保留',
  );
  await page.getByLabel('每日生成请求上限', { exact: true }).fill('21');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('配置已保存');
  expect(mock.saves()).toHaveLength(2);
  expect(mock.saves()[1].body.secrets).not.toHaveProperty('LLM_API_KEY');
  expect(mock.snapshot().secrets.LLM_API_KEY).toBe(true);
  expect(mock.snapshot().values.DAILY_GENERATION_LIMIT).toBe('21');

  await page.locator('.ms-advanced > summary').click();
  await expect(page.getByLabel('接口协议', { exact: true })).toBeVisible();
  for (const width of [607, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel('主模型 ID', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeVisible();
  }
});

test('changing a provider requires an explicit key decision and revision conflicts reload the latest snapshot', async ({
  page,
}) => {
  const mock = await mockSettings(page, {
    values: { LLM_MODEL: 'saved-old-model' },
    secrets: { LLM_API_KEY: true },
  });
  await openSettings(page);
  await page.getByLabel('模型服务商', { exact: true }).selectOption('anthropic');
  await expect(page.getByLabel('API 根地址', { exact: true })).toHaveValue(
    'https://api.anthropic.com/v1',
  );
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-claude-model');
  await expect(page.locator('.ms-inline-note')).toContainText('原密钥仍保存在服务器');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-field-error')).toContainText('更换服务商或地址后，请填写新密钥');
  expect(mock.saves()).toHaveLength(0);

  const clearKey = page
    .locator('.ms-secret-field')
    .first()
    .getByRole('checkbox', { name: /清除已保存密钥/ });
  await clearKey.check();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toBeDisabled();
  await clearKey.uncheck();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-field-error')).toContainText('更换服务商或地址后，请填写新密钥');
  expect(mock.saves()).toHaveLength(0);

  await clearKey.check();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('配置已保存');
  expect(mock.saves()).toHaveLength(1);
  expect(mock.saves()[0].body.secrets.LLM_API_KEY).toBeNull();
  expect(mock.snapshot().values.LLM_PROVIDER).toBe('anthropic');
  expect(mock.snapshot().secrets.LLM_API_KEY).toBe(false);
  await expect(page.locator('.ms-secret-field').first().locator('.ms-secret-status')).toHaveText(
    '未保存',
  );

  mock.changeElsewhere({ LLM_MODEL: 'changed-in-another-window' });
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-local-draft');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.locator('.ms-error')).toContainText('配置已在其他位置变更');
  await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重新载入已保存配置', exact: true }).click();
  await expect(page.getByLabel('主模型 ID', { exact: true })).toHaveValue(
    'changed-in-another-window',
  );
  await expect(page.locator('.ms-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeEnabled();
});

test('remote settings explain local management without exposing a configuration form', async ({
  page,
}) => {
  const mock = await mockSettings(page, { reason: 'local-only' });
  await openSettings(page);
  await expect(page.locator('.ms-unavailable')).toContainText('请在部署设备本机修改配置');
  await expect(page.locator('.ms-unavailable')).toContainText('localhost');
  await expect(page.locator('.model-settings form')).toHaveCount(0);
  await expect(page.locator('.model-settings input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '测试模型连接', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存配置', exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(mock.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

test('provider search preserves the current configuration and drafts while MiniMax region changes reset model credentials', async ({
  page,
}) => {
  const mock = await mockSettings(page, {
    values: { LLM_MODEL: 'saved-primary-model', LLM_REVIEW_MODEL: 'saved-review-model' },
  });
  await openSettings(page);
  await page.locator('.ms-advanced > summary').click();
  const provider = page.getByLabel('模型服务商', { exact: true });
  const search = page.getByLabel('搜索服务商或地区', { exact: true });
  const base = page.getByLabel('API 根地址', { exact: true });
  const primaryModel = page.getByLabel('主模型 ID', { exact: true });
  const reviewModel = page.getByLabel('复核模型 ID', { exact: true });
  const keyInput = page.getByLabel('模型 API 密钥', { exact: true });
  const allOptions = await provider.locator('option').count();
  await keyInput.fill(TEST_KEY);

  await search.fill('MiniMax');
  await expect(provider.locator('option[value="minimax-cn"]')).toHaveCount(1);
  await expect(provider.locator('option[value="minimax-intl"]')).toHaveCount(1);
  await expect(provider.locator('option[value="anthropic"]')).toHaveCount(0);
  expect(await provider.locator('option').count()).toBeLessThan(allOptions);
  await expect(provider).toHaveValue('openai');
  await expect(provider.locator('optgroup[label="当前选择"] option')).toHaveAttribute(
    'value',
    'openai',
  );
  await expect(base).toHaveValue('https://api.openai.com/v1');
  await expect(primaryModel).toHaveValue('saved-primary-model');
  await expect(reviewModel).toHaveValue('saved-review-model');
  await expect(keyInput).toHaveValue(TEST_KEY);

  await search.fill('');
  await expect(provider.locator('option')).toHaveCount(allOptions);
  await expect(provider.locator('optgroup[label="当前选择"]')).toHaveCount(0);
  await expect(provider).toHaveValue('openai');
  await expect(base).toHaveValue('https://api.openai.com/v1');
  await expect(primaryModel).toHaveValue('saved-primary-model');
  await expect(reviewModel).toHaveValue('saved-review-model');
  await expect(keyInput).toHaveValue(TEST_KEY);

  await provider.selectOption('minimax-cn');
  await expect(base).toHaveValue('https://api.minimax.cn/v1');
  await expect(primaryModel).toHaveAttribute('list', /-LLM_MODEL-suggestions$/);
  expect(
    await page
      .locator('datalist option')
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5']);
  await expect(primaryModel).toHaveValue('');
  await expect(reviewModel).toHaveValue('');
  await expect(keyInput).toHaveValue('');
  await primaryModel.fill('test-minimax-primary');
  await reviewModel.fill('test-minimax-review');
  await keyInput.fill(TEST_KEY);

  await provider.selectOption('minimax-intl');
  await expect(base).toHaveValue('https://api.minimax.io/v1');
  expect(
    await page
      .locator('datalist option')
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5']);
  await expect(primaryModel).toHaveValue('');
  await expect(reviewModel).toHaveValue('');
  await expect(keyInput).toHaveValue('');
  expect(mock.saves()).toHaveLength(0);
  expect(mock.tests()).toHaveLength(0);
  expect(mock.snapshot().values.LLM_MODEL).toBe('saved-primary-model');
});

test('local presets enable keyless requests, cloud presets require a key and provider groups switch languages', async ({
  page,
}) => {
  const mock = await mockSettings(page);
  await openSettings(page);
  const provider = page.getByLabel('模型服务商', { exact: true });
  const search = page.getByLabel('搜索服务商或地区', { exact: true });
  const groupLabels = (select) =>
    select.locator('optgroup').evaluateAll((groups) => groups.map((group) => group.label));
  expect(await groupLabels(provider)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/国内|中国/),
      expect.stringMatching(/国际|海外/),
      expect.stringMatching(/本地/),
    ]),
  );

  await page.locator('.ms-advanced > summary').click();
  const keyless = page.getByRole('checkbox', { name: /允许不使用 API 密钥/ });
  await expect(keyless).not.toBeChecked();
  await provider.selectOption('lmstudio');
  await expect(keyless).toBeChecked();
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-local-model');
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('当前修改尚未保存');
  expect(mock.tests()).toHaveLength(1);
  expect(mock.tests()[0].body.values.LLM_ALLOW_KEYLESS).toBe('true');
  expect(mock.tests()[0].body.secrets).not.toHaveProperty('LLM_API_KEY');

  await provider.selectOption('openai');
  await expect(keyless).not.toBeChecked();
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-cloud-model');
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-field-error')).toContainText('请填写 API 密钥');
  expect(mock.tests()).toHaveLength(1);

  await search.fill('no-provider-matches-123456');
  await expect(page.getByText('没有找到匹配项，可清空搜索或选择自定义服务。')).toBeVisible();
  await expect(provider).toHaveValue('openai');
  await expect(provider.locator('option[value="custom"]')).toHaveText('自定义服务');
  await provider.selectOption('custom');
  await expect(provider).toHaveValue('custom');

  await search.fill('');
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  const englishProvider = page.getByLabel('Model provider', { exact: true });
  await expect(englishProvider).toHaveValue('custom');
  expect(await groupLabels(englishProvider)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/China|Domestic/),
      expect.stringMatching(/International|Global/),
      expect.stringMatching(/Local/),
    ]),
  );
  await page
    .getByLabel('Search providers or regions', { exact: true })
    .fill('no-provider-matches-123456');
  await expect(
    page.getByText('No matches. Clear the search or choose a custom service.'),
  ).toBeVisible();
  await expect(englishProvider.locator('option')).toHaveCount(1);
  await expect(englishProvider.locator('option[value="custom"]')).toHaveText('Custom service');
  expect(mock.saves()).toHaveLength(0);
});

test('an Azure resource address stays required after editing and clearing it', async ({ page }) => {
  const mock = await mockSettings(page);
  await openSettings(page);
  const provider = page.getByLabel('模型服务商', { exact: true });
  const base = page.getByLabel('API 根地址', { exact: true });
  const keyInput = page.getByLabel('模型 API 密钥', { exact: true });
  const azureBase = 'https://test-studyloop-resource.openai.azure.com/openai/v1';
  await provider.selectOption('azure-openai');
  await expect(base).toHaveValue('');
  await page.getByLabel('主模型 ID', { exact: true }).fill('test-azure-deployment');
  await keyInput.fill(TEST_KEY);

  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(base).toHaveAttribute('aria-invalid', 'true');
  await expect(base).toBeFocused();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(base).toHaveAttribute('aria-invalid', 'true');
  expect(mock.tests()).toHaveLength(0);
  expect(mock.saves()).toHaveLength(0);

  await base.fill(azureBase);
  await expect(provider).toHaveValue('azure-openai');
  await keyInput.fill(TEST_KEY);
  await base.fill('');
  await expect(keyInput).toHaveValue('');
  // Refilling a resource key after clearing the URL must never send it to a default provider.
  await keyInput.fill(TEST_KEY);
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(base).toHaveAttribute('aria-invalid', 'true');
  await expect(base).toBeFocused();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(base).toHaveAttribute('aria-invalid', 'true');
  expect(mock.tests()).toHaveLength(0);
  expect(mock.saves()).toHaveLength(0);

  await base.fill(azureBase);
  await keyInput.fill(TEST_KEY);
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-success')).toContainText('当前修改尚未保存');
  expect(mock.tests()).toHaveLength(1);
  expect(mock.tests()[0].body.values.LLM_BASE_URL).toBe(azureBase);
  expect(mock.saves()).toHaveLength(0);
});

test('MiniMax rejects account numbers and shows localized model errors without exposing provider details', async ({
  page,
}) => {
  const mock = await mockSettings(page, {
    values: { LLM_BASE_URL: 'https://api.minimax.cn/v1', LLM_MODEL: 'MiniMax-M3' },
    secrets: { LLM_API_KEY: true },
  });
  const testBodies = [];
  await page.route('**/api/settings/test', async (route) => {
    testBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 502,
      json: { code: 'provider_model', error: 'raw-provider-body-do-not-display' },
    });
  });
  await openSettings(page);
  const model = page.getByLabel('主模型 ID', { exact: true });
  const key = page.getByLabel('模型 API 密钥', { exact: true });
  await expect(page.locator('.ms-field-hint').filter({ hasText: '不是 Group ID' })).toBeVisible();
  await model.fill('1234567890');
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-field-error')).toContainText('不能填写数字账户编号');
  expect(testBodies).toHaveLength(0);
  await model.fill('custom-minimax-model-not-in-suggestions');
  await page.getByRole('button', { name: '测试模型连接', exact: true }).click();
  await expect(page.locator('.ms-error')).toContainText('核对主模型 ID');
  await expect(page.locator('.ms-error')).toContainText('不要填写账户编号或 Group ID');
  await expect(page.locator('body')).not.toContainText('raw-provider-body-do-not-display');
  await expect(model).toHaveValue('custom-minimax-model-not-in-suggestions');
  await expect(key).toHaveValue('');
  expect(testBodies).toHaveLength(1);
  expect(testBodies[0].secrets).toEqual({});
  expect(mock.saves()).toHaveLength(0);
  expect(mock.snapshot().values.LLM_MODEL).toBe('MiniMax-M3');

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('.ms-error')).toContainText('Check the Primary model ID');
  await expect(page.locator('.ms-error')).not.toContainText('核对主模型');
  await expectNoHorizontalOverflow(page);

  await page.getByLabel('Model provider', { exact: true }).selectOption('custom');
  await page.getByLabel('Primary model ID', { exact: true }).fill('1234567890');
  await page.getByRole('button', { name: 'Test model connection', exact: true }).click();
  await expect.poll(() => testBodies.length).toBe(2);
  await expect(page.locator('.ms-field-error')).toHaveCount(0);
});

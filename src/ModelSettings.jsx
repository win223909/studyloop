import { useEffect, useId, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FlaskConical,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import './model-settings.css';
import {
  MODEL_PROVIDERS as PRESETS,
  PROVIDER_GROUPS,
  detectProvider,
  searchProviders,
} from './model-providers.js';

const GUIDE = 'https://github.com/win223909/studyloop/blob/main/docs/configuration.md';
const DEFAULT_VALUES = {
  LLM_PROVIDER: 'openai-compatible',
  LLM_BASE_URL: 'https://api.openai.com/v1',
  LLM_MODEL: '',
  LLM_REVIEW_MODEL: '',
  LLM_ALLOW_KEYLESS: 'false',
  LLM_TIMEOUT_MS: '90000',
  LLM_MAX_OUTPUT_TOKENS: '8192',
  LLM_JSON_MODE: 'false',
  LLM_TOKEN_PARAMETER: 'auto',
  DAILY_GENERATION_LIMIT: '20',
  MAX_CONCURRENT_GENERATIONS: '2',
};

const TEXT = {
  zh: {
    loading: '正在读取配置…',
    loadFailed: '暂时无法读取配置',
    retry: '重新读取',
    heading: '服务配置',
    intro: '配置保存在部署电脑上，已保存的密钥不会显示。',
    guide: '配置说明',
    localOnlyTitle: '请在部署设备本机修改配置',
    localOnly:
      '远程访问不开放配置表单。请在运行 StudyLoop 的设备上，通过 localhost 或 127.0.0.1 打开此页；也可以在该设备上编辑 .env。',
    disabledTitle: '此实例未开放网页配置',
    disabled: '请由部署者在服务器上编辑 .env，或按配置说明启用本机配置功能。',
    modelService: '模型服务',
    modelDescription: '选择服务商，填写你账户可用的模型 ID 和密钥。',
    provider: '模型服务商',
    searchProvider: '搜索服务商或地区',
    searchPlaceholder: '例如 MiniMax、Kimi、国内、国际…',
    providerCount: '项服务预设',
    matches: '项匹配',
    currentProvider: '当前选择',
    noProviders: '没有找到匹配项，可清空搜索或选择自定义服务。',
    regionHint: '国内版与国际版分别配置，请使用对应平台和地区的密钥。模型 ID 可自由填写。',
    providerDocs: '官方接入文档',
    requiredBase: '请填写此资源的 API 根地址。',
    base: 'API 根地址',
    baseHint: '填写 API 地址，不需要追加 /chat/completions、/messages 等请求路径。',
    model: '主模型 ID',
    modelPlaceholder: '服务商提供的模型 ID',
    modelHint: '使用你的 API 账户实际可访问的模型；聊天产品名称不一定是模型 ID。',
    apiKey: '模型 API 密钥',
    stored: '已保存',
    notStored: '未保存',
    keyPlaceholder: '输入自己的 API Key',
    keepPlaceholder: '已有密钥，留空保留',
    keyHint: '密钥只提交给本机配置接口，不会写入浏览器本地存储。',
    clearKey: '清除已保存密钥',
    clearHint: '保存后清除。取消勾选即可保留原密钥。',
    changedEndpoint:
      '服务商或地址已更换。原密钥仍保存在服务器；请填写新密钥，或明确勾选清除旧密钥后再保存或测试。',
    localHint: '本地模型需要先安装并启动。在 Docker 中，请使用容器能访问的模型服务地址。',
    advanced: '高级模型参数',
    advancedHint: '协议、复核模型、请求时限和输出格式',
    protocol: '接口协议',
    compatible: 'OpenAI 兼容 · Chat Completions',
    nativeAnthropic: 'Anthropic 原生 · Messages',
    nativeGemini: 'Gemini 原生 · generateContent',
    reviewModel: '复核模型 ID',
    reviewPlaceholder: '留空使用主模型',
    reviewHint: '与主模型共用服务商、API 地址和密钥。',
    timeout: '单次请求超时（毫秒）',
    timeoutHint: '1,000–180,000 毫秒，默认 90,000。',
    tokens: '最大输出 token 数',
    tokensHint: '1,024–20,000，默认 8,192。',
    tokenParameter: '输出长度参数',
    automatic: '自动选择',
    tokenHint: '仅 OpenAI 兼容接口使用；通常保持自动即可。',
    jsonMode: '启用 JSON 输出模式',
    jsonHint: '仅适用于支持 json_object 的 OpenAI 兼容模型。',
    keyless: '允许不使用 API 密钥',
    keylessHint: '只为明确支持免密访问的本地模型或服务启用。',
    services: '搜索与课堂',
    servicesDescription: '可选搜索服务，以及内置互动课堂。',
    brave: 'Brave Search API 密钥',
    braveHint: '留空时使用默认 Wikipedia 搜索。已保存的 Brave 密钥可在这里替换或清除。',
    openmaic: '内置 OpenMAIC 课堂',
    openmaicHint:
      '直接复用上方模型配置，无需再填写课堂地址或另一组模型密钥。完成练习后，可带着薄弱点生成课堂。',
    classroomReady: '课堂服务已就绪',
    classroomInstalled: '模块已安装，进入课堂时启动',
    classroomStarting: '课堂服务正在启动',
    classroomFailed: '课堂服务暂未就绪，请由部署者检查服务状态',
    classroomMissing: '模块尚未安装，请由部署者运行 npm run classroom:install',
    classroomMedia: '文本模型用于讲解与互动内容；图像、视频和云端语音未自动配置。',
    classroomCredit: '感谢 THU-MAIC / OpenMAIC 团队及贡献者。内置模块保留原项目署名与 MIT 许可。',
    limits: '使用额度',
    limitsDescription: '限制整个实例的生成请求，便于控制资源使用。',
    daily: '每日生成请求上限',
    dailyHint: '1–1,000 次，按 UTC 日历日计算。',
    concurrency: '同时生成的请求数',
    concurrencyHint: '1–4 个，默认 2 个。',
    limitNote:
      '一次大纲或题库请求可能包含多次模型调用；失败请求也计入额度。这是请求次数上限，实际费用限额请在服务商后台设置。',
    test: '测试模型连接',
    testing: '正在测试模型…',
    save: '保存配置',
    saving: '正在保存…',
    reload: '重新载入已保存配置',
    testHint:
      '测试会发送一次主模型请求；复核模型不同时会再测试一次，可能产生少量费用。测试不会保存配置。',
    dirty: '有未保存的修改',
    clean: '当前没有待保存的修改',
    unsavedEmpty: '模型 ID 与密钥可以留空保存，稍后再配置。',
    saved: '配置已保存。新请求会使用这些设置；保存成功不代表模型已经通过连接测试。',
    testedDraft: '模型连接测试通过。当前修改尚未保存。',
    testedSaved: '已保存配置的模型连接测试通过。',
    testedModels: '已测试模型',
    errorTitle: '配置操作未完成',
    stale: '配置已在其他位置变更，请重新载入后再修改。重新载入会舍弃当前未保存的内容。',
    newKeyRequired: '更换服务商或地址后，请填写新密钥，或勾选清除已保存密钥。',
    testModelRequired: '请先填写主模型 ID，再测试连接。',
    testKeyRequired: '请填写 API 密钥，或为支持免密的服务启用免密访问。',
    invalidNumber: '请输入范围内的整数。',
    invalidUrl: '请填写有效的 http:// 或 https:// 地址。',
    dismiss: '关闭提示',
    noSaveFromTest: '连接测试只验证模型能否响应，不保证生成内容一定通过题库质量校验。',
  },
  en: {
    loading: 'Loading configuration…',
    loadFailed: 'Configuration could not be loaded',
    retry: 'Try again',
    heading: 'Service configuration',
    intro: 'Configuration stays on this device. Saved keys are never displayed.',
    guide: 'Configuration guide',
    localOnlyTitle: 'Manage settings on the deployment device',
    localOnly:
      'Remote access does not expose the configuration form. Open this page using localhost or 127.0.0.1 on the device running StudyLoop, or edit .env on that device.',
    disabledTitle: 'Web configuration is disabled',
    disabled:
      'Ask the instance owner to edit .env on the server or enable local configuration using the setup guide.',
    modelService: 'Model service',
    modelDescription:
      'Choose a provider, then enter a model ID and key available to your API account.',
    provider: 'Model provider',
    searchProvider: 'Search providers or regions',
    searchPlaceholder: 'MiniMax, Kimi, China, international…',
    providerCount: 'service presets',
    matches: 'matches',
    currentProvider: 'Current selection',
    noProviders: 'No matches. Clear the search or choose a custom service.',
    regionHint:
      'Domestic and international services use their own regional credentials. Enter any model ID available to your account.',
    providerDocs: 'Official API documentation',
    requiredBase: 'Enter the API base URL for your resource.',
    base: 'API base URL',
    baseHint:
      'Use the API root without adding /chat/completions, /messages, or a similar request path.',
    model: 'Primary model ID',
    modelPlaceholder: 'Model ID supplied by your provider',
    modelHint:
      'Use a model your API account can access. A chat product name may not be a model ID.',
    apiKey: 'Model API key',
    stored: 'Saved',
    notStored: 'Not saved',
    keyPlaceholder: 'Enter your own API key',
    keepPlaceholder: 'A key is saved; leave blank to keep it',
    keyHint:
      'Keys are submitted only to this instance’s configuration endpoint and are not stored in browser local storage.',
    clearKey: 'Clear the saved key',
    clearHint: 'Cleared when you save. Uncheck to keep the original key.',
    changedEndpoint:
      'The provider or URL has changed. The original key remains on the server. Enter a new key, or explicitly clear the old key before saving or testing.',
    localHint:
      'Install and start your local model service first. In Docker, use an address reachable from the container.',
    advanced: 'Advanced model parameters',
    advancedHint: 'Protocol, review model, timeouts and output format',
    protocol: 'API protocol',
    compatible: 'OpenAI compatible · Chat Completions',
    nativeAnthropic: 'Native Anthropic · Messages',
    nativeGemini: 'Native Gemini · generateContent',
    reviewModel: 'Review model ID',
    reviewPlaceholder: 'Leave blank to use the primary model',
    reviewHint: 'Shares the primary model’s provider, API URL and key.',
    timeout: 'Request timeout (milliseconds)',
    timeoutHint: '1,000–180,000 ms; default 90,000.',
    tokens: 'Maximum output tokens',
    tokensHint: '1,024–20,000; default 8,192.',
    tokenParameter: 'Output token parameter',
    automatic: 'Automatic',
    tokenHint: 'Used only by the OpenAI-compatible protocol. Automatic usually works.',
    jsonMode: 'Enable JSON output mode',
    jsonHint: 'Only for OpenAI-compatible models supporting json_object.',
    keyless: 'Allow requests without an API key',
    keylessHint:
      'Enable only for a local model or service that explicitly supports keyless access.',
    services: 'Search & classroom',
    servicesDescription: 'Optional search services and the built-in interactive classroom.',
    brave: 'Brave Search API key',
    braveHint:
      'Wikipedia is the default when no key is configured. Replace or clear a saved Brave key here.',
    openmaic: 'Built-in OpenMAIC classroom',
    openmaicHint:
      'Reuses the model configuration above. No separate classroom URL or model key is needed. Generate a focused classroom after completing practice.',
    classroomReady: 'Classroom service is ready',
    classroomInstalled: 'Module installed; starts when you open a classroom',
    classroomStarting: 'Classroom service is starting',
    classroomFailed: 'Classroom service is not ready; the deployment owner should check its status',
    classroomMissing:
      'Module not installed. The deployment owner can run npm run classroom:install',
    classroomMedia:
      'The text model creates lessons and activities. Image, video and cloud voice services are not configured automatically.',
    classroomCredit:
      'Thank you to THU-MAIC / OpenMAIC and its contributors. The bundled module retains upstream attribution and the MIT license.',
    limits: 'Usage limits',
    limitsDescription: 'Control generation requests across the entire instance.',
    daily: 'Daily generation request limit',
    dailyHint: '1–1,000 requests per UTC calendar day.',
    concurrency: 'Concurrent generation requests',
    concurrencyHint: '1–4 requests; default 2.',
    limitNote:
      'An outline or question-bank request can make several model calls. Failed requests also count. This is a request cap; set spending limits in your provider dashboard.',
    test: 'Test model connection',
    testing: 'Testing models…',
    save: 'Save configuration',
    saving: 'Saving…',
    reload: 'Reload saved configuration',
    testHint:
      'Testing sends one primary-model request, plus one more if the review model differs. This may incur a small charge. Testing does not save configuration.',
    dirty: 'Unsaved changes',
    clean: 'No pending changes',
    unsavedEmpty: 'Model IDs and keys can be saved blank and configured later.',
    saved:
      'Configuration saved. New requests will use these settings. Saving does not verify a working model connection.',
    testedDraft: 'Model connection test passed. Your changes have not been saved.',
    testedSaved: 'The saved model configuration passed the connection test.',
    testedModels: 'Models tested',
    errorTitle: 'Configuration action did not finish',
    stale:
      'Settings changed elsewhere. Reload before editing again. Reloading discards the current unsaved changes.',
    newKeyRequired:
      'After changing provider or URL, enter a new key or select “Clear the saved key”.',
    testModelRequired: 'Enter a primary model ID before testing.',
    testKeyRequired: 'Enter an API key or enable keyless access for a service that supports it.',
    invalidNumber: 'Enter an integer within the allowed range.',
    invalidUrl: 'Enter a valid http:// or https:// URL.',
    dismiss: 'Dismiss message',
    noSaveFromTest:
      'A connection test checks whether models respond. It does not guarantee generated courses will pass quality checks.',
  },
};
const NUMERIC_RANGES = {
  LLM_TIMEOUT_MS: [1000, 180000],
  LLM_MAX_OUTPUT_TOKENS: [1024, 20000],
  DAILY_GENERATION_LIMIT: [1, 1000],
  MAX_CONCURRENT_GENERATIONS: [1, 4],
};

function normalizeValues(values = {}) {
  const normalized = Object.fromEntries(
    Object.entries(DEFAULT_VALUES).map(([key, fallback]) => [key, String(values[key] ?? fallback)]),
  );
  if (!normalized.LLM_BASE_URL.trim()) {
    const defaults = { 'openai-compatible': 'openai', anthropic: 'anthropic', gemini: 'gemini' };
    normalized.LLM_BASE_URL =
      PRESETS.find((item) => item.id === defaults[normalized.LLM_PROVIDER])?.base || '';
  }
  return normalized;
}
async function requestSettings(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!response.ok) {
    const error = new Error(
      typeof result.error === 'string' ? result.error : `HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

export default function ModelSettings({ lang = 'zh', onSaved, config }) {
  const t = TEXT[lang === 'en' ? 'en' : 'zh'];
  const uid = useId().replace(/:/g, '');
  const [snapshot, setSnapshot] = useState(null);
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [preset, setPreset] = useState('openai');
  const [providerSearch, setProviderSearch] = useState('');
  const [draftKeys, setDraftKeys] = useState({ LLM_API_KEY: '', BRAVE_SEARCH_API_KEY: '' });
  const [clearKeys, setClearKeys] = useState({ LLM_API_KEY: false, BRAVE_SEARCH_API_KEY: false });
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [savedMessage, setSavedMessage] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const adoptSnapshot = (next) => {
    setSnapshot(next);
    if (next.editable) {
      const normalized = normalizeValues(next.values);
      setValues(normalized);
      setPreset(detectProvider(normalized));
    }
    setDraftKeys({ LLM_API_KEY: '', BRAVE_SEARCH_API_KEY: '' });
    setClearKeys({ LLM_API_KEY: false, BRAVE_SEARCH_API_KEY: false });
    setFieldErrors({});
    setConflict(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    requestSettings('/api/settings', { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) adoptSnapshot(next);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy('');
      });
    return () => controller.abort();
  }, []);

  const stored = snapshot?.secrets || {};
  const selectedProvider = PRESETS.find((item) => item.id === preset);
  const matchedProviders = searchProviders(providerSearch);
  const visibleProviders = matchedProviders.filter((item) => item.id !== 'custom');
  const selectedOutsideSearch =
    selectedProvider?.id !== 'custom' && !visibleProviders.some((item) => item.id === preset);
  const baseline = normalizeValues(snapshot?.values);
  const dirty = Boolean(
    snapshot?.editable &&
    (Object.keys(DEFAULT_VALUES).some((key) => values[key] !== baseline[key]) ||
      Object.values(draftKeys).some((key) => key.length > 0) ||
      Object.values(clearKeys).some(Boolean)),
  );
  const identityChanged =
    values.LLM_PROVIDER !== baseline.LLM_PROVIDER ||
    values.LLM_BASE_URL.trim() !== baseline.LLM_BASE_URL.trim();
  const idFor = (key) => `model-settings-${uid}-${key}`;
  const fieldDescription = (key) =>
    `${idFor(key)}-hint${fieldErrors[key] ? ` ${idFor(key)}-error` : ''}`;

  const clearFeedback = () => {
    setError('');
    setSavedMessage(false);
    setTestResult(null);
  };
  const updateValue = (key, value) => {
    clearFeedback();
    setFieldErrors((old) => ({ ...old, [key]: undefined }));
    setValues((old) => ({ ...old, [key]: value }));
    if (key === 'LLM_BASE_URL' || key === 'LLM_PROVIDER') {
      setPreset(key === 'LLM_BASE_URL' ? detectProvider({ ...values, [key]: value }) : 'custom');
      setDraftKeys((old) => ({ ...old, LLM_API_KEY: '' }));
    }
  };
  const choosePreset = (selected) => {
    clearFeedback();
    setFieldErrors({});
    setPreset(selected);
    setDraftKeys((old) => ({ ...old, LLM_API_KEY: '' }));
    const item = PRESETS.find((choice) => choice.id === selected);
    if (!item?.protocol) return;
    setValues((old) => ({
      ...old,
      LLM_PROVIDER: item.protocol,
      LLM_BASE_URL: item.base,
      LLM_ALLOW_KEYLESS: item.keyless ? 'true' : 'false',
      LLM_MODEL: '',
      LLM_REVIEW_MODEL: '',
      LLM_JSON_MODE: 'false',
      LLM_TOKEN_PARAMETER: item.tokenParameter || 'auto',
    }));
  };
  const updateKey = (key, value) => {
    clearFeedback();
    setFieldErrors((old) => ({ ...old, [key]: undefined }));
    setDraftKeys((old) => ({ ...old, [key]: value }));
  };
  const toggleClear = (key, checked) => {
    clearFeedback();
    setFieldErrors((old) => ({ ...old, [key]: undefined }));
    setClearKeys((old) => ({ ...old, [key]: checked }));
  };
  const reload = async () => {
    clearFeedback();
    setBusy('loading');
    try {
      adoptSnapshot(await requestSettings('/api/settings'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };
  const validate = (action) => {
    const errors = {};
    if (!values.LLM_BASE_URL.trim()) {
      errors.LLM_BASE_URL = t.requiredBase;
    }
    for (const [key, [min, max]] of Object.entries(NUMERIC_RANGES)) {
      const number = Number(values[key]);
      if (!values[key].trim() || !Number.isInteger(number) || number < min || number > max)
        errors[key] = `${t.invalidNumber} (${min.toLocaleString()}–${max.toLocaleString()})`;
    }
    for (const key of ['LLM_BASE_URL']) {
      if (!values[key].trim()) continue;
      try {
        const url = new URL(values[key]);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          errors[key] = t.invalidUrl;
      } catch {
        errors[key] = t.invalidUrl;
      }
    }
    if (
      identityChanged &&
      stored.LLM_API_KEY &&
      !draftKeys.LLM_API_KEY.trim() &&
      !clearKeys.LLM_API_KEY
    )
      errors.LLM_API_KEY = t.newKeyRequired;
    if (action === 'test') {
      if (!values.LLM_MODEL.trim()) errors.LLM_MODEL = t.testModelRequired;
      const hasKey =
        !clearKeys.LLM_API_KEY &&
        (draftKeys.LLM_API_KEY.trim() || (stored.LLM_API_KEY && !identityChanged));
      if (!hasKey && values.LLM_ALLOW_KEYLESS !== 'true')
        errors.LLM_API_KEY = errors.LLM_API_KEY || t.testKeyRequired;
    }
    setFieldErrors(errors);
    if (
      Object.keys(errors).some((key) => ['LLM_TIMEOUT_MS', 'LLM_MAX_OUTPUT_TOKENS'].includes(key))
    )
      setAdvancedOpen(true);
    const first = Object.keys(errors)[0];
    if (first) {
      const activeAtValidation = document.activeElement;
      requestAnimationFrame(() => {
        if (document.activeElement === activeAtValidation)
          document.getElementById(idFor(first))?.focus();
      });
    }
    return !first;
  };
  const payload = () => ({
    values,
    secrets: Object.fromEntries(
      Object.keys(draftKeys).flatMap((key) =>
        clearKeys[key]
          ? [[key, null]]
          : draftKeys[key].trim()
            ? [[key, draftKeys[key].trim()]]
            : [],
      ),
    ),
    revision: snapshot.revision,
  });
  const act = async (action) => {
    clearFeedback();
    if (!validate(action)) return;
    setBusy(action);
    try {
      const next = await requestSettings(
        action === 'test' ? '/api/settings/test' : '/api/settings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Settings-Token': snapshot.csrfToken },
          body: JSON.stringify(payload()),
        },
      );
      if (action === 'save') {
        adoptSnapshot(next);
        setSavedMessage(true);
        if (next.config) onSaved?.(next.config);
      } else {
        if (next.ok !== true) throw new Error(t.errorTitle);
        setTestResult({ ...next, dirty });
      }
    } catch (err) {
      setError(err.message);
      setConflict(err.status === 409);
    } finally {
      setBusy('');
    }
  };

  const errorFor = (key) =>
    fieldErrors[key] ? (
      <p className="ms-field-error" id={`${idFor(key)}-error`}>
        <CircleHelp size={14} />
        {fieldErrors[key]}
      </p>
    ) : null;
  const textField = (
    key,
    label,
    hint,
    { placeholder = '', type = 'text', maxLength = 500 } = {},
  ) => (
    <div className="ms-field">
      <label htmlFor={idFor(key)}>{label}</label>
      <input
        id={idFor(key)}
        type={type}
        value={values[key]}
        maxLength={maxLength}
        onChange={(event) => updateValue(key, event.target.value)}
        placeholder={placeholder}
        aria-describedby={fieldDescription(key)}
        aria-invalid={Boolean(fieldErrors[key])}
        autoComplete="off"
        spellCheck="false"
      />
      <p className="ms-field-hint" id={`${idFor(key)}-hint`}>
        {hint}
      </p>
      {errorFor(key)}
    </div>
  );
  const numberField = (key, label, hint) => (
    <div className="ms-field">
      <label htmlFor={idFor(key)}>{label}</label>
      <input
        id={idFor(key)}
        type="number"
        inputMode="numeric"
        min={NUMERIC_RANGES[key][0]}
        max={NUMERIC_RANGES[key][1]}
        step="1"
        value={values[key]}
        onChange={(event) => updateValue(key, event.target.value)}
        aria-describedby={fieldDescription(key)}
        aria-invalid={Boolean(fieldErrors[key])}
      />
      <p className="ms-field-hint" id={`${idFor(key)}-hint`}>
        {hint}
      </p>
      {errorFor(key)}
    </div>
  );
  const secretField = (key, label, hint) => (
    <div className="ms-field ms-secret-field">
      <div className="ms-label-row">
        <label htmlFor={idFor(key)}>{label}</label>
        <span className={`ms-secret-status ${stored[key] ? 'is-saved' : ''}`}>
          {stored[key] ? <ShieldCheck size={13} /> : <KeyRound size={13} />}{' '}
          {stored[key] ? t.stored : t.notStored}
        </span>
      </div>
      <div className="ms-password">
        <KeyRound size={17} />
        <input
          id={idFor(key)}
          type="password"
          value={draftKeys[key]}
          onChange={(event) => updateKey(key, event.target.value)}
          placeholder={stored[key] ? t.keepPlaceholder : t.keyPlaceholder}
          disabled={Boolean(busy) || clearKeys[key]}
          aria-describedby={fieldDescription(key)}
          aria-invalid={Boolean(fieldErrors[key])}
          autoComplete="new-password"
          data-lpignore="true"
          data-1p-ignore="true"
          spellCheck="false"
          maxLength={16384}
        />
      </div>
      <p className="ms-field-hint" id={`${idFor(key)}-hint`}>
        {hint}
      </p>
      {stored[key] && (
        <label className="ms-checkbox ms-clear-key">
          <input
            type="checkbox"
            checked={clearKeys[key]}
            onChange={(event) => toggleClear(key, event.target.checked)}
          />
          <span>
            {t.clearKey}
            {clearKeys[key] && <small>{t.clearHint}</small>}
          </span>
        </label>
      )}
      {errorFor(key)}
    </div>
  );

  if (!snapshot && busy === 'loading')
    return (
      <section className="model-settings ms-loading" aria-live="polite">
        <LoaderCircle className="spin" size={23} />
        <span>{t.loading}</span>
      </section>
    );
  if (!snapshot)
    return (
      <section className="model-settings ms-unavailable">
        <CircleHelp size={23} />
        <div>
          <h2>{t.loadFailed}</h2>
          <p role="alert">{error}</p>
          <button className="secondary-button" onClick={reload} disabled={Boolean(busy)}>
            <RefreshCw size={15} />
            {t.retry}
          </button>
        </div>
      </section>
    );
  if (!snapshot.editable)
    return (
      <section className="model-settings ms-unavailable">
        <LockKeyhole size={24} />
        <div>
          <h2>{snapshot.reason === 'disabled' ? t.disabledTitle : t.localOnlyTitle}</h2>
          <p>{snapshot.reason === 'disabled' ? t.disabled : t.localOnly}</p>
          <a href={GUIDE} target="_blank" rel="noreferrer" className="text-button">
            {t.guide}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
    );

  return (
    <section className="model-settings" aria-labelledby={`ms-heading-${uid}`}>
      <div className="ms-intro">
        <div>
          <h2 className="sr-only" id={`ms-heading-${uid}`}>
            {t.heading}
          </h2>
          <p>{t.intro}</p>
        </div>
        <a href={GUIDE} target="_blank" rel="noreferrer" className="text-button">
          {t.guide}
          <ExternalLink size={14} />
        </a>
      </div>
      {error && (
        <div className="ms-message ms-error" role="alert">
          <CircleHelp size={19} />
          <div>
            <strong>{t.errorTitle}</strong>
            <p>{error}</p>
            {conflict && <p>{t.stale}</p>}
          </div>
          <button type="button" onClick={() => setError('')} aria-label={t.dismiss}>
            <X size={17} />
          </button>
        </div>
      )}
      {savedMessage && (
        <div className="ms-message ms-success" role="status">
          <Check size={19} />
          <p>{t.saved}</p>
        </div>
      )}
      {testResult && (
        <div className="ms-message ms-success" role="status">
          <Check size={19} />
          <div>
            <strong>{testResult.dirty ? t.testedDraft : t.testedSaved}</strong>
            {Array.isArray(testResult.models) &&
              testResult.models.some((model) => typeof model === 'string') && (
                <p>
                  {t.testedModels}：
                  {testResult.models.filter((model) => typeof model === 'string').join(' · ')}
                </p>
              )}
            <p>{t.noSaveFromTest}</p>
          </div>
        </div>
      )}
      <form
        className="ms-form"
        onSubmit={(event) => {
          event.preventDefault();
          act('save');
        }}
        noValidate
      >
        <fieldset disabled={Boolean(busy)} className="ms-fieldset">
          <section className="ms-section" aria-labelledby={`ms-model-title-${uid}`}>
            <div className="ms-section-header">
              <span className="ms-section-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <h3 id={`ms-model-title-${uid}`}>{t.modelService}</h3>
                <p>{t.modelDescription}</p>
              </div>
            </div>
            <div className="ms-section-body">
              <div className="ms-field ms-provider-search">
                <div className="ms-label-row">
                  <label htmlFor={`ms-provider-search-${uid}`}>{t.searchProvider}</label>
                  <span className="ms-provider-count" role="status">
                    {providerSearch.trim()
                      ? `${visibleProviders.length} ${t.matches}`
                      : `${PRESETS.length - 1} ${t.providerCount}`}
                  </span>
                </div>
                <div className="ms-search-input">
                  <Search size={17} />
                  <input
                    id={`ms-provider-search-${uid}`}
                    type="search"
                    value={providerSearch}
                    onChange={(event) => setProviderSearch(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="ms-field">
                <label htmlFor={`ms-preset-${uid}`}>{t.provider}</label>
                <div className="ms-select">
                  <select
                    id={`ms-preset-${uid}`}
                    value={preset}
                    onChange={(event) => choosePreset(event.target.value)}
                  >
                    {selectedOutsideSearch && selectedProvider && (
                      <optgroup label={t.currentProvider}>
                        <option value={selectedProvider.id}>
                          {lang === 'zh' ? selectedProvider.labelZh : selectedProvider.label}
                        </option>
                      </optgroup>
                    )}
                    {PROVIDER_GROUPS.map((group) => {
                      const items = visibleProviders.filter((item) => item.group === group.id);
                      return (
                        items.length > 0 && (
                          <optgroup
                            key={group.id}
                            label={lang === 'zh' ? group.labelZh : group.label}
                          >
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {lang === 'zh' ? item.labelZh : item.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                      );
                    })}
                    <option value="custom">
                      {lang === 'zh' ? '自定义服务' : 'Custom service'}
                    </option>
                  </select>
                  <ChevronDown size={16} />
                </div>
                {providerSearch.trim() && visibleProviders.length === 0 && (
                  <p className="ms-field-hint" role="status">
                    {t.noProviders}
                  </p>
                )}
                <p className="ms-field-hint">{t.regionHint}</p>
                {selectedProvider?.docs && (
                  <div className="ms-provider-help">
                    {selectedProvider.noteZh && (
                      <p>{lang === 'zh' ? selectedProvider.noteZh : selectedProvider.note}</p>
                    )}
                    <a
                      href={selectedProvider.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="text-button"
                    >
                      {t.providerDocs}
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>
              {textField('LLM_BASE_URL', t.base, t.baseHint, {
                placeholder: selectedProvider?.basePlaceholder || 'https://api.example.com/v1',
                maxLength: 2000,
              })}
              {textField('LLM_MODEL', t.model, t.modelHint, {
                placeholder: t.modelPlaceholder,
                maxLength: 200,
              })}
              {secretField('LLM_API_KEY', t.apiKey, t.keyHint)}
              {identityChanged && stored.LLM_API_KEY && (
                <div className="ms-inline-note">
                  <ShieldCheck size={17} />
                  <p>{t.changedEndpoint}</p>
                </div>
              )}
              {selectedProvider?.group === 'local' && (
                <div className="ms-inline-note">
                  <CircleHelp size={17} />
                  <p>{t.localHint}</p>
                </div>
              )}
            </div>
            <details
              className="ms-advanced"
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            >
              <summary>
                <SlidersHorizontal size={17} />
                <span>
                  <strong>{t.advanced}</strong>
                  <small>{t.advancedHint}</small>
                </span>
                <ChevronDown size={17} />
              </summary>
              <div className="ms-advanced-body">
                <div className="ms-field">
                  <label htmlFor={idFor('LLM_PROVIDER')}>{t.protocol}</label>
                  <div className="ms-select">
                    <select
                      id={idFor('LLM_PROVIDER')}
                      value={values.LLM_PROVIDER}
                      onChange={(event) => updateValue('LLM_PROVIDER', event.target.value)}
                    >
                      <option value="openai-compatible">{t.compatible}</option>
                      <option value="anthropic">{t.nativeAnthropic}</option>
                      <option value="gemini">{t.nativeGemini}</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
                {textField('LLM_REVIEW_MODEL', t.reviewModel, t.reviewHint, {
                  placeholder: t.reviewPlaceholder,
                  maxLength: 200,
                })}
                <div className="ms-field-grid">
                  {numberField('LLM_TIMEOUT_MS', t.timeout, t.timeoutHint)}
                  {numberField('LLM_MAX_OUTPUT_TOKENS', t.tokens, t.tokensHint)}
                </div>
                <div className="ms-field">
                  <label htmlFor={idFor('LLM_TOKEN_PARAMETER')}>{t.tokenParameter}</label>
                  <div className="ms-select">
                    <select
                      id={idFor('LLM_TOKEN_PARAMETER')}
                      value={values.LLM_TOKEN_PARAMETER}
                      onChange={(event) => updateValue('LLM_TOKEN_PARAMETER', event.target.value)}
                      disabled={Boolean(busy) || values.LLM_PROVIDER !== 'openai-compatible'}
                      aria-describedby={`${idFor('LLM_TOKEN_PARAMETER')}-hint`}
                    >
                      <option value="auto">{t.automatic}</option>
                      <option value="max_completion_tokens">max_completion_tokens</option>
                      <option value="max_tokens">max_tokens</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <p className="ms-field-hint" id={`${idFor('LLM_TOKEN_PARAMETER')}-hint`}>
                    {t.tokenHint}
                  </p>
                </div>
                <label className="ms-checkbox ms-switch-row">
                  <input
                    type="checkbox"
                    checked={values.LLM_JSON_MODE === 'true'}
                    onChange={(event) => updateValue('LLM_JSON_MODE', String(event.target.checked))}
                    disabled={Boolean(busy) || values.LLM_PROVIDER !== 'openai-compatible'}
                  />
                  <span>
                    {t.jsonMode}
                    <small>{t.jsonHint}</small>
                  </span>
                </label>
                <label className="ms-checkbox ms-switch-row">
                  <input
                    type="checkbox"
                    checked={values.LLM_ALLOW_KEYLESS === 'true'}
                    onChange={(event) =>
                      updateValue('LLM_ALLOW_KEYLESS', String(event.target.checked))
                    }
                  />
                  <span>
                    {t.keyless}
                    <small>{t.keylessHint}</small>
                  </span>
                </label>
              </div>
            </details>
          </section>
          <section className="ms-section" aria-labelledby={`ms-services-title-${uid}`}>
            <div className="ms-section-header">
              <span className="ms-section-icon">
                <Globe2 size={20} />
              </span>
              <div>
                <h3 id={`ms-services-title-${uid}`}>{t.services}</h3>
                <p>{t.servicesDescription}</p>
              </div>
            </div>
            <div className="ms-section-body">
              {secretField('BRAVE_SEARCH_API_KEY', t.brave, t.braveHint)}
              <div className="ms-classroom-info">
                <h4>{t.openmaic}</h4>
                <p className="ms-classroom-state" role="status">
                  <span className={config?.openmaicStatus?.ready ? 'is-ready' : ''} />
                  {config?.openmaicStatus?.ready
                    ? t.classroomReady
                    : config?.openmaicStatus?.state === 'starting'
                      ? t.classroomStarting
                      : ['error', 'failed'].includes(config?.openmaicStatus?.state)
                        ? t.classroomFailed
                        : config?.openmaicStatus?.installed
                          ? t.classroomInstalled
                          : t.classroomMissing}
                </p>
                <p>{t.openmaicHint}</p>
                <p>{t.classroomMedia}</p>
                <a href="https://github.com/THU-MAIC/OpenMAIC" target="_blank" rel="noreferrer">
                  {t.classroomCredit}
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </section>
          <section className="ms-section" aria-labelledby={`ms-limits-title-${uid}`}>
            <div className="ms-section-header">
              <span className="ms-section-icon">
                <Settings2 size={20} />
              </span>
              <div>
                <h3 id={`ms-limits-title-${uid}`}>{t.limits}</h3>
                <p>{t.limitsDescription}</p>
              </div>
            </div>
            <div className="ms-section-body">
              <div className="ms-field-grid">
                {numberField('DAILY_GENERATION_LIMIT', t.daily, t.dailyHint)}
                {numberField('MAX_CONCURRENT_GENERATIONS', t.concurrency, t.concurrencyHint)}
              </div>
              <p className="ms-limit-note">{t.limitNote}</p>
            </div>
          </section>
        </fieldset>
        <div className="ms-action-area">
          <p className="ms-test-hint">
            <FlaskConical size={16} />
            {t.testHint}
          </p>
          <div className="ms-actionbar">
            <div className={`ms-dirty-state ${dirty ? 'is-dirty' : ''}`} role="status">
              <span />
              {dirty ? t.dirty : t.clean}
            </div>
            <div className="ms-action-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={() => act('test')}
                disabled={Boolean(busy) || conflict}
              >
                {busy === 'test' ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <FlaskConical size={16} />
                )}{' '}
                {busy === 'test' ? t.testing : t.test}
              </button>
              <button type="submit" className="primary-button" disabled={Boolean(busy) || conflict}>
                {busy === 'save' ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{' '}
                {busy === 'save' ? t.saving : t.save}
              </button>
            </div>
          </div>
          <div className="ms-bottom-note">
            <p>{t.unsavedEmpty}</p>
            <button type="button" className="text-button" onClick={reload} disabled={Boolean(busy)}>
              <RefreshCw size={14} />
              {t.reload}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

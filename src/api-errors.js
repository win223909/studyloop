const MESSAGES = {
  zh: {
    sources_insufficient:
      '找到的资料仍不足以支持完整课程，本次未生成大纲。可以选择更聚焦的关键词范围，或粘贴、上传相关章节继续。',
    sources_missing:
      '尚未找到可用于这门课的资料，本次未生成大纲。可以选择更聚焦的关键词范围，或粘贴、上传课程资料继续。',
    bank_invalid:
      '生成的题库未通过结构或引用校验，本次题库未保存。请重试，也可减少题目数量，或换用更清晰、完整的课程资料。',
    plan_invalid:
      '课程大纲不完整或尚未确认，本次课程未保存。请重新生成并确认大纲；若仍未通过，可换用更清晰、完整的课程资料。',
    review_invalid:
      '独立答案复核结果不完整，无法确认题库质量，本次题库未保存。请重试，也可减少题目数量后重新生成。',
    review_rejected:
      '题库未通过独立答案复核，可能存在答案争议、题意歧义或资料支持不足。本次题库未保存。请重试，或换用更清晰、完整的课程资料。',
    model_format:
      '模型未返回有效的 JSON 格式，无法继续生成。请重试；若仍失败，可减少题目数量或更换模型。',
    model_refused: '模型服务商拒绝了这次生成。请调整课程主题或资料后再试；系统不会自动重复该请求。',
    model_context_limit:
      '请求超出模型支持的上下文长度。请缩短课程资料，或选择支持更长上下文的模型后重试。',
    model_truncated:
      '模型输出在完成前被截断。请在「模型与设置」的高级模型参数中提高最大输出 Token 上限（不要超过模型支持的限制），或减少题目数量、缩短资料后重试。',
    teaching_review_rejected:
      '讲解内容未通过质量复核，可能与资料不符或存在不一致。本次题库未保存。请重试，或换用更清晰、完整的课程资料。',
    search_auth: '搜索服务身份验证失败。请在「模型与设置」核对 Brave 搜索 API 密钥及其访问权限。',
    search_rate_limit:
      '搜索服务的请求速率或额度达到限制。请稍后重试；若使用 Brave，也请检查其搜索额度。',
    search_http: '搜索服务暂时无法完成请求。请稍后重试，或粘贴、上传课程资料继续。',
    search_timeout: '搜索资料超时。请稍后重试，或粘贴、上传课程资料继续。',
    search_connection: '无法连接搜索服务。请检查网络连接后重试，或粘贴、上传课程资料继续。',
    search_response: '搜索服务返回的结果无法处理。请换用更具体的关键词重试，或粘贴、上传课程资料。',
    provider_model:
      '模型不存在或当前 API 账户无权使用。请到「模型与设置」核对主模型 ID；若填写了复核模型，也请一并核对。应使用服务商提供的模型名称，不要填写账户编号或 Group ID。',
    provider_request:
      '模型服务拒绝了请求参数。请在「模型与设置」核对 API 协议与高级模型参数，再测试连接。',
    provider_endpoint:
      '模型接口或资源不可用。请在「模型与设置」核对 API 根地址、模型或部署 ID、服务商地区和协议，再测试连接。',
    provider_quota: '模型账户余额或可用额度不足。请在服务商平台检查余额、套餐与额度后重试。',
    provider_auth: '模型身份验证失败。请在「模型与设置」核对 API 密钥、所属地区及模型访问权限。',
    provider_rate_limit: '模型请求过于频繁。请稍后重试，或在服务商平台检查请求速率限制。',
    provider_timeout:
      '模型响应超时。请稍后重试，或减少资料长度；也可在高级模型参数中调整超时时间。',
    provider_connection: '无法连接模型服务。请检查网络、API 根地址及服务商状态后重试。',
    provider_response: '模型服务返回的内容无法处理。请减少资料长度后重试，或更换模型。',
    provider_unavailable: '模型服务暂时不可用。请稍后重试，或检查服务商状态。',
    provider_context_limit:
      '请求内容或输出 Token 上限超出当前模型的限制。请减少资料长度，或在高级模型参数中调低最大输出 Token 上限；也可换用支持更高限制的模型。',
    provider_content_filter:
      '模型服务因内容限制拒绝了请求。请检查课程主题和资料是否符合服务商的使用规则。',
    provider_http: '模型服务暂时无法完成请求。请稍后重试，或在「模型与设置」测试连接。',
    generation_unconfigured:
      '尚未配置课程生成模型。请到「模型与设置」填写服务商、主模型 ID 和 API 密钥；示例课程仍可使用。',
    unknown_provider:
      '模型请求未完成。请在「模型与设置」测试连接，并检查服务商的模型、权限和额度。',
    network: '网络请求未完成。请检查网络连接后重试。',
    unexpected: '服务暂时无法完成请求，请稍后重试。',
  },
  en: {
    sources_insufficient:
      'The sources still do not support the full course, so no outline was created. Choose a focused scope using keywords, or paste or upload a relevant chapter to continue.',
    sources_missing:
      'No usable sources were found, so no outline was created. Choose a focused scope using keywords, or paste or upload course material to continue.',
    bank_invalid:
      'The generated question bank did not pass structure or citation validation and was not saved. Retry, use fewer questions or provide clearer, more complete course material.',
    plan_invalid:
      'The course outline is incomplete or has not been confirmed. This course was not saved. Generate and confirm the outline again; if it still fails, use clearer, more complete course material.',
    review_invalid:
      'The independent answer review was incomplete, so the question bank could not be verified and was not saved. Retry or generate fewer questions.',
    review_rejected:
      'The question bank did not pass independent answer review, possibly because of disputed answers, ambiguous wording or insufficient evidence. It was not saved. Retry or use clearer, more complete course material.',
    model_format:
      'The model did not return valid JSON, so generation could not continue. Retry, reduce the number of questions or use a different model.',
    model_refused:
      'The model provider declined this generation. Adjust the course topic or material before trying again. This request is not retried automatically.',
    model_context_limit:
      'The request exceeds the model’s context limit. Use shorter course material or a model with a larger context window, then retry.',
    model_truncated:
      'The model output was cut off before completion. Increase Maximum output tokens in the advanced model parameters in Models & settings, within the model’s supported limit, or use fewer questions or shorter material and retry.',
    teaching_review_rejected:
      'The explanations did not pass quality review because they may be unsupported or inconsistent. This question bank was not saved. Retry or use clearer, more complete course material.',
    search_auth:
      'Search authentication failed. Check the Brave Search API key and its access permissions in Models & settings.',
    search_rate_limit:
      'The search service reached a rate or quota limit. Retry later; if using Brave, check its search quota too.',
    search_http:
      'The search service could not complete this request. Retry later, or paste or upload course material to continue.',
    search_timeout:
      'The source search timed out. Retry later, or paste or upload course material to continue.',
    search_connection:
      'The search service could not be reached. Check your network connection and retry, or paste or upload course material.',
    search_response:
      'The search response could not be processed. Retry with more specific keywords, or paste or upload course material.',
    provider_model:
      'The model does not exist or your API account cannot access it. Check the Primary model ID in Models & settings, and the review model if set. Use the provider’s model name, not an account number or Group ID.',
    provider_request:
      'The model service rejected the request parameters. Check the API protocol and advanced model parameters in Models & settings, then test the connection.',
    provider_endpoint:
      'The model endpoint or resource is unavailable. Check the API base URL, model or deployment ID, provider region and protocol in Models & settings, then test the connection.',
    provider_quota:
      'The model account has insufficient balance or quota. Check your balance, plan and available quota with the provider, then retry.',
    provider_auth:
      'Model authentication failed. Check the API key, its region and model access permissions in Models & settings.',
    provider_rate_limit:
      'Model requests are being rate limited. Retry later or check request limits with the provider.',
    provider_timeout:
      'The model response timed out. Retry later, use shorter material or adjust the timeout in advanced model parameters.',
    provider_connection:
      'The model service could not be reached. Check your connection, API base URL and the provider’s status, then retry.',
    provider_response:
      'The model service returned content that could not be processed. Try shorter material or a different model.',
    provider_unavailable:
      'The model service is temporarily unavailable. Retry later or check the provider’s status.',
    provider_context_limit:
      'The request content or output-token limit exceeds this model’s limits. Use shorter material, lower Maximum output tokens in advanced model parameters, or choose a model with higher limits.',
    provider_content_filter:
      'The model service declined the request due to content restrictions. Check that the course topic and material follow the provider’s usage rules.',
    provider_http:
      'The model service could not complete this request. Retry later or test the connection in Models & settings.',
    generation_unconfigured:
      'Course generation is not configured. Enter a provider, Primary model ID and API key in Models & settings. Sample courses remain available.',
    unknown_provider:
      'The model request did not finish. Test the connection in Models & settings and check model access and quota with the provider.',
    network: 'The network request did not finish. Check your connection, then retry.',
    unexpected: 'The service could not complete this request. Please retry later.',
  },
};

export function isSourceCoverageError(error) {
  return ['sources_missing', 'sources_insufficient'].includes(error?.code);
}

export function normalizeSourceSearch(value) {
  const plainText = (text, max) =>
    typeof text === 'string' &&
    text.trim().length >= 2 &&
    text.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(text) &&
    !/<\/?[a-z!][^>]*>/iu.test(text);
  if (
    !value ||
    typeof value !== 'object' ||
    !plainText(value.topic, 200) ||
    ![1, 2].includes(value.rounds) ||
    !Array.isArray(value.queries) ||
    value.queries.length > 4 ||
    !Array.isArray(value.suggestedTopics) ||
    value.suggestedTopics.length > 3
  )
    return undefined;
  const keywords = (items, max) => [
    ...new Set(
      items
        .filter(
          (item) =>
            plainText(item, max) &&
            !/[<>]/u.test(item) &&
            !/(?:\b[a-z][a-z\d+.-]*:\/\/|\b(?:data|javascript|file):|(?:^|\s)(?:www\.|\/\/))/iu.test(
              item,
            ),
        )
        .map((item) => item.trim().replace(/\s+/gu, ' ')),
    ),
  ];
  return {
    topic: value.topic.trim(),
    rounds: value.rounds,
    queries: keywords(value.queries, 200),
    suggestedTopics: keywords(value.suggestedTopics, 120),
  };
}

export function normalizeGenerationDiagnostic(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.requestId !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      value.requestId,
    ) ||
    !['plan', 'course', 'classroom'].includes(value.operation) ||
    !['outline', 'questions', 'answer_review', 'teaching_review', 'search'].includes(value.phase) ||
    ![1, 2].includes(value.attempts)
  )
    return undefined;
  return {
    requestId: value.requestId,
    operation: value.operation,
    phase: value.phase,
    attempts: value.attempts,
  };
}

export function createApiError(result, status) {
  const code = typeof result?.code === 'string' ? result.code : result?.error?.code;
  const providerError = typeof code === 'string' && code.toLowerCase().startsWith('provider_');
  const message = typeof result?.error === 'string' ? result.error : result?.error?.message;
  // Provider bodies are not UI copy, including for codes introduced by a newer server.
  const error = new Error(
    providerError
      ? 'Model request failed.'
      : typeof message === 'string'
        ? message
        : `HTTP ${status}`,
  );
  error.code = typeof code === 'string' ? code.toLowerCase() : undefined;
  error.status = status;
  const generation = normalizeGenerationDiagnostic(result?.generation);
  if (generation) error.generation = generation;
  if (isSourceCoverageError(error)) {
    const sourceSearch = normalizeSourceSearch(result?.sourceSearch);
    if (sourceSearch) error.sourceSearch = sourceSearch;
  }
  return error;
}

export function formatApiError(error, lang = 'zh') {
  const messages = MESSAGES[lang === 'en' ? 'en' : 'zh'];
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  if (Object.hasOwn(messages, code)) return messages[code];
  if (code.startsWith('provider_')) return messages.unknown_provider;
  if (error?.status >= 500) return messages.unexpected;
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
    return messages.network;
  return typeof error === 'string' ? error : error?.message || messages.unexpected;
}

export function isModelConfigurationError(error) {
  return [
    'provider_model',
    'provider_request',
    'provider_endpoint',
    'provider_auth',
    'generation_unconfigured',
  ].includes(error?.code);
}

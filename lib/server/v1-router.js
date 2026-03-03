'use strict';
const { extractRequestSessionKey } = require('./session-key');

async function handleV1Request(ctx) {
  const {
    req,
    res,
    method,
    pathname,
    options,
    state,
    requiredClientKey,
    cooldownMs,
    localExecOpts,
    maxRequestBodyBytes,
    requestMeta,
    deps
  } = ctx;

  const {
    parseAuthorizationBearer,
    writeJson,
    readRequestBody,
    getRegistryModelList,
    buildOpenAIModelsList,
    resolveRequestProvider,
    buildPromptFromChatRequest,
    buildPromptFromResponsesRequest,
    chooseServerAccount,
    runGeminiLocalCompletion,
    runCodexLocalCompletion,
    addModelToRegistry,
    writeSseChatCompletion,
    buildChatCompletionPayload,
    markProxyAccountSuccess,
    markProxyAccountFailure,
    getLocalFailureCooldownMs,
    isRetriableLocalError,
    pushMetricError,
    appendProxyRequestLog,
    handleLocalChatCompletions,
    handleLocalResponses,
    handleUpstreamModels,
    handleUpstreamPassthrough,
    fetchModelsForAccount,
    FALLBACK_MODELS,
    fetchWithTimeout
  } = deps;

  if (!pathname.startsWith('/v1/')) return false;

  if (requiredClientKey) {
    const incoming = parseAuthorizationBearer(req.headers.authorization);
    if (incoming !== requiredClientKey) {
      writeJson(res, 401, { ok: false, error: 'unauthorized_client' });
      return true;
    }
  }

  const bodyBufferResult = await readRequestBody(req, { maxBytes: maxRequestBodyBytes }).catch((error) => ({ __error: error }));
  if (!bodyBufferResult || bodyBufferResult.__error) {
    const err = bodyBufferResult && bodyBufferResult.__error;
    if (err && err.code === 'request_body_too_large') {
      writeJson(res, 413, { ok: false, error: 'request_body_too_large' });
      return true;
    }
    writeJson(res, 400, { ok: false, error: 'invalid_request_body' });
    return true;
  }
  const bodyBuffer = bodyBufferResult;

  let requestJson = null;
  try {
    requestJson = bodyBuffer.length > 0 ? JSON.parse(bodyBuffer.toString('utf8')) : {};
  } catch (e) {
    requestJson = {};
  }

  const requestStartedAt = Date.now();
  const routeKey = `${method} ${pathname}`;
  const sessionKey = extractRequestSessionKey(req.headers || {}, requestJson || {});
  const requestMetaWithSession = {
    ...(requestMeta || {}),
    sessionKey
  };
  state.metrics.totalRequests += 1;
  state.metrics.routeCounts[routeKey] = Number(state.metrics.routeCounts[routeKey] || 0) + 1;

  if (options.backend === 'codex-local') {
    if (method === 'GET' && pathname === '/v1/models') {
      const modelList = getRegistryModelList(state.modelRegistry, options.provider);
      const payload = buildOpenAIModelsList(modelList);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      state.metrics.totalSuccess += 1;
      return true;
    }

    if (method === 'POST' && pathname === '/v1/chat/completions') {
      await handleLocalChatCompletions({
        options,
        state,
        requestJson,
        routeKey,
        requestStartedAt,
        res,
        cooldownMs,
        localExecOpts,
        requestMeta: requestMetaWithSession,
        deps: {
          resolveRequestProvider,
          buildPromptFromChatRequest,
          chooseServerAccount,
          runGeminiLocalCompletion,
          runCodexLocalCompletion,
          addModelToRegistry,
          writeSseChatCompletion,
          buildChatCompletionPayload,
          markProxyAccountSuccess,
          markProxyAccountFailure,
          getLocalFailureCooldownMs,
          isRetriableLocalError,
          pushMetricError,
          appendProxyRequestLog,
          writeJson
        }
      });
      return true;
    }

    if (method === 'POST' && pathname === '/v1/responses') {
      await handleLocalResponses({
        options,
        state,
        requestJson,
        routeKey,
        requestStartedAt,
        res,
        cooldownMs,
        localExecOpts,
        requestMeta: requestMetaWithSession,
        deps: {
          resolveRequestProvider,
          buildPromptFromResponsesRequest,
          chooseServerAccount,
          runGeminiLocalCompletion,
          runCodexLocalCompletion,
          addModelToRegistry,
          markProxyAccountSuccess,
          markProxyAccountFailure,
          getLocalFailureCooldownMs,
          isRetriableLocalError,
          pushMetricError,
          appendProxyRequestLog,
          writeJson
        }
      });
      return true;
    }

    state.metrics.totalFailures += 1;
    pushMetricError(state.metrics, routeKey, 'n/a', 'unsupported_in_codex_local_backend');
    writeJson(res, 404, { ok: false, error: 'unsupported_in_codex_local_backend' });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/models') {
    await handleUpstreamModels({
      options,
      state,
      res,
      deps: {
        buildOpenAIModelsList,
        fetchModelsForAccount,
        FALLBACK_MODELS
      }
    });
    return true;
  }

  await handleUpstreamPassthrough({
    options,
    state,
    req,
    res,
    method,
    bodyBuffer,
    routeKey,
    requestStartedAt,
    cooldownMs,
    requestJson,
    requestMeta: requestMetaWithSession,
    deps: {
      chooseServerAccount,
      pushMetricError,
      writeJson,
      fetchWithTimeout,
      markProxyAccountFailure,
      markProxyAccountSuccess,
      appendProxyRequestLog
    }
  });
  return true;
}

module.exports = {
  handleV1Request
};

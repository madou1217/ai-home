'use strict';
const { extractRequestSessionKey } = require('./session-key');

function sanitizeUndefinedSentinel(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeUndefinedSentinel(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.trim() === '[undefined]') return undefined;
    return value;
  }
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    const sanitized = sanitizeUndefinedSentinel(item);
    if (sanitized === undefined) return;
    out[key] = sanitized;
  });
  return out;
}

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
    maxRequestBodyBytes,
    requestMeta,
    deps
  } = ctx;

  const {
    parseAuthorizationBearer,
    writeJson,
    readRequestBody,
    buildOpenAIModelsList,
    chooseServerAccount,
    markProxyAccountSuccess,
    markProxyAccountFailure,
    pushMetricError,
    appendProxyRequestLog,
    handleUpstreamModels,
    handleUpstreamPassthrough,
    handleCodexModels,
    handleCodexChatCompletions,
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
  let upstreamBodyBuffer = bodyBuffer;
  if (requestJson && typeof requestJson === 'object' && bodyBuffer.length > 0) {
    try {
      const sanitizedRequest = sanitizeUndefinedSentinel(requestJson);
      if (sanitizedRequest && typeof sanitizedRequest === 'object') {
        upstreamBodyBuffer = Buffer.from(JSON.stringify(sanitizedRequest));
        requestJson = sanitizedRequest;
      }
    } catch (_error) {
      upstreamBodyBuffer = bodyBuffer;
    }
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

  if (method === 'GET' && pathname === '/v1/models' && options.backend === 'codex-adapter') {
    await handleCodexModels({
      options,
      state,
      res,
      deps: {
        buildOpenAIModelsList,
        fetchWithTimeout
      }
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/chat/completions' && options.backend === 'codex-adapter') {
    await handleCodexChatCompletions({
      options,
      state,
      req,
      res,
      requestJson,
      routeKey,
      requestStartedAt,
      cooldownMs,
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
    bodyBuffer: upstreamBodyBuffer,
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

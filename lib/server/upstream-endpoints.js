'use strict';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'proxy-connection'
]);

function shouldSkipForwardHeader(headerName) {
  const key = String(headerName || '').toLowerCase();
  return key === 'host'
    || key === 'authorization'
    || key === 'content-length'
    || HOP_BY_HOP_HEADERS.has(key);
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
  }
  return String(value == null ? '' : value).trim();
}

function isSafeHeaderValue(value) {
  return !/[\u0000-\u0008\u000A-\u001F\u007F]/.test(String(value || ''));
}

function sanitizeAccessToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return '';
  if (/[\r\n\0]/.test(token)) return '';
  return token;
}

function describeUpstreamError(error) {
  const message = String((error && error.message) || error || 'unknown_error');
  const code = String(
    (error && error.code)
    || (error && error.cause && error.cause.code)
    || ''
  ).trim();
  if (!code || message.includes(code)) return message;
  return `${message} [${code}]`;
}

function isGlobalNetworkFailure(error) {
  const code = String(
    (error && error.code)
    || (error && error.cause && error.cause.code)
    || ''
  ).trim().toUpperCase();
  if ([
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN'
  ].includes(code)) {
    return true;
  }
  const msg = String((error && error.message) || '').toLowerCase();
  return msg.includes('secure tls connection')
    || msg.includes('network socket disconnected')
    || msg.includes('fetch failed');
}

function withNetworkHint(detail, upstreamBase) {
  const upstream = String(upstreamBase || '').trim();
  const parts = [
    String(detail || '').trim(),
    'hint: check upstream reachability'
  ];
  if (upstream) {
    parts.push(`upstream=${upstream}`);
  }
  parts.push('proxy=AIH_SERVER_PROXY_URL/https_proxy/http_proxy');
  return parts.filter(Boolean).join(' | ');
}

async function handleUpstreamModels(ctx) {
  const {
    options,
    state,
    res,
    deps
  } = ctx;

  const {
    buildOpenAIModelsList,
    fetchModelsForAccount,
    FALLBACK_MODELS
  } = deps;

  const now = Date.now();
  const ttl = Math.max(1000, Number(options.modelsCacheTtlMs) || 300000);
  if (state.modelsCache.updatedAt > 0 && now - state.modelsCache.updatedAt < ttl && Array.isArray(state.modelsCache.ids)) {
    const payload = buildOpenAIModelsList(state.modelsCache.ids.length > 0 ? state.modelsCache.ids : FALLBACK_MODELS);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return;
  }

  const candidates = (state.accounts.codex || [])
    .filter((a) => !!a.accessToken && Date.now() >= (a.cooldownUntil || 0))
    .slice(0, Math.max(1, Number(options.modelsProbeAccounts) || 2));
  const modelSet = new Set();
  let firstError = '';
  const probeTimeout = Math.min(4000, options.upstreamTimeoutMs);
  const settled = await Promise.allSettled(
    candidates.map((acc) => fetchModelsForAccount(options, acc, probeTimeout))
  );
  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      result.value.forEach((m) => modelSet.add(m));
      return;
    }
    if (!firstError) firstError = String((result.reason && result.reason.message) || result.reason);
  });
  const ids = Array.from(modelSet).sort();
  state.modelsCache = {
    updatedAt: now,
    ids,
    byAccount: {},
    sourceCount: ids.length > 0 ? candidates.length : 0
  };
  const payload = buildOpenAIModelsList(ids.length > 0 ? ids : FALLBACK_MODELS);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (ids.length === 0 && firstError) {
    res.setHeader('x-aih-models-fallback', '1');
  }
  res.end(JSON.stringify(payload));
}

async function handleUpstreamPassthrough(ctx) {
  const {
    options,
    state,
    req,
    res,
    method,
    bodyBuffer,
    routeKey,
    requestStartedAt,
    cooldownMs,
    requestMeta,
    deps
  } = ctx;

  const {
    chooseServerAccount,
    pushMetricError,
    writeJson,
    fetchWithTimeout,
    markProxyAccountFailure,
    markProxyAccountSuccess,
    appendProxyRequestLog
  } = deps;

  let lastError = '';
  const pool = state.accounts.codex || [];
  const maxAttempts = Math.min(
    Math.max(1, Number(options.maxAttempts) || 3),
    Math.max(1, pool.length)
  );
  const attemptedIds = new Set();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const account = chooseServerAccount(pool, state.cursors, 'codex', {
      provider: 'codex',
      sessionKey: (requestMeta && requestMeta.sessionKey) || '',
      excludeIds: attemptedIds
    });
    if (!account) {
      state.metrics.totalFailures += 1;
      pushMetricError(state.metrics, routeKey, 'codex', 'no_available_account');
      writeJson(res, 503, { ok: false, error: 'no_available_account' });
      return;
    }
    attemptedIds.add(String(account.id || ''));
    const upstreamUrl = `${options.upstream}${req.url || ''}`;
    const accessToken = sanitizeAccessToken(account.accessToken);
    if (!accessToken) {
      markProxyAccountFailure(account, 'invalid_access_token', cooldownMs, options.failureThreshold);
      lastError = `invalid_access_token_account_${account.id}`;
      continue;
    }
    try {
      const headers = {};
      Object.entries(req.headers || {}).forEach(([k, v]) => {
        const key = String(k || '').toLowerCase();
        if (shouldSkipForwardHeader(k)) return;
        const normalized = normalizeHeaderValue(v);
        if (!normalized) return;
        if (!isSafeHeaderValue(normalized)) return;
        headers[key] = normalized;
      });
      headers.authorization = `Bearer ${accessToken}`;
      headers['x-aih-account-id'] = account.id;
      headers['x-aih-account-email'] = account.email || '';

      const upstreamRes = await fetchWithTimeout(upstreamUrl, {
        method,
        headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : bodyBuffer
      }, options.upstreamTimeoutMs, {
        proxyUrl: options.proxyUrl,
        noProxy: options.noProxy
      });

      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        markProxyAccountFailure(account, `upstream_${upstreamRes.status}`, cooldownMs, options.failureThreshold);
        lastError = `upstream_${upstreamRes.status}_account_${account.id}`;
        continue;
      }

      const raw = Buffer.from(await upstreamRes.arrayBuffer());
      res.statusCode = upstreamRes.status;
      upstreamRes.headers.forEach((value, key) => {
        const low = String(key || '').toLowerCase();
        if (low === 'transfer-encoding') return;
        if (low === 'content-length') return;
        res.setHeader(key, value);
      });
      res.setHeader('x-aih-server-account-id', account.id);
      if (account.email) res.setHeader('x-aih-server-account-email', account.email);
      res.setHeader('content-length', raw.length);
      res.end(raw);

      markProxyAccountSuccess(account);
      state.metrics.totalSuccess += 1;
      if (options.logRequests) {
        appendProxyRequestLog({
          at: new Date().toISOString(),
          requestId: requestMeta && requestMeta.requestId,
          route: routeKey,
          provider: 'codex',
          accountId: account.id,
          status: upstreamRes.status,
          durationMs: Date.now() - requestStartedAt
        });
      }
      return;
    } catch (e) {
      const detail = describeUpstreamError(e);
      if (detail.includes('timeout')) state.metrics.totalTimeouts += 1;
      markProxyAccountFailure(account, detail, cooldownMs, options.failureThreshold);
      lastError = detail;
      if (isGlobalNetworkFailure(e)) {
        lastError = withNetworkHint(detail, options.upstream);
        break;
      }
    }
  }

  state.metrics.totalFailures += 1;
  pushMetricError(state.metrics, routeKey, 'codex', lastError);
  if (options.logRequests) {
    appendProxyRequestLog({
      at: new Date().toISOString(),
      requestId: requestMeta && requestMeta.requestId,
      route: routeKey,
      provider: 'codex',
      status: 502,
      error: lastError,
      durationMs: Date.now() - requestStartedAt
    });
  }
  writeJson(res, 502, { ok: false, error: 'upstream_failed', detail: lastError });
}

module.exports = {
  handleUpstreamModels,
  handleUpstreamPassthrough
};

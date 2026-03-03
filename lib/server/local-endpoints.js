'use strict';

async function handleLocalChatCompletions(ctx) {
  const {
    options,
    state,
    requestJson,
    routeKey,
    requestStartedAt,
    res,
    cooldownMs,
    localExecOpts,
    deps
  } = ctx;

  const {
    resolveRequestProvider,
    buildPromptFromChatRequest,
    chooseProxyAccount,
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
  } = deps;

  const provider = resolveRequestProvider(options, requestJson || {});
  const pool = provider === 'gemini' ? state.accounts.gemini : state.accounts.codex;
  const cursorKey = provider === 'gemini' ? 'gemini' : 'codex';
  const maxLocalAttempts = Math.min(options.localMaxAttempts, Math.max(1, pool.length));
  const attempted = new Set();
  state.metrics.providerCounts[provider] = Number(state.metrics.providerCounts[provider] || 0) + 1;
  const prompt = buildPromptFromChatRequest(requestJson || {});
  let lastDetail = '';

  for (let attempt = 0; attempt < maxLocalAttempts; attempt += 1) {
    const account = chooseProxyAccount(pool, state.cursors, cursorKey);
    if (!account || attempted.has(account.id)) continue;
    attempted.add(account.id);
    try {
      const exec = provider === 'gemini' ? state.executors.gemini : state.executors.codex;
      let text = '';
      await exec.schedule(async () => {
        if (provider === 'gemini') {
          const out = await runGeminiLocalCompletion(account, prompt, options.upstreamTimeoutMs, localExecOpts);
          text = out.text;
          (out.discoveredModels || []).forEach((m) => addModelToRegistry(state.modelRegistry, 'gemini', m));
          return;
        }
        text = await runCodexLocalCompletion(account, prompt, options.upstreamTimeoutMs, localExecOpts);
        addModelToRegistry(state.modelRegistry, 'codex', requestJson && requestJson.model);
      });

      const isStream = !!(requestJson && requestJson.stream);
      const model = String((requestJson && requestJson.model) || 'gpt-4o-mini');
      if (isStream) {
        writeSseChatCompletion(res, model, text);
        state.metrics.totalSuccess += 1;
        state.metrics.providerSuccess[provider] = Number(state.metrics.providerSuccess[provider] || 0) + 1;
        markProxyAccountSuccess(account);
        if (options.logRequests) {
          appendProxyRequestLog({
            at: new Date().toISOString(),
            route: routeKey,
            provider,
            accountId: account.id,
            status: 200,
            stream: true,
            durationMs: Date.now() - requestStartedAt
          });
        }
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(buildChatCompletionPayload(model, text)));
      state.metrics.totalSuccess += 1;
      state.metrics.providerSuccess[provider] = Number(state.metrics.providerSuccess[provider] || 0) + 1;
      markProxyAccountSuccess(account);
      if (options.logRequests) {
        appendProxyRequestLog({
          at: new Date().toISOString(),
          route: routeKey,
          provider,
          accountId: account.id,
          status: 200,
          stream: false,
          durationMs: Date.now() - requestStartedAt
        });
      }
      return;
    } catch (e) {
      const detail = String((e && e.message) || e);
      lastDetail = detail;
      if (detail.includes('timeout')) state.metrics.totalTimeouts += 1;
      const failureCooldownMs = getLocalFailureCooldownMs(detail, cooldownMs);
      const failureThreshold = failureCooldownMs > cooldownMs ? 1 : options.failureThreshold;
      markProxyAccountFailure(account, detail, failureCooldownMs, failureThreshold);
      if (!isRetriableLocalError(detail)) break;
    }
  }

  const detail = lastDetail || 'no_available_account';
  state.metrics.totalFailures += 1;
  state.metrics.providerFailures[provider] = Number(state.metrics.providerFailures[provider] || 0) + 1;
  pushMetricError(state.metrics, routeKey, provider, detail);
  if (options.logRequests) {
    appendProxyRequestLog({
      at: new Date().toISOString(),
      route: routeKey,
      provider,
      status: detail.includes('_queue_full') ? 429 : 502,
      error: detail,
      durationMs: Date.now() - requestStartedAt
    });
  }
  if (detail.includes('_queue_full')) {
    writeJson(res, 429, { ok: false, error: 'queue_full', detail });
    return;
  }
  writeJson(res, 502, { ok: false, error: 'local_backend_failed', detail });
}

async function handleLocalResponses(ctx) {
  const {
    options,
    state,
    requestJson,
    routeKey,
    requestStartedAt,
    res,
    cooldownMs,
    localExecOpts,
    deps
  } = ctx;

  const {
    resolveRequestProvider,
    buildPromptFromResponsesRequest,
    chooseProxyAccount,
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
  } = deps;

  const provider = resolveRequestProvider(options, requestJson || {});
  const pool = provider === 'gemini' ? state.accounts.gemini : state.accounts.codex;
  const cursorKey = provider === 'gemini' ? 'gemini' : 'codex';
  const maxLocalAttempts = Math.min(options.localMaxAttempts, Math.max(1, pool.length));
  const attempted = new Set();
  state.metrics.providerCounts[provider] = Number(state.metrics.providerCounts[provider] || 0) + 1;
  const prompt = buildPromptFromResponsesRequest(requestJson || {});
  let lastDetail = '';

  for (let attempt = 0; attempt < maxLocalAttempts; attempt += 1) {
    const account = chooseProxyAccount(pool, state.cursors, cursorKey);
    if (!account || attempted.has(account.id)) continue;
    attempted.add(account.id);
    try {
      const exec = provider === 'gemini' ? state.executors.gemini : state.executors.codex;
      let text = '';
      await exec.schedule(async () => {
        if (provider === 'gemini') {
          const out = await runGeminiLocalCompletion(account, prompt, options.upstreamTimeoutMs, localExecOpts);
          text = out.text;
          (out.discoveredModels || []).forEach((m) => addModelToRegistry(state.modelRegistry, 'gemini', m));
          return;
        }
        text = await runCodexLocalCompletion(account, prompt, options.upstreamTimeoutMs, localExecOpts);
        addModelToRegistry(state.modelRegistry, 'codex', requestJson && requestJson.model);
      });

      const model = String((requestJson && requestJson.model) || 'gpt-4o-mini');
      const payload = {
        id: `resp_${Date.now()}`,
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        status: 'completed',
        model,
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }]
      };
      state.metrics.totalSuccess += 1;
      state.metrics.providerSuccess[provider] = Number(state.metrics.providerSuccess[provider] || 0) + 1;
      markProxyAccountSuccess(account);
      if (options.logRequests) {
        appendProxyRequestLog({
          at: new Date().toISOString(),
          route: routeKey,
          provider,
          accountId: account.id,
          status: 200,
          durationMs: Date.now() - requestStartedAt
        });
      }
      writeJson(res, 200, payload);
      return;
    } catch (e) {
      const detail = String((e && e.message) || e);
      lastDetail = detail;
      if (detail.includes('timeout')) state.metrics.totalTimeouts += 1;
      const failureCooldownMs = getLocalFailureCooldownMs(detail, cooldownMs);
      const failureThreshold = failureCooldownMs > cooldownMs ? 1 : options.failureThreshold;
      markProxyAccountFailure(account, detail, failureCooldownMs, failureThreshold);
      if (!isRetriableLocalError(detail)) break;
    }
  }

  const detail = lastDetail || 'no_available_account';
  state.metrics.totalFailures += 1;
  state.metrics.providerFailures[provider] = Number(state.metrics.providerFailures[provider] || 0) + 1;
  pushMetricError(state.metrics, routeKey, provider, detail);
  if (options.logRequests) {
    appendProxyRequestLog({
      at: new Date().toISOString(),
      route: routeKey,
      provider,
      status: detail.includes('_queue_full') ? 429 : 502,
      error: detail,
      durationMs: Date.now() - requestStartedAt
    });
  }
  if (detail.includes('_queue_full')) {
    writeJson(res, 429, { ok: false, error: 'queue_full', detail });
    return;
  }
  writeJson(res, 502, { ok: false, error: 'local_backend_failed', detail });
}

module.exports = {
  handleLocalChatCompletions,
  handleLocalResponses
};

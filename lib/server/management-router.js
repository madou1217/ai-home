'use strict';

async function handleManagementRequest(ctx) {
  const {
    method,
    pathname,
    url,
    req,
    res,
    options,
    state,
    requiredManagementKey,
    deps
  } = ctx;

  const {
    parseAuthorizationBearer,
    writeJson,
    renderProxyStatusPage,
    buildManagementStatusPayload,
    buildManagementMetricsPayload,
    buildManagementModelsResponse,
    buildManagementAccountsPayload,
    loadServerRuntimeAccounts,
    applyReloadState,
    fetchModelsForAccount,
    getRegistryModelList,
    fs,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
  } = deps;

  if (!pathname.startsWith('/v0/management')) return false;

  if (requiredManagementKey) {
    const incoming = parseAuthorizationBearer(req.headers.authorization);
    if (incoming !== requiredManagementKey) {
      writeJson(res, 401, { ok: false, error: 'unauthorized_management' });
      return true;
    }
  }

  if (method === 'GET' && pathname === '/v0/management/ui') {
    const html = renderProxyStatusPage();
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
    return true;
  }
  if (method === 'GET' && pathname === '/v0/management/status') {
    writeJson(res, 200, buildManagementStatusPayload(state, options));
    return true;
  }
  if (method === 'GET' && pathname === '/v0/management/metrics') {
    writeJson(res, 200, buildManagementMetricsPayload(state));
    return true;
  }
  if (method === 'GET' && pathname === '/v0/management/models') {
    const out = await buildManagementModelsResponse({
      options,
      state,
      url,
      fetchModelsForAccount,
      getRegistryModelList
    });
    writeJson(res, out.status, out.payload);
    return true;
  }
  if (method === 'GET' && pathname === '/v0/management/accounts') {
    writeJson(res, 200, buildManagementAccountsPayload(state));
    return true;
  }
  if (method === 'POST' && pathname === '/v0/management/reload') {
    const runtimeAccounts = loadServerRuntimeAccounts({ fs, getToolAccountIds, getToolConfigDir, getProfileDir, checkStatus });
    applyReloadState(state, runtimeAccounts);
    const total = state.accounts.codex.length + state.accounts.gemini.length;
    writeJson(res, 200, {
      ok: true,
      reloaded: total,
      providers: {
        codex: state.accounts.codex.length,
        gemini: state.accounts.gemini.length
      }
    });
    return true;
  }
  if (method === 'POST' && pathname === '/v0/management/cooldown/clear') {
    [...(state.accounts.codex || []), ...(state.accounts.gemini || [])].forEach((a) => {
      a.cooldownUntil = 0;
      a.consecutiveFailures = 0;
    });
    writeJson(res, 200, { ok: true });
    return true;
  }
  if (method === 'POST' && pathname === '/v0/management/restart') {
    if (typeof deps.restartProxy !== 'function') {
      writeJson(res, 503, {
        ok: false,
        error: 'management_restart_unavailable'
      });
      return true;
    }
    try {
      const restartResult = await deps.restartProxy([]);
      const started = restartResult && restartResult.started ? restartResult.started : {};
      const stopped = restartResult && restartResult.stopped ? restartResult.stopped : {};
      writeJson(res, 200, {
        ok: true,
        action: 'restart',
        running: Boolean(restartResult && restartResult.running),
        pid: Number(started.pid || restartResult.pid || 0),
        started: Boolean(started.started),
        stopped: {
          stopped: Boolean(stopped.stopped),
          reason: stopped.reason || '',
          forced: Boolean(stopped.forced)
        },
        appliedConfig: started.appliedConfig || restartResult.appliedConfig || {}
      });
      return true;
    } catch (e) {
      writeJson(res, 500, {
        ok: false,
        error: 'management_restart_failed',
        message: e && e.message ? String(e.message) : 'unknown_error'
      });
      return true;
    }
  }

  writeJson(res, 404, { ok: false, error: 'management_not_found' });
  return true;
}

module.exports = {
  handleManagementRequest
};

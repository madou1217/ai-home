'use strict';

async function startLocalProxyServer(options, deps) {
  const {
    http,
    fs,
    processObj,
    logFile,
    createProxyServerState,
    loadProxyRuntimeAccounts,
    initProxyMetrics,
    createProviderExecutor,
    initModelRegistry,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus,
    parseAuthorizationBearer,
    writeJson,
    renderProxyStatusPage,
    buildManagementStatusPayload,
    buildManagementMetricsPayload,
    buildManagementModelsResponse,
    buildManagementAccountsPayload,
    applyReloadState,
    fetchModelsForAccount,
    getRegistryModelList,
    handleManagementRequest,
    handleV1Request,
    buildOpenAIModelsList,
    resolveRequestProvider,
    buildPromptFromChatRequest,
    buildPromptFromResponsesRequest,
    chooseProxyAccount,
    runGeminiLocalCompletion,
    runCodexLocalCompletion,
    addModelToRegistry,
    writeSseChatCompletion,
    buildChatCompletionPayload,
    markProxyAccountSuccess,
    markProxyAccountFailure,
    isRetriableLocalError,
    pushMetricError,
    handleLocalChatCompletions,
    handleLocalResponses,
    handleUpstreamModels,
    handleUpstreamPassthrough,
    FALLBACK_MODELS,
    fetchWithTimeout,
    readRequestBody,
    printProxyServeStartup
  } = deps;

  function appendProxyRequestLog(entry) {
    const line = JSON.stringify(entry);
    try {
      fs.appendFileSync(logFile, `${line}\n`);
    } catch (e) {}
  }

  const state = createProxyServerState(options, {
    loadProxyRuntimeAccounts,
    initProxyMetrics,
    createProviderExecutor,
    initModelRegistry,
    fs,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
  });

  const requiredClientKey = String(options.clientKey || '').trim();
  const requiredManagementKey = String(options.managementKey || '').trim();
  const cooldownMs = Math.max(1000, Number(options.cooldownMs) || 60000);
  const localExecOpts = { getProfileDir, cwd: processObj.cwd() };

  const server = http.createServer(async (req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname || '/';

    if (pathname === '/healthz') {
      return writeJson(res, 200, { ok: true, service: 'aih-proxy' });
    }

    const handledManagement = await handleManagementRequest({
      method,
      pathname,
      url,
      req,
      res,
      options,
      state,
      requiredManagementKey,
      deps: {
        parseAuthorizationBearer,
        writeJson,
        renderProxyStatusPage,
        buildManagementStatusPayload,
        buildManagementMetricsPayload,
        buildManagementModelsResponse,
        buildManagementAccountsPayload,
        loadProxyRuntimeAccounts,
        applyReloadState,
        fetchModelsForAccount,
        getRegistryModelList,
        fs,
        getToolAccountIds,
        getToolConfigDir,
        getProfileDir,
        checkStatus
      }
    });
    if (handledManagement) return;

    const handledV1 = await handleV1Request({
      req,
      res,
      method,
      pathname,
      options,
      state,
      requiredClientKey,
      cooldownMs,
      localExecOpts,
      deps: {
        parseAuthorizationBearer,
        writeJson,
        readRequestBody,
        getRegistryModelList,
        buildOpenAIModelsList,
        resolveRequestProvider,
        buildPromptFromChatRequest,
        buildPromptFromResponsesRequest,
        chooseProxyAccount,
        runGeminiLocalCompletion,
        runCodexLocalCompletion,
        addModelToRegistry,
        writeSseChatCompletion,
        buildChatCompletionPayload,
        markProxyAccountSuccess,
        markProxyAccountFailure,
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
      }
    });
    if (handledV1) return;

    return writeJson(res, 404, { ok: false, error: 'not_found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  printProxyServeStartup(options, state, requiredClientKey, requiredManagementKey);
}

module.exports = {
  startLocalProxyServer
};

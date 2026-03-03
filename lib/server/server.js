'use strict';

const {
  FALLBACK_MODELS,
  initModelRegistry,
  addModelToRegistry,
  getRegistryModelList,
  buildOpenAIModelsList
} = require('./models');
const { renderProxyStatusPage } = require('./status-page');
const {
  buildPromptFromChatRequest,
  buildPromptFromResponsesRequest,
  runCodexLocalCompletion,
  runGeminiLocalCompletion,
  initProxyMetrics,
  pushMetricError,
  getLocalFailureCooldownMs,
  isRetriableLocalError,
  createProviderExecutor
} = require('./local');
const {
  parseAuthorizationBearer,
  readRequestBody,
  writeJson,
  fetchWithTimeout,
  fetchModelsForAccount,
  buildChatCompletionPayload,
  writeSseChatCompletion
} = require('./http-utils');
const { loadProxyRuntimeAccounts } = require('./accounts');
const {
  resolveRequestProvider,
  chooseProxyAccount,
  markProxyAccountSuccess,
  markProxyAccountFailure
} = require('./router');
const {
  buildManagementStatusPayload,
  buildManagementMetricsPayload,
  buildManagementAccountsPayload,
  applyReloadState
} = require('./management');
const { buildManagementModelsResponse } = require('./model-endpoints');
const {
  handleLocalChatCompletions,
  handleLocalResponses
} = require('./local-endpoints');
const {
  handleUpstreamModels,
  handleUpstreamPassthrough
} = require('./upstream-endpoints');
const { handleManagementRequest } = require('./management-router');
const { handleV1Request } = require('./v1-router');
const {
  createProxyServerState,
  printProxyServeStartup
} = require('./server-runtime');

async function startLocalProxyServer(options, deps) {
  const {
    http,
    fs,
    aiHomeDir,
    processObj,
    logFile,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
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
    aiHomeDir,
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

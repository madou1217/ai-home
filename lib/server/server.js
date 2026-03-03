'use strict';
const crypto = require('node:crypto');

const {
  FALLBACK_MODELS,
  initModelRegistry,
  getRegistryModelList,
  buildOpenAIModelsList
} = require('./models');
const { renderProxyStatusPage } = require('./status-page');
const {
  initProxyMetrics,
  createProviderExecutor,
  pushMetricError
} = require('./local');
const {
  parseAuthorizationBearer,
  readRequestBody,
  writeJson,
  fetchWithTimeout,
  fetchModelsForAccount
} = require('./http-utils');
const { loadServerRuntimeAccounts } = require('./accounts');
const {
  chooseServerAccount,
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
  handleUpstreamModels,
  handleUpstreamPassthrough
} = require('./upstream-endpoints');
const { handleManagementRequest } = require('./management-router');
const { handleV1Request } = require('./v1-router');
const {
  createProxyServerState,
  printProxyServeStartup
} = require('./server-runtime');

const DEFAULT_MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 70_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 75_000;
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000;

function createRequestId() {
  try {
    return crypto.randomBytes(4).toString('hex');
  } catch (_error) {
    return String(Date.now());
  }
}

function requestClientIp(req) {
  const viaHeader = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (viaHeader) return viaHeader;
  return String((req.socket && req.socket.remoteAddress) || '').trim() || 'unknown';
}

async function startLocalServer(options, deps) {
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
    loadServerRuntimeAccounts,
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
  const maxRequestBodyBytes = Math.max(1024, Number(options.maxRequestBodyBytes) || DEFAULT_MAX_REQUEST_BODY_BYTES);

  const server = http.createServer(async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const clientIp = requestClientIp(req);
    res.setHeader('x-aih-request-id', requestId);

    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname || '/';
    const requestMeta = { requestId, clientIp, method, pathname };
    let loggedAccess = false;
    const logAccessOnce = () => {
      if (loggedAccess || !options.logRequests) return;
      loggedAccess = true;
      appendProxyRequestLog({
        at: new Date().toISOString(),
        kind: 'access',
        requestId,
        method,
        path: pathname,
        status: Number(res.statusCode || 0),
        durationMs: Date.now() - startedAt,
        clientIp
      });
    };
    res.once('finish', logAccessOnce);
    res.once('close', logAccessOnce);

    if (pathname === '/healthz') {
      return writeJson(res, 200, { ok: true, service: 'aih-server' });
    }
    if (pathname === '/readyz') {
      const codexReady = Array.isArray(state.accounts.codex) && state.accounts.codex.length > 0;
      const geminiReady = Array.isArray(state.accounts.gemini) && state.accounts.gemini.length > 0;
      return writeJson(res, 200, {
        ok: true,
        service: 'aih-server',
        ready: codexReady || geminiReady,
        accounts: {
          codex: state.accounts.codex.length,
          gemini: state.accounts.gemini.length
        }
      });
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
        loadServerRuntimeAccounts,
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
      maxRequestBodyBytes,
      requestMeta,
      deps: {
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
        fetchModelsForAccount,
        FALLBACK_MODELS,
        fetchWithTimeout
      }
    });
    if (handledV1) return;

    return writeJson(res, 404, { ok: false, error: 'not_found' });
  });
  server.requestTimeout = Math.max(1000, Number(options.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
  server.headersTimeout = Math.max(1000, Number(options.headersTimeoutMs) || DEFAULT_HEADERS_TIMEOUT_MS);
  server.keepAliveTimeout = Math.max(1000, Number(options.keepAliveTimeoutMs) || DEFAULT_KEEP_ALIVE_TIMEOUT_MS);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  let shuttingDown = false;
  const stopServer = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\x1b[90m[aih]\x1b[0m received ${signal}, shutting down server...`);
    server.close(() => {
      processObj.exit(0);
    });
    setTimeout(() => {
      processObj.exit(1);
    }, 5000).unref();
  };
  processObj.once('SIGTERM', () => stopServer('SIGTERM'));
  processObj.once('SIGINT', () => stopServer('SIGINT'));

  printProxyServeStartup(options, state, requiredClientKey, requiredManagementKey);
}

module.exports = {
  startLocalServer
};

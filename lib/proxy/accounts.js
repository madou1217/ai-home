'use strict';

const path = require('path');

function parseJsonFileSafe(filePath, fs) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function buildProxyCodexUploadPayload(authJson) {
  if (!authJson || typeof authJson !== 'object') return null;
  const tokens = authJson.tokens && typeof authJson.tokens === 'object' ? authJson.tokens : null;
  if (!tokens) return null;
  const refreshToken = String(tokens.refresh_token || '').trim();
  if (!refreshToken.startsWith('rt_')) return null;
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: String(tokens.id_token || ''),
      access_token: String(tokens.access_token || ''),
      refresh_token: refreshToken,
      account_id: String(tokens.account_id || '')
    },
    last_refresh: String(authJson.last_refresh || new Date().toISOString())
  };
}

function decodeJwtPayloadUnsafe(jwt) {
  const text = String(jwt || '').trim();
  const parts = text.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function loadCodexProxyAccounts(deps) {
  const { fs, getToolAccountIds, getToolConfigDir } = deps;
  const ids = getToolAccountIds('codex');
  const out = [];
  ids.forEach((id) => {
    const authPath = path.join(getToolConfigDir('codex', id), 'auth.json');
    const authJson = parseJsonFileSafe(authPath, fs);
    const payload = buildProxyCodexUploadPayload(authJson);
    if (!payload) return;
    const jwtPayload = decodeJwtPayloadUnsafe(payload.tokens.id_token);
    const email = jwtPayload && typeof jwtPayload.email === 'string' ? jwtPayload.email : '';
    out.push({
      id: String(id),
      email,
      accountId: String(payload.tokens.account_id || ''),
      accessToken: String(payload.tokens.access_token || ''),
      refreshToken: String(payload.tokens.refresh_token || ''),
      lastRefresh: String(payload.last_refresh || ''),
      cooldownUntil: 0
    });
  });
  return out;
}

function loadGeminiProxyAccounts(deps) {
  const { getToolAccountIds, getProfileDir, checkStatus } = deps;
  const ids = getToolAccountIds('gemini');
  const out = [];
  ids.forEach((id) => {
    const pDir = getProfileDir('gemini', id);
    const st = checkStatus('gemini', pDir);
    const configured = !!(st && st.configured);
    const accountName = st && st.accountName;
    if (!configured) return;
    out.push({
      id: String(id),
      email: accountName && accountName !== 'Unknown' ? accountName : '',
      accountId: String(id),
      provider: 'gemini',
      cooldownUntil: 0,
      consecutiveFailures: 0,
      successCount: 0,
      failCount: 0,
      lastError: ''
    });
  });
  return out;
}

function withRuntimeFields(accounts, provider) {
  return (Array.isArray(accounts) ? accounts : []).map((a) => ({
    ...a,
    provider,
    consecutiveFailures: Number(a && a.consecutiveFailures || 0),
    successCount: Number(a && a.successCount || 0),
    failCount: Number(a && a.failCount || 0),
    lastError: String((a && a.lastError) || '')
  }));
}

function loadProxyRuntimeAccounts(deps) {
  const codex = withRuntimeFields(loadCodexProxyAccounts({
    fs: deps.fs,
    getToolAccountIds: deps.getToolAccountIds,
    getToolConfigDir: deps.getToolConfigDir
  }), 'codex');
  const gemini = withRuntimeFields(loadGeminiProxyAccounts({
    getToolAccountIds: deps.getToolAccountIds,
    getProfileDir: deps.getProfileDir,
    checkStatus: deps.checkStatus
  }), 'gemini');
  return { codex, gemini };
}

module.exports = {
  loadCodexProxyAccounts,
  loadGeminiProxyAccounts,
  withRuntimeFields,
  loadProxyRuntimeAccounts
};

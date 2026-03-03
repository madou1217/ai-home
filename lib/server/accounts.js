'use strict';

const path = require('path');

const USAGE_SNAPSHOT_SCHEMA_VERSION = 2;
const USAGE_SOURCE_CODEX = 'codex_app_server';
const DEFAULT_THRESHOLD_PCT = 95;

function parseJsonFileSafe(filePath, fs) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function buildServerCodexUploadPayload(authJson) {
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

function readUsageThresholdPct(deps) {
  const { fs, aiHomeDir } = deps;
  if (!aiHomeDir) return DEFAULT_THRESHOLD_PCT;
  const configPath = path.join(aiHomeDir, 'usage-config.json');
  const parsed = parseJsonFileSafe(configPath, fs);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_THRESHOLD_PCT;
  const raw = parsed.threshold_pct ?? parsed.thresholdPct;
  const val = Number(raw);
  if (!Number.isFinite(val)) return DEFAULT_THRESHOLD_PCT;
  if (val < 1) return 1;
  if (val > 100) return 100;
  return Math.round(val);
}

function isTrustedCodexUsageSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.schemaVersion !== USAGE_SNAPSHOT_SCHEMA_VERSION) return false;
  if (snapshot.kind !== 'codex_oauth_status') return false;
  if (snapshot.source !== USAGE_SOURCE_CODEX) return false;
  if (!Array.isArray(snapshot.entries)) return false;
  return true;
}

function readCodexRemainingPctSnapshot(deps, id) {
  const { fs, getProfileDir } = deps;
  const profileDir = getProfileDir('codex', id);
  const cachePath = path.join(profileDir, '.aih_usage.json');
  const snapshot = parseJsonFileSafe(cachePath, fs);
  if (!isTrustedCodexUsageSnapshot(snapshot)) return null;
  const values = snapshot.entries
    .map((x) => Number(x && x.remainingPct))
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  return Math.max(0, Math.min(100, Math.min(...values)));
}

function loadCodexServerAccounts(deps) {
  const {
    fs,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
  } = deps;
  const ids = getToolAccountIds('codex');
  const thresholdPct = readUsageThresholdPct(deps);
  const minRemainingPct = Math.max(0, 100 - thresholdPct);
  const out = [];
  ids.forEach((id) => {
    const profileDir = getProfileDir('codex', id);
    if (typeof checkStatus === 'function') {
      const st = checkStatus('codex', profileDir);
      if (!st || !st.configured) return;
    }
    const authPath = path.join(getToolConfigDir('codex', id), 'auth.json');
    const authJson = parseJsonFileSafe(authPath, fs);
    const payload = buildServerCodexUploadPayload(authJson);
    if (!payload) return;
    const remainingPct = readCodexRemainingPctSnapshot(deps, id);
    if (Number.isFinite(remainingPct) && remainingPct <= minRemainingPct) return;
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

function loadGeminiServerAccounts(deps) {
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

function loadServerRuntimeAccounts(deps) {
  const codex = withRuntimeFields(loadCodexServerAccounts({
    fs: deps.fs,
    getToolAccountIds: deps.getToolAccountIds,
    getToolConfigDir: deps.getToolConfigDir,
    getProfileDir: deps.getProfileDir,
    checkStatus: deps.checkStatus,
    aiHomeDir: deps.aiHomeDir
  }), 'codex');
  const gemini = withRuntimeFields(loadGeminiServerAccounts({
    getToolAccountIds: deps.getToolAccountIds,
    getProfileDir: deps.getProfileDir,
    checkStatus: deps.checkStatus
  }), 'gemini');
  return { codex, gemini };
}

module.exports = {
  loadCodexServerAccounts,
  loadGeminiServerAccounts,
  withRuntimeFields,
  loadServerRuntimeAccounts
};

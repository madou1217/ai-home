'use strict';

function createUsageSnapshotService(options = {}) {
  const {
    fs,
    path,
    spawnSync,
    processObj,
    resolveCliPath,
    usageSnapshotSchemaVersion,
    usageRefreshStaleMs,
    usageSourceGemini,
    usageSourceCodex,
    usageSourceClaudeOauth,
    usageSourceClaudeAuthToken,
    getProfileDir,
    getToolConfigDir,
    writeUsageCache,
    readUsageCache
  } = options;

  function normalizeGeminiModelId(modelId) {
    if (!modelId) return '';
    return String(modelId).replace(/_vertex$/i, '');
  }

  function formatResetInFromIso(resetTime) {
    const target = new Date(resetTime).getTime();
    if (!Number.isFinite(target)) return 'unknown';
    const diffMs = Math.max(0, target - Date.now());
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'soon';
  }

  function formatResetInFromUnixSeconds(resetAtSeconds) {
    const resetSec = Number(resetAtSeconds);
    if (!Number.isFinite(resetSec) || resetSec <= 0) return 'unknown';
    const target = resetSec * 1000;
    const diffMs = Math.max(0, target - Date.now());
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'soon';
  }

  function parseGeminiQuotaBuckets(buckets) {
    if (!Array.isArray(buckets)) return null;
    const modelMap = new Map();
    buckets.forEach((bucket) => {
      if (!bucket || typeof bucket.modelId !== 'string') return;
      if (!Number.isFinite(bucket.remainingFraction)) return;
      if (!bucket.resetTime) return;

      const model = normalizeGeminiModelId(bucket.modelId);
      if (!model.startsWith('gemini-')) return;

      const remainingPct = Math.max(0, Math.min(100, bucket.remainingFraction * 100));
      const next = {
        model,
        remainingPct,
        resetIn: formatResetInFromIso(bucket.resetTime),
        resetTime: bucket.resetTime
      };

      const prev = modelMap.get(model);
      if (!prev) {
        modelMap.set(model, next);
        return;
      }

      if (next.remainingPct < prev.remainingPct) {
        modelMap.set(model, next);
        return;
      }

      if (next.remainingPct === prev.remainingPct && String(next.resetTime) < String(prev.resetTime)) {
        modelMap.set(model, next);
      }
    });

    const models = Array.from(modelMap.values())
      .sort((a, b) => a.model.localeCompare(b.model))
      .map(({ model, remainingPct, resetIn }) => ({ model, remainingPct, resetIn }));

    if (models.length === 0) return null;
    return {
      schemaVersion: usageSnapshotSchemaVersion,
      kind: 'gemini_oauth_stats',
      source: usageSourceGemini,
      capturedAt: Date.now(),
      models
    };
  }

  function refreshGeminiUsageSnapshot(cliName, id) {
    if (cliName !== 'gemini') return null;
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) return null;

    const geminiBin = resolveCliPath('gemini');
    if (!geminiBin) return null;

    const probeScript = `
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
(async () => {
  try {
    const bin = process.env.AIH_GEMINI_BIN;
    const distIndex = fs.realpathSync(bin);
    const srcRoot = path.join(path.dirname(distIndex), 'src');
    const { loadSettings } = await import(path.join(srcRoot, 'config/settings.js'));
    const { parseArguments, loadCliConfig } = await import(path.join(srcRoot, 'config/config.js'));
    process.argv = ['node', 'gemini'];
    const settings = loadSettings();
    const argv = await parseArguments(settings.merged);
    const config = await loadCliConfig(settings.merged, crypto.randomUUID(), argv, {
      projectHooks: settings.workspace?.settings?.hooks,
    });
    await config.initialize();
    const authType = settings.merged?.security?.auth?.selectedType;
    if (authType) await config.refreshAuth(authType);
    const quota = await config.refreshUserQuota();
    console.log('AIH_QUOTA_JSON_START');
    console.log(JSON.stringify({
      ok: true,
      buckets: quota?.buckets || [],
    }));
    console.log('AIH_QUOTA_JSON_END');
  } catch (err) {
    console.log('AIH_QUOTA_JSON_START');
    console.log(JSON.stringify({
      ok: false,
      error: String((err && err.message) || err),
    }));
    console.log('AIH_QUOTA_JSON_END');
  }
})();
`;

    const envOverrides = {
      ...processObj.env,
      HOME: sandboxDir,
      USERPROFILE: sandboxDir,
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(sandboxDir, '.gemini', 'settings.json'),
      AIH_GEMINI_BIN: geminiBin
    };

    try {
      const run = spawnSync(processObj.execPath, ['-e', probeScript], {
        cwd: processObj.cwd(),
        env: envOverrides,
        encoding: 'utf8',
        timeout: 45000,
        maxBuffer: 8 * 1024 * 1024
      });

      const joined = `${run.stdout || ''}\n${run.stderr || ''}`;
      const m = joined.match(/AIH_QUOTA_JSON_START\s*([\s\S]*?)\s*AIH_QUOTA_JSON_END/);
      if (!m) return null;

      const parsedOutput = JSON.parse(m[1]);
      if (!parsedOutput || parsedOutput.ok !== true) return null;

      const parsed = parseGeminiQuotaBuckets(parsedOutput.buckets || []);
      if (!parsed) return null;

      writeUsageCache(cliName, id, parsed);
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function formatCodexWindow(windowMinutes) {
    const minutes = Number(windowMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return String(windowMinutes);
    if (minutes % 1440 === 0) return `${Math.round(minutes / 1440)}days`;
    if (minutes % 60 === 0) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes)}m`;
  }

  function normalizeCodexRateLimitWindow(bucket) {
    if (!bucket || typeof bucket !== 'object') return null;
    const windowMinutesRaw = bucket.window_minutes ?? bucket.windowDurationMins;
    const usedPctRaw = bucket.used_percent ?? bucket.usedPercent;
    const resetsAtRaw = bucket.resets_at ?? bucket.resetsAt;

    const windowMinutes = Number(windowMinutesRaw);
    if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return null;

    const usedPctNumber = Number(usedPctRaw);
    const usedPct = Number.isFinite(usedPctNumber)
      ? Math.max(0, Math.min(100, usedPctNumber))
      : null;

    return {
      windowMinutes,
      usedPct,
      resetsAt: resetsAtRaw
    };
  }

  function parseCodexRateLimits(rateLimits, capturedAt, source) {
    if (!rateLimits || typeof rateLimits !== 'object') return null;
    const entries = [];
    ['primary', 'secondary'].forEach((bucketName) => {
      const normalizedBucket = normalizeCodexRateLimitWindow(rateLimits[bucketName]);
      if (!normalizedBucket) return;
      const { windowMinutes, usedPct, resetsAt } = normalizedBucket;
      const remainingPct = typeof usedPct === 'number'
        ? Math.max(0, Math.min(100, 100 - usedPct))
        : null;

      entries.push({
        bucket: bucketName,
        windowMinutes,
        window: formatCodexWindow(windowMinutes),
        remainingPct,
        resetIn: formatResetInFromUnixSeconds(resetsAt)
      });
    });

    if (entries.length === 0) return null;
    return {
      schemaVersion: usageSnapshotSchemaVersion,
      kind: 'codex_oauth_status',
      capturedAt: capturedAt || Date.now(),
      source: source || usageSourceCodex,
      entries
    };
  }

  function parseCodexAccountFallback(account, capturedAt, source) {
    if (!account || typeof account !== 'object') return null;
    const planType = String(account.planType || '').trim();
    const email = String(account.email || '').trim();
    const labelParts = [];
    if (planType) labelParts.push(`plan:${planType}`);
    if (email) labelParts.push(email);
    const fallbackLabel = labelParts.join(' ').trim() || 'account';
    return {
      schemaVersion: usageSnapshotSchemaVersion,
      kind: 'codex_oauth_status',
      capturedAt: capturedAt || Date.now(),
      source: source || usageSourceCodex,
      entries: [{
        bucket: 'account',
        windowMinutes: 0,
        window: fallbackLabel,
        remainingPct: null,
        resetIn: 'unknown'
      }]
    };
  }

  function refreshCodexUsageSnapshotFromAppServer(cliName, id) {
    if (cliName !== 'codex') return null;
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) return null;

    const codexBin = resolveCliPath('codex');
    if (!codexBin) return null;

    const probeScript = `
const { spawn } = require('child_process');

const codexBin = process.env.AIH_CODEX_BIN;
const codexHome = process.env.AIH_CODEX_HOME;
const sandboxDir = process.env.AIH_CODEX_SANDBOX;

const env = {
  ...process.env,
  CODEX_HOME: codexHome,
  HOME: sandboxDir,
  USERPROFILE: sandboxDir
};

function print(payload) {
  console.log('AIH_CODEX_RATE_LIMIT_JSON_START');
  console.log(JSON.stringify(payload));
  console.log('AIH_CODEX_RATE_LIMIT_JSON_END');
}

let done = false;
function finish(payload) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try {
    child.kill('SIGTERM');
  } catch (e) {}
  print(payload);
}

function quoteForCmd(arg) {
  const text = String(arg || '');
  if (!text) return '""';
  if (/^[A-Za-z0-9._:/\\\\-]+$/.test(text)) return text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function startCodexAppServer() {
  if (process.platform === 'win32') {
    const line = [quoteForCmd(codexBin), 'app-server', '--listen', 'stdio://'].join(' ');
    return spawn('cmd.exe', ['/d', '/s', '/c', line], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    });
  }
  return spawn(codexBin, ['app-server', '--listen', 'stdio://'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  });
}

const child = startCodexAppServer();

let stdoutBuf = '';
let stderrBuf = '';
let accountReadRequested = false;
const timer = setTimeout(() => {
  finish({ ok: false, error: 'timeout' });
}, 9000);

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');

child.stderr.on('data', (chunk) => {
  stderrBuf += String(chunk || '');
});

child.stdout.on('data', (chunk) => {
  stdoutBuf += String(chunk || '');
  let idx = -1;
  while ((idx = stdoutBuf.indexOf('\\n')) >= 0) {
    const line = stdoutBuf.slice(0, idx).trim();
    stdoutBuf = stdoutBuf.slice(idx + 1);
    if (!line) continue;
    let msg = null;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (msg && msg.id === 'aih_init') {
      child.stdin.write(JSON.stringify({ method: 'account/rateLimits/read', id: 'aih_rate' }) + '\\n');
      continue;
    }
    if (msg && msg.id === 'aih_rate') {
      if (msg.result && msg.result.rateLimits) {
        finish({ ok: true, rateLimits: msg.result.rateLimits });
      } else {
        if (!accountReadRequested) {
          accountReadRequested = true;
          child.stdin.write(JSON.stringify({ method: 'account/read', id: 'aih_account', params: {} }) + '\\n');
        } else if (msg.error) {
          finish({ ok: false, error: String(msg.error.message || msg.error.code || 'rate_limit_read_failed') });
        } else {
          finish({ ok: false, error: 'empty_rate_limit_response' });
        }
      }
      return;
    }
    if (msg && msg.id === 'aih_account') {
      if (msg.result && msg.result.account) {
        finish({ ok: true, account: msg.result.account, fallback: 'account_read' });
      } else if (msg.error) {
        finish({ ok: false, error: String(msg.error.message || msg.error.code || 'account_read_failed') });
      } else {
        finish({ ok: false, error: 'empty_account_response' });
      }
      return;
    }
  }
});

child.on('error', (err) => {
  finish({ ok: false, error: String((err && err.message) || err) });
});

child.on('exit', (code) => {
  if (done) return;
  const detail = stderrBuf || stdoutBuf || '';
  finish({ ok: false, error: code === 0 ? 'no_rate_limit_response' : ('app_server_exit_' + String(code)), detail });
});

child.stdin.write(JSON.stringify({
  method: 'initialize',
  id: 'aih_init',
  params: {
    clientInfo: { name: 'aih-probe', version: '1.0.0' },
    capabilities: null
  }
}) + '\\n');
`;

    const envOverrides = {
      ...processObj.env,
      AIH_CODEX_BIN: codexBin,
      AIH_CODEX_HOME: path.join(sandboxDir, '.codex'),
      AIH_CODEX_SANDBOX: sandboxDir
    };

    try {
      const run = spawnSync(processObj.execPath, ['-e', probeScript], {
        cwd: processObj.cwd(),
        env: envOverrides,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024
      });

      const joined = `${run.stdout || ''}\n${run.stderr || ''}`;
      const m = joined.match(/AIH_CODEX_RATE_LIMIT_JSON_START\s*([\s\S]*?)\s*AIH_CODEX_RATE_LIMIT_JSON_END/);
      if (!m) return null;

      const parsedOutput = JSON.parse(m[1]);
      if (!parsedOutput || parsedOutput.ok !== true) return null;

      let parsed = null;
      if (parsedOutput.rateLimits) {
        parsed = parseCodexRateLimits(parsedOutput.rateLimits, Date.now(), usageSourceCodex);
      }
      if (!parsed && parsedOutput.account) {
        parsed = parseCodexAccountFallback(parsedOutput.account, Date.now(), usageSourceCodex);
      }
      if (!parsed) return null;

      writeUsageCache(cliName, id, parsed);
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function refreshCodexUsageSnapshot(cliName, id) {
    if (cliName !== 'codex') return null;
    return refreshCodexUsageSnapshotFromAppServer(cliName, id);
  }

  function toPercentNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num <= 1) return Math.max(0, Math.min(100, num * 100));
    return Math.max(0, Math.min(100, num));
  }

  function readJsonFileSafe(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
      return null;
    }
  }

  function parseClaudeUsagePayload(payload, capturedAt, source) {
    if (!payload || typeof payload !== 'object') return null;
    const fiveHourRaw = payload.five_hour || payload.fiveHour || null;
    const sevenDayRaw = payload.seven_day || payload.sevenDay || null;
    const entries = [];

    const fiveHourUtil = fiveHourRaw ? toPercentNumber(fiveHourRaw.utilization) : null;
    if (typeof fiveHourUtil === 'number') {
      entries.push({
        bucket: 'five_hour',
        windowMinutes: 300,
        window: '5h',
        remainingPct: Math.max(0, Math.min(100, 100 - fiveHourUtil)),
        resetIn: formatResetInFromIso(fiveHourRaw.resets_at || fiveHourRaw.resetsAt || null)
      });
    }

    const sevenDayUtil = sevenDayRaw ? toPercentNumber(sevenDayRaw.utilization) : null;
    if (typeof sevenDayUtil === 'number') {
      entries.push({
        bucket: 'seven_day',
        windowMinutes: 10080,
        window: '7days',
        remainingPct: Math.max(0, Math.min(100, 100 - sevenDayUtil)),
        resetIn: formatResetInFromIso(sevenDayRaw.resets_at || sevenDayRaw.resetsAt || null)
      });
    }

    if (entries.length === 0) return null;
    return {
      schemaVersion: usageSnapshotSchemaVersion,
      kind: 'claude_oauth_usage',
      capturedAt: capturedAt || Date.now(),
      source: source || usageSourceClaudeOauth,
      entries
    };
  }

  function normalizeBaseUrl(baseUrlRaw, fallback) {
    if (typeof baseUrlRaw !== 'string') return fallback;
    const trimmed = baseUrlRaw.trim();
    return trimmed || fallback;
  }

  function isLocalHostBaseUrl(baseUrl) {
    return /^https?:\/\/(localhost|127(?:\.\d+){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(String(baseUrl || ''));
  }

  function getClaudeUsageAuthForSandbox(cliName, id) {
    if (cliName !== 'claude') return null;
    const claudeConfigDir = getToolConfigDir(cliName, id);
    const credentialsPath = path.join(claudeConfigDir, '.credentials.json');
    if (fs.existsSync(credentialsPath)) {
      const payload = readJsonFileSafe(credentialsPath);
      const oauth = payload && (payload.claudeAiOauth || payload.claude_ai_oauth);
      const token = oauth && (oauth.accessToken || oauth.access_token);
      if (token && typeof token === 'string' && token.trim()) {
        return {
          token: token.trim(),
          baseUrl: 'https://api.anthropic.com',
          source: usageSourceClaudeOauth,
          mode: 'oauth_credentials'
        };
      }
    }

    const settingsPath = path.join(claudeConfigDir, 'settings.json');
    const settings = readJsonFileSafe(settingsPath);
    const env = settings && settings.env && typeof settings.env === 'object' ? settings.env : null;
    const settingsToken = env && typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN.trim() : '';
    if (settingsToken) {
      const baseUrl = normalizeBaseUrl(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
      return {
        token: settingsToken,
        baseUrl,
        source: usageSourceClaudeAuthToken,
        mode: 'settings_env_token',
        isLocalProxy: isLocalHostBaseUrl(baseUrl)
      };
    }

    return null;
  }

  function refreshClaudeUsageSnapshot(cliName, id) {
    if (cliName !== 'claude') return null;
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) return null;
    const auth = getClaudeUsageAuthForSandbox(cliName, id);
    if (!auth || !auth.token) return null;

    const probeScript = `
const token = process.env.AIH_CLAUDE_OAUTH_TOKEN;
const baseUrlRaw = process.env.AIH_CLAUDE_API_BASE_URL || 'https://api.anthropic.com';
const baseUrl = String(baseUrlRaw).replace(/\\/+$/, '');
const url = baseUrl + '/api/oauth/usage';
const timeoutMs = Number(process.env.AIH_CLAUDE_USAGE_TIMEOUT_MS || '8000');

function print(payload) {
  console.log('AIH_CLAUDE_USAGE_JSON_START');
  console.log(JSON.stringify(payload));
  console.log('AIH_CLAUDE_USAGE_JSON_END');
}

(async () => {
  if (!token) {
    print({ ok: false, error: 'missing_token' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'aih/1.0'
      },
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!res.ok) {
      print({ ok: false, status: res.status, body: json || text });
      return;
    }
    print({ ok: true, payload: json });
  } catch (e) {
    print({ ok: false, error: String((e && e.message) || e) });
  } finally {
    clearTimeout(timer);
  }
})();
`;

    try {
      const run = spawnSync(processObj.execPath, ['-e', probeScript], {
        cwd: processObj.cwd(),
        env: {
          ...processObj.env,
          HOME: sandboxDir,
          USERPROFILE: sandboxDir,
          CLAUDE_CONFIG_DIR: getToolConfigDir(cliName, id),
          AIH_CLAUDE_OAUTH_TOKEN: auth.token,
          AIH_CLAUDE_API_BASE_URL: auth.baseUrl || 'https://api.anthropic.com',
          AIH_CLAUDE_USAGE_TIMEOUT_MS: '8000'
        },
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024
      });
      const joined = `${run.stdout || ''}\n${run.stderr || ''}`;
      const m = joined.match(/AIH_CLAUDE_USAGE_JSON_START\\s*([\\s\\S]*?)\\s*AIH_CLAUDE_USAGE_JSON_END/);
      if (!m) return null;
      const parsed = JSON.parse(m[1]);
      if (!parsed || parsed.ok !== true || !parsed.payload) return null;

      const snapshot = parseClaudeUsagePayload(parsed.payload, Date.now(), auth.source || usageSourceClaudeOauth);
      if (!snapshot) return null;
      writeUsageCache(cliName, id, snapshot);
      return snapshot;
    } catch (_error) {
      return null;
    }
  }

  function ensureUsageSnapshot(cliName, id, cache) {
    if (cliName !== 'gemini' && cliName !== 'codex' && cliName !== 'claude') return cache || null;
    if (cliName === 'claude') {
      const isMissing = !cache;
      const isStale = !cache || !cache.capturedAt || (Date.now() - cache.capturedAt > usageRefreshStaleMs);
      if (!isMissing && !isStale) return cache;
      const refreshed = refreshClaudeUsageSnapshot(cliName, id);
      return refreshed || cache || null;
    }
    if (cliName === 'codex') {
      const refreshed = refreshCodexUsageSnapshot(cliName, id);
      return refreshed || cache || null;
    }
    const isMissing = !cache;
    const isStale = !cache || !cache.capturedAt || (Date.now() - cache.capturedAt > usageRefreshStaleMs);
    if (!isMissing && !isStale) return cache;
    const refreshed = refreshGeminiUsageSnapshot(cliName, id);
    return refreshed || cache || null;
  }

  return {
    ensureUsageSnapshot,
    getClaudeUsageAuthForSandbox
  };
}

module.exports = {
  createUsageSnapshotService
};

#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline-sync');
const pty = require('node-pty');
const { execSync, spawnSync, spawn } = require('child_process');
const http = require('http');
const {
  FALLBACK_MODELS,
  initModelRegistry,
  addModelToRegistry,
  getRegistryModelList,
  buildOpenAIModelsList
} = require('../lib/proxy/models');
const { renderProxyStatusPage } = require('../lib/proxy/status-page');
const {
  buildPromptFromChatRequest,
  buildPromptFromResponsesRequest,
  runCodexLocalCompletion,
  runGeminiLocalCompletion,
  initProxyMetrics,
  pushMetricError,
  isRetriableLocalError,
  createProviderExecutor
} = require('../lib/proxy/local');
const {
  parseProxySyncArgs,
  parseProxyServeArgs,
  parseProxyEnvArgs
} = require('../lib/proxy/args');
const { createProxyDaemonController } = require('../lib/proxy/daemon');
const { runProxyCommand } = require('../lib/proxy/command-handler');

// Configurations
const HOST_HOME_DIR = (() => {
  try {
    const userInfo = os.userInfo();
    if (userInfo && userInfo.homedir) return userInfo.homedir;
  } catch (e) {
    // fallback below
  }
  return os.homedir();
})();

const AI_HOME_DIR = path.join(HOST_HOME_DIR, '.ai_home');
const PROFILES_DIR = path.join(AI_HOME_DIR, 'profiles');
const AIH_PROXY_PID_FILE = path.join(AI_HOME_DIR, 'proxy.pid');
const AIH_PROXY_LOG_FILE = path.join(AI_HOME_DIR, 'proxy.log');
const AIH_PROXY_LAUNCHD_LABEL = 'com.aih.proxy';
const AIH_PROXY_LAUNCHD_PLIST = path.join(HOST_HOME_DIR, 'Library', 'LaunchAgents', `${AIH_PROXY_LAUNCHD_LABEL}.plist`);

const CLI_CONFIGS = {
  gemini: { globalDir: '.gemini', loginArgs: ['auth'], pkg: '@google/gemini-cli', envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  claude: { globalDir: '.claude', loginArgs: ['login'], pkg: '@anthropic-ai/claude-code', envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'] },
  codex:  { globalDir: '.codex',  loginArgs: ['login'], pkg: '@openai/codex', envKeys: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'] }
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(PROFILES_DIR);
const proxyDaemon = createProxyDaemonController({
  ensureDir,
  parseProxyServeArgs,
  aiHomeDir: AI_HOME_DIR,
  pidFile: AIH_PROXY_PID_FILE,
  logFile: AIH_PROXY_LOG_FILE,
  launchdLabel: AIH_PROXY_LAUNCHD_LABEL,
  launchdPlist: AIH_PROXY_LAUNCHD_PLIST,
  entryScriptPath: __filename,
  nodeExecPath: process.execPath
});

function getProfileDir(cliName, id) {
  return path.join(PROFILES_DIR, cliName, String(id));
}

function askYesNo(query, defaultYes = true) {
  const promptStr = defaultYes ? `${query} [Y/n]: ` : `${query} [y/N]: `;
  const ans = readline.question(promptStr).trim().toLowerCase();
  if (ans === '') return defaultYes;
  return ans === 'y' || ans === 'yes';
}

function stripAnsi(string) {
  return string.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

const SESSION_PATH_HINTS = ['session', 'history', 'chat', 'conversation', 'project', 'recent', 'archive', 'snapshot'];
const AUTH_PATH_HINTS = [
  'auth',
  'oauth',
  'token',
  'credential',
  'api_key',
  'apikey',
  'google_accounts',
  'keyring',
  'secret'
];
const USAGE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const USAGE_REFRESH_STALE_MS = 5 * 60 * 1000;
const USAGE_SNAPSHOT_SCHEMA_VERSION = 2;
const USAGE_SOURCE_GEMINI = 'gemini_refresh_user_quota';
const USAGE_SOURCE_CODEX = 'codex_app_server';
const USAGE_SOURCE_CLAUDE_OAUTH = 'claude_oauth_usage_api';
const USAGE_SOURCE_CLAUDE_AUTH_TOKEN = 'claude_auth_token_usage_api';
const TRUSTED_CLAUDE_USAGE_SOURCES = new Set([
  USAGE_SOURCE_CLAUDE_OAUTH,
  USAGE_SOURCE_CLAUDE_AUTH_TOKEN
]);
const LIST_PAGE_SIZE = 10;
const EXPORT_MAGIC = 'AIH_EXPORT_V2:';
const EXPORT_VERSION = 2;
const AGE_SSH_KEY_TYPES = new Set(['ssh-ed25519', 'ssh-rsa']);
const SESSION_STORE_ALLOWLIST = {
  codex: ['sessions', 'history.jsonl', 'archived_sessions', 'shell_snapshots'],
  claude: ['history.jsonl', 'projects', 'shell-snapshots', '.claude.json'],
  // Gemini /resume sessions are stored under .gemini/tmp/<project>/chats.
  gemini: ['history', 'projects.json', 'tmp']
};
const SESSION_STORE_METADATA_PATTERNS = {
  codex: [
    /^\.codex-global-state\.json$/i,
    /^state_\d+\.sqlite(?:-(?:shm|wal))?$/i
  ]
};

function getToolConfigDir(cliName, id) {
  const globalFolder = CLI_CONFIGS[cliName] ? CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
  return path.join(getProfileDir(cliName, id), globalFolder);
}

function isLikelySessionName(name) {
  const n = String(name || '').toLowerCase();
  return SESSION_PATH_HINTS.some((hint) => n.includes(hint));
}

function isSensitiveName(name) {
  const n = String(name || '').toLowerCase();
  return AUTH_PATH_HINTS.some((hint) => n.includes(hint));
}

function isSessionMetadataName(cliName, name) {
  const patterns = SESSION_STORE_METADATA_PATTERNS[cliName] || [];
  return patterns.some((re) => re.test(String(name || '')));
}

function getGlobalToolConfigRoot(cliName) {
  const globalFolder = CLI_CONFIGS[cliName] ? CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
  return path.join(HOST_HOME_DIR, globalFolder);
}

function getSessionStoreRoot(cliName) {
  // Keep a single native session source per CLI so direct native runs and
  // aih sandbox runs always point to the same resume/session store.
  return getGlobalToolConfigRoot(cliName);
}

function getDirEntriesSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map((x) => x.name);
  } catch (e) {
    return [];
  }
}

function getSessionEntriesForStore(cliName, toolConfigDir) {
  const allowlist = SESSION_STORE_ALLOWLIST[cliName] || [];
  const candidates = new Set(allowlist);
  getDirEntriesSafe(toolConfigDir).forEach((name) => {
    if ((isLikelySessionName(name) || isSessionMetadataName(cliName, name)) && !isSensitiveName(name)) {
      candidates.add(name);
    }
  });
  getDirEntriesSafe(getSessionStoreRoot(cliName)).forEach((name) => {
    if ((allowlist.includes(name) || isLikelySessionName(name) || isSessionMetadataName(cliName, name)) && !isSensitiveName(name)) {
      candidates.add(name);
    }
  });
  return Array.from(candidates).filter((name) => !isSensitiveName(name));
}

function shouldCopyFileIntoSessionStore(srcPath, storePath) {
  try {
    if (!fs.existsSync(storePath)) return true;
    const srcStat = fs.statSync(srcPath);
    const dstStat = fs.statSync(storePath);
    if (srcStat.mtimeMs > dstStat.mtimeMs) return true;
    if (srcStat.mtimeMs === dstStat.mtimeMs && srcStat.size > dstStat.size) return true;
    return false;
  } catch (e) {
    return true;
  }
}

function createSymlinkSafe(targetPath, linkPath, isDir) {
  try {
    ensureDir(path.dirname(linkPath));
    if (process.platform === 'win32') {
      fs.symlinkSync(targetPath, linkPath, isDir ? 'junction' : 'file');
    } else {
      fs.symlinkSync(targetPath, linkPath, isDir ? 'dir' : 'file');
    }
    return true;
  } catch (e) {
    return false;
  }
}

function migrateAndLinkSessionEntry(srcPath, storePath) {
  let migrated = 0;
  let linked = 0;
  let isDir = false;

  try {
    if (fs.existsSync(srcPath)) {
      const st = fs.lstatSync(srcPath);
      if (st.isSymbolicLink()) {
        const real = path.resolve(path.dirname(srcPath), fs.readlinkSync(srcPath));
        if (path.resolve(real) !== path.resolve(storePath)) {
          if (!fs.existsSync(storePath) && fs.existsSync(real)) {
            fse.copySync(real, storePath, { overwrite: true, errorOnExist: false });
            migrated += 1;
          }
          fs.unlinkSync(srcPath);
        } else {
          return { migrated, linked: 1 };
        }
      } else {
        isDir = st.isDirectory();
        if (!fs.existsSync(storePath)) {
          fse.moveSync(srcPath, storePath, { overwrite: true });
          migrated += 1;
        } else {
          if (st.isDirectory()) {
            fse.copySync(srcPath, storePath, { overwrite: true, errorOnExist: false });
            fse.removeSync(srcPath);
          } else {
            if (shouldCopyFileIntoSessionStore(srcPath, storePath)) {
              fs.copyFileSync(srcPath, storePath);
            }
            fs.unlinkSync(srcPath);
          }
          migrated += 1;
        }
      }
    }

    if (fs.existsSync(storePath) && !fs.existsSync(srcPath)) {
      const dstStat = fs.lstatSync(storePath);
      isDir = dstStat.isDirectory();
      if (createSymlinkSafe(storePath, srcPath, isDir)) linked += 1;
    }
  } catch (e) {
    return { migrated, linked };
  }

  return { migrated, linked };
}

function ensureSessionStoreLinks(cliName, id) {
  const toolConfigDir = getToolConfigDir(cliName, id);
  if (!fs.existsSync(toolConfigDir)) return { migrated: 0, linked: 0 };
  const storeRoot = getSessionStoreRoot(cliName);
  try {
    const resolvedTool = path.resolve(fs.realpathSync(toolConfigDir));
    const resolvedStore = path.resolve(fs.realpathSync(storeRoot));
    if (resolvedTool === resolvedStore) {
      return { migrated: 0, linked: 0 };
    }
  } catch (e) {
    // Continue best-effort linking if realpath cannot be resolved yet.
  }
  ensureDir(storeRoot);

  let migrated = 0;
  let linked = 0;
  const entries = getSessionEntriesForStore(cliName, toolConfigDir);
  entries.forEach((entryName) => {
    const srcPath = path.join(toolConfigDir, entryName);
    const storePath = path.join(storeRoot, entryName);
    const res = migrateAndLinkSessionEntry(srcPath, storePath);
    migrated += res.migrated;
    linked += res.linked;
  });

  return { migrated, linked };
}

function importLegacySessionsToTarget(cliName, sourceConfigDir, targetConfigDir) {
  if (!fs.existsSync(sourceConfigDir)) return 0;
  if (!targetConfigDir) return 0;
  ensureDir(targetConfigDir);
  let imported = 0;

  const entries = getSessionEntriesForStore(cliName, sourceConfigDir);
  entries.forEach((entryName) => {
    const srcPath = path.join(sourceConfigDir, entryName);
    if (!fs.existsSync(srcPath)) return;
    const targetPath = path.join(targetConfigDir, entryName);
    try {
      fse.copySync(srcPath, targetPath, { overwrite: true, errorOnExist: false });
      imported += 1;
    } catch (e) {
      // Best effort import.
    }
  });
  return imported;
}

function getUsageCachePath(cliName, id) {
  return path.join(getProfileDir(cliName, id), '.aih_usage.json');
}

function writeUsageCache(cliName, id, payload) {
  try {
    fs.writeFileSync(getUsageCachePath(cliName, id), JSON.stringify(payload, null, 2));
  } catch (e) {
    // best effort cache
  }
}

function readUsageCache(cliName, id) {
  const p = getUsageCachePath(cliName, id);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!isTrustedUsageSnapshot(cliName, parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function isTrustedUsageSnapshot(cliName, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.schemaVersion !== USAGE_SNAPSHOT_SCHEMA_VERSION) return false;
  if (!snapshot.capturedAt || !Number.isFinite(Number(snapshot.capturedAt))) return false;

  if (cliName === 'gemini') {
    return snapshot.kind === 'gemini_oauth_stats' && snapshot.source === USAGE_SOURCE_GEMINI;
  }
  if (cliName === 'codex') {
    return snapshot.kind === 'codex_oauth_status' && snapshot.source === USAGE_SOURCE_CODEX;
  }
  if (cliName === 'claude') {
    return snapshot.kind === 'claude_oauth_usage' && TRUSTED_CLAUDE_USAGE_SOURCES.has(snapshot.source);
  }

  // No trusted usage-remaining source implemented yet for other CLIs.
  return false;
}

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

    // Prefer the lower remaining percentage as the most conservative status.
    if (next.remainingPct < prev.remainingPct) {
      modelMap.set(model, next);
      return;
    }

    // If same percentage, prefer the nearest reset window.
    if (next.remainingPct === prev.remainingPct && String(next.resetTime) < String(prev.resetTime)) {
      modelMap.set(model, next);
    }
  });

  const models = Array.from(modelMap.values())
    .sort((a, b) => a.model.localeCompare(b.model))
    .map(({ model, remainingPct, resetIn }) => ({ model, remainingPct, resetIn }));

  if (models.length === 0) return null;
  return {
    schemaVersion: USAGE_SNAPSHOT_SCHEMA_VERSION,
    kind: 'gemini_oauth_stats',
    source: USAGE_SOURCE_GEMINI,
    capturedAt: Date.now(),
    models
  };
}

function refreshGeminiUsageSnapshot(cliName, id) {
  if (cliName !== 'gemini') return null;
  const sandboxDir = getProfileDir(cliName, id);
  if (!fs.existsSync(sandboxDir)) return null;

  let geminiBin = '';
  try {
    geminiBin = execSync('which gemini', { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
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
    ...process.env,
    HOME: sandboxDir,
    USERPROFILE: sandboxDir,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(sandboxDir, '.gemini', 'settings.json'),
    AIH_GEMINI_BIN: geminiBin
  };

  try {
    const run = spawnSync(process.execPath, ['-e', probeScript], {
      cwd: process.cwd(),
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
  } catch (e) {
    return null;
  }
}

function ensureUsageSnapshot(cliName, id, cache) {
  if (cliName !== 'gemini' && cliName !== 'codex' && cliName !== 'claude') return cache || null;
  if (cliName === 'claude') {
    const isMissing = !cache;
    const isStale = !cache || !cache.capturedAt || (Date.now() - cache.capturedAt > USAGE_REFRESH_STALE_MS);
    if (!isMissing && !isStale) return cache;
    const refreshed = refreshClaudeUsageSnapshot(cliName, id);
    return refreshed || cache || null;
  }
  if (cliName === 'codex') {
    // Codex rollout snapshots are cheap to scan and must stay account-accurate.
    const refreshed = refreshCodexUsageSnapshot(cliName, id);
    return refreshed || cache || null;
  }
  const isMissing = !cache;
  const isStale = !cache || !cache.capturedAt || (Date.now() - cache.capturedAt > USAGE_REFRESH_STALE_MS);
  if (!isMissing && !isStale) return cache;
  const refreshed = refreshGeminiUsageSnapshot(cliName, id);
  return refreshed || cache || null;
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
    schemaVersion: USAGE_SNAPSHOT_SCHEMA_VERSION,
    kind: 'codex_oauth_status',
    capturedAt: capturedAt || Date.now(),
    source: source || USAGE_SOURCE_CODEX,
    entries
  };
}

function refreshCodexUsageSnapshotFromAppServer(cliName, id) {
  if (cliName !== 'codex') return null;
  const sandboxDir = getProfileDir(cliName, id);
  if (!fs.existsSync(sandboxDir)) return null;

  let codexBin = '';
  try {
    codexBin = execSync('which codex', { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
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

const child = spawn(codexBin, ['app-server', '--listen', 'stdio://'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env
});

let stdoutBuf = '';
let stderrBuf = '';
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
      } else if (msg.error) {
        finish({ ok: false, error: String(msg.error.message || msg.error.code || 'rate_limit_read_failed') });
      } else {
        finish({ ok: false, error: 'empty_rate_limit_response' });
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
    ...process.env,
    AIH_CODEX_BIN: codexBin,
    AIH_CODEX_HOME: path.join(sandboxDir, '.codex'),
    AIH_CODEX_SANDBOX: sandboxDir
  };

  try {
    const run = spawnSync(process.execPath, ['-e', probeScript], {
      cwd: process.cwd(),
      env: envOverrides,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024
    });

    const joined = `${run.stdout || ''}\n${run.stderr || ''}`;
    const m = joined.match(/AIH_CODEX_RATE_LIMIT_JSON_START\s*([\s\S]*?)\s*AIH_CODEX_RATE_LIMIT_JSON_END/);
    if (!m) return null;

    const parsedOutput = JSON.parse(m[1]);
    if (!parsedOutput || parsedOutput.ok !== true || !parsedOutput.rateLimits) return null;

    const parsed = parseCodexRateLimits(parsedOutput.rateLimits, Date.now(), 'codex_app_server');
    if (!parsed) return null;

    writeUsageCache(cliName, id, parsed);
    return parsed;
  } catch (e) {
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
  } catch (e) {
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
    schemaVersion: USAGE_SNAPSHOT_SCHEMA_VERSION,
    kind: 'claude_oauth_usage',
    capturedAt: capturedAt || Date.now(),
    source: source || USAGE_SOURCE_CLAUDE_OAUTH,
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
        source: USAGE_SOURCE_CLAUDE_OAUTH,
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
      source: USAGE_SOURCE_CLAUDE_AUTH_TOKEN,
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
    const run = spawnSync(process.execPath, ['-e', probeScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
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

    const snapshot = parseClaudeUsagePayload(parsed.payload, Date.now(), auth.source || USAGE_SOURCE_CLAUDE_OAUTH);
    if (!snapshot) return null;
    writeUsageCache(cliName, id, snapshot);
    return snapshot;
  } catch (e) {
    return null;
  }
}

function formatUsageLabel(cliName, id, accountName) {
  if (accountName && accountName.startsWith('API Key')) {
    return '\x1b[90m[Usage: API Key mode]\x1b[0m';
  }
  const cache = readUsageCache(cliName, id);
  if (!cache || !cache.capturedAt || (Date.now() - cache.capturedAt > USAGE_CACHE_MAX_AGE_MS)) {
    return '';
  }

  if (cache.kind === 'gemini_oauth_stats' && Array.isArray(cache.models) && cache.models.length > 0) {
    const hottest = [...cache.models].sort((a, b) => a.remainingPct - b.remainingPct)[0];
    return `\x1b[36m[Usage: ${hottest.model} ${hottest.remainingPct.toFixed(1)}% / ${hottest.resetIn}]\x1b[0m`;
  }

  if (cache.kind === 'codex_oauth_status' && Array.isArray(cache.entries) && cache.entries.length > 0) {
    const withPct = cache.entries
      .filter((x) => typeof x.remainingPct === 'number')
      .sort((a, b) => (Number(b.windowMinutes) || 0) - (Number(a.windowMinutes) || 0))[0];
    if (withPct) {
      const resetSuffix = withPct.resetIn ? ` / ${withPct.resetIn}` : '';
      return `\x1b[36m[Usage: ${withPct.window} ${withPct.remainingPct.toFixed(1)}%${resetSuffix}]\x1b[0m`;
    }
    return `\x1b[36m[Usage: ${cache.entries[0].window}]\x1b[0m`;
  }
  if (cache.kind === 'claude_oauth_usage' && Array.isArray(cache.entries) && cache.entries.length > 0) {
    const withPct = cache.entries
      .filter((x) => typeof x.remainingPct === 'number')
      .sort((a, b) => (Number(b.windowMinutes) || 0) - (Number(a.windowMinutes) || 0))[0];
    if (withPct) {
      const resetSuffix = withPct.resetIn ? ` / ${withPct.resetIn}` : '';
      return `\x1b[36m[Usage: ${withPct.window} ${withPct.remainingPct.toFixed(1)}%${resetSuffix}]\x1b[0m`;
    }
    return `\x1b[36m[Usage: ${cache.entries[0].window}]\x1b[0m`;
  }

  return '';
}

// ==========================================
// API Key Environment Detection
// ==========================================
function extractActiveEnv(cliName) {
  if (!CLI_CONFIGS[cliName]) return null;
  const keys = CLI_CONFIGS[cliName].envKeys;
  let env = {};
  let hasKey = false;
  keys.forEach(k => {
    if (process.env[k]) {
      env[k] = process.env[k];
      if (k.includes('API_KEY')) hasKey = true;
    }
  });
  return hasKey ? env : null;
}

function hashEnv(envObj) {
  return Buffer.from(JSON.stringify(envObj)).toString('base64');
}

function findEnvSandbox(cliName, targetEnv) {
  const targetHash = hashEnv(targetEnv);
  const toolDir = path.join(PROFILES_DIR, cliName);
  if (!fs.existsSync(toolDir)) return null;
  const ids = fs.readdirSync(toolDir).filter(f => /^\d+$/.test(f));
  for (let id of ids) {
    const p = path.join(toolDir, id, '.aih_env.json');
    if (fs.existsSync(p)) {
      try {
        const savedEnv = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (hashEnv(savedEnv) === targetHash) return id;
      } catch (e) {}
    }
  }
  return null;
}

function isExhausted(cliName, id) {
  const p = path.join(getProfileDir(cliName, id), '.aih_exhausted');
  if (fs.existsSync(p)) {
    let time = NaN;
    try {
      time = parseInt(fs.readFileSync(p, 'utf8'), 10);
    } catch (e) {
      return false;
    }
    // Cooldown 1 hour (3600000 ms)
    if (Number.isFinite(time) && Date.now() - time < 3600000) {
      return true;
    } else {
      try {
        fs.unlinkSync(p); // Remove exhausted flag if expired
      } catch (e) {
        // Ignore cleanup failures (permission/sandbox). Treat as non-exhausted now.
      }
    }
  }
  return false;
}

function clearExhausted(cliName, id) {
  const p = path.join(getProfileDir(cliName, id), '.aih_exhausted');
  if (!fs.existsSync(p)) return false;
  try {
    fs.unlinkSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function markExhaustedFromUsage(cliName, id) {
  const p = path.join(getProfileDir(cliName, id), '.aih_exhausted');
  try {
    fs.writeFileSync(p, Date.now().toString());
    return true;
  } catch (e) {
    return false;
  }
}

function isUsageManagedCli(cliName) {
  // Gemini has per-model quotas; a single model at 0% should not exhaust the
  // whole account. Codex/Claude snapshots represent account-level windows.
  return cliName === 'codex' || cliName === 'claude';
}

function getUsageRemainingPercentValues(cache) {
  if (!cache || typeof cache !== 'object') return [];
  if (cache.kind === 'gemini_oauth_stats' && Array.isArray(cache.models)) {
    return cache.models.map((x) => Number(x.remainingPct)).filter((n) => Number.isFinite(n));
  }
  if ((cache.kind === 'codex_oauth_status' || cache.kind === 'claude_oauth_usage') && Array.isArray(cache.entries)) {
    return cache.entries.map((x) => Number(x.remainingPct)).filter((n) => Number.isFinite(n));
  }
  return [];
}

function isUsageSnapshotExhausted(cache) {
  const values = getUsageRemainingPercentValues(cache);
  if (values.length === 0) return false;
  const minRemaining = Math.min(...values);
  return minRemaining <= 0;
}

function syncExhaustedStateFromUsage(cliName, id) {
  if (!isUsageManagedCli(cliName)) return null;
  const profileDir = getProfileDir(cliName, id);
  if (!fs.existsSync(profileDir)) return null;
  const { configured, accountName } = checkStatus(cliName, profileDir);
  if (!configured) return null;
  if (accountName && accountName.startsWith('API Key')) return null;

  let cache = readUsageCache(cliName, id);
  cache = ensureUsageSnapshot(cliName, id, cache);
  if (!cache) return null;

  if (isUsageSnapshotExhausted(cache)) {
    markExhaustedFromUsage(cliName, id);
    return true;
  }
  clearExhausted(cliName, id);
  return false;
}

function getUsageNoSnapshotHint(cliName, id = null) {
  if (cliName === 'gemini') {
    return 'Ensure this account is logged in (OAuth), then retry.';
  }
  if (cliName === 'codex') {
    return 'Ensure this account is logged in (OAuth), then retry. (`codex login` inside this sandbox if needed)';
  }
  if (cliName === 'claude') {
    if (id !== null && id !== undefined) {
      const auth = getClaudeUsageAuthForSandbox(cliName, id);
      if (!auth) {
        return 'No usable Claude auth token was found in this sandbox. Run `aih claude <id>` and login first.';
      }
      if (auth.mode === 'settings_env_token' && auth.isLocalProxy) {
        return `Detected local provider token (${auth.baseUrl}). Start that provider first, then retry; or login with Claude OAuth.`;
      }
      if (auth.mode === 'settings_env_token') {
        return 'Detected token from settings env. If this provider does not expose /api/oauth/usage, switch to Claude OAuth for usage-remaining.';
      }
    }
    return 'Ensure this account is logged in with OAuth (not API key), then retry.';
  }
  return '';
}

function formatUsageSnapshotLines(cache) {
  if (!cache || typeof cache !== 'object') return [];
  if (cache.kind === 'gemini_oauth_stats' && Array.isArray(cache.models)) {
    return cache.models.map((m) => `${m.model}: ${m.remainingPct.toFixed(1)}% (resets in ${m.resetIn})`);
  }
  if (cache.kind === 'codex_oauth_status' && Array.isArray(cache.entries)) {
    return cache.entries.map((x) => {
      if (typeof x.remainingPct === 'number') {
        const resetSuffix = x.resetIn ? ` (resets in ${x.resetIn})` : '';
        return `${x.window}: ${x.remainingPct.toFixed(1)}%${resetSuffix}`;
      }
      return `${x.window}`;
    });
  }
  if (cache.kind === 'claude_oauth_usage' && Array.isArray(cache.entries)) {
    return cache.entries.map((x) => {
      if (typeof x.remainingPct === 'number') {
        const resetSuffix = x.resetIn ? ` (resets in ${x.resetIn})` : '';
        return `${x.window}: ${x.remainingPct.toFixed(1)}%${resetSuffix}`;
      }
      return `${x.window}`;
    });
  }
  return [JSON.stringify(cache)];
}

function getToolAccountIds(cliName) {
  const toolDir = path.join(PROFILES_DIR, cliName);
  if (!fs.existsSync(toolDir)) return [];
  return fs.readdirSync(toolDir)
    .filter((f) => /^\d+$/.test(f) && fs.statSync(path.join(toolDir, f)).isDirectory())
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function printUsageSnapshot(cliName, id) {
  const profileDir = getProfileDir(cliName, id);
  const { accountName } = checkStatus(cliName, profileDir);
  if (accountName && accountName.startsWith('API Key')) {
    console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${id} is in API Key mode.`);
    console.log(`\x1b[90m[Hint]\x1b[0m OAuth usage-remaining is unavailable for API Key accounts.`);
    return;
  }

  let cache = readUsageCache(cliName, id);
  cache = ensureUsageSnapshot(cliName, id, cache);
  if (!cache) {
    console.log(`\x1b[90m[aih]\x1b[0m No cached usage snapshot for ${cliName} Account ID ${id}.`);
    const hint = getUsageNoSnapshotHint(cliName, id);
    if (hint) {
      console.log(`\x1b[90m[Hint]\x1b[0m ${hint}`);
    }
    return;
  }

  const ageLabel = cache.capturedAt
    ? `${Math.max(0, Math.floor((Date.now() - cache.capturedAt) / 1000))}s`
    : 'unknown';
  console.log(`\x1b[36m[aih]\x1b[0m Usage snapshot for ${cliName} Account ID ${id} (age: ${ageLabel})`);
  const lines = formatUsageSnapshotLines(cache);
  lines.forEach((line) => {
    console.log(`  - ${line}`);
  });
}

function printAllUsageSnapshots(cliName) {
  const ids = getToolAccountIds(cliName);
  if (ids.length === 0) {
    console.log(`\x1b[90m[aih]\x1b[0m No accounts found for ${cliName}.`);
    return;
  }

  let oauthCount = 0;
  let withSnapshot = 0;
  let skippedApiKey = 0;
  let skippedPending = 0;
  console.log(`\x1b[36m[aih]\x1b[0m Usage snapshots for ${cliName} (all OAuth accounts)`);

  ids.forEach((id) => {
    const profileDir = getProfileDir(cliName, id);
    const { configured, accountName } = checkStatus(cliName, profileDir);
    if (!configured) {
      skippedPending += 1;
      console.log(`  - Account ID ${id}: Pending Login (skipped)`);
      return;
    }
    if (accountName && accountName.startsWith('API Key')) {
      skippedApiKey += 1;
      console.log(`  - Account ID ${id}: ${accountName} (API Key mode, skipped)`);
      return;
    }

    oauthCount += 1;
    let cache = readUsageCache(cliName, id);
    cache = ensureUsageSnapshot(cliName, id, cache);
    const label = accountName && accountName !== 'Unknown' ? accountName : 'OAuth';
    if (!cache) {
      const noSnapshotHint = getUsageNoSnapshotHint(cliName, id);
      console.log(`  - Account ID ${id} (${label}): no cached usage snapshot`);
      if (noSnapshotHint) {
        console.log(`    Hint: ${noSnapshotHint}`);
      }
      return;
    }

    withSnapshot += 1;
    const ageLabel = cache.capturedAt
      ? `${Math.max(0, Math.floor((Date.now() - cache.capturedAt) / 1000))}s`
      : 'unknown';
    console.log(`  - Account ID ${id} (${label}) [age: ${ageLabel}]`);
    formatUsageSnapshotLines(cache).forEach((line) => {
      console.log(`    ${line}`);
    });
  });

  console.log(`\x1b[90m[aih]\x1b[0m Summary: oauth=${oauthCount}, with_snapshot=${withSnapshot}, api_key_skipped=${skippedApiKey}, pending_skipped=${skippedPending}`);
}

function getNextAvailableId(cliName, currentId) {
  const toolDir = path.join(PROFILES_DIR, cliName);
  const ids = fs.readdirSync(toolDir)
                .filter(f => /^\d+$/.test(f) && fs.statSync(path.join(toolDir, f)).isDirectory());
  
  let validIds = [];
  ids.forEach(id => {
    if (id !== currentId && checkStatus(cliName, path.join(toolDir, id)).configured) {
      const usageExhausted = syncExhaustedStateFromUsage(cliName, id);
      if (usageExhausted === true) {
        return;
      }
      if (!isExhausted(cliName, id)) {
        validIds.push(id);
      }
    }
  });
  
  if (validIds.length > 0) {
    // Return the lowest ID available (or random, or round robin)
    return validIds.sort((a, b) => parseInt(a) - parseInt(b))[0];
  }
  return null;
}

// Check if an account is configured and try to extract account info
function checkStatus(cliName, profileDir) {
  let configured = false;
  let accountName = 'Unknown';

  try {
    const envPath = path.join(profileDir, '.aih_env.json');
    if (fs.existsSync(envPath)) {
       configured = true;
       try {
          const envData = JSON.parse(fs.readFileSync(envPath, 'utf8'));
          const keyField = Object.keys(envData).find(k => k.includes('API_KEY'));
          if (keyField && envData[keyField]) {
             const k = envData[keyField];
             if (k.length > 10) {
                accountName = `API Key: ${k.substring(0, 5)}...${k.substring(k.length - 4)}`;
             } else {
                accountName = 'API Key Configured';
             }
          } else {
             accountName = 'API Key Configured';
          }
       } catch (e) {
          accountName = 'API Key Configured';
       }
       return { configured, accountName };
    }

    const hiddenDir = CLI_CONFIGS[cliName] ? CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
    const p = path.join(profileDir, hiddenDir);
    
    if (fs.existsSync(p)) {
      const files = fs.readdirSync(p);
      if (files.length > 0) {
        configured = true;
      }
      
      // Try to extract account identifiers
      if (cliName === 'gemini') {
        const accPath = path.join(p, 'google_accounts.json');
        if (fs.existsSync(accPath)) {
          const data = JSON.parse(fs.readFileSync(accPath, 'utf8'));
          if (data.active) accountName = data.active;
        }
      } else if (cliName === 'codex') {
        const authPath = path.join(p, 'auth.json');
        if (fs.existsSync(authPath)) {
          const data = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          if (data.tokens && data.tokens.id_token) {
            try {
              const payload = data.tokens.id_token.split('.')[1];
              const decoded = Buffer.from(payload, 'base64').toString('utf8');
              const jwtData = JSON.parse(decoded);
              if (jwtData.email) accountName = jwtData.email;
            } catch (e) {}
          }
        }
      } else if (cliName === 'claude') {
        const credentialsPath = path.join(p, '.credentials.json');
        const credentials = readJsonFileSafe(credentialsPath);
        const oauth = credentials && (credentials.claudeAiOauth || credentials.claude_ai_oauth);
        const hasOauthToken = !!(oauth && (oauth.accessToken || oauth.access_token));
        const settingsPath = path.join(p, 'settings.json');
        const settings = readJsonFileSafe(settingsPath);
        const settingsToken = settings && settings.env && typeof settings.env.ANTHROPIC_AUTH_TOKEN === 'string'
          ? settings.env.ANTHROPIC_AUTH_TOKEN.trim()
          : '';
        if (hasOauthToken) {
          accountName = 'OAuth Configured';
        } else if (settingsToken) {
          accountName = 'Token Configured';
        } else if (fs.existsSync(settingsPath)) {
          accountName = 'Config Present';
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return { configured, accountName };
}

function showHelp() {
  console.log(`
\x1b[36mAI Home (aih)\x1b[0m - Multi-account sandbox manager for AI CLIs

\x1b[33mUsage:\x1b[0m
  aih ls                    \x1b[90mList all tools, accounts, and their status\x1b[0m
  aih ls --help             \x1b[90mShow list mode help (paging behavior)\x1b[0m
  aih <cli> ls              \x1b[90mList accounts for a specific tool\x1b[0m
  aih <cli> ls --help       \x1b[90mShow list mode help for this tool\x1b[0m
  aih <cli> add [or login]  \x1b[90mCreate a new account and run the login flow\x1b[0m
  aih <cli>                 \x1b[90mRun a tool with the default account (ID: 1)\x1b[0m
  aih <cli> auto            \x1b[90mRun the next non-exhausted account automatically\x1b[0m
  aih <cli> usage <id>      \x1b[90mShow trusted usage-remaining snapshot (OAuth only)\x1b[0m
  aih <cli> usages          \x1b[90mShow trusted usage-remaining snapshots for all OAuth accounts\x1b[0m
  aih codex import-output [dir] [--parallel N] [--limit N] [--dry-run]\x1b[90mBulk import codex refresh tokens from output files\x1b[0m
  aih <cli> <id> usage      \x1b[90mSame as above, ID-first style\x1b[0m
  aih <cli> unlock <id>     \x1b[90mManually clear [Exhausted Limit] for an account\x1b[0m
  aih <cli> <id> unlock     \x1b[90mSame as above, ID-first style\x1b[0m
  aih <cli> <id> [args]     \x1b[90mRun a tool with a specific account ID\x1b[0m
  aih proxy                 \x1b[90mStart local OpenAI-compatible proxy (auto uses local codex accounts)\x1b[0m
  
\x1b[33mAdvanced:\x1b[0m
  aih <cli> set-default <id>\x1b[90mSet default account for aih only\x1b[0m
  aih export [file.aes] [selectors...] \x1b[90mSecurely export profiles. Selectors e.g. codex:1,2 gemini\x1b[0m
  aih import [-o] <file.aes>\x1b[90mRestore profiles; default skips same account, -o overwrites\x1b[0m
`);
}

function showCliUsage(cliName) {
  console.log(`
\x1b[36mAI Home (aih)\x1b[0m - Subcommands for \x1b[33m${cliName}\x1b[0m

\x1b[33mUsage:\x1b[0m
  aih ${cliName} ls              \x1b[90mList all ${cliName} accounts\x1b[0m
  aih ${cliName} ls --help       \x1b[90mShow list mode help (paging behavior)\x1b[0m
  aih ${cliName} add             \x1b[90mCreate a new account and login\x1b[0m
  aih ${cliName} login           \x1b[90mAlias of add\x1b[0m
  aih ${cliName} auto            \x1b[90mAuto-select next non-exhausted account\x1b[0m
  aih ${cliName} usage <id>      \x1b[90mShow trusted usage-remaining snapshot (OAuth)\x1b[0m
  aih ${cliName} usages          \x1b[90mShow trusted usage snapshots for all OAuth accounts\x1b[0m
  ${cliName === 'codex' ? 'aih codex import-output [dir] [--parallel N] [--limit N] [--dry-run]  \x1b[90mBulk import codex refresh tokens\x1b[0m' : ''}
  aih ${cliName} unlock <id>     \x1b[90mClear exhausted flag manually\x1b[0m
  aih ${cliName} <id> usage      \x1b[90mID-first style usage query\x1b[0m
  aih ${cliName} <id> unlock     \x1b[90mID-first style manual unlock\x1b[0m
  aih ${cliName} <id> [args]     \x1b[90mRun ${cliName} under a specific account\x1b[0m
  aih ${cliName}                 \x1b[90mRun with default account\x1b[0m
`);
}

function showProxyUsage() {
  console.log(`
\x1b[36mAI Home Proxy Helpers\x1b[0m

\x1b[33mUsage:\x1b[0m
  aih proxy
  aih proxy start
  aih proxy restart
  aih proxy stop
  aih proxy status
  aih proxy autostart <install|uninstall|status>
  aih proxy serve
  aih proxy serve [--port <n>]

\x1b[33mNotes:\x1b[0m
  - Default listen: http://127.0.0.1:8317
  - OpenAI-compatible endpoint: http://127.0.0.1:8317/v1
  - Default backend is codex-local (directly executes local codex accounts).
  - Default provider mode is auto (routes by model hint: gpt/o* -> codex, gemini* -> gemini).
  - No extra key setup is required in default mode.
  - aih proxy is equivalent to aih proxy start (daemon mode).

\x1b[33mAdvanced (optional):\x1b[0m
  aih proxy serve [--host <ip>] [--port <n>] [--backend codex-local|openai-upstream] [--provider codex|gemini|auto] [--upstream <url>] [--strategy round-robin|random] [--client-key <key>] [--management-key <key>] [--cooldown-ms <ms>] [--max-attempts <n>] [--upstream-timeout-ms <ms>]
  aih proxy env [--base-url <url>] [--api-key <key>]
  aih proxy sync-codex [--management-url <url>] [--key <management-key>] [--parallel <1-32>] [--limit <n>] [--dry-run]
  management APIs: /v0/management/status, /v0/management/metrics, /v0/management/accounts, /v0/management/models, /v0/management/reload, /v0/management/ui
`);
}

function showLsHelp(scope = null) {
  const target = scope ? `aih ${scope} ls` : 'aih ls';
  console.log(`
\x1b[36mAI Home List Mode Help\x1b[0m

\x1b[33mUsage:\x1b[0m
  ${target}

\x1b[33mBehavior:\x1b[0m
  - Default output: first ${LIST_PAGE_SIZE} accounts.
  - Interactive mode: if output is a terminal (TTY), shows pager prompt after each page.
  - Keys in pager: \x1b[32mSpace\x1b[0m = next page, \x1b[32mq\x1b[0m = quit.
  - Non-interactive mode (pipe/redirect): show first ${LIST_PAGE_SIZE} and print omitted count.

\x1b[33mExamples:\x1b[0m
  aih ls
  aih codex ls
  aih codex ls --help
`);
}

function listProfiles(filterCliName = null) {
  console.log(`\n\x1b[36m📦 AI Home Accounts Overview\x1b[0m\n`);
  
  if (!fs.existsSync(PROFILES_DIR)) {
    console.log('  No profiles found.');
    return;
  }

  let tools = fs.readdirSync(PROFILES_DIR)
    .filter((f) => fs.statSync(path.join(PROFILES_DIR, f)).isDirectory())
    .filter((f) => !!CLI_CONFIGS[f]);
  
  if (filterCliName) {
     tools = tools.filter(t => t === filterCliName);
  }

  if (tools.length === 0) {
    console.log('  No profiles found.');
    return;
  }

  tools.forEach(tool => {
    console.log(`\x1b[33m▶ ${tool}\x1b[0m`);
    const toolDir = path.join(PROFILES_DIR, tool);
    const ids = fs.readdirSync(toolDir)
                  .filter(f => f !== '.aih_default' && fs.statSync(path.join(toolDir, f)).isDirectory())
                  .sort((a, b) => parseInt(a) - parseInt(b));
    
    if (ids.length === 0) {
      console.log(`  (Empty)`);
    } else {
      const seenAccounts = new Map();
      let defaultId = null;
      try {
         const defPath = path.join(toolDir, '.aih_default');
         if (fs.existsSync(defPath)) defaultId = fs.readFileSync(defPath, 'utf8').trim();
      } catch (e) {}

      const interactivePager = !!(process.stdout && process.stdout.isTTY);
      let cursor = 0;
      while (cursor < ids.length) {
        const batch = ids.slice(cursor, cursor + LIST_PAGE_SIZE);
        batch.forEach(id => {
          const pDir = path.join(toolDir, id);
          const { configured, accountName } = checkStatus(tool, pDir);
          // Keep ls lightweight: do not refresh remote usage for every account here.
          const exhausted = isExhausted(tool, id) ? `\x1b[31m[Exhausted Limit]\x1b[0m ` : '';
          const isDefault = (id === defaultId) ? `\x1b[32m[★ Default]\x1b[0m ` : '';
          const usageLabel = formatUsageLabel(tool, id, accountName);

          let statusStr = configured
            ? `\x1b[32mActive\x1b[0m`
            : `\x1b[90mPending Login\x1b[0m`;

          let accountInfo = configured && accountName !== 'Unknown' ? `(${accountName})` : '';

          let duplicateWarning = '';
          if (configured && accountName !== 'Unknown' && accountName !== 'Token Configured' && !accountName.startsWith('API Key')) {
            if (seenAccounts.has(accountName)) {
              duplicateWarning = ` \x1b[31m[⚠️ Duplicate of ID ${seenAccounts.get(accountName)}]\x1b[0m`;
            } else {
              seenAccounts.set(accountName, id);
            }
          }

          console.log(`  - Account ID: \x1b[36m${id}\x1b[0m  ${isDefault}[${statusStr}] ${exhausted}\x1b[35m${accountInfo}\x1b[0m ${usageLabel} ${duplicateWarning}`);
        });
        cursor += batch.length;
        if (cursor >= ids.length) break;
        const remaining = ids.length - cursor;
        if (!interactivePager) {
          console.log(`  \x1b[90m... omitted ${remaining} accounts\x1b[0m`);
          break;
        }
        process.stdout.write(`  \x1b[90m-- More (${remaining} remaining) [Space=next, q=quit]\x1b[0m`);
        let key = '';
        try {
          key = String(readline.keyIn('', { hideEchoBack: true, mask: '', limit: ' q' }) || '');
        } catch (e) {
          process.stdout.write('\n');
          break;
        }
        process.stdout.write('\r\x1b[K');
        if (key.toLowerCase() === 'q') {
          console.log(`  \x1b[90m... omitted ${remaining} accounts\x1b[0m`);
          break;
        }
      }
    }
    console.log('');
  });
}

function parseJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function normalizeManagementBase(url) {
  const base = String(url || '').trim();
  if (!base) throw new Error('Empty management URL');
  return base.replace(/\/+$/, '');
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

function parseAuthorizationBearer(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value) return '';
  const m = value.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
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

function loadCodexProxyAccounts() {
  const ids = getToolAccountIds('codex');
  const out = [];
  ids.forEach((id) => {
    const authPath = path.join(getToolConfigDir('codex', id), 'auth.json');
    const authJson = parseJsonFileSafe(authPath);
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

function loadGeminiProxyAccounts() {
  const ids = getToolAccountIds('gemini');
  const out = [];
  ids.forEach((id) => {
    const pDir = getProfileDir('gemini', id);
    const { configured, accountName } = checkStatus('gemini', pDir);
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

function chooseProxyAccount(accounts, state, cursorKey = 'cursor') {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const now = Date.now();
  const available = accounts.filter((a) => now >= (a.cooldownUntil || 0));
  if (available.length === 0) return null;
  if (state.strategy === 'random') {
    return available[Math.floor(Math.random() * available.length)];
  }
  // round-robin over full list while skipping cooldown/empty token
  const n = accounts.length;
  const cursor = Number(state[cursorKey] || 0);
  for (let i = 0; i < n; i += 1) {
    const idx = (cursor + i) % n;
    const item = accounts[idx];
    if (now < (item.cooldownUntil || 0)) continue;
    state[cursorKey] = (idx + 1) % n;
    return item;
  }
  return null;
}

function normalizeModelId(modelRaw) {
  return String(modelRaw || '').trim().toLowerCase();
}

function inferProviderFromModel(modelRaw) {
  const m = normalizeModelId(modelRaw);
  if (!m) return 'codex';
  if (m.startsWith('gemini')) return 'gemini';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'codex';
  return 'codex';
}

function resolveRequestProvider(options, requestJson) {
  const requested = normalizeModelId(requestJson && requestJson.model);
  if (options.provider === 'codex' || options.provider === 'gemini') return options.provider;
  return inferProviderFromModel(requested);
}

function markProxyAccountSuccess(account) {
  if (!account) return;
  account.consecutiveFailures = 0;
  account.successCount = Number(account.successCount || 0) + 1;
  account.lastError = '';
}

function markProxyAccountFailure(account, reason, cooldownMs, failureThreshold = 2) {
  if (!account) return;
  account.failCount = Number(account.failCount || 0) + 1;
  account.consecutiveFailures = Number(account.consecutiveFailures || 0) + 1;
  account.lastError = String(reason || '');
  if (account.consecutiveFailures >= failureThreshold) {
    account.cooldownUntil = Date.now() + cooldownMs;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchModelsForAccount(options, account, timeoutMs = 8000) {
  const url = `${options.upstream}/v1/models`;
  const headers = {
    authorization: `Bearer ${account.accessToken}`
  };
  const res = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`.trim());
  }
  const json = await res.json();
  const arr = Array.isArray(json && json.data) ? json.data : [];
  return arr
    .map((x) => String((x && x.id) || '').trim())
    .filter(Boolean);
}

function appendProxyRequestLog(entry) {
  const line = JSON.stringify(entry);
  try {
    fs.appendFileSync(AIH_PROXY_LOG_FILE, `${line}\n`);
  } catch (e) {}
}

function buildChatCompletionPayload(model, text) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function writeSseChatCompletion(res, model, text) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: model || 'gpt-4o-mini',
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: model || 'gpt-4o-mini',
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: model || 'gpt-4o-mini',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    }
  ];
  chunks.forEach((c) => {
    res.write(`data: ${JSON.stringify(c)}\n\n`);
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

async function startLocalProxyServer(options) {
  const codexAccounts = loadCodexProxyAccounts().map((a) => ({ ...a, provider: 'codex', consecutiveFailures: 0, successCount: 0, failCount: 0, lastError: '' }));
  const geminiAccounts = loadGeminiProxyAccounts();
  const state = {
    strategy: options.strategy,
    cursors: { codex: 0, gemini: 0 },
    accounts: {
      codex: codexAccounts,
      gemini: geminiAccounts
    },
    startedAt: Date.now(),
    metrics: initProxyMetrics(),
    executors: {
      codex: createProviderExecutor('codex', options.codexMaxConcurrency, options.queueLimit),
      gemini: createProviderExecutor('gemini', options.geminiMaxConcurrency, options.queueLimit)
    },
    modelRegistry: initModelRegistry(),
    modelsCache: {
      updatedAt: 0,
      ids: [],
      byAccount: {},
      sourceCount: 0
    }
  };
  const requiredClientKey = String(options.clientKey || '').trim();
  const requiredManagementKey = String(options.managementKey || '').trim();
  const cooldownMs = Math.max(1000, Number(options.cooldownMs) || 60000);
  const localExecOpts = { getProfileDir, cwd: process.cwd() };

  const server = http.createServer(async (req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname || '/';

    if (pathname === '/healthz') {
      return writeJson(res, 200, { ok: true, service: 'aih-proxy' });
    }

    if (pathname.startsWith('/v0/management')) {
      if (requiredManagementKey) {
        const incoming = parseAuthorizationBearer(req.headers.authorization);
        if (incoming !== requiredManagementKey) {
          return writeJson(res, 401, { ok: false, error: 'unauthorized_management' });
        }
      }
      if (method === 'GET' && pathname === '/v0/management/ui') {
        const html = renderProxyStatusPage();
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }
      if (method === 'GET' && pathname === '/v0/management/status') {
        const now = Date.now();
        const codex = state.accounts.codex || [];
        const gemini = state.accounts.gemini || [];
        const activeCodex = codex.filter((a) => now >= (a.cooldownUntil || 0)).length;
        const activeGemini = gemini.filter((a) => now >= (a.cooldownUntil || 0)).length;
        const total = codex.length + gemini.length;
        const active = activeCodex + activeGemini;
        const cooldown = total - active;
        const requests = Math.max(1, state.metrics.totalRequests);
        return writeJson(res, 200, {
          ok: true,
          backend: options.backend,
          providerMode: options.provider,
          strategy: state.strategy,
          totalAccounts: total,
          activeAccounts: active,
          cooldownAccounts: cooldown,
          providers: {
            codex: { total: codex.length, active: activeCodex },
            gemini: { total: gemini.length, active: activeGemini }
          },
          queue: {
            codex: state.executors.codex.snapshot(),
            gemini: state.executors.gemini.snapshot()
          },
          modelsCached: Array.isArray(state.modelsCache.ids) ? state.modelsCache.ids.length : 0,
          modelsUpdatedAt: state.modelsCache.updatedAt || 0,
          modelRegistryUpdatedAt: state.modelRegistry.updatedAt || 0,
          successRate: Number((state.metrics.totalSuccess / requests).toFixed(4)),
          timeoutRate: Number((state.metrics.totalTimeouts / requests).toFixed(4)),
          totalRequests: state.metrics.totalRequests,
          uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000)
        });
      }
      if (method === 'GET' && pathname === '/v0/management/metrics') {
        const requests = Math.max(1, state.metrics.totalRequests);
        return writeJson(res, 200, {
          ok: true,
          totalRequests: state.metrics.totalRequests,
          totalSuccess: state.metrics.totalSuccess,
          totalFailures: state.metrics.totalFailures,
          totalTimeouts: state.metrics.totalTimeouts,
          successRate: Number((state.metrics.totalSuccess / requests).toFixed(4)),
          timeoutRate: Number((state.metrics.totalTimeouts / requests).toFixed(4)),
          routeCounts: state.metrics.routeCounts,
          providerCounts: state.metrics.providerCounts,
          providerSuccess: state.metrics.providerSuccess,
          providerFailures: state.metrics.providerFailures,
          queue: {
            codex: state.executors.codex.snapshot(),
            gemini: state.executors.gemini.snapshot()
          },
          lastErrors: state.metrics.lastErrors
        });
      }
      if (method === 'GET' && pathname === '/v0/management/models') {
        if (options.backend === 'codex-local') {
          const models = getRegistryModelList(state.modelRegistry, options.provider);
          return writeJson(res, 200, {
            ok: true,
            backend: options.backend,
            providerMode: options.provider,
            updatedAt: state.modelRegistry.updatedAt || 0,
            models
          });
        }
        const forceRefresh = ['1', 'true', 'yes'].includes(String(url.searchParams.get('refresh') || '').toLowerCase());
        const accountLimitRaw = String(url.searchParams.get('accounts') || '').trim();
        const accountLimit = /^\d+$/.test(accountLimitRaw) ? Math.max(1, Number(accountLimitRaw)) : 3;
        const cacheTtlRaw = String(url.searchParams.get('ttl_ms') || '').trim();
        const cacheTtl = /^\d+$/.test(cacheTtlRaw) ? Math.max(1000, Number(cacheTtlRaw)) : 5 * 60 * 1000;
        const now = Date.now();
        if (!forceRefresh && state.modelsCache.updatedAt > 0 && now - state.modelsCache.updatedAt < cacheTtl) {
          return writeJson(res, 200, {
            ok: true,
            cached: true,
            updatedAt: state.modelsCache.updatedAt,
            sources: state.modelsCache.sourceCount,
            models: state.modelsCache.ids
          });
        }

        const candidates = (state.accounts.codex || []).filter((a) => !!a.accessToken).slice(0, accountLimit);
        const modelSet = new Set();
        const byAccount = {};
        let sourceCount = 0;
        let firstError = '';
        for (const acc of candidates) {
          try {
            const models = await fetchModelsForAccount(options, acc, 8000);
            byAccount[acc.id] = models;
            models.forEach((m) => modelSet.add(m));
            sourceCount += 1;
          } catch (e) {
            byAccount[acc.id] = [];
            if (!firstError) firstError = String((e && e.message) || e);
          }
        }

        const ids = Array.from(modelSet).sort();
        state.modelsCache = {
          updatedAt: now,
          ids,
          byAccount,
          sourceCount
        };
        return writeJson(res, 200, {
          ok: true,
          cached: false,
          updatedAt: state.modelsCache.updatedAt,
          scannedAccounts: candidates.length,
          sources: sourceCount,
          models: ids,
          firstError
        });
      }
      if (method === 'GET' && pathname === '/v0/management/accounts') {
        const allAccounts = [...(state.accounts.codex || []), ...(state.accounts.gemini || [])];
        return writeJson(res, 200, {
          ok: true,
          accounts: allAccounts.map((a) => ({
            id: a.id,
            provider: a.provider || 'codex',
            email: a.email,
            accountId: a.accountId,
            hasAccessToken: !!a.accessToken,
            hasRefreshToken: !!a.refreshToken,
            cooldownUntil: a.cooldownUntil || 0,
            lastRefresh: a.lastRefresh,
            consecutiveFailures: a.consecutiveFailures || 0,
            successCount: a.successCount || 0,
            failCount: a.failCount || 0,
            lastError: a.lastError || ''
          }))
        });
      }
      if (method === 'POST' && pathname === '/v0/management/reload') {
        state.accounts = {
          codex: loadCodexProxyAccounts().map((a) => ({ ...a, provider: 'codex', consecutiveFailures: 0, successCount: 0, failCount: 0, lastError: '' })),
          gemini: loadGeminiProxyAccounts()
        };
        state.cursors = { codex: 0, gemini: 0 };
        state.modelsCache = {
          updatedAt: 0,
          ids: [],
          byAccount: {},
          sourceCount: 0
        };
        const total = state.accounts.codex.length + state.accounts.gemini.length;
        return writeJson(res, 200, { ok: true, reloaded: total, providers: { codex: state.accounts.codex.length, gemini: state.accounts.gemini.length } });
      }
      if (method === 'POST' && pathname === '/v0/management/cooldown/clear') {
        [...(state.accounts.codex || []), ...(state.accounts.gemini || [])].forEach((a) => { a.cooldownUntil = 0; a.consecutiveFailures = 0; });
        return writeJson(res, 200, { ok: true });
      }
      return writeJson(res, 404, { ok: false, error: 'management_not_found' });
    }

    if (!pathname.startsWith('/v1/')) {
      return writeJson(res, 404, { ok: false, error: 'not_found' });
    }
    if (requiredClientKey) {
      const incoming = parseAuthorizationBearer(req.headers.authorization);
      if (incoming !== requiredClientKey) {
        return writeJson(res, 401, { ok: false, error: 'unauthorized_client' });
      }
    }

    const bodyBuffer = await readRequestBody(req).catch(() => null);
    if (bodyBuffer === null) {
      return writeJson(res, 400, { ok: false, error: 'invalid_request_body' });
    }
    let requestJson = null;
    try {
      requestJson = bodyBuffer.length > 0 ? JSON.parse(bodyBuffer.toString('utf8')) : {};
    } catch (e) {
      requestJson = {};
    }
    const requestStartedAt = Date.now();
    const routeKey = `${method} ${pathname}`;
    state.metrics.totalRequests += 1;
    state.metrics.routeCounts[routeKey] = Number(state.metrics.routeCounts[routeKey] || 0) + 1;

    if (options.backend === 'codex-local') {
      if (method === 'GET' && pathname === '/v1/models') {
        const modelList = getRegistryModelList(state.modelRegistry, options.provider);
        const payload = buildOpenAIModelsList(modelList);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
        state.metrics.totalSuccess += 1;
        return;
      }
      if (method === 'POST' && pathname === '/v1/chat/completions') {
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
          if (!account || attempted.has(account.id)) {
            continue;
          }
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
            markProxyAccountFailure(account, detail, cooldownMs, options.failureThreshold);
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
          return writeJson(res, 429, { ok: false, error: 'queue_full', detail });
        }
        return writeJson(res, 502, { ok: false, error: 'local_backend_failed', detail });
      }
      if (method === 'POST' && pathname === '/v1/responses') {
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
          if (!account || attempted.has(account.id)) {
            continue;
          }
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
              output: [{
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text }]
              }]
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
            return writeJson(res, 200, payload);
          } catch (e) {
            const detail = String((e && e.message) || e);
            lastDetail = detail;
            if (detail.includes('timeout')) state.metrics.totalTimeouts += 1;
            markProxyAccountFailure(account, detail, cooldownMs, options.failureThreshold);
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
          return writeJson(res, 429, { ok: false, error: 'queue_full', detail });
        }
        return writeJson(res, 502, { ok: false, error: 'local_backend_failed', detail });
      }
      state.metrics.totalFailures += 1;
      pushMetricError(state.metrics, routeKey, 'n/a', 'unsupported_in_codex_local_backend');
      return writeJson(res, 404, { ok: false, error: 'unsupported_in_codex_local_backend' });
    }

    if (method === 'GET' && pathname === '/v1/models') {
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
      return;
    }

    let lastError = '';
    const pool = state.accounts.codex || [];
    const maxAttempts = Math.min(
      Math.max(1, Number(options.maxAttempts) || 3),
      Math.max(1, pool.length)
    );
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const account = chooseProxyAccount(pool, state.cursors, 'codex');
      if (!account) {
        state.metrics.totalFailures += 1;
        pushMetricError(state.metrics, routeKey, 'codex', 'no_available_account');
        return writeJson(res, 503, { ok: false, error: 'no_available_account' });
      }
      const upstreamUrl = `${options.upstream}${req.url || ''}`;
      try {
        const headers = {};
        Object.entries(req.headers || {}).forEach(([k, v]) => {
          const key = String(k || '').toLowerCase();
          if (key === 'host' || key === 'authorization' || key === 'content-length') return;
          headers[key] = v;
        });
        headers.authorization = `Bearer ${account.accessToken}`;
        headers['x-aih-account-id'] = account.id;
        headers['x-aih-account-email'] = account.email || '';

        const upstreamRes = await fetchWithTimeout(upstreamUrl, {
          method,
          headers,
          body: ['GET', 'HEAD'].includes(method) ? undefined : bodyBuffer
        }, options.upstreamTimeoutMs);
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
        res.setHeader('x-aih-proxy-account-id', account.id);
        if (account.email) res.setHeader('x-aih-proxy-account-email', account.email);
        res.setHeader('content-length', raw.length);
        res.end(raw);
        markProxyAccountSuccess(account);
        state.metrics.totalSuccess += 1;
        if (options.logRequests) {
          appendProxyRequestLog({
            at: new Date().toISOString(),
            route: routeKey,
            provider: 'codex',
            accountId: account.id,
            status: upstreamRes.status,
            durationMs: Date.now() - requestStartedAt
          });
        }
        return;
      } catch (e) {
        const detail = String((e && e.message) || e);
        if (detail.includes('timeout')) state.metrics.totalTimeouts += 1;
        markProxyAccountFailure(account, detail, cooldownMs, options.failureThreshold);
        lastError = detail;
      }
    }
    state.metrics.totalFailures += 1;
    pushMetricError(state.metrics, routeKey, 'codex', lastError);
    if (options.logRequests) {
      appendProxyRequestLog({
        at: new Date().toISOString(),
        route: routeKey,
        provider: 'codex',
        status: 502,
        error: lastError,
        durationMs: Date.now() - requestStartedAt
      });
    }
    return writeJson(res, 502, { ok: false, error: 'upstream_failed', detail: lastError });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  console.log(`\x1b[36m[aih]\x1b[0m proxy serve started`);
  console.log(`  listen: http://${options.host}:${options.port}`);
  console.log(`  upstream: ${options.upstream}`);
  console.log(`  backend: ${options.backend}`);
  console.log(`  provider_mode: ${options.provider}`);
  console.log(`  strategy: ${options.strategy}`);
  console.log(`  accounts: codex=${state.accounts.codex.length}, gemini=${state.accounts.gemini.length}`);
  if (requiredClientKey) {
    console.log('  client_auth: enabled (Bearer key required)');
  } else {
    console.log('  client_auth: disabled');
  }
  if (requiredManagementKey) {
    console.log('  management_auth: enabled (Bearer key required)');
  } else {
    console.log('  management_auth: disabled');
  }
  console.log('  management: /v0/management/status');
  console.log('  metrics: /v0/management/metrics');
  console.log('  gateway: /v1/*');
  console.log('  openai_base_url: ' + `http://${options.host}:${options.port}/v1`);
  console.log('  tip: export OPENAI_BASE_URL=' + `"http://${options.host}:${options.port}/v1"`);
  console.log('  tip: export OPENAI_API_KEY="dummy"');
}

async function syncCodexAccountsToProxy(options) {
  const base = normalizeManagementBase(options.managementUrl || '');
  const key = String(options.key || '').trim();
  if (!key) {
    throw new Error('Missing management key. Use --key or env AIH_PROXY_MANAGEMENT_KEY.');
  }
  const ids = getToolAccountIds('codex');
  const limit = Math.max(0, Number(options.limit) || 0);
  const targetIds = limit > 0 ? ids.slice(0, limit) : ids.slice();
  const maxConcurrency = Math.max(1, Number(options.parallel) || 8);
  const prefix = String(options.namePrefix || 'aih-codex-');

  let scanned = 0;
  let eligible = 0;
  let uploaded = 0;
  let skippedInvalid = 0;
  let failed = 0;
  let firstError = '';

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= targetIds.length) return;
      const id = String(targetIds[idx]);
      scanned += 1;
      const authPath = path.join(getToolConfigDir('codex', id), 'auth.json');
      const authJson = parseJsonFileSafe(authPath);
      const payload = buildProxyCodexUploadPayload(authJson);
      if (!payload) {
        skippedInvalid += 1;
        continue;
      }
      eligible += 1;
      if (options.dryRun) continue;

      const name = `${prefix}${id}.json`;
      const url = `${base}/auth-files?name=${encodeURIComponent(name)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          failed += 1;
          const body = await res.text().catch(() => '');
          if (!firstError) firstError = `HTTP ${res.status} ${body.slice(0, 200)}`.trim();
          continue;
        }
        uploaded += 1;
      } catch (e) {
        failed += 1;
        if (!firstError) firstError = String((e && e.message) || e);
      }
    }
  };

  const workerCount = Math.min(maxConcurrency, Math.max(1, targetIds.length));
  const workers = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return {
    managementUrl: base,
    scanned,
    eligible,
    uploaded: options.dryRun ? eligible : uploaded,
    skippedInvalid,
    failed,
    firstError,
    dryRun: !!options.dryRun
  };
}

function getNextId(cliName) {
  const toolDir = path.join(PROFILES_DIR, cliName);
  if (!fs.existsSync(toolDir)) return "1";
  const ids = fs.readdirSync(toolDir)
                .filter(f => /^\d+$/.test(f) && fs.statSync(path.join(toolDir, f)).isDirectory())
                .map(n => parseInt(n))
                .sort((a, b) => a - b);
  
  if (ids.length === 0) return "1";
  return String(ids[ids.length - 1] + 1);
}

// ==========================================
// PTY Execution with Auto Hot-Swap
// ==========================================
let currentPtyProcess = null;
let currentCliName = null;
let currentId = null;

function spawnPty(cliName, id, forwardArgs, isLogin) {
  currentCliName = cliName;
  currentId = id;
  const sandboxDir = getProfileDir(cliName, id);
  
  let loadedEnv = {};
  const envPath = path.join(sandboxDir, '.aih_env.json');
  if (fs.existsSync(envPath)) {
    try { loadedEnv = JSON.parse(fs.readFileSync(envPath, 'utf8')); } catch(e){}
  }

  const envOverrides = {
    ...process.env,
    ...loadedEnv,
    HOME: sandboxDir,           
    USERPROFILE: sandboxDir,    
    CLAUDE_CONFIG_DIR: path.join(sandboxDir, '.claude'),
    CODEX_HOME: path.join(sandboxDir, '.codex'),
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(sandboxDir, '.gemini', 'settings.json')
  };

  const argsToRun = isLogin ? (CLI_CONFIGS[cliName]?.loginArgs || []) : forwardArgs;
  
  return pty.spawn(cliName, argsToRun, {
    name: 'xterm-color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: process.cwd(),
    env: envOverrides
  });
}

function runCliPty(cliName, initialId, forwardArgs, isLogin = false) {
  try {
    execSync(`which ${cliName}`, { stdio: 'ignore' });
  } catch (e) {
    console.log(`\x1b[33m[aih] Native CLI '${cliName}' not found.\x1b[0m`);
    const ans = askYesNo(`Do you want to automatically install it via npm?`);
    if (ans) {
      const pkg = CLI_CONFIGS[cliName].pkg;
      console.log(`\n\x1b[36m[aih]\x1b[0m Installing \x1b[33m${pkg}\x1b[0m...`);
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit' });
      console.log(`\x1b[32m[aih] Successfully installed ${cliName}!\x1b[0m\n`);
    } else {
      process.exit(1);
    }
  }

  console.log(`\n\x1b[36m[aih]\x1b[0m 🚀 Running \x1b[33m${cliName}\x1b[0m (Account ID: \x1b[32m${initialId}\x1b[0m) via PTY Sandbox`);
  const initialSessionSync = ensureSessionStoreLinks(cliName, initialId);
  if (initialSessionSync.migrated > 0 || initialSessionSync.linked > 0) {
    console.log(`\x1b[36m[aih]\x1b[0m Session links ready (${cliName}): migrated ${initialSessionSync.migrated}, linked ${initialSessionSync.linked}.`);
  }

  let ptyProc = spawnPty(cliName, initialId, forwardArgs, isLogin);

  let waveFrames = ['.', '..', '...', ' ..', '  .', '   '];
  let waveIdx = 0;
  let hasReceivedData = false;
  
  let waveInterval = setInterval(() => {
    if (!hasReceivedData) {
      process.stdout.write(`\r\x1b[36m[aih]\x1b[0m Waiting for ${cliName} to boot${waveFrames[waveIdx++]}\x1b[K`);
      waveIdx %= waveFrames.length;
    }
  }, 200);

  process.stdout.on('resize', () => {
    if (ptyProc) {
      try { ptyProc.resize(process.stdout.columns, process.stdout.rows); } catch(e){}
    }
  });

  const canUseRawMode = !!(process.stdin && process.stdin.isTTY && typeof process.stdin.setRawMode === 'function');
  if (canUseRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  process.stdin.on('data', (data) => {
    if (ptyProc) {
      ptyProc.write(data);
    }
  });

  let outputBuffer = "";
  let isSwapping = false;

  function attachOnData(proc) {
    proc.onData((data) => {
      if (!hasReceivedData) {
         hasReceivedData = true;
         clearInterval(waveInterval);
         process.stdout.write('\r\x1b[K'); // clear wave
      }

      process.stdout.write(data);
      
      const cleanData = stripAnsi(data);
      
      outputBuffer += cleanData;
      if (outputBuffer.length > 1000) outputBuffer = outputBuffer.slice(-1000);

      const lowerOut = outputBuffer.toLowerCase();
      
      // Detect network failure during Auth (like Gemini socket disconnect)
      if (isLogin && (lowerOut.includes('failed to login') || lowerOut.includes('socket disconnected') || lowerOut.includes('connection error'))) {
        outputBuffer = "";
        process.stdout.write(`\r\n\x1b[33m[aih] Detected Network/Auth Error. Attempting to auto-restart the auth process...\x1b[0m\r\n`);
        isSwapping = true;
        proc.kill();
        setTimeout(() => {
          isSwapping = false;
          ptyProc = spawnPty(cliName, initialId, [], true);
          attachOnData(ptyProc);
        }, 1500);
      }
    });

    proc.onExit(({ exitCode, signal }) => {
      if (!isSwapping) {
        if (isLogin && exitCode === 0) {
           console.log(`\n\x1b[32m[aih] Auth completed! Booting standard session...\x1b[0m`);
           setTimeout(() => {
             runCliPty(cliName, initialId, forwardArgs, false);
           }, 500);
        } else {
           process.stdout.write('\r\n');
           process.exit(exitCode || 0);
        }
      }
    });
  }

  attachOnData(ptyProc);
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    if (canUseRawMode) {
      try { process.stdin.setRawMode(false); } catch (e) {}
    }
    process.exit(0);
  });
}

function createAccount(cliName, id, skipMigration = false) {
  const sandboxDir = getProfileDir(cliName, id);
  fs.mkdirSync(sandboxDir, { recursive: true });
  
  // Ensure the nested config directory exists immediately so the CLI doesn't crash on startup
  const globalFolder = CLI_CONFIGS[cliName] ? CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
  const nestedDir = path.join(sandboxDir, globalFolder);
  if (!fs.existsSync(nestedDir)) {
    fs.mkdirSync(nestedDir, { recursive: true });
  }
  const sessionSync = ensureSessionStoreLinks(cliName, id);

  console.log(`\x1b[36m[aih]\x1b[0m Created new sandbox for \x1b[33m${cliName}\x1b[0m (Account ID: \x1b[32m${id}\x1b[0m)`);
  if (sessionSync.migrated > 0 || sessionSync.linked > 0) {
    console.log(`\x1b[36m[aih]\x1b[0m Session links initialized: migrated ${sessionSync.migrated}, linked ${sessionSync.linked}.`);
  }

  // Migration logic for Account 1
  if (id === "1" && !skipMigration) {
    const globalPath = path.join(HOST_HOME_DIR, globalFolder);
    
    if (fs.existsSync(globalPath) && fs.readdirSync(globalPath).length > 0) {
      console.log(`\n\x1b[33m[Notice]\x1b[0m Found existing global login state for ${cliName} at ~/${globalFolder}`);
      const ans = askYesNo(`Do you want to migrate it to Account 1 as your default account?`);
      if (ans !== false) {
        fse.copySync(globalPath, nestedDir);
        console.log(`\x1b[32m[Success]\x1b[0m Migrated ~/${globalFolder} to Account 1!\n`);
        return false;
      }
    }
  }
  return true;
}

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  showHelp();
  process.exit(0);
}

if (cmd === 'ls' || cmd === 'list') {
  const lsArg = String(args[1] || '').trim();
  if (lsArg === '--help' || lsArg === '-h' || lsArg === 'help') {
    showLsHelp();
    process.exit(0);
  }
  listProfiles();
  process.exit(0);
}

function getSshKeys() {
  const sshDir = path.join(HOST_HOME_DIR, '.ssh');
  if (!fs.existsSync(sshDir)) return [];
  return fs.readdirSync(sshDir).filter((f) => f.startsWith('id_') && !f.endsWith('.pub'));
}

function getLikelyRsaSshPrivateKeys() {
  const sshDir = path.join(HOST_HOME_DIR, '.ssh');
  return getSshKeys().filter((name) => {
    const pubPath = path.join(sshDir, `${name}.pub`);
    if (fs.existsSync(pubPath)) {
      try {
        const firstToken = String(fs.readFileSync(pubPath, 'utf8')).trim().split(/\s+/)[0];
        return firstToken === 'ssh-rsa';
      } catch (e) {
        return false;
      }
    }
    return /rsa/i.test(name);
  });
}

function hasAgeBinary() {
  const probe = spawnSync('age', ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function commandExists(commandName) {
  if (!commandName) return false;
  if (process.platform === 'win32') {
    const probe = spawnSync('where', [commandName], { stdio: 'ignore' });
    return probe.status === 0;
  }
  const probe = spawnSync('sh', ['-lc', `command -v "${commandName}"`], { stdio: 'ignore' });
  return probe.status === 0;
}

function getAgeInstallPlan() {
  if (process.platform === 'darwin') {
    if (commandExists('brew')) {
      return {
        platform: 'macOS',
        command: 'brew install age',
        hint: 'Install Homebrew first: https://brew.sh'
      };
    }
    return {
      platform: 'macOS',
      command: '',
      hint: 'Homebrew not found. Install Homebrew first, then run: brew install age'
    };
  }

  if (process.platform === 'win32') {
    if (commandExists('winget')) {
      return {
        platform: 'Windows',
        command: 'winget install --id FiloSottile.age -e --accept-source-agreements --accept-package-agreements',
        hint: 'If winget is unavailable, try: choco install age -y'
      };
    }
    if (commandExists('choco')) {
      return {
        platform: 'Windows',
        command: 'choco install age -y',
        hint: 'If choco is unavailable, try winget or scoop.'
      };
    }
    if (commandExists('scoop')) {
      return {
        platform: 'Windows',
        command: 'scoop install age',
        hint: 'If scoop is unavailable, install winget/choco first.'
      };
    }
    return {
      platform: 'Windows',
      command: '',
      hint: 'No supported package manager found (winget/choco/scoop). Install age manually.'
    };
  }

  if (commandExists('apt-get')) {
    return {
      platform: 'Linux',
      command: 'sudo apt-get update && sudo apt-get install -y age',
      hint: ''
    };
  }
  if (commandExists('dnf')) {
    return {
      platform: 'Linux',
      command: 'sudo dnf install -y age',
      hint: ''
    };
  }
  if (commandExists('yum')) {
    return {
      platform: 'Linux',
      command: 'sudo yum install -y age',
      hint: ''
    };
  }
  if (commandExists('pacman')) {
    return {
      platform: 'Linux',
      command: 'sudo pacman -Sy --noconfirm age',
      hint: ''
    };
  }
  if (commandExists('zypper')) {
    return {
      platform: 'Linux',
      command: 'sudo zypper install -y age',
      hint: ''
    };
  }
  return {
    platform: 'Linux',
    command: '',
    hint: 'No supported package manager detected. Install age manually.'
  };
}

function printAgeInstallGuidance() {
  const plan = getAgeInstallPlan();
  console.log(`\x1b[33m[aih]\x1b[0m age CLI is required for SSH-key encryption/decryption.`);
  if (plan.command) {
    console.log(`\x1b[90m[Hint]\x1b[0m ${plan.platform} install command: ${plan.command}`);
  }
  if (plan.hint) {
    console.log(`\x1b[90m[Hint]\x1b[0m ${plan.hint}`);
  }
}

function tryAutoInstallAge() {
  const plan = getAgeInstallPlan();
  if (!plan.command) {
    printAgeInstallGuidance();
    return false;
  }

  printAgeInstallGuidance();
  const autoInstallByEnv = String(process.env.AIH_AUTO_INSTALL_AGE || '').trim() === '1';
  const interactive = !!(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
  if (!interactive && !autoInstallByEnv) {
    console.log('\x1b[90m[Hint]\x1b[0m Non-interactive shell detected. Set AIH_AUTO_INSTALL_AGE=1 to auto-install age.');
    return false;
  }

  const shouldInstall = autoInstallByEnv ? true : askYesNo('Do you want ai-home to run this install command now?', true);
  if (!shouldInstall) return false;

  try {
    console.log(`\x1b[36m[aih]\x1b[0m Installing age via: ${plan.command}`);
    execSync(plan.command, { stdio: 'inherit' });
  } catch (e) {
    console.error(`\x1b[31m[aih] Failed to install age automatically: ${e.message}\x1b[0m`);
    return false;
  }

  if (!hasAgeBinary()) {
    console.error('\x1b[31m[aih] age install command finished, but age is still not found in PATH.\x1b[0m');
    return false;
  }
  console.log('\x1b[32m[aih] age is now available.\x1b[0m');
  return true;
}

function readSshPublicKeyParts(pubKeyPath) {
  const text = String(fs.readFileSync(pubKeyPath, 'utf8')).trim();
  const parts = text.split(/\s+/);
  if (parts.length < 2) return null;
  const keyType = parts[0];
  const keyBody = parts[1];
  const comment = parts.slice(2).join(' ') || '';
  return { keyType, keyBody, comment };
}

function getAgeCompatibleSshPublicKeys() {
  const sshDir = path.join(HOST_HOME_DIR, '.ssh');
  if (!fs.existsSync(sshDir)) return [];
  return fs.readdirSync(sshDir)
    .filter((name) => name.startsWith('id_') && name.endsWith('.pub'))
    .map((name) => {
      const pubPath = path.join(sshDir, name);
      try {
        const parts = readSshPublicKeyParts(pubPath);
        if (!parts || !AGE_SSH_KEY_TYPES.has(parts.keyType)) return null;
        return {
          pubFile: name,
          privateFile: name.replace(/\.pub$/, ''),
          keyType: parts.keyType,
          recipient: `${parts.keyType} ${parts.keyBody}`,
          comment: parts.comment
        };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

function getAgeCompatibleSshPrivateKeys() {
  const sshDir = path.join(HOST_HOME_DIR, '.ssh');
  return getAgeCompatibleSshPublicKeys()
    .map((entry) => {
      const privatePath = path.join(sshDir, entry.privateFile);
      if (!fs.existsSync(privatePath)) return null;
      return {
        privateFile: entry.privateFile,
        privatePath,
        keyType: entry.keyType,
        comment: entry.comment
      };
    })
    .filter(Boolean);
}

function isAgeArmoredData(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const header = buffer.subarray(0, 96).toString('utf8');
  return header.includes('BEGIN AGE ENCRYPTED FILE');
}

function runAgeEncrypt(inputTarPath, outputPath, recipient) {
  const result = spawnSync('age', ['--encrypt', '--armor', '-r', recipient, '-o', outputPath, inputTarPath], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim() || 'age encryption failed.';
    throw new Error(message);
  }
}

function runAgeDecrypt(inputFilePath, outputTarPath, identityPath) {
  const result = spawnSync('age', ['--decrypt', '-i', identityPath, '-o', outputTarPath, inputFilePath], {
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`age decryption failed with ~/.ssh/${path.basename(identityPath)}.`);
  }
}

function createPrivateKeyObject(privateKeyContent, passphrase) {
  return crypto.createPrivateKey({
    key: privateKeyContent,
    passphrase: passphrase || undefined
  });
}

function loadRsaPrivateKey(privateKeyPath, passphrase) {
  const keyContent = fs.readFileSync(privateKeyPath, 'utf8');
  const keyObj = createPrivateKeyObject(keyContent, passphrase);
  const keyType = String(keyObj.asymmetricKeyType || '');
  if (!keyType.startsWith('rsa')) {
    throw new Error(`Unsupported SSH key type "${keyType}". Only RSA keys are supported for public-key encryption.`);
  }
  return keyObj;
}

function derivePasswordKey(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encryptWithAesGcm(plainBuffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptWithAesGcm(payload, key) {
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function buildPasswordEnvelope(plainBuffer, password) {
  const salt = crypto.randomBytes(16);
  const key = derivePasswordKey(password, salt);
  const encrypted = encryptWithAesGcm(plainBuffer, key);
  return {
    version: EXPORT_VERSION,
    mode: 'password',
    kdf: {
      type: 'scrypt',
      salt: salt.toString('base64')
    },
    ...encrypted
  };
}

function decryptPasswordEnvelope(envelope, password) {
  if (!envelope.kdf || envelope.kdf.type !== 'scrypt' || !envelope.kdf.salt) {
    throw new Error('Invalid password envelope.');
  }
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const key = derivePasswordKey(password, salt);
  return decryptWithAesGcm(envelope, key);
}

function decryptSshRsaEnvelope(envelope, privateKeyObj) {
  if (!envelope.wrappedKey) throw new Error('Missing wrappedKey in SSH envelope.');
  const dataKey = crypto.privateDecrypt(
    {
      key: privateKeyObj,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(envelope.wrappedKey, 'base64')
  );
  return decryptWithAesGcm(envelope, dataKey);
}

function serializeEnvelope(envelope) {
  return Buffer.from(`${EXPORT_MAGIC}${JSON.stringify(envelope)}`, 'utf8');
}

function parseEnvelope(buffer) {
  const asText = buffer.toString('utf8');
  if (!asText.startsWith(EXPORT_MAGIC)) return null;
  const payload = JSON.parse(asText.slice(EXPORT_MAGIC.length));
  if (!payload || payload.version !== EXPORT_VERSION) {
    throw new Error('Unsupported export format version.');
  }
  return payload;
}

function decryptLegacyEnvelope(buffer, secret) {
  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(28, 44);
  const encrypted = buffer.subarray(44);
  const key = derivePasswordKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function ensureAesSuffix(fileName) {
  if (!fileName) return defaultExportName();
  return fileName.endsWith('.aes') ? fileName : `${fileName}.aes`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function defaultExportName() {
  const d = new Date();
  const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  return `ai-home+${ts}.aes`;
}

function parseExportArgs(exportArgs) {
  if (!exportArgs || exportArgs.length === 0) {
    return { targetFile: defaultExportName(), selectors: [] };
  }

  const first = exportArgs[0];
  const looksLikeSelector = first.includes(':') || CLI_CONFIGS[first];

  if (looksLikeSelector) {
    return { targetFile: defaultExportName(), selectors: exportArgs };
  }

  return { targetFile: first, selectors: exportArgs.slice(1) };
}

function parseImportArgs(importArgs) {
  let targetFile = '';
  let overwrite = false;
  const extra = [];
  (importArgs || []).forEach((argRaw) => {
    const arg = String(argRaw || '').trim();
    if (!arg) return;
    if (arg === '-o' || arg === '--overwrite') {
      overwrite = true;
      return;
    }
    if (!targetFile) {
      targetFile = arg;
      return;
    }
    extra.push(arg);
  });
  if (extra.length > 0) {
    throw new Error(`Unexpected argument(s): ${extra.join(' ')}`);
  }
  return { targetFile, overwrite };
}

function parseCodexBulkImportArgs(rawArgs) {
  let sourceDir = 'accounts';
  let parallel = 8;
  let limit = 0;
  let dryRun = false;

  const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const arg = String(tokens[i] || '').trim();
    if (!arg) continue;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--parallel' || arg === '-p') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --parallel value');
      parallel = Math.max(1, Math.min(32, Number(val)));
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --limit value');
      limit = Number(val);
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    sourceDir = arg;
  }

  return { sourceDir, parallel, limit, dryRun };
}

function parseCodexRefreshTokenLine(line) {
  const payload = line && typeof line === 'object' ? line : null;
  if (!payload) return null;
  const refreshToken = payload.refresh_token || (payload.tokens && payload.tokens.refresh_token) || '';
  if (!refreshToken.startsWith('rt_')) return null;
  const idToken = String(payload.id_token || (payload.tokens && payload.tokens.id_token) || '').trim();
  const accessToken = String(payload.access_token || (payload.tokens && payload.tokens.access_token) || '').trim();
  const email = String(payload.email || '').trim();
  const explicitAccountId = String(payload.account_id || (payload.tokens && payload.tokens.account_id) || '').trim();
  const accountSlug = explicitAccountId || (email ? email.split('@')[0] : '');
  return { email, accountSlug, refreshToken, idToken, accessToken };
}

function buildCodexAuthFromRefreshToken(entry) {
  const accountId = entry.accountSlug || `imported-${crypto.randomBytes(6).toString('hex')}`;
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: String(entry.idToken || ''),
      access_token: String(entry.accessToken || ''),
      refresh_token: entry.refreshToken,
      account_id: accountId
    },
    last_refresh: new Date().toISOString()
  };
}

function getNextNumericId(cliName) {
  const ids = getToolAccountIds(cliName).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

function collectJsonFilesRecursively(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && /\.json$/i.test(entry.name)) {
        out.push(fullPath);
      }
    }
  }
  return out.sort();
}

function collectExistingCodexRefreshTokens() {
  const out = new Set();
  const codexRoot = path.join(PROFILES_DIR, 'codex');
  if (!fs.existsSync(codexRoot)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(codexRoot, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const authPath = path.join(codexRoot, entry.name, '.codex', 'auth.json');
    if (!fs.existsSync(authPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      const token = String((parsed && parsed.tokens && parsed.tokens.refresh_token) || '').trim();
      if (token.startsWith('rt_')) out.add(token);
    } catch (e) {
      // ignore invalid auth payloads
    }
  }
  return out;
}

async function importCodexTokensFromOutput(options) {
  const sourceDir = path.resolve(options.sourceDir);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  const tokenFiles = collectJsonFilesRecursively(sourceDir);
  if (tokenFiles.length === 0) {
    return {
      sourceDir, scannedFiles: 0, parsedLines: 0, imported: 0, duplicates: 0, invalid: 0, dryRun: !!options.dryRun
    };
  }

  let nextId = getNextNumericId('codex');
  let parsedLines = 0;
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  let failed = 0;
  let firstError = '';
  const seenRefreshTokens = collectExistingCodexRefreshTokens();
  const maxConcurrency = Math.max(1, Number(options.parallel) || 8);
  const limit = Math.max(0, Number(options.limit) || 0);
  const queue = [];

  for (const tokenFile of tokenFiles) {
    if (limit > 0 && parsedLines >= limit) break;
    let parsedJson = null;
    try {
      const content = fs.readFileSync(tokenFile, 'utf8');
      parsedJson = JSON.parse(content);
    } catch (e) {
      invalid += 1;
      continue;
    }
    const parsed = parseCodexRefreshTokenLine(parsedJson);
    if (!parsed) {
      invalid += 1;
      continue;
    }
    parsedLines += 1;
    if (seenRefreshTokens.has(parsed.refreshToken)) {
      duplicates += 1;
      continue;
    }
    seenRefreshTokens.add(parsed.refreshToken);
    queue.push(parsed);
  }

  if (options.dryRun) {
    imported = queue.length;
  } else if (queue.length > 0) {
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= queue.length) return;
        const entry = queue[idx];
        const id = String(nextId++);
        try {
          ensureDir(getProfileDir('codex', id));
          const codexDir = getToolConfigDir('codex', id);
          ensureDir(codexDir);
          const authPayload = buildCodexAuthFromRefreshToken(entry);
          fs.writeFileSync(path.join(codexDir, 'auth.json'), JSON.stringify(authPayload, null, 2));
          imported += 1;
        } catch (e) {
          failed += 1;
          if (!firstError) firstError = e.message;
        }
      }
    };
    const workerCount = Math.min(maxConcurrency, queue.length);
    const workers = [];
    for (let i = 0; i < workerCount; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  return {
    sourceDir,
    scannedFiles: tokenFiles.length,
    parsedLines,
    imported,
    duplicates,
    invalid,
    failed,
    firstError,
    dryRun: !!options.dryRun
  };
}

function buildProgressBar(current, total, width = 22) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(width * ratio);
  return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`;
}

function renderStageProgress(prefix, current, total, label) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.max(0, Math.min(1, current / safeTotal));
  const pct = Math.round(ratio * 100);
  const bar = buildProgressBar(current, safeTotal);
  process.stdout.write(`\r${prefix} ${bar} ${String(pct).padStart(3, ' ')}% ${label}\x1b[K`);
  if (current >= safeTotal) {
    process.stdout.write('\n');
  }
}

function expandSelectorsToPaths(selectors) {
  if (!selectors || selectors.length === 0) return ['profiles'];
  const targetSet = new Set();

  selectors.forEach((selRaw) => {
    const sel = String(selRaw || '').trim();
    if (!sel) return;

    if (sel.includes(':')) {
      const [toolRaw, idStrRaw] = sel.split(':');
      const tool = (toolRaw || '').trim();
      const idStr = (idStrRaw || '').trim();
      if (!CLI_CONFIGS[tool] || !idStr) return;

      const ids = idStr.split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
      ids.forEach((id) => {
        const p = `profiles/${tool}/${id}`;
        if (fs.existsSync(path.join(AI_HOME_DIR, p))) targetSet.add(p);
      });
      return;
    }

    if (CLI_CONFIGS[sel]) {
      const p = `profiles/${sel}`;
      if (fs.existsSync(path.join(AI_HOME_DIR, p))) targetSet.add(p);
    }
  });

  return Array.from(targetSet);
}

function isNumericAccountId(name) {
  return /^\d+$/.test(String(name || ''));
}

function getProfileIdentityLabel(cliName, profileDir) {
  const { configured, accountName } = checkStatus(cliName, profileDir);
  if (!configured) return 'Pending Login';
  if (!accountName || accountName === 'Unknown') return 'Unknown';
  return accountName;
}

function formatRestoreEntry(entry) {
  return `${entry.tool} ${entry.id} (${entry.identity})`;
}

function printRestoreDetails(title, color, entries) {
  if (!entries || entries.length === 0) return;
  console.log(`${color}${title}\x1b[0m`);
  entries.forEach((entry) => {
    console.log(`  - ${formatRestoreEntry(entry)}`);
  });
}

function restoreProfilesFromExtractedBackup(extractRoot, overwriteExisting, onAccountProgress) {
  const srcProfilesDir = path.join(extractRoot, 'profiles');
  if (!fs.existsSync(srcProfilesDir) || !fs.statSync(srcProfilesDir).isDirectory()) {
    throw new Error('Backup archive does not contain a profiles/ directory.');
  }

  ensureDir(PROFILES_DIR);
  const summary = {
    imported: 0,
    overwritten: 0,
    skipped: 0,
    metadataCopied: 0,
    importedAccounts: [],
    overwrittenAccounts: [],
    skippedAccounts: [],
    totalAccounts: 0
  };

  const tools = fs.readdirSync(srcProfilesDir)
    .filter((name) => fs.statSync(path.join(srcProfilesDir, name)).isDirectory());

  tools.forEach((tool) => {
    const srcToolDir = path.join(srcProfilesDir, tool);
    const entries = fs.readdirSync(srcToolDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory() && isNumericAccountId(entry.name)) {
        summary.totalAccounts += 1;
      }
    });
  });

  let processedAccounts = 0;
  tools.forEach((tool) => {
    const srcToolDir = path.join(srcProfilesDir, tool);
    const dstToolDir = path.join(PROFILES_DIR, tool);
    ensureDir(dstToolDir);

    const entries = fs.readdirSync(srcToolDir, { withFileTypes: true });
    entries.forEach((entry) => {
      const srcEntry = path.join(srcToolDir, entry.name);
      const dstEntry = path.join(dstToolDir, entry.name);

      if (entry.isDirectory() && isNumericAccountId(entry.name)) {
        if (fs.existsSync(dstEntry)) {
          if (!overwriteExisting) {
            summary.skipped += 1;
            summary.skippedAccounts.push({
              tool,
              id: entry.name,
              identity: getProfileIdentityLabel(tool, dstEntry)
            });
            processedAccounts += 1;
            if (typeof onAccountProgress === 'function') {
              onAccountProgress(processedAccounts, summary.totalAccounts, `${tool}:${entry.name} skipped`);
            }
            return;
          }
          fse.removeSync(dstEntry);
          fse.copySync(srcEntry, dstEntry, { overwrite: true });
          summary.overwritten += 1;
          summary.overwrittenAccounts.push({
            tool,
            id: entry.name,
            identity: getProfileIdentityLabel(tool, dstEntry)
          });
          processedAccounts += 1;
          if (typeof onAccountProgress === 'function') {
            onAccountProgress(processedAccounts, summary.totalAccounts, `${tool}:${entry.name} overwritten`);
          }
          return;
        }
        fse.copySync(srcEntry, dstEntry, { overwrite: true });
        summary.imported += 1;
        summary.importedAccounts.push({
          tool,
          id: entry.name,
          identity: getProfileIdentityLabel(tool, dstEntry)
        });
        processedAccounts += 1;
        if (typeof onAccountProgress === 'function') {
          onAccountProgress(processedAccounts, summary.totalAccounts, `${tool}:${entry.name} imported`);
        }
        return;
      }

      if (overwriteExisting || !fs.existsSync(dstEntry)) {
        fse.copySync(srcEntry, dstEntry, { overwrite: true });
        summary.metadataCopied += 1;
      }
    });
  });

  return summary;
}

if (cmd === 'export') {
  const { targetFile: parsedTargetFile, selectors } = parseExportArgs(args.slice(1));
  const targetFile = ensureAesSuffix(parsedTargetFile);

  let targetPaths = expandSelectorsToPaths(selectors);
  if (selectors.length > 0) {
    if (targetPaths.length === 0) {
      console.error('\x1b[31m[aih] No matching profiles found for the given selectors.\x1b[0m');
      process.exit(1);
    }
    console.log(`\x1b[36m[aih]\x1b[0m This will encrypt the following targets:\n  - ${targetPaths.join('\n  - ')}`);
  } else {
    console.log('\x1b[36m[aih]\x1b[0m This will encrypt your entire ~/.ai_home/profiles directory (including API Keys and Tokens).');
  }

  let ageAvailable = hasAgeBinary();
  if (!ageAvailable) {
    const installed = tryAutoInstallAge();
    ageAvailable = installed || hasAgeBinary();
  }

  const agePublicKeys = ageAvailable ? getAgeCompatibleSshPublicKeys() : [];
  if (!ageAvailable) {
    console.log('\x1b[33m[aih]\x1b[0m age CLI not found. SSH-key encryption is unavailable; password mode only.');
  } else if (agePublicKeys.length === 0) {
    console.log('\x1b[33m[aih]\x1b[0m No AGE-compatible SSH public keys found (~/.ssh/id_*.pub with ssh-ed25519/ssh-rsa).');
  }

  const options = ['Password (AES-256-GCM)', ...agePublicKeys.map((k) => `AGE SSH Key: ~/.ssh/${k.pubFile} (${k.keyType})`)];
  const index = readline.keyInSelect(options, 'Choose encryption method:');
  if (index === -1) {
    console.log("Operation cancelled.");
    process.exit(0);
  }

  let mode = 'password';
  let password = '';
  let ageRecipient = null;

  if (index === 0) {
    password = readline.question('Enter an encryption password: ', { hideEchoBack: true });
    const pwdConfirm = readline.question('Confirm password: ', { hideEchoBack: true });
    if (password !== pwdConfirm) {
      console.error('\n\x1b[31m[aih] Passwords do not match.\x1b[0m');
      process.exit(1);
    }
    if (!password) {
      console.error('\n\x1b[31m[aih] Password cannot be empty.\x1b[0m');
      process.exit(1);
    }
  } else {
    mode = 'age-ssh';
    ageRecipient = agePublicKeys[index - 1];
    if (!ageRecipient) {
      console.error(`\n\x1b[31m[aih] Invalid SSH key selection.\x1b[0m`);
      process.exit(1);
    }
    console.log(`\x1b[32mSelected AGE SSH key: ${ageRecipient.pubFile} (${ageRecipient.keyType})\x1b[0m`);
  }

  const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
  try {
    const exportStages = 4;
    renderStageProgress('[aih export]', 1, exportStages, 'Packaging profiles');
    const pathsArg = targetPaths.map(p => `"${p}"`).join(' ');
    execSync(`tar -czf "${tmpTar}" -C "${AI_HOME_DIR}" ${pathsArg}`, { stdio: 'ignore' });

    const outPath = path.resolve(targetFile);
    renderStageProgress('[aih export]', 2, exportStages, 'Encrypting backup');
    if (mode === 'password') {
      const input = fs.readFileSync(tmpTar);
      const envelope = buildPasswordEnvelope(input, password);
      renderStageProgress('[aih export]', 3, exportStages, 'Writing encrypted file');
      fs.writeFileSync(outPath, serializeEnvelope(envelope));
    } else {
      runAgeEncrypt(tmpTar, outPath, ageRecipient.recipient);
      renderStageProgress('[aih export]', 3, exportStages, 'Writing encrypted file');
    }
    renderStageProgress('[aih export]', 4, exportStages, 'Completed');
    const modeLabel = mode === 'password' ? 'password' : `age-ssh (${ageRecipient.pubFile})`;
    console.log(`\x1b[32m[Success] Assets securely exported to:\x1b[0m ${outPath} \x1b[90m[mode: ${modeLabel}]\x1b[0m`);
  } catch (e) {
    console.error(`\n\x1b[31m[Error] Failed to export: ${e.message}\x1b[0m`);
  } finally {
    if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
  }
  process.exit(0);
}

if (cmd === 'import') {
  let targetFile = '';
  let overwriteExisting = false;
  try {
    const parsed = parseImportArgs(args.slice(1));
    targetFile = parsed.targetFile;
    overwriteExisting = parsed.overwrite;
  } catch (e) {
    console.error(`\x1b[31m[aih] ${e.message}. Usage: aih import [-o] <file.aes>\x1b[0m`);
    process.exit(1);
  }
  if (!targetFile || !fs.existsSync(targetFile)) {
    console.error('\x1b[31m[aih] File not found. Usage: aih import [-o] <file.aes>\x1b[0m');
    process.exit(1);
  }

  const tmpTar = path.join(os.tmpdir(), `aih_backup_${Date.now()}.tar.gz`);
  const tmpExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_restore_'));
  
  try {
    const importStages = 4;
    renderStageProgress('[aih import]', 1, importStages, 'Decrypting backup');
    const data = fs.readFileSync(targetFile);
    const envelope = parseEnvelope(data);
    let decrypted = null;
    let tarReady = false;

    if (envelope) {
      if (envelope.mode === 'password') {
        const password = readline.question('Enter decryption password: ', { hideEchoBack: true });
        if (!password) throw new Error('Password cannot be empty.');
        decrypted = decryptPasswordEnvelope(envelope, password);
      } else if (envelope.mode === 'ssh-rsa') {
        let privateKeyObj = null;
        if (envelope.keyHint) {
          const hintPath = path.join(HOST_HOME_DIR, '.ssh', envelope.keyHint);
          if (fs.existsSync(hintPath)) {
            try {
              privateKeyObj = loadRsaPrivateKey(hintPath, '');
              decrypted = decryptSshRsaEnvelope(envelope, privateKeyObj);
              console.log(`\x1b[36m[aih]\x1b[0m Auto-unlocked with ~/.ssh/${envelope.keyHint}.`);
            } catch (e) {
              // Fallback to manual selection below.
            }
          }
        }

        if (!decrypted) {
          const rsaKeys = getLikelyRsaSshPrivateKeys();
          if (rsaKeys.length === 0) {
            throw new Error('No RSA SSH private keys found under ~/.ssh (required for ssh-rsa encrypted backup).');
          }
          const idx = readline.keyInSelect(rsaKeys.map((k) => `~/.ssh/${k}`), 'Choose SSH RSA private key for decryption:');
          if (idx === -1) {
            console.log("Operation cancelled.");
            process.exit(0);
          }
          const keyName = rsaKeys[idx];
          const keyPath = path.join(HOST_HOME_DIR, '.ssh', keyName);
          let passphrase = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              privateKeyObj = loadRsaPrivateKey(keyPath, passphrase);
              decrypted = decryptSshRsaEnvelope(envelope, privateKeyObj);
              break;
            } catch (e) {
              if (attempt === 2) throw e;
              passphrase = readline.question(`Passphrase for ~/.ssh/${keyName} (leave empty if none): `, { hideEchoBack: true });
            }
          }
        }
    } else {
      throw new Error(`Unsupported envelope mode: ${envelope.mode}`);
    }
  } else if (isAgeArmoredData(data)) {
      if (!hasAgeBinary()) {
        const installed = tryAutoInstallAge();
        if (!installed && !hasAgeBinary()) {
          throw new Error('This backup uses age, but age CLI is not installed.');
        }
      }
      const ageKeys = getAgeCompatibleSshPrivateKeys();
      if (ageKeys.length === 0) {
        throw new Error('No AGE-compatible SSH private keys found under ~/.ssh.');
      }
      const idx = readline.keyInSelect(
        ageKeys.map((k) => `~/.ssh/${k.privateFile} (${k.keyType})`),
        'Choose SSH private key for age decryption:'
      );
      if (idx === -1) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
      runAgeDecrypt(path.resolve(targetFile), tmpTar, ageKeys[idx].privatePath);
      tarReady = true;
      console.log(`\x1b[36m[aih]\x1b[0m Decrypted with ~/.ssh/${ageKeys[idx].privateFile}.`);
    } else {
      console.log('\x1b[33m[aih]\x1b[0m Legacy backup format detected.');
      const sshKeys = getSshKeys();
      const options = ['Password (legacy AES)', ...sshKeys.map((k) => `Legacy SSH-key secret: ~/.ssh/${k}`)];
      const index = readline.keyInSelect(options, 'Choose legacy decryption method:');
      if (index === -1) {
        console.log("Operation cancelled.");
        process.exit(0);
      }
      let secret = '';
      if (index === 0) {
        secret = readline.question('Enter legacy decryption password: ', { hideEchoBack: true });
      } else {
        const sshKeyName = sshKeys[index - 1];
        secret = fs.readFileSync(path.join(HOST_HOME_DIR, '.ssh', sshKeyName), 'utf8');
      }
      if (!secret) throw new Error('Decryption secret cannot be empty.');
      decrypted = decryptLegacyEnvelope(data, secret);
    }

    if (!tarReady) {
      fs.writeFileSync(tmpTar, decrypted);
    }
    renderStageProgress('[aih import]', 2, importStages, 'Extracting backup archive');
    execSync(`tar -xzf "${tmpTar}" -C "${tmpExtractDir}"`, { stdio: 'ignore' });
    renderStageProgress('[aih import]', 3, importStages, 'Restoring account profiles');
    const summary = restoreProfilesFromExtractedBackup(
      tmpExtractDir,
      overwriteExisting,
      (processed, total, label) => {
        if (total > 0) {
          renderStageProgress('  [restore]', processed, total, label);
        }
      }
    );
    if (summary.totalAccounts === 0) {
      console.log('\x1b[90m[aih]\x1b[0m No account directories found in backup.');
    }
    renderStageProgress('[aih import]', 4, importStages, 'Completed');

    if (summary.skipped > 0 && !overwriteExisting) {
      console.log(`\x1b[33m[aih]\x1b[0m Skipped existing accounts: ${summary.skipped} (use -o to overwrite).`);
    }

    printRestoreDetails('[Imported]', '\x1b[32m', summary.importedAccounts);
    printRestoreDetails('[Overwritten]', '\x1b[33m', summary.overwrittenAccounts);
    printRestoreDetails('[Skipped]', '\x1b[90m', summary.skippedAccounts);
    console.log(`\x1b[32m[Success] Restore completed!\x1b[0m imported=${summary.imported}, overwritten=${summary.overwritten}, skipped=${summary.skipped}`);
  } catch (e) {
    console.error(`\n\x1b[31m[Error] Failed to import: ${e.message}\x1b[0m`);
  } finally {
    if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
    if (fs.existsSync(tmpExtractDir)) fse.removeSync(tmpExtractDir);
  }
  process.exit(0);
}

if (cmd === 'proxy') {
  (async () => {
    const code = await runProxyCommand(args, {
      showProxyUsage,
      proxyDaemon,
      parseProxySyncArgs,
      parseProxyServeArgs,
      parseProxyEnvArgs,
      startLocalProxyServer,
      syncCodexAccountsToProxy
    });
    if (typeof code === 'number') process.exit(code);
  })();
  return;
}

const cliName = cmd;
if (!CLI_CONFIGS[cliName]) {
  console.error(`\x1b[31m[aih] Unknown tool '${cliName}'. Supported: ${Object.keys(CLI_CONFIGS).join(', ')}\x1b[0m`);
  process.exit(1);
}

let idOrAction = args[1];
let forwardArgs = [];
const UNLOCK_ACTIONS = new Set(['unlock', '--unlock', 'unexhaust', 'unban', 'release']);
const USAGE_ACTIONS = new Set(['usage', '--usage', 'stats']);
const USAGES_ACTIONS = new Set(['usages', 'usage-all', 'all-usage', 'all-usages']);
const IMPORT_OUTPUT_ACTIONS = new Set(['import-output', 'import_output', 'bulk-import', 'bulk_import']);
const KNOWN_ACTIONS = new Set(['ls', 'set-default', 'add', 'login', 'auto', ...UNLOCK_ACTIONS, ...USAGE_ACTIONS, ...USAGES_ACTIONS, ...IMPORT_OUTPUT_ACTIONS]);

if (idOrAction === 'help') {
  showCliUsage(cliName);
  process.exit(0);
}

if (idOrAction === 'ls') {
  const lsArg = String(args[2] || '').trim();
  if (lsArg === '--help' || lsArg === '-h' || lsArg === 'help') {
    showLsHelp(cliName);
    process.exit(0);
  }
  listProfiles(cliName);
  process.exit(0);
}

if (idOrAction === '--help' || idOrAction === '-h') {
  showCliUsage(cliName);
  process.exit(0);
}

if (idOrAction && UNLOCK_ACTIONS.has(idOrAction)) {
  const targetId = args[2];
  if (!targetId || !/^\d+$/.test(targetId)) {
    console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} unlock <id>\x1b[0m`);
    process.exit(1);
  }

  const sandboxDir = getProfileDir(cliName, targetId);
  if (!fs.existsSync(sandboxDir)) {
    console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
    process.exit(1);
  }

  const cleared = clearExhausted(cliName, targetId);
  if (cleared) {
    console.log(`\x1b[32m[Success]\x1b[0m Cleared [Exhausted Limit] for ${cliName} Account ID ${targetId}.`);
  } else {
    console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${targetId} was not marked as exhausted.`);
  }
  process.exit(0);
}

if (idOrAction && USAGE_ACTIONS.has(idOrAction)) {
  const targetId = args[2];
  if (!targetId) {
    printAllUsageSnapshots(cliName);
    process.exit(0);
  }
  if (!/^\d+$/.test(targetId)) {
    console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} usage <id>\x1b[0m`);
    process.exit(1);
  }
  const sandboxDir = getProfileDir(cliName, targetId);
  if (!fs.existsSync(sandboxDir)) {
    console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
    process.exit(1);
  }
  printUsageSnapshot(cliName, targetId);
  process.exit(0);
}

if (idOrAction && USAGES_ACTIONS.has(idOrAction)) {
  printAllUsageSnapshots(cliName);
  process.exit(0);
}

if (idOrAction && IMPORT_OUTPUT_ACTIONS.has(idOrAction)) {
  if (cliName !== 'codex') {
    console.error(`\x1b[31m[aih] ${idOrAction} is currently supported only for codex.\x1b[0m`);
    process.exit(1);
  }
  let parsedOptions;
  try {
    parsedOptions = parseCodexBulkImportArgs(args.slice(2));
  } catch (e) {
    console.error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
    console.log(`\x1b[90mUsage:\x1b[0m aih codex import-output [sourceDir] [--parallel <1-32>] [--limit <n>] [--dry-run]`);
    process.exit(1);
  }

  (async () => {
    try {
      const result = await importCodexTokensFromOutput(parsedOptions);
      const modeLabel = result.dryRun ? 'dry-run' : 'write';
      console.log(`\x1b[36m[aih]\x1b[0m codex import-output done (${modeLabel})`);
      console.log(`  source: ${result.sourceDir}`);
      console.log(`  files: ${result.scannedFiles}`);
      console.log(`  parsed: ${result.parsedLines}`);
      console.log(`  imported: ${result.imported}`);
      console.log(`  duplicates: ${result.duplicates}`);
      console.log(`  invalid: ${result.invalid}`);
      if (!result.dryRun) {
        console.log(`  failed: ${result.failed || 0}`);
        if (result.firstError) {
          console.log(`  first_error: ${result.firstError}`);
        }
      }
      process.exit(0);
    } catch (e) {
      console.error(`\x1b[31m[aih] import-output failed: ${e.message}\x1b[0m`);
      process.exit(1);
    }
  })();
  return;
}

if (idOrAction === 'set-default') {
  const targetId = args[2];
  if (!targetId || !/^\d+$/.test(targetId)) {
     console.error(`\x1b[31m[aih] Invalid ID. Usage: aih ${cliName} set-default <id>\x1b[0m`);
     process.exit(1);
  }
  const toolDir = path.join(PROFILES_DIR, cliName);
  const pDir = path.join(toolDir, targetId);
  if (!fs.existsSync(pDir)) {
     console.error(`\x1b[31m[aih] Account ID ${targetId} does not exist.\x1b[0m`);
     process.exit(1);
  }
  fs.writeFileSync(path.join(toolDir, '.aih_default'), targetId);
  console.log(`\x1b[32m[Success]\x1b[0m Set Account ID ${targetId} as default for ${cliName} in ai-home.`);
  const sessionSync = ensureSessionStoreLinks(cliName, targetId);
  if (sessionSync.migrated > 0 || sessionSync.linked > 0) {
    console.log(`\x1b[36m[aih]\x1b[0m Session links refreshed (${cliName}): migrated ${sessionSync.migrated}, linked ${sessionSync.linked}.`);
  }
  process.exit(0);
}

// API Key Environment auto-routing (If keys are exported in the terminal)
const activeEnv = extractActiveEnv(cliName);
// Only auto-route if NO action or ID is provided (e.g., just "aih codex")
if (activeEnv && !idOrAction) {
  let matchedId = findEnvSandbox(cliName, activeEnv);
  if (!matchedId) {
    matchedId = getNextId(cliName);
    createAccount(cliName, matchedId, true); // skip migration
    fs.writeFileSync(path.join(getProfileDir(cliName, matchedId), '.aih_env.json'), JSON.stringify(activeEnv, null, 2));
    console.log(`\x1b[36m[aih]\x1b[0m Auto-detected API Keys! Created Sandbox \x1b[32m${matchedId}\x1b[0m bound to these keys.`);
  } else {
    console.log(`\x1b[36m[aih]\x1b[0m Auto-detected API Keys! Routing to existing Sandbox \x1b[32m${matchedId}\x1b[0m.`);
  }
  runCliPty(cliName, matchedId, args.slice(1), false);
  return;
}

if (idOrAction === 'add' || idOrAction === 'login') {
  const mode = args[2]; // e.g., 'api_key'
  const nextId = getNextId(cliName);

  if (mode === 'api_key') {
     console.log(`\n\x1b[36m[aih]\x1b[0m Configuring API Key mode for Sandbox \x1b[32m${nextId}\x1b[0m`);
     let newEnv = {};
     CLI_CONFIGS[cliName].envKeys.forEach(k => {
       const isOptional = k.includes('BASE_URL');
       const val = readline.question(`${k}${isOptional ? ' (Optional)' : ''}: `).trim();
       if (val) newEnv[k] = val;
     });
     
     if (Object.keys(newEnv).length > 0) {
       createAccount(cliName, nextId, true); // skip migration
       fs.writeFileSync(path.join(getProfileDir(cliName, nextId), '.aih_env.json'), JSON.stringify(newEnv, null, 2));
       console.log(`\x1b[32m[Success]\x1b[0m API Keys bound to Sandbox ${nextId}!\n`);
       runCliPty(cliName, nextId, [], false);
     } else {
       console.log("\x1b[31mNo keys provided. Operation cancelled.\x1b[0m");
     }
     return;
  }

  const shouldLogin = createAccount(cliName, nextId);
  if (shouldLogin) {
    runCliPty(cliName, nextId, [], true);
  } else {
    console.log(`\x1b[36m[aih]\x1b[0m Account 1 is ready. Run \`aih ${cliName} 1\` to start.`);
    process.exit(0);
  }
  return;
}

if (idOrAction === 'auto') {
  const toolDir = path.join(PROFILES_DIR, cliName);
  if (!fs.existsSync(toolDir)) {
     console.log(`\x1b[31mNo accounts found for ${cliName}. Use 'aih ${cliName} add' first.\x1b[0m`);
     process.exit(1);
  }
  
  const nextId = getNextAvailableId(cliName, null);
  if (!nextId) {
    console.log(`\x1b[31mNo active (non-exhausted) accounts found to auto-route. Use 'aih ${cliName} add' first.\x1b[0m`);
    process.exit(1);
  }
  
  console.log(`\x1b[36m[aih auto]\x1b[0m Auto-selected Account ID: \x1b[32m${nextId}\x1b[0m`);
  
  forwardArgs = args.slice(2);
  runCliPty(cliName, nextId, forwardArgs);
  return;
}

let id = "1";
if (idOrAction && /^\d+$/.test(idOrAction)) {
  id = idOrAction;

  const idStyleAction = args[2];
  if (idStyleAction && UNLOCK_ACTIONS.has(idStyleAction)) {
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) {
      console.error(`\x1b[31m[aih] Account ID ${id} does not exist.\x1b[0m`);
      process.exit(1);
    }
    const cleared = clearExhausted(cliName, id);
    if (cleared) {
      console.log(`\x1b[32m[Success]\x1b[0m Cleared [Exhausted Limit] for ${cliName} Account ID ${id}.`);
    } else {
      console.log(`\x1b[90m[aih]\x1b[0m ${cliName} Account ID ${id} was not marked as exhausted.`);
    }
    process.exit(0);
  }
  if (idStyleAction && USAGE_ACTIONS.has(idStyleAction)) {
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) {
      console.error(`\x1b[31m[aih] Account ID ${id} does not exist.\x1b[0m`);
      process.exit(1);
    }
    printUsageSnapshot(cliName, id);
    process.exit(0);
  }
  if (idStyleAction && USAGES_ACTIONS.has(idStyleAction)) {
    const sandboxDir = getProfileDir(cliName, id);
    if (!fs.existsSync(sandboxDir)) {
      console.error(`\x1b[31m[aih] Account ID ${id} does not exist.\x1b[0m`);
      process.exit(1);
    }
    printUsageSnapshot(cliName, id);
    process.exit(0);
  }

  forwardArgs = args.slice(2);
} else {
  if (idOrAction && !KNOWN_ACTIONS.has(idOrAction)) {
    console.error(`\x1b[31m[aih]\x1b[0m Unknown subcommand: ${idOrAction}`);
    showCliUsage(cliName);
    process.exit(1);
  }

  // Check for default ID if not specified
  try {
     const defPath = path.join(PROFILES_DIR, cliName, '.aih_default');
     if (fs.existsSync(defPath)) {
        id = fs.readFileSync(defPath, 'utf8').trim();
     }
  } catch (e) {}

  if (idOrAction) {
    forwardArgs = args.slice(1);
  }
}

const sandboxDir = getProfileDir(cliName, id);

if (!fs.existsSync(sandboxDir)) {
  const globalFolder = CLI_CONFIGS[cliName] ? CLI_CONFIGS[cliName].globalDir : `.${cliName}`;
  const globalPath = path.join(HOST_HOME_DIR, globalFolder);

  if (id === "1" && fs.existsSync(globalPath) && fs.readdirSync(globalPath).length > 0) {
    const shouldLogin = createAccount(cliName, id);
    if (shouldLogin) {
      runCliPty(cliName, id, [], true);
      return;
    }
  } else {
    console.log(`\x1b[90mAccount ID ${id} for ${cliName} does not exist yet.\x1b[0m`);
    const ans = askYesNo(`\x1b[33mCreate Account ${id} and log in now?\x1b[0m`);
    if (ans === false) {
      console.log("Operation cancelled.");
      process.exit(0);
    }
    const shouldLogin = createAccount(cliName, id);
    if (shouldLogin) {
      runCliPty(cliName, id, [], true);
      return;
    }
  }
}

const { configured } = checkStatus(cliName, sandboxDir);
if (!configured) {
  console.log(`\n\x1b[33m[Notice]\x1b[0m Account ${id} exists but seems to have no login state.`);
  const ans = askYesNo(`Do you want to run the login flow for Account ${id} now?`);
  if (ans !== false) {
    runCliPty(cliName, id, [], true);
    return;
  }
}

// Refresh exhausted marker based on trusted usage snapshots before launch.
syncExhaustedStateFromUsage(cliName, id);

// Check if manually selected account is exhausted
if (isExhausted(cliName, id)) {
  console.log(`\x1b[33m[Warning]\x1b[0m Account ${id} is currently marked as exhausted.`);
  const ans = askYesNo(`Still want to proceed? (Select N to use 'auto' routing instead)`, false);
  if (ans === false) {
    console.log("Use `aih <cli> auto` to automatically pick a valid account.");
    process.exit(0);
  }
}

runCliPty(cliName, id, forwardArgs);

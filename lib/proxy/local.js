'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.type === 'text') return String(part.text || '');
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }
  return '';
}

function buildPromptFromChatRequest(body) {
  const messages = Array.isArray(body && body.messages) ? body.messages : [];
  if (messages.length === 0) return 'Please respond helpfully.';
  return messages.map((m) => {
    const role = String((m && m.role) || 'user');
    const text = extractTextFromContent(m && m.content);
    return `${role.toUpperCase()}:\n${text}`;
  }).join('\n\n');
}

function buildPromptFromResponsesRequest(body) {
  const input = body && body.input;
  if (typeof input === 'string' && input.trim()) return input.trim();
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return extractTextFromContent(item.content);
      }
      return '';
    }).filter(Boolean).join('\n\n');
  }
  return 'Please respond helpfully.';
}

function spawnWithTimeout(command, args, opts, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, opts);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch (e) {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) {}
      }, 500);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${String((error && error.message) || error)}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: Number(code) || 0, stdout, stderr, timedOut });
    });
  });
}

function getSandboxDir(provider, account, opts) {
  if (!opts || typeof opts.getProfileDir !== 'function') {
    throw new Error('proxy_local_missing_getProfileDir');
  }
  return opts.getProfileDir(provider, account.id);
}

async function runCodexLocalCompletion(account, prompt, timeoutMs, opts) {
  const sandboxDir = getSandboxDir('codex', account, opts);
  const outFile = path.join(os.tmpdir(), `aih-codex-out-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox', 'danger-full-access',
    '--output-last-message', outFile,
    prompt
  ];
  const env = {
    ...process.env,
    HOME: sandboxDir,
    USERPROFILE: sandboxDir,
    CODEX_HOME: path.join(sandboxDir, '.codex')
  };
  const cwd = (opts && opts.cwd) || process.cwd();
  const run = await spawnWithTimeout('codex', args, { env, cwd }, timeoutMs);
  let text = '';
  try {
    if (fs.existsSync(outFile)) text = String(fs.readFileSync(outFile, 'utf8') || '').trim();
  } catch (e) {}
  try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch (e) {}
  if (run.timedOut) {
    throw new Error('codex_exec_timeout');
  }
  if (run.code !== 0 && !text) {
    const msg = String(run.stderr || run.stdout || '').trim();
    throw new Error(msg || `codex_exec_exit_${run.code}`);
  }
  if (!text) {
    throw new Error('codex_empty_response');
  }
  return text;
}

function parseGeminiJsonPayload(stdoutText) {
  const text = String(stdoutText || '');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  const candidate = text.slice(first, last + 1).trim();
  try {
    return JSON.parse(candidate);
  } catch (e) {}
  return null;
}

function cleanGeminiTextOutput(stdoutText) {
  const lines = String(stdoutText || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !x.includes('YOLO mode is enabled'))
    .filter((x) => !x.includes('Loaded cached credentials.'));
  return lines.join('\n').trim();
}

async function runGeminiLocalCompletion(account, prompt, timeoutMs, opts) {
  const sandboxDir = getSandboxDir('gemini', account, opts);
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--approval-mode',
    'yolo'
  ];
  const env = {
    ...process.env,
    HOME: sandboxDir,
    USERPROFILE: sandboxDir,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(sandboxDir, '.gemini', 'settings.json')
  };
  const cwd = (opts && opts.cwd) || process.cwd();
  const run = await spawnWithTimeout('gemini', args, { env, cwd }, timeoutMs);
  if (run.timedOut) throw new Error('gemini_exec_timeout');
  const payload = parseGeminiJsonPayload(run.stdout);
  let text = payload && typeof payload.response === 'string' ? payload.response : '';
  if (!text) text = cleanGeminiTextOutput(run.stdout);
  if (!text && run.code !== 0) {
    const msg = String(run.stderr || run.stdout || '').trim();
    throw new Error(msg || `gemini_exec_exit_${run.code}`);
  }
  if (!text) throw new Error('gemini_empty_response');
  const discoveredModels = payload && payload.stats && payload.stats.models && typeof payload.stats.models === 'object'
    ? Object.keys(payload.stats.models).map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return { text, discoveredModels };
}

function initProxyMetrics() {
  return {
    startedAt: Date.now(),
    totalRequests: 0,
    totalSuccess: 0,
    totalFailures: 0,
    totalTimeouts: 0,
    routeCounts: {},
    providerCounts: { codex: 0, gemini: 0 },
    providerSuccess: { codex: 0, gemini: 0 },
    providerFailures: { codex: 0, gemini: 0 },
    lastErrors: []
  };
}

function pushMetricError(metrics, route, provider, message) {
  const item = {
    at: new Date().toISOString(),
    route,
    provider,
    error: String(message || '').slice(0, 500)
  };
  metrics.lastErrors.push(item);
  if (metrics.lastErrors.length > 20) {
    metrics.lastErrors = metrics.lastErrors.slice(-20);
  }
}

function parseRetryAtFromMessageMs(message) {
  const text = String(message || '');
  const m = text.match(/try again at\s+([^\n.]+)/i);
  if (!m) return 0;
  const parsed = Date.parse(String(m[1] || '').trim());
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function isLocalQuotaOrAuthError(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  if (m.includes('hit your usage limit')) return true;
  if (m.includes('upgrade to plus')) return true;
  if (m.includes('invalid api key')) return true;
  if (m.includes('unauthorized')) return true;
  if (m.includes('please run codex login')) return true;
  if (m.includes('authentication')) return true;
  if (m.includes('forbidden')) return true;
  return false;
}

function getLocalFailureCooldownMs(message, defaultCooldownMs) {
  const base = Math.max(1000, Number(defaultCooldownMs) || 60000);
  if (!isLocalQuotaOrAuthError(message)) return base;
  const retryAt = parseRetryAtFromMessageMs(message);
  if (retryAt > Date.now()) {
    const waitMs = retryAt - Date.now() + 60 * 1000;
    return Math.min(Math.max(base, waitMs), 7 * 24 * 60 * 60 * 1000);
  }
  return Math.max(base, 24 * 60 * 60 * 1000);
}

function isRetriableLocalError(message) {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  if (isLocalQuotaOrAuthError(m)) return false;
  if (m.includes('queue_full')) return false;
  if (m.includes('unsupported')) return false;
  if (m.includes('timeout')) return true;
  if (m.includes('failed')) return true;
  if (m.includes('exit_')) return true;
  return false;
}

function createProviderExecutor(name, maxConcurrency, queueLimit) {
  const queue = [];
  let running = 0;
  let totalScheduled = 0;
  let totalRejected = 0;

  const runNext = () => {
    if (running >= maxConcurrency) return;
    const job = queue.shift();
    if (!job) return;
    running += 1;
    Promise.resolve()
      .then(job.fn)
      .then((result) => job.resolve(result))
      .catch((error) => job.reject(error))
      .finally(() => {
        running -= 1;
        runNext();
      });
  };

  const schedule = (fn) => new Promise((resolve, reject) => {
    if (queue.length >= queueLimit) {
      totalRejected += 1;
      reject(new Error(`${name}_queue_full`));
      return;
    }
    totalScheduled += 1;
    queue.push({ fn, resolve, reject });
    runNext();
  });

  const snapshot = () => ({
    name,
    running,
    queued: queue.length,
    maxConcurrency,
    queueLimit,
    totalScheduled,
    totalRejected
  });

  return { schedule, snapshot };
}

module.exports = {
  buildPromptFromChatRequest,
  buildPromptFromResponsesRequest,
  runCodexLocalCompletion,
  runGeminiLocalCompletion,
  initProxyMetrics,
  pushMetricError,
  isLocalQuotaOrAuthError,
  getLocalFailureCooldownMs,
  isRetriableLocalError,
  createProviderExecutor
};

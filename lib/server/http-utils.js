'use strict';

const { ProxyAgent } = require('undici');

const proxyDispatcherCache = new Map();

function pickFirstNonEmpty(values) {
  for (const value of values) {
    const text = String(value == null ? '' : value).trim();
    if (text) return text;
  }
  return '';
}

function parseNoProxyList(rawValue) {
  return String(rawValue == null ? '' : rawValue)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost');
}

function matchesNoProxyRule(target, rule) {
  const token = String(rule || '').trim().toLowerCase();
  if (!token) return false;
  if (token === '*') return true;

  const targetHost = String((target && target.hostname) || '').trim().toLowerCase();
  const targetPort = String((target && target.port) || '').trim();
  if (!targetHost) return false;

  let hostRule = token;
  let portRule = '';
  const tokenHasPort = token.includes(':') && !token.startsWith('[');
  if (tokenHasPort) {
    const idx = token.lastIndexOf(':');
    hostRule = token.slice(0, idx).trim();
    portRule = token.slice(idx + 1).trim();
    if (!hostRule || !portRule) return false;
    if (targetPort && targetPort !== portRule) return false;
    if (!targetPort && !['80', '443'].includes(portRule)) return false;
  }

  if (hostRule.startsWith('*.')) {
    hostRule = hostRule.slice(1);
  }
  if (hostRule.startsWith('.')) {
    return targetHost === hostRule.slice(1) || targetHost.endsWith(hostRule);
  }
  return targetHost === hostRule;
}

function shouldBypassProxy(targetUrl, noProxy) {
  let parsedTarget;
  try {
    parsedTarget = new URL(String(targetUrl || ''));
  } catch (_error) {
    return false;
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) return true;
  if (isLoopbackHost(parsedTarget.hostname)) return true;

  const rules = parseNoProxyList(noProxy);
  return rules.some((rule) => matchesNoProxyRule(parsedTarget, rule));
}

function resolveProxyConfig(targetUrl, proxyOptions = {}) {
  const options = proxyOptions || {};
  const explicitProxy = pickFirstNonEmpty([
    options.proxyUrl,
    process.env.AIH_SERVER_PROXY_URL
  ]);
  const envProxy = pickFirstNonEmpty([
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy
  ]);
  const proxyUrl = explicitProxy || envProxy;
  if (!proxyUrl) return { url: '', source: '' };

  const noProxy = pickFirstNonEmpty([
    options.noProxy,
    process.env.AIH_SERVER_NO_PROXY,
    process.env.NO_PROXY,
    process.env.no_proxy
  ]);
  if (shouldBypassProxy(targetUrl, noProxy)) return { url: '', source: '' };

  try {
    const parsed = new URL(proxyUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return { url: '', source: '' };
  } catch (_error) {
    return { url: '', source: '' };
  }
  return {
    url: proxyUrl,
    source: explicitProxy ? 'explicit' : 'env_proxy'
  };
}

function getProxyDispatcher(proxyUrl) {
  const key = String(proxyUrl || '').trim();
  if (!key) return null;
  if (proxyDispatcherCache.has(key)) return proxyDispatcherCache.get(key);
  const agent = new ProxyAgent(key);
  proxyDispatcherCache.set(key, agent);
  return agent;
}

function getErrorCode(error) {
  return String(
    (error && error.code)
    || (error && error.cause && error.cause.code)
    || ''
  ).trim().toUpperCase();
}

function shouldRetryWithoutProxy(proxyConfig, error) {
  if (!proxyConfig || proxyConfig.source !== 'env_proxy') return false;
  const code = getErrorCode(error);
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  const message = String((error && error.message) || '').toLowerCase();
  return message.includes('proxy')
    || message.includes('fetch failed');
}

function parseAuthorizationBearer(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value) return '';
  const m = value.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
}

function readRequestBody(req, options = {}) {
  const maxBytes = Number(options.maxBytes);
  const enforceLimit = Number.isFinite(maxBytes) && maxBytes > 0;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      chunks.push(chunk);
      total += chunk.length;
      if (enforceLimit && total > maxBytes) {
        aborted = true;
        const err = new Error('request_body_too_large');
        err.code = 'request_body_too_large';
        reject(err);
      }
    });
    req.on('end', () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks));
    });
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
  const proxyOptions = arguments[3] || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestInit = { ...(init || {}), signal: controller.signal };
    const proxyConfig = resolveProxyConfig(url, proxyOptions);
    if (!requestInit.dispatcher) {
      const dispatcher = getProxyDispatcher(proxyConfig.url);
      if (dispatcher) requestInit.dispatcher = dispatcher;
    }
    try {
      return await fetch(url, requestInit);
    } catch (error) {
      if (!requestInit.dispatcher || !shouldRetryWithoutProxy(proxyConfig, error)) throw error;
      const fallbackInit = { ...(requestInit || {}) };
      delete fallbackInit.dispatcher;
      return await fetch(url, fallbackInit);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchModelsForAccount(options, account, timeoutMs = 8000) {
  const url = `${options.upstream}/v1/models`;
  const headers = {
    authorization: `Bearer ${account.accessToken}`
  };
  const res = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs, {
    proxyUrl: options && options.proxyUrl,
    noProxy: options && options.noProxy
  });
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

function buildChatCompletionPayload(model, text) {
  const resolvedModel = String(model || '').trim() || 'unknown';
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
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
  const resolvedModel = String(model || '').trim() || 'unknown';
  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: resolvedModel,
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: resolvedModel,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: resolvedModel,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    }
  ];
  chunks.forEach((c) => {
    res.write(`data: ${JSON.stringify(c)}\n\n`);
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = {
  parseAuthorizationBearer,
  readRequestBody,
  writeJson,
  withTimeout,
  fetchWithTimeout,
  fetchModelsForAccount,
  buildChatCompletionPayload,
  writeSseChatCompletion,
  __private: {
    resolveProxyConfig,
    shouldBypassProxy
  }
};

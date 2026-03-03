'use strict';

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

module.exports = {
  parseAuthorizationBearer,
  readRequestBody,
  writeJson,
  withTimeout,
  fetchWithTimeout,
  fetchModelsForAccount,
  buildChatCompletionPayload,
  writeSseChatCompletion
};

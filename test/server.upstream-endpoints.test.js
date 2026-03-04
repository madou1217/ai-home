const test = require('node:test');
const assert = require('node:assert/strict');
const { handleUpstreamPassthrough } = require('../lib/server/upstream-endpoints');

function createResCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(chunk = '') { this.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)); }
  };
}

test('upstream passthrough strips hop-by-hop headers before fetch', async () => {
  const res = createResCapture();
  let seenHeaders = null;
  const state = {
    accounts: { codex: [{ id: '1', email: 'a@example.com', accessToken: 'tok' }] },
    cursors: { codex: 0 },
    metrics: { totalFailures: 0, totalSuccess: 0, totalTimeouts: 0 }
  };

  await handleUpstreamPassthrough({
    options: {
      upstream: 'https://example.com',
      upstreamTimeoutMs: 3000,
      maxAttempts: 1,
      failureThreshold: 1,
      logRequests: false
    },
    state,
    req: {
      url: '/v1/chat/completions',
      headers: {
        host: '127.0.0.1:8317',
        authorization: 'Bearer client-key',
        connection: 'keep-alive',
        'proxy-connection': 'keep-alive',
        te: 'trailers',
        upgrade: 'websocket',
        'content-length': '12',
        'content-type': 'application/json'
      }
    },
    res,
    method: 'POST',
    bodyBuffer: Buffer.from('{"x":"y"}'),
    routeKey: 'POST /v1/chat/completions',
    requestStartedAt: Date.now(),
    cooldownMs: 1000,
    deps: {
      chooseServerAccount: (pool) => pool[0],
      pushMetricError: () => {},
      writeJson: (r, code, payload) => {
        r.statusCode = code;
        r.setHeader('content-type', 'application/json');
        r.end(JSON.stringify(payload));
      },
      fetchWithTimeout: async (_url, init) => {
        seenHeaders = init.headers || {};
        return {
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          arrayBuffer: async () => Buffer.from('{"ok":true}')
        };
      },
      markProxyAccountFailure: () => {},
      markProxyAccountSuccess: () => {},
      appendProxyRequestLog: () => {}
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(state.metrics.totalSuccess, 1);
  assert.equal(String(res.body), '{"ok":true}');
  assert.equal(typeof seenHeaders.authorization, 'string');
  assert.equal(seenHeaders['x-aih-account-id'], '1');
  assert.equal(seenHeaders['content-type'], 'application/json');
  assert.equal(Object.hasOwn(seenHeaders, 'connection'), false);
  assert.equal(Object.hasOwn(seenHeaders, 'proxy-connection'), false);
  assert.equal(Object.hasOwn(seenHeaders, 'te'), false);
  assert.equal(Object.hasOwn(seenHeaders, 'upgrade'), false);
  assert.equal(Object.hasOwn(seenHeaders, 'host'), false);
  assert.equal(Object.hasOwn(seenHeaders, 'content-length'), false);
});

test('upstream passthrough fast-fails on global network errors and surfaces error code', async () => {
  const res = createResCapture();
  const state = {
    accounts: { codex: [{ id: '1', email: 'a@example.com', accessToken: 'tok' }] },
    cursors: { codex: 0 },
    metrics: { totalFailures: 0, totalSuccess: 0, totalTimeouts: 0 }
  };
  let fetchCalls = 0;
  await handleUpstreamPassthrough({
    options: {
      upstream: 'https://example.com',
      upstreamTimeoutMs: 3000,
      maxAttempts: 3,
      failureThreshold: 1,
      logRequests: false
    },
    state,
    req: { url: '/v1/chat/completions', headers: { 'content-type': 'application/json' } },
    res,
    method: 'POST',
    bodyBuffer: Buffer.from('{"x":"y"}'),
    routeKey: 'POST /v1/chat/completions',
    requestStartedAt: Date.now(),
    cooldownMs: 1000,
    deps: {
      chooseServerAccount: (pool) => pool[0],
      pushMetricError: () => {},
      writeJson: (r, code, payload) => {
        r.statusCode = code;
        r.setHeader('content-type', 'application/json');
        r.end(JSON.stringify(payload));
      },
      fetchWithTimeout: async () => {
        fetchCalls += 1;
        const err = new Error('fetch failed');
        err.cause = { code: 'ECONNRESET' };
        throw err;
      },
      markProxyAccountFailure: () => {},
      markProxyAccountSuccess: () => {},
      appendProxyRequestLog: () => {}
    }
  });
  assert.equal(fetchCalls, 1);
  assert.equal(res.statusCode, 502);
  const body = JSON.parse(String(res.body));
  assert.equal(body.error, 'upstream_failed');
  assert.match(String(body.detail || ''), /ECONNRESET/);
});

test('upstream passthrough skips invalid token and retries with another account in same request', async () => {
  const res = createResCapture();
  const pool = [
    { id: '1', email: 'bad@example.com', accessToken: 'bad\ntoken' },
    { id: '2', email: 'ok@example.com', accessToken: 'good-token' }
  ];
  const state = {
    accounts: { codex: pool },
    cursors: { codex: 0 },
    metrics: { totalFailures: 0, totalSuccess: 0, totalTimeouts: 0 }
  };
  const seenAccountIds = [];
  let seenHeaders = null;

  await handleUpstreamPassthrough({
    options: {
      upstream: 'https://example.com',
      upstreamTimeoutMs: 3000,
      maxAttempts: 2,
      failureThreshold: 1,
      logRequests: false
    },
    state,
    req: { url: '/v1/chat/completions', headers: { 'content-type': 'application/json' } },
    res,
    method: 'POST',
    bodyBuffer: Buffer.from('{"x":"y"}'),
    routeKey: 'POST /v1/chat/completions',
    requestStartedAt: Date.now(),
    cooldownMs: 1000,
    requestMeta: { sessionKey: 's' },
    deps: {
      chooseServerAccount: (accounts, _state, _cursorKey, options = {}) => {
        const excluded = options.excludeIds || new Set();
        const next = accounts.find((acc) => !excluded.has(String(acc.id)));
        if (next) seenAccountIds.push(String(next.id));
        return next || null;
      },
      pushMetricError: () => {},
      writeJson: (r, code, payload) => {
        r.statusCode = code;
        r.setHeader('content-type', 'application/json');
        r.end(JSON.stringify(payload));
      },
      fetchWithTimeout: async (_url, init) => {
        seenHeaders = init.headers || {};
        return {
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          arrayBuffer: async () => Buffer.from('{"ok":true}')
        };
      },
      markProxyAccountFailure: () => {},
      markProxyAccountSuccess: () => {},
      appendProxyRequestLog: () => {}
    }
  });

  assert.deepEqual(seenAccountIds, ['1', '2']);
  assert.equal(res.statusCode, 200);
  assert.match(String(seenHeaders.authorization || ''), /Bearer good-token/);
});

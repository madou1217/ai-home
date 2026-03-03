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
      chooseProxyAccount: (pool) => pool[0],
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

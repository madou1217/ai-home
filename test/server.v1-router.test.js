const test = require('node:test');
const assert = require('node:assert/strict');
const { handleV1Request } = require('../lib/server/v1-router');

function createResCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk = '') { this.body = String(chunk); }
  };
}

test('v1 router returns false for non-v1 path', async () => {
  const res = createResCapture();
  const handled = await handleV1Request({
    req: { headers: {} },
    res,
    method: 'GET',
    pathname: '/healthz',
    options: {},
    state: { metrics: { totalRequests: 0, routeCounts: {} } },
    requiredClientKey: '',
    cooldownMs: 1000,
    localExecOpts: {},
    deps: {}
  });
  assert.equal(handled, false);
});

test('v1 router enforces client key', async () => {
  const res = createResCapture();
  const handled = await handleV1Request({
    req: { headers: { authorization: 'Bearer wrong' } },
    res,
    method: 'GET',
    pathname: '/v1/models',
    options: { backend: 'codex-local', provider: 'auto' },
    state: {
      modelRegistry: { providers: { codex: new Set(['gpt-4o-mini']), gemini: new Set() } },
      metrics: { totalRequests: 0, routeCounts: {}, totalSuccess: 0 }
    },
    requiredClientKey: 'secret',
    cooldownMs: 1000,
    localExecOpts: {},
    deps: {
      parseAuthorizationBearer: (h) => String(h || '').replace(/^Bearer\s+/i, ''),
      writeJson: (r, code, payload) => { r.statusCode = code; r.end(JSON.stringify(payload)); }
    }
  });
  assert.equal(handled, true);
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'unauthorized_client');
});

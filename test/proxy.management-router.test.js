const test = require('node:test');
const assert = require('node:assert/strict');
const { handleManagementRequest } = require('../lib/proxy/management-router');

function createResCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk = '') { this.body = String(chunk); }
  };
}

test('management router returns false for non-management path', async () => {
  const res = createResCapture();
  const handled = await handleManagementRequest({
    method: 'GET',
    pathname: '/v1/models',
    url: new URL('http://localhost/v1/models'),
    req: { headers: {} },
    res,
    options: {},
    state: {},
    requiredManagementKey: '',
    deps: {}
  });
  assert.equal(handled, false);
});

test('management router enforces key and returns unauthorized', async () => {
  const res = createResCapture();
  const handled = await handleManagementRequest({
    method: 'GET',
    pathname: '/v0/management/status',
    url: new URL('http://localhost/v0/management/status'),
    req: { headers: { authorization: 'Bearer wrong' } },
    res,
    options: {},
    state: {},
    requiredManagementKey: 'secret',
    deps: {
      parseAuthorizationBearer: (h) => String(h || '').replace(/^Bearer\s+/i, ''),
      writeJson: (r, code, payload) => { r.statusCode = code; r.end(JSON.stringify(payload)); }
    }
  });
  assert.equal(handled, true);
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'unauthorized_management');
});

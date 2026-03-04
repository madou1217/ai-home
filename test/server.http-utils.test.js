const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithTimeout, __private } = require('../lib/server/http-utils');

async function withEnv(patch, fn) {
  const keys = Object.keys(patch);
  const previous = {};
  keys.forEach((key) => {
    previous[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = String(value);
  });
  try {
    return await fn();
  } finally {
    keys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

test('fetchWithTimeout attaches proxy dispatcher when proxy is configured', async (t) => {
  let seenInit = null;
  t.mock.method(global, 'fetch', async (_url, init) => {
    seenInit = init;
    return { ok: true };
  });

  await fetchWithTimeout(
    'https://api.openai.com/v1/models',
    { method: 'GET' },
    500,
    { proxyUrl: 'http://127.0.0.1:7890' }
  );

  assert.ok(seenInit);
  assert.ok(seenInit.dispatcher);
  assert.equal(typeof seenInit.dispatcher.dispatch, 'function');
});

test('fetchWithTimeout bypasses proxy when no_proxy matches host', async (t) => {
  let seenInit = null;
  t.mock.method(global, 'fetch', async (_url, init) => {
    seenInit = init;
    return { ok: true };
  });

  await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST' },
    500,
    {
      proxyUrl: 'http://127.0.0.1:7890',
      noProxy: 'api.openai.com,localhost'
    }
  );

  assert.ok(seenInit);
  assert.equal(seenInit.dispatcher, undefined);
});

test('resolveProxyConfig bypasses loopback hosts by default', () => {
  const result = __private.resolveProxyConfig('http://127.0.0.1:8317/v1/models', {
    proxyUrl: 'http://127.0.0.1:7890'
  });
  assert.equal(result.url, '');
});

test('fetchWithTimeout retries direct when env proxy is unreachable', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (_url, init) => {
    calls.push(Boolean(init && init.dispatcher));
    if (init && init.dispatcher) {
      const err = new Error('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    }
    return { ok: true, recovered: true };
  });

  await withEnv({
    AIH_SERVER_PROXY_URL: undefined,
    HTTPS_PROXY: 'http://127.0.0.1:7999',
    https_proxy: undefined,
    HTTP_PROXY: undefined,
    http_proxy: undefined,
    NO_PROXY: undefined,
    no_proxy: undefined,
    AIH_SERVER_NO_PROXY: undefined
  }, async () => {
    const res = await fetchWithTimeout('https://api.openai.com/v1/models', { method: 'GET' }, 500);
    assert.equal(res.recovered, true);
  });

  assert.deepEqual(calls, [true, false]);
});

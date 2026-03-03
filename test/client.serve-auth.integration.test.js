const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProxyServeArgs } = require('../lib/proxy/args');
const {
  normalizeCredentialConfig,
  ERROR_CODES
} = require('../lib/profile/credential-config');

function applyCredentialUpdate(previous, nextInput) {
  const normalized = normalizeCredentialConfig(nextInput);
  if (!normalized.ok) {
    return {
      ok: false,
      value: previous,
      error: normalized.error
    };
  }
  return {
    ok: true,
    value: normalized.value
  };
}

test('serve args + auth config remain stable across restart-style reparse', () => {
  const boot = parseProxyServeArgs([
    '--port', '9317',
    '--api-key', 'client-key-a'
  ]);
  assert.equal(boot.port, 9317);
  assert.equal(boot.clientKey, 'client-key-a');

  const auth = normalizeCredentialConfig({
    cli: 'codex',
    api_key: '  sk-live-1  ',
    base_url: 'https://example.internal/v1/'
  });
  assert.equal(auth.ok, true);
  assert.deepEqual(auth.value, {
    cli: 'codex',
    api_key: 'sk-live-1',
    base_url: 'https://example.internal/v1'
  });

  const restarted = parseProxyServeArgs([
    '--port', '9317',
    '--api-key', 'client-key-a'
  ]);
  assert.equal(restarted.port, boot.port);
  assert.equal(restarted.clientKey, boot.clientKey);
  assert.equal(auth.value.base_url, 'https://example.internal/v1');
});

test('invalid auth update is rejected and previous config is retained', () => {
  const previous = {
    cli: 'codex',
    api_key: 'sk-live-1',
    base_url: 'https://example.internal/v1'
  };

  const updated = applyCredentialUpdate(previous, {
    cli: 'codex',
    api_key: '',
    base_url: 'not-a-url'
  });

  assert.equal(updated.ok, false);
  assert.equal(updated.error.code, ERROR_CODES.INVALID_BASE_URL);
  assert.deepEqual(updated.value, previous);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRequestProvider,
  chooseServerAccount,
  markProxyAccountSuccess,
  markProxyAccountFailure
} = require('../lib/server/router');

test('resolveRequestProvider respects explicit mode and model hint', () => {
  assert.equal(resolveRequestProvider({ provider: 'codex' }, { model: 'gemini-2.5-flash' }), 'codex');
  assert.equal(resolveRequestProvider({ provider: 'gemini' }, { model: 'gpt-4o-mini' }), 'gemini');
  assert.equal(resolveRequestProvider({ provider: 'auto' }, { model: 'gemini-2.5-pro' }), 'gemini');
  assert.equal(resolveRequestProvider({ provider: 'auto' }, { model: 'gpt-4.1' }), 'codex');
  assert.equal(resolveRequestProvider({ provider: 'auto' }, {}), 'codex');
});

test('chooseServerAccount does round-robin and skips cooldown', () => {
  const now = Date.now();
  const accounts = [
    { id: '1', cooldownUntil: now + 60_000 },
    { id: '2', cooldownUntil: 0 },
    { id: '3', cooldownUntil: 0 }
  ];
  const state = { strategy: 'round-robin', cursor: 0 };

  const a1 = chooseServerAccount(accounts, state, 'cursor');
  const a2 = chooseServerAccount(accounts, state, 'cursor');
  const a3 = chooseServerAccount(accounts, state, 'cursor');

  assert.equal(a1.id, '2');
  assert.equal(a2.id, '3');
  assert.equal(a3.id, '2');
});

test('mark success/failure updates account runtime fields', () => {
  const acc = { consecutiveFailures: 1, successCount: 0, failCount: 0, lastError: 'x', cooldownUntil: 0 };
  markProxyAccountSuccess(acc);
  assert.equal(acc.consecutiveFailures, 0);
  assert.equal(acc.successCount, 1);
  assert.equal(acc.lastError, '');

  markProxyAccountFailure(acc, 'boom', 5000, 2);
  assert.equal(acc.failCount, 1);
  assert.equal(acc.consecutiveFailures, 1);
  assert.equal(acc.lastError, 'boom');
  assert.equal(acc.cooldownUntil, 0);

  markProxyAccountFailure(acc, 'boom2', 5000, 2);
  assert.equal(acc.consecutiveFailures, 2);
  assert.ok(acc.cooldownUntil > Date.now());
});

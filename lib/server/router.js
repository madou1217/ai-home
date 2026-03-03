'use strict';

function normalizeModelId(modelRaw) {
  return String(modelRaw || '').trim().toLowerCase();
}

function inferProviderFromModel(modelRaw) {
  const m = normalizeModelId(modelRaw);
  if (!m) return 'codex';
  if (m.startsWith('gemini')) return 'gemini';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'codex';
  return 'codex';
}

function resolveRequestProvider(options, requestJson) {
  const requested = normalizeModelId(requestJson && requestJson.model);
  if (options.provider === 'codex' || options.provider === 'gemini') return options.provider;
  return inferProviderFromModel(requested);
}

function chooseServerAccount(accounts, state, cursorKey = 'cursor') {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const now = Date.now();
  const available = accounts.filter((a) => now >= (a.cooldownUntil || 0));
  if (available.length === 0) return null;
  if (state.strategy === 'random') {
    return available[Math.floor(Math.random() * available.length)];
  }
  const n = accounts.length;
  const cursor = Number(state[cursorKey] || 0);
  for (let i = 0; i < n; i += 1) {
    const idx = (cursor + i) % n;
    const item = accounts[idx];
    if (now < (item.cooldownUntil || 0)) continue;
    state[cursorKey] = (idx + 1) % n;
    return item;
  }
  return null;
}

function markProxyAccountSuccess(account) {
  if (!account) return;
  account.consecutiveFailures = 0;
  account.successCount = Number(account.successCount || 0) + 1;
  account.lastError = '';
}

function markProxyAccountFailure(account, reason, cooldownMs, failureThreshold = 2) {
  if (!account) return;
  account.failCount = Number(account.failCount || 0) + 1;
  account.consecutiveFailures = Number(account.consecutiveFailures || 0) + 1;
  account.lastError = String(reason || '');
  if (account.consecutiveFailures >= failureThreshold) {
    account.cooldownUntil = Date.now() + cooldownMs;
  }
}

module.exports = {
  resolveRequestProvider,
  chooseServerAccount,
  markProxyAccountSuccess,
  markProxyAccountFailure
};

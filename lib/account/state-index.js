'use strict';

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function normalizeId(id) {
  const s = String(id || '').trim();
  return /^\d+$/.test(s) ? s : '';
}

function createAccountStateIndex(options = {}) {
  const aiHomeDir = String(options.aiHomeDir || '').trim();
  if (!aiHomeDir) {
    throw new Error('account_state_index_missing_ai_home_dir');
  }
  const fs = options.fs;
  if (!fs || typeof fs.mkdirSync !== 'function') {
    throw new Error('account_state_index_missing_fs');
  }

  const dbFile = String(options.dbFile || '').trim() || path.join(aiHomeDir, 'account_state.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS account_state (
      provider TEXT NOT NULL,
      account_id TEXT NOT NULL,
      configured INTEGER NOT NULL DEFAULT 0,
      api_key_mode INTEGER NOT NULL DEFAULT 0,
      exhausted INTEGER NOT NULL DEFAULT 0,
      remaining_pct REAL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(provider, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_account_state_provider_active
      ON account_state(provider, configured, exhausted, api_key_mode, remaining_pct, account_id);
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO account_state (
      provider, account_id, configured, api_key_mode, exhausted, remaining_pct, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      configured = excluded.configured,
      api_key_mode = excluded.api_key_mode,
      exhausted = excluded.exhausted,
      remaining_pct = excluded.remaining_pct,
      updated_at = excluded.updated_at
  `);

  const setExhaustedStmt = db.prepare(`
    INSERT INTO account_state (
      provider, account_id, configured, api_key_mode, exhausted, remaining_pct, updated_at
    ) VALUES (?, ?, 1, 0, ?, NULL, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      exhausted = excluded.exhausted,
      updated_at = excluded.updated_at
  `);

  const listIdsStmt = db.prepare(`
    SELECT account_id
    FROM account_state
    WHERE provider = ?
    ORDER BY CAST(account_id AS INTEGER) ASC
  `);

  const nextCandidateStmt = db.prepare(`
    SELECT account_id
    FROM account_state
    WHERE provider = ?
      AND configured = 1
      AND api_key_mode = 0
      AND exhausted = 0
      AND account_id <> ?
    ORDER BY COALESCE(remaining_pct, -1.0) DESC, CAST(account_id AS INTEGER) ASC
    LIMIT 1
  `);

  const providerCountStmt = db.prepare(`
    SELECT COUNT(*) AS c
    FROM account_state
    WHERE provider = ?
  `);

  function upsertAccountState(provider, accountId, state = {}) {
    const p = String(provider || '').trim();
    const id = normalizeId(accountId);
    if (!p || !id) return false;
    const configured = state.configured ? 1 : 0;
    const apiKeyMode = state.apiKeyMode ? 1 : 0;
    const exhausted = state.exhausted ? 1 : 0;
    const remainingPct = Number(state.remainingPct);
    const normalizedRemaining = Number.isFinite(remainingPct)
      ? Math.max(0, Math.min(100, remainingPct))
      : null;
    upsertStmt.run(
      p,
      id,
      configured,
      apiKeyMode,
      exhausted,
      normalizedRemaining,
      Date.now()
    );
    return true;
  }

  function setExhausted(provider, accountId, exhausted) {
    const p = String(provider || '').trim();
    const id = normalizeId(accountId);
    if (!p || !id) return false;
    setExhaustedStmt.run(p, id, exhausted ? 1 : 0, Date.now());
    return true;
  }

  function listAccountIds(provider) {
    const p = String(provider || '').trim();
    if (!p) return [];
    const rows = listIdsStmt.all(p) || [];
    return rows
      .map((row) => normalizeId(row.account_id))
      .filter(Boolean);
  }

  function getNextCandidateId(provider, excludedId = '') {
    const p = String(provider || '').trim();
    if (!p) return null;
    const excluded = normalizeId(excludedId) || '';
    const row = nextCandidateStmt.get(p, excluded);
    if (!row) return null;
    const id = normalizeId(row.account_id);
    return id || null;
  }

  function countByProvider(provider) {
    const p = String(provider || '').trim();
    if (!p) return 0;
    const row = providerCountStmt.get(p);
    return Number(row && row.c) || 0;
  }

  return {
    dbFile,
    upsertAccountState,
    setExhausted,
    listAccountIds,
    getNextCandidateId,
    countByProvider
  };
}

module.exports = {
  createAccountStateIndex
};


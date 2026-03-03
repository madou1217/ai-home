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
    CREATE INDEX IF NOT EXISTS idx_account_state_provider_updated
      ON account_state(provider, updated_at, account_id);
  `);
  try {
    db.exec('ALTER TABLE account_state ADD COLUMN display_name TEXT');
  } catch (_e) {}

  const upsertStmt = db.prepare(`
    INSERT INTO account_state (
      provider, account_id, configured, api_key_mode, exhausted, remaining_pct, display_name, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, account_id) DO UPDATE SET
      configured = excluded.configured,
      api_key_mode = excluded.api_key_mode,
      exhausted = excluded.exhausted,
      remaining_pct = excluded.remaining_pct,
      display_name = COALESCE(excluded.display_name, account_state.display_name),
      updated_at = excluded.updated_at
  `);

  const setExhaustedStmt = db.prepare(`
    UPDATE account_state
    SET exhausted = ?, updated_at = ?
    WHERE provider = ? AND account_id = ?
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

  const listRowsStmt = db.prepare(`
    SELECT provider, account_id, configured, api_key_mode, exhausted, remaining_pct, display_name, updated_at
    FROM account_state
    WHERE provider = ?
    ORDER BY CAST(account_id AS INTEGER) ASC
  `);

  const listUsageCandidatesStmt = db.prepare(`
    SELECT account_id
    FROM account_state
    WHERE provider = ?
      AND configured = 1
      AND api_key_mode = 0
    ORDER BY COALESCE(remaining_pct, -1.0) DESC, CAST(account_id AS INTEGER) ASC
  `);

  const listConfiguredStmt = db.prepare(`
    SELECT account_id
    FROM account_state
    WHERE provider = ?
      AND configured = 1
    ORDER BY CAST(account_id AS INTEGER) ASC
  `);

  const listStaleStmt = db.prepare(`
    SELECT account_id
    FROM account_state
    WHERE provider = ?
      AND updated_at <= ?
    ORDER BY updated_at ASC, CAST(account_id AS INTEGER) ASC
    LIMIT ?
  `);

  const deleteMissingStmt = db.prepare(`
    DELETE FROM account_state
    WHERE provider = ? AND account_id = ?
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
    const displayName = state.displayName == null
      ? null
      : String(state.displayName || '').trim().slice(0, 255);
    upsertStmt.run(
      p,
      id,
      configured,
      apiKeyMode,
      exhausted,
      normalizedRemaining,
      displayName,
      Date.now()
    );
    return true;
  }

  function setExhausted(provider, accountId, exhausted) {
    const p = String(provider || '').trim();
    const id = normalizeId(accountId);
    if (!p || !id) return false;
    const result = setExhaustedStmt.run(exhausted ? 1 : 0, Date.now(), p, id);
    return Number(result && result.changes) > 0;
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

  function listStates(provider) {
    const p = String(provider || '').trim();
    if (!p) return [];
    const rows = listRowsStmt.all(p) || [];
    return rows.map((row) => ({
      provider: String(row.provider || ''),
      accountId: normalizeId(row.account_id),
      configured: Number(row.configured) === 1,
      apiKeyMode: Number(row.api_key_mode) === 1,
      exhausted: Number(row.exhausted) === 1,
      remainingPct: Number.isFinite(Number(row.remaining_pct)) ? Number(row.remaining_pct) : null,
      displayName: String(row.display_name || '').trim(),
      updatedAt: Number(row.updated_at) || 0
    })).filter((row) => !!row.accountId);
  }

  function listUsageCandidateIds(provider) {
    const p = String(provider || '').trim();
    if (!p) return [];
    const rows = listUsageCandidatesStmt.all(p) || [];
    return rows.map((row) => normalizeId(row.account_id)).filter(Boolean);
  }

  function listConfiguredIds(provider) {
    const p = String(provider || '').trim();
    if (!p) return [];
    const rows = listConfiguredStmt.all(p) || [];
    return rows.map((row) => normalizeId(row.account_id)).filter(Boolean);
  }

  function listStaleIds(provider, staleBeforeTs, limit = 200) {
    const p = String(provider || '').trim();
    if (!p) return [];
    const before = Number(staleBeforeTs);
    if (!Number.isFinite(before)) return [];
    const cappedLimit = Math.max(1, Math.min(5000, Number(limit) || 200));
    const rows = listStaleStmt.all(p, Math.floor(before), cappedLimit) || [];
    return rows.map((row) => normalizeId(row.account_id)).filter(Boolean);
  }

  function pruneMissingIds(provider, existingIds) {
    const p = String(provider || '').trim();
    if (!p) return 0;
    const existing = new Set((Array.isArray(existingIds) ? existingIds : []).map((x) => normalizeId(x)).filter(Boolean));
    const rows = listIdsStmt.all(p) || [];
    let removed = 0;
    rows.forEach((row) => {
      const id = normalizeId(row.account_id);
      if (!id || existing.has(id)) return;
      const result = deleteMissingStmt.run(p, id);
      if (Number(result && result.changes) > 0) removed += 1;
    });
    return removed;
  }

  return {
    dbFile,
    upsertAccountState,
    setExhausted,
    listAccountIds,
    listStates,
    listConfiguredIds,
    listUsageCandidateIds,
    listStaleIds,
    pruneMissingIds,
    getNextCandidateId,
    countByProvider
  };
}

module.exports = {
  createAccountStateIndex
};

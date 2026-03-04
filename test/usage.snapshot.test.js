const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createUsageSnapshotService } = require('../lib/cli/services/usage/snapshot');
const { createUsageCacheService } = require('../lib/cli/services/usage/cache');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aih-usage-snapshot-'));
}

test('codex usage snapshot falls back to account/read payload when rateLimits are unavailable', () => {
  const root = mkTmpDir();
  try {
    const getProfileDir = (cliName, id) => path.join(root, 'profiles', cliName, String(id));
    const getToolConfigDir = (cliName, id) => path.join(getProfileDir(cliName, id), `.${cliName}`);

    const profileDir = getProfileDir('codex', '1');
    fs.mkdirSync(profileDir, { recursive: true });

    const cacheService = createUsageCacheService({
      fs,
      path,
      getProfileDir,
      usageSnapshotSchemaVersion: 2,
      usageSourceGemini: 'gemini_refresh_user_quota',
      usageSourceCodex: 'codex_app_server',
      usageSourceClaudeOauth: 'claude_oauth_usage_api',
      usageSourceClaudeAuthToken: 'claude_auth_token_usage_api'
    });

    const payload = {
      ok: true,
      account: {
        email: 'user@example.com',
        planType: 'free'
      },
      fallback: 'account_read'
    };
    const stdout = `AIH_CODEX_RATE_LIMIT_JSON_START\n${JSON.stringify(payload)}\nAIH_CODEX_RATE_LIMIT_JSON_END\n`;

    const usageSnapshotService = createUsageSnapshotService({
      fs,
      path,
      spawnSync: () => ({ stdout, stderr: '' }),
      processObj: {
        execPath: process.execPath,
        cwd: () => root,
        env: {},
        platform: process.platform
      },
      resolveCliPath: () => '/usr/bin/codex',
      usageSnapshotSchemaVersion: 2,
      usageRefreshStaleMs: 5 * 60 * 1000,
      usageSourceGemini: 'gemini_refresh_user_quota',
      usageSourceCodex: 'codex_app_server',
      usageSourceClaudeOauth: 'claude_oauth_usage_api',
      usageSourceClaudeAuthToken: 'claude_auth_token_usage_api',
      getProfileDir,
      getToolConfigDir,
      writeUsageCache: cacheService.writeUsageCache,
      readUsageCache: cacheService.readUsageCache
    });

    const snapshot = usageSnapshotService.ensureUsageSnapshot('codex', '1', null);
    assert.ok(snapshot);
    assert.equal(snapshot.kind, 'codex_oauth_status');
    assert.equal(snapshot.source, 'codex_app_server');
    assert.equal(snapshot.entries.length, 1);
    assert.equal(snapshot.entries[0].bucket, 'account');
    assert.equal(snapshot.entries[0].remainingPct, null);
    assert.match(snapshot.entries[0].window, /plan:free/);
    assert.match(snapshot.entries[0].window, /user@example\.com/);

    const cached = cacheService.readUsageCache('codex', '1');
    assert.ok(cached);
    assert.equal(cached.entries[0].bucket, 'account');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

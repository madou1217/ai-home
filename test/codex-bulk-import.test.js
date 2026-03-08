const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCodexBulkImportService } = require('../lib/cli/services/ai-cli/codex-bulk-import');

function makeService(root) {
  const profilesDir = path.join(root, '.ai_home', 'profiles');
  const service = createCodexBulkImportService({
    path,
    fs,
    crypto,
    profilesDir,
    getDefaultParallelism: () => 4,
    getToolAccountIds: (cliName) => {
      const providerDir = path.join(profilesDir, cliName);
      try {
        return fs.readdirSync(providerDir).filter((name) => /^\d+$/.test(name));
      } catch (_error) {
        return [];
      }
    },
    ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
    getProfileDir: (cliName, id) => path.join(profilesDir, cliName, String(id)),
    getToolConfigDir: (cliName, id) => path.join(profilesDir, cliName, String(id), `.${cliName}`)
  });
  return { service, profilesDir };
}

test('importCodexTokensFromOutput creates provider root on first import', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-codex-bulk-import-'));
  try {
    const sourceDir = path.join(root, 'source');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'worker.json'), JSON.stringify({
      email: 'worker@example.com',
      refresh_token: 'rt_worker_token',
      access_token: 'at_worker_token',
      id_token: 'id_worker_token',
      account_id: 'acct-worker'
    }));

    const { service, profilesDir } = makeService(root);
    const result = await service.importCodexTokensFromOutput({
      sourceDir,
      parallel: 8,
      limit: 0,
      dryRun: false
    });

    assert.equal(result.imported, 1);
    assert.equal(result.failed, 0);
    assert.equal(fs.existsSync(path.join(profilesDir, 'codex', '1', '.codex', 'auth.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('session registry delete contract is implemented in session registry module', () => {
  const registryPath = require.resolve('../lib/session/session-registry.js', { paths: [__dirname] });
  const mod = require(registryPath);
  assert.equal(typeof registryPath, 'string');
  assert.equal(typeof mod.normalizeRegistry, 'function');
  assert.equal(typeof mod.deleteSession, 'function');
});

test('manual resume account override contract is wired in CLI parser and help text', () => {
  const cliEntryPath = require.resolve('../bin/ai-home.js', { paths: [__dirname] });
  const src = fs.readFileSync(cliEntryPath, 'utf8');
  assert.match(src, /cur === '--account' \|\| cur === '--id'/);
  assert.match(src, /overrideAccountId/);
  assert.match(src, /Invalid account override\. Use: aih codex auto exec resume <session_id> --account <id> \[prompt\]/);
  assert.match(src, /Override-selected Account ID/);
  assert.match(src, /Auto-selected Account ID/);
  assert.match(src, /auto exec resume <session_id> \[--account <id>\] \[prompt\]/);
});

test('session delete contract is wired in CLI parser and help text', () => {
  const cliEntryPath = require.resolve('../bin/ai-home.js', { paths: [__dirname] });
  const src = fs.readFileSync(cliEntryPath, 'utf8');
  assert.match(src, /aih codex sessions delete <session_id>/);
  assert.match(src, /sessionAction === 'delete' \|\| sessionAction === 'rm' \|\| sessionAction === 'remove'/);
  assert.match(src, /deleteCodexSession/);
});

test('deleteSession removes only target session bindings', () => {
  const registryPath = require.resolve('../lib/session/session-registry.js', { paths: [__dirname] });
  const mod = require(registryPath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-session-registry-'));
  const filePath = path.join(dir, 'registry.json');

  mod.writeRegistry({
    tasks: {
      t1: { taskKey: 't1', sessionId: 's1' },
      t2: { taskKey: 't2', sessionId: 's2' }
    },
    plans: {
      '/tmp/a.plan.md': { planPath: '/tmp/a.plan.md', sessionId: 's1' },
      '/tmp/b.plan.md': { planPath: '/tmp/b.plan.md', sessionId: 's3' }
    },
    sessions: [
      { sessionId: 's1' },
      { sessionId: 's2' },
      { sessionId: 's3' }
    ]
  }, filePath);

  const result = mod.deleteSession('s1', { filePath });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.removed.tasks, 1);
  assert.equal(result.removed.plans, 1);
  assert.equal(result.removed.recentSessions, 1);

  const next = mod.readRegistry(filePath);
  assert.equal(Boolean(next.tasks.t1), false);
  assert.equal(Boolean(next.tasks.t2), true);
  assert.equal(Boolean(next.plans['/tmp/a.plan.md']), false);
  assert.equal(Boolean(next.plans['/tmp/b.plan.md']), true);
  assert.deepEqual(next.sessions.map((x) => x.sessionId), ['s2', 's3']);

  fs.rmSync(dir, { recursive: true, force: true });
});

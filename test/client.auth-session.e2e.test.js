const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

test('desktop auth settings and tauri auth command bridge contracts are present', () => {
  const authView = read('desktop/tauri/src/views/auth-settings.tsx');
  const authCmd = read('desktop/tauri/src-tauri/src/commands/auth.rs');

  assert.match(authView, /auth_get_config/);
  assert.match(authView, /auth_set_config/);
  assert.match(authView, /auth_trigger_oauth/);
  assert.match(authView, /apiKey/i);
  assert.match(authView, /baseUrl/i);

  assert.match(authCmd, /pub fn auth_namespace_info\(\)/);
  assert.match(authCmd, /pub fn auth_get_config\(cli: String, account_id: String\)/);
  assert.match(authCmd, /pub fn auth_set_config\(/);
  assert.match(authCmd, /pub fn auth_trigger_oauth\(cli: String, account_id: String\)/);
});

test('client continue-session command path keeps explicit resume contracts', () => {
  const cli = read('bin/ai-home.js');
  const docs = read('docs/product/client-session-and-serve-control.md');

  assert.match(cli, /resolveCodexAutoExecArgs/);
  assert.match(cli, /aih codex auto exec resume <session_id> \[--account <id>\] \[prompt\]/);
  assert.match(cli, /No session_id found\./);
  assert.match(docs, /## Session Continuity/);
  assert.match(docs, /aih codex auto exec resume <session_id> \[prompt\]/);
});

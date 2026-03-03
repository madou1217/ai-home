const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

test('desktop app shell exposes expected hash-tab navigation and fallback UX', () => {
  const app = read('desktop/tauri/src/App.tsx');

  assert.match(app, /type TabKey\s*=\s*"dashboard"\s*\|\s*"launcher"\s*\|\s*"sessions"\s*\|\s*"migration"\s*\|\s*"audit"/);
  assert.match(app, /const TAB_ORDER:\s*TabKey\[\]\s*=\s*\["dashboard",\s*"launcher",\s*"sessions",\s*"migration",\s*"audit"\]/);
  assert.match(app, /window\.addEventListener\("hashchange",\s*resolveFromHash\)/);
  assert.match(app, /Unknown route '\$\{window\.location\.hash\}'\. Redirected to \$\{DEFAULT_TAB\}\./);
  assert.match(app, /UI Failed To Render/);
  assert.match(app, /Back To Dashboard/);
});

test('desktop views include core control-center modules', () => {
  const dashboard = read('desktop/tauri/src/views/dashboard.tsx');
  const launcher = read('desktop/tauri/src/views/session-launcher.tsx');
  const sessions = read('desktop/tauri/src/views/sessions.tsx');
  const migration = read('desktop/tauri/src/views/migration.tsx');
  const audit = read('desktop/tauri/src/views/audit-log.tsx');

  assert.match(dashboard, /SessionLauncher/);
  assert.match(dashboard, /invokeTauri<CommandResult>\("run_aih"/);
  assert.match(dashboard, /launch_aih_session/);
  assert.match(dashboard, /Account Status \(\{selectedCli\}\)/);
  assert.match(dashboard, /status:\s*<strong>\{cliDetails\[selectedCli\]\.status\}<\/strong>/);
  assert.match(dashboard, /Default account ID is required\./);
  assert.match(dashboard, /Set default failed:/);
  assert.match(dashboard, /Launch session failed:/);

  assert.match(launcher, /LAUNCH_TIMEOUT_MS\s*=\s*15000/);
  assert.match(launcher, /Launch request submitted at/);
  assert.match(launcher, /Launcher timed out while waiting for response\./);
  assert.match(launcher, /Desktop bridge is unavailable for launch\./);
  assert.match(launcher, /Launch rejected by \$\{CLI_LABEL\[cli\]\} account validation\./);
  assert.match(launcher, /No account selected for launch\./);
  assert.match(launcher, /Retry Last Launch/);
  assert.match(launcher, /Diagnosis:/);

  assert.match(launcher, /<SessionsView prompt=\{prompt\} \/>/);

  assert.match(sessions, /Recent Sessions \(Codex\)/);
  assert.match(sessions, /Continue Manual/);
  assert.match(sessions, /Continue Auto/);
  assert.match(sessions, /Delete Session/);
  assert.match(sessions, /"codex",\s*"sessions",\s*"delete",\s*sessionId/);
  assert.match(sessions, /"codex",\s*"auto",\s*"exec",\s*"resume",\s*sessionId,\s*"--account",\s*manualAccount,\s*promptText/);
  assert.match(sessions, /"codex",\s*"auto",\s*"exec",\s*"resume",\s*sessionId,\s*promptText/);

  assert.match(migration, /migration_namespace_info/);
  assert.match(migration, /migration_export_trigger/);
  assert.match(migration, /migration_import_trigger/);

  assert.match(audit, /read_audit_log/);
  assert.match(audit, /Search:/);
  assert.match(audit, /Action:/);
});

test('tauri backend wiring exposes commands and release bundle targets', () => {
  const tauriMain = read('desktop/tauri/src-tauri/src/main.rs');
  const tauriConf = JSON.parse(read('desktop/tauri/src-tauri/tauri.conf.json'));

  assert.match(tauriMain, /tauri::generate_handler!\[/);
  assert.match(tauriMain, /core_namespace_info/);
  assert.match(tauriMain, /run_aih/);
  assert.match(tauriMain, /launch_aih_session/);
  assert.match(tauriMain, /read_audit_log/);
  assert.match(tauriMain, /commands::migration::migration_export_trigger/);
  assert.match(tauriMain, /commands::migration::migration_import_trigger/);
  assert.match(tauriMain, /commands::audit::audit_query/);

  assert.equal(tauriConf.productName, 'AI Home');
  assert.equal(tauriConf.identifier, 'com.aihome.desktop');
  assert.equal(Array.isArray(tauriConf.bundle.targets), true);

  const expectedTargets = ['nsis', 'msi', 'deb', 'rpm', 'appimage', 'app', 'dmg'];
  for (const target of expectedTargets) {
    assert.equal(tauriConf.bundle.targets.includes(target), true, `missing bundle target: ${target}`);
  }

  assert.equal(typeof tauriConf.bundle.createUpdaterArtifacts, 'boolean');
  assert.equal(tauriConf.app.windows[0].minWidth >= 1024, true);
  assert.equal(tauriConf.app.windows[0].minHeight >= 680, true);
});

test('packaged-mode smoke contract covers command bootstrap and release gates', () => {
  const tauriMain = read('desktop/tauri/src-tauri/src/main.rs');
  const releaseChecklist = read('docs/release/desktop-platform-checklist.md');

  assert.match(tauriMain, /if let Ok\(exe_path\) = env::current_exe\(\)/);
  assert.match(tauriMain, /CORE_REPO_ROOT_NOT_FOUND/);
  assert.match(tauriMain, /failed to locate repository root/);
  assert.match(tauriMain, /fn prepare_aih_command\(args: &\[String\]\) -> FrontendResult<Command>/);
  assert.match(tauriMain, /cmd\.arg\("bin\/ai-home\.js"\)/);
  assert.match(tauriMain, /fn run_aih\(args: Vec<String>\)/);
  assert.match(tauriMain, /fn launch_aih_session\(cli: String, account_id: String, prompt: Option<String>\)/);

  assert.match(releaseChecklist, /## Packaged-Mode Core Path Verification \(P0\)/);
  assert.match(releaseChecklist, /installed app from outside repo/);
  assert.match(releaseChecklist, /Account list .*run_aih ls\/<cli> ls.* works in packaged mode/);
  assert.match(releaseChecklist, /Default switch persists after restart in packaged mode/);
  assert.match(releaseChecklist, /Account status state is visible for codex\/claude\/gemini and failure state includes remediation hint/);
  assert.match(releaseChecklist, /Session launcher can start codex\/claude\/gemini in packaged mode/);
  assert.match(releaseChecklist, /Session launcher failure path \(timeout\/bridge\/account validation\) shows actionable retry guidance/);
  assert.match(releaseChecklist, /runtime bootstrap failure returns actionable guidance/);
  assert.match(releaseChecklist, /If any item above fails, mark release as NO-GO and trigger rollback policy immediately\./);
});

test('gui wave2 cutover plan includes explicit go/no-go checks for critical paths', () => {
  const cutoverPlan = read('docs/release/pr-cutover-plan-2026-03-02.md');

  assert.match(cutoverPlan, /## GUI Wave2 Go\/No-Go Gate/);
  assert.match(cutoverPlan, /Shell.*route fallback.*global error boundary/i);
  assert.match(cutoverPlan, /Bootstrap.*runtime readiness signal/i);
  assert.match(cutoverPlan, /Account.*list\/default switch\/status rendering/i);
  assert.match(cutoverPlan, /Migration.*export\/import.*retry guidance/i);
  assert.match(cutoverPlan, /Audit.*query\/filter\/pagination/i);
  assert.match(cutoverPlan, /node --test test\/desktop\.gui\.smoke\.e2e\.test\.js/);
  assert.match(cutoverPlan, /All checks green and no P0\/P1 regression in GUI critical paths\./);
  assert.match(cutoverPlan, /Any failure above blocks release cutover and triggers rollback policy\./);
});

test('client session and serve control doc defines stable request and error fields', () => {
  const contractDoc = read('docs/product/client-session-and-serve-control.md');

  assert.match(contractDoc, /## Session Continuity/);
  assert.match(contractDoc, /aih codex plan-sessions \[plan\]/);
  assert.match(contractDoc, /aih codex auto exec resume <session_id> \[prompt\]/);
  assert.match(contractDoc, /No session_id found\./);
  assert.match(contractDoc, /## Serve Control/);
  assert.match(contractDoc, /GET \/v0\/management\/status/);
  assert.match(contractDoc, /POST \/v0\/management\/reload/);
  assert.match(contractDoc, /unauthorized_management/);
  assert.match(contractDoc, /management_not_found/);
  assert.match(contractDoc, /Restart\/Apply Contract \(current stable\)/);
});

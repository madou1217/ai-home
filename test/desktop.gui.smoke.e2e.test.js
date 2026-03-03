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

  assert.match(app, /type TabKey\s*=\s*"dashboard"\s*\|\s*"launcher"\s*\|\s*"migration"\s*\|\s*"audit"/);
  assert.match(app, /const TAB_ORDER:\s*TabKey\[\]\s*=\s*\["dashboard",\s*"launcher",\s*"migration",\s*"audit"\]/);
  assert.match(app, /window\.addEventListener\("hashchange",\s*resolveFromHash\)/);
  assert.match(app, /Unknown route '\$\{window\.location\.hash\}'\. Redirected to \$\{DEFAULT_TAB\}\./);
  assert.match(app, /UI Failed To Render/);
  assert.match(app, /Back To Dashboard/);
});

test('desktop views include core control-center modules', () => {
  const dashboard = read('desktop/tauri/src/views/dashboard.tsx');
  const launcher = read('desktop/tauri/src/views/session-launcher.tsx');
  const migration = read('desktop/tauri/src/views/migration.tsx');
  const audit = read('desktop/tauri/src/views/audit-log.tsx');

  assert.match(dashboard, /SessionLauncher/);
  assert.match(dashboard, /invokeTauri<CommandResult>\("run_aih"/);
  assert.match(dashboard, /launch_aih_session/);

  assert.match(launcher, /LAUNCH_TIMEOUT_MS\s*=\s*15000/);
  assert.match(launcher, /Retry Last Launch/);

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

  assert.equal(tauriConf.bundle.createUpdaterArtifacts, true);
  assert.equal(tauriConf.app.windows[0].minWidth >= 1024, true);
  assert.equal(tauriConf.app.windows[0].minHeight >= 680, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INSTALLER_EXTS = new Set(['.dmg', '.pkg']);

function ensureMacInstallerMetadata(installerPath) {
  assert.equal(fs.existsSync(installerPath), true, `installer not found: ${installerPath}`);

  const stat = fs.statSync(installerPath);
  assert.equal(stat.isFile(), true, 'installer path must be a file');
  assert.equal(stat.size > 0, true, 'installer file is empty');

  const fileName = path.basename(installerPath).toLowerCase();
  const ext = path.extname(fileName);
  assert.equal(INSTALLER_EXTS.has(ext), true, `unexpected installer extension: ${ext}`);
  assert.match(fileName, /arm64|aarch64/, 'installer filename should include arm64 or aarch64 marker');

  return {
    ext,
    fileName,
    bytes: stat.size
  };
}

test('macOS arm64 installer smoke check validates artifact existence and metadata', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aih-macos-installer-smoke-'));
  const installerPath = path.join(tempRoot, 'aih-1.4.0-macos-arm64.dmg');
  await fs.promises.writeFile(installerPath, Buffer.from('fake-dmg-content'));

  const metadata = ensureMacInstallerMetadata(installerPath);
  assert.equal(metadata.ext, '.dmg');
  assert.match(metadata.fileName, /^aih-.*-macos-arm64\.dmg$/);
  assert.equal(metadata.bytes > 0, true);
});

test('macOS arm64 installer smoke check rejects wrong architecture artifact naming', async () => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aih-macos-installer-smoke-'));
  const installerPath = path.join(tempRoot, 'aih-1.4.0-macos-x64.dmg');
  await fs.promises.writeFile(installerPath, Buffer.from('fake-dmg-content'));

  assert.throws(
    () => ensureMacInstallerMetadata(installerPath),
    /arm64|aarch64/
  );
});

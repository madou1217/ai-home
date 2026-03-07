const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCliproxyapiExportService } = require('../lib/cli/services/backup/cliproxyapi-export');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

test('exportCliproxyapiCodexAuths flattens codex auths into CLIProxyAPI auth-dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-cliproxyapi-export-'));
  try {
    const aiHomeDir = path.join(root, '.ai_home');
    const hostHomeDir = path.join(root, 'home');
    const configDir = path.join(hostHomeDir, '.cli-proxy-api');
    const authDir = path.join(hostHomeDir, '.clip-auths');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.yaml'), 'port: 8317\nauth-dir: "~/.clip-auths"\n');

    const idToken = makeJwt({ email: 'worker@example.com', exp: 1773000000 });
    const accessToken = makeJwt({
      exp: 1774000000,
      'https://api.openai.com/profile': { email: 'worker@example.com' }
    });

    writeJson(path.join(aiHomeDir, 'profiles', 'codex', '101', '.codex', 'auth.json'), {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: 'rt_valid_token',
        account_id: 'acct-101'
      },
      last_refresh: '2026-03-08T10:00:00.000Z'
    });
    writeJson(path.join(aiHomeDir, 'profiles', 'codex', '102', '.codex', 'auth.json'), {
      tokens: {
        refresh_token: 'invalid_refresh'
      }
    });
    fs.mkdirSync(path.join(aiHomeDir, 'profiles', 'codex', '103'), { recursive: true });

    const service = createCliproxyapiExportService({
      fs,
      path,
      aiHomeDir,
      hostHomeDir,
      BufferImpl: Buffer
    });

    const result = service.exportCliproxyapiCodexAuths();
    assert.equal(result.scanned, 3);
    assert.equal(result.exported, 1);
    assert.equal(result.skippedInvalid, 1);
    assert.equal(result.skippedMissing, 1);
    assert.equal(result.dedupedSource, 0);
    assert.equal(result.dedupedTarget, 0);
    assert.equal(result.authDir, authDir);

    const exportedPath = path.join(authDir, 'codex-aih-101.json');
    assert.equal(fs.existsSync(exportedPath), true);
    const exported = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
    assert.deepEqual(exported, {
      type: 'codex',
      email: 'worker@example.com',
      id_token: idToken,
      access_token: accessToken,
      refresh_token: 'rt_valid_token',
      account_id: 'acct-101',
      last_refresh: '2026-03-08T10:00:00.000Z',
      expired: new Date(1774000000 * 1000).toISOString()
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exportCliproxyapiCodexAuths falls back to default ~/.cli-proxy-api auth-dir when config is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-cliproxyapi-export-'));
  try {
    const aiHomeDir = path.join(root, '.ai_home');
    const hostHomeDir = path.join(root, 'home');
    writeJson(path.join(aiHomeDir, 'profiles', 'codex', '201', '.codex', 'auth.json'), {
      tokens: {
        id_token: makeJwt({ email: 'fallback@example.com' }),
        access_token: makeJwt({ exp: 1775000000 }),
        refresh_token: 'rt_fallback',
        account_id: 'acct-201'
      },
      last_refresh: '2026-03-08T11:00:00.000Z'
    });

    const service = createCliproxyapiExportService({
      fs,
      path,
      aiHomeDir,
      hostHomeDir,
      BufferImpl: Buffer
    });
    const result = service.exportCliproxyapiCodexAuths();

    assert.equal(result.configPath, '');
    assert.equal(result.authDir, path.join(hostHomeDir, '.cli-proxy-api'));
    assert.equal(fs.existsSync(path.join(result.authDir, 'codex-aih-201.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exportCliproxyapiCodexAuths dedupes by account identity across source and target files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-cliproxyapi-export-'));
  try {
    const aiHomeDir = path.join(root, '.ai_home');
    const hostHomeDir = path.join(root, 'home');
    const authDir = path.join(hostHomeDir, '.cli-proxy-api');
    fs.mkdirSync(authDir, { recursive: true });

    const idToken = makeJwt({ email: 'same@example.com' });
    const accessToken = makeJwt({ exp: 1776000000 });
    const payload = {
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: 'rt_same',
        account_id: 'acct-same'
      },
      last_refresh: '2026-03-08T12:00:00.000Z'
    };
    writeJson(path.join(aiHomeDir, 'profiles', 'codex', '301', '.codex', 'auth.json'), payload);
    writeJson(path.join(aiHomeDir, 'profiles', 'codex', '302', '.codex', 'auth.json'), payload);

    writeJson(path.join(authDir, 'existing-user-file.json'), {
      type: 'codex',
      email: 'same@example.com',
      refresh_token: 'rt_old',
      account_id: 'acct-same'
    });
    writeJson(path.join(authDir, 'codex-aih-999.json'), {
      type: 'codex',
      email: 'same@example.com',
      refresh_token: 'rt_old2',
      account_id: 'acct-same'
    });

    const service = createCliproxyapiExportService({
      fs,
      path,
      aiHomeDir,
      hostHomeDir,
      BufferImpl: Buffer
    });
    const result = service.exportCliproxyapiCodexAuths();

    assert.equal(result.exported, 1);
    assert.equal(result.dedupedSource, 1);
    assert.equal(result.dedupedTarget, 1);
    assert.equal(fs.existsSync(path.join(authDir, 'existing-user-file.json')), true);
    assert.equal(fs.existsSync(path.join(authDir, 'codex-aih-999.json')), false);

    const exported = JSON.parse(fs.readFileSync(path.join(authDir, 'existing-user-file.json'), 'utf8'));
    assert.equal(exported.account_id, 'acct-same');
    assert.equal(exported.refresh_token, 'rt_same');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

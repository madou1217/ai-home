const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return true;
    } catch (e) {}
    await sleep(120);
  }
  return false;
}

test('proxy serve exposes health/models/metrics', async (t) => {
  const port = 18417;
  const cliPath = path.join(process.cwd(), 'bin', 'ai-home.js');
  const child = spawn(process.execPath, [
    cliPath,
    'proxy',
    'serve',
    '--port',
    String(port),
    '--backend',
    'codex-local',
    '--provider',
    'codex'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
  child.stdout.on('data', () => {});

  t.after(() => {
    try { child.kill('SIGTERM'); } catch (e) {}
    try { child.kill('SIGKILL'); } catch (e) {}
  });

  const ready = await waitForHealth(port, 12000);
  assert.equal(ready, true, `proxy did not become healthy: ${stderr}`);

  const modelsRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
    headers: { authorization: 'Bearer dummy' }
  });
  assert.equal(modelsRes.ok, true);
  const models = await modelsRes.json();
  assert.equal(models.object, 'list');
  assert.equal(Array.isArray(models.data), true);
  assert.ok(models.data.length >= 1);

  const metricsRes = await fetch(`http://127.0.0.1:${port}/v0/management/metrics`);
  assert.equal(metricsRes.ok, true);
  const metrics = await metricsRes.json();
  assert.equal(metrics.ok, true);
  assert.ok(Number(metrics.totalRequests) >= 1);
});

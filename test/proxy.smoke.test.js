const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((err) => {
        if (err) return reject(err);
        resolve(port);
      });
    });
    server.on('error', reject);
  });
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

async function startProxy(t, extraArgs = []) {
  const port = await getFreePort();
  const cliPath = path.join(process.cwd(), 'bin', 'ai-home.js');
  const child = spawn(process.execPath, [
    cliPath,
    'server',
    'serve',
    '--port',
    String(port),
    '--backend',
    'codex-local',
    '--provider',
    'codex',
    ...extraArgs
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

  return { child, port, getStderr: () => stderr };
}

test('server serve exposes health/models/metrics', async (t) => {
  const { port, getStderr } = await startProxy(t);
  const ready = await waitForHealth(port, 12000);
  assert.equal(ready, true, `server did not become healthy: ${getStderr()}`);

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

test('server serve enforces client and management keys when configured', async (t) => {
  const { port, getStderr } = await startProxy(t, [
    '--client-key', 'client-secret',
    '--management-key', 'mgmt-secret'
  ]);
  const ready = await waitForHealth(port, 12000);
  assert.equal(ready, true, `server did not become healthy: ${getStderr()}`);

  const unauthorizedClientRes = await fetch(`http://127.0.0.1:${port}/v1/models`);
  assert.equal(unauthorizedClientRes.status, 401);
  assert.deepEqual(await unauthorizedClientRes.json(), {
    ok: false,
    error: 'unauthorized_client'
  });

  const authorizedClientRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
    headers: { authorization: 'Bearer client-secret' }
  });
  assert.equal(authorizedClientRes.status, 200);
  const modelPayload = await authorizedClientRes.json();
  assert.equal(modelPayload.object, 'list');

  const unauthorizedMgmtRes = await fetch(`http://127.0.0.1:${port}/v0/management/metrics`);
  assert.equal(unauthorizedMgmtRes.status, 401);
  assert.deepEqual(await unauthorizedMgmtRes.json(), {
    ok: false,
    error: 'unauthorized_management'
  });

  const authorizedMgmtRes = await fetch(`http://127.0.0.1:${port}/v0/management/metrics`, {
    headers: { authorization: 'Bearer mgmt-secret' }
  });
  assert.equal(authorizedMgmtRes.status, 200);
  const metrics = await authorizedMgmtRes.json();
  assert.equal(metrics.ok, true);
  assert.ok(Number(metrics.totalRequests) >= 1);
});

test('server serve returns codex-local unsupported error and records failure metrics', async (t) => {
  const { port, getStderr } = await startProxy(t);
  const ready = await waitForHealth(port, 12000);
  assert.equal(ready, true, `server did not become healthy: ${getStderr()}`);

  const unsupportedRes = await fetch(`http://127.0.0.1:${port}/v1/edits`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer dummy',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', input: 'x' })
  });
  assert.equal(unsupportedRes.status, 404);
  assert.deepEqual(await unsupportedRes.json(), {
    ok: false,
    error: 'unsupported_in_codex_local_backend'
  });

  const metricsRes = await fetch(`http://127.0.0.1:${port}/v0/management/metrics`);
  assert.equal(metricsRes.status, 200);
  const metrics = await metricsRes.json();
  assert.equal(metrics.ok, true);
  assert.ok(Number(metrics.totalFailures) >= 1);
  const routeErrors = Array.isArray(metrics.lastErrors) ? metrics.lastErrors : [];
  assert.ok(routeErrors.some((item) => String((item && item.error) || '').includes('unsupported_in_codex_local_backend')));
});

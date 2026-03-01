const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createEnvironmentManager } = require('../remote/runtime/environment-manager');

async function createRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aih-runtime-root-'));
}

test('runtime manager binds/rebinds profiles and exposes deterministic state contract', async () => {
  const runtimeRoot = await createRuntimeRoot();
  await fs.writeFile(path.join(runtimeRoot, 'container-template.Dockerfile'), 'FROM scratch\n', 'utf8');
  await fs.writeFile(path.join(runtimeRoot, 'sandbox-profile.nsjail.cfg'), '# cfg\n', 'utf8');

  const manager = createEnvironmentManager({
    defaultProfile: 'local',
    runtimeRoot
  });

  const localContext = manager.buildExecutionContext({ env: { HELLO: 'world' } });
  assert.equal(localContext.profile, 'local');
  assert.equal(localContext.env.AIH_RUNTIME_PROFILE, 'local');
  assert.equal(localContext.env.AIH_RUNTIME_BINDING_STATE, 'bound');
  assert.equal(localContext.env.AIH_RUNTIME_BINDING_SEQUENCE, '1');
  assert.equal(localContext.env.HELLO, 'world');
  assert.equal(manager.getState().activeProfile, 'local');

  const containerContext = manager.buildExecutionContext({ runtimeProfile: 'container' });
  assert.equal(containerContext.profile, 'container');
  assert.equal(containerContext.runtimeFiles.length, 1);
  assert.equal(containerContext.runtimeFiles[0].endsWith('container-template.Dockerfile'), true);
  assert.equal(containerContext.env.AIH_RUNTIME_PROFILE, 'container');
  assert.equal(containerContext.env.AIH_RUNTIME_BINDING_STATE, 'bound');
  assert.equal(containerContext.env.AIH_RUNTIME_BINDING_SEQUENCE, '2');
  assert.equal(manager.getState().activeProfile, 'container');

  const restarted = manager.restart({ runtimeProfile: 'sandbox' });
  assert.equal(restarted.profile, 'sandbox');
  assert.equal(restarted.state.binding.status, 'bound');
  assert.equal(restarted.state.binding.sequence, 3);
  assert.equal(restarted.state.binding.action, 'restart');
  assert.equal(manager.getState().activeProfile, 'sandbox');
});

test('runtime manager reports bind failure state and recovers once artifacts are restored', async () => {
  const runtimeRoot = await createRuntimeRoot();
  const sandboxFile = path.join(runtimeRoot, 'sandbox-profile.nsjail.cfg');

  const manager = createEnvironmentManager({
    defaultProfile: 'local',
    runtimeRoot
  });

  assert.throws(
    () => manager.bind({ runtimeProfile: 'sandbox' }),
    /runtime artifact not found/
  );

  const failedState = manager.getState();
  assert.equal(failedState.binding.status, 'error');
  assert.equal(failedState.binding.action, 'bind');
  assert.equal(failedState.binding.targetProfile, 'sandbox');
  assert.equal(failedState.activeProfile, 'local');

  await fs.writeFile(sandboxFile, '# restored cfg\n', 'utf8');

  const recovered = manager.recover({ runtimeProfile: 'sandbox', force: true });
  assert.equal(recovered.profile, 'sandbox');
  assert.equal(recovered.state.binding.status, 'bound');
  assert.equal(recovered.state.binding.action, 'recover');
  assert.equal(recovered.state.activeProfile, 'sandbox');
});

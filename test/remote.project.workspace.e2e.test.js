const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProjectSession } = require('../lib/remote/project-session');

test('project session supports bind/run/write/read lifecycle on workspace target', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-remote-workspace-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, 'proj'), { recursive: true });

  const session = createProjectSession({
    workspaceRoot,
    projectDir: 'proj',
    runtimeProfile: 'local'
  }, {
    createId: () => 'sess_test_workspace'
  });

  const bindResult = await session.handleOperation({
    op: 'bind',
    controlSessionId: 'ctl-1',
    remoteSessionId: 'remote-1',
    connectionId: 'conn-1'
  });
  assert.equal(bindResult.kind, 'bind_result');
  assert.equal(bindResult.context.controlSessionId, 'ctl-1');
  assert.equal(bindResult.context.remoteSessionId, 'remote-1');

  const runResult = await session.handleOperation({
    op: 'run',
    command: process.execPath,
    args: ['-e', 'process.stdout.write(\"workspace_ok\")']
  });
  assert.equal(runResult.kind, 'command_result');
  assert.equal(runResult.result.ok, true);
  assert.equal(runResult.result.stdout, 'workspace_ok');
  assert.equal(runResult.attempt, 1);

  const writeResult = await session.handleOperation({
    op: 'write',
    path: 'notes/state.txt',
    content: 'hello-remote-workspace'
  });
  assert.equal(writeResult.kind, 'write_result');
  assert.equal(writeResult.attempt, 1);
  assert.equal(writeResult.bytes > 0, true);

  const readResult = await session.handleOperation({
    op: 'read',
    path: 'notes/state.txt'
  });
  assert.equal(readResult.kind, 'read_result');
  assert.equal(readResult.content, 'hello-remote-workspace');
  assert.equal(readResult.attempt, 1);
  assert.equal(readResult.context.sequence >= 4, true);
});

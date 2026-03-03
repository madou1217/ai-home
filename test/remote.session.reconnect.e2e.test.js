const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const { createProjectSession } = require('../lib/remote/project-session');

test('remote reconnect flow keeps project session continuity after disconnect checkpoint', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-remote-reconnect-e2e-'));

  try {
    const workspaceRoot = path.join(tmpRoot, 'workspace');
    await fs.mkdir(path.join(workspaceRoot, 'proj'), { recursive: true });

    const session = createProjectSession({
      workspaceRoot,
      projectDir: 'proj',
      controlSessionId: 'ctl-1',
      remoteSessionId: 'remote-1',
      connectionId: 'conn-1',
      projectSessionId: 'proj-stable-1'
    }, {
      createId: () => 'sess_reconnect_e2e'
    });

    const firstBind = await session.handleOperation({
      op: 'bind',
      controlSessionId: 'ctl-1',
      remoteSessionId: 'remote-1',
      connectionId: 'conn-1'
    });
    assert.equal(firstBind.kind, 'bind_result');
    assert.equal(firstBind.context.projectSessionId, 'proj-stable-1');
    assert.equal(firstBind.context.remoteSessionId, 'remote-1');

    const beforeDisconnectWrite = await session.handleOperation({
      op: 'write',
      path: 'state/continuity.txt',
      content: 'checkpoint-before-disconnect'
    });
    assert.equal(beforeDisconnectWrite.kind, 'write_result');
    assert.equal(beforeDisconnectWrite.attempt, 1);

    const disconnectedSnapshot = await session.handleOperation({ op: 'snapshot' });
    assert.equal(disconnectedSnapshot.kind, 'snapshot_result');
    assert.equal(disconnectedSnapshot.context.connectionId, 'conn-1');

    const reconnectBind = await session.handleOperation({
      op: 'bind',
      controlSessionId: 'ctl-1',
      remoteSessionId: 'remote-2',
      connectionId: 'conn-2'
    });
    assert.equal(reconnectBind.kind, 'bind_result');
    assert.equal(reconnectBind.context.projectSessionId, 'proj-stable-1');
    assert.equal(reconnectBind.context.controlSessionId, 'ctl-1');
    assert.equal(reconnectBind.context.remoteSessionId, 'remote-2');
    assert.equal(reconnectBind.context.connectionId, 'conn-2');

    const afterReconnectRead = await session.handleOperation({
      op: 'read',
      path: 'state/continuity.txt'
    });
    assert.equal(afterReconnectRead.kind, 'read_result');
    assert.equal(afterReconnectRead.content, 'checkpoint-before-disconnect');
    assert.equal(afterReconnectRead.context.projectSessionId, 'proj-stable-1');
    assert.equal(afterReconnectRead.context.controlSessionId, 'ctl-1');
    assert.equal(afterReconnectRead.context.remoteSessionId, 'remote-2');
    assert.equal(afterReconnectRead.context.connectionId, 'conn-2');

    const afterReconnectRun = await session.handleOperation({
      op: 'run',
      command: process.execPath,
      args: ['-e', "process.stdout.write('session-continuity-ok')"]
    });
    assert.equal(afterReconnectRun.kind, 'command_result');
    assert.equal(afterReconnectRun.result.ok, true);
    assert.equal(afterReconnectRun.result.stdout, 'session-continuity-ok');
    assert.equal(afterReconnectRun.context.projectSessionId, 'proj-stable-1');
    assert.equal(afterReconnectRun.context.connectionId, 'conn-2');

    assert.equal(afterReconnectRun.sequence > disconnectedSnapshot.sequence, true);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

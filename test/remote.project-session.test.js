const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { createProjectSession } = require('../lib/remote/project-session');

async function createTempWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-remote-session-'));
  return dir;
}

test('project session runs command in workspace and returns status payload', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-a';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  const session = createProjectSession({
    workspaceRoot,
    projectDir
  });

  const outputFile = path.join(session.workspaceDir, 'result.txt');
  const commandResult = await session.runCommand({
    command: process.execPath,
    args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(outputFile)}, 'ok')`]
  });

  assert.equal(commandResult.kind, 'command_result');
  assert.equal(commandResult.result.ok, true);
  const text = await fs.readFile(outputFile, 'utf8');
  assert.equal(text, 'ok');
});

test('project session supports file write and read loop', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-b';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  const session = createProjectSession({
    workspaceRoot,
    projectDir
  });

  const writeResult = await session.writeProjectFile({
    path: 'src/demo.txt',
    content: 'hello-remote'
  });
  assert.equal(writeResult.kind, 'write_result');
  assert.equal(writeResult.bytes > 0, true);

  const readResult = await session.readProjectFile({ path: 'src/demo.txt' });
  assert.equal(readResult.kind, 'read_result');
  assert.equal(readResult.content, 'hello-remote');
});

test('project session blocks path escape for file operations', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-c';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  const session = createProjectSession({
    workspaceRoot,
    projectDir
  });

  await assert.rejects(
    () => session.writeProjectFile({ path: '../escape.txt', content: 'x' }),
    /path escapes workspace/
  );
  await assert.rejects(
    () => session.readProjectFile({ path: '../escape.txt' }),
    /path escapes workspace/
  );
});

test('project session returns structured failure and supports reconnect-style retry', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-d';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-runtime-artifacts-'));
  const missingContainerFile = path.join(runtimeRoot, 'container-template.Dockerfile');

  const session = createProjectSession({
    workspaceRoot,
    projectDir,
    runtimeProfile: 'local',
    runtimeRoot
  });

  await assert.rejects(
    () => session.runCommand({
      runtimeProfile: 'container',
      command: process.execPath,
      args: ['-e', 'process.exit(0)']
    }),
    /runtime artifact not found/
  );

  await fs.writeFile(missingContainerFile, '# synthetic runtime file\n', 'utf8');

  const retry = await session.runCommand({
    runtimeProfile: 'container',
    command: process.execPath,
    args: ['-e', "process.stdout.write(process.env.AIH_RUNTIME_PROFILE || '')"]
  });

  assert.equal(retry.kind, 'command_result');
  assert.equal(retry.result.ok, true);
  assert.equal(retry.result.stdout, 'container');
  assert.equal(retry.profile, 'container');
  assert.equal(typeof retry.sessionId, 'string');
  assert.equal(retry.sessionId.length > 0, true);
});

test('project session supports bind run patch and reconnect via operation router', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-e';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  const session = createProjectSession({
    workspaceRoot,
    projectDir,
    controlSessionId: 'ctl-1',
    remoteSessionId: 'remote-1',
    connectionId: 'conn-1',
    projectSessionId: 'proj-session-1'
  });

  const firstBind = session.bindRemoteSession({
    controlSessionId: 'ctl-1',
    remoteSessionId: 'remote-1',
    connectionId: 'conn-1'
  });
  assert.equal(firstBind.kind, 'bind_result');
  assert.equal(firstBind.context.remoteSessionId, 'remote-1');
  assert.equal(firstBind.context.connectionId, 'conn-1');

  const runResult = await session.handleOperation({
    op: 'run_command',
    command: process.execPath,
    args: ['-e', "process.stdout.write('connected')"]
  });
  assert.equal(runResult.kind, 'command_result');
  assert.equal(runResult.result.ok, true);
  assert.equal(runResult.result.stdout, 'connected');

  const writeResult = await session.handleOperation({
    op: 'write_file',
    path: 'patches/flow.txt',
    content: 'patch-applied'
  });
  assert.equal(writeResult.kind, 'write_result');
  assert.equal(writeResult.attempt, 1);

  const readResult = await session.handleOperation({
    op: 'read_file',
    path: 'patches/flow.txt'
  });
  assert.equal(readResult.kind, 'read_result');
  assert.equal(readResult.content, 'patch-applied');

  const reconnect = session.bindRemoteSession({
    remoteSessionId: 'remote-2',
    connectionId: 'conn-2'
  });
  assert.equal(reconnect.kind, 'bind_result');
  assert.equal(reconnect.context.remoteSessionId, 'remote-2');
  assert.equal(reconnect.context.connectionId, 'conn-2');
  assert.equal(reconnect.context.projectSessionId, 'proj-session-1');

  const snapshot = await session.handleOperation({ op: 'snapshot' });
  assert.equal(snapshot.kind, 'snapshot_result');
  assert.equal(snapshot.context.remoteSessionId, 'remote-2');
  assert.equal(snapshot.context.connectionId, 'conn-2');
  assert.equal(snapshot.context.projectSessionId, 'proj-session-1');
  assert.equal(snapshot.sequence >= reconnect.sequence, true);
});

test('project session retries transient patch write failures with deterministic attempt count', async () => {
  const workspaceRoot = await createTempWorkspace();
  const projectDir = 'proj-f';
  await fs.mkdir(path.join(workspaceRoot, projectDir), { recursive: true });

  let writeAttempts = 0;
  const flakyFs = {
    ...fs,
    async writeFile(filePath, content, options) {
      writeAttempts += 1;
      if (writeAttempts === 1) {
        const err = new Error('temporarily unavailable');
        err.code = 'ETIMEDOUT';
        throw err;
      }
      return fs.writeFile(filePath, content, options);
    }
  };

  const session = createProjectSession(
    {
      workspaceRoot,
      projectDir,
      retry: { maxAttempts: 2, backoffMs: 0 }
    },
    { fs: flakyFs }
  );

  const writeResult = await session.writeProjectFile({
    path: 'patches/retry.txt',
    content: 'retry-ok'
  });
  assert.equal(writeResult.kind, 'write_result');
  assert.equal(writeResult.attempt, 2);
  assert.equal(writeAttempts, 2);

  const readResult = await session.readProjectFile({ path: 'patches/retry.txt' });
  assert.equal(readResult.kind, 'read_result');
  assert.equal(readResult.content, 'retry-ok');
});

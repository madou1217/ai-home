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

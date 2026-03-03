const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadProtoText() {
  const protoPath = path.resolve(__dirname, '../remote/proto/control.proto');
  return fs.readFileSync(protoPath, 'utf8');
}

test('control plane keeps required RPC surface for protocol compatibility', () => {
  const text = loadProtoText();
  const requiredRpcs = [
    'Hello',
    'Authenticate',
    'OpenSession',
    'ResumeSession',
    'Heartbeat',
    'CloseSession',
    'StreamSessionStatus',
    'OpenProjectSession',
    'RunProjectCommand',
    'StreamProjectCommand',
    'ReadProjectFile',
    'WriteProjectFile',
    'CloseProjectSession'
  ];

  for (const rpc of requiredRpcs) {
    assert.match(text, new RegExp(`\\brpc\\s+${rpc}\\s*\\(`));
  }
});

test('run command response field numbers remain stable', () => {
  const text = loadProtoText();
  const start = text.indexOf('message RunProjectCommandResponse {');
  assert.notEqual(start, -1, 'RunProjectCommandResponse message should exist');
  const end = text.indexOf('}', start);
  assert.notEqual(end, -1, 'RunProjectCommandResponse should be closed');
  const block = text.slice(start, end);

  assert.match(block, /int32\s+exit_code\s*=\s*5\s*;/);
  assert.match(block, /bool\s+ok\s*=\s*8\s*;/);
  assert.match(block, /string\s+stdout\s*=\s*9\s*;/);
  assert.match(block, /string\s+stderr\s*=\s*10\s*;/);
  assert.match(block, /string\s+started_at\s*=\s*12\s*;/);
  assert.match(block, /string\s+finished_at\s*=\s*13\s*;/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('plan-watchdog scan mode runs successfully and reports summary', () => {
  const script = path.join(process.cwd(), 'scripts', 'plan-watchdog.js');
  const run = spawnSync(process.execPath, [script, '--once'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env }
  });

  assert.equal(run.status, 0, `expected exit 0, got ${run.status}; stderr=${run.stderr || ''}`);
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  assert.match(output, /\[watchdog\]\s+stale=\d+,\s+relaunched=\d+,\s+blocked=\d+,\s+mode=scan/);
});

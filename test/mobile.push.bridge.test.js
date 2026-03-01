const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const PUSH_SOURCE = path.resolve(__dirname, '../mobile/app/src/services/pushNotifications.ts');

async function loadSource() {
  return fs.readFile(PUSH_SOURCE, 'utf8');
}

test('push bridge keeps task destination navigation contract', async () => {
  const source = await loadSource();

  assert.match(source, /buildTaskDestination\(task: TaskSnapshot\): NotificationDestination/);
  assert.match(source, /screen: 'TaskScreen'/);
  assert.match(source, /taskId: task\.taskId/);
  assert.match(source, /sessionId: task\.sessionId/);
  assert.match(source, /label: 'View task'/);
  assert.match(source, /event: 'started'/);
  assert.match(source, /event: 'update'/);
  assert.match(source, /'completion' \| 'failure' \| 'quota'/);
  assert.match(source, /this\.taskPayload\(task, success \? 'completion' : 'failure'\)/);
});

test('push bridge keeps quota and reconnect notification branches', async () => {
  const source = await loadSource();

  assert.match(source, /notifyQuotaAlert\(task: TaskSnapshot\)/);
  assert.match(source, /Quota limit reached/);
  assert.match(source, /this\.taskPayload\(task, 'quota'\)/);
  assert.match(source, /notifyReconnectScheduled\(snapshot: ReconnectSnapshot\)/);
  assert.match(source, /if \(!snapshot\.nextRetryAt\) return;/);
  assert.match(source, /screen: 'SessionScreen'/);
  assert.match(source, /notifyReconnected\(\): Promise<void>/);
  assert.match(source, /notifyOffline\(snapshot: ReconnectSnapshot\): Promise<void>/);
});

test('push bridge guards duplicate and stale task notifications', async () => {
  const source = await loadSource();

  assert.match(source, /lastTaskUpdatedAtMs = new Map<string, number>\(\)/);
  assert.match(source, /lastTaskEventFingerprint = new Map<string, string>\(\)/);
  assert.match(source, /shouldSuppressTaskEvent\(task: TaskSnapshot, event:/);
  assert.match(source, /updatedAtMs < lastSeenMs/);
  assert.match(source, /previousFingerprint === fingerprint/);
});

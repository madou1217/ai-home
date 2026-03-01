const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');

class FakeTimers {
  constructor(startMs) {
    this.nowMs = startMs;
    this.timers = [];
  }

  now() {
    return this.nowMs;
  }

  setTimeout(callback, delayMs) {
    const timer = {
      cleared: false,
      runAt: this.nowMs + Number(delayMs || 0),
      callback
    };
    this.timers.push(timer);
    return timer;
  }

  clearTimeout(timer) {
    if (!timer) return;
    timer.cleared = true;
  }

  advance(ms) {
    this.nowMs += ms;
    let keepRunning = true;
    while (keepRunning) {
      keepRunning = false;
      const due = [];
      const pending = [];
      for (const timer of this.timers) {
        if (!timer.cleared && timer.runAt <= this.nowMs) {
          due.push(timer);
        } else if (!timer.cleared) {
          pending.push(timer);
        }
      }
      this.timers = pending;
      for (const timer of due) {
        timer.cleared = true;
        timer.callback();
        keepRunning = true;
      }
    }
  }
}

async function flushMicrotasks(turns = 6) {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

async function loadReconnectModule() {
  const sourcePath = path.join(__dirname, '../mobile/app/src/services/reconnectManager.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transformed = stripTypeScriptTypes(source, { mode: 'transform' });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-mobile-reconnect-'));
  const tempFile = path.join(tempDir, 'reconnectManager.mjs');
  fs.writeFileSync(tempFile, transformed, 'utf8');
  const moduleUrl = `${pathToFileURL(tempFile).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  fs.rmSync(tempDir, { recursive: true, force: true });
  return mod;
}

const reconnectModulePromise = loadReconnectModule();

test('ReconnectManager transitions to connected on initial successful start', async () => {
  const { ReconnectManager } = await reconnectModulePromise;
  const timers = new FakeTimers(Date.parse('2026-03-01T00:00:00.000Z'));
  let connectCalls = 0;
  const manager = new ReconnectManager({
    now: () => timers.now(),
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers),
    jitterRatio: 0
  });

  manager.start(async () => {
    connectCalls += 1;
  });
  await flushMicrotasks();

  const snapshot = manager.getSnapshot();
  assert.equal(connectCalls, 1);
  assert.equal(snapshot.state, 'connected');
  assert.equal(snapshot.attempt, 0);
  assert.equal(snapshot.reason, undefined);
  manager.stop();
});

test('ReconnectManager enters offline after exhausting max reconnect attempts', async () => {
  const { ReconnectManager } = await reconnectModulePromise;
  const timers = new FakeTimers(Date.parse('2026-03-01T00:00:00.000Z'));
  let connectCalls = 0;
  const manager = new ReconnectManager({
    maxAttempts: 2,
    baseDelayMs: 100,
    maxDelayMs: 100,
    jitterRatio: 0,
    now: () => timers.now(),
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers)
  });

  manager.start(async () => {
    connectCalls += 1;
    throw new Error('network down');
  });
  await flushMicrotasks();

  timers.advance(250);
  await flushMicrotasks();
  timers.advance(250);
  await flushMicrotasks();

  const snapshot = manager.getSnapshot();
  assert.equal(connectCalls, 3);
  assert.equal(snapshot.state, 'offline');
  assert.equal(snapshot.attempt, 2);
  assert.match(snapshot.hint || '', /tap reconnect/i);
  manager.stop();
});

test('ReconnectManager retryNow recovers from offline when manual reconnect succeeds', async () => {
  const { ReconnectManager } = await reconnectModulePromise;
  const timers = new FakeTimers(Date.parse('2026-03-01T00:00:00.000Z'));
  let connectCalls = 0;
  const manager = new ReconnectManager({
    maxAttempts: 1,
    baseDelayMs: 100,
    maxDelayMs: 100,
    jitterRatio: 0,
    now: () => timers.now(),
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers)
  });

  manager.start(async () => {
    connectCalls += 1;
    if (connectCalls < 3) {
      throw new Error('socket disconnected');
    }
  });
  await flushMicrotasks();
  timers.advance(250);
  await flushMicrotasks();

  assert.equal(manager.getSnapshot().state, 'offline');
  manager.retryNow();
  await flushMicrotasks();

  const snapshot = manager.getSnapshot();
  assert.equal(connectCalls, 3);
  assert.equal(snapshot.state, 'connected');
  assert.equal(snapshot.attempt, 0);
  manager.stop();
});

test('ReconnectManager classifies timed out connection attempts with connect_timeout reason', async () => {
  const { ReconnectManager } = await reconnectModulePromise;
  const timers = new FakeTimers(Date.parse('2026-03-01T00:00:00.000Z'));
  const manager = new ReconnectManager({
    maxAttempts: 1,
    connectTimeoutMs: 300,
    baseDelayMs: 100,
    maxDelayMs: 100,
    jitterRatio: 0,
    now: () => timers.now(),
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers)
  });

  manager.start(async () => new Promise(() => {}));
  timers.advance(300);
  await flushMicrotasks();

  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.state, 'reconnecting');
  assert.equal(snapshot.reason, 'connect_timeout');
  assert.equal(snapshot.attempt, 1);
  assert.equal(typeof snapshot.nextRetryAt, 'string');
  manager.stop();
});

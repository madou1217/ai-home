const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { createRemoteConnector, REMOTE_STATES } = require('../lib/remote/connector');

function waitForEvent(emitter, event, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(event, onEvent);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };

    emitter.once(event, onEvent);
  });
}

function createMockDaemon(options = {}) {
  const sockets = new Set();
  const resumeCalls = [];
  let connSeq = 0;

  const server = net.createServer((socket) => {
    sockets.add(socket);
    connSeq += 1;
    const connectionNo = connSeq;
    const connectionId = `conn-${connectionNo}`;

    socket.setEncoding('utf8');
    socket.write(`SERVER_HELLO v1 ${encodeURIComponent(connectionId)}\n`);

    if (options.closeConnectionNo && options.closeConnectionNo === connectionNo) {
      setTimeout(() => {
        if (!socket.destroyed) socket.destroy();
      }, options.closeDelayMs || 30);
    }

    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx < 0) break;

        const rawLine = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!rawLine) continue;

        const parts = rawLine.split(/\s+/);
        const cmd = parts[0];

        if (cmd === 'HELLO') {
          socket.write(`HELLO_ACK ${encodeURIComponent(connectionId)}\n`);
          continue;
        }

        if (cmd === 'AUTH') {
          if (options.failAuthOnConnectionNo === connectionNo) {
            socket.write('ERR AUTH_FAILED auth%20rejected\n');
            setTimeout(() => {
              if (!socket.destroyed) socket.destroy();
            }, 5);
            continue;
          }
          const mode = connectionNo === 1 ? 'NEW' : 'RESUMED';
          socket.write(`AUTH_OK ctl-1 ${mode}\n`);
          continue;
        }

        if (cmd === 'OPEN_SESSION') {
          const target = decodeURIComponent(parts[1] || 'default');
          socket.write(`SESSION_OPEN remote-1 ${encodeURIComponent(target)}\n`);
          continue;
        }

        if (cmd === 'RESUME_SESSION') {
          const sid = decodeURIComponent(parts[1] || '');
          resumeCalls.push(sid);
          if (sid === 'remote-1') {
            socket.write(`SESSION_RESUMED ${encodeURIComponent(sid)}\n`);
          } else {
            socket.write('ERR INVALID_SESSION invalid%20session\n');
          }
          continue;
        }

        if (cmd === 'PING') {
          socket.write(`PONG ${Date.now()} ok\n`);
          continue;
        }

        if (cmd === 'CLOSE') {
          socket.end();
        }
      }
    });

    socket.on('close', () => {
      sockets.delete(socket);
    });
    socket.on('error', () => {
      sockets.delete(socket);
    });
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
      });
      const address = server.address();
      return { host: '127.0.0.1', port: address.port };
    },
    async stop() {
      for (const socket of sockets) {
        try {
          socket.destroy();
        } catch (e) {}
      }
      await new Promise((resolve) => server.close(() => resolve()));
    },
    getResumeCalls() {
      return [...resumeCalls];
    }
  };
}

test('remote connector reconnects and reattaches tracked sessions after transient socket close', async () => {
  const daemon = createMockDaemon({ closeConnectionNo: 1, closeDelayMs: 40 });
  const endpoint = await daemon.start();

  const connector = createRemoteConnector({
    ...endpoint,
    token: 'token-a',
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      baseDelayMs: 20,
      maxDelayMs: 20,
      jitterRatio: 0
    },
    timeouts: {
      connectMs: 200,
      authMs: 200,
      responseMs: 200,
      heartbeatMs: 5000,
      idleTimeoutMs: 20000
    }
  });

  await connector.connect();
  const opened = await connector.openSession('project-alpha');
  assert.equal(opened.remoteSessionId, 'remote-1');

  const reconnected = await waitForEvent(connector, 'reconnected', 2000);
  assert.equal(reconnected.state, REMOTE_STATES.READY);
  assert.equal(reconnected.resumed, true);
  assert.equal(reconnected.trackedRemoteSessionCount, 1);

  assert.deepEqual(daemon.getResumeCalls().filter((id) => id === 'remote-1').length >= 1, true);

  await connector.disconnect('test_complete');
  await daemon.stop();
});

test('remote connector closes with non-retryable failure on AUTH_FAILED during reconnect', async () => {
  const daemon = createMockDaemon({
    closeConnectionNo: 1,
    closeDelayMs: 40,
    failAuthOnConnectionNo: 2
  });
  const endpoint = await daemon.start();

  const connector = createRemoteConnector({
    ...endpoint,
    token: 'token-b',
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      baseDelayMs: 20,
      maxDelayMs: 20,
      jitterRatio: 0
    },
    timeouts: {
      connectMs: 200,
      authMs: 200,
      responseMs: 200,
      heartbeatMs: 5000,
      idleTimeoutMs: 20000
    }
  });

  await connector.connect();

  const closed = await waitForEvent(connector, 'closed', 2500);
  assert.equal(closed.reason, 'non_retryable_failure');
  assert.equal(closed.reasonCode, 'AUTH_FAILED');
  assert.equal(closed.retryable, false);
  assert.equal(connector.getState(), REMOTE_STATES.CLOSED);

  await daemon.stop();
});

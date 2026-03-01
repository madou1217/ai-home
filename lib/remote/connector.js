'use strict';

const crypto = require('crypto');
const net = require('net');
const EventEmitter = require('events');

const REMOTE_STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  AUTHENTICATING: 'authenticating',
  READY: 'ready',
  RECONNECT_WAIT: 'reconnect_wait',
  CLOSED: 'closed'
});

const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 7443,
  protocolVersion: 'v1',
  reconnect: {
    enabled: true,
    maxAttempts: 12,
    baseDelayMs: 400,
    maxDelayMs: 8000,
    jitterRatio: 0.25
  },
  timeouts: {
    connectMs: 4000,
    authMs: 4000,
    responseMs: 3500,
    heartbeatMs: 15000,
    idleTimeoutMs: 45000
  }
});

class RemoteConnector extends EventEmitter {
  constructor(options) {
    super();

    const opts = options || {};
    this.host = opts.host || DEFAULTS.host;
    this.port = Number.isFinite(opts.port) ? Number(opts.port) : DEFAULTS.port;
    this.token = typeof opts.token === 'string' ? opts.token : '';
    this.protocolVersion = opts.protocolVersion || DEFAULTS.protocolVersion;
    this.clientId = opts.clientId || buildClientId();
    this.reconnect = { ...DEFAULTS.reconnect, ...(opts.reconnect || {}) };
    this.timeouts = { ...DEFAULTS.timeouts, ...(opts.timeouts || {}) };

    this.state = REMOTE_STATES.IDLE;
    this.socket = null;
    this.buffer = '';
    this.incomingLines = [];
    this.connectionId = '';
    this.controlSessionId = '';
    this.lastPongAt = 0;
    this.lastAuthResumed = false;

    this.closedByUser = false;
    this.connectingPromise = null;
    this.pendingWaiters = [];
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }

  async connect() {
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    if (this.state === REMOTE_STATES.READY && this.socket && !this.socket.destroyed) {
      return this._connectionSnapshot();
    }

    this.closedByUser = false;
    this.reconnectAttempts = 0;

    this.connectingPromise = this._connectAndHandshake(false)
      .finally(() => {
        this.connectingPromise = null;
      });

    return this.connectingPromise;
  }

  async disconnect(reason) {
    this.closedByUser = true;
    this._stopHeartbeat();
    this._clearReconnectTimer();

    const why = reason || 'client_request';
    if (this.socket && !this.socket.destroyed) {
      try {
        this._writeLine('CLOSE');
      } catch (e) {}
      try {
        this.socket.end();
      } catch (e) {}
      try {
        this.socket.destroy();
      } catch (e) {}
    }

    this._cleanupSocket();
    this._rejectAllWaiters(makeError('CLIENT_CLOSED', why));
    this._transition(REMOTE_STATES.CLOSED, { reason: why });
  }

  async openSession(target) {
    this._assertReady();
    const encodedTarget = encodeToken(target || 'default');
    const line = await this._sendCommand(
      `OPEN_SESSION ${encodedTarget}`,
      ['SESSION_OPEN '],
      this.timeouts.responseMs
    );

    const parts = splitParts(line);
    return {
      remoteSessionId: decodeToken(parts[1] || ''),
      target: decodeToken(parts[2] || '')
    };
  }

  async resumeSession(remoteSessionId) {
    this._assertReady();
    const sid = String(remoteSessionId || '').trim();
    if (!sid) {
      throw makeError('INVALID_SESSION', 'remoteSessionId is required');
    }

    const line = await this._sendCommand(
      `RESUME_SESSION ${encodeToken(sid)}`,
      ['SESSION_RESUMED '],
      this.timeouts.responseMs
    );

    const parts = splitParts(line);
    return {
      remoteSessionId: decodeToken(parts[1] || sid),
      resumed: true
    };
  }

  async sendHeartbeat() {
    this._assertReady();
    const line = await this._sendCommand('PING', ['PONG '], this.timeouts.responseMs);
    const parts = splitParts(line);
    this.lastPongAt = Date.now();
    return {
      serverTimeMs: Number(parts[1]) || 0,
      reconnectState: decodeToken(parts[2] || ''),
      receivedAt: this.lastPongAt
    };
  }

  getState() {
    return this.state;
  }

  _assertReady() {
    if (this.state !== REMOTE_STATES.READY || !this.socket || this.socket.destroyed) {
      throw makeError('NOT_READY', 'remote connector is not ready');
    }
  }

  async _connectAndHandshake(fromReconnect) {
    await this._openSocket();
    this._transition(REMOTE_STATES.AUTHENTICATING);

    try {
      await this._performHandshake();
      this.lastPongAt = Date.now();
      this._startHeartbeat();
      this._transition(REMOTE_STATES.READY, {
        connectionId: this.connectionId,
        controlSessionId: this.controlSessionId,
        resumed: this.lastAuthResumed
      });

      if (fromReconnect) {
        this.emit('reconnected', this._connectionSnapshot());
      } else {
        this.emit('ready', this._connectionSnapshot());
      }

      this.reconnectAttempts = 0;
      return this._connectionSnapshot();
    } catch (err) {
      this._destroyAndCleanupSocket();
      throw err;
    }
  }

  _openSocket() {
    this._transition(REMOTE_STATES.CONNECTING);
    this._destroyAndCleanupSocket();

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;
      this.buffer = '';
      this.incomingLines = [];

      let done = false;
      const finish = (handler, value) => {
        if (done) return;
        done = true;
        clearTimeout(connectTimer);
        socket.removeListener('connect', onConnect);
        socket.removeListener('error', onErrorBeforeConnect);
        socket.removeListener('close', onCloseBeforeConnect);
        handler(value);
      };

      const onConnect = () => {
        socket.on('data', (chunk) => this._onData(chunk));
        socket.on('close', (hadError) => this._onSocketClose(hadError));
        socket.on('error', (err) => this._onSocketError(err));
        finish(resolve);
      };

      const onErrorBeforeConnect = (err) => {
        finish(reject, err);
      };

      const onCloseBeforeConnect = () => {
        finish(reject, makeError('CONNECT_CLOSED', 'socket closed before connect'));
      };

      const connectTimer = setTimeout(() => {
        finish(reject, makeError('CONNECT_TIMEOUT', `connect timed out after ${this.timeouts.connectMs}ms`));
        try {
          socket.destroy();
        } catch (e) {}
      }, this.timeouts.connectMs);

      socket.once('connect', onConnect);
      socket.once('error', onErrorBeforeConnect);
      socket.once('close', onCloseBeforeConnect);
      socket.setNoDelay(true);
      socket.setKeepAlive(true, this.timeouts.heartbeatMs);
      socket.connect(this.port, this.host);
    });
  }

  async _performHandshake() {
    await this._readServerHelloPreamble();

    const helloLine = await this._sendCommand(
      `HELLO ${encodeToken(this.clientId)} ${encodeToken(this.protocolVersion)}`,
      ['HELLO_ACK '],
      this.timeouts.authMs
    );

    const helloParts = splitParts(helloLine);
    const ackConnectionId = decodeToken(helloParts[1] || '');

    if (!ackConnectionId) {
      throw makeError('BAD_HELLO', 'missing connection id from daemon HELLO_ACK');
    }
    if (this.connectionId && this.connectionId !== ackConnectionId) {
      throw makeError('BAD_HELLO', 'connection id mismatch between SERVER_HELLO and HELLO_ACK');
    }

    this.connectionId = ackConnectionId;

    const resumeCandidate = this.controlSessionId;
    const authCommand = resumeCandidate
      ? `AUTH ${encodeToken(this.token)} ${encodeToken(resumeCandidate)}`
      : `AUTH ${encodeToken(this.token)}`;

    const authLine = await this._sendCommand(authCommand, ['AUTH_OK '], this.timeouts.authMs);

    const authParts = splitParts(authLine);
    this.controlSessionId = decodeToken(authParts[1] || '');
    if (!this.controlSessionId) {
      throw makeError('BAD_AUTH', 'missing control session id from daemon AUTH_OK');
    }

    this.lastAuthResumed = String(authParts[2] || '').toUpperCase() === 'RESUMED';
  }

  async _readServerHelloPreamble() {
    try {
      const line = await this._waitForLine(
        (candidate) => candidate.startsWith('SERVER_HELLO ') || candidate.startsWith('ERR '),
        Math.min(this.timeouts.authMs, 1500)
      );

      if (line.startsWith('ERR ')) {
        throw parseRemoteError(line);
      }

      const parts = splitParts(line);
      const protocol = decodeToken(parts[1] || '');
      const preambleConnectionId = decodeToken(parts[2] || '');

      if (protocol && protocol !== this.protocolVersion) {
        throw makeError('VERSION_MISMATCH', `expected protocol ${this.protocolVersion}, got ${protocol}`);
      }
      if (preambleConnectionId) {
        this.connectionId = preambleConnectionId;
      }
    } catch (err) {
      if (err && err.code === 'RESPONSE_TIMEOUT') {
        return;
      }
      throw err;
    }
  }

  _sendCommand(command, successPrefixes, timeoutMs) {
    const waitPromise = this._waitForLine(
      (line) => line.startsWith('ERR ') || successPrefixes.some((prefix) => line.startsWith(prefix)),
      timeoutMs
    );

    try {
      this._writeLine(command);
    } catch (err) {
      this._rejectAllWaiters(err);
      throw err;
    }

    return waitPromise.then((line) => {
      if (line.startsWith('ERR ')) {
        throw parseRemoteError(line);
      }
      return line;
    });
  }

  _waitForLine(matcher, timeoutMs) {
    for (let idx = 0; idx < this.incomingLines.length; idx += 1) {
      const line = this.incomingLines[idx];
      if (!matcher(line)) continue;
      this.incomingLines.splice(idx, 1);
      return Promise.resolve(line);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        matcher,
        resolve,
        reject,
        timeout: null
      };

      waiter.timeout = setTimeout(() => {
        this.pendingWaiters = this.pendingWaiters.filter((item) => item !== waiter);
        reject(makeError('RESPONSE_TIMEOUT', `no response in ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingWaiters.push(waiter);
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString('utf8');

    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;

      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);

      if (!line) continue;
      this._onLine(line);
    }
  }

  _onLine(line) {
    if (line.startsWith('PONG ')) {
      this.lastPongAt = Date.now();
    }

    for (const waiter of [...this.pendingWaiters]) {
      if (!waiter.matcher(line)) continue;
      clearTimeout(waiter.timeout);
      this.pendingWaiters = this.pendingWaiters.filter((item) => item !== waiter);
      waiter.resolve(line);
      return;
    }

    this.incomingLines.push(line);
    this.emit('line', line);
  }

  _writeLine(line) {
    if (!this.socket || this.socket.destroyed) {
      throw makeError('SOCKET_NOT_AVAILABLE', 'socket is not connected');
    }
    this.socket.write(`${line}\n`);
  }

  _onSocketError(err) {
    this.emit('socket_error', err);
  }

  _onSocketClose(hadError) {
    this._stopHeartbeat();
    this._rejectAllWaiters(makeError('SOCKET_CLOSED', 'socket closed'));
    this._cleanupSocket();

    if (this.closedByUser) {
      this._transition(REMOTE_STATES.CLOSED, { reason: 'client_request' });
      this.emit('closed', { reason: 'client_request' });
      return;
    }

    this._scheduleReconnect(hadError ? 'socket_error' : 'socket_closed');
  }

  _scheduleReconnect(reason) {
    if (!this.reconnect.enabled) {
      this._transition(REMOTE_STATES.CLOSED, { reason });
      this.emit('closed', { reason });
      return;
    }

    if (this.reconnectAttempts >= this.reconnect.maxAttempts) {
      this._transition(REMOTE_STATES.CLOSED, { reason: 'max_reconnect_attempts' });
      this.emit('closed', { reason: 'max_reconnect_attempts' });
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = computeBackoffDelay(this.reconnectAttempts, this.reconnect);

    this._transition(REMOTE_STATES.RECONNECT_WAIT, {
      reason,
      attempt: this.reconnectAttempts,
      delayMs
    });

    this.emit('reconnecting', {
      reason,
      attempt: this.reconnectAttempts,
      delayMs
    });

    this._clearReconnectTimer();
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this._connectAndHandshake(true);
      } catch (err) {
        this.emit('reconnect_failed', {
          reason: err.message,
          attempt: this.reconnectAttempts
        });
        this._scheduleReconnect('reconnect_failed');
      }
    }, delayMs);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== REMOTE_STATES.READY) return;

      const elapsed = Date.now() - this.lastPongAt;
      if (elapsed > this.timeouts.idleTimeoutMs) {
        if (this.socket && !this.socket.destroyed) {
          try {
            this.socket.destroy();
          } catch (e) {}
        }
        return;
      }

      this.sendHeartbeat().catch(() => {
        if (this.socket && !this.socket.destroyed) {
          try {
            this.socket.destroy();
          } catch (e) {}
        }
      });
    }, this.timeouts.heartbeatMs);
  }

  _stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  _cleanupSocket() {
    if (!this.socket) return;
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('close');
    this.socket.removeAllListeners('error');
    this.socket = null;
    this.buffer = '';
    this.incomingLines = [];
  }

  _destroyAndCleanupSocket() {
    if (!this.socket) return;
    try {
      if (!this.socket.destroyed) {
        this.socket.destroy();
      }
    } catch (e) {}
    this._cleanupSocket();
  }

  _rejectAllWaiters(err) {
    for (const waiter of this.pendingWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(err);
    }
    this.pendingWaiters = [];
  }

  _connectionSnapshot() {
    return {
      state: this.state,
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      connectionId: this.connectionId,
      controlSessionId: this.controlSessionId,
      resumed: this.lastAuthResumed
    };
  }

  _transition(nextState, metadata) {
    if (this.state === nextState) return;

    const prevState = this.state;
    this.state = nextState;

    this.emit('state', {
      from: prevState,
      to: nextState,
      at: new Date().toISOString(),
      ...(metadata || {})
    });
  }
}

function createRemoteConnector(options) {
  return new RemoteConnector(options);
}

function computeBackoffDelay(attempt, policy) {
  const unclamped = policy.baseDelayMs * (2 ** Math.max(0, attempt - 1));
  const clamped = Math.min(policy.maxDelayMs, unclamped);
  const jitter = 1 + ((Math.random() * 2 - 1) * policy.jitterRatio);
  return Math.max(10, Math.round(clamped * jitter));
}

function splitParts(line) {
  return String(line || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildClientId() {
  return `aih-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

function encodeToken(value) {
  return encodeURIComponent(String(value == null ? '' : value));
}

function decodeToken(value) {
  return decodeURIComponent(String(value == null ? '' : value));
}

function makeError(code, message) {
  const err = new Error(message || 'remote connector error');
  err.code = code;
  return err;
}

function parseRemoteError(line) {
  const parts = splitParts(line);
  const code = parts[1] || 'REMOTE_ERROR';
  const message = decodeToken(parts[2] || 'remote%20error');
  return makeError(code, message);
}

module.exports = {
  REMOTE_STATES,
  RemoteConnector,
  createRemoteConnector
};

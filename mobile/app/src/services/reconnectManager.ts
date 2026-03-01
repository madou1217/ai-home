export type ReconnectState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface ReconnectSnapshot {
  state: ReconnectState;
  attempt: number;
  nextRetryAt?: string;
  reason?: string;
  updatedAt: string;
}

export interface ReconnectManagerOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  jitterRatio?: number;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

type ConnectOperation = () => Promise<void>;
type ReconnectListener = (snapshot: ReconnectSnapshot) => void;

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_JITTER_RATIO = 0.2;

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown): string {
  if (!error) return 'unknown_error';
  if (error instanceof Error) return error.message || error.name || 'unknown_error';
  return String(error);
}

export class ReconnectManager {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly jitterRatio: number;
  private readonly now: () => number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly listeners = new Set<ReconnectListener>();

  private snapshot: ReconnectSnapshot = {
    state: 'idle',
    attempt: 0,
    updatedAt: nowIso()
  };

  private connectOperation: ConnectOperation | null = null;
  private active = false;
  private connecting = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ReconnectManagerOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
    this.now = options.now || Date.now;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  }

  getSnapshot(): ReconnectSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: ReconnectListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(operation: ConnectOperation): void {
    this.connectOperation = operation;
    this.active = true;
    this.clearRetryTimer();
    this.updateSnapshot({
      state: 'connecting',
      attempt: 0,
      reason: undefined,
      nextRetryAt: undefined
    });
    void this.tryConnect('connecting');
  }

  stop(): void {
    this.active = false;
    this.connecting = false;
    this.connectOperation = null;
    this.clearRetryTimer();
    this.updateSnapshot({
      state: 'idle',
      attempt: 0,
      reason: undefined,
      nextRetryAt: undefined
    });
  }

  notifyConnectionLost(reason?: string): void {
    if (!this.active) return;
    this.clearRetryTimer();
    this.updateSnapshot({
      state: 'reconnecting',
      reason: reason || 'connection_lost'
    });
    this.scheduleRetry();
  }

  retryNow(): void {
    if (!this.active) return;
    this.clearRetryTimer();
    void this.tryConnect(this.snapshot.attempt > 0 ? 'reconnecting' : 'connecting');
  }

  private emit(): void {
    const current = this.getSnapshot();
    this.listeners.forEach((listener) => listener(current));
  }

  private updateSnapshot(partial: Partial<ReconnectSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      updatedAt: nowIso()
    };
    this.emit();
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
  }

  private computeDelayMs(attempt: number): number {
    const rawDelay = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = rawDelay * this.jitterRatio * (Math.random() * 2 - 1);
    return Math.max(250, Math.round(rawDelay + jitter));
  }

  private scheduleRetry(): void {
    const nextAttempt = this.snapshot.attempt + 1;
    if (nextAttempt > this.maxAttempts) {
      this.updateSnapshot({
        state: 'offline',
        attempt: nextAttempt - 1,
        nextRetryAt: undefined
      });
      return;
    }

    const delayMs = this.computeDelayMs(nextAttempt);
    const nextRetryAt = new Date(this.now() + delayMs).toISOString();
    this.updateSnapshot({
      state: 'reconnecting',
      attempt: nextAttempt,
      nextRetryAt
    });

    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      void this.tryConnect('reconnecting');
    }, delayMs);
  }

  private async tryConnect(state: ReconnectState): Promise<void> {
    if (!this.active || !this.connectOperation || this.connecting) return;
    this.connecting = true;
    this.updateSnapshot({
      state: state === 'idle' ? 'connecting' : state,
      nextRetryAt: undefined
    });

    try {
      await this.connectOperation();
      this.updateSnapshot({
        state: 'connected',
        attempt: 0,
        reason: undefined,
        nextRetryAt: undefined
      });
    } catch (error) {
      this.updateSnapshot({
        state: 'reconnecting',
        reason: toErrorMessage(error)
      });
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }
}


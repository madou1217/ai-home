export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type SessionStatus = 'idle' | 'active' | 'degraded' | 'offline' | 'unknown';

export interface SessionSnapshot {
  sessionId: string;
  status: SessionStatus;
  nodeId?: string;
  activeTaskId?: string;
  message?: string;
  updatedAt: string;
}

export type DaemonClientErrorCode =
  | 'daemon_request_aborted'
  | 'daemon_request_timeout'
  | 'daemon_http_error'
  | 'daemon_network_error'
  | 'daemon_validation_error'
  | 'daemon_parse_error'
  | 'daemon_request_failed';

export interface DaemonClientError extends Error {
  code: DaemonClientErrorCode;
  status?: number;
  retryable: boolean;
  details?: unknown;
}

export interface StartTaskInput {
  command: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskSnapshot {
  taskId: string;
  sessionId?: string;
  status: TaskStatus;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: string;
  updatedAt: string;
}

export interface WaitForTaskCompletionOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (task: TaskSnapshot) => void;
}

export interface WatchTaskOptions {
  pollIntervalMs?: number;
  maxConsecutiveErrors?: number;
  signal?: AbortSignal;
  onUpdate: (task: TaskSnapshot) => void;
  onError?: (error: unknown) => void;
}

export interface WatchTaskController {
  stop: () => void;
}

export interface DaemonClient {
  ping(signal?: AbortSignal): Promise<boolean>;
  getSessionStatus(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot>;
  startTask(input: StartTaskInput, signal?: AbortSignal): Promise<TaskSnapshot>;
  getTask(taskId: string, signal?: AbortSignal): Promise<TaskSnapshot>;
  cancelTask(taskId: string, signal?: AbortSignal): Promise<void>;
  waitForTaskCompletion(taskId: string, options?: WaitForTaskCompletionOptions): Promise<TaskSnapshot>;
  watchTask(taskId: string, options: WatchTaskOptions): WatchTaskController;
  normalizeError(error: unknown): DaemonClientError;
}

export interface CreateDaemonClientOptions {
  baseUrl: string;
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 1_250;
const DEFAULT_WAIT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS = 5;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTaskTerminal(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  const raw = String(value || '').toLowerCase();
  if (raw === 'idle' || raw === 'active' || raw === 'degraded' || raw === 'offline') {
    return raw;
  }
  return 'unknown';
}

function normalizeStatus(value: unknown): TaskStatus {
  const raw = String(value || '').toLowerCase();
  if (raw === 'queued' || raw === 'running' || raw === 'succeeded' || raw === 'failed' || raw === 'canceled') {
    return raw;
  }
  return 'running';
}

function createDaemonClientError(input: {
  code: DaemonClientErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
  details?: unknown;
}): DaemonClientError {
  const err = new Error(input.message) as DaemonClientError;
  err.name = 'DaemonClientError';
  err.code = input.code;
  err.status = input.status;
  err.retryable = input.retryable;
  err.details = input.details;
  return err;
}

function normalizeSessionSnapshot(payload: unknown): SessionSnapshot {
  const source = (payload as { session?: unknown; data?: unknown }) || {};
  const session = (source.session || source.data || payload) as Record<string, unknown>;
  const sessionId = String(session?.sessionId || session?.id || '');
  if (!sessionId) {
    throw createDaemonClientError({
      code: 'daemon_parse_error',
      message: 'daemon_invalid_session_payload',
      retryable: false
    });
  }

  return {
    sessionId,
    status: normalizeSessionStatus(session?.status),
    nodeId: session?.nodeId ? String(session.nodeId) : undefined,
    activeTaskId: session?.activeTaskId ? String(session.activeTaskId) : undefined,
    message: session?.message ? String(session.message) : undefined,
    updatedAt: session?.updatedAt ? String(session.updatedAt) : nowIso()
  };
}

function normalizeTaskSnapshot(payload: unknown): TaskSnapshot {
  const source = (payload as { task?: unknown; data?: unknown }) || {};
  const task = (source.task || source.data || payload) as Record<string, unknown>;
  const taskId = String(task?.taskId || task?.id || '');
  if (!taskId) {
    throw createDaemonClientError({
      code: 'daemon_parse_error',
      message: 'daemon_invalid_task_payload',
      retryable: false
    });
  }
  return {
    taskId,
    sessionId: task?.sessionId ? String(task.sessionId) : undefined,
    status: normalizeStatus(task?.status),
    progress: Number.isFinite(task?.progress) ? Number(task.progress) : undefined,
    message: task?.message ? String(task.message) : undefined,
    result: task?.result,
    error: task?.error ? String(task.error) : undefined,
    updatedAt: task?.updatedAt ? String(task.updatedAt) : nowIso()
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function buildUrl(baseUrl: string, path: string): string {
  const fixedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${fixedPath}`;
}

function mergeAbortSignals(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    external.addEventListener('abort', onAbort);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (external) external.removeEventListener('abort', onAbort);
    }
  };
}

function normalizePollInterval(pollIntervalMs?: number): number {
  const defaultMs = DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isFinite(pollIntervalMs) || Number(pollIntervalMs) <= 0) return defaultMs;
  return Math.max(250, Number(pollIntervalMs));
}

function normalizeMaxConsecutiveWatchErrors(value?: number): number {
  if (!Number.isFinite(value) || Number(value) < 1) return DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS;
  return Math.max(1, Math.floor(Number(value)));
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && /abort/i.test(error.name)) return true;
  return false;
}

function parseErrorDetails(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeDaemonError(error: unknown): DaemonClientError {
  if (error && typeof error === 'object' && (error as { name?: string }).name === 'DaemonClientError') {
    return error as DaemonClientError;
  }

  if (isAbortError(error)) {
    return createDaemonClientError({
      code: 'daemon_request_aborted',
      message: 'daemon_request_aborted',
      retryable: false
    });
  }

  if (error instanceof TypeError) {
    return createDaemonClientError({
      code: 'daemon_network_error',
      message: error.message || 'daemon_network_error',
      retryable: true
    });
  }

  if (error instanceof Error) {
    return createDaemonClientError({
      code: 'daemon_request_failed',
      message: error.message || 'daemon_request_failed',
      retryable: false,
      details: { name: error.name }
    });
  }

  return createDaemonClientError({
    code: 'daemon_request_failed',
    message: 'daemon_request_failed',
    retryable: false,
    details: error
  });
}

export function createDaemonClient(options: CreateDaemonClientOptions): DaemonClient {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  if (!baseUrl) {
    throw new Error('daemon_client_missing_base_url');
  }

  async function getAuthHeader(): Promise<Record<string, string>> {
    if (!options.tokenProvider) return {};
    const token = await options.tokenProvider();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal
  ): Promise<T> {
    const url = buildUrl(baseUrl, path);
    const headers = {
      'Content-Type': 'application/json',
      ...(await getAuthHeader()),
      ...(init.headers || {})
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const { signal: mergedSignal, cleanup } = mergeAbortSignals(signal);
      const controller = new AbortController();
      const relayAbort = () => controller.abort();
      if (mergedSignal.aborted) controller.abort();
      mergedSignal.addEventListener('abort', relayAbort);
      const internalTimeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          ...init,
          headers,
          signal: controller.signal
        });
        clearTimeout(internalTimeout);
        mergedSignal.removeEventListener('abort', relayAbort);

        const canRetry = RETRYABLE_STATUS.has(response.status);
        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const details = parseErrorDetails(errBody);
          if (attempt < retryCount && canRetry) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          throw createDaemonClientError({
            code: 'daemon_http_error',
            message: `daemon_http_${response.status}`,
            status: response.status,
            retryable: canRetry,
            details
          });
        }

        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
          ? await response.json()
          : ((await response.text()) as unknown);
        cleanup();
        return body as T;
      } catch (error) {
        clearTimeout(internalTimeout);
        mergedSignal.removeEventListener('abort', relayAbort);
        cleanup();
        if (signal?.aborted) {
          throw normalizeDaemonError(error);
        }
        if (isAbortError(error)) {
          const timeoutHappened = !mergedSignal.aborted && !signal?.aborted;
          lastError = createDaemonClientError({
            code: timeoutHappened ? 'daemon_request_timeout' : 'daemon_request_aborted',
            message: timeoutHappened ? 'daemon_request_timeout' : 'daemon_request_aborted',
            retryable: timeoutHappened
          });
        } else {
          lastError = normalizeDaemonError(error);
        }
        if (attempt >= retryCount) break;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw normalizeDaemonError(lastError);
  }

  async function ping(signal?: AbortSignal): Promise<boolean> {
    try {
      await requestJson('/v1/health', { method: 'GET' }, signal);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function getSessionStatus(sessionId: string, signal?: AbortSignal): Promise<SessionSnapshot> {
    if (!sessionId || !String(sessionId).trim()) {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_session_id_required',
        retryable: false
      });
    }
    const payload = await requestJson<unknown>(
      `/v1/sessions/${encodeURIComponent(String(sessionId).trim())}`,
      { method: 'GET' },
      signal
    );
    return normalizeSessionSnapshot(payload);
  }

  async function startTask(input: StartTaskInput, signal?: AbortSignal): Promise<TaskSnapshot> {
    if (!input.command || !String(input.command).trim()) {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_task_command_required',
        retryable: false
      });
    }
    const body = JSON.stringify({
      command: String(input.command).trim(),
      sessionId: input.sessionId,
      metadata: input.metadata || {}
    });
    const payload = await requestJson<unknown>(
      '/v1/tasks',
      {
        method: 'POST',
        body
      },
      signal
    );
    return normalizeTaskSnapshot(payload);
  }

  async function getTask(taskId: string, signal?: AbortSignal): Promise<TaskSnapshot> {
    if (!taskId) {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_task_id_required',
        retryable: false
      });
    }
    const payload = await requestJson<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }, signal);
    return normalizeTaskSnapshot(payload);
  }

  async function cancelTask(taskId: string, signal?: AbortSignal): Promise<void> {
    if (!taskId) {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_task_id_required',
        retryable: false
      });
    }
    await requestJson<unknown>(
      `/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({})
      },
      signal
    );
  }

  async function waitForTaskCompletion(
    taskId: string,
    optionsArg: WaitForTaskCompletionOptions = {}
  ): Promise<TaskSnapshot> {
    const pollIntervalMs = optionsArg.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = optionsArg.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startedAt = Date.now();

    while (true) {
      if (optionsArg.signal?.aborted) {
        throw createDaemonClientError({
          code: 'daemon_request_aborted',
          message: 'daemon_wait_aborted',
          retryable: false
        });
      }
      const snapshot = await getTask(taskId, optionsArg.signal);
      if (optionsArg.onProgress) {
        optionsArg.onProgress(snapshot);
      }
      if (isTaskTerminal(snapshot.status)) return snapshot;
      if (Date.now() - startedAt > timeout) {
        throw createDaemonClientError({
          code: 'daemon_request_timeout',
          message: 'daemon_wait_timeout',
          retryable: true
        });
      }
      await sleep(pollIntervalMs);
    }
  }

  function watchTask(taskId: string, optionsArg: WatchTaskOptions): WatchTaskController {
    if (!taskId) {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_task_id_required',
        retryable: false
      });
    }
    if (!optionsArg || typeof optionsArg.onUpdate !== 'function') {
      throw createDaemonClientError({
        code: 'daemon_validation_error',
        message: 'daemon_watch_on_update_required',
        retryable: false
      });
    }

    const pollIntervalMs = normalizePollInterval(optionsArg.pollIntervalMs);
    const maxConsecutiveErrors = normalizeMaxConsecutiveWatchErrors(optionsArg.maxConsecutiveErrors);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let consecutiveErrors = 0;

    const stop = () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const loop = async () => {
      if (stopped) return;
      if (optionsArg.signal?.aborted) {
        stop();
        return;
      }

      try {
        const snapshot = await getTask(taskId, optionsArg.signal);
        consecutiveErrors = 0;
        optionsArg.onUpdate(snapshot);
        if (isTaskTerminal(snapshot.status)) {
          stop();
          return;
        }
      } catch (error) {
        consecutiveErrors += 1;
        if (optionsArg.onError) {
          optionsArg.onError(normalizeDaemonError(error));
        }
        if (consecutiveErrors >= maxConsecutiveErrors) {
          stop();
          return;
        }
      }

      if (!stopped) {
        const backoff = Math.min(5_000, pollIntervalMs * (consecutiveErrors + 1));
        timer = setTimeout(loop, backoff);
      }
    };

    void loop();
    return { stop };
  }

  return {
    ping,
    getSessionStatus,
    startTask,
    getTask,
    cancelTask,
    waitForTaskCompletion,
    watchTask,
    normalizeError: normalizeDaemonError
  };
}

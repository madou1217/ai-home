export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

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
  startTask(input: StartTaskInput, signal?: AbortSignal): Promise<TaskSnapshot>;
  getTask(taskId: string, signal?: AbortSignal): Promise<TaskSnapshot>;
  cancelTask(taskId: string, signal?: AbortSignal): Promise<void>;
  waitForTaskCompletion(taskId: string, options?: WaitForTaskCompletionOptions): Promise<TaskSnapshot>;
  watchTask(taskId: string, options: WatchTaskOptions): WatchTaskController;
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

function normalizeStatus(value: unknown): TaskStatus {
  const raw = String(value || '').toLowerCase();
  if (raw === 'queued' || raw === 'running' || raw === 'succeeded' || raw === 'failed' || raw === 'canceled') {
    return raw;
  }
  return 'running';
}

function normalizeTaskSnapshot(payload: unknown): TaskSnapshot {
  const source = (payload as { task?: unknown; data?: unknown }) || {};
  const task = (source.task || source.data || payload) as Record<string, unknown>;
  const taskId = String(task?.taskId || task?.id || '');
  if (!taskId) {
    throw new Error('daemon_invalid_task_payload');
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
          const message = `daemon_http_${response.status}${errBody ? `:${errBody}` : ''}`;
          if (attempt < retryCount && canRetry) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }
          throw new Error(message);
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
        lastError = error;
        if (signal?.aborted || isAbortError(error)) throw error;
        if (attempt >= retryCount) break;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('daemon_request_failed');
  }

  async function ping(signal?: AbortSignal): Promise<boolean> {
    try {
      await requestJson('/v1/health', { method: 'GET' }, signal);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function startTask(input: StartTaskInput, signal?: AbortSignal): Promise<TaskSnapshot> {
    if (!input.command || !String(input.command).trim()) {
      throw new Error('daemon_task_command_required');
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
    if (!taskId) throw new Error('daemon_task_id_required');
    const payload = await requestJson<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`, { method: 'GET' }, signal);
    return normalizeTaskSnapshot(payload);
  }

  async function cancelTask(taskId: string, signal?: AbortSignal): Promise<void> {
    if (!taskId) throw new Error('daemon_task_id_required');
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
      if (optionsArg.signal?.aborted) throw new Error('daemon_wait_aborted');
      const snapshot = await getTask(taskId, optionsArg.signal);
      if (optionsArg.onProgress) {
        optionsArg.onProgress(snapshot);
      }
      if (isTaskTerminal(snapshot.status)) return snapshot;
      if (Date.now() - startedAt > timeout) {
        throw new Error('daemon_wait_timeout');
      }
      await sleep(pollIntervalMs);
    }
  }

  function watchTask(taskId: string, optionsArg: WatchTaskOptions): WatchTaskController {
    if (!taskId) throw new Error('daemon_task_id_required');
    if (!optionsArg || typeof optionsArg.onUpdate !== 'function') {
      throw new Error('daemon_watch_on_update_required');
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
          optionsArg.onError(error);
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
    startTask,
    getTask,
    cancelTask,
    waitForTaskCompletion,
    watchTask
  };
}

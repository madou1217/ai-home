import type { ReconnectSnapshot } from './reconnectManager';
import type { TaskSnapshot } from './daemonClient';

export type PushPermission = 'granted' | 'denied' | 'prompt';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type NotificationDestination =
  | { screen: 'TaskScreen'; params: { taskId: string; sessionId?: string } }
  | { screen: 'SessionScreen'; params?: Record<string, unknown> };

export interface PushAdapter {
  requestPermission(): Promise<PushPermission>;
  getDeviceToken(): Promise<string | null>;
  sendLocalNotification(message: PushMessage): Promise<void>;
}

export interface PushState {
  ready: boolean;
  permission: PushPermission;
  deviceToken: string | null;
}

class ConsolePushAdapter implements PushAdapter {
  async requestPermission(): Promise<PushPermission> {
    return 'granted';
  }

  async getDeviceToken(): Promise<string | null> {
    return null;
  }

  async sendLocalNotification(message: PushMessage): Promise<void> {
    const printable = `${message.title}: ${message.body}`;
    console.info(`[push] ${printable}`);
  }
}

export class PushNotifications {
  private readonly adapter: PushAdapter;
  private readonly lastTaskUpdatedAtMs = new Map<string, number>();
  private readonly lastTaskEventFingerprint = new Map<string, string>();
  private state: PushState = {
    ready: false,
    permission: 'prompt',
    deviceToken: null
  };

  constructor(adapter?: PushAdapter) {
    this.adapter = adapter || new ConsolePushAdapter();
  }

  private buildTaskDestination(task: TaskSnapshot): NotificationDestination {
    return {
      screen: 'TaskScreen',
      params: {
        taskId: task.taskId,
        ...(task.sessionId ? { sessionId: task.sessionId } : {})
      }
    };
  }

  private taskPayload(task: TaskSnapshot, event: 'completion' | 'failure' | 'quota'): Record<string, unknown> {
    const destination = this.buildTaskDestination(task);
    return {
      event,
      taskId: task.taskId,
      sessionId: task.sessionId,
      status: task.status,
      destination,
      action: {
        type: 'navigate',
        label: 'View task',
        destination
      }
    };
  }

  private hasQuotaSignal(task: TaskSnapshot): boolean {
    const text = [task.error, task.message, typeof task.result === 'string' ? task.result : '']
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return /quota|rate[\s-_]?limit|too many requests|429/.test(text);
  }

  private parseTaskUpdatedAtMs(task: TaskSnapshot): number {
    const parsed = Date.parse(task.updatedAt);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  private shouldSuppressTaskEvent(task: TaskSnapshot, event: 'started' | 'update' | 'completion' | 'failure' | 'quota'): boolean {
    const updatedAtMs = this.parseTaskUpdatedAtMs(task);
    const lastSeenMs = this.lastTaskUpdatedAtMs.get(task.taskId);
    // Drop stale/out-of-order snapshots to avoid regressing notification state.
    if (typeof lastSeenMs === 'number' && updatedAtMs < lastSeenMs) {
      return true;
    }

    const eventKey = `${task.taskId}:${event}`;
    const fingerprint = [
      task.status,
      String(task.progress ?? ''),
      String(task.message ?? ''),
      String(task.error ?? ''),
      task.updatedAt
    ].join('|');
    const previousFingerprint = this.lastTaskEventFingerprint.get(eventKey);
    if (previousFingerprint === fingerprint) {
      return true;
    }

    this.lastTaskUpdatedAtMs.set(task.taskId, Math.max(lastSeenMs || 0, updatedAtMs));
    this.lastTaskEventFingerprint.set(eventKey, fingerprint);
    return false;
  }

  getState(): PushState {
    return { ...this.state };
  }

  async ensureReady(): Promise<PushState> {
    if (this.state.ready) return this.getState();
    const permission = await this.adapter.requestPermission();
    const deviceToken = permission === 'granted' ? await this.adapter.getDeviceToken() : null;
    this.state = {
      ready: true,
      permission,
      deviceToken
    };
    return this.getState();
  }

  private async send(title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await this.ensureReady();
    if (this.state.permission !== 'granted') return;
    await this.adapter.sendLocalNotification({ title, body, data });
  }

  async notifyTaskStarted(task: TaskSnapshot): Promise<void> {
    if (this.shouldSuppressTaskEvent(task, 'started')) return;
    await this.send(
      'Task started',
      `Task ${task.taskId} is now ${task.status}.`,
      {
        event: 'started',
        taskId: task.taskId,
        status: task.status,
        destination: this.buildTaskDestination(task),
        action: {
          type: 'navigate',
          label: 'View task',
          destination: this.buildTaskDestination(task)
        }
      }
    );
  }

  async notifyTaskUpdated(task: TaskSnapshot): Promise<void> {
    if (this.shouldSuppressTaskEvent(task, 'update')) return;
    if (this.hasQuotaSignal(task)) {
      await this.notifyQuotaAlert(task);
      return;
    }

    const progressText = Number.isFinite(task.progress) ? ` (${Math.round(Number(task.progress) * 100)}%)` : '';
    await this.send(
      'Task update',
      `Task ${task.taskId} is ${task.status}${progressText}.`,
      {
        event: 'update',
        taskId: task.taskId,
        status: task.status,
        progress: task.progress,
        destination: this.buildTaskDestination(task),
        action: {
          type: 'navigate',
          label: 'View task',
          destination: this.buildTaskDestination(task)
        }
      }
    );
  }

  async notifyTaskCompleted(task: TaskSnapshot): Promise<void> {
    const success = task.status === 'succeeded';
    if (this.shouldSuppressTaskEvent(task, success ? 'completion' : 'failure')) return;
    if (this.hasQuotaSignal(task)) {
      await this.notifyQuotaAlert(task);
      return;
    }

    const title = success ? 'Task completed' : 'Task failed';
    const body = success
      ? `Task ${task.taskId} completed successfully.`
      : `Task ${task.taskId} ended with status ${task.status}. Open task details for recovery steps.`;
    await this.send(
      title,
      body,
      this.taskPayload(task, success ? 'completion' : 'failure')
    );
  }

  async notifyQuotaAlert(task: TaskSnapshot): Promise<void> {
    if (this.shouldSuppressTaskEvent(task, 'quota')) return;
    await this.send(
      'Quota limit reached',
      `Task ${task.taskId} hit a quota/rate limit. Open task details to retry or switch account.`,
      this.taskPayload(task, 'quota')
    );
  }

  async notifyReconnectScheduled(snapshot: ReconnectSnapshot): Promise<void> {
    if (!snapshot.nextRetryAt) return;
    const retryAt = new Date(snapshot.nextRetryAt).toLocaleTimeString();
    await this.send(
      'Reconnecting',
      `Connection lost. Retry attempt ${snapshot.attempt} at ${retryAt}.`,
      {
        attempt: snapshot.attempt,
        nextRetryAt: snapshot.nextRetryAt,
        reason: snapshot.reason,
        destination: { screen: 'SessionScreen' },
        action: {
          type: 'navigate',
          label: 'Open session',
          destination: { screen: 'SessionScreen' }
        }
      }
    );
  }

  async notifyReconnected(): Promise<void> {
    await this.send('Connected', 'Remote control channel recovered.');
  }

  async notifyOffline(snapshot: ReconnectSnapshot): Promise<void> {
    await this.send(
      'Connection offline',
      `Reconnect attempts exhausted after ${snapshot.attempt} tries.`,
      {
        attempt: snapshot.attempt,
        reason: snapshot.reason,
        destination: { screen: 'SessionScreen' },
        action: {
          type: 'navigate',
          label: 'Open session',
          destination: { screen: 'SessionScreen' }
        }
      }
    );
  }
}

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
    if (this.hasQuotaSignal(task)) {
      await this.notifyQuotaAlert(task);
      return;
    }

    const success = task.status === 'succeeded';
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

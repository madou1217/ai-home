import type { ReconnectSnapshot } from './reconnectManager';
import type { TaskSnapshot } from './daemonClient';

export type PushPermission = 'granted' | 'denied' | 'prompt';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

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
      { taskId: task.taskId, status: task.status }
    );
  }

  async notifyTaskUpdated(task: TaskSnapshot): Promise<void> {
    const progressText = Number.isFinite(task.progress) ? ` (${Math.round(Number(task.progress) * 100)}%)` : '';
    await this.send(
      'Task update',
      `Task ${task.taskId} is ${task.status}${progressText}.`,
      { taskId: task.taskId, status: task.status, progress: task.progress }
    );
  }

  async notifyTaskCompleted(task: TaskSnapshot): Promise<void> {
    const success = task.status === 'succeeded';
    const title = success ? 'Task completed' : 'Task needs attention';
    const body = success
      ? `Task ${task.taskId} completed successfully.`
      : `Task ${task.taskId} finished with status: ${task.status}.`;
    await this.send(title, body, { taskId: task.taskId, status: task.status, error: task.error });
  }

  async notifyReconnectScheduled(snapshot: ReconnectSnapshot): Promise<void> {
    if (!snapshot.nextRetryAt) return;
    const retryAt = new Date(snapshot.nextRetryAt).toLocaleTimeString();
    await this.send(
      'Reconnecting',
      `Connection lost. Retry attempt ${snapshot.attempt} at ${retryAt}.`,
      { attempt: snapshot.attempt, nextRetryAt: snapshot.nextRetryAt, reason: snapshot.reason }
    );
  }

  async notifyReconnected(): Promise<void> {
    await this.send('Connected', 'Remote control channel recovered.');
  }

  async notifyOffline(snapshot: ReconnectSnapshot): Promise<void> {
    await this.send(
      'Connection offline',
      `Reconnect attempts exhausted after ${snapshot.attempt} tries.`,
      { attempt: snapshot.attempt, reason: snapshot.reason }
    );
  }
}


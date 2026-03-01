import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import OpsQuickActions from './OpsQuickActions';
import SessionScreen from './SessionScreen';
import { DaemonClient, TaskSnapshot } from '../services/daemonClient';
import { PushNotifications } from '../services/pushNotifications';
import { ReconnectManager } from '../services/reconnectManager';

export interface TaskScreenProps {
  daemonClient: DaemonClient;
  reconnectManager: ReconnectManager;
  pushNotifications: PushNotifications;
}

function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

export default function TaskScreen(props: TaskScreenProps): JSX.Element {
  const [command, setCommand] = useState<string>('aih ls');
  const [sessionId, setSessionId] = useState<string>('');
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [resultText, setResultText] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [watchStatus, setWatchStatus] = useState<string>('No active task.');
  const watchStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (watchStopRef.current) {
        watchStopRef.current();
        watchStopRef.current = null;
      }
    };
  }, []);

  const canStart = useMemo(() => !isStarting && command.trim().length > 0, [isStarting, command]);
  const canCancel = useMemo(() => Boolean(task && (task.status === 'queued' || task.status === 'running')), [task]);

  const beginWatch = (taskId: string): void => {
    if (watchStopRef.current) {
      watchStopRef.current();
      watchStopRef.current = null;
    }

    const controller = props.daemonClient.watchTask(taskId, {
      pollIntervalMs: 1_250,
      onUpdate: (nextTask) => {
        setTask(nextTask);
        setWatchStatus(`Tracking ${nextTask.taskId} (${nextTask.status})`);
        if (nextTask.status === 'succeeded' || nextTask.status === 'failed' || nextTask.status === 'canceled') {
          setResultText(prettyJson(nextTask.result));
          void props.pushNotifications.notifyTaskCompleted(nextTask);
        } else {
          void props.pushNotifications.notifyTaskUpdated(nextTask);
        }
      },
      onError: (error) => {
        setErrorText(toErrorMessage(error));
      }
    });

    watchStopRef.current = controller.stop;
  };

  const connectSession = async (): Promise<void> => {
    const ok = await props.daemonClient.ping();
    if (!ok) {
      throw new Error('daemon_unreachable');
    }
  };

  const startTask = async (): Promise<void> => {
    if (!canStart) return;
    setIsStarting(true);
    setErrorText('');
    setResultText('');
    try {
      const created = await props.daemonClient.startTask({
        command: command.trim(),
        sessionId: sessionId.trim() || undefined
      });
      setTask(created);
      setWatchStatus(`Task ${created.taskId} started.`);
      beginWatch(created.taskId);
      await props.pushNotifications.notifyTaskStarted(created);
    } catch (error) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    if (!task) return;
    setIsRefreshing(true);
    setErrorText('');
    try {
      const fresh = await props.daemonClient.getTask(task.taskId);
      setTask(fresh);
      if (fresh.status === 'succeeded' || fresh.status === 'failed' || fresh.status === 'canceled') {
        setResultText(prettyJson(fresh.result));
      }
    } catch (error) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const cancelTask = async (): Promise<void> => {
    if (!task || !canCancel) return;
    await props.daemonClient.cancelTask(task.taskId);
    await refreshStatus();
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Mobile Control Center</Text>
      <Text style={styles.subHeading}>Initiate commands, track status, and inspect task output remotely.</Text>

      <SessionScreen
        reconnectManager={props.reconnectManager}
        connectSession={connectSession}
        pushNotifications={props.pushNotifications}
      />

      <View style={styles.card}>
        <Text style={styles.label}>Command</Text>
        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder="Enter daemon command"
          placeholderTextColor="#64748b"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Session ID (optional)</Text>
        <TextInput
          value={sessionId}
          onChangeText={setSessionId}
          placeholder="session-123"
          placeholderTextColor="#64748b"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <OpsQuickActions
          onRefreshStatus={refreshStatus}
          onRetryConnection={() => props.reconnectManager.retryNow()}
          onCancelTask={cancelTask}
          cancelDisabled={!canCancel}
        />

        <Text style={styles.metaText}>{isRefreshing ? 'Refreshing status...' : watchStatus}</Text>
        <Text style={styles.metaText}>{canStart ? 'Ready to start task.' : 'Command required.'}</Text>
        <Text style={styles.startLink} onPress={() => void startTask()}>
          {isStarting ? 'Starting task...' : 'Start Task'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Live Status</Text>
        <Text style={styles.statusText}>{task ? `${task.taskId} • ${task.status}` : 'No task created yet.'}</Text>
        {task?.message ? <Text style={styles.metaText}>{task.message}</Text> : null}
        {task?.error ? <Text style={styles.errorText}>{task.error}</Text> : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Result</Text>
        <Text style={styles.resultText}>{resultText || 'Task result will appear here when available.'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#020617'
  },
  content: {
    padding: 16,
    gap: 12
  },
  heading: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800'
  },
  subHeading: {
    color: '#94a3b8',
    fontSize: 13
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  label: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700'
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#111827',
    color: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  statusText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600'
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12
  },
  errorText: {
    color: '#f87171',
    fontSize: 12
  },
  resultText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontFamily: 'Menlo'
  },
  startLink: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '700'
  }
});


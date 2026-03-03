import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

function isTerminalStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return result ? String(result) : 'No structured result payload.';
  }

  const payload = result as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof payload.exitCode === 'number') lines.push(`Exit Code: ${payload.exitCode}`);
  if (typeof payload.durationMs === 'number') lines.push(`Duration: ${payload.durationMs}ms`);
  if (typeof payload.summary === 'string' && payload.summary.trim()) lines.push(`Summary: ${payload.summary.trim()}`);
  if (typeof payload.stdout === 'string' && payload.stdout.trim()) {
    lines.push(`Stdout: ${payload.stdout.trim().slice(0, 180)}${payload.stdout.length > 180 ? '…' : ''}`);
  }
  if (typeof payload.stderr === 'string' && payload.stderr.trim()) {
    lines.push(`Stderr: ${payload.stderr.trim().slice(0, 180)}${payload.stderr.length > 180 ? '…' : ''}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'Result received. Expand raw payload for more details.';
}

function buildGuidance(task: TaskSnapshot | null, runtimeError: string): string {
  if (runtimeError) {
    if (runtimeError.includes('daemon_unreachable')) {
      return 'Daemon unreachable. Check network or retry connection from quick actions.';
    }
    return 'Request failed. Confirm daemon health and retry the task.';
  }
  if (!task) return 'Fill command and tap Start Task to trigger execution.';
  if (task.status === 'queued') return 'Task is queued. Keep this screen open to track transitions.';
  if (task.status === 'running') return 'Task is running. You can refresh or cancel from quick actions.';
  if (task.status === 'failed') return 'Task failed. Review error details, adjust command, then retry.';
  if (task.status === 'canceled') return 'Task canceled. You can restart with the same command.';
  if (task.status === 'succeeded') return 'Task completed successfully. Review summary and raw result payload.';
  return 'Task state updated.';
}

export default function TaskScreen(props: TaskScreenProps): JSX.Element {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [command, setCommand] = useState<string>('aih ls');
  const [sessionId, setSessionId] = useState<string>('');
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [resultText, setResultText] = useState<string>('');
  const [resultSummary, setResultSummary] = useState<string>('');
  const [escalationText, setEscalationText] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isRetryingTask, setIsRetryingTask] = useState<boolean>(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState<boolean>(false);
  const [isPreparingEscalation, setIsPreparingEscalation] = useState<boolean>(false);
  const [watchStatus, setWatchStatus] = useState<string>('No active task.');
  const [statusHistory, setStatusHistory] = useState<string[]>([]);
  const watchStopRef = useRef<(() => void) | null>(null);
  const lastStatusRef = useRef<string>('');

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
  const hasFailure = useMemo(() => Boolean(errorText || task?.error || task?.status === 'failed'), [errorText, task]);
  const guidanceText = useMemo(() => buildGuidance(task, errorText), [task, errorText]);

  const stopWatch = (): void => {
    if (watchStopRef.current) {
      watchStopRef.current();
      watchStopRef.current = null;
    }
  };

  const appendStatusHistory = (nextTask: TaskSnapshot): void => {
    if (lastStatusRef.current === nextTask.status) return;
    lastStatusRef.current = nextTask.status;
    setStatusHistory((prev) => [`${new Date().toLocaleTimeString()}  ${nextTask.status}`, ...prev].slice(0, 8));
  };

  const beginWatch = (taskId: string): void => {
    stopWatch();

    const controller = props.daemonClient.watchTask(taskId, {
      pollIntervalMs: 1_250,
      onUpdate: (nextTask) => {
        setTask(nextTask);
        appendStatusHistory(nextTask);
        setWatchStatus(`Tracking ${nextTask.taskId} (${nextTask.status})`);
        if (isTerminalStatus(nextTask.status)) {
          setResultSummary(summarizeResult(nextTask.result));
          setResultText(prettyJson(nextTask.result));
          setWatchStatus(`Task ${nextTask.taskId} completed (${nextTask.status}).`);
          stopWatch();
          scrollViewRef.current?.scrollToEnd({ animated: true });
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
    setWatchStatus('Starting task...');
    setErrorText('');
    setResultText('');
    setResultSummary('');
    setEscalationText('');
    setStatusHistory([]);
    lastStatusRef.current = '';
    try {
      const created = await props.daemonClient.startTask({
        command: command.trim(),
        sessionId: sessionId.trim() || undefined
      });
      setTask(created);
      setStatusHistory([`${new Date().toLocaleTimeString()}  ${created.status}`]);
      lastStatusRef.current = created.status;
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
      appendStatusHistory(fresh);
      setWatchStatus(`Tracking ${fresh.taskId} (${fresh.status})`);
      if (isTerminalStatus(fresh.status)) {
        setResultSummary(summarizeResult(fresh.result));
        setResultText(prettyJson(fresh.result));
        stopWatch();
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    } catch (error) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  };

  const cancelTask = async (): Promise<void> => {
    if (!task || !canCancel) return;
    setErrorText('');
    try {
      await props.daemonClient.cancelTask(task.taskId);
      await refreshStatus();
    } catch (error) {
      setErrorText(toErrorMessage(error));
    }
  };

  const retryTask = async (): Promise<void> => {
    if (isRetryingTask || !command.trim()) return;
    setIsRetryingTask(true);
    try {
      await startTask();
    } finally {
      setIsRetryingTask(false);
    }
  };

  const retryConnection = async (): Promise<void> => {
    if (isRetryingConnection) return;
    setIsRetryingConnection(true);
    setErrorText('');
    try {
      await props.reconnectManager.retryNow();
      await connectSession();
      setWatchStatus('Connection recovered. You can retry the task now.');
    } catch (error) {
      setErrorText(toErrorMessage(error));
    } finally {
      setIsRetryingConnection(false);
    }
  };

  const prepareEscalation = async (): Promise<void> => {
    if (isPreparingEscalation) return;
    setIsPreparingEscalation(true);
    try {
      const lines = [
        `Task ID: ${task?.taskId || 'not-started'}`,
        `Session ID: ${task?.sessionId || sessionId.trim() || 'unknown'}`,
        `Status: ${task?.status || 'unknown'}`,
        `Command: ${command.trim() || 'n/a'}`,
        `Runtime Error: ${errorText || task?.error || 'none'}`,
        `Watch Status: ${watchStatus}`,
        `Updated At: ${task?.updatedAt || new Date().toISOString()}`,
        '',
        'Result Summary:',
        resultSummary || 'n/a'
      ];
      setEscalationText(lines.join('\n'));
    } finally {
      setIsPreparingEscalation(false);
    }
  };

  return (
    <ScrollView ref={scrollViewRef} style={styles.page} contentContainerStyle={styles.content}>
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
        <Pressable
          accessibilityRole="button"
          onPress={() => void startTask()}
          disabled={!canStart}
          style={({ pressed }) => [styles.startButton, (!canStart || pressed) && styles.startButtonDisabled]}
        >
          <Text style={styles.startButtonText}>{isStarting ? 'Starting task...' : 'Start Task'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Live Status</Text>
        <Text style={styles.statusText}>{task ? `${task.taskId} • ${task.status}` : 'No task created yet.'}</Text>
        {typeof task?.progress === 'number' ? <Text style={styles.metaText}>Progress: {Math.max(0, Math.min(100, Math.round(task.progress)))}%</Text> : null}
        {task?.message ? <Text style={styles.metaText}>{task.message}</Text> : null}
        {task?.error ? <Text style={styles.errorText}>{task.error}</Text> : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        <Text style={styles.guidanceText}>{guidanceText}</Text>
        {hasFailure ? (
          <View style={styles.failureActionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryTask()}
              disabled={isRetryingTask || !command.trim()}
              style={({ pressed }) => [
                styles.inlineActionButton,
                styles.retryTaskButton,
                (isRetryingTask || !command.trim() || pressed) && styles.inlineActionButtonDisabled
              ]}
            >
              <Text style={styles.inlineActionText}>{isRetryingTask ? 'Retrying...' : 'Retry Task'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryConnection()}
              disabled={isRetryingConnection}
              style={({ pressed }) => [
                styles.inlineActionButton,
                styles.retryConnectionButton,
                (isRetryingConnection || pressed) && styles.inlineActionButtonDisabled
              ]}
            >
              <Text style={styles.inlineActionText}>{isRetryingConnection ? 'Reconnecting...' : 'Retry Connection'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void prepareEscalation()}
              disabled={isPreparingEscalation}
              style={({ pressed }) => [
                styles.inlineActionButton,
                styles.escalateButton,
                (isPreparingEscalation || pressed) && styles.inlineActionButtonDisabled
              ]}
            >
              <Text style={styles.inlineActionText}>{isPreparingEscalation ? 'Preparing...' : 'Escalate'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Lifecycle</Text>
        {statusHistory.length === 0 ? (
          <Text style={styles.metaText}>No transitions yet.</Text>
        ) : (
          statusHistory.map((entry, index) => (
            <Text key={`${entry}-${index}`} style={styles.timelineText}>
              {entry}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Result Summary</Text>
        <Text style={styles.resultSummaryText}>{resultSummary || 'Task summary will appear after completion.'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Raw Result</Text>
        <Text style={styles.resultText}>{resultText || 'Task result will appear here when available.'}</Text>
      </View>

      {escalationText ? (
        <View style={styles.card}>
          <Text style={styles.label}>Escalation Notes</Text>
          <Text style={styles.resultText}>{escalationText}</Text>
        </View>
      ) : null}
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
  startButton: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center'
  },
  startButtonDisabled: {
    opacity: 0.6
  },
  startButtonText: {
    color: '#eff6ff',
    fontSize: 14,
    fontWeight: '700'
  },
  timelineText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontFamily: 'Menlo'
  },
  guidanceText: {
    color: '#fbbf24',
    fontSize: 12
  },
  resultSummaryText: {
    color: '#dbeafe',
    fontSize: 12,
    lineHeight: 18
  },
  failureActionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  inlineActionButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 100,
    alignItems: 'center'
  },
  inlineActionButtonDisabled: {
    opacity: 0.6
  },
  retryTaskButton: {
    backgroundColor: '#2563eb'
  },
  retryConnectionButton: {
    backgroundColor: '#0f766e'
  },
  escalateButton: {
    backgroundColor: '#7c2d12'
  },
  inlineActionText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700'
  }
});

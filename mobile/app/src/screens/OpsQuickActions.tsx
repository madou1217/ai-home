import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface OpsQuickActionsProps {
  onRefreshStatus: () => Promise<void> | void;
  onRetryConnection: () => Promise<void> | void;
  onCancelTask?: () => Promise<void> | void;
  cancelDisabled?: boolean;
  onSwitchAccount?: (nextAccount: string) => Promise<void> | void;
  accounts?: string[];
  initialAccount?: string;
}

type ActionKind = 'retry' | 'stop' | 'switch' | null;
const ACTION_TIMEOUT_MS = 12000;

function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function uniqueAccounts(accounts?: string[]): string[] {
  const candidates = (accounts ?? []).map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(candidates));
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error(`Timed out after ${Math.floor(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}

export default function OpsQuickActions(props: OpsQuickActionsProps): JSX.Element {
  const accountOptions = useMemo(() => {
    const values = uniqueAccounts(props.accounts);
    return values.length > 0 ? values : ['default', 'backup'];
  }, [props.accounts]);

  const initialAccount = props.initialAccount && accountOptions.includes(props.initialAccount)
    ? props.initialAccount
    : accountOptions[0];

  const [activeAccount, setActiveAccount] = useState<string>(initialAccount);
  const [pendingAction, setPendingAction] = useState<ActionKind>(null);
  const [lastMessage, setLastMessage] = useState<string>('Ready.');

  const canStop = Boolean(props.onCancelTask) && !props.cancelDisabled;
  const canSwitch = Boolean(props.onSwitchAccount) && accountOptions.length > 1;

  useEffect(() => {
    if (!accountOptions.includes(activeAccount)) {
      setActiveAccount(accountOptions[0]);
    }
  }, [accountOptions, activeAccount]);

  const refreshStatusSafely = async (): Promise<void> => {
    await withTimeout(Promise.resolve(props.onRefreshStatus()), ACTION_TIMEOUT_MS);
  };

  const runAction = async (
    action: Exclude<ActionKind, null>,
    execute: () => Promise<string | void> | string | void
  ): Promise<void> => {
    if (pendingAction) return;
    try {
      setPendingAction(action);
      const result = await withTimeout(Promise.resolve(execute()), ACTION_TIMEOUT_MS);
      if (typeof result === 'string' && result.trim()) {
        setLastMessage(result);
      } else {
        setLastMessage(`${action.toUpperCase()} completed.`);
      }
    } catch (error) {
      setLastMessage(`${action.toUpperCase()} failed: ${toErrorMessage(error)}`);
      await refreshStatusSafely().catch(() => {});
    } finally {
      setPendingAction(null);
    }
  };

  const retryNow = async (): Promise<void> => {
    await withTimeout(Promise.resolve(props.onRetryConnection()), ACTION_TIMEOUT_MS);
    await refreshStatusSafely();
  };

  const stopNow = async (): Promise<void> => {
    if (!props.onCancelTask || !canStop) return;
    await withTimeout(Promise.resolve(props.onCancelTask()), ACTION_TIMEOUT_MS);
    await refreshStatusSafely();
  };

  const switchAccountNow = async (): Promise<string | void> => {
    if (!props.onSwitchAccount || !canSwitch || accountOptions.length === 0) return;

    const currentIndex = accountOptions.findIndex((item) => item === activeAccount);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextAccount = accountOptions[(safeIndex + 1) % accountOptions.length];

    setActiveAccount(nextAccount);
    await withTimeout(Promise.resolve(props.onSwitchAccount(nextAccount)), ACTION_TIMEOUT_MS);
    await refreshStatusSafely();
    return `Switched to account: ${nextAccount}`;
  };

  const controlsDisabled = pendingAction !== null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick Actions</Text>
      <Text style={styles.metaText}>Active account: {activeAccount}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => void runAction('retry', retryNow)}
          style={[styles.button, styles.retryButton, controlsDisabled && styles.buttonDisabled]}
          disabled={controlsDisabled}
        >
          <Text style={styles.buttonText}>{pendingAction === 'retry' ? 'Retrying...' : 'Retry'}</Text>
        </Pressable>

        <Pressable
          onPress={() => void runAction('stop', stopNow)}
          style={[styles.button, styles.stopButton, (!canStop || controlsDisabled) && styles.buttonDisabled]}
          disabled={!canStop || controlsDisabled}
        >
          <Text style={styles.buttonText}>{pendingAction === 'stop' ? 'Stopping...' : 'Stop'}</Text>
        </Pressable>

        <Pressable
          onPress={() => void runAction('switch', switchAccountNow)}
          style={[styles.button, styles.switchButton, (!canSwitch || controlsDisabled) && styles.buttonDisabled]}
          disabled={!canSwitch || controlsDisabled}
        >
          <Text style={styles.buttonText}>{pendingAction === 'switch' ? 'Switching...' : 'Switch Account'}</Text>
        </Pressable>
      </View>
      <Text style={styles.message}>{lastMessage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  title: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600'
  },
  metaText: {
    color: '#9ca3af',
    fontSize: 12
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  button: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 96,
    alignItems: 'center'
  },
  retryButton: {
    backgroundColor: '#2563eb'
  },
  stopButton: {
    backgroundColor: '#b91c1c'
  },
  switchButton: {
    backgroundColor: '#0f766e'
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonText: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600'
  },
  message: {
    color: '#9ca3af',
    fontSize: 12
  }
});

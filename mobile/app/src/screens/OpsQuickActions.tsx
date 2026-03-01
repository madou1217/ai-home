import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface OpsQuickActionsProps {
  onRefreshStatus: () => Promise<void> | void;
  onRetryConnection: () => Promise<void> | void;
  onCancelTask?: () => Promise<void> | void;
  cancelDisabled?: boolean;
}

type ActionKind = 'refresh' | 'retry' | 'cancel' | null;

function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export default function OpsQuickActions(props: OpsQuickActionsProps): JSX.Element {
  const [pendingAction, setPendingAction] = useState<ActionKind>(null);
  const [lastMessage, setLastMessage] = useState<string>('No action executed yet.');

  const actions = useMemo(
    () => [
      { key: 'refresh' as const, label: 'Refresh Status', onPress: props.onRefreshStatus },
      { key: 'retry' as const, label: 'Retry Connection', onPress: props.onRetryConnection },
      { key: 'cancel' as const, label: 'Cancel Task', onPress: props.onCancelTask, disabled: props.cancelDisabled }
    ],
    [props]
  );

  const runAction = async (
    action: Exclude<ActionKind, null>,
    execute?: () => Promise<void> | void
  ): Promise<void> => {
    if (!execute || pendingAction) return;
    try {
      setPendingAction(action);
      await execute();
      setLastMessage(`${action.toUpperCase()} completed.`);
    } catch (error) {
      setLastMessage(`${action.toUpperCase()} failed: ${toErrorMessage(error)}`);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ops Quick Actions</Text>
      <View style={styles.row}>
        {actions.map((action) => {
          if (!action.onPress) return null;
          const disabled = Boolean(action.disabled) || pendingAction !== null;
          const isPending = pendingAction === action.key;
          return (
            <Pressable
              key={action.key}
              onPress={() => void runAction(action.key, action.onPress)}
              style={[styles.button, disabled && styles.buttonDisabled]}
              disabled={disabled}
            >
              <Text style={styles.buttonText}>{isPending ? 'Working...' : action.label}</Text>
            </Pressable>
          );
        })}
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
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


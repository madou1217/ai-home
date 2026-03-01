import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ReconnectManager, ReconnectSnapshot } from '../services/reconnectManager';
import { PushNotifications } from '../services/pushNotifications';

export interface SessionScreenProps {
  reconnectManager: ReconnectManager;
  connectSession: () => Promise<void>;
  pushNotifications: PushNotifications;
}

function statusColor(state: ReconnectSnapshot['state']): string {
  if (state === 'connected') return '#22c55e';
  if (state === 'offline') return '#ef4444';
  if (state === 'reconnecting' || state === 'connecting') return '#f59e0b';
  return '#94a3b8';
}

function statusLabel(state: ReconnectSnapshot['state']): string {
  if (state === 'connected') return 'Connected';
  if (state === 'offline') return 'Offline';
  if (state === 'reconnecting') return 'Reconnecting';
  if (state === 'connecting') return 'Connecting';
  return 'Idle';
}

export default function SessionScreen(props: SessionScreenProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<ReconnectSnapshot>(props.reconnectManager.getSnapshot());
  const [lastAction, setLastAction] = useState<string>('Session idle.');
  const previousStateRef = useRef<ReconnectSnapshot['state']>(snapshot.state);

  useEffect(() => {
    const unsubscribe = props.reconnectManager.subscribe((next) => {
      setSnapshot(next);
    });
    props.reconnectManager.start(props.connectSession);
    return () => {
      unsubscribe();
      props.reconnectManager.stop();
    };
  }, [props.reconnectManager, props.connectSession]);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (snapshot.state === 'reconnecting' && snapshot.nextRetryAt) {
      void props.pushNotifications.notifyReconnectScheduled(snapshot);
    }
    if (snapshot.state === 'connected' && previous !== 'connected') {
      void props.pushNotifications.notifyReconnected();
    }
    if (snapshot.state === 'offline' && previous !== 'offline') {
      void props.pushNotifications.notifyOffline(snapshot);
    }
    previousStateRef.current = snapshot.state;
  }, [snapshot, props.pushNotifications]);

  const subtitle = useMemo(() => {
    if (snapshot.state === 'reconnecting' && snapshot.nextRetryAt) {
      return `Next retry at ${new Date(snapshot.nextRetryAt).toLocaleTimeString()}`;
    }
    if (snapshot.reason) return `Reason: ${snapshot.reason}`;
    if (snapshot.state === 'connected') return 'Connection healthy.';
    if (snapshot.state === 'connecting') return 'Establishing secure link...';
    if (snapshot.state === 'idle') return 'Waiting for session start.';
    return 'Monitoring connection state.';
  }, [snapshot]);

  const reconnectNow = (): void => {
    setLastAction('Manual reconnect requested.');
    props.reconnectManager.retryNow();
  };

  const simulateDisconnect = (): void => {
    setLastAction('Connection loss simulated.');
    props.reconnectManager.notifyConnectionLost('manual_disconnect');
  };

  const lastUpdatedText = useMemo(() => {
    return new Date(snapshot.updatedAt).toLocaleTimeString();
  }, [snapshot.updatedAt]);

  const nextRetryText = useMemo(() => {
    if (!snapshot.nextRetryAt) return 'Not scheduled';
    return new Date(snapshot.nextRetryAt).toLocaleTimeString();
  }, [snapshot.nextRetryAt]);

  const stateAccent = useMemo(() => statusColor(snapshot.state), [snapshot.state]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Mobile Command Center</Text>
        <Text style={styles.title}>Session</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: stateAccent }]} />
          <Text style={styles.statusText}>{statusLabel(snapshot.state)}</Text>
          <Text style={styles.attemptText}>Attempt {snapshot.attempt}</Text>
        </View>
        <Text style={styles.subText}>{subtitle}</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Updated</Text>
            <Text style={styles.metaValue}>{lastUpdatedText}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Next Retry</Text>
            <Text style={styles.metaValue}>{nextRetryText}</Text>
          </View>
        </View>
        {!!snapshot.reason && (
          <View style={styles.reasonPill}>
            <Text style={styles.reasonText}>Reason: {snapshot.reason}</Text>
          </View>
        )}
      </View>

      <View style={styles.actionPanel}>
        <Text style={styles.actionTitle}>Quick Actions</Text>
        <View style={styles.actions}>
          <Pressable style={styles.buttonPrimary} onPress={reconnectNow}>
            <Text style={styles.buttonText}>Reconnect Now</Text>
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={simulateDisconnect}>
            <Text style={styles.buttonText}>Simulate Disconnect</Text>
          </Pressable>
          <Pressable style={styles.buttonGhost} onPress={reconnectNow}>
            <Text style={styles.buttonGhostText}>Refresh Session</Text>
          </Pressable>
          <Pressable style={styles.buttonGhost} onPress={simulateDisconnect}>
            <Text style={styles.buttonGhostText}>Force Retry Flow</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.timelineCard}>
        <Text style={styles.timelineTitle}>Recent Action</Text>
        <Text style={styles.actionText}>{lastAction}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#071021'
  },
  screenContent: {
    padding: 14,
    gap: 12
  },
  header: {
    gap: 2
  },
  headerEyebrow: {
    color: '#60a5fa',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '700'
  },
  title: {
    color: '#f1f5f9',
    fontSize: 22,
    fontWeight: '800'
  },
  statusCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  statusText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800'
  },
  attemptText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  subText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 8
  },
  metaItem: {
    flex: 1,
    backgroundColor: '#111b30',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2
  },
  metaLabel: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  metaValue: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600'
  },
  reasonPill: {
    backgroundColor: '#3f1d1d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  reasonText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '600'
  },
  actionPanel: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  actionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 140
  },
  buttonSecondary: {
    backgroundColor: '#475569',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 140
  },
  buttonGhost: {
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 140
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  buttonGhostText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center'
  },
  timelineCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    gap: 6
  },
  timelineTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700'
  },
  actionText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18
  }
});

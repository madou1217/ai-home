import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
    return 'Connection healthy.';
  }, [snapshot]);

  const reconnectNow = async (): Promise<void> => {
    setLastAction('Manual reconnect requested.');
    props.reconnectManager.retryNow();
  };

  const simulateDisconnect = (): void => {
    setLastAction('Connection loss simulated.');
    props.reconnectManager.notifyConnectionLost('manual_disconnect');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session Channel</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor(snapshot.state) }]} />
        <Text style={styles.statusText}>{snapshot.state.toUpperCase()}</Text>
        <Text style={styles.attemptText}>attempt {snapshot.attempt}</Text>
      </View>
      <Text style={styles.subText}>{subtitle}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.buttonPrimary} onPress={() => void reconnectNow()}>
          <Text style={styles.buttonText}>Reconnect Now</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={simulateDisconnect}>
          <Text style={styles.buttonText}>Simulate Disconnect</Text>
        </Pressable>
      </View>
      <Text style={styles.actionText}>{lastAction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    gap: 8
  },
  title: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  statusText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  attemptText: {
    color: '#94a3b8',
    fontSize: 12
  },
  subText: {
    color: '#cbd5e1',
    fontSize: 12
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  buttonSecondary: {
    backgroundColor: '#475569',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600'
  },
  actionText: {
    color: '#94a3b8',
    fontSize: 12
  }
});


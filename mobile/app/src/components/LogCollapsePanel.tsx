import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface LogCollapsePanelProps {
  title?: string;
  logs: LogEntry[];
  defaultExpanded?: boolean;
  collapsedCount?: number;
}

type LevelStats = Record<LogLevel, number>;

function normalizeCount(value: number | undefined, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return Math.min(3, max);
  }
  return Math.max(1, Math.min(Math.floor(value), max));
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim() || '--';
  }
  return date.toLocaleTimeString();
}

function levelTone(level: LogLevel): { text: string; badge: string; badgeText: string } {
  if (level === 'error') {
    return { text: '#fecaca', badge: '#7f1d1d', badgeText: '#fca5a5' };
  }
  if (level === 'warn') {
    return { text: '#fde68a', badge: '#92400e', badgeText: '#fcd34d' };
  }
  if (level === 'debug') {
    return { text: '#bfdbfe', badge: '#1e3a8a', badgeText: '#93c5fd' };
  }
  return { text: '#d1fae5', badge: '#065f46', badgeText: '#6ee7b7' };
}

function summarizeLevels(logs: LogEntry[]): LevelStats {
  return logs.reduce<LevelStats>(
    (acc, entry) => {
      acc[entry.level] += 1;
      return acc;
    },
    { debug: 0, info: 0, warn: 0, error: 0 }
  );
}

function highestSeverity(stats: LevelStats): LogLevel | null {
  if (stats.error > 0) return 'error';
  if (stats.warn > 0) return 'warn';
  if (stats.info > 0) return 'info';
  if (stats.debug > 0) return 'debug';
  return null;
}

export default function LogCollapsePanel(props: LogCollapsePanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<boolean>(Boolean(props.defaultExpanded));
  const panelTitle = (props.title || 'Runtime Logs').trim() || 'Runtime Logs';
  const levelStats = useMemo(() => summarizeLevels(props.logs), [props.logs]);
  const topSeverity = useMemo(() => highestSeverity(levelStats), [levelStats]);

  const visibleLogs = useMemo(() => {
    if (props.logs.length === 0) return [];
    if (expanded) return props.logs;
    const count = normalizeCount(props.collapsedCount, props.logs.length);
    return props.logs.slice(-count);
  }, [props.logs, props.collapsedCount, expanded]);

  const hiddenCount = Math.max(props.logs.length - visibleLogs.length, 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{panelTitle}</Text>
          <Text style={styles.summary}>
            {props.logs.length === 0
              ? 'No logs yet.'
              : expanded
                ? `Showing all ${props.logs.length} entries.`
                : `Showing latest ${visibleLogs.length} of ${props.logs.length} entries.`}
          </Text>
        </View>

        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse logs' : 'Expand logs'}
          style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
        >
          <Text style={styles.toggleText}>{expanded ? 'Collapse' : 'Expand'}</Text>
        </Pressable>
      </View>

      {hiddenCount > 0 ? <Text style={styles.hiddenHint}>Hidden {hiddenCount} earlier entries.</Text> : null}
      {!expanded && props.logs.length > 0 ? (
        <View style={styles.signalRow}>
          {(['error', 'warn', 'info', 'debug'] as const).map((level) => {
            const count = levelStats[level];
            if (count <= 0) return null;
            const tone = levelTone(level);
            return (
              <View key={level} style={[styles.signalBadge, { borderColor: tone.badge }]}>
                <Text style={[styles.signalLabel, { color: tone.badgeText }]}>{level.toUpperCase()}</Text>
                <Text style={[styles.signalCount, { color: tone.text }]}>{count}</Text>
              </View>
            );
          })}
          {topSeverity ? (
            <Text style={styles.topSeverityText}>
              Highest severity: {topSeverity.toUpperCase()}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.logList}>
        {visibleLogs.length === 0 ? (
          <Text style={styles.emptyText}>Diagnostics will appear after task execution starts.</Text>
        ) : (
          visibleLogs.map((entry, index) => {
            const tone = levelTone(entry.level);
            return (
              <View key={`${entry.timestamp}:${entry.level}:${index}`} style={styles.logRow}>
                <View style={styles.metaRow}>
                  <Text style={styles.timestamp}>{formatTimestamp(entry.timestamp)}</Text>
                  <View style={[styles.levelBadge, { backgroundColor: tone.badge }]}>
                    <Text style={[styles.levelBadgeText, { color: tone.badgeText }]}>{entry.level.toUpperCase()}</Text>
                  </View>
                </View>
                <Text
                  style={[styles.message, styles.messageMono, { color: tone.text }]}
                  numberOfLines={expanded ? undefined : 2}
                  ellipsizeMode="tail"
                >
                  {entry.message.trim() || '--'}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0b1220',
    borderColor: '#1f2937',
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 10
  },
  title: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700'
  },
  summary: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2
  },
  toggleButton: {
    backgroundColor: '#172554',
    borderColor: '#1d4ed8',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  toggleButtonPressed: {
    opacity: 0.75
  },
  toggleText: {
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  hiddenHint: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '600'
  },
  signalRow: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6
  },
  signalBadge: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  signalLabel: {
    fontSize: 10,
    fontWeight: '700'
  },
  signalCount: {
    fontSize: 11,
    fontWeight: '700'
  },
  topSeverityText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600'
  },
  logList: {
    gap: 8
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12
  },
  logRow: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5
  },
  timestamp: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '600'
  },
  levelBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '700'
  },
  message: {
    fontSize: 12,
    lineHeight: 17
  },
  messageMono: {
    fontFamily: 'Menlo'
  }
});

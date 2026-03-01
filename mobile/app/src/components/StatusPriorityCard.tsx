import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type StatusPriorityLevel = 'normal' | 'warning' | 'error';

export interface StatusPriorityDetail {
  label: string;
  value: string;
}

export interface StatusPriorityCardProps {
  title?: string;
  level?: StatusPriorityLevel;
  criticalLabel: string;
  criticalValue: string;
  secondaryDetails?: StatusPriorityDetail[];
  footerNote?: string;
}

function normalizeText(value: string): string {
  const next = value.trim();
  return next.length > 0 ? next : '--';
}

export default function StatusPriorityCard(props: StatusPriorityCardProps): JSX.Element {
  const level = props.level ?? 'normal';
  const title = props.title ?? 'Priority Status';

  const toneStyles = useMemo(() => {
    if (level === 'error') {
      return {
        border: styles.cardErrorBorder,
        badge: styles.badgeError,
        badgeText: styles.badgeTextError,
        criticalText: styles.criticalValueError
      };
    }

    if (level === 'warning') {
      return {
        border: styles.cardWarningBorder,
        badge: styles.badgeWarning,
        badgeText: styles.badgeTextWarning,
        criticalText: styles.criticalValueWarning
      };
    }

    return {
      border: styles.cardNormalBorder,
      badge: styles.badgeNormal,
      badgeText: styles.badgeTextNormal,
      criticalText: styles.criticalValueNormal
    };
  }, [level]);

  return (
    <View style={[styles.card, toneStyles.border]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.badge, toneStyles.badge]}>
          <Text style={[styles.badgeText, toneStyles.badgeText]}>{level.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.criticalBlock}>
        <Text style={styles.criticalLabel}>{normalizeText(props.criticalLabel)}</Text>
        <Text style={[styles.criticalValue, toneStyles.criticalText]}>{normalizeText(props.criticalValue)}</Text>
      </View>

      <View style={styles.secondaryBlock}>
        {(props.secondaryDetails ?? []).map((detail) => (
          <View key={`${detail.label}:${detail.value}`} style={styles.secondaryRow}>
            <Text style={styles.secondaryLabel}>{normalizeText(detail.label)}</Text>
            <Text style={styles.secondaryValue}>{normalizeText(detail.value)}</Text>
          </View>
        ))}
      </View>

      {props.footerNote ? <Text style={styles.footerNote}>{normalizeText(props.footerNote)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10
  },
  cardNormalBorder: {
    borderColor: '#1e3a8a'
  },
  cardWarningBorder: {
    borderColor: '#b45309'
  },
  cardErrorBorder: {
    borderColor: '#b91c1c'
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  title: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700'
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  badgeNormal: {
    backgroundColor: '#1e3a8a22',
    borderColor: '#1d4ed8'
  },
  badgeWarning: {
    backgroundColor: '#b4530922',
    borderColor: '#d97706'
  },
  badgeError: {
    backgroundColor: '#b91c1c22',
    borderColor: '#dc2626'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700'
  },
  badgeTextNormal: {
    color: '#93c5fd'
  },
  badgeTextWarning: {
    color: '#fcd34d'
  },
  badgeTextError: {
    color: '#fca5a5'
  },
  criticalBlock: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  criticalLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  criticalValue: {
    fontSize: 16,
    fontWeight: '800'
  },
  criticalValueNormal: {
    color: '#e2e8f0'
  },
  criticalValueWarning: {
    color: '#fde68a'
  },
  criticalValueError: {
    color: '#fecaca'
  },
  secondaryBlock: {
    gap: 6
  },
  secondaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  secondaryLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  secondaryValue: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 12,
    textAlign: 'right'
  },
  footerNote: {
    color: '#cbd5e1',
    fontSize: 12
  }
});

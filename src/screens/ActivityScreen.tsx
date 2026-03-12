import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { Alert as AlertType, getAlerts, getLogs, LogEntry, markAlertRead } from '../services/api';
import { useAlertContext } from '../contexts/AlertContext';

type Filter = 'all' | 'alerts' | 'access';

type ActivityItem = {
  id: string;
  kind: 'alert' | 'log';
  timestamp: string;
  title: string;
  subtitle: string;
  read?: boolean;
  alertId?: number;
  icon: string;
  accent: string;
  chipBg: string;
  chipLabel: string;
  confidence?: number | null;
};

const LOG_CFG: Record<LogEntry['type'], { icon: string; accent: string; chipBg: string; chipLabel: string }> = {
  authorized: { icon: '✓', accent: Colors.green, chipBg: Colors.greenDim, chipLabel: 'AUTHORIZED' },
  unknown: { icon: '?', accent: Colors.red, chipBg: Colors.redDim, chipLabel: 'UNKNOWN' },
  motion: { icon: '〰', accent: Colors.accent, chipBg: Colors.accentDim, chipLabel: 'MOTION' },
  manual_lock: { icon: '🔒', accent: Colors.textMid, chipBg: Colors.surfaceHigh, chipLabel: 'MANUAL' },
};

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = d.toDateString() === now.toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ActivityScreen() {
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const { setUnreadCount } = useAlertContext();

  const load = useCallback(async () => {
    const [alertData, logData] = await Promise.all([getAlerts(), getLogs(100)]);
    setAlerts(alertData);
    setLogs(logData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unread = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  useEffect(() => {
    setUnreadCount(unread);
  }, [unread, setUnreadCount]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const items = useMemo<ActivityItem[]>(() => {
    const alertItems = alerts.map((a) => ({
      id: `alert-${a.id}`,
      kind: 'alert' as const,
      timestamp: a.timestamp,
      title: a.label,
      subtitle: fmtTimestamp(a.timestamp),
      read: a.read,
      alertId: a.id,
      icon: a.label.toLowerCase().includes('face') ? '👤' : '⚠',
      accent: a.read ? Colors.textDim : Colors.red,
      chipBg: a.read ? Colors.surfaceHigh : Colors.redDim,
      chipLabel: a.read ? 'READ' : 'UNREAD',
    }));

    const logItems = logs.map((l) => ({
      id: `log-${l.id}`,
      kind: 'log' as const,
      timestamp: l.timestamp,
      title: l.name,
      subtitle: fmtTimestamp(l.timestamp),
      icon: LOG_CFG[l.type].icon,
      accent: LOG_CFG[l.type].accent,
      chipBg: LOG_CFG[l.type].chipBg,
      chipLabel: LOG_CFG[l.type].chipLabel,
      confidence: l.confidence,
    }));

    const merged = [...alertItems, ...logItems];
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return merged;
  }, [alerts, logs]);

  const filtered = useMemo(() => {
    if (filter === 'alerts') return items.filter((i) => i.kind === 'alert');
    if (filter === 'access') return items.filter((i) => i.kind === 'log');
    return items;
  }, [filter, items]);

  const readAlert = async (item: ActivityItem) => {
    if (item.kind !== 'alert' || item.read || !item.alertId) return;
    await markAlertRead(item.alertId);
    setAlerts((prev) => prev.map((a) => (a.id === item.alertId ? { ...a, read: true } : a)));
  };

  const markAllAlertsRead = async () => {
    const unreadAlerts = alerts.filter((a) => !a.read);
    await Promise.all(unreadAlerts.map((a) => markAlertRead(a.id)));
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Security</Text>
          <Text style={styles.title}>Activity</Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllAlertsRead}>
            <Text style={styles.markAllText}>Mark Alerts Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {unread > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{unread} unread security alert{unread > 1 ? 's' : ''}</Text>
            <Text style={styles.bannerSub}>Tap an unread alert row to mark it as read.</Text>
          </View>
        </View>
      )}

      <View style={styles.filterRow}>
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'alerts' as const, label: 'Alerts' },
          { key: 'access' as const, label: 'Access' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && <Text style={styles.empty}>No activity found.</Text>}

      {filtered.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.row, item.kind === 'alert' && !item.read && styles.rowUnread]}
          onPress={() => void readAlert(item)}
          activeOpacity={item.kind === 'alert' && !item.read ? 0.7 : 1}
          disabled={item.kind !== 'alert' || item.read}
        >
          <View style={[styles.iconBox, { backgroundColor: item.chipBg }]}>
            <Text style={[styles.iconText, { color: item.accent }]}>{item.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, item.kind === 'alert' && !item.read && styles.rowTitleUnread]}>{item.title}</Text>
            <Text style={styles.rowSub}>{item.subtitle}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.pill, { backgroundColor: item.chipBg }]}>
              <Text style={[styles.pillText, { color: item.accent }]}>{item.chipLabel}</Text>
            </View>
            {item.confidence !== undefined && item.confidence !== null && (
              <Text style={styles.confidence}>{Math.round(item.confidence * 100)}%</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  container: { padding: Spacing.xxl, paddingBottom: 40, gap: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { ...Typography.sectionLabel, marginBottom: 4 },
  title: { ...Typography.screenTitle },
  markAllBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  markAllText: { fontSize: 12, color: Colors.textMid, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.redDim,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,77,109,0.35)',
    padding: Spacing.md,
  },
  bannerIcon: { fontSize: 20 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.red },
  bannerSub: { fontSize: 11, color: Colors.textMid, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accentDim },
  filterText: { fontSize: 12, fontWeight: '700', color: Colors.textMid },
  filterTextActive: { color: Colors.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  rowUnread: { borderColor: 'rgba(255,77,109,0.35)' },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontWeight: '800', fontSize: 14 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMid },
  rowTitleUnread: { color: Colors.text },
  rowSub: { fontSize: 11, color: Colors.textDim, marginTop: 2 },
  pill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { ...Typography.badge },
  confidence: { fontSize: 11, color: Colors.textDim, fontWeight: '700' },
  empty: { color: Colors.textDim, textAlign: 'center', marginTop: 50 },
});

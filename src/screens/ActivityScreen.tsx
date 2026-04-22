/**
 * Activity — unified timeline of access logs and security alerts.
 * Filterable by type, with mark-all-read for unread alerts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../theme';
import { Alert as AlertType, getAlerts, getLogs, getSnapshotUrl, LogEntry, markAlertRead } from '../services/api';
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
  logId?: number;
  icon: string;
  color: string;
  chipLabel: string;
  confidence?: number | null;
  hasSnapshot?: boolean;
};

const LOG_STYLES: Record<string, { icon: string; color: string; chipLabel: string }> = {
  authorized:  { icon: '✓', color: Colors.green,         chipLabel: 'Authorized' },
  unknown:     { icon: '!', color: Colors.red,            chipLabel: 'Unknown'    },
  motion:      { icon: '~', color: Colors.accent,         chipLabel: 'Motion'     },
  manual_lock: { icon: '⏣', color: Colors.textSecondary, chipLabel: 'Manual'     },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = d.toDateString() === now.toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ActivityScreen() {
  const [alerts, setAlerts]       = useState<AlertType[]>([]);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<Filter>('all');
  const { setUnreadCount }        = useAlertContext();
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);

  const openSnapshot = async (logId: number) => {
    const url = await getSnapshotUrl(logId);
    setSnapshotUri(url);
  };

  const load = useCallback(async () => {
    const [alertData, logData] = await Promise.all([getAlerts(), getLogs(100)]);
    setAlerts(alertData);
    setLogs(logData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);

  useEffect(() => { setUnreadCount(unread); }, [unread, setUnreadCount]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const items = useMemo<ActivityItem[]>(() => {
    const alertItems: ActivityItem[] = alerts.map(a => ({
      id: `alert-${a.id}`,
      kind: 'alert',
      timestamp: a.timestamp,
      title: a.label,
      subtitle: fmtTime(a.timestamp),
      read: a.read,
      alertId: a.id,
      icon: '!',
      color: a.read ? Colors.textTertiary : Colors.red,
      chipLabel: a.read ? 'Read' : 'Unread',
    }));

    const logItems: ActivityItem[] = logs.map(l => {
      const cfg = LOG_STYLES[l.type] || LOG_STYLES.motion;
      return {
        id: `log-${l.id}`,
        kind: 'log',
        logId: l.id,
        timestamp: l.timestamp,
        title: l.name || cfg.chipLabel,
        subtitle: fmtTime(l.timestamp),
        icon: cfg.icon,
        color: cfg.color,
        chipLabel: cfg.chipLabel,
        confidence: l.confidence,
        hasSnapshot: l.hasSnapshot,
      };
    });

    const merged = [...alertItems, ...logItems];
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return merged;
  }, [alerts, logs]);

  const filtered = useMemo(() => {
    if (filter === 'alerts') return items.filter(i => i.kind === 'alert');
    if (filter === 'access') return items.filter(i => i.kind === 'log');
    return items;
  }, [filter, items]);

  const readAlert = async (item: ActivityItem) => {
    if (item.kind !== 'alert' || item.read || !item.alertId) return;
    await markAlertRead(item.alertId);
    setAlerts(prev => prev.map(a => (a.id === item.alertId ? { ...a, read: true } : a)));
  };

  const markAllAlertsRead = async () => {
    const unreadAlerts = alerts.filter(a => !a.read);
    await Promise.all(unreadAlerts.map(a => markAlertRead(a.id)));
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {unread > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllAlertsRead}>
            <Text style={styles.markAllText}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alert banner */}
      {unread > 0 && (
        <View style={styles.alertBanner}>
          <View style={styles.alertBannerDot} />
          <Text style={styles.alertBannerText}>
            {unread} unread alert{unread > 1 ? 's' : ''} — tap to dismiss
          </Text>
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {([
          { key: 'all' as const,    label: 'All' },
          { key: 'alerts' as const, label: 'Alerts' },
          { key: 'access' as const, label: 'Access' },
        ]).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No activity found</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {filtered.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.timelineRow,
                i < filtered.length - 1 && styles.timelineRowBorder,
                item.kind === 'alert' && !item.read && styles.timelineRowHighlight,
              ]}
              onPress={() => void readAlert(item)}
              activeOpacity={item.kind === 'alert' && !item.read ? 0.7 : 1}
              disabled={item.kind !== 'alert' || !!item.read}
            >
              <View style={[styles.timelineDot, { backgroundColor: `${item.color}20` }]}>
                <Text style={[styles.timelineDotText, { color: item.color }]}>{item.icon}</Text>
              </View>
              <View style={styles.timelineContent}>
                <Text style={[
                  styles.timelineTitle,
                  item.kind === 'alert' && !item.read && { color: Colors.text },
                ]}>
                  {item.title}
                </Text>
                <Text style={styles.timelineSub}>{item.subtitle}</Text>
              </View>
              <View style={styles.timelineRight}>
                <View style={[styles.chipPill, { backgroundColor: `${item.color}15` }]}>
                  <Text style={[styles.chipPillText, { color: item.color }]}>{item.chipLabel}</Text>
                </View>
                {item.confidence != null && (
                  <Text style={styles.confidenceText}>{Math.round(item.confidence * 100)}%</Text>
                )}
                {item.hasSnapshot && item.logId && (
                  <TouchableOpacity
                    style={styles.snapshotBtn}
                    onPress={() => openSnapshot(item.logId!)}
                  >
                    <Text style={styles.snapshotBtnText}>View</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {/* Snapshot viewer modal */}
      <Modal visible={!!snapshotUri} transparent animationType="fade" onRequestClose={() => setSnapshotUri(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Event Snapshot</Text>
            {snapshotUri && (
              <Image source={{ uri: snapshotUri }} style={styles.snapshotImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setSnapshotUri(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title:        { ...Typography.largeTitle },
  markAllBtn:   { backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full },
  markAllText:  { fontSize: 13, fontWeight: '600', color: Colors.accent },

  alertBanner:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.redSoft, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginBottom: Spacing.lg },
  alertBannerDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red },
  alertBannerText: { fontSize: 13, fontWeight: '600', color: Colors.red },

  filterRow:           { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  filterChip:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface },
  filterChipActive:    { backgroundColor: Colors.accent },
  filterChipText:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive:{ color: '#fff' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText:  { ...Typography.footnote },

  timeline:            { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  timelineRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  timelineRowBorder:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  timelineRowHighlight:{ backgroundColor: `${Colors.red}08` },

  timelineDot:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timelineDotText: { fontSize: 16, fontWeight: '800' },
  timelineContent: { flex: 1 },
  timelineTitle:   { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  timelineSub:     { fontSize: 12, color: Colors.textTertiary, marginTop: 1 },
  timelineRight:   { alignItems: 'flex-end', gap: 4 },
  chipPill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  chipPillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  confidenceText:  { fontSize: 11, fontWeight: '600', color: Colors.textTertiary },

  snapshotBtn:     { backgroundColor: Colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs, marginTop: 2 },
  snapshotBtnText: { fontSize: 10, fontWeight: '700', color: Colors.accent },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  modalContent:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 400, alignItems: 'center', gap: Spacing.md },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: Colors.text },
  snapshotImage: { width: '100%', height: 260, borderRadius: Radius.lg, backgroundColor: Colors.elevated },
  modalClose:    { backgroundColor: Colors.elevated, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.sm },
  modalCloseText:{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
});

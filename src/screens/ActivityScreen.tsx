/**
 * Activity — unified timeline of access logs and security alerts.
 * Filterable by type, with mark-all-read for unread alerts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors, Radius, Spacing, Typography, Shadows } from '../theme';
import { Alert as AlertType, getAlerts, getLogs, getSnapshotUrl, LogEntry, markAlertRead } from '../services/api';
import { useAlertContext } from '../contexts/AlertContext';
import { hapticLight, hapticSuccess } from '../utils/haptics';

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
  authorized:  { icon: 'checkmark-circle', color: Colors.green,         chipLabel: 'Authorized' },
  unknown:     { icon: 'alert-circle',     color: Colors.red,           chipLabel: 'Unknown'    },
  motion:      { icon: 'walk',             color: Colors.accent,        chipLabel: 'Motion'     },
  manual_lock: { icon: 'lock-closed',      color: Colors.textSecondary, chipLabel: 'Manual'     },
  doorbell:    { icon: 'notifications',    color: Colors.amber,         chipLabel: 'Doorbell'   },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = d.toDateString() === now.toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Skeleton shimmer
function Skeleton({ width, height, style }: { width: number | string; height: number; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, easing: Easing.ease, useNativeDriver: true }),
      ]),
    ).start();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });
  return <Animated.View style={[{ width: width as any, height, borderRadius: Radius.sm, backgroundColor: Colors.elevated, opacity }, style]} />;
}

export default function ActivityScreen() {
  const [alerts, setAlerts]       = useState<AlertType[]>([]);
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<Filter>('all');
  const { setUnreadCount }        = useAlertContext();
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const openSnapshot = async (logId: number) => {
    const url = await getSnapshotUrl(logId);
    setSnapshotUri(url);
  };

  const load = useCallback(async () => {
    const [alertData, logData] = await Promise.all([getAlerts(), getLogs(100)]);
    setAlerts(alertData);
    setLogs(logData);
    setInitialLoad(false);
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
      icon: 'warning',
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
    hapticLight();
    await markAlertRead(item.alertId);
    setAlerts(prev => prev.map(a => (a.id === item.alertId ? { ...a, read: true } : a)));
  };

  const markAllAlertsRead = async () => {
    hapticSuccess();
    const unreadAlerts = alerts.filter(a => !a.read);
    await Promise.all(unreadAlerts.map(a => markAlertRead(a.id)));
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const FILTERS = [
    { key: 'all' as const,    label: 'All',    icon: 'list' },
    { key: 'alerts' as const, label: 'Alerts', icon: 'warning' },
    { key: 'access' as const, label: 'Access', icon: 'enter' },
  ];

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
            <Ionicons name="checkmark-done" size={16} color={Colors.accent} style={{ marginRight: 4 }} />
            <Text style={styles.markAllText}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Alert banner */}
      {unread > 0 && (
        <View style={[styles.alertBanner, Shadows.cardSubtle]}>
          <Ionicons name="warning" size={18} color={Colors.red} />
          <Text style={styles.alertBannerText}>
            {unread} unread alert{unread > 1 ? 's' : ''} — tap to dismiss
          </Text>
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => { hapticLight(); setFilter(f.key); }}
          >
            <Ionicons
              name={f.icon}
              size={14}
              color={filter === f.key ? '#fff' : Colors.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Timeline */}
      {initialLoad ? (
        <View style={[styles.timeline, Shadows.cardSubtle]}>
          {[1,2,3,4].map(i => (
            <View key={i} style={[styles.timelineRow, i < 4 && styles.timelineRowBorder]}>
              <Skeleton width={36} height={36} style={{ borderRadius: 10 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width={140} height={14} />
                <Skeleton width={100} height={12} />
              </View>
              <Skeleton width={60} height={18} style={{ borderRadius: Radius.xs }} />
            </View>
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <View style={[styles.emptyState, Shadows.cardSubtle]}>
          <Ionicons name="time-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Activity Found</Text>
          <Text style={styles.emptyText}>
            {filter === 'alerts' ? 'No alerts to show' : filter === 'access' ? 'No access events recorded yet' : 'Activity will appear as people approach your door'}
          </Text>
        </View>
      ) : (
        <View style={[styles.timeline, Shadows.cardSubtle]}>
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
                <Ionicons name={item.icon} size={18} color={item.color} />
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
                    <Ionicons name="image-outline" size={12} color={Colors.accent} style={{ marginRight: 3 }} />
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
          <View style={[styles.modalContent, Shadows.card]}>
            <View style={styles.modalHeader}>
              <Ionicons name="image" size={20} color={Colors.accent} />
              <Text style={styles.modalTitle}>Event Snapshot</Text>
            </View>
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
  markAllBtn:   { backgroundColor: Colors.surface, paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center' },
  markAllText:  { fontSize: 13, fontWeight: '600', color: Colors.accent },

  alertBanner:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.redSoft, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginBottom: Spacing.lg },
  alertBannerText: { fontSize: 13, fontWeight: '600', color: Colors.red },

  filterRow:           { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  filterChip:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center' },
  filterChipActive:    { backgroundColor: Colors.accent },
  filterChipText:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive:{ color: '#fff' },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg },
  emptyTitle: { ...Typography.headline },
  emptyText:  { ...Typography.footnote, textAlign: 'center', paddingHorizontal: Spacing.xxl },

  timeline:            { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  timelineRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  timelineRowBorder:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  timelineRowHighlight:{ backgroundColor: `${Colors.red}08` },

  timelineDot:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timelineContent: { flex: 1 },
  timelineTitle:   { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  timelineSub:     { fontSize: 12, color: Colors.textTertiary, marginTop: 1 },
  timelineRight:   { alignItems: 'flex-end', gap: 4 },
  chipPill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  chipPillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  confidenceText:  { fontSize: 11, fontWeight: '600', color: Colors.textTertiary },

  snapshotBtn:     { backgroundColor: Colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs, marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  snapshotBtnText: { fontSize: 10, fontWeight: '700', color: Colors.accent },
  snapshotImage:   { width: '100%', height: 260, borderRadius: Radius.lg, backgroundColor: Colors.elevated },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  modalContent:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 400, alignItems: 'center', gap: Spacing.md },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalClose:    { backgroundColor: Colors.elevated, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.sm },
  modalCloseText:{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
});

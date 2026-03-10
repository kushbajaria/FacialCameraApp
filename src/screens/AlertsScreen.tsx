import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { getAlerts, markAlertRead, Alert as AlertType } from '../services/api';
import { useAlertContext } from '../contexts/AlertContext';

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const label = d.toDateString() === today.toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${label}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AlertsScreen() {
  const [alerts, setAlerts]     = useState<AlertType[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { setUnreadCount } = useAlertContext();

  const load = useCallback(async () => {
    const data = await getAlerts();
    setAlerts(data);
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const unread = alerts.filter(a => !a.read).length;

  // Update context whenever unread count changes
  useEffect(() => {
    setUnreadCount(unread);
  }, [unread, setUnreadCount]);

  const handleRead = async (id: number) => {
    await markAlertRead(id);
    setAlerts(a => a.map(x => x.id === id ? { ...x, read: true } : x));
  };

  const markAll = async () => {
    await Promise.all(alerts.filter(a => !a.read).map(a => markAlertRead(a.id)));
    setAlerts(a => a.map(x => ({ ...x, read: true })));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Security</Text>
          <Text style={styles.title}>Alerts</Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAll}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unread Banner */}
      {unread > 0 && (
        <View style={styles.banner}>
          <Text style={{ fontSize: 24 }}>🚨</Text>
          <View>
            <Text style={styles.bannerTitle}>{unread} unread alert{unread > 1 ? 's' : ''}</Text>
            <Text style={styles.bannerSub}>Unknown faces were detected at your door</Text>
          </View>
        </View>
      )}

      {/* Alert List */}
      {alerts.map(alert => (
        <TouchableOpacity
          key={alert.id}
          style={[styles.row, !alert.read && styles.rowUnread]}
          onPress={() => handleRead(alert.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconBox, !alert.read ? styles.iconBoxUnread : null]}>
            <Text style={{ fontSize: 18 }}>
              {alert.label.includes('face') ? '👤' : '〰'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertLabel, !alert.read && styles.alertLabelUnread]}>
              {alert.label}
            </Text>
            <Text style={styles.alertTime}>{fmtTimestamp(alert.timestamp)}</Text>
          </View>
          {!alert.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      ))}

      {alerts.length === 0 && (
        <Text style={{ color: Colors.textDim, textAlign: 'center', marginTop: 60, fontSize: 14 }}>
          No alerts yet. You're all clear! ✓
        </Text>
      )}

      {/* Notification Toggle */}
      <View style={styles.notifRow}>
        <View>
          <Text style={styles.notifTitle}>Push Notifications</Text>
          <Text style={styles.notifSub}>Get alerted instantly on motion</Text>
        </View>
        <View style={styles.toggle}>
          <View style={styles.toggleThumb} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:            { flex: 1, backgroundColor: Colors.bg },
  container:         { padding: Spacing.xxl, paddingBottom: 40, gap: Spacing.md },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow:           { ...Typography.sectionLabel, marginBottom: 4 },
  title:             { ...Typography.screenTitle },
  markAllBtn:        { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  markAllText:       { fontSize: 12, color: Colors.textMid, fontWeight: '600' },
  banner:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.redDim, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,77,109,0.3)' },
  bannerTitle:       { fontSize: 14, fontWeight: '700', color: Colors.red },
  bannerSub:         { fontSize: 12, color: Colors.textMid, marginTop: 2 },
  row:               { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border },
  rowUnread:         { borderColor: 'rgba(255,77,109,0.3)' },
  iconBox:           { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  iconBoxUnread:     { backgroundColor: Colors.redDim },
  alertLabel:        { fontSize: 13, fontWeight: '700', color: Colors.textMid, marginBottom: 3 },
  alertLabelUnread:  { color: Colors.text },
  alertTime:         { fontSize: 11, color: Colors.textDim },
  unreadDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red },
  notifRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginTop: 4 },
  notifTitle:        { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  notifSub:          { fontSize: 11, color: Colors.textDim },
  toggle:            { width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.green, justifyContent: 'center', paddingHorizontal: 3, alignItems: 'flex-end' },
  toggleThumb:       { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
});

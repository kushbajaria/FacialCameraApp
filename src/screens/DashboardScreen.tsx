import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { getDoorStatus, lockDoor, unlockDoor, getLogs, LogEntry } from '../services/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const LOG_CFG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  authorized:  { color: Colors.green,   bg: Colors.greenDim,  icon: '✓', label: 'Authorized' },
  unknown:     { color: Colors.red,     bg: Colors.redDim,    icon: '?', label: 'Unknown'    },
  motion:      { color: Colors.accent,  bg: Colors.accentDim, icon: '〰', label: 'Motion'    },
  manual_lock: { color: Colors.textMid, bg: Colors.surfaceHigh, icon: '🔒', label: 'Manual'  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [locked, setLocked]     = useState(true);
  const [toggling, setToggling] = useState(false);
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [status, entries] = await Promise.all([getDoorStatus(), getLogs(4)]);
    setLocked(status.locked);
    setLogs(entries);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleDoor = async () => {
    setToggling(true);
    try {
      locked ? await unlockDoor() : await lockDoor();
      setLocked(l => !l);
      setLastAction(locked ? 'Door unlocked via app' : 'Door locked via app');
    } finally {
      setToggling(false);
    }
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
          <Text style={styles.eyebrow}>Front Door</Text>
          <Text style={styles.title}>Home Access</Text>
        </View>
        <View style={styles.badge}>
          <View style={[styles.dot, { backgroundColor: Colors.green }]} />
          <Text style={styles.badgeText}>ONLINE</Text>
        </View>
      </View>

      {/* Lock Button */}
      <TouchableOpacity
        style={[styles.lockBtn, { borderColor: locked ? `${Colors.green}44` : `${Colors.amber}44` }]}
        onPress={toggleDoor}
        activeOpacity={0.8}
        disabled={toggling}
      >
        <Text style={styles.lockIcon}>{locked ? '🔒' : '🔓'}</Text>
        <Text style={[styles.lockLabel, { color: locked ? Colors.green : Colors.amber }]}>
          {toggling ? '...' : locked ? 'Locked' : 'Unlocked'}
        </Text>
        <Text style={styles.lockHint}>Tap to {locked ? 'unlock' : 'lock'}</Text>
      </TouchableOpacity>

      {lastAction && (
        <View style={styles.actionBanner}>
          <Text style={styles.actionText}>✓ {lastAction}</Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsGrid}>
        {[
          { label: "Today's Entries", value: '7',      sub: '3 members',  color: Colors.accent,  route: 'Logs'    },
          { label: 'Alerts',           value: '2',      sub: 'Unread',     color: Colors.red,     route: 'Alerts'  },
          { label: 'Members',          value: '3',      sub: 'Active',     color: Colors.green,   route: 'Members' },
          { label: 'Last Seen',        value: 'Alex R.', sub: '2 min ago', color: Colors.textMid, route: 'Logs'    },
        ].map(({ label, value, sub, color, route }) => (
          <TouchableOpacity
            key={label}
            style={styles.statCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(route)}
          >
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statSub}>{sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Activity */}
      <Text style={styles.sectionLabel}>Recent Activity</Text>
      {logs.map(log => {
        const cfg = LOG_CFG[log.type] || LOG_CFG.motion;
        return (
          <View key={log.id} style={styles.logRow}>
            <View style={[styles.logIcon, { backgroundColor: cfg.bg }]}>
              <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 13 }}>{cfg.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.logName}>{log.name}</Text>
              <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Text style={styles.logAgo}>{timeAgo(log.timestamp)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: Colors.bg },
  container:    { padding: Spacing.xxl, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl },
  eyebrow:      { ...Typography.sectionLabel, marginBottom: 4 },
  title:        { ...Typography.screenTitle },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  dot:          { width: 7, height: 7, borderRadius: 4 },
  badgeText:    { fontSize: 11, color: Colors.green, fontWeight: '700', letterSpacing: 0.8 },
  lockBtn:      { alignSelf: 'center', width: 160, height: 160, borderRadius: 80, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, marginVertical: Spacing.xl, gap: 6 },
  lockIcon:     { fontSize: 40 },
  lockLabel:    { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  lockHint:     { fontSize: 11, color: Colors.textDim },
  actionBanner: { backgroundColor: Colors.accentDim, borderRadius: Radius.md, padding: 10, alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)' },
  actionText:   { fontSize: 12, color: Colors.accent, fontWeight: '700' },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.xl },
  statCard:     { flex: 1, minWidth: '45%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  statValue:    { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  statLabel:    { fontSize: 12, color: Colors.text, fontWeight: '600' },
  statSub:      { fontSize: 11, color: Colors.textDim, marginTop: 2 },
  sectionLabel: { ...Typography.sectionLabel, marginBottom: Spacing.md },
  logRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  logIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logName:      { fontSize: 13, color: Colors.text, fontWeight: '700' },
  logTime:      { fontSize: 11, color: Colors.textDim, marginTop: 2 },
  logAgo:       { fontSize: 11, color: Colors.textDim },
});

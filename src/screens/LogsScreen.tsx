import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { getLogs, LogEntry } from '../services/api';

type Filter = 'all' | 'authorized' | 'unknown' | 'motion';

const CFG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  authorized:  { color: Colors.green,   bg: Colors.greenDim,    icon: '✓',  label: 'Authorized' },
  unknown:     { color: Colors.red,     bg: Colors.redDim,      icon: '?',  label: 'Unknown'    },
  motion:      { color: Colors.accent,  bg: Colors.accentDim,   icon: '〰', label: 'Motion'     },
  manual_lock: { color: Colors.textMid, bg: Colors.surfaceHigh, icon: '🔒', label: 'Manual'     },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function LogsScreen() {
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [filter, setFilter]       = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLogs(100);
    setLogs(data);
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all',        label: 'All'        },
    { key: 'authorized', label: 'Authorized' },
    { key: 'unknown',    label: 'Unknown'    },
    { key: 'motion',     label: 'Motion'     },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
    >
      <Text style={styles.eyebrow}>Access</Text>
      <Text style={styles.title}>Event Log</Text>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Log Rows */}
      {filtered.length === 0 && (
        <Text style={{ color: Colors.textDim, textAlign: 'center', marginTop: 40 }}>No events found.</Text>
      )}

      {filtered.map(log => {
        const cfg = CFG[log.type] || CFG.motion;
        return (
          <View key={log.id} style={styles.row}>
            <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.iconText, { color: cfg.color }]}>{cfg.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName}>{log.name}</Text>
                <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.rowDate}>{fmtDate(log.timestamp)}, {fmtTime(log.timestamp)}</Text>
            </View>
            {log.confidence !== null && (
              <Text style={[styles.conf, {
                color: log.confidence > 0.8 ? Colors.green : log.confidence > 0.5 ? Colors.amber : Colors.red
              }]}>
                {Math.round(log.confidence * 100)}%
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:           { flex: 1, backgroundColor: Colors.bg },
  container:        { padding: Spacing.xxl, paddingBottom: 40, gap: Spacing.md },
  eyebrow:          { ...Typography.sectionLabel },
  title:            { ...Typography.screenTitle, marginBottom: 4 },
  filterScroll:     { marginBottom: 4 },
  filterRow:        { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  filterBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  filterBtnActive:  { borderColor: Colors.accent, backgroundColor: Colors.accentDim },
  filterText:       { fontSize: 12, fontWeight: '700', color: Colors.textMid },
  filterTextActive: { color: Colors.accent },
  row:              { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.border },
  iconBox:          { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText:         { fontWeight: '800', fontSize: 14 },
  rowTop:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  rowName:          { fontSize: 13, fontWeight: '700', color: Colors.text },
  pill:             { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  pillText:         { ...Typography.badge },
  rowDate:          { fontSize: 11, color: Colors.textDim },
  conf:             { fontSize: 11, fontWeight: '700', minWidth: 36, textAlign: 'right' },
});

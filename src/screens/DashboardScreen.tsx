/**
 * Home — the main dashboard showing a camera preview, door lock control,
 * quick stats, and recent activity. Designed as the central hub of the app.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  getDoorStatus, lockDoor, unlockDoor,
  getLogs, getStats, pingPi,
  LogEntry, DashboardStats, USE_MOCK,
} from '../services/api';
import { getCameraStreamUrl, getEffectivePiBaseUrl } from '../services/config';

const CARD_PADDING = Spacing.xl;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function mjpegHtml(url: string): string {
  return `<html><body style="margin:0;padding:0;background:#0C0F14;display:flex;align-items:center;justify-content:center;height:100vh">
    <img src="${url}" style="width:100%;height:100%;object-fit:cover"
         onerror="window.ReactNativeWebView.postMessage('error')"/>
  </body></html>`;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  authorized:  { icon: '✓', color: Colors.green,         label: 'Authorized' },
  unknown:     { icon: '!', color: Colors.red,            label: 'Unknown'    },
  motion:      { icon: '~', color: Colors.accent,         label: 'Motion'     },
  manual_lock: { icon: '⏣', color: Colors.textSecondary, label: 'Manual'     },
};

export default function DashboardScreen() {
  const [locked, setLocked]         = useState(true);
  const [toggling, setToggling]     = useState(false);
  const [piOnline, setPiOnline]     = useState(false);
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [stats, setStats]           = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [streamUrl, setStreamUrl]   = useState('');
  const [cameraError, setCameraError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [status, entries, dashStats, online] = await Promise.all([
        getDoorStatus(),
        getLogs(5),
        getStats(),
        pingPi(),
      ]);
      setLocked(status.locked);
      setLogs(entries);
      setStats(dashStats);
      setPiOnline(online);
    } catch {
      setPiOnline(false);
    }
  }, []);

  // Load camera stream URL
  useEffect(() => {
    if (USE_MOCK) return;
    (async () => {
      try {
        const url = await getCameraStreamUrl(Date.now());
        setStreamUrl(url);
      } catch {
        setCameraError(true);
      }
    })();
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleDoor = async () => {
    setToggling(true);
    try {
      locked ? await unlockDoor() : await lockDoor();
      setLocked(l => !l);
    } finally {
      setToggling(false);
    }
  };

  const todayEntries = stats?.todayEntries ?? 0;
  const unreadAlerts = stats?.unreadAlerts ?? 0;
  const memberCount  = stats?.memberCount ?? 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Home</Text>
        <View style={[styles.statusPill, piOnline ? styles.statusOnline : styles.statusOffline]}>
          <View style={[styles.statusDot, { backgroundColor: piOnline ? Colors.green : Colors.red }]} />
          <Text style={[styles.statusLabel, { color: piOnline ? Colors.green : Colors.red }]}>
            {piOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Camera preview card */}
      <View style={styles.cameraCard}>
        {!cameraError && streamUrl ? (
          <View style={styles.cameraStream}>
            <WebView
              source={{ html: mjpegHtml(streamUrl) }}
              style={{ flex: 1, backgroundColor: Colors.bg }}
              javaScriptEnabled
              scrollEnabled={false}
              onMessage={e => { if (e.nativeEvent.data === 'error') setCameraError(true); }}
              onError={() => setCameraError(true)}
            />
            <View style={styles.cameraOverlay}>
              <View style={styles.liveBadge}>
                <View style={styles.liveRedDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.cameraPlaceholderIcon}>◉</Text>
            <Text style={styles.cameraPlaceholderText}>
              {cameraError ? 'Camera offline' : 'Connecting...'}
            </Text>
          </View>
        )}
      </View>

      {/* Lock control */}
      <View style={styles.lockSection}>
        <TouchableOpacity
          style={[styles.lockButton, locked ? styles.lockButtonLocked : styles.lockButtonUnlocked]}
          onPress={toggleDoor}
          activeOpacity={0.7}
          disabled={toggling}
        >
          <Text style={styles.lockEmoji}>{locked ? '🔒' : '🔓'}</Text>
        </TouchableOpacity>
        <View style={styles.lockInfo}>
          <Text style={[styles.lockLabel, { color: locked ? Colors.green : Colors.amber }]}>
            {toggling ? 'Updating...' : locked ? 'Locked' : 'Unlocked'}
          </Text>
          <Text style={styles.lockHint}>Tap to {locked ? 'unlock' : 'lock'}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{todayEntries}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, unreadAlerts > 0 && { color: Colors.red }]}>{unreadAlerts}</Text>
          <Text style={styles.statLabel}>Alerts</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{memberCount}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
      </View>

      {/* Recent events */}
      <View style={styles.eventsSection}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No activity recorded yet</Text>
          </View>
        ) : (
          <View style={styles.eventsList}>
            {logs.map((log, i) => {
              const cfg = EVENT_CONFIG[log.type] || EVENT_CONFIG.motion;
              return (
                <View key={log.id} style={[styles.eventRow, i < logs.length - 1 && styles.eventRowBorder]}>
                  <View style={[styles.eventIcon, { backgroundColor: `${cfg.color}18` }]}>
                    <Text style={[styles.eventIconText, { color: cfg.color }]}>{cfg.icon}</Text>
                  </View>
                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle}>{log.name || cfg.label}</Text>
                    <Text style={styles.eventTime}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.eventAgo}>{timeAgo(log.timestamp)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: Colors.bg },
  container:  { paddingHorizontal: CARD_PADDING, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title:      { ...Typography.largeTitle },

  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  statusOnline:  { backgroundColor: Colors.greenSoft },
  statusOffline: { backgroundColor: Colors.redSoft },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusLabel:   { fontSize: 12, fontWeight: '600' },

  // Camera preview
  cameraCard:   { height: 200, borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: Colors.surface, marginBottom: Spacing.xl },
  cameraStream: { flex: 1, position: 'relative' },
  cameraOverlay: { position: 'absolute', top: Spacing.md, left: Spacing.md },
  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  liveRedDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  liveText:      { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  cameraPlaceholder:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  cameraPlaceholderIcon: { fontSize: 32, color: Colors.textTertiary },
  cameraPlaceholderText: { ...Typography.footnote },

  // Lock
  lockSection:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl, marginBottom: Spacing.xxl, paddingHorizontal: Spacing.xs },
  lockButton:         { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  lockButtonLocked:   { borderColor: Colors.green, backgroundColor: Colors.greenSoft },
  lockButtonUnlocked: { borderColor: Colors.amber, backgroundColor: Colors.amberSoft },
  lockEmoji:          { fontSize: 28 },
  lockInfo:           { flex: 1 },
  lockLabel:          { fontSize: 20, fontWeight: '700' },
  lockHint:           { ...Typography.footnote, marginTop: 2 },

  // Stats
  statsRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingVertical: Spacing.lg, marginBottom: Spacing.xxl },
  statItem:     { flex: 1, alignItems: 'center' },
  statValue:    { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  statLabel:    { ...Typography.caption },
  statDivider:  { width: 1, height: 28, backgroundColor: Colors.border },

  // Events
  eventsSection: { marginBottom: Spacing.xl },
  sectionTitle:  { ...Typography.headline, marginBottom: Spacing.md },
  emptyState:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xxl, alignItems: 'center' },
  emptyText:     { ...Typography.footnote },
  eventsList:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  eventRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  eventRowBorder:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  eventIcon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventIconText: { fontSize: 16, fontWeight: '700' },
  eventContent:  { flex: 1 },
  eventTitle:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  eventTime:     { fontSize: 12, color: Colors.textTertiary, marginTop: 1 },
  eventAgo:      { ...Typography.caption },
});

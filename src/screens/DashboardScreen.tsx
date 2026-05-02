/**
 * Home — primary dashboard: lock control, camera preview, security status,
 * last entry, and doorbell.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, Animated, Easing,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import {
  getDoorStatus, lockDoor, unlockDoor,
  getLogs, getStats, pingPi, pressDoorbell,
  LogEntry, DashboardStats, DoorbellResult, USE_MOCK,
} from '../services/api';
import { getCameraStreamUrl } from '../services/config';
import { hapticHeavy, hapticMedium, hapticSuccess, hapticError, hapticWarning } from '../utils/haptics';

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
  authorized:  { icon: 'checkmark-circle',  color: Colors.green,         label: 'Authorized' },
  unknown:     { icon: 'alert-circle',       color: Colors.red,            label: 'Unknown'    },
  motion:      { icon: 'walk',               color: Colors.accent,         label: 'Motion'     },
  manual_lock: { icon: 'lock-closed',        color: Colors.textSecondary,  label: 'Manual'     },
  doorbell:    { icon: 'notifications',      color: Colors.amber,          label: 'Doorbell'   },
};

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

export default function DashboardScreen() {
  const [locked, setLocked]         = useState(true);
  const [toggling, setToggling]     = useState(false);
  const [piOnline, setPiOnline]     = useState(false);
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [stats, setStats]           = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [streamUrl, setStreamUrl]   = useState('');
  const [cameraError, setCameraError] = useState(false);
  const [ringing, setRinging]       = useState(false);
  const [doorbellResult, setDoorbellResult] = useState<DoorbellResult | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const lockScale = useRef(new Animated.Value(1)).current;
  const lockRotate = useRef(new Animated.Value(0)).current;
  const lockPulse = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [status, entries, dashStats, online] = await Promise.all([
        getDoorStatus(), getLogs(5), getStats(), pingPi(),
      ]);
      setLocked(status.locked);
      setLogs(entries);
      setStats(dashStats);
      setPiOnline(online);
      setInitialLoad(false);
    } catch {
      setPiOnline(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    if (USE_MOCK) return;
    (async () => {
      try { setStreamUrl(await getCameraStreamUrl(Date.now())); }
      catch { setCameraError(true); }
    })();
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const animateLockPress = () => {
    Animated.sequence([
      Animated.timing(lockScale, { toValue: 0.85, duration: 100, useNativeDriver: true }),
      Animated.timing(lockScale, { toValue: 1.05, duration: 150, useNativeDriver: true }),
      Animated.timing(lockScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    Animated.timing(lockRotate, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(() => lockRotate.setValue(0));
  };

  const startCountdown = () => {
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) { clearInterval(timer); return null; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (toggling) {
      Animated.loop(Animated.sequence([
        Animated.timing(lockPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(lockPulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])).start();
    } else { lockPulse.stopAnimation(); lockPulse.setValue(0); }
  }, [toggling, lockPulse]);

  const toggleDoor = async () => {
    hapticHeavy(); animateLockPress(); setToggling(true); startCountdown();
    try {
      locked ? await unlockDoor() : await lockDoor();
      setLocked(l => !l); hapticSuccess();
    } catch {
      hapticError();
      Toast.show({ type: 'error', text1: 'Connection Error', text2: 'Could not reach the Pi.' });
    } finally { setToggling(false); setCountdown(null); }
  };

  const handleDoorbell = async () => {
    if (ringing) return;
    hapticMedium(); setRinging(true); setDoorbellResult(null);
    try {
      const result = await pressDoorbell();
      setDoorbellResult(result);
      if (result.result === 'authorized') { setLocked(false); hapticSuccess(); } else { hapticWarning(); }
      await load();
      setTimeout(() => setDoorbellResult(null), 4000);
    } catch {
      hapticError();
      Toast.show({ type: 'error', text1: 'Doorbell Error', text2: 'Could not reach the Pi.' });
    } finally { setRinging(false); }
  };

  // Derived data
  const unreadAlerts = stats?.unreadAlerts ?? 0;
  const todayUnknown = logs.filter(l => l.type === 'unknown').length;
  const lastEntry = stats?.lastEntry;
  const lockRotation = lockRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', locked ? '-20deg' : '20deg'] });
  const pulseOpacity = lockPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

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

      {/* Security status banner */}
      {!initialLoad && (
        <View style={[
          styles.securityBanner,
          Shadows.cardSubtle,
          unreadAlerts > 0 || todayUnknown > 0 ? styles.securityWarning : styles.securityClear,
        ]}>
          <Ionicons
            name={unreadAlerts > 0 || todayUnknown > 0 ? 'shield-half' : 'shield-checkmark'}
            size={22}
            color={unreadAlerts > 0 || todayUnknown > 0 ? Colors.amber : Colors.green}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.securityTitle, {
              color: unreadAlerts > 0 || todayUnknown > 0 ? Colors.amber : Colors.green,
            }]}>
              {unreadAlerts > 0 ? `${unreadAlerts} Unread Alert${unreadAlerts > 1 ? 's' : ''}`
                : todayUnknown > 0 ? `${todayUnknown} Unknown Face${todayUnknown > 1 ? 's' : ''} Detected`
                : 'All Clear'}
            </Text>
            <Text style={styles.securitySub}>
              {unreadAlerts > 0 ? 'Check Activity tab for details'
                : todayUnknown > 0 ? 'Review recent activity'
                : 'No security concerns'}
            </Text>
          </View>
        </View>
      )}

      {/* Camera preview */}
      <View style={[styles.cameraCard, Shadows.card]}>
        {!cameraError && streamUrl ? (
          <View style={styles.cameraStream}>
            <WebView
              source={{ html: mjpegHtml(streamUrl) }}
              style={{ flex: 1, backgroundColor: Colors.bg }}
              javaScriptEnabled scrollEnabled={false}
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
            <Ionicons name="videocam-off-outline" size={36} color={Colors.textTertiary} />
            <Text style={styles.cameraPlaceholderText}>
              {cameraError ? 'Camera offline' : 'Connecting...'}
            </Text>
          </View>
        )}
      </View>

      {/* Lock control */}
      <View style={styles.lockSection}>
        <View style={styles.lockButtonWrap}>
          {toggling && (
            <Animated.View style={[styles.lockPulseRing, {
              opacity: pulseOpacity,
              borderColor: locked ? Colors.amber : Colors.green,
            }]} />
          )}
          <Animated.View style={{ transform: [{ scale: lockScale }, { rotate: lockRotation }] }}>
            <TouchableOpacity
              style={[styles.lockButton, locked ? styles.lockButtonLocked : styles.lockButtonUnlocked]}
              onPress={toggleDoor} activeOpacity={0.7} disabled={toggling}
            >
              <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={36} color={locked ? Colors.green : Colors.amber} />
            </TouchableOpacity>
          </Animated.View>
        </View>
        <View style={styles.lockInfo}>
          <Text style={[styles.lockLabel, { color: locked ? Colors.green : Colors.amber }]}>
            {toggling ? (locked ? 'Unlocking...' : 'Locking...') : locked ? 'Locked' : 'Unlocked'}
          </Text>
          {countdown !== null ? (
            <Text style={styles.lockCountdown}>{countdown}s remaining</Text>
          ) : (
            <Text style={styles.lockHint}>Tap to {locked ? 'unlock' : 'lock'}</Text>
          )}
        </View>
      </View>

      {/* Last entry card — the #1 thing a homeowner checks */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Last Entry</Text>
      </View>
      {initialLoad ? (
        <View style={[styles.lastEntryCard, Shadows.cardSubtle]}>
          <Skeleton width={40} height={40} style={{ borderRadius: 12 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={120} height={16} />
            <Skeleton width={80} height={12} />
          </View>
        </View>
      ) : lastEntry?.name ? (
        <View style={[styles.lastEntryCard, Shadows.cardSubtle]}>
          <View style={[styles.lastEntryIcon, { backgroundColor: Colors.greenSoft }]}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lastEntryName}>{lastEntry.name}</Text>
            <Text style={styles.lastEntryTime}>
              {lastEntry.timestamp ? timeAgo(lastEntry.timestamp) : 'Unknown time'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </View>
      ) : (
        <View style={[styles.lastEntryCard, Shadows.cardSubtle]}>
          <View style={[styles.lastEntryIcon, { backgroundColor: Colors.elevated }]}>
            <Ionicons name="person-outline" size={22} color={Colors.textTertiary} />
          </View>
          <Text style={styles.lastEntryEmpty}>No authorized entries yet</Text>
        </View>
      )}

      {/* Doorbell */}
      <TouchableOpacity
        style={[
          styles.doorbellBtn, Shadows.cardSubtle,
          ringing && styles.doorbellBtnScanning,
          doorbellResult?.result === 'authorized' && styles.doorbellBtnAuthorized,
          doorbellResult?.result === 'unknown' && styles.doorbellBtnDenied,
        ]}
        onPress={handleDoorbell} activeOpacity={0.7} disabled={ringing}
      >
        <View style={styles.doorbellIconWrap}>
          <Ionicons
            name={ringing ? 'scan' : doorbellResult?.result === 'authorized' ? 'checkmark-circle' : doorbellResult?.result === 'unknown' ? 'close-circle' : 'radio-button-on'}
            size={26}
            color={ringing ? Colors.amber : doorbellResult?.result === 'authorized' ? Colors.green : doorbellResult?.result === 'unknown' ? Colors.red : Colors.accent}
          />
        </View>
        <View style={styles.doorbellTextWrap}>
          <Text style={styles.doorbellLabel}>
            {ringing ? 'Scanning...' : doorbellResult ? doorbellResult.message : 'Ring Doorbell'}
          </Text>
          <Text style={styles.doorbellHint}>
            {ringing ? 'Checking camera for faces' : doorbellResult ? '' : 'Triggers face recognition scan'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </TouchableOpacity>

      {/* Recent activity (last 3) */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
      </View>
      {initialLoad ? (
        <View style={[styles.eventsList, Shadows.cardSubtle]}>
          {[1,2,3].map(i => (
            <View key={i} style={[styles.eventRow, i < 3 && styles.eventRowBorder]}>
              <Skeleton width={36} height={36} style={{ borderRadius: 10 }} />
              <View style={{ flex: 1, gap: 6 }}><Skeleton width={120} height={14} /><Skeleton width={80} height={12} /></View>
              <Skeleton width={40} height={11} />
            </View>
          ))}
        </View>
      ) : logs.length === 0 ? (
        <View style={[styles.emptyState, Shadows.cardSubtle]}>
          <Ionicons name="clipboard-outline" size={36} color={Colors.textTertiary} />
          <Text style={styles.emptyText}>Events will appear as people approach your door</Text>
        </View>
      ) : (
        <View style={[styles.eventsList, Shadows.cardSubtle]}>
          {logs.slice(0, 3).map((log, i, arr) => {
            const cfg = EVENT_CONFIG[log.type] || EVENT_CONFIG.motion;
            return (
              <View key={log.id} style={[styles.eventRow, i < arr.length - 1 && styles.eventRowBorder]}>
                <View style={[styles.eventIcon, { backgroundColor: `${cfg.color}18` }]}>
                  <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{log.name || cfg.label}</Text>
                  <Text style={styles.eventTime}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {log.confidence != null && ` \u2022 ${Math.round(log.confidence * 100)}% match`}
                  </Text>
                </View>
                <Text style={styles.eventAgo}>{timeAgo(log.timestamp)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: Colors.bg },
  container:  { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title:      { ...Typography.largeTitle },

  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  statusOnline:  { backgroundColor: Colors.greenSoft },
  statusOffline: { backgroundColor: Colors.redSoft },
  statusDot:     { width: 6, height: 6, borderRadius: 3 },
  statusLabel:   { fontSize: 12, fontWeight: '600' },

  // Security banner
  securityBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl },
  securityClear:  { backgroundColor: Colors.greenSoft },
  securityWarning:{ backgroundColor: Colors.amberSoft },
  securityTitle:  { fontSize: 14, fontWeight: '700' },
  securitySub:    { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  // Camera preview
  cameraCard:   { height: 200, borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: Colors.surface, marginBottom: Spacing.xl },
  cameraStream: { flex: 1, position: 'relative' },
  cameraOverlay: { position: 'absolute', top: Spacing.md, left: Spacing.md },
  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  liveRedDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  liveText:      { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  cameraPlaceholder:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  cameraPlaceholderText: { ...Typography.footnote },

  // Lock
  lockSection:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.xxl, marginBottom: Spacing.xl, paddingHorizontal: Spacing.xs },
  lockButtonWrap: { width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
  lockPulseRing:  { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 3 },
  lockButton:     { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  lockButtonLocked:   { borderColor: Colors.green, backgroundColor: Colors.greenSoft },
  lockButtonUnlocked: { borderColor: Colors.amber, backgroundColor: Colors.amberSoft },
  lockInfo:       { flex: 1 },
  lockLabel:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  lockCountdown:  { fontSize: 13, fontWeight: '600', color: Colors.amber, marginTop: 2 },
  lockHint:       { ...Typography.footnote, marginTop: 2 },

  // Last entry
  sectionRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle:   { ...Typography.headline },
  lastEntryCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl },
  lastEntryIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lastEntryName:  { fontSize: 16, fontWeight: '700', color: Colors.text },
  lastEntryTime:  { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  lastEntryEmpty: { ...Typography.footnote, flex: 1 },

  // Doorbell
  doorbellBtn:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.border },
  doorbellBtnScanning:   { borderColor: Colors.amber, backgroundColor: `${Colors.amber}08` },
  doorbellBtnAuthorized: { borderColor: Colors.green, backgroundColor: `${Colors.green}08` },
  doorbellBtnDenied:     { borderColor: Colors.red, backgroundColor: `${Colors.red}08` },
  doorbellIconWrap:      { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.elevated, alignItems: 'center', justifyContent: 'center' },
  doorbellTextWrap:      { flex: 1 },
  doorbellLabel:         { fontSize: 16, fontWeight: '600', color: Colors.text },
  doorbellHint:          { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  // Recent activity
  emptyState:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  emptyText:     { ...Typography.footnote, textAlign: 'center' },
  eventsList:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.lg },
  eventRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  eventRowBorder:{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  eventIcon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventContent:  { flex: 1 },
  eventTitle:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  eventTime:     { fontSize: 12, color: Colors.textTertiary, marginTop: 1 },
  eventAgo:      { ...Typography.caption },
});

/**
 * Camera — full live view with door control and last detected event.
 * No developer specs (resolution, FPS) — just what the homeowner needs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import {
  USE_MOCK, getDoorStatus, lockDoor, unlockDoor,
  getLogs, LogEntry, pingPi,
} from '../services/api';
import { getCameraStreamUrl } from '../services/config';
import { hapticLight, hapticHeavy, hapticSuccess, hapticError } from '../utils/haptics';

function mjpegHtml(url: string): string {
  return `<html><body style="margin:0;padding:0;background:#0C0F14;display:flex;align-items:center;justify-content:center;height:100vh">
    <img src="${url}" style="width:100%;height:100%;object-fit:contain"
         onerror="window.ReactNativeWebView.postMessage('error')"/>
  </body></html>`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  authorized:  { label: 'Authorized entry', color: Colors.green,         icon: 'checkmark-circle' },
  unknown:     { label: 'Unknown face',     color: Colors.red,           icon: 'alert-circle' },
  motion:      { label: 'Motion detected',  color: Colors.accent,        icon: 'walk' },
  manual_lock: { label: 'Door toggled',     color: Colors.textSecondary, icon: 'lock-closed' },
};

export default function LiveCameraScreen() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [streamUrl, setStreamUrl]   = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const [locked, setLocked]       = useState(true);
  const [toggling, setToggling]   = useState(false);
  const [piOnline, setPiOnline]   = useState(false);
  const [lastEvent, setLastEvent] = useState<LogEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (USE_MOCK) {
      setTimeout(() => { if (!cancelled) { setLoading(false); setError(true); } }, 1000);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const url = await getCameraStreamUrl(lastRefresh);
        if (cancelled) return;
        setStreamUrl(url); setError(false);
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [lastRefresh]);

  const loadStatus = useCallback(async () => {
    try {
      const [door, logs, online] = await Promise.all([getDoorStatus(), getLogs(10), pingPi()]);
      setLocked(door.locked); setPiOnline(online);
      const relevant = logs.find(l => l.type === 'authorized' || l.type === 'unknown' || l.type === 'motion');
      setLastEvent(relevant || null);
    } catch { setPiOnline(false); }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 6000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const reconnect = () => {
    if (loading) return;
    hapticLight(); setLoading(true); setError(false); setLastRefresh(Date.now());
  };

  const toggleDoor = async () => {
    hapticHeavy(); setToggling(true);
    try {
      locked ? await unlockDoor() : await lockDoor();
      setLocked(l => !l); hapticSuccess();
    } catch {
      hapticError();
      Toast.show({ type: 'error', text1: 'Connection Error', text2: 'Could not reach the Pi.' });
    } finally { setToggling(false); }
  };

  // Fullscreen mode
  if (fullscreen) {
    return (
      <View style={styles.fullscreenContainer}>
        <TouchableOpacity style={styles.exitBtn} onPress={() => { hapticLight(); setFullscreen(false); }}>
          <Ionicons name="close" size={20} color="#fff" />
          <Text style={styles.exitBtnText}>Done</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.accent} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons name="videocam-off-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.errorTitle}>Camera Unavailable</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reconnect}>
              <Text style={styles.retryBtnText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fullscreenStream}>
            <WebView source={{ html: mjpegHtml(streamUrl) }} style={{ flex: 1, backgroundColor: Colors.bg }} javaScriptEnabled scrollEnabled={false}
              onMessage={e => { if (e.nativeEvent.data === 'error') setError(true); }} />
          </View>
        )}
      </View>
    );
  }

  const eventCfg = lastEvent ? (EVENT_LABELS[lastEvent.type] || EVENT_LABELS.motion) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Camera</Text>
        <View style={[styles.statusPill, error ? styles.pillOffline : styles.pillLive]}>
          <View style={[styles.statusDot, { backgroundColor: error ? Colors.red : Colors.green }]} />
          <Text style={[styles.statusText, { color: error ? Colors.red : Colors.green }]}>
            {error ? 'Offline' : 'Live'}
          </Text>
        </View>
      </View>

      {/* Camera feed — larger */}
      <View style={[styles.feedCard, Shadows.card]}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Connecting to camera...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Ionicons name="videocam-off-outline" size={44} color={Colors.textTertiary} />
            <Text style={styles.errorTitle}>Camera Unavailable</Text>
            <Text style={styles.errorHint}>Check Pi connection in Settings</Text>
            <TouchableOpacity style={[styles.retryBtn, Shadows.button]} onPress={reconnect}>
              <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.streamWrap}>
            <WebView source={{ html: mjpegHtml(streamUrl) }} style={{ flex: 1, backgroundColor: Colors.bg }} javaScriptEnabled scrollEnabled={false}
              onMessage={e => { if (e.nativeEvent.data === 'error') setError(true); }}
              onError={() => setError(true)} />
            <View style={styles.streamOverlayTop}>
              <View style={styles.liveBadge}>
                <View style={styles.liveRedDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Quick actions — fullscreen, refresh, and door lock */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => { if (!error && !loading) { hapticLight(); setFullscreen(true); }}} disabled={error || loading}>
          <View style={[styles.actionCircle, (error || loading) && styles.actionDisabled]}>
            <Ionicons name="expand-outline" size={22} color={Colors.text} />
          </View>
          <Text style={styles.actionLabel}>Fullscreen</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={toggleDoor} disabled={toggling}>
          <View style={[styles.actionCircle, locked ? styles.actionLocked : styles.actionUnlocked]}>
            <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={22} color={locked ? Colors.green : Colors.amber} />
          </View>
          <Text style={styles.actionLabel}>{toggling ? 'Working...' : locked ? 'Locked' : 'Unlocked'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={reconnect} disabled={loading}>
          <View style={[styles.actionCircle, loading && styles.actionDisabled]}>
            <Ionicons name="refresh-outline" size={22} color={Colors.text} />
          </View>
          <Text style={styles.actionLabel}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Last detected event */}
      <Text style={styles.sectionTitle}>Last Detected Event</Text>
      {lastEvent && eventCfg ? (
        <View style={[styles.eventCard, Shadows.cardSubtle]}>
          <View style={[styles.eventDot, { backgroundColor: `${eventCfg.color}20` }]}>
            <Ionicons name={eventCfg.icon} size={20} color={eventCfg.color} />
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventLabel}>{eventCfg.label}</Text>
            <Text style={styles.eventName}>
              {lastEvent.name || 'No face detected'}
              {lastEvent.confidence != null && ` \u2014 ${Math.round(lastEvent.confidence * 100)}% match`}
            </Text>
          </View>
          <Text style={styles.eventTime}>{timeAgo(lastEvent.timestamp)}</Text>
        </View>
      ) : (
        <View style={[styles.eventCard, Shadows.cardSubtle]}>
          <Ionicons name="time-outline" size={22} color={Colors.textTertiary} style={{ marginRight: Spacing.sm }} />
          <Text style={styles.eventEmpty}>No events recorded yet</Text>
        </View>
      )}

      {/* Connection status */}
      <View style={[styles.connectionRow, Shadows.cardSubtle]}>
        <View style={styles.connectionItem}>
          <View style={[styles.connDot, { backgroundColor: piOnline ? Colors.green : Colors.red }]} />
          <Text style={[styles.connectionText, { color: piOnline ? Colors.green : Colors.red }]}>
            {piOnline ? 'Pi Connected' : 'Pi Disconnected'}
          </Text>
        </View>
        <View style={styles.connectionDivider} />
        <View style={styles.connectionItem}>
          <Ionicons name={locked ? 'lock-closed' : 'lock-open'} size={14} color={locked ? Colors.green : Colors.amber} />
          <Text style={[styles.connectionText, { color: locked ? Colors.green : Colors.amber }]}>
            Door {locked ? 'Locked' : 'Unlocked'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xl },
  title:      { ...Typography.largeTitle },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  pillLive:   { backgroundColor: Colors.greenSoft },
  pillOffline:{ backgroundColor: Colors.redSoft },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },

  // Stream — taller
  feedCard:   { backgroundColor: Colors.surface, borderRadius: Radius.xl, overflow: 'hidden', height: 280, marginBottom: Spacing.lg },
  centerBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xxl },
  loadingText:{ ...Typography.footnote },
  errorTitle: { ...Typography.headline, textAlign: 'center' },
  errorHint:  { ...Typography.caption, textAlign: 'center', marginTop: 2 },
  retryBtn:   { marginTop: Spacing.md, backgroundColor: Colors.accent, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.sm, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center' },
  retryBtnText:{ fontSize: 14, fontWeight: '600', color: '#fff' },
  errorBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  streamWrap: { flex: 1, position: 'relative' },
  streamOverlayTop: { position: 'absolute', top: Spacing.md, left: Spacing.md, zIndex: 2 },
  liveBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  liveRedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  liveText:   { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  // Quick actions — 3 buttons
  actionsRow:     { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.xl, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  actionBtn:      { alignItems: 'center', gap: Spacing.sm },
  actionCircle:   { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  actionDisabled: { opacity: 0.4 },
  actionLocked:   { backgroundColor: Colors.greenSoft },
  actionUnlocked: { backgroundColor: Colors.amberSoft },
  actionLabel:    { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  // Sections
  sectionTitle: { ...Typography.headline, marginBottom: Spacing.md },

  // Last event
  eventCard:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: Spacing.md, marginBottom: Spacing.xl },
  eventDot:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventInfo:     { flex: 1 },
  eventLabel:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  eventName:     { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  eventTime:     { ...Typography.caption },
  eventEmpty:    { ...Typography.footnote, flex: 1 },

  // Connection status bar
  connectionRow: { backgroundColor: Colors.surface, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  connectionItem:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  connectionDivider: { width: 1, height: 20, backgroundColor: Colors.border },
  connectionText:{ fontSize: 13, fontWeight: '600' },
  connDot:       { width: 6, height: 6, borderRadius: 3 },

  // Fullscreen
  fullscreenContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  exitBtn:   { position: 'absolute', top: 60, right: Spacing.xl, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 6 },
  exitBtnText:{ fontSize: 15, fontWeight: '600', color: '#fff' },
  fullscreenStream: { width: '100%', height: '100%' },
});

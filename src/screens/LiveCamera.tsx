/**
 * Camera — full live view from the Raspberry Pi camera with quick actions,
 * last detected event, and camera health status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  USE_MOCK, getDoorStatus, lockDoor, unlockDoor,
  getLogs, LogEntry, pingPi,
} from '../services/api';
import { getCameraStreamUrl } from '../services/config';

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

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  authorized:  { label: 'Authorized entry', color: Colors.green },
  unknown:     { label: 'Unknown face',     color: Colors.red },
  motion:      { label: 'Motion detected',  color: Colors.accent },
  manual_lock: { label: 'Door toggled',     color: Colors.textSecondary },
};

export default function LiveCameraScreen() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [streamUrl, setStreamUrl]   = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Quick actions state
  const [locked, setLocked]       = useState(true);
  const [toggling, setToggling]   = useState(false);
  const [piOnline, setPiOnline]   = useState(false);
  const [lastEvent, setLastEvent] = useState<LogEntry | null>(null);
  const [connectedSince, setConnectedSince] = useState<string | null>(null);

  // Load stream URL
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
        setStreamUrl(url);
        setError(false);
        setConnectedSince(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lastRefresh]);

  // Load door status and last event
  const loadStatus = useCallback(async () => {
    try {
      const [door, logs, online] = await Promise.all([
        getDoorStatus(),
        getLogs(10),
        pingPi(),
      ]);
      setLocked(door.locked);
      setPiOnline(online);
      // Find the most recent camera-relevant event
      const relevant = logs.find(l => l.type === 'authorized' || l.type === 'unknown' || l.type === 'motion');
      setLastEvent(relevant || null);
    } catch {
      setPiOnline(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 6000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const reconnect = () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    setLastRefresh(Date.now());
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

  // Fullscreen mode
  if (fullscreen) {
    return (
      <View style={styles.fullscreenContainer}>
        <TouchableOpacity style={styles.exitBtn} onPress={() => setFullscreen(false)}>
          <Text style={styles.exitBtnText}>Done</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.accent} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Camera Unavailable</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reconnect}>
              <Text style={styles.retryBtnText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fullscreenStream}>
            <WebView
              source={{ html: mjpegHtml(streamUrl) }}
              style={{ flex: 1, backgroundColor: Colors.bg }}
              javaScriptEnabled
              scrollEnabled={false}
              onMessage={e => { if (e.nativeEvent.data === 'error') setError(true); }}
            />
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

      {/* Camera feed */}
      <View style={styles.feedCard}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Connecting to camera...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorIcon}>◉</Text>
            <Text style={styles.errorTitle}>Camera Unavailable</Text>
            <Text style={styles.errorHint}>Check Pi connection in Settings</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reconnect}>
              <Text style={styles.retryBtnText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.streamWrap}>
            <WebView
              source={{ html: mjpegHtml(streamUrl) }}
              style={{ flex: 1, backgroundColor: Colors.bg }}
              javaScriptEnabled
              scrollEnabled={false}
              onMessage={e => { if (e.nativeEvent.data === 'error') setError(true); }}
              onError={() => setError(true)}
            />
            <View style={styles.streamOverlayTop}>
              <View style={styles.liveBadge}>
                <View style={styles.liveRedDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Quick actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => !error && setFullscreen(true)} disabled={error || loading}>
          <View style={[styles.actionCircle, (error || loading) && styles.actionDisabled]}>
            <Text style={styles.actionIcon}>⛶</Text>
          </View>
          <Text style={styles.actionLabel}>Fullscreen</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={reconnect} disabled={loading}>
          <View style={[styles.actionCircle, loading && styles.actionDisabled]}>
            <Text style={styles.actionIcon}>↻</Text>
          </View>
          <Text style={styles.actionLabel}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Last detected event */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Last Detected Event</Text>
        {lastEvent && eventCfg ? (
          <View style={styles.eventCard}>
            <View style={[styles.eventDot, { backgroundColor: `${eventCfg.color}20` }]}>
              <View style={[styles.eventDotInner, { backgroundColor: eventCfg.color }]} />
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventLabel}>{eventCfg.label}</Text>
              <Text style={styles.eventName}>
                {lastEvent.name || 'No face detected'}
                {lastEvent.confidence != null && ` — ${Math.round(lastEvent.confidence * 100)}% match`}
              </Text>
            </View>
            <Text style={styles.eventTime}>{timeAgo(lastEvent.timestamp)}</Text>
          </View>
        ) : (
          <View style={styles.eventCard}>
            <Text style={styles.eventEmpty}>No events recorded yet</Text>
          </View>
        )}
      </View>

      {/* Camera status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera Status</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Connection</Text>
            <View style={styles.statusValueWrap}>
              <View style={[styles.miniDot, { backgroundColor: piOnline ? Colors.green : Colors.red }]} />
              <Text style={[styles.statusValue, { color: piOnline ? Colors.green : Colors.red }]}>
                {piOnline ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Resolution</Text>
            <Text style={styles.statusValue}>640 x 480</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Frame Rate</Text>
            <Text style={styles.statusValue}>~15 fps</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusKey}>Door Status</Text>
            <Text style={[styles.statusValue, { color: locked ? Colors.green : Colors.amber }]}>
              {locked ? 'Locked' : 'Unlocked'}
            </Text>
          </View>
          {connectedSince && !error && (
            <>
              <View style={styles.statusDivider} />
              <View style={styles.statusRow}>
                <Text style={styles.statusKey}>Streaming Since</Text>
                <Text style={styles.statusValue}>{connectedSince}</Text>
              </View>
            </>
          )}
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

  // Stream
  feedCard:   { backgroundColor: Colors.surface, borderRadius: Radius.xl, overflow: 'hidden', height: 240, marginBottom: Spacing.lg },
  centerBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xxl },
  loadingText:{ ...Typography.footnote },
  errorIcon:  { fontSize: 36, color: Colors.textTertiary, marginBottom: Spacing.xs },
  errorTitle: { ...Typography.headline, textAlign: 'center' },
  errorHint:  { ...Typography.caption, textAlign: 'center', marginTop: 2 },
  retryBtn:   { marginTop: Spacing.md, backgroundColor: Colors.accent, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.sm, borderRadius: Radius.sm },
  retryBtnText:{ fontSize: 14, fontWeight: '600', color: '#fff' },
  errorBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  streamWrap: { flex: 1, position: 'relative' },
  streamOverlayTop: { position: 'absolute', top: Spacing.md, left: Spacing.md, zIndex: 2 },
  liveBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  liveRedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  liveText:   { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  // Quick actions
  actionsRow:     { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xxxl, marginBottom: Spacing.xxl, paddingVertical: Spacing.sm },
  actionBtn:      { alignItems: 'center', gap: Spacing.sm },
  actionCircle:   { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  actionDisabled: { opacity: 0.4 },
  actionLocked:   { backgroundColor: Colors.greenSoft },
  actionUnlocked: { backgroundColor: Colors.amberSoft },
  actionIcon:     { fontSize: 22, color: Colors.text },
  actionLabel:    { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  // Sections
  section:      { marginBottom: Spacing.xl },
  sectionTitle: { ...Typography.headline, marginBottom: Spacing.md },

  // Last event
  eventCard:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: Spacing.md },
  eventDot:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventDotInner: { width: 10, height: 10, borderRadius: 5 },
  eventInfo:     { flex: 1 },
  eventLabel:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  eventName:     { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  eventTime:     { ...Typography.caption },
  eventEmpty:    { ...Typography.footnote, flex: 1, textAlign: 'center' },

  // Camera status
  statusCard:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg },
  statusRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  statusDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  statusKey:      { fontSize: 14, color: Colors.textSecondary },
  statusValue:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  statusValueWrap:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniDot:        { width: 6, height: 6, borderRadius: 3 },

  // Fullscreen
  fullscreenContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  exitBtn:   { position: 'absolute', top: 60, right: Spacing.xl, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  exitBtnText:{ fontSize: 15, fontWeight: '600', color: '#fff' },
  fullscreenStream: { width: '100%', height: '100%' },
});

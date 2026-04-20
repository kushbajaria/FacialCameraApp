/**
 * Camera — displays the MJPEG stream from the Raspberry Pi camera.
 * Supports fullscreen mode, connection status, and motion toggle controls.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { USE_MOCK } from '../services/api';
import { getCameraStreamUrl } from '../services/config';

const MOTION_DETECTION_KEY = '@live_camera_motion_detection';
const MOTION_ALERTS_KEY    = '@live_camera_motion_alerts';

function mjpegHtml(url: string): string {
  return `<html><body style="margin:0;padding:0;background:#0C0F14;display:flex;align-items:center;justify-content:center;height:100vh">
    <img src="${url}" style="width:100%;height:100%;object-fit:contain"
         onerror="window.ReactNativeWebView.postMessage('error')"/>
  </body></html>`;
}

export default function LiveCameraScreen() {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [lastRefresh, setLastRefresh]             = useState(Date.now());
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(true);
  const [motionAlertsEnabled, setMotionAlertsEnabled]       = useState(true);
  const [togglesReady, setTogglesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (USE_MOCK) {
      setTimeout(() => { if (!cancelled) { setLoading(false); setError(true); } }, 1000);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const nextStream = await getCameraStreamUrl(lastRefresh);
        if (cancelled) return;
        setStreamUrl(nextStream);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lastRefresh]);

  useEffect(() => {
    (async () => {
      try {
        const [md, ma] = await Promise.all([
          AsyncStorage.getItem(MOTION_DETECTION_KEY),
          AsyncStorage.getItem(MOTION_ALERTS_KEY),
        ]);
        if (md !== null) setMotionDetectionEnabled(md === 'true');
        if (ma !== null) setMotionAlertsEnabled(ma === 'true');
      } finally {
        setTogglesReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!togglesReady) return;
    AsyncStorage.setItem(MOTION_DETECTION_KEY, String(motionDetectionEnabled)).catch(() => {});
  }, [motionDetectionEnabled, togglesReady]);

  useEffect(() => {
    if (!togglesReady) return;
    AsyncStorage.setItem(MOTION_ALERTS_KEY, String(motionAlertsEnabled)).catch(() => {});
  }, [motionAlertsEnabled, togglesReady]);

  const reconnect = () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    setLastRefresh(Date.now());
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

  return (
    <View style={styles.container}>
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
            <Text style={styles.errorHint}>
              Check Pi connection in Settings
            </Text>
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
            <TouchableOpacity style={styles.expandBtn} onPress={() => setFullscreen(true)}>
              <Text style={styles.expandIcon}>⛶</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsCard}>
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlTitle}>Motion Detection</Text>
            <Text style={styles.controlSub}>Trigger camera on movement</Text>
          </View>
          <Switch
            value={motionDetectionEnabled}
            onValueChange={setMotionDetectionEnabled}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionDetectionEnabled ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
        <View style={styles.controlDivider} />
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlTitle}>Motion Alerts</Text>
            <Text style={styles.controlSub}>Get notified when motion is detected</Text>
          </View>
          <Switch
            value={motionAlertsEnabled}
            onValueChange={setMotionAlertsEnabled}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionAlertsEnabled ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xl },
  title:        { ...Typography.largeTitle },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full },
  pillLive:     { backgroundColor: Colors.greenSoft },
  pillOffline:  { backgroundColor: Colors.redSoft },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontSize: 12, fontWeight: '600' },

  feedCard:     { backgroundColor: Colors.surface, borderRadius: Radius.xl, overflow: 'hidden', height: 220, marginBottom: Spacing.lg },
  centerBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xxl },
  loadingText:  { ...Typography.footnote },
  errorIcon:    { fontSize: 36, color: Colors.textTertiary, marginBottom: Spacing.xs },
  errorTitle:   { ...Typography.headline, textAlign: 'center' },
  errorHint:    { ...Typography.caption, textAlign: 'center', marginTop: 2 },
  retryBtn:     { marginTop: Spacing.md, backgroundColor: Colors.accent, paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.sm, borderRadius: Radius.sm },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  errorBox:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },

  streamWrap:       { flex: 1, position: 'relative' },
  streamOverlayTop: { position: 'absolute', top: Spacing.md, left: Spacing.md, zIndex: 2 },
  liveBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  liveRedDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.red },
  liveText:         { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  expandBtn:        { position: 'absolute', bottom: Spacing.md, right: Spacing.md, backgroundColor: 'rgba(0,0,0,0.55)', width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  expandIcon:       { fontSize: 18, color: '#fff' },

  controlsCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  controlRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  controlInfo:   { flex: 1 },
  controlTitle:  { fontSize: 15, fontWeight: '600', color: Colors.text },
  controlSub:    { fontSize: 12, color: Colors.textTertiary, marginTop: 1 },
  controlDivider:{ height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  fullscreenContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  exitBtn:             { position: 'absolute', top: 60, right: Spacing.xl, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  exitBtnText:         { fontSize: 15, fontWeight: '600', color: '#fff' },
  fullscreenStream:    { width: '100%', height: '100%' },
});

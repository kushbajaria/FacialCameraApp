import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { USE_MOCK } from '../services/api';
import { DEFAULT_PI_BASE_URL, getCameraStreamUrl, getEffectivePiBaseUrl } from '../services/config';

const MOTION_DETECTION_KEY = '@live_camera_motion_detection';
const MOTION_ALERTS_KEY = '@live_camera_motion_alerts';

export default function LiveCameraScreen() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [streamUrl, setStreamUrl]   = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PI_BASE_URL);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(true);
  const [motionAlertsEnabled, setMotionAlertsEnabled] = useState(true);
  const [togglesReady, setTogglesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Set up the MJPEG stream URL from the Raspberry Pi
    if (USE_MOCK) {
      // In mock mode, simulate loading
      const timer = setTimeout(() => {
        if (cancelled) return;
        setLoading(false);
        setError(true); // Show placeholder since no real stream
      }, 1000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      const loadStream = async () => {
        try {
          const [nextBaseUrl, nextStreamUrl] = await Promise.all([
            getEffectivePiBaseUrl(),
            getCameraStreamUrl(lastRefresh),
          ]);

          if (cancelled) return;
          setBaseUrl(nextBaseUrl);
          setStreamUrl(nextStreamUrl);
          setError(false);
        } catch {
          if (cancelled) return;
          setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      loadStream();
      return () => {
        cancelled = true;
      };
    }
  }, [lastRefresh]);

  useEffect(() => {
    const loadTogglePreferences = async () => {
      try {
        const [storedMotionDetection, storedMotionAlerts] = await Promise.all([
          AsyncStorage.getItem(MOTION_DETECTION_KEY),
          AsyncStorage.getItem(MOTION_ALERTS_KEY),
        ]);

        if (storedMotionDetection !== null) {
          setMotionDetectionEnabled(storedMotionDetection === 'true');
        }
        if (storedMotionAlerts !== null) {
          setMotionAlertsEnabled(storedMotionAlerts === 'true');
        }
      } finally {
        setTogglesReady(true);
      }
    };

    loadTogglePreferences();
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

  const toggleFullscreen = () => {
    setFullscreen(v => !v);
  };

  if (fullscreen) {
    return (
      <View style={styles.fullscreenContainer}>
        <TouchableOpacity style={styles.exitFullscreenBtn} onPress={toggleFullscreen}>
          <Text style={styles.exitFullscreenText}>✕ Exit</Text>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator size="large" color={Colors.accent} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Camera unavailable</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={reconnect}>
              <Text style={styles.retryBtnText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fullscreenVideoWrapper}>
            {/* Platform-specific image for MJPEG stream */}
            {Platform.OS === 'web' ? (
              <img src={streamUrl} alt="Live Camera" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              // For native, use Image component with cache-busting
              <View style={styles.nativeStreamPlaceholder}>
                <Text style={styles.streamPlaceholderText}>
                  {USE_MOCK ? '📷 Camera feed will appear here when connected to Pi' : 'Streaming...'}
                </Text>
                {!USE_MOCK && (
                  <Text style={styles.streamUrl}>{streamUrl}</Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Live</Text>
          <Text style={styles.title}>Camera Feed</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.dot, { backgroundColor: error ? Colors.red : USE_MOCK ? Colors.textDim : Colors.green }]} />
          <Text style={styles.badgeText}>{error ? 'OFFLINE' : USE_MOCK ? 'MOCK' : 'LIVE'}</Text>
        </View>
      </View>

      {/* Camera View */}
      <View style={styles.videoCard}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Connecting to camera...</Text>
          </View>
        ) : error || USE_MOCK ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>📷</Text>
            <Text style={styles.errorText}>
              {USE_MOCK ? 'Camera preview (mock mode)' : 'Camera unavailable'}
            </Text>
            <Text style={styles.errorHint}>
              {USE_MOCK 
                ? 'Set USE_MOCK = false in api.ts to connect to your Raspberry Pi'
                : 'Check your saved Pi IP/port and confirm the camera service is running'
              }
            </Text>
            {!USE_MOCK && (
              <TouchableOpacity style={styles.retryBtn} onPress={reconnect}>
                <Text style={styles.retryBtnText}>↻ Reconnect</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.videoWrapper}>
            {Platform.OS === 'web' ? (
              <img src={streamUrl} alt="Live Camera" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: Radius.md }} />
            ) : (
              // For React Native, we'd use a WebView or custom native module for MJPEG
              // This is a placeholder that shows the stream URL
              <View style={styles.nativeStreamPlaceholder}>
                <Text style={styles.streamPlaceholderText}>📹 Live Stream Active</Text>
                <Text style={styles.streamUrl}>{baseUrl}/camera/stream</Text>
                <Text style={styles.streamHint}>
                  Note: Full MJPEG rendering requires WebView or native implementation
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.fullscreenToggle} onPress={toggleFullscreen}>
              <Text style={styles.fullscreenIcon}>⛶</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <View style={styles.controlItem}>
            <Text style={styles.controlLabel}>MOTION DETECTION</Text>
            <Text style={styles.controlStateText}>{motionDetectionEnabled ? 'ON' : 'OFF'}</Text>
            <Switch
              value={motionDetectionEnabled}
              onValueChange={setMotionDetectionEnabled}
              trackColor={{ false: Colors.borderHigh, true: Colors.accent }}
              thumbColor={Colors.text}
              ios_backgroundColor={Colors.borderHigh}
            />
          </View>
          <View style={styles.controlItem}>
            <Text style={styles.controlLabel}>MOTION ALERTS</Text>
            <Text style={styles.controlStateText}>{motionAlertsEnabled ? 'ON' : 'OFF'}</Text>
            <Switch
              value={motionAlertsEnabled}
              onValueChange={setMotionAlertsEnabled}
              trackColor={{ false: Colors.borderHigh, true: Colors.accent }}
              thumbColor={Colors.text}
              ios_backgroundColor={Colors.borderHigh}
            />
          </View>
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionLabel}>CAMERA INFO</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Device</Text>
            <Text style={styles.infoValue}>Raspberry Pi Camera Module v2</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Location</Text>
            <Text style={styles.infoValue}>Front Door</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Stream URL</Text>
            <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
              {USE_MOCK ? 'Not connected' : `${baseUrl}/camera/stream`}
            </Text>
          </View>
        </View>
      </View>

      {/* Recording Indicator */}
      {!USE_MOCK && !error && (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording enabled • Motion detection active</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  eyebrow: {
    ...Typography.sectionLabel,
    marginBottom: Spacing.xs,
  },
  title: Typography.screenTitle,
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    ...Typography.badge,
    color: Colors.textMid,
  },

  // Video Card
  videoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    height: 160,
    marginBottom: Spacing.xl,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMid,
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.bodyBold,
    fontSize: 16,
    textAlign: 'center',
  },
  errorHint: {
    ...Typography.caption,
    textAlign: 'center',
    lineHeight: 16,
  },
  retryBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  retryBtnText: {
    ...Typography.bodyBold,
    color: Colors.bg,
  },
  videoWrapper: {
    flex: 1,
    position: 'relative',
  },
  fullscreenToggle: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenIcon: {
    fontSize: 18,
    color: Colors.text,
  },
  nativeStreamPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.surfaceHigh,
  },
  streamPlaceholderText: {
    ...Typography.bodyBold,
    textAlign: 'center',
  },
  streamUrl: {
    ...Typography.caption,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  streamHint: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 14,
  },

  // Controls
  controls: {
    marginBottom: Spacing.xl,
  },
  controlRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  controlItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  controlLabel: {
    ...Typography.caption,
    textAlign: 'center',
  },
  controlStateText: {
    ...Typography.bodyBold,
    color: Colors.accent,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  controlValue: {
    ...Typography.bodyBold,
    fontSize: 16,
    color: Colors.accent,
  },

  // Info Section
  infoSection: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    ...Typography.sectionLabel,
    marginBottom: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoKey: {
    ...Typography.body,
    color: Colors.textMid,
  },
  infoValue: {
    ...Typography.bodyBold,
    flex: 1,
    textAlign: 'right',
  },
  infoValueMono: {
    ...Typography.body,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: Colors.accent,
    flex: 1,
    textAlign: 'right',
  },

  // Recording Banner
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.redDim,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: `${Colors.red}33`,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.red,
  },
  recordingText: {
    ...Typography.caption,
    color: Colors.red,
  },

  // Fullscreen
  fullscreenContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitFullscreenBtn: {
    position: 'absolute',
    top: 60,
    right: Spacing.lg,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  exitFullscreenText: {
    ...Typography.bodyBold,
    color: Colors.text,
  },
  fullscreenVideoWrapper: {
    width: '100%',
    height: '100%',
  },
});

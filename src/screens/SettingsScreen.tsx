/**
 * Settings — configure Pi connection, recognition threshold, and preferences.
 * Grouped in iOS-style sections for a clean, native feel.
 */

import React, { useEffect, useState } from 'react';
import Slider from '@react-native-community/slider';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  getPiConnectionSettings,
  setPiConnectionSettings,
  DEFAULT_PI_IP,
  DEFAULT_PI_PORT,
} from '../services/config';
import {
  pingPi, getConfidenceThreshold, setConfidenceThreshold,
  getMotionSettings, setMotionSettings,
} from '../services/api';

const AUTO_LOCK_KEY        = '@settings_auto_lock';
const MOTION_DETECTION_KEY = '@live_camera_motion_detection';
const MOTION_ALERTS_KEY    = '@live_camera_motion_alerts';

export default function SettingsScreen() {
  const [ip, setIp]               = useState(DEFAULT_PI_IP);
  const [port, setPort]           = useState(DEFAULT_PI_PORT);
  const [editing, setEditing]     = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [autoLock, setAutoLock]   = useState(true);
  const [motionDetection, setMotionDetection] = useState(true);
  const [motionAlerts, setMotionAlerts]       = useState(true);
  const [saved, setSaved]         = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [piOnline, setPiOnline]   = useState<boolean | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await getPiConnectionSettings();
      setIp(settings.ip);
      setPort(settings.port);

      const online = await pingPi();
      setPiOnline(online);

      if (online) {
        try {
          const remote = await getConfidenceThreshold();
          setThreshold(Math.round(remote * 100));
        } catch {}
        try {
          const motion = await getMotionSettings();
          setMotionDetection(motion.motionDetection);
          setMotionAlerts(motion.motionAlerts);
        } catch {}
      }

      const [storedAutoLock, storedMd, storedMa] = await Promise.all([
        AsyncStorage.getItem(AUTO_LOCK_KEY),
        AsyncStorage.getItem(MOTION_DETECTION_KEY),
        AsyncStorage.getItem(MOTION_ALERTS_KEY),
      ]);
      if (storedAutoLock !== null) setAutoLock(storedAutoLock === 'true');
      if (storedMd !== null) setMotionDetection(storedMd === 'true');
      if (storedMa !== null) setMotionAlerts(storedMa === 'true');
      setPrefsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    AsyncStorage.setItem(AUTO_LOCK_KEY, String(autoLock)).catch(() => {});
  }, [autoLock, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    AsyncStorage.setItem(MOTION_DETECTION_KEY, String(motionDetection)).catch(() => {});
    setMotionSettings(motionDetection, undefined).catch(() => {});
  }, [motionDetection, prefsReady]);

  useEffect(() => {
    if (!prefsReady) return;
    AsyncStorage.setItem(MOTION_ALERTS_KEY, String(motionAlerts)).catch(() => {});
    setMotionSettings(undefined, motionAlerts).catch(() => {});
  }, [motionAlerts, prefsReady]);

  const saveConnection = async () => {
    try {
      setConnError(null);
      await setPiConnectionSettings(ip, port);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      const online = await pingPi();
      setPiOnline(online);
    } catch (err) {
      setConnError(err instanceof Error ? err.message : 'Could not save settings.');
    }
  };

  const commitThreshold = async (value: number) => {
    setThreshold(value);
    try {
      await setConfidenceThreshold(value / 100);
    } catch {}
  };

  const connectionColor =
    piOnline === null ? Colors.textTertiary :
    piOnline ? Colors.green : Colors.red;

  const connectionLabel =
    piOnline === null ? 'Checking...' :
    piOnline ? 'Connected' : 'Not connected';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Settings</Text>

      {/* Connection */}
      <Text style={styles.sectionHeader}>CONNECTION</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: connectionColor }]} />
            <Text style={[styles.rowValue, { color: connectionColor }]}>{connectionLabel}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        {editing ? (
          <>
            <View style={styles.inputRow}>
              <View style={{ flex: 3 }}>
                <Text style={styles.inputLabel}>IP Address</Text>
                <TextInput
                  style={styles.input}
                  value={ip}
                  onChangeText={setIp}
                  placeholder="172.20.10.x"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={port}
                  onChangeText={setPort}
                  placeholder="8000"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            {connError && <Text style={styles.errorText}>{connError}</Text>}
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveConnection}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Address</Text>
            <View style={styles.addressWrap}>
              <Text style={styles.addressText}>http://{ip}:{port}</Text>
              <TouchableOpacity style={styles.editPill} onPress={() => setEditing(true)}>
                <Text style={styles.editPillText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {saved && (
          <>
            <View style={styles.divider} />
            <Text style={styles.savedText}>Settings saved</Text>
          </>
        )}
      </View>

      {/* Recognition */}
      <Text style={styles.sectionHeader}>RECOGNITION</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Confidence Threshold</Text>
          <Text style={[styles.rowValue, { color: Colors.accent, fontWeight: '700' }]}>{threshold}%</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={40}
          maximumValue={95}
          step={1}
          minimumTrackTintColor={Colors.accent}
          maximumTrackTintColor={Colors.elevated}
          thumbTintColor={Colors.accent}
          value={threshold}
          onValueChange={setThreshold}
          onSlidingComplete={commitThreshold}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderHint}>More permissive</Text>
          <Text style={styles.sliderHint}>More strict</Text>
        </View>
      </View>

      {/* Preferences */}
      <Text style={styles.sectionHeader}>PREFERENCES</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Motion Detection</Text>
            <Text style={styles.toggleSub}>Trigger face recognition when movement is detected</Text>
          </View>
          <Switch
            value={motionDetection}
            onValueChange={setMotionDetection}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionDetection ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Motion Alerts</Text>
            <Text style={styles.toggleSub}>Receive alerts when motion is detected at the door</Text>
          </View>
          <Switch
            value={motionAlerts}
            onValueChange={setMotionAlerts}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionAlerts ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Auto-lock on unknown face</Text>
            <Text style={styles.toggleSub}>Lock the door when an unrecognized face is detected</Text>
          </View>
          <Switch
            value={autoLock}
            onValueChange={setAutoLock}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={autoLock ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  title:         { ...Typography.largeTitle, marginBottom: Spacing.xxl },
  sectionHeader: { ...Typography.overline, marginBottom: Spacing.sm, marginTop: Spacing.lg, marginLeft: Spacing.xs },

  card:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs, marginBottom: Spacing.xs },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  rowLabel: { fontSize: 15, color: Colors.text },
  rowValue: { fontSize: 15, color: Colors.textSecondary },

  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },

  addressWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addressText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Menlo' },
  editPill:    { backgroundColor: Colors.elevated, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full },
  editPillText:{ fontSize: 12, fontWeight: '600', color: Colors.accent },

  inputRow:   { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.md },
  inputLabel: { ...Typography.caption, marginBottom: 4 },
  input:      { backgroundColor: Colors.elevated, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text, fontSize: 14 },
  errorText:  { fontSize: 12, color: Colors.red, marginBottom: Spacing.sm },
  editActions:{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.md },
  cancelBtn:  { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.elevated, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  saveBtn:    { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center' },
  saveBtnText:{ fontSize: 14, fontWeight: '600', color: '#fff' },
  savedText:  { fontSize: 13, color: Colors.green, paddingVertical: Spacing.sm },

  slider:       { width: '100%', height: 36, marginVertical: Spacing.xs },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Spacing.sm },
  sliderHint:   { ...Typography.caption },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleSub:   { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
});

/**
 * Settings — configure Pi connection, recognition threshold, and preferences.
 * Grouped in iOS-style sections with icons.
 */

import React, { useEffect, useState } from 'react';
import Slider from '@react-native-community/slider';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import {
  getPiConnectionSettings,
  setPiConnectionSettings,
  DEFAULT_PI_IP,
  DEFAULT_PI_PORT,
  DEFAULT_API_KEY,
  getApiKey,
  setApiKey,
} from '../services/config';
import {
  pingPi, getConfidenceThreshold, setConfidenceThreshold,
  getMotionSettings, setMotionSettings,
  getAutoLockSetting, setAutoLockSetting,
} from '../services/api';
import { hapticLight, hapticSuccess } from '../utils/haptics';

const AUTO_LOCK_KEY        = '@settings_auto_lock';
const MOTION_DETECTION_KEY = '@live_camera_motion_detection';
const MOTION_ALERTS_KEY    = '@live_camera_motion_alerts';

export default function SettingsScreen() {
  const [ip, setIp]               = useState(DEFAULT_PI_IP);
  const [port, setPort]           = useState(DEFAULT_PI_PORT);
  const [apiKeyValue, setApiKeyValue] = useState(DEFAULT_API_KEY);
  const [editing, setEditing]     = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [autoLock, setAutoLock]   = useState(true);
  const [motionDetection, setMotionDetection] = useState(true);
  const [motionAlerts, setMotionAlerts]       = useState(true);
  const [connError, setConnError] = useState<string | null>(null);
  const [piOnline, setPiOnline]   = useState<boolean | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await getPiConnectionSettings();
      setIp(settings.ip);
      setPort(settings.port);
      const storedKey = await getApiKey();
      setApiKeyValue(storedKey);
      const online = await pingPi();
      setPiOnline(online);

      if (online) {
        try { const remote = await getConfidenceThreshold(); setThreshold(Math.round(remote * 100)); } catch {}
        try { const motion = await getMotionSettings(); setMotionDetection(motion.motionDetection); setMotionAlerts(motion.motionAlerts); } catch {}
        try { const remoteAutoLock = await getAutoLockSetting(); setAutoLock(remoteAutoLock); } catch {}
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
    setAutoLockSetting(autoLock).catch(() => {});
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
      await setApiKey(apiKeyValue);
      setEditing(false);
      hapticSuccess();
      Toast.show({ type: 'success', text1: 'Settings Saved', text2: 'Connection settings updated.' });
      const online = await pingPi();
      setPiOnline(online);
    } catch (err) {
      setConnError(err instanceof Error ? err.message : 'Could not save settings.');
    }
  };

  const commitThreshold = async (value: number) => {
    setThreshold(value);
    hapticLight();
    try { await setConfidenceThreshold(value / 100); } catch {}
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
      <View style={[styles.card, Shadows.cardSubtle]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.accentSoft }]}>
              <Ionicons name="wifi" size={16} color={Colors.accent} />
            </View>
            <Text style={styles.rowLabel}>Status</Text>
          </View>
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
            <View style={{ paddingVertical: Spacing.xs }}>
              <Text style={styles.inputLabel}>API Key</Text>
              <TextInput
                style={styles.input}
                value={apiKeyValue}
                onChangeText={setApiKeyValue}
                placeholder="API key"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {connError && <Text style={styles.errorText}>{connError}</Text>}
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, Shadows.button]} onPress={saveConnection}>
                <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.rowIcon, { backgroundColor: Colors.greenSoft }]}>
                <Ionicons name="server" size={16} color={Colors.green} />
              </View>
              <Text style={styles.rowLabel}>Address</Text>
            </View>
            <View style={styles.addressWrap}>
              <Text style={styles.addressText}>http://{ip}:{port}</Text>
              <TouchableOpacity style={styles.editPill} onPress={() => { hapticLight(); setEditing(true); }}>
                <Ionicons name="pencil" size={12} color={Colors.accent} style={{ marginRight: 3 }} />
                <Text style={styles.editPillText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Recognition */}
      <Text style={styles.sectionHeader}>RECOGNITION</Text>
      <View style={[styles.card, Shadows.cardSubtle]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.amberSoft }]}>
              <Ionicons name="speedometer" size={16} color={Colors.amber} />
            </View>
            <Text style={styles.rowLabel}>Confidence Threshold</Text>
          </View>
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
      <View style={[styles.card, Shadows.cardSubtle]}>
        <View style={styles.toggleRow}>
          <View style={[styles.rowIcon, { backgroundColor: Colors.accentSoft }]}>
            <Ionicons name="body" size={16} color={Colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Motion Detection</Text>
            <Text style={styles.toggleSub}>Trigger face recognition on movement</Text>
          </View>
          <Switch
            value={motionDetection}
            onValueChange={(v) => { hapticLight(); setMotionDetection(v); }}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionDetection ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={[styles.rowIcon, { backgroundColor: Colors.redSoft }]}>
            <Ionicons name="notifications" size={16} color={Colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Motion Alerts</Text>
            <Text style={styles.toggleSub}>Get alerted when motion is detected</Text>
          </View>
          <Switch
            value={motionAlerts}
            onValueChange={(v) => { hapticLight(); setMotionAlerts(v); }}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={motionAlerts ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={[styles.rowIcon, { backgroundColor: Colors.amberSoft }]}>
            <Ionicons name="lock-closed" size={16} color={Colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Auto-lock on Unknown</Text>
            <Text style={styles.toggleSub}>Lock door when unrecognized face detected</Text>
          </View>
          <Switch
            value={autoLock}
            onValueChange={(v) => { hapticLight(); setAutoLock(v); }}
            trackColor={{ false: Colors.elevated, true: Colors.accentMid }}
            thumbColor={autoLock ? Colors.accent : Colors.textSecondary}
            ios_backgroundColor={Colors.elevated}
          />
        </View>
      </View>

      <View style={{ height: 40 }} />
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
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },

  rowLabel: { fontSize: 15, color: Colors.text },
  rowValue: { fontSize: 15, color: Colors.textSecondary },

  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },

  addressWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addressText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Menlo' },
  editPill:    { backgroundColor: Colors.elevated, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center' },
  editPillText:{ fontSize: 12, fontWeight: '600', color: Colors.accent },

  inputRow:   { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.md },
  inputLabel: { ...Typography.caption, marginBottom: 4 },
  input:      { backgroundColor: Colors.elevated, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  errorText:  { fontSize: 12, color: Colors.red, marginBottom: Spacing.sm },
  editActions:{ flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.md },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.elevated, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  saveBtn:    { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  saveBtnText:{ fontSize: 14, fontWeight: '600', color: '#fff' },

  slider:       { width: '100%', height: 36, marginVertical: Spacing.xs },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: Spacing.sm },
  sliderHint:   { ...Typography.caption },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  toggleSub:   { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
});

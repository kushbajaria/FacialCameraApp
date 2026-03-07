import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Switch,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { PI_BASE_URL } from '../services/api';

export default function SettingsScreen() {
  const [ip, setIp]         = useState('192.168.1.100');
  const [port, setPort]     = useState('8000');
  const [editing, setEditing] = useState(false);
  const [threshold, setThreshold] = useState(55);
  const [autoLock, setAutoLock]   = useState(true);
  const [notifs, setNotifs]       = useState(true);
  const [saved, setSaved]         = useState(false);

  const save = () => {
    // In the real app, persist to AsyncStorage and update api.ts base URL
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>App</Text>
      <Text style={styles.title}>Settings</Text>

      {/* Pi Connection */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Raspberry Pi Connection</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: Colors.textDim }]} />
          <Text style={{ fontSize: 12, color: Colors.textDim }}>Not connected (hardware pending)</Text>
        </View>
        {editing ? (
          <View style={{ gap: 8 }}>
            <View style={styles.ipRow}>
              <TextInput
                style={[styles.input, { flex: 3 }]}
                value={ip}
                onChangeText={setIp}
                placeholder="192.168.1.xxx"
                placeholderTextColor={Colors.textDim}
                keyboardType="numbers-and-punctuation"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={port}
                onChangeText={setPort}
                placeholder="8000"
                placeholderTextColor={Colors.textDim}
                keyboardType="number-pad"
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={save}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.urlRow}>
            <Text style={styles.urlText}>http://{ip}:{port}</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
        {saved && <Text style={{ fontSize: 12, color: Colors.green, marginTop: 6 }}>✓ Saved</Text>}
      </View>

      {/* Recognition */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Recognition</Text>
        <View style={styles.sliderHeader}>
          <Text style={styles.sliderLabel}>Confidence Threshold</Text>
          <Text style={[styles.sliderValue, { color: Colors.accent }]}>{threshold}%</Text>
        </View>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${((threshold - 40) / 55) * 100}%` }]} />
          {/* Native Slider: install @react-native-community/slider */}
          {/* <Slider minimumValue={40} maximumValue={95} value={threshold} onValueChange={setThreshold} /> */}
        </View>
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderHint}>More permissive</Text>
          <Text style={styles.sliderHint}>More strict</Text>
        </View>
      </View>

      {/* Toggles */}
      <View style={styles.section}>
        {[
          { label: 'Auto-lock on unknown face', sub: 'Re-lock immediately if open', value: autoLock, set: setAutoLock },
          { label: 'Push Notifications',        sub: 'Alerts for motion & unknown faces', value: notifs, set: setNotifs },
        ].map(({ label, sub, value, set }) => (
          <View key={label} style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{label}</Text>
              <Text style={styles.toggleSub}>{sub}</Text>
            </View>
            <Switch
              value={value}
              onValueChange={set}
              trackColor={{ false: Colors.surfaceHigh, true: Colors.green }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>About</Text>
        {[
          ['App Version',  '1.0.0'              ],
          ['Pi Model',     'Raspberry Pi 4'      ],
          ['Camera',       'Pi Camera Module v3' ],
          ['Recognition',  'face_recognition lib'],
        ].map(([k, v]) => (
          <View key={k} style={styles.infoRow}>
            <Text style={styles.infoKey}>{k}</Text>
            <Text style={styles.infoVal}>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:        { flex: 1, backgroundColor: Colors.bg },
  container:     { padding: Spacing.xxl, paddingBottom: 40, gap: Spacing.xl },
  eyebrow:       { ...Typography.sectionLabel },
  title:         { ...Typography.screenTitle, marginBottom: 0 },
  section:       { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  sectionLabel:  { ...Typography.sectionLabel },
  statusRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  ipRow:         { flexDirection: 'row', gap: 8 },
  input:         { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 9, color: Colors.text, fontSize: 13 },
  saveBtn:       { backgroundColor: Colors.accent, borderRadius: Radius.sm, padding: 10, alignItems: 'center' },
  saveBtnText:   { color: '#000', fontSize: 13, fontWeight: '700' },
  urlRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urlText:       { fontFamily: 'monospace', fontSize: 13, color: Colors.textMid },
  editBtn:       { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText:   { fontSize: 12, color: Colors.textMid, fontWeight: '600' },
  sliderHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderLabel:   { fontSize: 13, color: Colors.text, fontWeight: '600' },
  sliderValue:   { fontSize: 13, fontWeight: '700' },
  sliderTrack:   { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  sliderFill:    { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  sliderLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  sliderHint:    { fontSize: 10, color: Colors.textDim },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  toggleLabel:   { fontSize: 13, color: Colors.text, fontWeight: '700', marginBottom: 2 },
  toggleSub:     { fontSize: 11, color: Colors.textDim },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoKey:       { fontSize: 13, color: Colors.textMid },
  infoVal:       { fontSize: 13, color: Colors.text, fontWeight: '600' },
});

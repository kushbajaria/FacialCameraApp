import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, RefreshControl,
} from 'react-native';
import { type PhotoFile } from 'react-native-vision-camera';
import { Colors, Spacing, Radius, Typography } from '../theme';
import FaceCaptureModal from '../components/FaceCaptureModal';
import {
  getMembers,
  addMember,
  removeMember,
  startMemberFaceEnrollment,
  uploadMemberFaceEnrollmentCapture,
  pollMemberFaceEnrollment,
  completeMemberFaceEnrollment,
  cancelMemberFaceEnrollment,
  removeMemberFaceTemplate,
  FaceCaptureAngle,
  Member,
} from '../services/api';

const AVATAR_COLORS = ['#4ADE80', '#60A5FA', '#F472B6', '#A78BFA', '#FBBF24', '#34D399'];

function initials(name: string): string {
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type CaptureStep = {
  angle: FaceCaptureAngle;
  label: string;
  guidance: string;
};

const CAPTURE_STEPS: CaptureStep[] = [
  { angle: 'front', label: 'Front', guidance: 'Center your face and look directly at the camera.' },
  { angle: 'left', label: 'Left', guidance: 'Turn your head slightly left and keep your face in frame.' },
  { angle: 'right', label: 'Right', guidance: 'Turn your head slightly right and keep your face in frame.' },
];

export default function MembersScreen() {
  const [members, setMembers]   = useState<Member[]>([]);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newRole, setNewRole]   = useState<'Member' | 'Owner'>('Member');
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [enrollingMemberId, setEnrollingMemberId] = useState<string | null>(null);
  const [enrollmentProgress, setEnrollmentProgress] = useState<Record<string, number>>({});
  const [enrollmentMessage, setEnrollmentMessage] = useState<Record<string, string>>({});
  const [captureModalVisible, setCaptureModalVisible] = useState(false);
  const [captureSession, setCaptureSession] = useState<{ member: Member; sessionId: string } | null>(null);
  const [captureStepIndex, setCaptureStepIndex] = useState(0);
  const [captureBusy, setCaptureBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await getMembers();
    setMembers(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const member = await addMember(newName.trim(), newRole);
      setMembers(m => [...m, member]);
      setNewName('');
      setShowAdd(false);
    } catch (e) {
      Alert.alert('Error', 'Could not add member. Check Pi connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (member: Member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name}? They will no longer have door access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await removeMember(member.id);
            setMembers(m => m.filter(x => x.id !== member.id));
          },
        },
      ]
    );
  };

  const clearEnrollmentUi = (memberId: string, delayMs = 1500) => {
    setTimeout(() => {
      setEnrollmentProgress(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      setEnrollmentMessage(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    }, delayMs);
    setEnrollingMemberId(null);
    setCaptureSession(null);
    setCaptureStepIndex(0);
    setCaptureModalVisible(false);
    setCaptureBusy(false);
  };

  const finalizeEnrollment = async (member: Member, sessionId: string) => {
    let latest = await pollMemberFaceEnrollment(member.id, sessionId);
    let attempts = 0;
    while (latest.status !== 'completed' && latest.status !== 'failed' && latest.status !== 'cancelled' && attempts < 6) {
      setEnrollmentProgress(prev => ({ ...prev, [member.id]: latest.progress }));
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: latest.message }));
      await new Promise(r => setTimeout(r, 600));
      latest = await pollMemberFaceEnrollment(member.id, sessionId);
      attempts += 1;
    }

    if (latest.status !== 'completed') {
      throw new Error(latest.message || 'Face enrollment did not complete.');
    }

    const updatedMember = await completeMemberFaceEnrollment(member.id, sessionId);
    setMembers(prev => prev.map(m => (m.id === member.id ? updatedMember : m)));
    setEnrollmentProgress(prev => ({ ...prev, [member.id]: 100 }));
    setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Enrollment completed and encrypted template stored.' }));
  };

  const handleEnrollFace = async (member: Member) => {
    if (enrollingMemberId) return;
    setEnrollingMemberId(member.id);
    setEnrollmentProgress(prev => ({ ...prev, [member.id]: 0 }));
    setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Starting secure enrollment session...' }));
    try {
      const session = await startMemberFaceEnrollment(member.id);
      setCaptureSession({ member, sessionId: session.sessionId });
      setCaptureStepIndex(0);
      setCaptureModalVisible(true);
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Live camera ready. Capture the first angle.' }));
    } catch (e) {
      Alert.alert('Face Enrollment Failed', e instanceof Error ? e.message : 'Unable to start face enrollment right now.');
      clearEnrollmentUi(member.id, 0);
    }
  };

  const handleCaptureFromModal = async (photo: PhotoFile) => {
    if (!captureSession) return;
    const { member, sessionId } = captureSession;
    const step = CAPTURE_STEPS[captureStepIndex] ?? CAPTURE_STEPS[0];
    const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;

    setCaptureBusy(true);
    try {
      const uploaded = await uploadMemberFaceEnrollmentCapture(
        member.id,
        sessionId,
        {
          uri,
          type: 'image/jpeg',
          fileName: `face-${step.angle}-${Date.now()}.jpg`,
        },
        step.angle,
      );
      setEnrollmentProgress(prev => ({ ...prev, [member.id]: uploaded.progress }));
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: uploaded.message }));

      if (captureStepIndex < CAPTURE_STEPS.length - 1) {
        setCaptureStepIndex(prev => prev + 1);
        return;
      }

      setCaptureModalVisible(false);
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Processing secure face template...' }));
      await finalizeEnrollment(member, sessionId);
      clearEnrollmentUi(member.id, 1500);
    } catch (e) {
      try {
        await cancelMemberFaceEnrollment(member.id, sessionId);
      } catch {
        // Ignore cancellation failures and preserve original error.
      }
      Alert.alert('Face Enrollment Failed', e instanceof Error ? e.message : 'Unable to enroll face right now.');
      clearEnrollmentUi(member.id, 0);
    }
  };

  const handleCancelCaptureModal = async () => {
    if (!captureSession) return;
    const { member, sessionId } = captureSession;
    setCaptureBusy(true);
    try {
      await cancelMemberFaceEnrollment(member.id, sessionId);
    } catch {
      // Keep UI responsive even if cancellation fails.
    }
    Alert.alert('Enrollment Cancelled', 'Face scan was cancelled before completion.');
    clearEnrollmentUi(member.id, 0);
  };

  const handleRemoveFaceTemplate = (member: Member) => {
    Alert.alert(
      'Remove Face Template',
      `Delete ${member.name}'s enrolled face template? They will no longer pass face recognition until re-enrolled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await removeMemberFaceTemplate(member.id);
              setMembers(prev => prev.map(m => (m.id === member.id ? updated : m)));
            } catch {
              Alert.alert('Error', 'Could not remove face template. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Authorized</Text>
          <Text style={styles.title}>Members</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(v => !v)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Add Form */}
      {showAdd && (
        <View style={styles.addForm}>
          <Text style={styles.formTitle}>New Member</Text>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Full name"
            placeholderTextColor={Colors.textDim}
          />
          <View style={styles.roleRow}>
            {(['Member', 'Owner'] as const).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.roleBtn, newRole === r && styles.roleBtnActive]}
                onPress={() => setNewRole(r)}
              >
                <Text style={[styles.roleBtnText, newRole === r && styles.roleBtnTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={loading}>
              <Text style={styles.saveBtnText}>{loading ? 'Adding...' : 'Add Member'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.formNote}>
            📸 Face photo upload available when Pi is connected
          </Text>
        </View>
      )}

      {/* Member Cards */}
      {members.map((m, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const isEnrolling = enrollingMemberId === m.id;
        const progress = enrollmentProgress[m.id] ?? null;
        const message = enrollmentMessage[m.id] ?? null;
        return (
          <View key={m.id} style={styles.card}>
            <View style={[styles.avatar, { backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
              <Text style={[styles.avatarText, { color }]}>{initials(m.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={styles.memberSub}>
                {m.role} · Added {new Date(m.addedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <View style={styles.faceStatusRow}>
                <View style={[styles.faceStatusPill, m.faceEnrolled ? styles.faceStatusEnrolled : styles.faceStatusMissing]}>
                  <Text style={[styles.faceStatusText, m.faceEnrolled ? styles.faceStatusTextEnrolled : styles.faceStatusTextMissing]}>
                    {m.faceEnrolled ? 'FACE ENROLLED' : 'NO FACE PROFILE'}
                  </Text>
                </View>
                {m.faceEnrolled && m.lastEnrolledAt && (
                  <Text style={styles.enrollMeta}>Updated {new Date(m.lastEnrolledAt).toLocaleDateString()}</Text>
                )}
              </View>
              {isEnrolling && progress !== null && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>{Math.round(progress)}% · {message}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardRight}>
              <View style={[styles.rolePill, m.role === 'Owner' && styles.rolePillOwner]}>
                <Text style={[styles.rolePillText, m.role === 'Owner' && styles.rolePillTextOwner]}>
                  {m.role.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleEnrollFace(m)}
                style={[styles.faceActionBtn, isEnrolling && styles.faceActionBtnDisabled]}
                disabled={isEnrolling || !!enrollingMemberId}
              >
                <Text style={styles.faceActionBtnText}>
                  {isEnrolling ? 'Scanning...' : m.faceEnrolled ? 'Re-scan Face' : 'Scan Face'}
                </Text>
              </TouchableOpacity>
              {m.faceEnrolled && (
                <TouchableOpacity onPress={() => handleRemoveFaceTemplate(m)} style={styles.faceRemoveBtn}>
                  <Text style={styles.faceRemoveText}>Remove Face</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleRemove(m)} style={styles.deleteBtn}>
                <Text style={{ color: Colors.red, fontSize: 14 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={{ fontSize: 20 }}>💡</Text>
        <Text style={styles.infoText}>
          Members are granted door access via facial recognition. Start a secure scan to enroll or refresh each member's face profile. In production, templates are generated on the backend and stored encrypted at rest.
        </Text>
      </View>

      {captureSession && (
        <FaceCaptureModal
          visible={captureModalVisible}
          memberName={captureSession.member.name}
          stepLabel={CAPTURE_STEPS[captureStepIndex]?.label || CAPTURE_STEPS[0].label}
          guidance={CAPTURE_STEPS[captureStepIndex]?.guidance || CAPTURE_STEPS[0].guidance}
          busy={captureBusy}
          onCapture={handleCaptureFromModal}
          onCancel={handleCancelCaptureModal}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:             { flex: 1, backgroundColor: Colors.bg },
  container:          { padding: Spacing.xxl, paddingBottom: 40, gap: Spacing.md },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow:            { ...Typography.sectionLabel, marginBottom: 4 },
  title:              { ...Typography.screenTitle },
  addBtn:             { backgroundColor: Colors.accentDim, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)' },
  addBtnText:         { color: Colors.accent, fontSize: 13, fontWeight: '700' },
  addForm:            { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', gap: Spacing.md },
  formTitle:          { fontSize: 14, fontWeight: '700', color: Colors.text },
  input:              { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.text, fontSize: 14 },
  roleRow:            { flexDirection: 'row', gap: 8 },
  roleBtn:            { flex: 1, padding: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceHigh, alignItems: 'center' },
  roleBtnActive:      { borderColor: Colors.accent, backgroundColor: Colors.accentDim },
  roleBtnText:        { fontSize: 13, fontWeight: '600', color: Colors.textMid },
  roleBtnTextActive:  { color: Colors.accent },
  formActions:        { flexDirection: 'row', gap: 8 },
  cancelBtn:          { flex: 1, padding: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText:      { color: Colors.textMid, fontSize: 13, fontWeight: '600' },
  saveBtn:            { flex: 2, padding: 10, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center' },
  saveBtnText:        { color: '#000', fontSize: 13, fontWeight: '700' },
  formNote:           { fontSize: 11, color: Colors.textDim, textAlign: 'center' },
  card:               { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  avatar:             { width: 46, height: 46, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText:         { fontSize: 15, fontWeight: '800' },
  memberName:         { fontSize: 15, fontWeight: '700', color: Colors.text },
  memberSub:          { fontSize: 11, color: Colors.textDim, marginTop: 2 },
  faceStatusRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  faceStatusPill:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  faceStatusEnrolled: { backgroundColor: Colors.greenDim, borderColor: `${Colors.green}55` },
  faceStatusMissing:  { backgroundColor: Colors.redDim, borderColor: `${Colors.red}55` },
  faceStatusText:     { ...Typography.badge },
  faceStatusTextEnrolled: { color: Colors.green },
  faceStatusTextMissing:  { color: Colors.red },
  enrollMeta:         { fontSize: 10, color: Colors.textDim },
  progressWrap:       { marginTop: 8, gap: 4 },
  progressTrack:      { height: 6, borderRadius: 4, backgroundColor: Colors.surfaceHigh, overflow: 'hidden' },
  progressFill:       { height: '100%', backgroundColor: Colors.accent },
  progressLabel:      { fontSize: 10, color: Colors.textDim },
  cardRight:          { alignItems: 'flex-end', gap: 6 },
  rolePill:           { backgroundColor: Colors.surfaceHigh, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  rolePillOwner:      { backgroundColor: Colors.accentDim, borderColor: 'rgba(0,212,255,0.2)' },
  rolePillText:       { ...Typography.badge, color: Colors.textMid },
  rolePillTextOwner:  { color: Colors.accent },
  faceActionBtn:      { backgroundColor: Colors.accentDim, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${Colors.accent}66` },
  faceActionBtnDisabled: { opacity: 0.6 },
  faceActionBtnText:  { fontSize: 11, color: Colors.accent, fontWeight: '700' },
  faceRemoveBtn:      { paddingHorizontal: 6, paddingVertical: 2 },
  faceRemoveText:     { fontSize: 11, color: Colors.red, fontWeight: '600' },
  deleteBtn:          { padding: 4 },
  infoBox:            { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'flex-start' },
  infoText:           { flex: 1, fontSize: 12, color: Colors.textMid, lineHeight: 18 },
});

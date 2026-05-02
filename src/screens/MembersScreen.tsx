/**
 * Members — manage household members authorized to unlock the door.
 * Enrollment via MacBook webcam or Pi camera with step-by-step UX.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, RefreshControl, Animated, Easing,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme';
import {
  getMembers, addMember, removeMember,
  startMemberFaceEnrollment,
  startMacbookCapture, pollMacbookCaptureStatus,
  transferMacbookCaptureToPi,
  piCameraCapture, completePiEnrollment,
  removeMemberFaceTemplate,
  Member,
} from '../services/api';
import { hapticLight, hapticMedium, hapticSuccess, hapticError, hapticWarning } from '../utils/haptics';

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4'];

function initials(name: string): string {
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const ENROLLMENT_TIMEOUT_MS = 60_000;
const ANGLES = ['front', 'left', 'right'] as const;
const ANGLE_ICONS: Record<string, string> = { front: 'person', left: 'arrow-back', right: 'arrow-forward' };
const ANGLE_LABELS: Record<string, string> = {
  front: 'Look straight at the camera',
  left: 'Turn your head slightly LEFT',
  right: 'Turn your head slightly RIGHT',
};

// Skeleton shimmer
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

export default function MembersScreen() {
  const [members, setMembers]   = useState<Member[]>([]);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newRole, setNewRole]   = useState<'Member' | 'Owner'>('Member');
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const [enrollingMemberId, setEnrollingMemberId] = useState<string | null>(null);
  const [enrollmentProgress, setEnrollmentProgress] = useState<Record<string, number>>({});
  const [enrollmentMessage, setEnrollmentMessage]   = useState<Record<string, string>>({});
  const [enrollmentStep, setEnrollmentStep] = useState<Record<string, number>>({}); // 0, 1, 2

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers());
    } catch {
      Toast.show({ type: 'error', text1: 'Connection Error', text2: 'Could not load members. Check Pi connection.' });
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    hapticLight();
    setLoading(true);
    try {
      const member = await addMember(newName.trim(), newRole);
      setMembers(prev => [...prev, member]);
      setNewName('');
      setNewRole('Member');
      setShowAdd(false);
      hapticSuccess();
      Toast.show({ type: 'success', text1: 'Member Added', text2: `${member.name} can now be enrolled for face access.` });
    } catch {
      hapticError();
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not add member. Check Pi connection.' });
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
            hapticWarning();
            await removeMember(member.id);
            setMembers(prev => prev.filter(m => m.id !== member.id));
            Toast.show({ type: 'success', text1: 'Member Removed', text2: `${member.name} has been removed.` });
          },
        },
      ],
    );
  };

  const clearEnrollmentUi = (memberId: string, delayMs = 1500) => {
    setTimeout(() => {
      setEnrollmentProgress(prev => { const n = { ...prev }; delete n[memberId]; return n; });
      setEnrollmentMessage(prev =>  { const n = { ...prev }; delete n[memberId]; return n; });
      setEnrollmentStep(prev =>     { const n = { ...prev }; delete n[memberId]; return n; });
    }, delayMs);
    setEnrollingMemberId(null);
  };

  const handleEnrollFace = async (member: Member) => {
    if (enrollingMemberId) return;
    hapticMedium();
    setEnrollingMemberId(member.id);
    setEnrollmentProgress(prev => ({ ...prev, [member.id]: 5 }));
    setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Opening MacBook camera...' }));
    setEnrollmentStep(prev => ({ ...prev, [member.id]: 0 }));

    try {
      try {
        await startMacbookCapture(member.id, 'pending');
      } catch {
        throw new Error('Could not reach MacBook enrollment server. Make sure enroll_server.py is running.');
      }

      const deadline = Date.now() + ENROLLMENT_TIMEOUT_MS;
      let allCaptured = false;

      while (!allCaptured) {
        if (Date.now() > deadline) throw new Error('Enrollment timed out. Try again.');
        await new Promise(r => setTimeout(r, 800));
        let status: { status: string; progress: number; message: string; capturedAngles?: string[] };
        try { status = await pollMacbookCaptureStatus(); } catch { continue; }

        const capturedAngles = status.capturedAngles || [];
        setEnrollmentStep(prev => ({ ...prev, [member.id]: Math.min(capturedAngles.length, 3) }));
        setEnrollmentProgress(prev => ({ ...prev, [member.id]: Math.min(status.progress, 60) }));
        setEnrollmentMessage(prev => ({ ...prev, [member.id]: status.message }));

        if (status.status === 'error') throw new Error(status.message);
        if (capturedAngles.length >= 3 || status.status === 'captured_all') allCaptured = true;
      }

      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Connecting to Pi...' }));
      setEnrollmentProgress(prev => ({ ...prev, [member.id]: 65 }));

      let session;
      try { session = await startMemberFaceEnrollment(member.id); }
      catch { throw new Error('Photos captured but could not reach the Pi. Check Pi connection.'); }

      const anglesToUpload = ['front', 'left', 'right'];
      for (let i = 0; i < anglesToUpload.length; i++) {
        const angle = anglesToUpload[i];
        setEnrollmentMessage(prev => ({ ...prev, [member.id]: `Uploading ${angle} to Pi... (${i + 1}/3)` }));
        setEnrollmentProgress(prev => ({ ...prev, [member.id]: 70 + i * 8 }));
        try { await transferMacbookCaptureToPi(member.id, session.sessionId, angle); }
        catch { throw new Error(`Failed to upload ${angle} photo to Pi.`); }
      }

      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Finalizing enrollment...' }));
      setEnrollmentProgress(prev => ({ ...prev, [member.id]: 95 }));
      const { member: updated } = await completePiEnrollment(member.id, session.sessionId);
      setMembers(prev => prev.map(m => m.id === member.id ? updated : m));

      setEnrollmentProgress(prev => ({ ...prev, [member.id]: 100 }));
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Face enrolled!' }));
      hapticSuccess();
      Toast.show({ type: 'success', text1: 'Enrollment Complete', text2: `${member.name} will now be recognized at the door.` });
      clearEnrollmentUi(member.id, 2000);
    } catch (e) {
      hapticError();
      const msg = e instanceof Error ? e.message : 'Unable to enroll face.';
      Toast.show({ type: 'error', text1: 'Enrollment Failed', text2: msg });
      clearEnrollmentUi(member.id, 0);
    }
  };

  const handlePiEnrollFace = async (member: Member) => {
    if (enrollingMemberId) return;
    hapticMedium();
    setEnrollingMemberId(member.id);
    setEnrollmentProgress(prev => ({ ...prev, [member.id]: 5 }));
    setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Starting enrollment...' }));
    setEnrollmentStep(prev => ({ ...prev, [member.id]: 0 }));

    try {
      const session = await startMemberFaceEnrollment(member.id);

      for (let i = 0; i < ANGLES.length; i++) {
        const angle = ANGLES[i];
        setEnrollmentStep(prev => ({ ...prev, [member.id]: i }));
        setEnrollmentMessage(prev => ({ ...prev, [member.id]: `${ANGLE_LABELS[angle]} (${i + 1}/3)` }));
        setEnrollmentProgress(prev => ({ ...prev, [member.id]: 10 + i * 25 }));

        await new Promise(r => setTimeout(r, 3000));
        const result = await piCameraCapture(member.id, session.sessionId, angle);
        setEnrollmentProgress(prev => ({ ...prev, [member.id]: result.progress }));
        setEnrollmentMessage(prev => ({ ...prev, [member.id]: result.message }));

        if (result.message.toLowerCase().includes('no face')) {
          i--;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }

      setEnrollmentStep(prev => ({ ...prev, [member.id]: 3 }));
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Finalizing enrollment...' }));
      setEnrollmentProgress(prev => ({ ...prev, [member.id]: 95 }));

      const { member: updated } = await completePiEnrollment(member.id, session.sessionId);
      setMembers(prev => prev.map(m => m.id === member.id ? updated : m));

      setEnrollmentProgress(prev => ({ ...prev, [member.id]: 100 }));
      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Face enrolled!' }));
      hapticSuccess();
      Toast.show({ type: 'success', text1: 'Enrollment Complete', text2: `${member.name} will now be recognized at the door.` });
      clearEnrollmentUi(member.id, 2000);
    } catch (e) {
      hapticError();
      const msg = e instanceof Error ? e.message : 'Pi camera enrollment failed.';
      Toast.show({ type: 'error', text1: 'Enrollment Failed', text2: msg });
      clearEnrollmentUi(member.id, 0);
    }
  };

  const showEnrollOptions = (member: Member) => {
    Alert.alert(
      'Enroll Face',
      'Choose the camera to use for face enrollment.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Door Camera (Pi)', onPress: () => handlePiEnrollFace(member) },
        { text: 'MacBook Camera', onPress: () => handleEnrollFace(member) },
      ],
    );
  };

  const handleRemoveFaceTemplate = (member: Member) => {
    Alert.alert(
      'Remove Face Data',
      `Delete ${member.name}'s face profile? They won't be recognized until re-enrolled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            hapticWarning();
            try {
              const updated = await removeMemberFaceTemplate(member.id);
              setMembers(prev => prev.map(m => m.id === member.id ? updated : m));
              Toast.show({ type: 'success', text1: 'Face Data Removed', text2: `${member.name}'s face profile has been deleted.` });
            } catch {
              Toast.show({ type: 'error', text1: 'Error', text2: 'Could not remove face template.' });
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Members</Text>
        <TouchableOpacity
          style={[styles.addBtn, showAdd && styles.addBtnCancel]}
          onPress={() => { hapticLight(); setShowAdd(v => !v); }}
        >
          <Ionicons name={showAdd ? 'close' : 'add'} size={18} color="#fff" />
          <Text style={styles.addBtnText}>{showAdd ? 'Cancel' : 'Add'}</Text>
        </TouchableOpacity>
      </View>

      {/* Add form */}
      {showAdd && (
        <View style={[styles.formCard, Shadows.card]}>
          <Text style={styles.formTitle}>New Member</Text>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Full name"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
          />
          <View style={styles.roleRow}>
            {(['Member', 'Owner'] as const).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, newRole === r && styles.roleChipActive]}
                onPress={() => { hapticLight(); setNewRole(r); }}
              >
                <Ionicons
                  name={r === 'Owner' ? 'shield-checkmark' : 'person'}
                  size={14}
                  color={newRole === r ? Colors.accent : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.roleChipText, newRole === r && styles.roleChipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, Shadows.button, (!newName.trim() || loading) && { opacity: 0.5 }]}
            onPress={handleAdd}
            disabled={loading || !newName.trim()}
          >
            <Ionicons name="person-add" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>{loading ? 'Adding...' : 'Add Member'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Member list */}
      {initialLoad ? (
        <View style={{ gap: Spacing.md }}>
          {[1,2].map(i => (
            <View key={i} style={[styles.memberCard, Shadows.cardSubtle]}>
              <View style={styles.memberRow}>
                <Skeleton width={48} height={48} style={{ borderRadius: 16 }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width={120} height={16} />
                  <Skeleton width={60} height={11} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : members.length === 0 && !showAdd ? (
        <View style={[styles.emptyState, Shadows.cardSubtle]}>
          <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Members Yet</Text>
          <Text style={styles.emptySub}>Add household members to grant them door access</Text>
          <TouchableOpacity style={[styles.emptyBtn, Shadows.button]} onPress={() => { hapticLight(); setShowAdd(true); }}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>Add First Member</Text>
          </TouchableOpacity>
        </View>
      ) : (
        members.map((m, i) => {
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          const isEnrolling = enrollingMemberId === m.id;
          const progress = enrollmentProgress[m.id] ?? null;
          const message  = enrollmentMessage[m.id] ?? null;
          const step = enrollmentStep[m.id] ?? 0;

          return (
            <View key={m.id} style={[styles.memberCard, Shadows.cardSubtle]}>
              {/* Top row: avatar + info */}
              <View style={styles.memberRow}>
                <View style={[styles.avatar, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.avatarText, { color }]}>{initials(m.name)}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <View style={styles.memberMetaRow}>
                    <Ionicons name={m.role === 'Owner' ? 'shield-checkmark' : 'person'} size={11} color={Colors.textTertiary} />
                    <Text style={styles.memberMeta}>{m.role}</Text>
                    <Text style={styles.memberMetaDot}>{'\u00B7'}</Text>
                    <Text style={styles.memberMeta}>Added {new Date(m.addedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                  {m.faceEnrolled && m.lastEnrolledAt && (
                    <View style={styles.memberMetaRow}>
                      <Ionicons name="scan-outline" size={11} color={Colors.textTertiary} />
                      <Text style={styles.memberMeta}>Last enrolled {new Date(m.lastEnrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.enrollBadge, { backgroundColor: m.faceEnrolled ? Colors.greenSoft : Colors.redSoft }]}>
                  <Ionicons
                    name={m.faceEnrolled ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={m.faceEnrolled ? Colors.green : Colors.red}
                  />
                  <Text style={[styles.enrollBadgeText, { color: m.faceEnrolled ? Colors.green : Colors.red }]}>
                    {m.faceEnrolled ? 'Enrolled' : 'Not enrolled'}
                  </Text>
                </View>
              </View>

              {/* Step indicator during enrollment */}
              {isEnrolling && progress !== null && (
                <View style={styles.enrollmentSection}>
                  {/* 3-step indicator */}
                  <View style={styles.stepRow}>
                    {ANGLES.map((angle, idx) => {
                      const done = step > idx;
                      const active = step === idx;
                      return (
                        <React.Fragment key={angle}>
                          {idx > 0 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
                          <View style={[styles.stepCircle, done && styles.stepDone, active && styles.stepActive]}>
                            {done ? (
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            ) : (
                              <Ionicons name={ANGLE_ICONS[angle]} size={14} color={active ? Colors.accent : Colors.textTertiary} />
                            )}
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>

                  {/* Progress bar */}
                  <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{message}</Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionPrimary]}
                  onPress={() => showEnrollOptions(m)}
                  disabled={isEnrolling || !!enrollingMemberId}
                >
                  <Ionicons name={m.faceEnrolled ? 'refresh' : 'scan'} size={14} color={Colors.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.actionPrimaryText}>
                    {isEnrolling ? 'Scanning...' : m.faceEnrolled ? 'Re-scan' : 'Enroll Face'}
                  </Text>
                </TouchableOpacity>
                {m.faceEnrolled && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSecondary]}
                    onPress={() => handleRemoveFaceTemplate(m)}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.actionSecondaryText}>Remove</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionDanger]}
                  onPress={() => handleRemove(m)}
                >
                  <Ionicons name="person-remove-outline" size={14} color={Colors.red} style={{ marginRight: 4 }} />
                  <Text style={styles.actionDangerText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title:      { ...Typography.largeTitle },
  addBtn:     { backgroundColor: Colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnCancel: { backgroundColor: Colors.elevated },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Add form
  formCard:    { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.xl, gap: Spacing.md },
  formTitle:   { ...Typography.headline, marginBottom: Spacing.xs },
  input:       { backgroundColor: Colors.elevated, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: 14, color: Colors.text, fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  roleRow:     { flexDirection: 'row', gap: Spacing.sm },
  roleChip:    { flex: 1, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.elevated, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  roleChipActive:     { backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accent },
  roleChipText:       { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  roleChipTextActive: { color: Colors.accent },
  submitBtn:     { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg },
  emptyTitle: { ...Typography.headline },
  emptySub:   { ...Typography.footnote, textAlign: 'center', paddingHorizontal: Spacing.xxl },
  emptyBtn:   { backgroundColor: Colors.accent, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Member cards
  memberCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  memberRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:      { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '800' },
  memberInfo:  { flex: 1 },
  memberName:  { fontSize: 16, fontWeight: '700', color: Colors.text },
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  memberMeta:  { fontSize: 11, fontWeight: '500', color: Colors.textTertiary, letterSpacing: 0.3 },
  memberMetaDot: { fontSize: 11, color: Colors.textTertiary, marginHorizontal: 2 },

  // Enrollment badge
  enrollBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  enrollBadgeText: { fontSize: 11, fontWeight: '600' },

  // Enrollment steps
  enrollmentSection: { marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, gap: Spacing.md },
  stepRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl },
  stepCircle:  { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.border },
  stepDone:    { backgroundColor: Colors.green, borderColor: Colors.green },
  stepActive:  { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  stepLine:    { flex: 1, height: 2, backgroundColor: Colors.border, marginHorizontal: Spacing.xs },
  stepLineDone:{ backgroundColor: Colors.green },

  // Progress
  progressTrack:   { height: 4, borderRadius: 2, backgroundColor: Colors.elevated, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  progressText:    { fontSize: 12, fontWeight: '500', color: Colors.textSecondary, textAlign: 'center' },

  // Actions
  actionsRow:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  actionBtn:         { paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center' },
  actionPrimary:     { backgroundColor: Colors.accentSoft, flex: 1, justifyContent: 'center' },
  actionPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  actionSecondary:   { backgroundColor: Colors.elevated },
  actionSecondaryText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actionDanger:      { backgroundColor: Colors.redSoft },
  actionDangerText:  { fontSize: 13, fontWeight: '600', color: Colors.red },
});

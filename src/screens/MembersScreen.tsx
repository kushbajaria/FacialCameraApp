/**
 * Members — manage household members authorized to unlock the door.
 *
 * Face enrollment uses the MacBook enrollment server: tapping "Enroll Face"
 * creates a session on the Pi, triggers the MacBook webcam, and polls
 * until all 3 angles are captured.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import {
  getMembers, addMember, removeMember,
  startMemberFaceEnrollment,
  startMacbookCapture, pollMacbookCaptureStatus,
  removeMemberFaceTemplate,
  Member,
} from '../services/api';

const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4'];

function initials(name: string): string {
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const ENROLLMENT_TIMEOUT_MS = 60_000;

export default function MembersScreen() {
  const [members, setMembers]   = useState<Member[]>([]);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newRole, setNewRole]   = useState<'Member' | 'Owner'>('Member');
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [enrollingMemberId, setEnrollingMemberId] = useState<string | null>(null);
  const [enrollmentProgress, setEnrollmentProgress] = useState<Record<string, number>>({});
  const [enrollmentMessage, setEnrollmentMessage]   = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers());
    } catch {
      Alert.alert('Error', 'Could not load members. Check Pi connection.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const member = await addMember(newName.trim(), newRole);
      setMembers(prev => [...prev, member]);
      setNewName('');
      setNewRole('Member');
      setShowAdd(false);
    } catch {
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
            setMembers(prev => prev.filter(m => m.id !== member.id));
          },
        },
      ],
    );
  };

  const clearEnrollmentUi = (memberId: string, delayMs = 1500) => {
    setTimeout(() => {
      setEnrollmentProgress(prev => { const n = { ...prev }; delete n[memberId]; return n; });
      setEnrollmentMessage(prev =>  { const n = { ...prev }; delete n[memberId]; return n; });
    }, delayMs);
    setEnrollingMemberId(null);
  };

  const handleEnrollFace = async (member: Member) => {
    if (enrollingMemberId) return;
    setEnrollingMemberId(member.id);
    setEnrollmentProgress(prev => ({ ...prev, [member.id]: 5 }));
    setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Starting enrollment...' }));

    try {
      const session = await startMemberFaceEnrollment(member.id);

      setEnrollmentMessage(prev => ({ ...prev, [member.id]: 'Opening MacBook camera...' }));
      await startMacbookCapture(member.id, session.sessionId);

      const deadline = Date.now() + ENROLLMENT_TIMEOUT_MS;
      let done = false;

      while (!done) {
        if (Date.now() > deadline) {
          throw new Error('Enrollment timed out. Try again.');
        }

        await new Promise(r => setTimeout(r, 800));

        let status: { status: string; progress: number; message: string; member?: Member };
        try {
          status = await pollMacbookCaptureStatus();
        } catch {
          continue;
        }

        setEnrollmentProgress(prev => ({ ...prev, [member.id]: status.progress }));
        setEnrollmentMessage(prev => ({ ...prev, [member.id]: status.message }));

        if (status.status === 'completed') {
          if (status.member) {
            setMembers(prev => prev.map(m => m.id === member.id ? status.member! : m));
          } else {
            await load();
          }
          clearEnrollmentUi(member.id, 2000);
          done = true;
        } else if (status.status === 'error') {
          throw new Error(status.message);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to enroll face.';
      if (msg.includes('Network Error') || msg.includes('timeout')) {
        Alert.alert('Enrollment Failed', 'Could not reach the enrollment server. Make sure it is running.');
      } else {
        Alert.alert('Enrollment Failed', msg);
      }
      clearEnrollmentUi(member.id, 0);
    }
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
            try {
              const updated = await removeMemberFaceTemplate(member.id);
              setMembers(prev => prev.map(m => m.id === member.id ? updated : m));
            } catch {
              Alert.alert('Error', 'Could not remove face template.');
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
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(v => !v)}>
          <Text style={styles.addBtnText}>{showAdd ? 'Cancel' : '+ Add'}</Text>
        </TouchableOpacity>
      </View>

      {/* Add form */}
      {showAdd && (
        <View style={styles.formCard}>
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
                onPress={() => setNewRole(r)}
              >
                <Text style={[styles.roleChipText, newRole === r && styles.roleChipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={handleAdd} disabled={loading || !newName.trim()}>
            <Text style={styles.submitBtnText}>{loading ? 'Adding...' : 'Add Member'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Member list */}
      {members.length === 0 && !showAdd && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No members yet</Text>
          <Text style={styles.emptySub}>Tap + Add to grant someone door access</Text>
        </View>
      )}

      {members.map((m, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const isEnrolling = enrollingMemberId === m.id;
        const progress = enrollmentProgress[m.id] ?? null;
        const message  = enrollmentMessage[m.id] ?? null;

        return (
          <View key={m.id} style={styles.memberCard}>
            {/* Top row: avatar + info */}
            <View style={styles.memberRow}>
              <View style={[styles.avatar, { backgroundColor: `${color}20` }]}>
                <Text style={[styles.avatarText, { color }]}>{initials(m.name)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberMeta}>{m.role}</Text>
              </View>
            </View>

            {/* Face enrollment status */}
            <View style={styles.enrollSection}>
              <View style={styles.enrollStatus}>
                <Text style={[styles.enrollStatusIcon, { color: m.faceEnrolled ? Colors.green : Colors.textTertiary }]}>
                  {m.faceEnrolled ? '✓' : '○'}
                </Text>
                <Text style={[styles.enrollStatusText, { color: m.faceEnrolled ? Colors.green : Colors.textTertiary }]}>
                  {m.faceEnrolled ? 'Face enrolled' : 'No face profile'}
                </Text>
              </View>
            </View>

            {/* Progress bar during enrollment */}
            {isEnrolling && progress !== null && (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{message}</Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={() => handleEnrollFace(m)}
                disabled={isEnrolling || !!enrollingMemberId}
              >
                <Text style={styles.actionPrimaryText}>
                  {isEnrolling ? 'Scanning...' : m.faceEnrolled ? 'Re-scan' : 'Enroll Face'}
                </Text>
              </TouchableOpacity>
              {m.faceEnrolled && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionSecondary]}
                  onPress={() => handleRemoveFaceTemplate(m)}
                >
                  <Text style={styles.actionSecondaryText}>Remove Face</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDanger]}
                onPress={() => handleRemove(m)}
              >
                <Text style={styles.actionDangerText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.bg },
  container: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: 40 },

  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  title:      { ...Typography.largeTitle },
  addBtn:     { backgroundColor: Colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Add form
  formCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.xl, gap: Spacing.md },
  input:     { backgroundColor: Colors.elevated, borderRadius: Radius.sm, paddingHorizontal: Spacing.lg, paddingVertical: 12, color: Colors.text, fontSize: 15 },
  roleRow:   { flexDirection: 'row', gap: Spacing.sm },
  roleChip:  { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.elevated, alignItems: 'center' },
  roleChipActive:     { backgroundColor: Colors.accentSoft },
  roleChipText:       { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  roleChipTextActive: { color: Colors.accent },
  submitBtn:     { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyTitle: { ...Typography.headline },
  emptySub:   { ...Typography.footnote, textAlign: 'center' },

  // Member cards
  memberCard:  { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  memberRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar:      { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '800' },
  memberInfo:  { flex: 1 },
  memberName:  { fontSize: 16, fontWeight: '700', color: Colors.text },
  memberMeta:  { ...Typography.caption, marginTop: 2 },

  // Enrollment
  enrollSection:    { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  enrollStatus:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  enrollStatusIcon: { fontSize: 14, fontWeight: '700' },
  enrollStatusText: { fontSize: 13, fontWeight: '500' },

  // Progress
  progressSection: { marginTop: Spacing.md, gap: Spacing.xs },
  progressTrack:   { height: 4, borderRadius: 2, backgroundColor: Colors.elevated, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  progressText:    { ...Typography.caption },

  // Actions
  actionsRow:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  actionBtn:         { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm },
  actionPrimary:     { backgroundColor: Colors.accentSoft, flex: 1, alignItems: 'center' },
  actionPrimaryText: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  actionSecondary:   { backgroundColor: Colors.elevated },
  actionSecondaryText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actionDanger:      { backgroundColor: Colors.redSoft },
  actionDangerText:  { fontSize: 13, fontWeight: '600', color: Colors.red },
});

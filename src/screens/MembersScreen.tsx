import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { getMembers, addMember, removeMember, Member } from '../services/api';

const AVATAR_COLORS = ['#4ADE80', '#60A5FA', '#F472B6', '#A78BFA', '#FBBF24', '#34D399'];

function initials(name: string): string {
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function MembersScreen() {
  const [members, setMembers]   = useState<Member[]>([]);
  const [showAdd, setShowAdd]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newRole, setNewRole]   = useState<'Member' | 'Owner'>('Member');
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
            </View>
            <View style={styles.cardRight}>
              <View style={[styles.rolePill, m.role === 'Owner' && styles.rolePillOwner]}>
                <Text style={[styles.rolePillText, m.role === 'Owner' && styles.rolePillTextOwner]}>
                  {m.role.toUpperCase()}
                </Text>
              </View>
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
          Members are granted door access via facial recognition. Adding a member here registers their name — upload their face photo from the Pi camera interface to activate recognition.
        </Text>
      </View>
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
  cardRight:          { alignItems: 'flex-end', gap: 6 },
  rolePill:           { backgroundColor: Colors.surfaceHigh, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  rolePillOwner:      { backgroundColor: Colors.accentDim, borderColor: 'rgba(0,212,255,0.2)' },
  rolePillText:       { ...Typography.badge, color: Colors.textMid },
  rolePillTextOwner:  { color: Colors.accent },
  deleteBtn:          { padding: 4 },
  infoBox:            { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'flex-start' },
  infoText:           { flex: 1, fontSize: 12, color: Colors.textMid, lineHeight: 18 },
});

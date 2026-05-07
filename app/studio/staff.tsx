import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  brandStaffApi,
  type BrandStaffInvite,
  type BrandStaffMember,
} from '@/src/api/BrandStaffApi';
import { useAuth, type BrandMemberRole } from '@/src/auth/AuthContext';
import { getActiveBrandId, isBrandOwner } from '@/src/auth/brandAccess';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

const STAFF_ROLES: BrandMemberRole[] = [
  'MANAGER',
  'CATALOG_MANAGER',
  'ORDER_MANAGER',
  'SUPPORT_AGENT',
  'VIEWER',
];

const roleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();

const memberName = (member: BrandStaffMember) =>
  [member.firstName, member.lastName].filter(Boolean).join(' ').trim() ||
  member.username ||
  member.email ||
  'Staff member';

export default function StudioStaffScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, validateToken } = useAuth();
  const activeBrandId = getActiveBrandId(user);
  const owner = isBrandOwner(user, activeBrandId);
  const [members, setMembers] = useState<BrandStaffMember[]>([]);
  const [invites, setInvites] = useState<BrandStaffInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BrandMemberRole>('VIEWER');
  const activeInvites = useMemo(
    () => invites.filter((invite) => invite.status === 'PENDING'),
    [invites],
  );

  const load = useCallback(async () => {
    if (!activeBrandId || !owner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await brandStaffApi.list(activeBrandId);
      setMembers(data.members);
      setInvites(data.invites);
    } catch (error: any) {
      const status = Number(error?.response?.status ?? 0);
      if (status === 403) {
        toast.error('You do not have permission to manage staff.');
      } else {
        toast.error('Unable to load staff right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeBrandId, owner, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteStaff = async () => {
    if (!activeBrandId) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      toast.error('Enter a valid staff email.');
      return;
    }
    setBusyId('invite');
    try {
      const invite = await brandStaffApi.invite(activeBrandId, {
        email: normalizedEmail,
        role,
      });
      setEmail('');
      setInvites((current) => [invite, ...current]);
      toast.success(
        invite.emailDelivery?.dispatchStatus === 'FAILED'
          ? 'Invite created, but email delivery needs retry.'
          : 'Staff invite sent.',
      );
    } catch (error: any) {
      toast.error(
        Number(error?.response?.status ?? 0) === 403
          ? 'Ask the brand owner for access.'
          : 'Unable to invite staff.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const updateRole = async (member: BrandStaffMember, nextRole: BrandMemberRole) => {
    if (!activeBrandId || member.role === nextRole || member.role === 'OWNER') return;
    setBusyId(`${member.id}:role`);
    try {
      const updated = await brandStaffApi.updateRole(activeBrandId, member.id, nextRole);
      setMembers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      toast.success('Staff role updated.');
    } catch {
      toast.error('Unable to update staff role.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (member: BrandStaffMember) => {
    if (!activeBrandId || member.role === 'OWNER') return;
    const nextStatus = member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setBusyId(`${member.id}:status`);
    try {
      const updated = await brandStaffApi.updateStatus(activeBrandId, member.id, nextStatus);
      setMembers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (member.userId === user?.id) {
        await validateToken();
      }
      toast.success(nextStatus === 'ACTIVE' ? 'Staff reactivated.' : 'Staff suspended.');
    } catch {
      toast.error('Unable to update staff status.');
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member: BrandStaffMember) => {
    if (!activeBrandId || member.role === 'OWNER') return;
    setBusyId(`${member.id}:remove`);
    try {
      const updated = await brandStaffApi.remove(activeBrandId, member.id);
      setMembers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      toast.success('Staff member removed.');
    } catch {
      toast.error('Unable to remove staff member.');
    } finally {
      setBusyId(null);
    }
  };

  const cancelInvite = async (invite: BrandStaffInvite) => {
    if (!activeBrandId) return;
    setBusyId(`${invite.id}:cancel`);
    try {
      const updated = await brandStaffApi.cancelInvite(activeBrandId, invite.id);
      setInvites((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      toast.success('Invite cancelled.');
    } catch {
      toast.error('Unable to cancel invite.');
    } finally {
      setBusyId(null);
    }
  };

  if (!owner) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.header}>
          <AppBackButton onPress={() => router.back()} />
          <AppText variant="subtitle">Staff</AppText>
        </View>
        <View style={styles.centerState}>
          <AppText variant="title">Owner access only</AppText>
          <AppText variant="body" tone="muted" style={styles.centerCopy}>
            Ask the brand owner for staff-management access.
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.header}>
        <AppBackButton onPress={() => router.back()} />
        <View style={styles.headerCopy}>
          <AppText variant="subtitle">Staff</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {user?.brandMemberships?.find((entry) => entry.brandId === activeBrandId)?.brandName ?? 'Brand workspace'}
          </AppText>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tokens.spacing.xl2 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.panel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText variant="subtitle">Invite staff</AppText>
            <Input
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              placeholder="staff@example.com"
            />
            <View style={styles.roleGrid}>
              {STAFF_ROLES.map((item) => {
                const selected = item === role;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setRole(item)}
                    style={({ pressed }) => [
                      styles.roleChip,
                      {
                        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" tone={selected ? 'primary' : 'secondary'}>
                      {roleLabel(item)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <Button
              title="Send invite"
              onPress={inviteStaff}
              loading={busyId === 'invite'}
              fullWidth
            />
          </View>

          <View style={styles.section}>
            <AppText variant="subtitle">Members</AppText>
            {members.length === 0 ? (
              <EmptyState label="No staff members yet." />
            ) : (
              members.map((member) => (
                <View key={member.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardCopy}>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {memberName(member)}
                      </AppText>
                      <AppText variant="caption" tone="muted" numberOfLines={1}>
                        {member.email ?? member.username ?? member.userId}
                      </AppText>
                    </View>
                    <AppText variant="captionBold" tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {member.status}
                    </AppText>
                  </View>
                  <AppText variant="caption" tone="secondary">
                    Role: {roleLabel(member.role)}
                  </AppText>
                  {member.role !== 'OWNER' ? (
                    <>
                      <View style={styles.roleGrid}>
                        {STAFF_ROLES.map((item) => (
                          <Pressable
                            key={item}
                            disabled={busyId === `${member.id}:role`}
                            onPress={() => void updateRole(member, item)}
                            style={({ pressed }) => [
                              styles.roleChip,
                              {
                                backgroundColor: member.role === item ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                                borderColor: member.role === item ? theme.colors.primary : theme.colors.border,
                                opacity: pressed ? 0.82 : 1,
                              },
                            ]}
                          >
                            <AppText variant="captionBold" tone={member.role === item ? 'primary' : 'secondary'}>
                              {roleLabel(item)}
                            </AppText>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.actions}>
                        <Button
                          title={member.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          variant="outline"
                          size="sm"
                          onPress={() => void toggleStatus(member)}
                          loading={busyId === `${member.id}:status`}
                        />
                        <Button
                          title="Remove"
                          variant="danger"
                          size="sm"
                          onPress={() => void removeMember(member)}
                          loading={busyId === `${member.id}:remove`}
                        />
                      </View>
                    </>
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <AppText variant="subtitle">Pending invites</AppText>
            {activeInvites.length === 0 ? (
              <EmptyState label="No pending invites." />
            ) : (
              activeInvites.map((invite) => (
                <View key={invite.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardCopy}>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {invite.email}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {roleLabel(invite.role)}
                      </AppText>
                    </View>
                    <AppText variant="captionBold" tone="warning">
                      {invite.status}
                    </AppText>
                  </View>
                  <Button
                    title="Cancel invite"
                    variant="outline"
                    size="sm"
                    onPress={() => void cancelInvite(invite)}
                    loading={busyId === `${invite.id}:cancel`}
                  />
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <AppText variant="body" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xl,
  },
  panel: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  roleChip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  empty: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  centerCopy: {
    textAlign: 'center',
    marginTop: tokens.spacing.sm,
  },
});

import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SecuritySessionsApi, type SecurityDevice } from '@/src/api/SecuritySessionsApi';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';

function DeviceCard({ device, actorId }: { device: SecurityDevice; actorId: string }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const client = useQueryClient();
  const root = ['auth', 'security-devices', actorId];
  const sessions = useQuery({
    queryKey: [...root, 'sessions', device.key, cursor],
    queryFn: ({ signal }) => SecuritySessionsApi.sessions(device.key, cursor, signal), enabled: open,
    staleTime: 30_000,
  });
  const revoke = useMutation({
    mutationFn: (id?: string) => id ? SecuritySessionsApi.revokeSession(id) : SecuritySessionsApi.revokeDevice(device.key),
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });
  const confirm = (id?: string) => Alert.alert('Sign out sessions?',
    id ? 'This session will lose access immediately.' : device.isCurrentDevice
      ? 'Sign out the other sessions on this installation. Your current session and its Studio source stay signed in.'
      : 'Sign out all sessions on this installation, including Studio.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => revoke.mutate(id) }]);
  return <View style={styles.device}>
    <AppText variant="bodyBold">{device.key === 'unidentified' ? 'Earlier devices — unidentified' : device.deviceName ?? 'App or browser installation'}</AppText>
    <AppText variant="small" tone="muted">{device.isCurrentDevice ? 'This installation · ' : ''}{device.activeSessionCount} active · {device.sessionCount} recent sessions</AppText>
    <AppText variant="small" tone="muted">Last active: {new Date(device.lastUsedAt).toLocaleString()}</AppText>
    <View style={styles.actions}>
      <Button title={open ? 'Hide sessions' : 'View sessions'} size="sm" variant="secondary" onPress={() => setOpen(!open)} />
      <Button title={device.isCurrentDevice ? 'Sign out other sessions here' : 'Sign out this device'} size="sm" variant="ghost" disabled={revoke.isPending} onPress={() => confirm()} />
    </View>
    {revoke.isError ? <AppText variant="small" tone="danger">Sessions could not be signed out. Please retry.</AppText> : null}
    {open ? <View style={styles.sessions}>
      {sessions.isLoading ? <AppText variant="small">Loading sessions…</AppText> : null}
      {sessions.isError ? <Button title="Retry sessions" variant="secondary" onPress={() => { void sessions.refetch(); }} /> : null}
      {sessions.data?.items.map((session) => <View key={session.id} style={styles.session}>
        <AppText variant="bodyBold">{session.context}{session.isCurrentSession ? ' · Current session' : ''}</AppText>
        <AppText variant="small" tone="muted">{session.isActive ? 'Active' : session.endedReason === 'SECURITY_UPGRADE' ? 'Ended during security upgrade' : 'Signed out or expired'}{session.isCurrentSource ? ' · Source for this Studio session' : ''}</AppText>
        {session.ipAddressMasked ? <AppText variant="small" tone="muted">Network: {session.ipAddressMasked}</AppText> : null}
        <AppText variant="small" tone="muted">Signed in: {new Date(session.createdAt).toLocaleString()}</AppText>
        <AppText variant="small" tone="muted">Last active: {new Date(session.lastUsedAt ?? session.createdAt).toLocaleString()}</AppText>
        {!session.isCurrentSession && !session.isCurrentSource && session.isActive ? <Button title="Sign out session" size="sm" variant="ghost" disabled={revoke.isPending} onPress={() => confirm(session.id)} /> : null}
      </View>)}
      {sessions.data?.nextCursor ? <Button title="Older sessions" variant="secondary" onPress={() => setCursor(sessions.data!.nextCursor)} /> : null}
      {cursor ? <Button title="Newest sessions" variant="ghost" onPress={() => setCursor(null)} /> : null}
    </View> : null}
  </View>;
}

export function SecurityDevicesPanel() {
  const { user } = useAuth();
  const actorId = user?.id ?? '';
  const [cursor, setCursor] = useState<string | null>(null);
  const client = useQueryClient();
  const root = ['auth', 'security-devices', actorId];
  const devices = useQuery({ queryKey: [...root, 'devices', cursor], enabled: Boolean(actorId),
    queryFn: ({ signal }) => SecuritySessionsApi.devices(cursor, signal), staleTime: 30_000 });
  const revoke = useMutation({ mutationFn: SecuritySessionsApi.revokeOthers,
    onSuccess: () => client.invalidateQueries({ queryKey: root }) });
  return <View style={styles.sessions}>
    <AppText variant="body">Sessions are grouped by app installation or browser profile. A device label is a helpful hint, not proof of identity.</AppText>
    <Button title="Sign out all other sessions" variant="secondary" disabled={revoke.isPending} onPress={() => Alert.alert('Sign out other sessions?',
      'Your current session and its Studio source will stay signed in.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => revoke.mutate() }])} />
    {revoke.isError ? <AppText variant="small" tone="danger">Sign-out failed. Please retry.</AppText> : null}
    {devices.isLoading ? <AppText variant="small">Loading devices…</AppText> : null}
    {devices.isError ? <Button title="Retry devices" onPress={() => { void devices.refetch(); }} /> : null}
    {devices.data?.items.map((device) => <DeviceCard key={device.key} device={device} actorId={actorId} />)}
    {devices.data?.items.length === 0 ? <AppText variant="body">No active sessions found.</AppText> : null}
    {devices.data?.nextCursor ? <Button title="More devices" variant="secondary" onPress={() => setCursor(devices.data!.nextCursor)} /> : null}
    {cursor ? <Button title="Most recent devices" variant="ghost" onPress={() => setCursor(null)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  device: { gap: tokens.spacing.md, paddingVertical: tokens.spacing.lg },
  sessions: { gap: tokens.spacing.lg },
  session: { gap: tokens.spacing.sm, paddingLeft: tokens.spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
});

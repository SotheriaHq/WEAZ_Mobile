import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import { SecuritySessionsApi, captureSessionAuthority, type SecurityDevice, type SecuritySessionAuthority } from '@/src/api/SecuritySessionsApi';
import { getApiSecurityIdentity } from '@/src/api/httpClient';
import { useAuth } from '@/src/auth/AuthContext';
import { tokens } from '@/src/styles/tokens';

const deviceName = (device: SecurityDevice) => device.key === 'unidentified'
  ? 'Earlier devices — unidentified' : device.deviceName?.trim() || 'App or browser installation';
function DeviceCard({ device, authority }: { device: SecurityDevice; authority: SecuritySessionAuthority }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const client = useQueryClient();
  const root = ['auth', 'security-devices', authority.actorId];
  const sessions = useQuery({
    queryKey: [...root, authority.identity, 'sessions', device.key, cursor],
    queryFn: ({ signal }) => SecuritySessionsApi.sessions(authority, device.key, cursor, signal), enabled: open,
    staleTime: 30_000,
  });
  const { refetch } = sessions;
  useEffect(() => { if (open) void refetch(); }, [open, refetch]);
  const revoke = useMutation({
    mutationFn: ({ id, scope }: { id?: string; scope: SecuritySessionAuthority }) => id
      ? SecuritySessionsApi.revokeSession(scope, id) : SecuritySessionsApi.revokeDevice(scope, device.key),
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });
  const confirm = (id?: string) => {
    const scope = authority;
    if (!mounted.current || getApiSecurityIdentity() !== scope.identity) return;
    Alert.alert('Sign out sessions?',
      id ? 'This session will lose access immediately.' : device.isCurrentDevice
        ? 'Sign out the other sessions on this installation. Your current session and its Studio source stay signed in.'
        : 'Sign out all sessions on this installation, including Studio.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => {
        if (mounted.current && getApiSecurityIdentity() === scope.identity) revoke.mutate({ id, scope });
      } }]);
  };
  const active = sessions.data?.items.filter(session => session.isActive) ?? [];
  const history = sessions.data?.items.filter(session => !session.isActive) ?? [];
  return <View style={styles.device}>
    <AppText variant="bodyBold">{deviceName(device)}</AppText>
    <AppText variant="small" tone="muted">{device.isCurrentDevice ? 'This installation · ' : ''}{device.activeSessionCount} active · {device.sessionCount} recent sessions</AppText>
    <AppText variant="small" tone="muted">Last active: {new Date(device.lastUsedAt).toLocaleString()}</AppText>
    <View style={styles.actions}>
      <Button title="View sessions" size="sm" variant="secondary" onPress={() => {
        if (getApiSecurityIdentity() === authority.identity) { setCursor(null); setOpen(true); }
      }} />
      <Button title={device.isCurrentDevice ? 'Sign out other sessions here' : 'Sign out this device'} size="sm" variant="ghost" disabled={revoke.isPending} onPress={() => confirm()} />
    </View>
    {revoke.isError && !open ? <AppText variant="small" tone="danger">Sessions could not be signed out. Please retry.</AppText> : null}
    <AppBottomSheet visible={open} title="Device sessions" onClose={() => setOpen(false)}
      footer={<Button title="Close sessions" variant="secondary" onPress={() => setOpen(false)} />}>
      <View style={styles.sessions}>
        <AppText variant="bodyBold">{deviceName(device)}</AppText>
        <AppText variant="body">Inspect active sessions and sign-in history from the last 30 days. A device label is a helpful hint, not proof of identity.</AppText>
        {sessions.isPending ? <AppText variant="body" accessibilityLiveRegion="polite">Loading sessions…</AppText> : null}
        {sessions.isError ? <><AppText variant="body" tone="danger" accessibilityLiveRegion="polite">Sessions could not be refreshed. Try again.</AppText><Button title="Retry sessions" variant="secondary" onPress={() => { void refetch(); }} /></> : null}
        {revoke.isError ? <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">Sign-out failed. Please retry.</AppText> : null}
        {sessions.data ? <>
          <View style={styles.sessions}>
            <SettingsSectionHeading title="Active sessions" />
            {active.length ? active.map(session => <View key={session.id} style={styles.session}>
              <AppText variant="bodyBold">{session.context}{session.isCurrentSession ? ' · Current session' : ''}</AppText>
              <AppText variant="small" tone="muted">Active{session.isCurrentSource ? ' · Source for this Studio session' : ''}</AppText>
              {session.ipAddressMasked ? <AppText variant="small" tone="muted">Network: {session.ipAddressMasked}</AppText> : null}
              <AppText variant="small" tone="muted">Signed in: {new Date(session.createdAt).toLocaleString()}</AppText>
              <AppText variant="small" tone="muted">Last active: {new Date(session.lastUsedAt ?? session.createdAt).toLocaleString()}</AppText>
              {!session.isCurrentSession && !session.isCurrentSource ? <Button title="Sign out session" size="sm" variant="ghost" disabled={revoke.isPending} onPress={() => confirm(session.id)} /> : null}
            </View>) : <AppText variant="body">No active sessions on this page.</AppText>}
          </View>
          <View style={styles.sessions}>
            <SettingsSectionHeading title="Recent sign-in history" />
            {history.length ? history.map(session => <View key={session.id} style={styles.session}>
              <AppText variant="bodyBold">{session.context}</AppText>
              <AppText variant="small" tone="muted">{session.endedReason === 'SECURITY_UPGRADE' ? 'Ended during security upgrade' : 'Signed out or expired'}</AppText>
              {session.ipAddressMasked ? <AppText variant="small" tone="muted">Network: {session.ipAddressMasked}</AppText> : null}
              <AppText variant="small" tone="muted">Signed in: {new Date(session.createdAt).toLocaleString()}</AppText>
              <AppText variant="small" tone="muted">Last active: {new Date(session.lastUsedAt ?? session.createdAt).toLocaleString()}</AppText>
            </View>) : <AppText variant="body">No recent sign-in history on this page.</AppText>}
          </View>
        </> : null}
        {sessions.data?.nextCursor ? <Button title="Older sessions" variant="secondary" onPress={() => setCursor(sessions.data!.nextCursor)} /> : null}
        {cursor ? <Button title="Newest sessions" variant="ghost" onPress={() => setCursor(null)} /> : null}
      </View>
    </AppBottomSheet>
  </View>;
}

export function SecurityDevicesPanel() {
  const { user } = useAuth();
  const actorId = user?.id ?? '';
  const [cursor, setCursor] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const authority = captureSessionAuthority(actorId);
  const client = useQueryClient();
  const root = ['auth', 'security-devices', actorId];
  const devices = useQuery({ queryKey: [...root, authority?.identity ?? null, 'devices', cursor], enabled: Boolean(authority),
    queryFn: ({ signal }) => SecuritySessionsApi.devices(authority, cursor, signal), staleTime: 30_000 });
  const revoke = useMutation({ mutationFn: (scope: SecuritySessionAuthority) => SecuritySessionsApi.revokeOthers(scope),
    onSuccess: () => client.invalidateQueries({ queryKey: root }) });
  return <View style={styles.sessions}>
    <AppText variant="body">Sessions are grouped by app installation or browser profile. View a device’s sessions in a separate window. Its label is a helpful hint, not proof of identity.</AppText>
    <Button title="Sign out all other sessions" variant="secondary" disabled={revoke.isPending || !authority} onPress={() => {
      const scope = authority;
      if (!scope || getApiSecurityIdentity() !== scope.identity) return;
      Alert.alert('Sign out other sessions?', 'Your current session and its Studio source will stay signed in.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => {
          if (mounted.current && getApiSecurityIdentity() === scope.identity) revoke.mutate(scope);
        } }]);
    }} />
    {revoke.isError ? <AppText variant="small" tone="danger">Sign-out failed. Please retry.</AppText> : null}
    {devices.isLoading ? <AppText variant="small">Loading devices…</AppText> : null}
    {devices.isError ? <Button title="Retry devices" onPress={() => { void devices.refetch(); }} /> : null}
    {authority ? devices.data?.items.map(device => <DeviceCard key={authority.identity + ':' + device.key} device={device} authority={authority} />) : null}
    {devices.data?.items.length === 0 ? <AppText variant="body">No recent device sessions found.</AppText> : null}
    {devices.data?.nextCursor ? <Button title="More devices" variant="secondary" onPress={() => setCursor(devices.data!.nextCursor)} /> : null}
    {cursor ? <Button title="Most recent devices" variant="ghost" onPress={() => setCursor(null)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  device: { gap: tokens.spacing.md, paddingVertical: tokens.spacing.lg },
  sessions: { gap: tokens.spacing.lg },
  session: { gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
});

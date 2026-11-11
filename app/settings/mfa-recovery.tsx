import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiSecurityIdentity } from '@/src/api/httpClient';
import { useMfaRecovery, mfaRecoveryLabels, mfaRecoveryApprovalSummary } from '@/src/auth/useMfaRecovery';
import { MfaJourneySheet } from '@/components/settings/MfaSettingsPanel';
import { SettingsHeader, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';
import { AppText } from '@/components/ui/AppText';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

function RecoveryContent() {
  const initial = useRef(getApiSecurityIdentity());
  const current = () => Boolean(initial.current) && getApiSecurityIdentity() === initial.current;
  const flow = useMfaRecovery(current);
  const [setup, setSetup] = useState(false);
  const setupOpen = useRef(setup); setupOpen.current = setup;
  const close = () => { setupOpen.current = false; setSetup(false); void flow.reload(); };
  return <View style={styles.content}>
    <AppText variant="body">If you lost every authenticator, passkey and saved recovery code, start account recovery. Production recovery requires two independent authorised administrators. The requirements for this account appear with your request.</AppText>
    <AppText variant="body">Submitting a request does not disable protection. Email access alone is not sufficient. If ownership cannot be established, recovery will not be approved.</AppText>
    <AppText variant="body">Do not send passwords, authenticator setup keys, card details or recovery codes to support.</AppText>
    {!flow.loaded && !flow.error ? <AppText variant="body" accessibilityLiveRegion="polite">Loading recovery status…</AppText> : null}
    {flow.request ? <SettingsSection title={flow.canContinueWithoutReview ? 'Continue account recovery' : mfaRecoveryLabels[flow.request.status]}>
      <View style={styles.content}>
        <AppText variant="body" selectable>Reference: {flow.request.id}</AppText>
        <AppText variant="body">{mfaRecoveryApprovalSummary(flow.request)}</AppText>
        <AppText variant="body">Request expiry: {new Date(flow.request.expiresAt).toLocaleString()}</AppText>
        {flow.request.message ? <AppText variant="body">{flow.request.message}</AppText> : null}
        {flow.request.reviewChanged ? <AppText variant="body" tone="danger" accessibilityRole="alert">An approval is no longer valid. Cancel this request and ask for a new review.</AppText> : null}
        {flow.canEnroll ? <>
          <AppText variant="body">Approval expires: {flow.request.approvedUntil ? new Date(flow.request.approvedUntil).toLocaleString() : 'Check status again'}.</AppText>
          <AppText variant="body">Your old methods stay active until the replacement works. Completing recovery retires old methods, old recovery codes and other signed-in sessions.</AppText>
          <Button title="Set up replacement authenticator" disabled={flow.busy} onPress={() => setSetup(true)} />
        </> : null}
        {flow.request.status === 'PENDING_REVIEW' && !flow.canContinueWithoutReview ? <AppText variant="body">No automatic approval is available. Check back after the support review.</AppText> : null}
        {flow.request.status === 'COMPLETED' ? <AppText variant="body">Your replacement method is active. Use your newly saved recovery codes going forward.</AppText> : null}
        {['CANCELLED', 'EXPIRED', 'REJECTED'].includes(flow.request.status) ? <AppText variant="body">This request ended. You may submit a new request with relevant information; request limits still apply.</AppText> : null}
      </View>
    </SettingsSection> : null}
    {flow.loaded && (flow.canSubmit || flow.active) ? <Input label="Current password" secureTextEntry autoCapitalize="none" autoComplete="current-password" value={flow.password} maxLength={1024} onChangeText={flow.setPassword} /> : null}
    {flow.canContinueWithoutReview ? <Button title="Continue recovery" loading={flow.busy} disabled={flow.busy} onPress={flow.continueRecovery} /> : null}
    {flow.canSubmit ? <>
      <Input label={flow.request?.status === 'NEEDS_INFORMATION' ? 'Additional information for support' : 'What happened?'} multiline maxLength={1000} value={flow.reason} onChangeText={flow.setReason} />
      <Button title={flow.request?.status === 'NEEDS_INFORMATION' ? 'Send information for a new review' : 'Request support review'} loading={flow.busy} disabled={flow.busy} onPress={flow.submit} />
    </> : null}
    <Button title="Refresh recovery status" variant="secondary" disabled={flow.busy} onPress={flow.reload} />
    {flow.active ? <Button title="Cancel recovery request" variant="secondary" disabled={flow.busy} onPress={flow.cancel} /> : null}
    {flow.error ? <AppText variant="body" tone="danger" accessibilityRole="alert">{flow.error}</AppText> : null}
    {setup && flow.request ? <MfaJourneySheet mode={{ kind: 'recover', requestId: flow.request.id }} isCurrent={() => setupOpen.current && current()} onClose={close} onDone={close} /> : null}
  </View>;
}
export default function MfaRecoveryScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
    <SettingsHeader title="Verification recovery" />
    <KeyboardAwareFormScroll contentContainerStyle={[styles.content, { padding: tokens.spacing.lg, paddingBottom: insets.bottom + tokens.spacing['2xl'] }]}>
      {user ? <RecoveryContent key={user.id} /> : <Button title="Sign in to review recovery" onPress={() => router.push('/login')} />}
    </KeyboardAwareFormScroll>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, content: { gap: tokens.spacing.lg } });

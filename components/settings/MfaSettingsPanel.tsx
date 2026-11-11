import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { router, usePathname } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiSecurityIdentity } from '@/src/api/httpClient';
import { SecurityMfaApi, mfaErrorMessage, type MfaStatus } from '@/src/api/SecurityMfaApi';
import { securityChallenges, type SecurityPrompt } from '@/src/auth/securityChallenge';
import { useMfaJourney, type MfaJourneyMode } from '@/src/auth/useMfaJourney';
import { useMfaVerification } from '@/src/auth/useMfaVerification';
import { usePasskeySupport } from '@/src/auth/usePasskeySupport';
import { tokens } from '@/src/styles/tokens';

export function MfaJourneySheet({ mode, isCurrent, onClose, onDone, onMethodChange }: {
  mode: MfaJourneyMode; isCurrent: () => boolean; onClose: () => void; onDone: () => void;
  onMethodChange?: (kind: 'add' | 'passkey') => void;
}) {
  const flow = useMfaJourney(mode, isCurrent);
  const [copyError, setCopyError] = useState('');
  const blocked = flow.step === 'password' && (!flow.status?.setup?.hasPassword || !flow.status?.setup?.emailVerified);
  const close = () => {
    if (flow.step === 'codes' && !flow.saved) {
      Alert.alert('Save your recovery codes', 'WIEZ cannot show these codes again. Save them before closing, or replace them later in security settings.',
        [{ text: 'Keep open', style: 'cancel' }, { text: 'Close without saving', style: 'destructive', onPress: onClose }]);
    } else onClose();
  };
  const footer = <View style={styles.actions}>
    {flow.step === 'codes' || flow.step === 'complete' ? <Button title="Done" disabled={flow.step === 'codes' && !flow.saved} onPress={onDone} /> :
      flow.step !== 'loading' && !blocked ? <Button title={flow.step === 'password' ? 'Continue securely' : flow.step === 'passkey' ? flow.passkeyResponse ? 'Retry passkey confirmation' : 'Create passkey' : 'Confirm code'} loading={flow.busy} disabled={flow.busy || flow.expired || (mode.kind === 'passkey' && !flow.passkeySupport.available)} onPress={flow.submit} /> : null}
    <Button title="Close" variant="secondary" onPress={close} />
  </View>;
  return <AppBottomSheet visible title="Manage verification" onClose={close} footer={footer}>
    <View style={styles.content}>
      <AppText variant="body">MFA means multi-factor authentication: an extra proof of identity beyond your password.</AppText>
      {flow.step === 'loading' ? <><AppText variant="body" accessibilityLiveRegion="polite">Loading verification methods…</AppText>{flow.error ? <Button title="Retry loading" onPress={flow.reload} /> : null}</> : null}
      {flow.step === 'password' ? <>
        {onMethodChange ? <View style={styles.actions}>
          <Button title="Authenticator app" variant={mode.kind === 'add' ? 'brand' : 'secondary'} disabled={flow.busy} onPress={() => onMethodChange('add')} />
          <Button title="Passkey" variant={mode.kind === 'passkey' ? 'brand' : 'secondary'} disabled={flow.busy || !flow.passkeySupport.available} onPress={() => onMethodChange('passkey')} />
        </View> : null}
        {(mode.kind === 'passkey' || onMethodChange) && (flow.passkeySupport.checking || flow.passkeySupport.message) ? <AppText variant="body" accessibilityLiveRegion="polite">{flow.passkeySupport.checking ? 'Checking passkey support…' : flow.passkeySupport.message}</AppText> : null}
        {mode.kind === 'passkey' ? <>
          <AppText variant="body">Your device or password manager will ask you to create a passkey. WIEZ never receives your fingerprint, face or device PIN.</AppText>
          <Input label="Passkey name" value={flow.passkeyLabel} maxLength={80} onChangeText={flow.setPasskeyLabel} />
        </> : null}
        {mode.kind === 'replace' ? <AppText variant="body">Your current authenticator stays active until the replacement is confirmed.</AppText> : null}
        {mode.kind === 'remove' ? <AppText variant="body">Remove this selected method? You must keep at least one verified method. You will verify this exact change before it is applied.</AppText> : null}
        {mode.kind === 'regenerate' ? <AppText variant="body">All previous recovery codes will stop working. You will verify this exact change before new codes are created.</AppText> : null}
        {!flow.status?.setup?.hasPassword ? <><AppText variant="body">Set a password before managing verification.</AppText><Button title="Set or reset password" variant="secondary" onPress={() => { onClose(); router.push('/forgot-password'); }} /></> : null}
        {!flow.status?.setup?.emailVerified ? <>
          <AppText variant="body">Verify your account email before starting setup.</AppText>
          <Button title="Send verification link" variant="secondary" disabled={flow.busy} onPress={flow.requestAccountVerification} />
          {flow.verificationEmailSent ? <AppText variant="body" accessibilityLiveRegion="polite">Check your inbox and open the verification link. Then return here and check again.</AppText> : null}
          <Button title="I verified my email — check again" variant="secondary" disabled={flow.busy} onPress={flow.reload} />
        </> : null}
        {!blocked ? <Input label="Current password" secureTextEntry autoComplete="current-password" autoCapitalize="none" value={flow.password} maxLength={1024} onChangeText={flow.setPassword} /> : null}
      </> : null}
      {flow.step === 'email' ? <>
        <AppText variant="body">Enter the eight-digit code sent to your verified email. Delivery can take a moment.</AppText>
        <Input label="Email code" keyboardType="number-pad" autoComplete="one-time-code" value={flow.code} maxLength={8} onChangeText={value => flow.setCode(value.replace(/\D/g, ''))} />
        <Button title="Request another email code" variant="secondary" disabled={flow.busy || flow.expired} onPress={flow.resend} />
      </> : null}
      {flow.step === 'authenticator' && flow.setup ? <>
        <AppText variant="body">Scan this QR code with an authenticator on another device, or enter the setup key manually in your authenticator app. Keep the key private.</AppText>
        <View style={styles.qr} accessibilityLabel="Authenticator setup QR code"><QRCode value={flow.setup.uri} size={180} /></View>
        <AppText variant="body" selectable>{flow.setup.secret}</AppText>
        <Input label="Authenticator code" keyboardType="number-pad" autoComplete="one-time-code" value={flow.code} maxLength={6} onChangeText={value => flow.setCode(value.replace(/\D/g, ''))} />
      </> : null}
      {flow.step === 'passkey' ? <>
        <AppText variant="body">{flow.passkeyResponse ? 'Your passkey was created on your device. Confirm it with WIEZ to finish setup. If the connection failed, retry confirmation without creating another passkey.' : 'Ready to create your passkey. Press Create passkey to open the secure system prompt. Cancelling keeps your existing methods unchanged.'}</AppText>
        {flow.busy ? <AppText variant="body" accessibilityLiveRegion="polite">{flow.passkeyResponse ? 'Confirming your passkey with WIEZ…' : 'Complete or cancel the passkey prompt on your device…'}</AppText> : null}
      </> : null}
      {flow.remainingSeconds !== null ? <AppText variant="small" accessibilityLiveRegion="polite">{flow.expired ? 'This setup expired. Close it and start again.' : `Setup expires in ${flow.remainingSeconds} seconds.`}</AppText> : null}
      {flow.step === 'codes' ? <>
        <AppText variant="body">Save these codes somewhere private. Each works once. WIEZ cannot show them again.</AppText>
        {flow.codes.map(code => <AppText key={code} variant="body" selectable>{code}</AppText>)}
        <Button title="Copy recovery codes" variant="secondary" onPress={async () => {
          try { await Clipboard.setStringAsync(flow.codes.join('\n')); setCopyError(''); }
          catch { setCopyError('Copy failed. Select and save the codes manually.'); }
        }} />
        {copyError ? <AppText variant="body" tone="danger" accessibilityRole="alert">{copyError}</AppText> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: flow.saved }} onPress={() => flow.setSaved(!flow.saved)} style={styles.ack}>
          <AppText variant="bodyBold">{flow.saved ? '☑' : '☐'}</AppText><AppText variant="body" style={styles.flex}>I saved my recovery codes somewhere private.</AppText>
        </Pressable>
      </> : null}
      {flow.step === 'complete' ? <AppText variant="body" accessibilityLiveRegion="polite">{mode.kind === 'recover' ? 'Recovery completed. Earlier methods, recovery codes and other sessions were retired.' : 'Verification methods updated. Existing recovery codes remain valid unless you replaced them.'}</AppText> : null}
      {flow.error ? <AppText variant="body" tone="danger" accessibilityRole="alert">{flow.error}</AppText> : null}
    </View>
  </AppBottomSheet>;
}

function MfaVerificationSheet({ prompt }: { prompt: SecurityPrompt }) {
  const flow = useMfaVerification(prompt);
  const review = prompt.challenge.review;
  return <AppBottomSheet visible title="Verify your identity" onClose={prompt.cancel} footer={<View style={styles.actions}>
    {flow.status ? <Button title={flow.method === 'passkey' ? 'Use passkey' : 'Verify and continue'} disabled={flow.busy || (flow.method === 'passkey' ? !flow.passkeyOptions || !flow.passkeySupport.available : !flow.code)} loading={flow.busy} onPress={flow.submit} /> : null}
    <Button title="Cancel verification" variant="secondary" onPress={prompt.cancel} />
  </View>}>
    <View style={styles.content}>
      <AppText variant="bodyBold">{review.title}</AppText>
      {review.plan ? <AppText variant="body">Plan: {review.plan.replaceAll('_', ' ')}</AppText> : null}
      {review.amountNgn ? <AppText variant="body">Approved amount: NGN {review.amountNgn}{review.paymentTiming === 'renewal' ? ' at renewal' : ' now'}</AppText> : null}
      {review.monthlyPriceNgn ? <AppText variant="body">Monthly price: NGN {review.monthlyPriceNgn}</AppText> : null}
      {review.accountEnding ? <AppText variant="body">Bank account ending {review.accountEnding}</AppText> : null}
      <AppText variant="body">{prompt.challenge.sensitivity === 'CRITICAL_CHANGE' ? 'This verification approves only this exact action once.' : 'Verification allows sensitive viewing for five minutes.'}</AppText>
      {!flow.status ? <><AppText variant="body">Loading your methods…</AppText>{flow.error ? <Button title="Retry methods" onPress={flow.reload} /> : null}</> : <>
        <View style={styles.actions}>
          {flow.status.factors.some(factor => factor.kind === 'TOTP') ? <Button title="Authenticator app" variant={flow.method === 'totp' ? 'brand' : 'secondary'} disabled={flow.busy} onPress={() => flow.setMethod('totp')} /> : null}
          {flow.status.recoveryCodesRemaining > 0 ? <Button title="Recovery code" variant={flow.method === 'recovery' ? 'brand' : 'secondary'} disabled={flow.busy} onPress={() => flow.setMethod('recovery')} /> : null}
          {flow.status.factors.some(factor => factor.kind === 'PASSKEY') ? <Button title="Prepare passkey" variant={flow.method === 'passkey' ? 'brand' : 'secondary'} disabled={flow.busy || !flow.passkeySupport.available} onPress={flow.preparePasskey} /> : null}
        </View>
        {flow.status.factors.some(factor => factor.kind === 'PASSKEY') && (flow.passkeySupport.checking || flow.passkeySupport.message) ? <AppText variant="body" accessibilityLiveRegion="polite">{flow.passkeySupport.checking ? 'Checking passkey support…' : flow.passkeySupport.message}</AppText> : null}
        {flow.method === 'passkey' ? <AppText variant="body">{flow.passkeyOptions ? 'Press Use passkey to open the secure system prompt. You can cancel and choose another method.' : 'Prepare your passkey above, or choose another available method.'}</AppText> :
          <Input label={flow.method === 'totp' ? 'Authenticator code' : 'Unused recovery code'} value={flow.code} maxLength={flow.method === 'totp' ? 6 : 64} onChangeText={flow.setCode} keyboardType={flow.method === 'totp' ? 'number-pad' : 'default'} autoCapitalize="characters" autoCorrect={false} autoComplete="one-time-code" />}
        <AppText variant="body">Lost every method and recovery code? Account recovery requires two independent support reviews. Email access alone cannot remove verification.</AppText>
        <Button title="Review account recovery" variant="secondary" onPress={() => { prompt.cancel(); router.push('/settings/mfa-recovery'); }} />
      </>}
      {flow.error ? <AppText variant="body" tone="danger" accessibilityRole="alert">{flow.error}</AppText> : null}
    </View>
  </AppBottomSheet>;
}

export function MfaVerificationHost() {
  const route = usePathname();
  const previousRoute = useRef(route);
  useEffect(() => { if (previousRoute.current !== route) { previousRoute.current = route; securityChallenges.cancel(); } }, [route]);
  const [prompt, setPrompt] = useState<SecurityPrompt | null>(null);
  useEffect(() => securityChallenges.register(value => { setPrompt(value); return () => setPrompt(null); }), []);
  if (!prompt) return null;
  if (prompt.challenge.code === 'PARENT_SESSION_VERIFICATION_REQUIRED') return <AppBottomSheet visible title="Verify the original phone session" onClose={prompt.cancel}
    footer={<Button title="Close" variant="secondary" onPress={prompt.cancel} />}>
    <AppText variant="body">Verify the flagged session on the phone that opened Studio, then retry. Verification here cannot unlock another session.</AppText>
  </AppBottomSheet>;
  return prompt.challenge.code === 'MFA_ENROLLMENT_REQUIRED'
    ? <MfaEnrollmentSheet key={`${prompt.identity}:enrollment`} prompt={prompt} />
    : <MfaVerificationSheet key={`${prompt.identity}:${prompt.challenge.challengeId}`} prompt={prompt} />;
}

function MfaEnrollmentSheet({ prompt }: { prompt: SecurityPrompt }) {
  const [kind, setKind] = useState<'add' | 'passkey'>('add');
  const chosen = useRef(kind); chosen.current = kind;
  return <MfaJourneySheet key={kind} mode={{ kind }} isCurrent={() => chosen.current === kind && prompt.isCurrent()}
    onMethodChange={setKind} onClose={prompt.cancel} onDone={() => prompt.complete({ actionProof: null, enrolled: true })} />;
}

export function MfaSettingsPanel() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null), [error, setError] = useState('');
  const [version, setVersion] = useState(0), [mode, setMode] = useState<MfaJourneyMode | null>(null);
  const initialIdentity = useRef(getApiSecurityIdentity());
  const chosenMode = useRef(mode); chosenMode.current = mode;
  const passkeySupport = usePasskeySupport(status?.passkeys);
  const current = () => Boolean(initialIdentity.current) && getApiSecurityIdentity() === initialIdentity.current;
  useEffect(() => securityChallenges.onCancel(() => { setMode(null); setStatus(null); setVersion(value => value + 1); }), []);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    initialIdentity.current = getApiSecurityIdentity();
    if (!initialIdentity.current?.startsWith(`${user?.id}:`)) {
      setError('Sign in again to manage verification for this account.'); return () => controller.abort();
    }
    SecurityMfaApi.status(controller.signal).then(result => { if (!controller.signal.aborted && current()) setStatus(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(mfaErrorMessage(failure)); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, version]);
  const close = () => { chosenMode.current = null; setMode(null); setVersion(value => value + 1); };
  return <SettingsSection title="Multi-factor authentication (MFA)">
    <View style={styles.content}>
      <AppText variant="body">An extra proof of identity protects financial and security actions.</AppText>
      {!status && !error ? <AppText variant="body">Loading verification methods…</AppText> : null}
      {error ? <><AppText variant="body" tone="danger" accessibilityRole="alert">{error}</AppText><Button title="Retry methods" onPress={() => setVersion(value => value + 1)} /></> : null}
      {status ? <>
        {!status.factors.length ? <AppText variant="body">No verification methods are set up yet.</AppText> : <>
          <AppText variant="body">{status.recoveryCodesRemaining} unused recovery codes. Keep at least one verified method.</AppText>
          {status.factors.map(factor => <View key={factor.id} style={styles.content}>
            <AppText variant="bodyBold">{factor.label}</AppText><AppText variant="body">{factor.kind === 'TOTP' ? 'Authenticator app' : 'Passkey'} · Verified</AppText>
            <View style={styles.actions}>
              {factor.kind === 'TOTP' ? <Button title="Replace authenticator" variant="secondary" onPress={() => setMode({ kind: 'replace', factorId: factor.id })} /> : null}
              <Button title="Remove method" variant="secondary" disabled={status.factors.length < 2} onPress={() => setMode({ kind: 'remove', factorId: factor.id })} />
            </View>
          </View>)}
          {status.factors.length === 1 ? <AppText variant="body">Add and verify a replacement before removing your last method.</AppText> : null}
          <Button title="Replace recovery codes" variant="secondary" onPress={() => setMode({ kind: 'regenerate' })} />
        </>}
        {!status.factors.some(factor => factor.kind === 'TOTP') ? <Button title="Set up authenticator" disabled={status.factors.length >= 10} onPress={() => setMode({ kind: 'add' })} /> : null}
        <Button title="Add passkey" disabled={status.factors.length >= 10 || !passkeySupport.available} onPress={() => setMode({ kind: 'passkey' })} />
        {passkeySupport.checking || passkeySupport.message ? <AppText variant="body" accessibilityLiveRegion="polite">{passkeySupport.checking ? 'Checking passkey support…' : passkeySupport.message}</AppText> : null}
        {status.factors.length >= 10 ? <AppText variant="body">You have 10 verified methods. Remove an unused method before adding another.</AppText> : null}
        <Button title="Refresh verification methods" variant="secondary" onPress={() => setVersion(value => value + 1)} />
      </> : null}
      <Button title="Lost your methods? Review account recovery" variant="secondary" onPress={() => router.push('/settings/mfa-recovery')} />
    </View>
    {mode ? <MfaJourneySheet mode={mode} isCurrent={() => chosenMode.current === mode && current()} onClose={close} onDone={close} /> : null}
  </SettingsSection>;
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  qr: { alignSelf: 'flex-start', backgroundColor: tokens.colors.qrBackground, padding: tokens.spacing.md },
  ack: { flexDirection: 'row', gap: tokens.spacing.md, alignItems: 'center', minHeight: 48 },
  flex: { flex: 1 },
});

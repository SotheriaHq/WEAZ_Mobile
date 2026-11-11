import { useEffect, useRef, useState } from 'react';
import { SecurityMfaApi, mfaErrorMessage, type MfaSetup, type MfaStatus } from '../api/SecurityMfaApi';
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import { createPasskey } from './passkeys';
import { usePasskeySupport } from './usePasskeySupport';
import { securityChallenges } from './securityChallenge';

export type MfaJourneyMode = { kind: 'add' } | { kind: 'passkey' } | { kind: 'replace'; factorId: string } | { kind: 'recover'; requestId: string } |
  { kind: 'remove'; factorId: string } | { kind: 'regenerate' };
type Step = 'loading' | 'password' | 'email' | 'authenticator' | 'passkey' | 'codes' | 'complete';

/** One transient journey. Unmount/cancel destroys secrets and aborts pending work. No mutation retries. */
export function useMfaJourney(mode: MfaJourneyMode, isCurrent: () => boolean) {
  const current = useRef(isCurrent); current.current = isCurrent;
  const alive = useRef(true), pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [emailChallenge, setEmailChallenge] = useState<string | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [passkey, setPasskey] = useState<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | null>(null);
  const [passkeyResponse, setPasskeyResponse] = useState<RegistrationResponseJSON | null>(null);
  const [passkeyLabel, setPasskeyLabel] = useState('My passkey');
  const passkeySupport = usePasskeySupport(status?.passkeys);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false), [busy, setBusy] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [error, setError] = useState(''), [deadline, setDeadline] = useState<number | null>(null);
  const [clock, setClock] = useState(() => performance.now());
  const valid = () => alive.current && current.current();
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (!valid()) { if (alive.current) setError('Your sign-in session changed or verification expired. Close this setup and sign in again before restarting.'); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try { await work(controller.signal); }
    catch (failure) { if (valid() && !controller.signal.aborted) setError(mfaErrorMessage(failure)); }
    finally { if (request.current === controller) {
      request.current = null; pending.current = false; if (valid()) setBusy(false);
    } }
  };
  const load = () => run(async signal => {
    const result = await SecurityMfaApi.status(signal);
    if (valid() && !signal.aborted) { setStatus(result); setStep('password'); }
  });
  useEffect(() => {
    alive.current = true; void load();
    const cancel = securityChallenges.onCancel(() => { request.current?.abort(); setPassword(''); setCode(''); setSetup(null); setCodes([]); setPasskey(null); setPasskeyResponse(null); });
    return () => { alive.current = false; request.current?.abort(); pending.current = false; cancel(); };
    // The parent mounts a fresh journey for every chosen operation/account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const now = performance.now(); setClock(now);
      if (now >= deadline) {
        request.current?.abort();
        setPassword(''); setCode(''); setSetup(null); setEmailChallenge(null);
        setPasskey(null); setPasskeyResponse(null); setBusy(false);
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const begin = async (signal: AbortSignal, enrollmentProof?: string) => {
    const started = performance.now();
    if (mode.kind === 'passkey') {
      const result = await SecurityMfaApi.beginPasskey(password, passkeyLabel.trim(), enrollmentProof, signal);
      if (valid() && !signal.aborted) { setPassword(''); setCode(''); setPasskey(result); setStep('passkey');
        setDeadline(started + result.expiresInSeconds * 1000); setClock(performance.now()); }
      return;
    }
    const result = mode.kind === 'recover'
      ? await SecurityMfaApi.beginRecovery(mode.requestId, password, enrollmentProof!, signal)
      : await SecurityMfaApi.beginTotp(password, enrollmentProof,
        mode.kind === 'replace' ? mode.factorId : undefined, signal);
    if (valid() && !signal.aborted) { setPassword(''); setCode(''); setSetup(result); setStep('authenticator');
      setDeadline(started + result.expiresInSeconds * 1000); setClock(performance.now()); }
  };
  const submit = () => run(async signal => {
    if (deadline && performance.now() >= deadline) { setError('This setup expired. Close it, reload your methods, and start again.'); return; }
    if (step === 'password') {
      if (!password || password.length > 1024) { setError('Enter your current password.'); return; }
      if (mode.kind === 'passkey' && (!passkeySupport.available || !passkeyLabel.trim() || passkeyLabel.trim().length > 80)) {
        setError(passkeySupport.message ?? 'Enter a passkey label of 1–80 characters.'); return;
      }
      if (mode.kind === 'remove') {
        await SecurityMfaApi.revoke(mode.factorId, password, signal);
        if (valid() && !signal.aborted) { setPassword(''); setStep('complete'); } return;
      }
      if (mode.kind === 'regenerate') {
        const result = await SecurityMfaApi.regenerate(password, signal);
        if (valid() && !signal.aborted) { setPassword(''); setCodes(result.recoveryCodes); setStep('codes'); } return;
      }
      if (mode.kind === 'recover' || !status?.factors.length) {
        const started = performance.now();
        const result = mode.kind === 'recover' ? await SecurityMfaApi.requestRecoveryCode(mode.requestId, password, signal)
          : await SecurityMfaApi.requestEmail(password, signal);
        if (valid() && !signal.aborted) { setEmailChallenge(result.challengeId); setStep('email'); setCode('');
          setDeadline(started + result.expiresInSeconds * 1000); setClock(performance.now()); }
      } else await begin(signal);
    } else if (step === 'email' && emailChallenge) {
      if (!/^\d{8}$/.test(code)) { setError('Enter the eight-digit email code.'); return; }
      const confirmed = mode.kind === 'recover'
        ? await SecurityMfaApi.confirmRecoveryCode(mode.requestId, emailChallenge, code, signal)
        : await SecurityMfaApi.confirmEmail(emailChallenge, code, signal);
      if (valid() && !signal.aborted) await begin(signal, confirmed.enrollmentProof);
    } else if (step === 'authenticator' && setup) {
      if (!/^\d{6}$/.test(code)) { setError('Enter the six-digit code from your authenticator app.'); return; }
      const result = await SecurityMfaApi.confirmTotp(setup.factorId, code, signal);
      if (valid() && !signal.aborted) { setCode(''); setSetup(null); setDeadline(null); setCodes(result.recoveryCodes);
        setStep(result.recoveryCodes.length ? 'codes' : 'complete'); }
    } else if (step === 'passkey' && passkey) {
      const response = passkeyResponse ?? await createPasskey(passkey.options, signal);
      if (!valid() || signal.aborted || (deadline !== null && performance.now() >= deadline)) return;
      setPasskeyResponse(response);
      const result = await SecurityMfaApi.confirmPasskey(passkey.challengeId, response, signal);
      if (valid() && !signal.aborted) { setPasskey(null); setPasskeyResponse(null); setDeadline(null); setCodes(result.recoveryCodes);
        setStep(result.recoveryCodes.length ? 'codes' : 'complete'); }
    }
  });
  const resend = () => run(async signal => {
    const started = performance.now();
    const result = mode.kind === 'recover' ? await SecurityMfaApi.requestRecoveryCode(mode.requestId, password, signal)
      : await SecurityMfaApi.requestEmail(password, signal);
    if (valid() && !signal.aborted) { setEmailChallenge(result.challengeId); setCode('');
      setDeadline(started + result.expiresInSeconds * 1000); setClock(performance.now()); }
  });
  const requestAccountVerification = () => run(async signal => {
    await SecurityMfaApi.requestAccountVerification(signal);
    if (valid() && !signal.aborted) setVerificationEmailSent(true);
  });
  return { step, status, password, setPassword, code, setCode, setup, codes, saved, setSaved,
    passkeySupport, passkeyLabel, setPasskeyLabel, passkeyResponse,
    busy, error, submit, resend, reload: load, requestAccountVerification, verificationEmailSent,
    expired: deadline !== null && clock >= deadline,
    remainingSeconds: deadline === null ? null : Math.max(0, Math.ceil((deadline - clock) / 1000)),
  };
}

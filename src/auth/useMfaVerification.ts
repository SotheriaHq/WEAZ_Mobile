import { useEffect, useRef, useState } from 'react';
import { mfaErrorMessage, SecurityMfaApi, type MfaStatus } from '../api/SecurityMfaApi';
import type { SecurityPrompt } from './securityChallenge';
import { securityChallenges } from './securityChallenge';
import { authenticatePasskey } from './passkeys';
import { usePasskeySupport } from './usePasskeySupport';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export function useMfaVerification(prompt: SecurityPrompt) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [method, setMethod] = useState<'totp' | 'recovery' | 'passkey'>('totp');
  const [passkeyOptions, setPasskeyOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const passkeySupport = usePasskeySupport(status?.passkeys);
  const [code, setCode] = useState('');
  const alive = useRef(true), locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (locked.current || !prompt.isCurrent()) return;
    locked.current = true; setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try { await work(controller.signal); }
    catch (failure) { if (alive.current && !controller.signal.aborted && prompt.isCurrent()) setError(mfaErrorMessage(failure)); }
    finally { if (request.current === controller) {
      request.current = null; locked.current = false;
      if (alive.current) setBusy(false);
    } }
  };
  const load = () => run(async signal => {
    const result = await SecurityMfaApi.status(signal);
    if (!signal.aborted && alive.current && prompt.isCurrent()) {
      setStatus(result);
      setPasskeyOptions(null);
      setMethod(result.factors.some(factor => factor.kind === 'TOTP') ? 'totp' :
        result.recoveryCodesRemaining > 0 ? 'recovery' : 'passkey');
    }
  });
  useEffect(() => {
    alive.current = true; void load();
    const cancel = securityChallenges.onCancel(() => request.current?.abort());
    return () => { alive.current = false; request.current?.abort(); locked.current = false; cancel(); };
    // A new prompt mounts a fresh verifier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = () => run(async signal => {
    if (method === 'passkey') {
      if (!passkeySupport.available || !passkeyOptions) { setError('Prepare your passkey before opening the system prompt.'); return; }
      const passkey = await authenticatePasskey(passkeyOptions, signal);
      if (!signal.aborted && alive.current && prompt.isCurrent()) {
        const result = await SecurityMfaApi.verify(prompt.challenge.challengeId!, { passkey }, signal);
        if (!signal.aborted && alive.current && prompt.isCurrent() && result.verified === true) prompt.complete({ actionProof: result.actionProof });
      }
      return;
    }
    const normalized = code.replace(/[-\s]/g, '').toUpperCase();
    if (!(method === 'totp' ? /^\d{6}$/ : /^[A-F0-9]{32}$/).test(normalized)) {
      setError(method === 'totp' ? 'Enter the six-digit authenticator code.' : 'Enter one complete unused recovery code.'); return;
    }
    const result = await SecurityMfaApi.verify(prompt.challenge.challengeId!,
      method === 'totp' ? { code: normalized } : { recoveryCode: normalized }, signal);
    if (!signal.aborted && alive.current && prompt.isCurrent() && result.verified === true) {
      setCode(''); prompt.complete({ actionProof: result.actionProof });
    }
  });
  const preparePasskey = () => run(async signal => {
    if (!passkeySupport.available) { setError(passkeySupport.message ?? 'Choose another verification method.'); return; }
    const result = await SecurityMfaApi.passkeyOptions(prompt.challenge.challengeId!, signal);
    if (!signal.aborted && alive.current && prompt.isCurrent()) { setPasskeyOptions(result); setMethod('passkey'); setCode(''); }
  });
  return { status, busy, error, code, setCode, method,
    passkeySupport, passkeyOptions, preparePasskey,
    setMethod: (value: typeof method) => { setMethod(value); setCode(''); setError(''); }, reload: load, submit };
}

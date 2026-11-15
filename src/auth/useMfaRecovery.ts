import { useEffect, useRef, useState } from 'react';
import { mfaErrorMessage, SecurityMfaApi, type MfaRecoveryRequest } from '../api/SecurityMfaApi';
import { securityChallenges } from './securityChallenge';

export const mfaRecoveryLabels: Record<MfaRecoveryRequest['status'], string> = {
  PENDING_REVIEW: 'Waiting for two independent reviews', NEEDS_INFORMATION: 'Support needs more information',
  APPROVED: 'Ready to verify a replacement', REJECTED: 'Recovery was not approved',
  CANCELLED: 'Recovery cancelled', EXPIRED: 'Recovery expired', COMPLETED: 'Recovery completed',
};
export function mfaRecoveryApprovalSummary(request: Pick<MfaRecoveryRequest, 'requiredApprovals' | 'approvals'>): string {
  return request.requiredApprovals === 0
    ? 'Independent review is waived for this test-environment SuperAdmin. Your password, email code and verified replacement are still required.'
    : `${request.approvals} of ${request.requiredApprovals} independent approvals for this revision.`;
}
export function mfaRecoveryCanContinueWithoutReview(request: MfaRecoveryRequest | null): boolean {
  return Boolean(request && request.requiredApprovals === 0 && ['PENDING_REVIEW', 'NEEDS_INFORMATION'].includes(request.status));
}
export function useMfaRecovery(isCurrent: () => boolean) {
  const current = useRef(isCurrent); current.current = isCurrent;
  const alive = useRef(true), locked = useRef(false), controller = useRef<AbortController | null>(null);
  const [request, setRequest] = useState<MfaRecoveryRequest | null>(null);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [password, setPassword] = useState(''), [reason, setReason] = useState('');
  const valid = () => alive.current && current.current();
  const run = async (work: (signal: AbortSignal) => Promise<{ request: MfaRecoveryRequest | null }>) => {
    if (!valid()) { if (alive.current) setError('Your sign-in session changed. Sign in again before managing recovery.'); return; }
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const owned = new AbortController(); controller.current = owned;
    try { const result = await work(owned.signal);
      if (valid() && !owned.signal.aborted) { setRequest(result.request); setLoaded(true); setPassword(''); } }
    catch (failure) { if (valid() && !owned.signal.aborted) setError(mfaErrorMessage(failure)); }
    finally { if (controller.current === owned) { controller.current = null; locked.current = false; if (valid()) setBusy(false); } }
  };
  const reload = () => run(signal => SecurityMfaApi.recoveryStatus(signal));
  useEffect(() => {
    alive.current = true; void reload();
    const cancel = securityChallenges.onCancel(() => { controller.current?.abort(); setRequest(null); setPassword(''); setReason(''); });
    return () => { alive.current = false; controller.current?.abort(); locked.current = false; cancel(); };
    // One view per authenticated account/session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const requirePassword = () => { if (password && password.length <= 1024) return true; setError('Enter your current password.'); return false; };
  const submit = () => {
    if (!requirePassword()) return Promise.resolve();
    const description = reason.trim();
    if (!description || description.length > 1000) { setError('Describe the problem in 1–1000 characters. Do not include passwords or codes.'); return Promise.resolve(); }
    return run(signal => request?.status === 'NEEDS_INFORMATION'
      ? SecurityMfaApi.updateRecovery(request.id, password, description, signal)
      : SecurityMfaApi.requestRecovery(password, description, signal));
  };
  const cancel = () => requirePassword() && request ? run(signal => SecurityMfaApi.updateRecovery(request.id, password, null, signal)) : Promise.resolve();
  const active = request && ['PENDING_REVIEW', 'NEEDS_INFORMATION', 'APPROVED'].includes(request.status);
  const canContinueWithoutReview = mfaRecoveryCanContinueWithoutReview(request);
  const continueRecovery = () => requirePassword() && request && canContinueWithoutReview
    ? run(signal => SecurityMfaApi.requestRecovery(password, request.reason, signal)) : Promise.resolve();
  return { request, loaded, busy, error, password, setPassword, reason, setReason, reload, submit, cancel,
    active: Boolean(active), canContinueWithoutReview, continueRecovery,
    canSubmit: loaded && (!active || (request?.status === 'NEEDS_INFORMATION' && !canContinueWithoutReview)),
    canEnroll: request?.status === 'APPROVED' && !request.reviewChanged };
}

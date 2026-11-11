import { parseSecurityChallenge, securityChallenges, SecurityVerificationCancelled, SecurityVerificationError } from './securityChallenge';

export type SecurityRequestState = {
  _securityIdentity?: string;
  _securityStartedAt?: number;
  _securityEnrollmentRetried?: boolean;
  _securityProofRetried?: boolean;
  _securityParentRetried?: boolean;
};

/** Only a pre-admission 428 can be retried. No network/provider failure enters this flow. */
export async function verifyChallengedRequest(state: SecurityRequestState, payload: unknown,
  sentIdentity: string | null, currentIdentity: () => string | null,
  signal?: Parameters<typeof securityChallenges.request>[3]): Promise<{ proof: string | null } | null> {
  const challenge = parseSecurityChallenge(payload, state._securityStartedAt ?? NaN);
  if (!challenge) return null;
  if (!sentIdentity || currentIdentity() !== sentIdentity)
    throw new SecurityVerificationCancelled('Your sign-in session changed. Start this action again.');
  if (challenge.code === 'PARENT_SESSION_VERIFICATION_REQUIRED' && state._securityParentRetried)
    throw new SecurityVerificationError('The phone session still needs verification. Verify it on that phone, then start this action again.');
  if ((challenge.code === 'MFA_ENROLLMENT_REQUIRED' && state._securityEnrollmentRetried) ||
    (challenge.code === 'STEP_UP_REQUIRED' && state._securityProofRetried))
    throw new SecurityVerificationError('Verification or the approved action changed. Review it again before retrying.');
  state._securityIdentity = sentIdentity;
  const result = await securityChallenges.request(challenge, sentIdentity, currentIdentity, signal);
  if (currentIdentity() !== sentIdentity || signal?.aborted)
    throw new SecurityVerificationCancelled();
  if (challenge.code === 'MFA_ENROLLMENT_REQUIRED') state._securityEnrollmentRetried = true;
  else if (challenge.code === 'PARENT_SESSION_VERIFICATION_REQUIRED') state._securityParentRetried = true;
  else state._securityProofRetried = true;
  return { proof: result.actionProof };
}

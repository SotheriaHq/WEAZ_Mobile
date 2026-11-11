import { apiClient, getApiSecurityIdentity } from '@/src/api/httpClient';
import { SecurityVerificationCancelled } from '@/src/auth/securityChallenge';

export async function verifyStudioParentSession(parentSessionId: string, signal: AbortSignal): Promise<void> {
  const identity = getApiSecurityIdentity();
  if (!identity || identity.split(':')[1] !== parentSessionId || signal.aborted)
    throw new SecurityVerificationCancelled('This is not the flagged phone session. Sign in on the correct phone.');
  // Bypass short GET coalescing; this must reach the current server authority.
  // A challenged root profile invokes the native MFA presenter, not Studio's.
  await apiClient.get('/auth/profile', { signal, params: { _verifyPhoneSession: Date.now().toString() },
    headers: { 'Cache-Control': 'no-cache' } });
  if (signal.aborted || getApiSecurityIdentity() !== identity) throw new SecurityVerificationCancelled();
}

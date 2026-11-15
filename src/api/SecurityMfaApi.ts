import { apiClient } from './httpClient';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';
import { SecurityVerificationError } from '../auth/securityChallenge';

export type MfaFactor = { id: string; kind: 'TOTP' | 'PASSKEY'; label: string; verifiedAt: string; createdAt: string };
export type MfaStatus = { factors: MfaFactor[]; recoveryCodesRemaining: number; readVerificationSeconds: number;
  setup: { hasPassword: boolean; emailVerified: boolean }; passkeys: { webConfigured: boolean; androidConfigured: boolean } };
export type MfaSetup = { factorId: string; secret: string; uri: string; expiresInSeconds: number };
export type MfaCodes = { recoveryCodes: string[] };
export type MfaRecoveryRequest = { id: string; status: 'PENDING_REVIEW' | 'NEEDS_INFORMATION' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
  revision: number; reason: string; message: string | null; approvals: number; requiredApprovals: 0 | 2;
  expiresAt: string; approvedUntil: string | null; createdAt: string; completedAt: string | null; reviewChanged?: boolean };
export type MfaRecoveryReviewInput = { revision: number; decision: 'APPROVE' | 'REQUEST_INFORMATION' | 'REJECT';
  identityVerified?: boolean; evidenceReference: string; message?: string };
export type AdminMfaRecoveryRequest = { id: string; userId: string; status: MfaRecoveryRequest['status']; revision: number;
  reason: string; publicMessage: string | null; expiresAt: string; createdAt: string;
  user: { id: string; username: string; status: string; role: string };
  reviews: Array<{ id: string; revision: number; reviewerId: string | null; decision: MfaRecoveryReviewInput['decision']; evidenceReference: string }> };
const root = '/auth/security/mfa';
function unwrap<T>(payload: unknown): T {
  return (payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: T }).data : payload) as T;
}
export function parseMfaStatus(payload: unknown): MfaStatus {
  const value = unwrap<Partial<MfaStatus> | null>(payload);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!value || !Array.isArray(value.factors) || value.factors.length > 10 ||
    value.factors.some(factor => !factor || !uuid.test(factor.id) || !['TOTP', 'PASSKEY'].includes(factor.kind) ||
      typeof factor.label !== 'string' || !factor.label.trim() || [...factor.label].length > 80 ||
      typeof factor.verifiedAt !== 'string' || typeof factor.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(factor.verifiedAt)) || !Number.isFinite(Date.parse(factor.createdAt))) ||
    new Set(value.factors.map(factor => factor.id)).size !== value.factors.length ||
    !Number.isInteger(value.recoveryCodesRemaining) || value.recoveryCodesRemaining! < 0 || value.recoveryCodesRemaining! > 10 ||
    value.readVerificationSeconds !== 300 || typeof value.setup?.hasPassword !== 'boolean' ||
    typeof value.setup?.emailVerified !== 'boolean' || typeof value.passkeys?.webConfigured !== 'boolean' ||
    typeof value.passkeys?.androidConfigured !== 'boolean')
    throw new SecurityVerificationError('WIEZ returned an incomplete verification status. Reload your methods before making changes.');
  return value as MfaStatus;
}
// These responses contain secrets. Keep them in ephemeral component memory, never a persisted query cache.
export const SecurityMfaApi = {
  async beginPasskey(password: string, label: string, enrollmentProof?: string, signal?: AbortSignal): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON; expiresInSeconds: number }> {
    return unwrap((await apiClient.post(`${root}/passkeys/begin`, { password, label, enrollmentProof }, { signal })).data);
  },
  async confirmPasskey(challengeId: string, response: RegistrationResponseJSON, signal?: AbortSignal): Promise<MfaCodes> {
    return unwrap((await apiClient.post(`${root}/passkeys/confirm`, { challengeId, response }, { signal })).data);
  },
  async passkeyOptions(challengeId: string, signal?: AbortSignal): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return unwrap((await apiClient.get(`${root}/challenges/${encodeURIComponent(challengeId)}/passkey-options`, { signal })).data);
  },
  async adminRecoveryQueue(cursor?: string, signal?: AbortSignal): Promise<{ items: AdminMfaRecoveryRequest[]; nextCursor: string | null }> {
    return unwrap((await apiClient.get('/admin/security/mfa-recovery', { params: { cursor }, signal })).data);
  },
  async reviewRecovery(id: string, review: MfaRecoveryReviewInput, signal?: AbortSignal): Promise<{ status: string; approvals: number }> {
    return unwrap((await apiClient.post(`/admin/security/mfa-recovery/${encodeURIComponent(id)}/review`, review, { signal })).data);
  },
  async recoveryStatus(signal?: AbortSignal): Promise<{ request: MfaRecoveryRequest | null }> {
    return unwrap((await apiClient.get(`${root}/recovery`, { signal })).data);
  },
  async requestRecovery(password: string, reason: string, signal?: AbortSignal): Promise<{ request: MfaRecoveryRequest | null }> {
    return unwrap((await apiClient.post(`${root}/recovery`, { password, reason }, { signal })).data);
  },
  async updateRecovery(id: string, password: string, information: string | null, signal?: AbortSignal): Promise<{ request: MfaRecoveryRequest | null }> {
    const action = information === null ? 'cancel' : 'information';
    return unwrap((await apiClient.post(`${root}/recovery/${encodeURIComponent(id)}/${action}`,
      information === null ? { password } : { password, information }, { signal })).data);
  },
  async requestRecoveryCode(id: string, password: string, signal?: AbortSignal): Promise<{ challengeId: string; expiresInSeconds: number }> {
    return unwrap((await apiClient.post(`${root}/recovery/${encodeURIComponent(id)}/code/request`, { password }, { signal })).data);
  },
  async confirmRecoveryCode(id: string, challengeId: string, code: string, signal?: AbortSignal): Promise<{ enrollmentProof: string }> {
    return unwrap((await apiClient.post(`${root}/recovery/${encodeURIComponent(id)}/code/confirm`, { challengeId, code }, { signal })).data);
  },
  async beginRecovery(id: string, password: string, enrollmentProof: string, signal?: AbortSignal): Promise<MfaSetup> {
    return unwrap((await apiClient.post(`${root}/recovery/${encodeURIComponent(id)}/totp/begin`, { password, enrollmentProof }, { signal })).data);
  },
  async requestAccountVerification(signal?: AbortSignal): Promise<void> {
    await apiClient.post('/auth/verify-email/resend', undefined, { signal });
  },
  async status(signal?: AbortSignal): Promise<MfaStatus> {
    return parseMfaStatus((await apiClient.get(root, { signal })).data);
  },
  async requestEmail(password: string, signal?: AbortSignal): Promise<{ challengeId: string; expiresInSeconds: number }> {
    return unwrap((await apiClient.post(`${root}/enrollment/request`, { password }, { signal })).data);
  },
  async confirmEmail(challengeId: string, code: string, signal?: AbortSignal): Promise<{ enrollmentProof: string }> {
    return unwrap((await apiClient.post(`${root}/enrollment/confirm`, { challengeId, code }, { signal })).data);
  },
  async beginTotp(password: string, enrollmentProof?: string, replacesFactorId?: string, signal?: AbortSignal): Promise<MfaSetup> {
    return unwrap((await apiClient.post(`${root}/totp/begin`, { password, enrollmentProof, replacesFactorId }, { signal })).data);
  },
  async confirmTotp(factorId: string, code: string, signal?: AbortSignal): Promise<MfaCodes> {
    return unwrap((await apiClient.post(`${root}/totp/confirm`, { factorId, code }, { signal })).data);
  },
  async verify(challengeId: string, proof: { code?: string; recoveryCode?: string; passkey?: unknown }, signal?: AbortSignal): Promise<{ verified: true; actionProof: string | null }> {
    return unwrap((await apiClient.post(`${root}/challenges/${encodeURIComponent(challengeId)}/verify`, proof, { signal })).data);
  },
  async revoke(id: string, password: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    return unwrap((await apiClient.post(`${root}/factors/${encodeURIComponent(id)}/revoke`, { password }, { signal })).data);
  },
  async regenerate(password: string, signal?: AbortSignal): Promise<MfaCodes> {
    return unwrap((await apiClient.post(`${root}/recovery-codes/regenerate`, { password }, { signal })).data);
  },
};

export function mfaErrorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string; response?: { status?: number; data?: { message?: unknown; data?: { message?: unknown } } } };
  if (value?.code === 'ERR_CANCELED') return 'Verification cancelled. You can start again when ready.';
  if (value?.code === 'MFA_VERIFICATION_UNAVAILABLE' && typeof value.message === 'string' && value.message.length <= 400) return value.message;
  if (value?.response?.status === 429) return 'Too many attempts. Wait before trying again; avoid repeatedly requesting new codes.';
  if (!value?.response) return 'WIEZ could not be reached. Check your connection and retry. If setup already finished, reload your methods before starting again.';
  const message = value.response.data?.message ?? value.response.data?.data?.message;
  return typeof message === 'string' && message.length <= 400 ? message : 'Verification could not finish. Reload your methods and try again.';
}

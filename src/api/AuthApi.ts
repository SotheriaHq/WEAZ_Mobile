import { apiClient } from '@/src/api/httpClient';
import type { LegalAcceptancePayload } from '@/src/api/LegalApi';

export type AuthUserType = 'REGULAR' | 'BRAND';

export type AuthTokensResponse = {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  user?: unknown;
  message?: string;
};

export type GoogleAuthParams = {
  idToken: string;
  /**
   * Which screen the user started from. The API refuses to create an account
   * from a `LOGIN` (it answers `GOOGLE_NO_ACCOUNT`) and refuses to log into an
   * existing one from a `SIGNUP` (`EMAIL_ALREADY_EXISTS`). Sending it removes
   * the need for the backend to infer intent from whether `type` is present.
   */
  intent?: 'LOGIN' | 'SIGNUP';
  type?: AuthUserType;
  brandFullName?: string;
  legalAcceptances?: LegalAcceptancePayload[];
};

export type LoginOptionsResponse = {
  requestId: string;
  methods: {
    password: boolean;
    google: boolean;
    passwordSetupAvailable: boolean;
  };
  message: string;
};

export type EmailLoginCodePurpose = 'PASSWORD_SETUP' | 'DIRECT_LOGIN';

export type RequestEmailLoginCodeParams = {
  email: string;
  purpose: EmailLoginCodePurpose;
  requestId?: string;
};

export type ConfirmEmailLoginCodeParams = {
  email: string;
  code: string;
  purpose: EmailLoginCodePurpose;
};

export type ConfirmEmailLoginCodeResponse = {
  passwordSetupToken: string;
  expiresInSeconds: number;
};

export type SetupPasswordParams = {
  passwordSetupToken: string;
  newPassword: string;
};

export type RequestPasswordResetResponse = {
  message?: string;
};

export type ConfirmPasswordResetResponse = {
  message?: string;
};

export type VerifyEmailResponse = {
  message?: string;
};

export type MessageResponse = {
  message?: string;
};

export type SecuritySession = {
  id: string;
  userAgent: string | null;
  ipAddressMasked: string | null;
  location: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrentSession: boolean;
};

export type DeleteAccountParams = {
  email: string;
  currentPassword: string;
};

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as any).data as T;
  }
  return payload as T;
}

export async function googleAuth(params: GoogleAuthParams) {
  const response = await apiClient.post('/auth/google', params);
  return unwrapData<AuthTokensResponse>(response.data);
}

export async function googleLink(idToken: string) {
  const response = await apiClient.post('/auth/google/link', { idToken });
  return unwrapData<{ message?: string }>(response.data);
}

export async function getLoginOptions(email: string) {
  const response = await apiClient.post('/auth/login-options', { email });
  return unwrapData<LoginOptionsResponse>(response.data);
}

export async function requestEmailLoginCode(params: RequestEmailLoginCodeParams) {
  const response = await apiClient.post('/auth/email-login-code/request', params);
  return unwrapData<{ message?: string }>(response.data);
}

export async function confirmEmailLoginCode(params: ConfirmEmailLoginCodeParams) {
  const response = await apiClient.post('/auth/email-login-code/confirm', params);
  return unwrapData<ConfirmEmailLoginCodeResponse>(response.data);
}

export async function confirmDirectLoginCode(email: string, code: string) {
  const response = await apiClient.post('/auth/email-login-code/confirm', {
    email,
    code,
    purpose: 'DIRECT_LOGIN',
  });
  return unwrapData<AuthTokensResponse>(response.data);
}

export async function setupPassword(params: SetupPasswordParams) {
  const response = await apiClient.post('/auth/password/setup', params);
  return unwrapData<{ message?: string }>(response.data);
}

export async function requestPasswordReset(email: string) {
  const response = await apiClient.post<RequestPasswordResetResponse>('/auth/password-reset/request', {
    email,
  });

  return unwrapData<RequestPasswordResetResponse>(response.data);
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const response = await apiClient.post<ConfirmPasswordResetResponse>('/auth/password-reset/confirm', {
    token,
    newPassword,
  });

  return unwrapData<ConfirmPasswordResetResponse>(response.data);
}

export async function verifyEmail(token: string) {
  const response = await apiClient.get<VerifyEmailResponse>('/auth/verify-email', {
    params: { token },
  });

  return unwrapData<VerifyEmailResponse>(response.data);
}

export async function resendVerificationEmail() {
  const response = await apiClient.post<VerifyEmailResponse>('/auth/verify-email/resend');
  return unwrapData<VerifyEmailResponse>(response.data);
}

export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}) {
  const response = await apiClient.post<MessageResponse>('/auth/change-password', params);
  return unwrapData<MessageResponse>(response.data);
}

export async function requestEmailChange(params: {
  newEmail: string;
  currentPassword: string;
}) {
  const response = await apiClient.post<MessageResponse & { pendingEmail?: string }>(
    '/auth/change-email/request',
    params,
  );
  return unwrapData<MessageResponse & { pendingEmail?: string }>(response.data);
}

/**
 * Phone changes are authorised by a 6-digit code sent to the account's VERIFIED
 * email — a number nobody has proven control of cannot authorise adding itself.
 */
export async function requestPhoneChange(phoneNumber: string) {
  const response = await apiClient.post<MessageResponse & { expiresInSeconds?: number }>(
    '/auth/change-phone/request',
    { phoneNumber },
  );
  return unwrapData<MessageResponse & { expiresInSeconds?: number }>(response.data);
}

export async function confirmPhoneChange(code: string) {
  const response = await apiClient.post<MessageResponse & { phoneNumber?: string }>(
    '/auth/change-phone/confirm',
    { code },
  );
  return unwrapData<MessageResponse & { phoneNumber?: string }>(response.data);
}

export async function listSecuritySessions() {
  const response = await apiClient.get<SecuritySession[]>('/auth/security/sessions');
  return unwrapData<SecuritySession[]>(response.data);
}

export async function revokeSecuritySession(sessionId: string) {
  const response = await apiClient.patch<{ success: boolean }>(
    `/auth/security/sessions/${encodeURIComponent(sessionId)}/revoke`,
  );
  return unwrapData<{ success: boolean }>(response.data);
}

export async function logoutOtherSecuritySessions() {
  const response = await apiClient.post<{ revokedCount: number; currentSessionId?: string | null }>(
    '/auth/security/sessions/logout-others',
  );
  return unwrapData<{ revokedCount: number; currentSessionId?: string | null }>(response.data);
}

export async function deleteAccount(params: DeleteAccountParams) {
  const response = await apiClient.post('/auth/account/delete', params);
  return unwrapData<{ message?: string }>(response.data);
}

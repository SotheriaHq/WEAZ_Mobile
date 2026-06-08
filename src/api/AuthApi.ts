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

export type EmailLoginCodePurpose = 'PASSWORD_SETUP';

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

export type DeleteAccountParams = {
  confirmationWord: string;
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

export async function deleteAccount(params: DeleteAccountParams) {
  const response = await apiClient.post('/auth/account/delete', params);
  return unwrapData<{ message?: string }>(response.data);
}

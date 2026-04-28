import { apiClient } from '@/src/api/httpClient';

export type RequestPasswordResetResponse = {
  message?: string;
};

export type ConfirmPasswordResetResponse = {
  message?: string;
};

export async function requestPasswordReset(email: string) {
  const response = await apiClient.post<RequestPasswordResetResponse>('/auth/password-reset/request', {
    email,
  });

  return response.data;
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const response = await apiClient.post<ConfirmPasswordResetResponse>('/auth/password-reset/confirm', {
    token,
    newPassword,
  });

  return response.data;
}
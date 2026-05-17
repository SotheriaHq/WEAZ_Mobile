import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { env } from '@/src/config/env';

WebBrowser.maybeCompleteAuthSession();

const usableClientId = (value: string | undefined | null): string | undefined => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.startsWith('<')) return undefined;
  return normalized;
};

const hasPlatformClientId = () => {
  const webClientId = usableClientId(env.google.webClientId);
  if (Platform.OS === 'ios') {
    return Boolean(usableClientId(env.google.iosClientId) || webClientId);
  }
  if (Platform.OS === 'android') {
    return Boolean(usableClientId(env.google.androidClientId) || webClientId);
  }
  return Boolean(webClientId);
};

type UseGoogleIdTokenRequestOptions = {
  loginHint?: string;
};

export function useGoogleIdTokenRequest(options: UseGoogleIdTokenRequestOptions = {}) {
  const config = useMemo(
    () => ({
      webClientId: usableClientId(env.google.webClientId),
      iosClientId: usableClientId(env.google.iosClientId),
      androidClientId: usableClientId(env.google.androidClientId),
      selectAccount: true,
      scopes: ['openid', 'email', 'profile'],
      ...(options.loginHint?.trim() ? { loginHint: options.loginHint.trim() } : {}),
    }),
    [options.loginHint],
  );

  const [request, , promptAsync] = Google.useIdTokenAuthRequest(config);

  const requestGoogleIdToken = useCallback(async () => {
    if (!hasPlatformClientId()) {
      throw new Error('Google sign-in is not configured for this build.');
    }
    if (!request) {
      throw new Error('Google sign-in is not ready yet. Try again.');
    }

    const result = await promptAsync();
    if (result.type !== 'success') {
      throw new Error('Google sign-in was cancelled or unavailable.');
    }

    const idToken = result.params?.id_token?.trim();
    if (!idToken) {
      throw new Error('Google did not return an ID token.');
    }

    return idToken;
  }, [promptAsync, request]);

  return {
    configured: hasPlatformClientId(),
    ready: Boolean(request),
    requestGoogleIdToken,
  };
}

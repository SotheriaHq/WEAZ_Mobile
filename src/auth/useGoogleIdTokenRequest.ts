import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { env } from '@/src/config/env';

WebBrowser.maybeCompleteAuthSession();

const UNCONFIGURED_GOOGLE_CLIENT_ID =
  'threadly-google-auth-not-configured.apps.googleusercontent.com';

const usableClientId = (value: string | undefined | null): string | undefined => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.startsWith('<')) return undefined;
  return normalized;
};

type GoogleClientIds = {
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
};

const getGoogleClientIds = (): GoogleClientIds => ({
  webClientId: usableClientId(env.google.webClientId),
  iosClientId: usableClientId(env.google.iosClientId),
  androidClientId: usableClientId(env.google.androidClientId),
});

const platformClientId = (clientIds: GoogleClientIds): string | undefined => {
  if (Platform.OS === 'ios') {
    return clientIds.iosClientId;
  }
  if (Platform.OS === 'android') {
    return clientIds.androidClientId;
  }
  return clientIds.webClientId;
};

type UseGoogleIdTokenRequestOptions = {
  loginHint?: string;
};

export function useGoogleIdTokenRequest(options: UseGoogleIdTokenRequestOptions = {}) {
  const config = useMemo(
    () => {
      const clientIds = getGoogleClientIds();
      const fallbackClientId = platformClientId(clientIds) ?? UNCONFIGURED_GOOGLE_CLIENT_ID;

      return {
        webClientId:
          Platform.OS === 'web'
            ? fallbackClientId
            : clientIds.webClientId,
        iosClientId:
          Platform.OS === 'ios'
            ? fallbackClientId
            : clientIds.iosClientId,
        androidClientId:
          Platform.OS === 'android'
            ? fallbackClientId
            : clientIds.androidClientId,
        selectAccount: true,
        scopes: ['openid', 'email', 'profile'],
        ...(options.loginHint?.trim() ? { loginHint: options.loginHint.trim() } : {}),
      };
    },
    [options.loginHint],
  );

  const [request, , promptAsync] = Google.useIdTokenAuthRequest(config);
  const configured = Boolean(platformClientId(getGoogleClientIds()));

  const requestGoogleIdToken = useCallback(async () => {
    if (!configured) {
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
  }, [configured, promptAsync, request]);

  return {
    configured,
    ready: configured && Boolean(request),
    requestGoogleIdToken,
  };
}

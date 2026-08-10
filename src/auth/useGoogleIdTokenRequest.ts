import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { exchangeCodeAsync } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';

import {
  googleSignInCancelled,
  googleSignInUnavailable,
} from '@/src/auth/authErrors';
import { env } from '@/src/config/env';

WebBrowser.maybeCompleteAuthSession();

const UNCONFIGURED_GOOGLE_CLIENT_ID =
  'wiez-google-auth-not-configured.apps.googleusercontent.com';

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
    if (!configured || !request) {
      if (__DEV__) {
        console.warn(
          `[google-auth] not ${configured ? 'ready' : 'configured'} — check EXPO_PUBLIC_GOOGLE_*_CLIENT_ID and restart Metro (EXPO_PUBLIC_* is inlined at bundle time).`,
        );
      }
      throw googleSignInUnavailable();
    }

    const result = await promptAsync();

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw googleSignInCancelled();
    }
    if (result.type !== 'success') {
      throw googleSignInUnavailable();
    }

    // Only web asks Google for an `id_token` directly. Installed apps run the
    // PKCE code flow, so `promptAsync` resolves with the RAW redirect params —
    // an authorization `code`, never an `id_token`, no matter how long you wait.
    //
    // `useIdTokenAuthRequest` does auto-exchange the code, but it publishes the
    // result on the hook's second tuple element on a later render; it cannot
    // reach back into the promise `promptAsync` already resolved. Reading
    // `id_token` off that promise is why every Android sign-in died here with
    // "Google did not return an ID token" before the API was ever called.
    const directIdToken = result.params?.id_token?.trim();
    if (directIdToken) return directIdToken;

    const code = result.params?.code?.trim();
    if (!code) throw googleSignInUnavailable();

    const tokenResponse = await exchangeCodeAsync(
      {
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        code,
        // Proves we are the app that started the flow. Installed apps have no
        // client secret, so PKCE is the whole of the exchange's security.
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      Google.discovery,
    );

    const idToken = tokenResponse.idToken?.trim();
    if (!idToken) throw googleSignInUnavailable();

    return idToken;
  }, [configured, promptAsync, request]);

  return {
    configured,
    ready: configured && Boolean(request),
    requestGoogleIdToken,
  };
}

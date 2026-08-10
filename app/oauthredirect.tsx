/**
 * Landing pad for the Google OAuth redirect.
 *
 * `expo-auth-session` builds its Android redirect from the package name —
 * `com.sotheriahq.wiez:/oauthredirect` — and `app.json` declares that scheme so
 * the intent can reach the app at all. Android then delivers it to the router as
 * well as to the auth session, and `/oauthredirect` was not a screen: users
 * landed on `+not-found` ("This screen doesn't exist") seconds after signing in.
 *
 * By the time this renders the sign-in itself is already settled — the in-app
 * browser captures the redirect and resolves `promptAsync`. This route exists
 * only to absorb the stray intent and put the user back where they were, so it
 * paints the theme background rather than flashing an empty screen on the way
 * out. `maybeCompleteAuthSession` covers the cold-start case, where the app was
 * killed while the browser was open and nothing is listening yet.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { useTheme } from '@/src/theme/ThemeProvider';

export default function OAuthRedirectScreen() {
  const { theme } = useTheme();

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();

    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(auth)/login');
  }, []);

  return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
}

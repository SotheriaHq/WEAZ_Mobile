import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import StudioApi from '@/src/api/StudioApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  buildStudioPath,
  buildStudioWebUrl,
  getTrustedStudioOrigins,
  STUDIO_ROUTES,
  type StudioRouteKey,
} from '@/src/features/studio/studioRoutes';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type LoadState = 'booting' | 'loading' | 'ready' | 'error';

type NativeMessage =
  | { type: 'READY' }
  | { type: 'ROUTE_CHANGED'; path?: string }
  | { type: 'AUTH_REQUIRED'; reason?: string }
  | { type: 'HANDOFF_FAILED'; reason?: string }
  | { type: 'PROFILE_SETUP_REQUIRED'; path?: string }
  | { type: 'ACTION_COMPLETE'; action?: string; path?: string }
  | { type: 'OPEN_EXTERNAL'; url?: string }
  | { type: 'CLOSE' };

const asString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isStudioRouteKey = (value: string | undefined): value is StudioRouteKey =>
  Boolean(value && value in STUDIO_ROUTES);

export default function StudioWebViewScreen() {
  const params = useLocalSearchParams<{
    routeKey?: string;
    productId?: string;
    orderId?: string;
  }>();
  const { status, user } = useAuth();
  const { scheme, theme } = useTheme();
  const toast = useToast();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('booting');
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('Studio could not load.');
  const [retryKey, setRetryKey] = useState(0);

  const routeKey = asString(params.routeKey);
  const productId = asString(params.productId);
  const orderId = asString(params.orderId);
  const resolvedRouteKey = isStudioRouteKey(routeKey) ? routeKey : 'overview';
  const route = STUDIO_ROUTES[resolvedRouteKey];
  const trustedOrigins = useMemo(() => getTrustedStudioOrigins(), []);
  const isBrand = user?.type === 'BRAND';

  const closeToHome = useCallback(() => {
    router.replace('/studio' as any);
  }, []);

  const retry = useCallback(() => {
    setWebUrl(null);
    setLoadState('booting');
    setRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (status === 'loading') return;
      if (status !== 'authenticated') {
        setErrorMessage('Sign in again to open Studio.');
        setLoadState('error');
        return;
      }
      if (!isBrand) {
        setErrorMessage('Studio is available only for brand accounts.');
        setLoadState('error');
        return;
      }

      try {
        const intendedPath = buildStudioPath(resolvedRouteKey, { productId, orderId });
        const handoff = await StudioApi.createHandoff(intendedPath);
        if (!mounted) return;
        setWebUrl(
          buildStudioWebUrl({
            routeKey: resolvedRouteKey,
            params: { productId, orderId },
            handoffCode: handoff.code,
          }),
        );
        setLoadState('loading');
      } catch {
        if (!mounted) return;
        setErrorMessage('Studio session could not be prepared. Check your connection and try again.');
        setLoadState('error');
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [isBrand, orderId, productId, resolvedRouteKey, retryKey, status]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      closeToHome();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack, closeToHome]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(Boolean(navState.canGoBack));
  }, []);

  const handleShouldStartLoad = useCallback(
    (request: any) => {
      const url = typeof request?.url === 'string' ? request.url : '';
      if (!url || url === 'about:blank') return true;

      try {
        const parsed = new URL(url);
        if (trustedOrigins.has(parsed.origin)) {
          return true;
        }
        void WebBrowser.openBrowserAsync(url).catch(() => undefined);
        toast.info('Opened outside Studio');
        return false;
      } catch {
        return false;
      }
    },
    [toast, trustedOrigins],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: NativeMessage | null = null;
      try {
        message = JSON.parse(event.nativeEvent.data) as NativeMessage;
      } catch {
        return;
      }

      switch (message?.type) {
        case 'READY':
          setLoadState('ready');
          break;
        case 'AUTH_REQUIRED':
        case 'HANDOFF_FAILED':
          setErrorMessage('Your Studio session expired. Return and open Studio again.');
          setLoadState('error');
          break;
        case 'PROFILE_SETUP_REQUIRED':
          toast.info('Complete brand setup in the app to continue');
          break;
        case 'OPEN_EXTERNAL':
          if (message.url) {
            void WebBrowser.openBrowserAsync(message.url).catch(() => undefined);
          }
          break;
        case 'CLOSE':
          closeToHome();
          break;
        case 'ACTION_COMPLETE':
        case 'ROUTE_CHANGED':
        default:
          break;
      }
    },
    [closeToHome, toast],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Header
        title={route.title}
        subtitle="Studio"
        left={
          <Button
            title="‹"
            variant="ghost"
            size="sm"
            onPress={() => {
              if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return;
              }
              closeToHome();
            }}
          />
        }
        right={<Button title="Close" variant="ghost" size="sm" onPress={closeToHome} />}
      />

      <View style={styles.webHost}>
        {webUrl ? (
          <WebView
            ref={webViewRef}
            key={`${webUrl}:${retryKey}`}
            source={{ uri: webUrl }}
            originWhitelist={['https://*', 'http://*']}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onMessage={handleMessage}
            onLoadStart={() => setLoadState((current) => (current === 'ready' ? current : 'loading'))}
            onLoadEnd={() => setLoadState((current) => (current === 'loading' ? 'ready' : current))}
            onError={() => {
              setErrorMessage('Studio could not load. Check your connection and try again.');
              setLoadState('error');
            }}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 500) {
                setErrorMessage('Studio is temporarily unavailable. Try again shortly.');
                setLoadState('error');
              }
            }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={styles.webView}
          />
        ) : null}

        {loadState === 'booting' || loadState === 'loading' ? (
          <View style={[styles.overlay, { backgroundColor: theme.colors.bg }]}>
            <View style={[styles.loaderBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.loaderGlyph, { backgroundColor: theme.colors.primarySoft }]} />
              <AppText variant="bodyBold">Opening Studio</AppText>
              <AppText variant="small" tone="muted" style={styles.centerText}>
                Preparing a secure brand session.
              </AppText>
            </View>
          </View>
        ) : null}

        {loadState === 'error' ? (
          <View style={[styles.overlay, { backgroundColor: theme.colors.bg }]}>
            <View style={[styles.loaderBlock, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <AppText variant="h3">Studio unavailable</AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>
                {errorMessage}
              </AppText>
              <View style={styles.errorActions}>
                <Button title="Retry" onPress={retry} />
                <Button title="Back to Studio" variant="secondary" onPress={closeToHome} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webHost: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  loaderBlock: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  loaderGlyph: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.lg,
  },
  centerText: {
    textAlign: 'center',
  },
  errorActions: {
    alignSelf: 'stretch',
    gap: tokens.spacing.md,
  },
});

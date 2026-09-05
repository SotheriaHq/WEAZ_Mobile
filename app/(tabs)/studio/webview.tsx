import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/ui/AppText';
import {
  StudioHeaderActions,
  StudioProfileMenu,
} from '@/components/studio/StudioHeaderProfile';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { StableImage } from '@/components/ui/StableImage';
import { MuseLoader } from '@/components/ui/MuseLoader';
import StudioApi from '@/src/api/StudioApi';
import { env } from '@/src/config/env';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import {
  canReadPayouts,
  getActiveBrandId,
  hasActiveBrandMembership,
  isBrandOwner,
} from '@/src/auth/brandAccess';
import { classifyStudioWebUrl } from '@/src/features/studio/studioNavigationBridge';
import {
  registerStudioInPlaceHandler,
} from '@/src/features/studio/studioNavController';
import {
  buildStudioPath,
  buildStudioWebUrl,
  getStudioOriginWhitelist,
  getTrustedStudioOrigins,
  STUDIO_ROUTES,
  isStudioRouteKey,
  type StudioRouteKey,
} from '@/src/features/studio/studioRoutes';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useQueryClient } from '@tanstack/react-query';
import { useStoreSetupStatus } from '@/src/hooks/useStoreSetupStatus';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { perfMark } from '@/src/utils/perf';

type LoadState = 'booting' | 'loading' | 'ready' | 'error';

type NativeMessage =
  | { type: 'READY' }
  | { type: 'ROUTE_CHANGED'; path?: string }
  | { type: 'AUTH_REQUIRED'; reason?: string }
  | {
      type: 'HANDOFF_FAILED';
      reason?: string;
      stage?: string;
      status?: number;
      message?: string;
      apiBaseUrl?: string;
    }
  | { type: 'PROFILE_SETUP_REQUIRED'; path?: string }
  | { type: 'ACTION_COMPLETE'; action?: string; path?: string }
  | { type: 'OPEN_EXTERNAL'; url?: string }
  | { type: 'OPEN_NATIVE_ROUTE'; path?: string }
  | { type: 'CLOSE' };

const asString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const READY_TIMEOUT_MS = 20_000;

/**
 * Install a durable in-place navigator before the web app hydrates.
 *
 * Island hops inject `window.__WIEZ_STUDIO_NAV_GO__(path)`. That function
 * prefers the React Router bridge (`__WIEZ_STUDIO_NAV__`) and otherwise
 * QUEUES the path until the bridge registers. It must never full-reload
 * the document (bundle + React + every query) — that was the 3–5s dead-tap
 * on every Studio chip.
 */
const STUDIO_NAV_BOOT_SCRIPT = `
  (function() {
    if (window.__WIEZ_STUDIO_NAV_BOOT__) return true;
    window.__WIEZ_STUDIO_NAV_BOOT__ = true;
    window.__WIEZ_STUDIO_NAV_PENDING__ = window.__WIEZ_STUDIO_NAV_PENDING__ || null;
    window.__WIEZ_STUDIO_NAV_GO__ = function(path) {
      if (typeof path !== 'string' || path.charAt(0) !== '/') return;
      if (typeof window.__WIEZ_STUDIO_NAV__ === 'function') {
        window.__WIEZ_STUDIO_NAV_PENDING__ = null;
        window.__WIEZ_STUDIO_NAV__(path);
        return;
      }
      window.__WIEZ_STUDIO_NAV_PENDING__ = path;
    };
    true;
  })();
`;

/**
 * The only Studio routes a brand may open before store setup is finished.
 *
 * Everything else — the dashboard, products, orders, customers, analytics —
 * describes a store that does not exist yet. Opening them showed a working
 * Studio with live navigation behind a "verification needed" notice, so the
 * setup requirement read as advisory. It is not: the routes are gated here, on
 * entry, and the entry point in the catalog offers "Set up store" instead of
 * "Store" for the same brand.
 */
const STORE_SETUP_EXEMPT_ROUTES = new Set<StudioRouteKey>(['setup', 'essentials']);

/**
 * Studio waits behind ONE mark and no words.
 *
 * There used to be a three-stage narration here ("Getting your keys" →
 * "Opening your store" → "Almost there") stacked on a progress bar, and the web
 * app then painted its own captioned spinner behind it. Two narrated loaders
 * for one wait read as two separate stalls. The animated WIEZ mark is the whole
 * loading state now; if the wait fails, the error overlay below says so.
 */

type StudioWebViewEventName =
  | 'route-open'
  | 'handoff-failed'
  | 'load-failed'
  | 'external-link-opened'
  | 'external-link-blocked'
  | 'native-route-opened'
  | 'native-route-blocked'
  | 'native-message-received'
  | 'ready-timeout';

function sanitizeUrlForTelemetry(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function sanitizePathForTelemetry(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const parsed = new URL(path, 'https://wiez.local');
    parsed.searchParams.delete('handoffCode');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return 'invalid-path';
  }
}

function trackStudioWebViewEvent(
  name: StudioWebViewEventName,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!__DEV__) return;
  console.info('[studio-webview]', name, properties);
}

function getTrustedAliasPath(target: string): { type: 'profile' | 'brand'; value: string } | null {
  try {
    const parsed = new URL(target, env.webAppUrl);
    const pathname = parsed.pathname.replace(/\/+$/g, '') || '/';

    if (pathname.startsWith('/u/')) {
      const username = pathname.slice('/u/'.length).replace(/^\/+|\/+$/g, '');
      return username ? { type: 'profile', value: decodeURIComponent(username) } : null;
    }

    if (pathname.startsWith('/brand/')) {
      const slug = pathname.slice('/brand/'.length).replace(/^\/+|\/+$/g, '');
      return slug ? { type: 'brand', value: decodeURIComponent(slug) } : null;
    }

    return null;
  } catch {
    return null;
  }
}

export default function StudioWebViewScreen() {
  const params = useLocalSearchParams<{
    routeKey?: string;
    productId?: string;
    orderId?: string;
  }>();
  const { status, user, signOut } = useAuth();
  const { scheme, theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { standardScreenBottomPadding } = useScreenChrome();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('booting');
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('Studio could not load.');
  const [retryKey, setRetryKey] = useState(0);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const routeKey = asString(params.routeKey);
  const productId = asString(params.productId);
  const orderId = asString(params.orderId);
  const invalidRouteKey = Boolean(routeKey && !isStudioRouteKey(routeKey));
  const resolvedRouteKey = isStudioRouteKey(routeKey) ? routeKey : 'overview';
  const route = STUDIO_ROUTES[resolvedRouteKey];
  const headerTitle = resolvedRouteKey === 'overview' ? 'Studio' : route.title;
  const headerSubtitle = resolvedRouteKey === 'overview' ? undefined : 'Studio';
  const trustedOrigins = useMemo(() => getTrustedStudioOrigins(), []);
  const originWhitelist = useMemo(() => getStudioOriginWhitelist(), []);
  const hasBrandWorkspace = hasActiveBrandMembership(user);
  const isStudioEligible = user?.type === 'BRAND' && hasBrandWorkspace;
  const queryClient = useQueryClient();
  const { isSetupComplete: storeSetupComplete } = useStoreSetupStatus();
  // One nudge per visit. The redirect below re-runs the effect, and without this
  // the toast would stack on every pass.
  const setupRedirectNotifiedRef = useRef(false);

  // Session is established once per Studio visit. Island hops must NOT mint a
  // new handoff or remount the WebView — that re-downloaded the whole web bundle
  // on every Dashboard↔Store↔Staff switch.
  const sessionEstablishedRef = useRef(false);
  const lastInjectedRouteRef = useRef<string | null>(null);
  const pendingRouteRef = useRef<{
    routeKey: StudioRouteKey;
    productId?: string;
    orderId?: string;
  } | null>(null);
  const loadStateRef = useRef(loadState);
  loadStateRef.current = loadState;

  const closeStudio = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  const retry = useCallback(() => {
    sessionEstablishedRef.current = false;
    lastInjectedRouteRef.current = null;
    pendingRouteRef.current = null;
    setWebUrl(null);
    setLoadState('booting');
    setRetryKey((current) => current + 1);
  }, []);

  // The colour scheme only seasons the handoff URL. Keeping it out of the
  // effect's deps matters: ThemeProvider resolves the stored preference just
  // after mount, and that flip used to re-run the effect — minting a SECOND
  // handoff code and remounting the WebView, so the entire web bundle
  // downloaded twice. That was a large part of "the creation time is slow".
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;

  useEffect(() => {
    // Finance is a native screen — never boot the Studio WebView for it.
    if (resolvedRouteKey === 'finance') {
      router.replace('/studio/finance' as any);
      return;
    }
  }, [resolvedRouteKey]);

  const navigateStudioInPlace = useCallback(
    (route: StudioRouteKey, params?: { productId?: string; orderId?: string }) => {
      if (!webViewRef.current) return false;
      try {
        const path = buildStudioPath(route, params);
        const signature = `${route}:${params?.productId ?? ''}:${params?.orderId ?? ''}`;
        if (lastInjectedRouteRef.current === signature) return true;
        lastInjectedRouteRef.current = signature;
        const script = `
          (function() {
            try {
              var path = ${JSON.stringify(path)};
              if (typeof window.__WIEZ_STUDIO_NAV_GO__ === 'function') {
                window.__WIEZ_STUDIO_NAV_GO__(path);
              } else if (typeof window.__WIEZ_STUDIO_NAV__ === 'function') {
                window.__WIEZ_STUDIO_NAV__(path);
              } else {
                window.__WIEZ_STUDIO_NAV_PENDING__ = path;
              }
            } catch (e) {}
            true;
          })();
        `;
        webViewRef.current.injectJavaScript(script);
        trackStudioWebViewEvent('route-open', { routeKey: route, inPlace: true });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    registerStudioInPlaceHandler(navigateStudioInPlace);
    return () => {
      registerStudioInPlaceHandler(null);
    };
  }, [navigateStudioInPlace]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (status === 'loading') return;
      if (resolvedRouteKey === 'finance') {
        return;
      }
      if (invalidRouteKey) {
        setErrorMessage('Invalid Studio route.');
        setLoadState('error');
        return;
      }
      if (status !== 'authenticated') {
        setErrorMessage('Sign in again to open Studio.');
        setLoadState('error');
        return;
      }
      if (!isStudioEligible) {
        setErrorMessage(
          hasBrandWorkspace
            ? 'Studio currently opens for brand-owner accounts. Ask the brand owner to open this workspace.'
            : 'Ask the brand owner for access to this workspace.',
        );
        setLoadState('error');
        return;
      }

      // Store setup is unfinished: send every trading route to the START of
      // setup. This sits ahead of the warm-session shortcut so an island hop
      // cannot slip a gated route through an already-booted WebView. `null`
      // (status unknown) deliberately falls through — a slow or failed
      // /store/status must never strand a brand whose store is live.
      //
      // `essentials`, not `setup`. Setup is two phases — Essentials, then the
      // wizard — and pointing at the wizard skipped the first phase entirely:
      // every brand began setup on the Social step having never been asked for
      // their essentials. Essentials forwards to the wizard on its own when it
      // is already done, so this is the correct entry from any state.
      if (storeSetupComplete === false && !STORE_SETUP_EXEMPT_ROUTES.has(resolvedRouteKey)) {
        if (!setupRedirectNotifiedRef.current) {
          setupRedirectNotifiedRef.current = true;
          toast.info('Finish setting up your store to open Studio.');
        }
        router.replace({ pathname: '/studio', params: { routeKey: 'essentials' } } as any);
        return;
      }

      // Warm session: island tab switch → SPA navigate, zero handoff.
      if (sessionEstablishedRef.current && loadStateRef.current === 'ready' && webViewRef.current) {
        pendingRouteRef.current = null;
        navigateStudioInPlace(resolvedRouteKey, { productId, orderId });
        return;
      }

      // Shell still booting: remember the latest island target and apply it
      // when READY arrives. Never stack a second handoff.
      if (sessionEstablishedRef.current && loadStateRef.current !== 'error') {
        pendingRouteRef.current = { routeKey: resolvedRouteKey, productId, orderId };
        return;
      }

      try {
        const intendedPath = buildStudioPath(resolvedRouteKey, { productId, orderId });
        const handoff = await StudioApi.createHandoff(intendedPath);
        if (!mounted) return;
        sessionEstablishedRef.current = true;
        lastInjectedRouteRef.current = `${resolvedRouteKey}:${productId ?? ''}:${orderId ?? ''}`;
        setWebUrl(
          buildStudioWebUrl({
            routeKey: resolvedRouteKey,
            params: { productId, orderId },
            handoffCode: handoff.code,
            theme: schemeRef.current,
          }),
        );
        trackStudioWebViewEvent('route-open', { routeKey: resolvedRouteKey, cold: true });
        setLoadState('loading');
      } catch (error) {
        if (!mounted) return;
        sessionEstablishedRef.current = false;
        const message = error instanceof Error ? error.message : '';
        if (message.includes('Missing productId')) {
          setErrorMessage('Missing product id for this Studio route.');
        } else if (message.includes('Missing orderId')) {
          setErrorMessage('Missing order id for this Studio route.');
        } else {
          setErrorMessage('Studio session could not be prepared. Check your connection and try again.');
        }
        trackStudioWebViewEvent('handoff-failed', {
          routeKey: resolvedRouteKey,
          reason: message || 'unknown',
        });
        setLoadState('error');
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [
    hasBrandWorkspace,
    invalidRouteKey,
    isStudioEligible,
    navigateStudioInPlace,
    orderId,
    productId,
    resolvedRouteKey,
    retryKey,
    status,
    storeSetupComplete,
    toast,
  ]);

  useEffect(() => {
    if (!webUrl || loadState !== 'loading') return;

    const timeout = setTimeout(() => {
      trackStudioWebViewEvent('ready-timeout', { routeKey: resolvedRouteKey });
      setErrorMessage('Studio took too long to confirm the secure session. Try again.');
      setLoadState('error');
    }, READY_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [loadState, resolvedRouteKey, webUrl]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      closeStudio();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack, closeStudio]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(Boolean(navState.canGoBack));
  }, []);

  /**
   * `source: 'route-report'` is a NOTIFICATION, not a request.
   *
   * `ROUTE_CHANGED` is emitted by the injected history shim (pushState /
   * replaceState / popstate) and by the web `StudioHandoffGate` on every
   * location change — it says "the SPA has already navigated here". Routing it
   * through the same path as a tapped link meant that any path the classifier
   * did not recognise raised "Open this from the WIEZ app" at a user who was
   * inside the app and had not asked for anything. Pressing Back out of the
   * drafts view was one of them.
   *
   * The native-route handoff still has to run on a report — an SPA pushState
   * never reaches `onShouldStartLoadWithRequest`, so this is the only hook that
   * can catch the web app walking onto a screen native owns. `external` and
   * `blocked` are silent here: a same-origin route change is never something to
   * hand to the system browser, and a route the WebView already rendered is not
   * something the user can act on.
   */
  const openNavigationTarget = useCallback(
    (target: string, source: 'navigation' | 'message' | 'route-report') => {
      const aliasTarget = getTrustedAliasPath(target);
      if (aliasTarget) {
        perfMark('studio-webview-tap');
        drillDownPush({
          pathname: '/studio/resolve-alias',
          params: {
            aliasType: aliasTarget.type,
            aliasValue: aliasTarget.value,
            source,
          },
        } as any);
        return false;
      }

      const classification = classifyStudioWebUrl(target, trustedOrigins);

      if (classification.type === 'studio') {
        return true;
      }

      if (classification.type === 'native') {
        trackStudioWebViewEvent('native-route-opened', {
          source,
          path: sanitizePathForTelemetry(classification.path),
        });
        drillDownPush(classification.nativeRoute as any);
        return false;
      }

      if (classification.type === 'external') {
        if (source === 'route-report') return false;
        trackStudioWebViewEvent('external-link-opened', {
          source,
          url: sanitizeUrlForTelemetry(classification.url),
        });
        void WebBrowser.openBrowserAsync(classification.url).catch(() => undefined);
        toast.info('Opened outside Studio');
        return false;
      }

      trackStudioWebViewEvent('native-route-blocked', {
        source,
        reason: classification.reason,
        path: sanitizePathForTelemetry(classification.path),
      });
      if (source !== 'route-report') {
        toast.info('Open this from the WIEZ app');
      }
      return false;
    },
    [toast, trustedOrigins],
  );

  const handleShouldStartLoad = useCallback(
    (request: any) => {
      const url = typeof request?.url === 'string' ? request.url : '';
      if (!url || url === 'about:blank') return true;
      if (request?.isTopFrame === false) return true;

      return openNavigationTarget(url, 'navigation');
    },
    [openNavigationTarget],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: NativeMessage | null = null;
      try {
        message = JSON.parse(event.nativeEvent.data) as NativeMessage;
      } catch {
        return;
      }

      const messageLog = message as Partial<{
        type: string;
        reason: string;
        stage: string;
        status: number;
        apiBaseUrl: string;
        path: string;
      }>;
      trackStudioWebViewEvent('native-message-received', {
        type: messageLog.type,
        reason: messageLog.reason,
        stage: messageLog.stage,
        status: messageLog.status,
        apiBaseUrl: messageLog.apiBaseUrl,
        path: sanitizePathForTelemetry(messageLog.path),
      });

      switch (message?.type) {
        case 'READY':
          setLoadState('ready');
          sessionEstablishedRef.current = true;
          // Apply the latest island target if the user tapped another tab while
          // the first handoff was still confirming.
          if (pendingRouteRef.current) {
            const pending = pendingRouteRef.current;
            pendingRouteRef.current = null;
            requestAnimationFrame(() => {
              navigateStudioInPlace(pending.routeKey, {
                productId: pending.productId,
                orderId: pending.orderId,
              });
            });
          }
          break;
        case 'AUTH_REQUIRED':
        case 'HANDOFF_FAILED':
          sessionEstablishedRef.current = false;
          setErrorMessage(
            message.type === 'HANDOFF_FAILED' && message.status
              ? `Studio handoff failed during ${message.stage ?? 'exchange'} with HTTP ${message.status}.`
              : message.type === 'HANDOFF_FAILED' && message.reason === 'network_or_cors_error'
                ? `Studio handoff could not reach the API from the web view. API: ${message.apiBaseUrl ?? 'unknown'}`
                : 'Your Studio session expired. Close Studio and open it again.',
          );
          setLoadState('error');
          break;
        case 'PROFILE_SETUP_REQUIRED':
          toast.info('Complete brand setup in the app to continue');
          break;
        case 'OPEN_EXTERNAL':
          if (message.url) {
            openNavigationTarget(message.url, 'message');
          }
          break;
        case 'OPEN_NATIVE_ROUTE':
          if (message.path) {
            openNavigationTarget(message.path, 'message');
          }
          break;
        case 'ROUTE_CHANGED':
          if (message.path) {
            openNavigationTarget(message.path, 'route-report');
          }
          break;
        case 'CLOSE':
          closeStudio();
          break;
        case 'ACTION_COMPLETE':
          /**
           * The WebView finished something whose answer this shell caches.
           *
           * Store setup is the case that matters: the dock gates on the native
           * `store.status` query, which is a different process from the web app
           * that just published. No amount of cache work inside the WebView can
           * reach it, so publishing left the brand on a live store with every
           * dock chip still greyed out until they restarted the app.
           *
           * Written through before invalidating so the dock unlocks on this
           * frame rather than after a round trip, then reconciled with the
           * server. `refetchType: 'all'` because the dock's query may have no
           * mounted observer at this instant.
           */
          if (message.action === 'STORE_SETUP_COMPLETE') {
            queryClient.setQueryData(queryKeys.store.status(), (previous: any) =>
              previous
                ? { ...previous, isSetupComplete: true, isPublished: true, isStoreOpen: true }
                : previous,
            );
            void queryClient.invalidateQueries({
              queryKey: queryKeys.store.status(),
              refetchType: 'all',
            });
          }
          break;
        default:
          break;
      }
    },
    [closeStudio, navigateStudioInPlace, openNavigationTarget, queryClient, toast],
  );

  const openSearch = useCallback(() => {
    if (loadState === 'ready' && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.dispatchEvent(new CustomEvent('wiez:native-search-open'));
        true;
      `);
      return;
    }
    openNavigationTarget('/search', 'message');
  }, [loadState, openNavigationTarget]);

  const openHelp = useCallback(() => {
    setProfileMenuVisible(false);
    void WebBrowser.openBrowserAsync(new URL('/help/verified-badge', env.webAppUrl).toString()).catch(() => undefined);
  }, []);

  /*
   * Push, never replace.
   *
   * These three used `router.replace`, which drops the Studio screen out of the
   * stack entirely. Two consequences, both reported:
   *
   *   1. Back had nowhere to return to. `AppBackButton` falls through to its
   *      `fallbackHref` when `canGoBack()` is false, and `/notifications` uses
   *      `/(tabs)` — whose `initialRouteName` is `index`. So a brand who opened
   *      Notifications from their own Store and pressed back landed on Runway.
   *   2. It unmounted the WebView and with it the warm Studio session, so
   *      coming back re-ran the whole handoff and reload. `handleMenuStaff`
   *      right below already documents that exact cost as the reason it stays
   *      in-place.
   *
   * `drillDownPush` is what every other caller of these routes uses
   * (`catalog/index.tsx`, `me.tsx`, `RunwayFeedScreen`), so this also makes the
   * Studio menu behave like the rest of the app.
   */
  const handleMenuProfile = useCallback(() => {
    setProfileMenuVisible(false);
    drillDownPush((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  const handleMenuNotifications = useCallback(() => {
    setProfileMenuVisible(false);
    drillDownPush('/notifications' as any);
  }, []);

  const handleMenuOrders = useCallback(() => {
    setProfileMenuVisible(false);
    drillDownPush('/orders' as any);
  }, []);

  const handleMenuFinance = useCallback(() => {
    setProfileMenuVisible(false);
    drillDownPush('/studio/finance' as any);
  }, []);

  const handleMenuStaff = useCallback(() => {
    setProfileMenuVisible(false);
    // Stay in the WebView shell — native /studio/staff unmounted the session
    // and forced a full re-handoff when returning to Store.
    if (sessionEstablishedRef.current && loadState === 'ready') {
      navigateStudioInPlace('staff');
      return;
    }
    drillDownPush({ pathname: '/studio', params: { routeKey: 'staff' } } as any);
  }, [loadState, navigateStudioInPlace]);

  const handleStudioSignOut = useCallback(() => {
    setProfileMenuVisible(false);
    void signOut().finally(() => {
      // Browse-first: sign-out exits to the guest Runway, never the auth screen.
      router.replace('/(tabs)' as any);
    });
  }, [signOut]);

  const studioShellBackground = theme.colors.bg;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: studioShellBackground }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Header
        title={headerTitle}
        subtitle={headerSubtitle}
        style={{
          backgroundColor: studioShellBackground,
          borderBottomWidth: 0,
        }}
        left={
          <AppBackButton
            emoji={'\u{1F448}'}
            onPress={() => {
              if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return;
              }
              closeStudio();
            }}
          />
        }
        right={
          /*
           * Native chrome, so it does not wait on remote content.
           *
           * This was gated on `loadState === 'ready'`, which meant the avatar
           * and the profile menu behind it were absent for the whole load — and
           * absent for good on any Studio tab that never reports ready (a tab
           * reached through a web-side redirect re-enters `loading` and can
           * settle there). The menu is the only route to Notifications, My
           * Orders, Staff and sign-out, and none of those depend on the WebView
           * having painted. There is nothing to withhold.
           */
          <StudioHeaderActions
            user={user}
            onSearchPress={openSearch}
            onProfilePress={() => setProfileMenuVisible(true)}
          />
        }
      />

      {/* Studio lives inside (tabs) now, so the floating island overlays this
          screen's bottom edge — inset the web surface so the island never
          covers Studio's own controls. */}
      <View
        style={[
          styles.webHost,
          { backgroundColor: studioShellBackground, paddingBottom: standardScreenBottomPadding },
        ]}
      >
        {webUrl ? (
          <WebView
            ref={webViewRef}
            key={String(retryKey)}
            source={{ uri: webUrl }}
            originWhitelist={originWhitelist}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onMessage={handleMessage}
            injectedJavaScriptBeforeContentLoaded={STUDIO_NAV_BOOT_SCRIPT}
            injectedJavaScript={`
              (function() {
                ${STUDIO_NAV_BOOT_SCRIPT}
                if (window.__WIEZ_STUDIO_KEYBOARD_BOOTSTRAPPED__) {
                  return true;
                }
                window.__WIEZ_STUDIO_KEYBOARD_BOOTSTRAPPED__ = true;

                var originalPushState = history.pushState;
                var originalReplaceState = history.replaceState;
                history.pushState = function(state, title, url) {
                  originalPushState.call(this, state, title, url);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'ROUTE_CHANGED',
                    path: url || window.location.pathname + window.location.search + window.location.hash
                  }));
                };
                history.replaceState = function(state, title, url) {
                  originalReplaceState.call(this, state, title, url);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'ROUTE_CHANGED',
                    path: url || window.location.pathname + window.location.search + window.location.hash
                  }));
                };
                window.addEventListener('popstate', function(event) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'ROUTE_CHANGED',
                    path: window.location.pathname + window.location.search + window.location.hash
                  }));
                });

                // Store setup / Studio web forms: the WebView does not inherit
                // React Native's keyboard-aware scroll, so the page has to reveal
                // its own focused field when the IME covers it.
                //
                // The previous version fought the user for control of the scroll
                // position. It re-centred the focused field on EVERY 'resize' and
                // every visualViewport resize, unconditionally — and on Android
                // the IME, the suggestion strip and the smooth scroll it had just
                // started each fire more resize events. So while a variant field
                // was focused, any attempt to scroll was undone 80ms later and the
                // page snapped back; the screen "moved and could not be adjusted
                // back". It also used block:'center', which travels the maximum
                // possible distance even when the field was already perfectly
                // visible.
                //
                // Three rules now: only move when the field is ACTUALLY obscured,
                // move the shortest distance that reveals it, and never move while
                // the user's own finger is driving the scroll.
                function isEditable(el) {
                  if (!el || el === document.body) return false;
                  var tag = (el.tagName || '').toLowerCase();
                  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
                  return !!el.isContentEditable;
                }
                var lastUserScrollAt = 0;
                var USER_SCROLL_GRACE_MS = 1500;
                function markUserScroll() { lastUserScrollAt = Date.now(); }
                document.addEventListener('touchstart', markUserScroll, true);
                document.addEventListener('touchmove', markUserScroll, true);
                document.addEventListener('wheel', markUserScroll, true);

                function visibleBottom() {
                  return window.visualViewport
                    ? window.visualViewport.height
                    : window.innerHeight;
                }
                function isObscured(el) {
                  var rect = el.getBoundingClientRect();
                  // 16px of breathing room under the field so the caret is never
                  // flush against the keyboard.
                  return rect.bottom > visibleBottom() - 16 || rect.top < 0;
                }
                function revealFocusedField(ignoreUserScroll) {
                  var el = document.activeElement;
                  if (!isEditable(el)) return;
                  if (!ignoreUserScroll && Date.now() - lastUserScrollAt < USER_SCROLL_GRACE_MS) return;
                  if (!isObscured(el)) return;
                  try {
                    // 'nearest', not 'center' — the shortest move that works.
                    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                  } catch (e) {
                    try { el.scrollIntoView(false); } catch (e2) {}
                  }
                }
                document.addEventListener('focusin', function() {
                  // A fresh focus is the user asking for this field, so it wins
                  // over the scroll grace period. Twice: once early, once after
                  // the keyboard animation has actually resized the viewport.
                  setTimeout(function() { revealFocusedField(true); }, 100);
                  setTimeout(function() { revealFocusedField(true); }, 360);
                }, true);

                var lastVisibleBottom = visibleBottom();
                function onViewportResize() {
                  var next = visibleBottom();
                  // Only react to the viewport SHRINKING by a meaningful amount,
                  // i.e. a keyboard opening. Growing back, or the small jitter an
                  // Android suggestion strip produces, must not re-grab the
                  // scroll — that was the loop the user could not escape.
                  var keyboardOpened = next < lastVisibleBottom - 80;
                  lastVisibleBottom = next;
                  if (keyboardOpened) {
                    setTimeout(function() { revealFocusedField(true); }, 60);
                  }
                }
                window.addEventListener('resize', onViewportResize);
                if (window.visualViewport) {
                  window.visualViewport.addEventListener('resize', onViewportResize);
                }
              })();
              true;
            `}
            // iOS: allow programmatic focus paths used by Studio multi-step forms.
            keyboardDisplayRequiresUserAction={false}
            // Android: hardware layer. (The comment here used to say "prefer
            // software layer" while setting "hardware" — the value is what ships,
            // and hardware is what Studio has been tested on.)
            androidLayerType="hardware"
            onLoadStart={() => setLoadState((current) => (current === 'ready' ? current : 'loading'))}
            onError={() => {
              setErrorMessage('Studio could not load. Check your connection and try again.');
              trackStudioWebViewEvent('load-failed', { routeKey: resolvedRouteKey, reason: 'webview-error' });
              setLoadState('error');
            }}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 500) {
                setErrorMessage('Studio is temporarily unavailable. Try again shortly.');
                trackStudioWebViewEvent('load-failed', {
                  routeKey: resolvedRouteKey,
                  statusCode: event.nativeEvent.statusCode,
                });
                setLoadState('error');
              }
            }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            cacheEnabled
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={[styles.webView, { backgroundColor: studioShellBackground }]}
          />
        ) : null}

        {loadState === 'booting' || loadState === 'loading' ? (
          <View
            style={[styles.loadingOverlay, { backgroundColor: studioShellBackground }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading Studio"
          >
            <MuseLoader size={84} />
          </View>
        ) : null}

        {loadState === 'error' ? (
          <View style={[styles.overlay, { backgroundColor: studioShellBackground }]}>
            <View style={styles.errorContent}>
              <AppText variant="h3">Studio unavailable</AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>
                {errorMessage}
              </AppText>
              <View style={styles.errorActions}>
                <Button title="Retry" onPress={retry} />
                <Button title="Close" variant="secondary" onPress={closeStudio} />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <StudioProfileMenu
        visible={profileMenuVisible}
        user={user}
        topOffset={insets.top + 68}
        onClose={() => setProfileMenuVisible(false)}
        onOpenProfile={handleMenuProfile}
        onOpenNotifications={handleMenuNotifications}
        onOpenOrders={handleMenuOrders}
        onOpenFinance={handleMenuFinance}
        onOpenStaff={handleMenuStaff}
        onOpenHelp={openHelp}
        onSignOut={handleStudioSignOut}
      />
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
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xl,
  },
  pressed: {
    opacity: 0.78,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
  },
  errorContent: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
  errorActions: {
    alignSelf: 'stretch',
    gap: tokens.spacing.md,
  },
});

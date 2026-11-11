import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toByteArray } from 'base64-js';
import { AppState, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';

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
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppQrSheet } from '@/components/ui/AppQrSheet';
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
  isBrandAccount,
} from '@/src/auth/brandAccess';
import { classifyStudioWebUrl } from '@/src/features/studio/studioNavigationBridge';
import { markStudioOpened } from '@/src/features/studio/studioWarmEntry';
import { jumpToIslandTabRoot } from '@/src/navigation/islandTabStack';
import {
  registerStudioInPlaceHandler,
} from '@/src/features/studio/studioNavController';
import {
  buildStudioPath,
  buildStudioWebUrl,
  getStudioOriginWhitelist,
  getTrustedStudioOrigins,
  STUDIO_ROUTES,
  getStudioRouteReport,
  getStudioRouteSignature,
  isStudioFocusedFlow,
  isStudioRouteKey,
  type StudioRouteKey,
} from '@/src/features/studio/studioRoutes';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { useBrandCommerceAccess } from '@/src/hooks/useBrandCommerceAccess';
import { useQueryClient } from '@tanstack/react-query';
import { resolveStudioSetupAccess } from '@/src/features/studio/studioAccessPolicy';
import { useStoreSetupStatus } from '@/src/hooks/useStoreSetupStatus';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { getAvatarFallback, resolveProfileImageSource } from '@/src/utils/profileImage';
import { useAndroidOverlaySystemBars } from '@/src/system/AndroidSystemBars';
import { perfMark } from '@/src/utils/perf';
import { verifyStudioParentSession } from '@/src/features/studio/verifyParentSession';
import { getApiSecurityIdentity } from '@/src/api/httpClient';
import { securityIdentityFromToken } from '@/src/auth/securityChallenge';

type LoadState = 'booting' | 'loading' | 'ready' | 'error';

/**
 * Studio never leaves the app, and recovery is never the user's job.
 *
 * An 8s hand-off to a Chrome Custom Tab used to sit here. It fired on the
 * first open after sign-in (device log 2026-10-17 18:00:26 — the page had
 * already posted ROUTE_CHANGED and was a second from READY) and showed a
 * panel offering to retry "in app", which told people Studio is a web page and
 * asked them to fix it. Studio is part of the app.
 *
 * Now: a slow first load keeps loading. A page that stalls (no READY by
 * READY_TIMEOUT_MS) or hangs after READY (no answer to the liveness ping for
 * PAGE_HUNG_AFTER_MS) is reloaded in place, silently, up to
 * MAX_SILENT_RELOADS times per visit. Only after that does the error panel —
 * with one Retry — appear.
 */
const MAX_SILENT_RELOADS = 1;

/**
 * Liveness after READY. A page that reported READY and THEN hung (its renderer
 * starved on a low-RAM phone) left every island chip and Back press injecting
 * script into a dead page. The shell pings the page; one that answers nothing
 * for this long is reloaded.
 */
const PAGE_PING_INTERVAL_MS = 2_000;
const PAGE_HUNG_AFTER_MS = 10_000;
const PAGE_PING_SCRIPT = `try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage('{"type":"PONG"}'); } catch (e) {} true;`;

type NativeMessage =
  | { type: 'READY' }
  | { type: 'BOOT_FAILED' }
  | { type: 'ROUTE_CHANGED'; path?: string }
  | { type: 'AUTH_REQUIRED'; reason?: string }
  | { type: 'VERIFY_PHONE_SESSION'; requestId?: string; parentSessionId?: string }
  | { type: 'CANCEL_PHONE_SESSION_VERIFICATION'; requestId?: string; parentSessionId?: string }
  | {
      type: 'HANDOFF_FAILED';
      reason?: string;
      stage?: string;
      status?: number;
      message?: string;
      apiBaseUrl?: string;
    }
  /**
   * `reason` disambiguates two different blocks that the web gate posts under
   * this one type — an unverified email and an incomplete brand profile. They
   * need different destinations, and without it the shell cannot tell them
   * apart. Older web builds omit it; the handler treats that as the brand
   * profile, which is the case that actually reaches people.
   */
  | {
      type: 'PROFILE_SETUP_REQUIRED';
      reason?: 'brand-profile' | 'email-verification';
      /** Server's own `profileMissingFields`: 'description' | 'tags' | 'location'. */
      missingFields?: string[];
      path?: string;
    }
  | { type: 'ACTION_COMPLETE'; action?: string; path?: string }
  | { type: 'OPEN_EXTERNAL'; url?: string }
  | { type: 'OPEN_NATIVE_ROUTE'; path?: string }
  | { type: 'CLOSE' }
  | {
      type: 'OPEN_BIO_MODAL';
      payload?: {
        title: string;
        description?: string;
        handle?: string;
        location?: string;
        avatarUrl?: string | null;
        tags?: string[];
      };
    }
  /** Answer to the liveness ping injected by the shell; see `PAGE_HUNG_AFTER_MS`. */
  | { type: 'PONG' };

const asString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * One Studio page as a comparable key: the path without hash or trailing
 * slash, plus its `tab` (Studio sections are `/studio?tab=…`). Other query
 * values (a review note, a highlight) do not make it a different page.
 */
function normalizeStudioEntryPath(path: string): string {
  const [beforeHash] = path.split('#');
  const queryStart = beforeHash.indexOf('?');
  const pathname = queryStart >= 0 ? beforeHash.slice(0, queryStart) : beforeHash;
  const query = queryStart >= 0 ? beforeHash.slice(queryStart + 1) : '';
  const tab = /(?:^|&)tab=([^&]*)/.exec(query)?.[1];
  const base = pathname.replace(/\/+$/, '') || '/';
  return tab ? `${base}?tab=${tab}` : base;
}

/**
 * `/store/status` has always returned which of the three checks failed, and no
 * client ever read it. Saying "complete your brand profile" to someone who
 * believes they already did is the least useful thing the app can say — the
 * 20-character minimum in particular fails on a description that looks filled
 * in. Name the gap instead.
 */
const BRAND_PROFILE_FIELD_LABELS: Record<string, string> = {
  description: 'a description of at least 20 characters',
  tags: 'at least one tag',
  location: 'a country or state',
};

function describeMissingBrandProfileFields(fields?: string[]): string {
  const labels = (fields ?? [])
    .map((field) => BRAND_PROFILE_FIELD_LABELS[field] ?? field)
    .filter(Boolean);

  if (labels.length === 0) {
    return 'Finish your brand profile to open Studio';
  }
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `Studio needs ${list}`;
}

// First open after sign-in measured ~9s to READY on the A17; this is the
// point where a load is stalled rather than slow.
const READY_TIMEOUT_MS = 25_000;

/**
 * Install a durable in-place navigator before the web app hydrates.
 *
 * Island hops inject `window.__WIEZ_STUDIO_NAV_GO__(path)`. That function
 * prefers the React Router bridge (`__WIEZ_STUDIO_NAV__`) and otherwise
 * QUEUES the path until the bridge registers. It must never full-reload
 * the document (bundle + React + every query) — that was the 3–5s dead-tap
 * on every Studio chip.
 */
const buildStudioThemeBootScript = (themeScheme: string) => `
  (function() {
    try {
      var root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add('${themeScheme}');
      root.dataset.theme = '${themeScheme}';
      root.dataset.themePreference = '${themeScheme}';
      root.style.colorScheme = '${themeScheme}';
      root.dataset.embeddedSurface = 'mobile-app';
      root.dataset.surface = 'mobile-app';
      root.classList.add('is-embedded-mobile');
      sessionStorage.setItem('WIEZ.studio.embeddedTheme', '${themeScheme}');
      sessionStorage.setItem('wiez.studio.embeddedTheme', '${themeScheme}');
      sessionStorage.setItem('WIEZ.studio.embeddedSurface', 'mobile-app');
      sessionStorage.setItem('wiez.studio.embeddedSurface', 'mobile-app');
      localStorage.setItem('vite-ui-theme', '${themeScheme}');
      window.dispatchEvent(new CustomEvent('wiez:theme-changed', { detail: { theme: '${themeScheme}' } }));
    } catch(e) {}
    true;
  })();
`;

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
  | 'ready-timeout'
  | 'silent-reload'
  | 'page-unresponsive'
  | 'page-ready';

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
  if (__DEV__) {
    console.info('[studio-webview]', name, properties);
    return;
  }
  // Release builds log too. Studio freezing after sign-in was undiagnosable
  // because every event here was compiled out of the APK the bug lives in.
  // Bodies are already sanitized (no handoff codes, origin+path only), and
  // `logs:device -- --summary` keeps the `[WIEZ-STUDIO]` tag.
  if (name === 'native-message-received' && properties?.type === 'PONG') return;
  console.warn(`[WIEZ-STUDIO] ${name} ${JSON.stringify(properties ?? {})}`);
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
    studioRouteReport?: string;
    productId?: string;
    orderId?: string;
    /** `catalog` when the Catalogue opened this page — see `catalogEntryRef`. */
    from?: string;
  }>();
  const { status, token, user, signOut } = useAuth();
  const actorId = user?.id;
  const activeBrandId = getActiveBrandId(user);
  const nativeIdentity = securityIdentityFromToken(token, value => String.fromCharCode(...toByteArray(value)));
  const studioScope = `${actorId ?? ''}:${activeBrandId ?? ''}:${nativeIdentity ?? ''}`;
  const currentStudioScopeRef = useRef(studioScope);
  currentStudioScopeRef.current = studioScope;
  const documentStudioScopeRef = useRef<string | null>(null);
  const { scheme, theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { standardScreenBottomPadding } = useScreenChrome();
  const webViewRef = useRef<WebView>(null);
  const deferredProfileSetupRef = useRef<{ scope: string; message: NativeMessage } | null>(null);
  const phoneVerification = useRef<{ controller: AbortController; requestId: string; parentSessionId: string } | null>(null);
  useEffect(() => () => phoneVerification.current?.controller.abort(), []);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('booting');
  const [webUrl, setWebUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('Studio could not load.');
  const [retryKey, setRetryKey] = useState(0);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [bioModalData, setBioModalData] = useState<{
    title: string;
    description?: string;
    handle?: string;
    location?: string;
    avatarUrl?: string | null;
    tags?: string[];
  } | null>(null);
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const [storeQrVisible, setStoreQrVisible] = useState(false);

  const routeKey = asString(params.routeKey);
  const productId = asString(params.productId);
  const orderId = asString(params.orderId);
  const invalidRouteKey = Boolean(routeKey && !isStudioRouteKey(routeKey));
  const resolvedRouteKey = isStudioRouteKey(routeKey) ? routeKey : 'overview';
  const reportedRouteSignature = asString(params.studioRouteReport);
  const route = STUDIO_ROUTES[resolvedRouteKey];
  const brandTitle = user?.brandFullName?.trim() || (user?.username ? `@${user.username.replace(/^@/, '')}` : 'Store');
  const dashboardTitleNode = (
    <View style={styles.dashboardTitleRow}>
      {/* Name and LIVE share one row; LIVE never shrinks and never drops
          under the name. The name is never cut off (owner, Nov 2026: "there
          is still truncation of the brand name on the store navbar") — on
          Store, Upgrade and the QR button leave it about half the header, so
          it takes a second line and shrinks a little before it would ever
          need an ellipsis. */}
      <AppText
        variant="subtitle"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={styles.dashboardTitleText}
      >
        {brandTitle}
      </AppText>
      <View style={[styles.livePill, { borderColor: theme.colors.success }]}>
        <View style={[styles.liveDot, { backgroundColor: theme.colors.success }]} />
        <AppText variant="badgeLabel" tone="success">
          LIVE
        </AppText>
      </View>
    </View>
  );
  const headerTitle =
    resolvedRouteKey === 'overview' || resolvedRouteKey === 'store'
      ? dashboardTitleNode
      : resolvedRouteKey === 'orders'
        ? `${brandTitle} Orders`
        : resolvedRouteKey === 'finance'
          ? `${brandTitle} Finance`
          : route.title;
  const headerSubtitle = undefined;
  const trustedOrigins = useMemo(() => getTrustedStudioOrigins(), []);
  const originWhitelist = useMemo(() => getStudioOriginWhitelist(), []);
  const hasBrandWorkspace = hasActiveBrandMembership(user);
  const isStudioEligible = isBrandAccount(user) && hasBrandWorkspace;
  // False while the tab shell has warmed Studio in the background.
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  // Remember that this brand uses Studio, so later sessions warm it ahead of
  // the tap (studioWarmEntry.ts). Only when Studio is actually on screen.
  const userIdForWarm = user?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      void markStudioOpened(userIdForWarm);
    }, [userIdForWarm]),
  );
  const queryClient = useQueryClient();
  const commerce = useBrandCommerceAccess();
  const { isSetupComplete: storeSetupComplete } = useStoreSetupStatus();
  const setupCompleteRef = useRef(storeSetupComplete);
  setupCompleteRef.current = storeSetupComplete;
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
  useEffect(() => {
    if (documentStudioScopeRef.current === studioScope) return;
    phoneVerification.current?.controller.abort();
    sessionEstablishedRef.current = false;
    documentStudioScopeRef.current = null;
    deferredProfileSetupRef.current = null;
    lastInjectedRouteRef.current = null;
    pendingRouteRef.current = null;
    setWebUrl(null); setCanGoBack(false); setLoadState('booting');
  }, [studioScope]);
  const loadStateRef = useRef(loadState);
  loadStateRef.current = loadState;
  // A web Back was sent and the page has not answered yet — see the BackHandler.
  const webBackPendingRef = useRef(false);

  /*
    Leaving Studio goes to the brand's Catalogue — never `router.back()`.

    Studio is a TAB. `router.back()` from a tab walks tab history, and on a
    fresh session that history's floor is the first tab: Runway. Every 👈 and
    hardware Back that fell through to here put a brand on the shopper feed
    and left them to find their way back (owner report 2026-10-17).
  */
  const closeStudio = useCallback(() => {
    // The island's direct tab jump first; the router only if the tab
    // navigator is not registered. `router.navigate` rebuilt the whole
    // navigation state from the URL before the Catalogue could move.
    if (jumpToIslandTabRoot(hasBrandWorkspace ? 'catalog' : 'me')) return;
    router.navigate((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  // The page's own location, from its ROUTE_CHANGED reports.
  const lastWebPathRef = useRef<string | null>(null);

  /*
    A Studio page the Catalogue opened goes BACK to the Catalogue.

    Tapping a product on the Catalogue's Shop tab opens the Studio editor. The
    Studio WebView stays alive all session, so its web history still held the
    pages of earlier visits, and 👈 walked back through those and then the
    Dashboard instead of returning to the card the brand tapped (owner, Nov
    2026: "whenever i route into screens on the studio while i am on
    catalogue, the back emoji … is not smart enough to take me back").

    The Catalogue marks its links `from: 'catalog'`. While the brand is still
    on that page, Back leaves Studio for the Catalogue. If they went deeper
    from it, Back first steps back to it, then out. Leaving Studio ends it.
  */
  const catalogEntryRef = useRef<{ path: string; reached: boolean; left: boolean } | null>(null);
  const entryFrom = asString(params.from);
  useEffect(() => {
    if (entryFrom !== 'catalog') return;
    let path = '';
    try {
      path = normalizeStudioEntryPath(buildStudioPath(resolvedRouteKey, { productId, orderId }));
    } catch {
      // A route missing its id never matches a page report, so Back still
      // returns to the Catalogue — the one thing the mark promises.
    }
    // Already showing that page (same product again): the page sends no new
    // report, so it counts as reached now.
    const showing = lastWebPathRef.current ? normalizeStudioEntryPath(lastWebPathRef.current) : null;
    catalogEntryRef.current = { path, reached: Boolean(path) && showing === path, left: false };
    // Consumed: a later island hop to the same screen must not inherit it.
    router.setParams({ from: undefined } as never);
  }, [entryFrom, orderId, productId, resolvedRouteKey]);
  useFocusEffect(useCallback(() => () => {
    catalogEntryRef.current = null;
  }, []));

  const retry = useCallback(() => {
    sessionEstablishedRef.current = false;
    lastInjectedRouteRef.current = null;
    pendingRouteRef.current = null;
    setWebUrl(null);
    setLoadState('booting');
    setRetryKey((current) => current + 1);
  }, []);

  /*
    A booted Studio belongs to one account and one brand (Item 3, Nov 2026).

    The WebView stays alive across tabs, and the boot effect deliberately does
    not re-run the handoff for a warm session. So signing out left the previous
    brand's Studio page in memory behind the error panel, and a staff member
    switching their active brand kept the old brand's session — the user id
    does not change on a brand switch. When the owner changes, unmount the
    WebView and boot again for whoever is signed in now (or show sign-in).
  */
  const sessionOwner =
    status === 'authenticated' && user?.id ? `${user.id}:${user.activeBrandId ?? ''}` : null;
  const sessionOwnerNowRef = useRef(sessionOwner);
  sessionOwnerNowRef.current = sessionOwner;
  const sessionBootedForRef = useRef<string | null>(null);
  useEffect(() => {
    const bootedFor = sessionBootedForRef.current;
    if (!bootedFor || bootedFor === sessionOwner) return;
    // A token refresh passes through `loading` for the same account.
    if (status === 'loading') return;
    sessionBootedForRef.current = null;
    retry();
  }, [retry, sessionOwner, status]);

  // The colour scheme only seasons the handoff URL. Keeping it out of the
  // effect's deps matters: ThemeProvider resolves the stored preference just
  // after mount, and that flip used to re-run the effect — minting a SECOND
  // handoff code and remounting the WebView, so the entire web bundle
  // downloaded twice. That was a large part of "the creation time is slow".
  const schemeRef = useRef(scheme);
    schemeRef.current = scheme;

  useEffect(() => {
    if (!webViewRef.current) return;
    try {
      webViewRef.current.injectJavaScript(buildStudioThemeBootScript(scheme));
    } catch {
      // WebView not ready yet
    }
  }, [scheme]);

  useEffect(() => {
    // Finance is a native screen — never boot the Studio WebView for it.
    if (resolvedRouteKey === 'finance') {
      router.replace('/studio/finance' as any);
      return;
    }
  }, [resolvedRouteKey]);

  const navigateStudioInPlace = useCallback(
    (route: StudioRouteKey, params?: { productId?: string; orderId?: string }) => {
      if (!webViewRef.current || resolveStudioSetupAccess(route, setupCompleteRef.current) !== 'allow') return false;
      try {
        const path = buildStudioPath(route, params);
        const signature = getStudioRouteSignature(route, params);
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
      if (!nativeIdentity || nativeIdentity.split(':')[0] !== actorId || getApiSecurityIdentity() !== nativeIdentity) return;
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
        // A Studio warmed in the background (studioWarmEntry.ts) is not on
        // screen: never toast or redirect from it. The effect re-runs on
        // focus, and the redirect happens then.
        if (!isFocusedRef.current) return;
        if (!setupRedirectNotifiedRef.current) {
          setupRedirectNotifiedRef.current = true;
          toast.info('Finish setting up your store to open Studio.');
        }
        router.replace({ pathname: '/studio', params: { routeKey: 'essentials' } } as any);
        return;
      }

      // A web notification updates native chrome only. Re-injecting it is a
      // feedback loop when React/native deliver consecutive reports in batches.
      if (sessionEstablishedRef.current && reportedRouteSignature ===
          getStudioRouteSignature(resolvedRouteKey, { productId, orderId })) return;

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

      // Cold boot only: hand the decoded-bitmap cache back to the system before
      // a whole browser engine starts in a second process. On the A17 the
      // renderer was killed for memory while Runway/Market bitmaps sat in RAM.
      // Disk cache is untouched, so returning to a feed re-decodes, not
      // re-downloads.
      // Not for a background warm: the brand is looking at their profile, and
      // dropping its decoded images would flicker the very screen on display.
      if (isFocusedRef.current) {
        void ExpoImage.clearMemoryCache().catch(() => undefined);
      }

      try {
        // Establish the web session through the allowlisted Studio entry, then
        // navigate to settings inside the authenticated SPA.
        const settingsEntry = ['storeProfile', 'privateDesignAccess', 'payoutSettings'].includes(resolvedRouteKey);
        const entryRoute = settingsEntry ? 'overview' : resolvedRouteKey;
        if (settingsEntry) pendingRouteRef.current = { routeKey: resolvedRouteKey };
        const intendedPath = buildStudioPath(entryRoute, { productId, orderId });
        const handoff = await StudioApi.createHandoff(intendedPath);
        if (!mounted || currentStudioScopeRef.current !== studioScope || getApiSecurityIdentity() !== nativeIdentity) return;
        documentStudioScopeRef.current = studioScope;
        sessionEstablishedRef.current = true;
        sessionBootedForRef.current = sessionOwnerNowRef.current;
        lastInjectedRouteRef.current = getStudioRouteSignature(entryRoute, { productId, orderId });
        setWebUrl(
          buildStudioWebUrl({
            routeKey: entryRoute,
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
    isFocused,
    isStudioEligible,
    navigateStudioInPlace,
    orderId,
    productId,
    resolvedRouteKey,
    reportedRouteSignature,
    retryKey,
    status,
    actorId,
    studioScope,
    nativeIdentity,
    storeSetupComplete,
    toast,
  ]);

  // Silent in-app reloads spent this visit — see MAX_SILENT_RELOADS.
  const silentReloadsRef = useRef(0);

  /**
   * Reload Studio in place without telling anyone, or — once the silent budget
   * is spent — show the error panel. The loading overlay stays up throughout,
   * so to the user this is just a longer load.
   */
  const recoverStudio = useCallback(
    (reason: 'ready-timeout' | 'page-unresponsive', detail?: Record<string, number>) => {
      trackStudioWebViewEvent(reason, { routeKey: resolvedRouteKey, ...detail });
      if (silentReloadsRef.current < MAX_SILENT_RELOADS) {
        silentReloadsRef.current += 1;
        trackStudioWebViewEvent('silent-reload', { routeKey: resolvedRouteKey });
        retry();
        return;
      }
      setErrorMessage('Studio is taking longer than usual. Check your connection and try again.');
      setLoadState('error');
    },
    [resolvedRouteKey, retry],
  );

  useFocusEffect(useCallback(() => {
    if (!webUrl || loadState !== 'loading') return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const restart = () => {
      clearTimeout(timeout);
      if (AppState.currentState === 'active') {
        timeout = setTimeout(() => recoverStudio('ready-timeout'), READY_TIMEOUT_MS);
      }
    };
    restart();
    const subscription = AppState.addEventListener('change', restart);
    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [loadState, recoverStudio, webUrl]));

  // Last time the page proved its main thread runs: any message or navigation.
  const lastPageSignalRef = useRef(Date.now());

  // Liveness watchdog — see PAGE_HUNG_AFTER_MS. Focused + ready only: a hidden
  // Studio tab must never reload behind whatever the user is doing, and
  // timers stop in the background, so the clock restarts on every resume.
  useFocusEffect(
    useCallback(() => {
      if (loadState !== 'ready') return undefined;
      lastPageSignalRef.current = Date.now();
      const resume = AppState.addEventListener('change', (state) => {
        if (state === 'active') lastPageSignalRef.current = Date.now();
      });
      const interval = setInterval(() => {
        if (AppState.currentState !== 'active') return;
        if (Date.now() - lastPageSignalRef.current > PAGE_HUNG_AFTER_MS) {
          recoverStudio('page-unresponsive', { silentMs: Date.now() - lastPageSignalRef.current });
          return;
        }
        webViewRef.current?.injectJavaScript(PAGE_PING_SCRIPT);
      }, PAGE_PING_INTERVAL_MS);
      return () => {
        clearInterval(interval);
        resume.remove();
      };
    }, [loadState, recoverStudio]),
  );

  /*
    One Back for Studio — the 👈 and the hardware key both land here.

    Walked inside-out, the way a native workspace behaves:
      1. On a Studio sub-page (a product editor, a collection, an order) →
         step back inside the page. If the page has no history to step back
         through (it was opened directly), go to the top of its section.
      2. On a section other than Dashboard → Dashboard.
      3. On Dashboard → leave Studio for the Catalogue.
    A web Back the page never answered (hung renderer) falls through to 3, so
    Back can never be swallowed.
  */
  const handleStudioBack = useCallback(() => {
    // Opened from the Catalogue and still on that page (or never got there):
    // back to the Catalogue, not through Studio's older history.
    const catalogEntry = catalogEntryRef.current;
    if (catalogEntry && !catalogEntry.left) {
      catalogEntryRef.current = null;
      webBackPendingRef.current = false;
      closeStudio();
      return;
    }
    const ready = loadStateRef.current === 'ready' && Boolean(webViewRef.current);
    const webPathname = (lastWebPathRef.current ?? '/studio').split('?')[0].replace(/\/+$/, '') || '/';
    const onStudioSubPage = webPathname.startsWith('/studio/');

    if (ready && onStudioSubPage && !webBackPendingRef.current) {
      if (canGoBack) {
        webBackPendingRef.current = true;
        webViewRef.current?.goBack();
        return;
      }
      lastInjectedRouteRef.current = null;
      navigateStudioInPlace(resolvedRouteKey);
      return;
    }
    if (ready && resolvedRouteKey !== 'overview' && !webBackPendingRef.current) {
      lastInjectedRouteRef.current = null;
      navigateStudioInPlace('overview');
      router.setParams({ routeKey: '' } as never);
      return;
    }
    webBackPendingRef.current = false;
    closeStudio();
  }, [canGoBack, closeStudio, navigateStudioInPlace, resolvedRouteKey]);

  /*
    Only while Studio is the screen on display.

    This was a plain `useEffect`, so the listener lived as long as the Studio
    tab stayed mounted — which, now that hidden tabs are kept alive, is the
    rest of the session after Studio is first opened. Every Android Back on
    Catalogue, Settings or anywhere else was taken by Studio's handler and
    walked Studio's own history instead of the screen in front of the user.
  */
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;

    /*
      Back can never be swallowed.

      It used to call `goBack()` whenever the page reported history — and a
      page that has hung, or whose renderer Android has killed, still reports
      it, so every Back press went into a dead WebView and the user had no way
      out short of killing the app. Now a web Back is only sent when the last
      one was answered (any message or navigation from the page clears the
      flag); an unanswered one means the page is stuck, and Back closes Studio.
    */
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleStudioBack();
      return true;
    });

    return () => subscription.remove();
  }, [handleStudioBack]));

  useEffect(() => {
    if (loadState === 'ready' && webViewRef.current) {
      const targetInset = isStudioFocusedFlow(resolvedRouteKey)
        ? 0
        : Math.round(standardScreenBottomPadding);
      webViewRef.current.injectJavaScript(
        `try { window.__WIEZ_SET_ISLAND_INSET__ && window.__WIEZ_SET_ISLAND_INSET__(${targetInset}); } catch(e) {} true;`
      );
    }
  }, [loadState, resolvedRouteKey, standardScreenBottomPadding]);

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(Boolean(navState.canGoBack));
    webBackPendingRef.current = false;
    lastPageSignalRef.current = Date.now();
    try {
      webViewRef.current?.injectJavaScript(buildStudioThemeBootScript(scheme));
    } catch {}
  }, [scheme]);

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
      // Queued messages from an old retained document cannot affect the next
      // account/workspace. Ordinary route changes keep the same scope/cache.
      if (currentStudioScopeRef.current !== studioScope || documentStudioScopeRef.current !== studioScope ||
        getApiSecurityIdentity() !== nativeIdentity) return;
      // Any message proves the page is alive, so a pending web Back is answered.
      webBackPendingRef.current = false;
      lastPageSignalRef.current = Date.now();
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
        case 'CANCEL_PHONE_SESSION_VERIFICATION': {
          let origin: string;
          try { origin = new URL(event.nativeEvent.url).origin; } catch { break; }
          const pending = phoneVerification.current;
          if (trustedOrigins.has(origin) && pending && pending.requestId === message.requestId && pending.parentSessionId === message.parentSessionId)
            pending.controller.abort();
          break;
        }
        case 'VERIFY_PHONE_SESSION': {
          let origin: string;
          try { origin = new URL(event.nativeEvent.url).origin; } catch { break; }
          const { requestId, parentSessionId } = message;
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!trustedOrigins.has(origin) || !uuid.test(requestId ?? '') || !uuid.test(parentSessionId ?? '') || phoneVerification.current) break;
          const identity = getApiSecurityIdentity();
          const controller = new AbortController(); phoneVerification.current = { controller, requestId: requestId!, parentSessionId: parentSessionId! };
          void (async () => {
            let verified = false;
            try { await verifyStudioParentSession(parentSessionId!, controller.signal); verified = true; } catch { /* The web prompt offers a bounded retry. */ }
            finally {
              if (phoneVerification.current?.controller === controller) phoneVerification.current = null;
              if (!controller.signal.aborted && identity === getApiSecurityIdentity()) {
                const detail = JSON.stringify({ requestId, parentSessionId, verified });
                webViewRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('wiez:phone-session-verification', {detail:${detail}}));true;`);
              }
            }
          })();
          break;
        }
        case 'BOOT_FAILED':
          sessionEstablishedRef.current = false;
          setErrorMessage('Studio could not start. Please try again shortly.');
          trackStudioWebViewEvent('load-failed', { routeKey: resolvedRouteKey, reason: 'web-boot-failed' });
          setLoadState('error');
          break;
        case 'PONG':
          break;
        case 'READY':
          trackStudioWebViewEvent('page-ready', { routeKey: resolvedRouteKey });
          // A healthy page earns back its silent reload for the next stall.
          silentReloadsRef.current = 0;
          setLoadState('ready');
          sessionEstablishedRef.current = true;
          try {
            webViewRef.current?.injectJavaScript(buildStudioThemeBootScript(scheme));
          } catch {}
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
          if (!isFocusedRef.current) {
            deferredProfileSetupRef.current = { scope: studioScope, message };
            break;
          }
          deferredProfileSetupRef.current = null;
          /**
           * The gate itself is right: Studio needs a description, at least one
           * tag and a location before it can open (`isBrandProfileComplete`).
           * What was wrong is what happened next — this case only raised a
           * toast, so the shell left the person sitting on the WebView's own
           * "Return to the app to complete your brand profile" card, telling
           * them to go back to an app they had never left, with nothing to
           * press. The event has always carried the destination and the shell
           * discarded it.
           *
           * The path is a WEB route (`/profile?modal=brand-setup`) with no
           * native equivalent, so this navigates to the native brand editor
           * rather than translating the URL. `replace`, not push: Studio
           * cannot open until this is done, so keeping it on the stack only
           * offers a swipe back to the same dead end.
           */
          if (message.reason === 'email-verification') {
            toast.info('Verify your email to open Studio');
            closeStudio();
            break;
          }
          toast.info(describeMissingBrandProfileFields(message.missingFields));
          router.replace('/catalog/edit-profile' as any);
          break;
        case 'OPEN_EXTERNAL':
          if (message.url) {
            openNavigationTarget(message.url, 'message');
          }
          break;
        case 'OPEN_BIO_MODAL':
          if (message.payload) {
            setBioModalData(message.payload);
            setBioModalVisible(true);
          }
          break;
        case 'OPEN_NATIVE_ROUTE':
          if (message.path) {
            openNavigationTarget(message.path, 'message');
          }
          break;
        case 'ROUTE_CHANGED':
          /*
            Every hop is reported twice — once by the injected history shim and
            once by the web `StudioHandoffGate` — and both used to run the full
            classification and route-key sync. The second report of a path the
            shell already has carries nothing new.
          */
          if (message.path && message.path === lastWebPathRef.current) break;
          if (message.path) {
            lastWebPathRef.current = message.path;
            const catalogEntry = catalogEntryRef.current;
            if (catalogEntry) {
              if (normalizeStudioEntryPath(message.path) === catalogEntry.path) {
                catalogEntry.reached = true;
                catalogEntry.left = false;
              } else if (catalogEntry.reached) {
                catalogEntry.left = true;
              }
            }
            if (!openNavigationTarget(message.path, 'route-report')) break;
            const report = getStudioRouteReport(message.path);
            if (report) {
              lastInjectedRouteRef.current = report.studioRouteReport;
              router.setParams(report as never);
            }
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
            queryClient.setQueryData(queryKeys.store.status(actorId, activeBrandId), (previous: any) =>
              previous
                ? { ...previous, isSetupComplete: true, isPublished: true, isStoreOpen: true }
                : previous,
            );
            void queryClient.invalidateQueries({
              queryKey: queryKeys.store.status(actorId, activeBrandId),
              refetchType: 'all',
            });

            /**
             * And move the shell off the setup route key.
             *
             * The dock locks on `storeSetupComplete === false || isOnSetupRoute`
             * — and `isOnSetupRoute` reads the NATIVE `routeKey` param, which a
             * web-side navigation inside the WebView cannot change. Opening
             * store setup sets it to `essentials`/`setup`, so after a
             * successful publish the cache correctly said "complete" while the
             * param still said "setup", and the OR kept every chip except
             * Store greyed out until Studio was closed and reopened.
             *
             * Fixing only the cache was never going to be enough: the second
             * condition had no way to clear itself.
             */
            router.setParams({ routeKey: 'store', studioRouteReport: '' } as never);
          }
          break;
        default:
          break;
      }
    },
    [closeStudio, navigateStudioInPlace, openNavigationTarget, queryClient, resolvedRouteKey, toast, trustedOrigins,
      actorId, activeBrandId, studioScope, nativeIdentity],
  );

  useEffect(() => {
    if (!isFocused) return;
    const deferred = deferredProfileSetupRef.current;
    deferredProfileSetupRef.current = null;
    if (!deferred || deferred.scope !== studioScope) return;
    handleMessage({ nativeEvent: { data: JSON.stringify(deferred.message) } } as WebViewMessageEvent);
  }, [isFocused, studioScope, handleMessage]);

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
   *      coming back re-ran the whole handoff and reload.
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

  const handleStudioSignOut = useCallback(() => {
    setProfileMenuVisible(false);
    void signOut();
    // Browse-first: sign-out exits to the guest Runway, never the auth screen.
    router.replace('/(tabs)' as any);
  }, [signOut]);

  const studioShellBackground = theme.colors.bg;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: studioShellBackground }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Header
        title={headerTitle}
        wrapText
        singleRow
        actions={undefined}
        subtitle={headerSubtitle}
        style={{
          backgroundColor: studioShellBackground,
          borderBottomWidth: 0,
        }}
        left={
          <AppBackButton
            emoji={'\u{1F448}'}
            onPress={handleStudioBack}
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
          <View style={styles.headerRightRow}>
            {resolvedRouteKey === 'store' && (commerce?.data?.canUpgrade ?? true) ? (
              <Button
                title="Upgrade"
                size="xs"
                variant="ghost"
                onPress={() => drillDownPush('/settings/subscriptions' as any)}
                accessibilityLabel="Upgrade store plan"
                testID="studio-header-upgrade"
                style={[styles.headerUpgrade, { backgroundColor: theme.colors.primarySoft }]}
              />
            ) : null}
            {resolvedRouteKey === 'store' ? (
              <IconButton
                size={34}
                onPress={() => setStoreQrVisible(true)}
                variant="ghost"
                testID="studio-header-qr"
              >
                <AppText variant="subtitle" accessibilityLabel="Storefront QR code">
                  🪪
                </AppText>
              </IconButton>
            ) : null}
            <StudioHeaderActions
              user={user}
              onSearchPress={openSearch}
              onProfilePress={() => setProfileMenuVisible(true)}
              compact
            />
          </View>
        }
      />

      {/* Studio lives inside (tabs) now, so the floating island overlays this
          screen's bottom edge.

          The clearance used to be native `paddingBottom` on this host, which
          left a solid band of APP background below the page — a strip in a
          slightly different colour from the web surface above it, reading as a
          container the island sat inside. The WebView now reaches the bottom
          edge and the same clearance is applied INSIDE the page (see the
          injected script), so the page's own background runs to the edge and
          there is nothing to see under the island. */}
      <View style={[styles.webHost, { backgroundColor: studioShellBackground }]}>
        {webUrl && documentStudioScopeRef.current === studioScope ? (
          <WebView
            textZoom={100}
            ref={webViewRef}
            key={`${studioScope}:${retryKey}`}
            source={{ uri: webUrl }}
            originWhitelist={originWhitelist}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onMessage={handleMessage}
            injectedJavaScriptBeforeContentLoaded={`${STUDIO_NAV_BOOT_SCRIPT}\n${buildStudioThemeBootScript(scheme)}`}
            injectedJavaScript={`
              (function() {
                ${STUDIO_NAV_BOOT_SCRIPT}
                ${buildStudioThemeBootScript(scheme)}

                /**
                 * Island clearance, applied inside the document.
                 *
                 * It used to be native padding on the host view, which painted
                 * a band of app background under the page. Doing it here keeps
                 * the page's own background running to the bottom edge, so the
                 * island floats over the page instead of over a strip.
                 *
                 * scroll-padding-bottom matters as much as the padding: without
                 * it, focusing a field near the end of a form scrolls it to
                 * exactly where the island is.
                 */
                var inset = ${isStudioFocusedFlow(resolvedRouteKey) ? 0 : Math.round(standardScreenBottomPadding)};
                var insetStyleId = 'wiez-native-island-inset';
                var insetStyle = document.getElementById(insetStyleId);
                if (!insetStyle) {
                  insetStyle = document.createElement('style');
                  insetStyle.id = insetStyleId;
                  insetStyle.textContent =
                    ':root{--wiez-native-island-inset:' + inset + 'px;}' +
                    'body{padding-bottom:calc(' + inset + 'px + env(safe-area-inset-bottom,0px));}' +
                    'html{scroll-padding-bottom:' + inset + 'px;}';
                  (document.head || document.documentElement).appendChild(insetStyle);
                }
                function updateIslandInset(val) {
                  if (insetStyle) {
                    insetStyle.textContent =
                      ':root{--wiez-native-island-inset:' + val + 'px;}' +
                      'body{padding-bottom:calc(' + val + 'px + env(safe-area-inset-bottom,0px));}' +
                      'html{scroll-padding-bottom:' + val + 'px;}';
                  }
                }
                window.__WIEZ_SET_ISLAND_INSET__ = updateIslandInset;
                updateIslandInset(inset);

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
                  return rect.bottom > visibleBottom() - 48 || rect.top < 54;
                }
                function revealFocusedField(ignoreUserScroll) {
                  var el = document.activeElement;
                  if (!isEditable(el)) return;
                  if (!ignoreUserScroll && Date.now() - lastUserScrollAt < USER_SCROLL_GRACE_MS) return;
                  if (!isObscured(el)) return;
                  try {
                    // 'nearest', not 'center' — the shortest move that works.
                    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
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
            // No forced layer type. "hardware" kept the whole Studio page in a
            // GPU layer; on a low-memory phone that is a candidate for the
            // freeze where taps still click but nothing redraws. The default
            // lets the WebView manage its own surfaces.
            onLoadStart={() => setLoadState((current) => (current === 'ready' ? current : 'loading'))}
            /*
              Android kills a WebView's renderer under memory pressure — the
              device log showed exactly that ("Renderer process crash detected")
              after Studio had sat loading for minutes. Unhandled, the WebView
              stays on screen as a dead surface that takes every tap and does
              nothing. Hand the user Retry / Close instead.
            */
            onRenderProcessGone={() => {
              sessionEstablishedRef.current = false;
              lastInjectedRouteRef.current = null;
              setErrorMessage('Studio stopped responding. Retry to reload it.');
              trackStudioWebViewEvent('load-failed', { routeKey: resolvedRouteKey, reason: 'render-process-gone' });
              setLoadState('error');
            }}
            onContentProcessDidTerminate={() => {
              sessionEstablishedRef.current = false;
              lastInjectedRouteRef.current = null;
              setErrorMessage('Studio stopped responding. Retry to reload it.');
              trackStudioWebViewEvent('load-failed', { routeKey: resolvedRouteKey, reason: 'content-process-terminated' });
              setLoadState('error');
            }}
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
            {/* Always a way out. The overlay covers the screen and, in the
                setup flow, the dock is hidden — a slow or stuck load used to
                leave nothing to press. */}
            <Pressable
              onPress={closeStudio}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close Studio"
              style={({ pressed }) => [
                styles.loadingClose,
                { top: insets.top + tokens.spacing.sm },
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="bodyBold" tone="secondary">✕</AppText>
            </Pressable>
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
        onOpenHelp={openHelp}
        onSignOut={handleStudioSignOut}
      />
    
      <AppBottomSheet
        visible={bioModalVisible}
        title={bioModalData?.title || 'Brand Details'}
        subtitle={bioModalData?.handle ? `@${bioModalData.handle}` : undefined}
        showCloseButton={true}
        onClose={() => setBioModalVisible(false)}
      >
        <View style={{ gap: tokens.spacing.md, paddingVertical: tokens.spacing.sm }}>
          {bioModalData?.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
              <AppText variant="caption">📍</AppText>
              <AppText variant="caption" tone="muted">
                {bioModalData.location}
              </AppText>
            </View>
          ) : null}

          {Array.isArray(bioModalData?.tags) && bioModalData.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs }}>
              {bioModalData.tags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    paddingHorizontal: tokens.spacing.sm,
                    paddingVertical: tokens.spacing.xs,
                    borderRadius: tokens.radius.full,
                    backgroundColor: theme.colors.surfaceAlt,
                  }}
                >
                  <AppText variant="caption" tone="primary">
                    #{tag}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: tokens.spacing.xs }}>
            <AppText variant="captionBold" tone="muted">
              ABOUT
            </AppText>
            <AppText variant="body" tone="primary">
              {bioModalData?.description || 'No description provided.'}
            </AppText>
          </View>

          <Button
            title="Done"
            variant="brand"
            onPress={() => setBioModalVisible(false)}
            style={{ marginTop: tokens.spacing.sm }}
          />
        </View>
      </AppBottomSheet>

      <AppQrSheet
        visible={storeQrVisible}
        onClose={() => setStoreQrVisible(false)}
        title={`${brandTitle} Storefront QR`}
        subtitle="Share your store with customers anywhere"
        qrValue={`${env.webAppUrl}/brand/${user?.username || ''}`}
        displayUrl={`${env.webAppUrl}/brand/${user?.username || ''}`}
        username={user?.username}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  headerUpgrade: {
    alignSelf: 'center',
    minWidth: 0,
    borderWidth: 0,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.spacing.sm,
  },
  dashboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minWidth: 0,
    flexShrink: 1,
  },
  dashboardTitleText: {
    flexShrink: 1,
    minWidth: 0,
  },
  livePill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
  },
  liveDot: {
    width: tokens.spacing.sm,
    height: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
  },
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
  loadingClose: {
    position: 'absolute',
    left: tokens.spacing.lg,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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

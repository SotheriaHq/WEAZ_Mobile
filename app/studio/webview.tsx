import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/ui/AppText';
import { AppBackButton } from '@/components/ui/AppBackButton';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { StableImage } from '@/components/ui/StableImage';
import StudioApi from '@/src/api/StudioApi';
import { env } from '@/src/config/env';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { getActiveBrandId, hasActiveBrandMembership, isBrandOwner } from '@/src/auth/brandAccess';
import { classifyStudioWebUrl } from '@/src/features/studio/studioNavigationBridge';
import {
  buildStudioPath,
  buildStudioWebUrl,
  getStudioOriginWhitelist,
  getTrustedStudioOrigins,
  STUDIO_ROUTES,
  type StudioRouteKey,
} from '@/src/features/studio/studioRoutes';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
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

const isStudioRouteKey = (value: string | undefined): value is StudioRouteKey =>
  Boolean(value && value in STUDIO_ROUTES);

const READY_TIMEOUT_MS = 20_000;

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
    const parsed = new URL(path, 'https://threadly.local');
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

function getDisplayName(user: AuthUser | null) {
  if (!user) return 'Profile';

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return (
    (user.type === 'BRAND' ? user.brandFullName?.trim() : fullName) ||
    (user.type === 'BRAND' ? fullName : user.brandFullName?.trim()) ||
    user.username?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'Profile'
  );
}

function StudioHeaderActions({
  user,
  onSearchPress,
  onProfilePress,
}: {
  user: AuthUser | null;
  onSearchPress: () => void;
  onProfilePress: () => void;
}) {
  const { theme } = useTheme();
  const displayName = getDisplayName(user);
  const avatar = resolveProfileImageSource(user);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: Boolean(user) });
  const initials = getAvatarFallback(displayName, user?.username);

  return (
    <View style={styles.headerActions}>
      <IconButton size={44} onPress={onSearchPress} variant="ghost" testID="studio-header-search">
        <AppText variant="subtitle" accessibilityLabel="Open search">
          🔎
        </AppText>
      </IconButton>
      <Pressable
        onPress={onProfilePress}
        accessibilityRole="button"
        accessibilityLabel="Open profile menu"
        style={({ pressed }) => [
          styles.headerAvatarButton,
          { backgroundColor: theme.colors.primarySoft },
          pressed ? styles.pressed : null,
        ]}
        testID="studio-header-profile"
      >
        <StableImage
          uri={avatarUri ?? undefined}
          containerStyle={styles.headerAvatarFill}
          imageStyle={styles.headerAvatarFill}
          fallback={
            <View style={[StyleSheet.absoluteFill, styles.avatarInitialsBg, { backgroundColor: theme.colors.primarySoft }]}>
              <AppText variant="captionBold" tone="primary">{initials}</AppText>
            </View>
          }
        />
      </Pressable>
    </View>
  );
}

type StudioMenuItem = {
  key: string;
  emoji: string;
  label: string;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

function StudioProfileMenu({
  visible,
  user,
  topOffset,
  onClose,
  onOpenProfile,
  onOpenNotifications,
  onOpenOrders,
  onOpenStaff,
  onOpenHelp,
  onSignOut,
}: {
  visible: boolean;
  user: AuthUser | null;
  topOffset: number;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenOrders: () => void;
  onOpenStaff: () => void;
  onOpenHelp: () => void;
  onSignOut: () => void;
}) {
  const { scheme, theme } = useTheme();
  useAndroidOverlaySystemBars(visible, scheme, 'studio-profile-menu');
  const { height, width } = useWindowDimensions();
  const displayName = getDisplayName(user);
  const handle = user?.username ? `@${user.username}` : null;
  const avatar = resolveProfileImageSource(user);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId, enabled: visible && Boolean(user) });
  const initials = getAvatarFallback(displayName, user?.username);
  const availableMenuWidth = Math.max(180, width - tokens.spacing.lg * 2);
  const menuWidth = Math.min(Math.max(180, Math.round(width * 0.46)), Math.min(196, availableMenuWidth));
  const maxHeight = Math.max(260, height - topOffset - tokens.spacing.lg);
  const activeBrandId = getActiveBrandId(user);
  const owner = isBrandOwner(user, activeBrandId);

  const items: StudioMenuItem[] = [
    {
      key: 'profile',
      emoji: '👤',
      label: 'Profile',
      onPress: onOpenProfile,
    },
    {
      key: 'notifications',
      emoji: '🔔',
      label: 'Notifications',
      onPress: onOpenNotifications,
    },
    {
      key: 'orders',
      emoji: '📦',
      label: 'My Orders',
      onPress: onOpenOrders,
    },
    ...(owner
      ? [
          {
            key: 'staff',
            emoji: '👥',
            label: 'Staff',
            onPress: onOpenStaff,
          },
        ]
      : []),
    {
      key: 'help',
      emoji: '🆘',
      label: 'Help',
      onPress: onOpenHelp,
    },
    {
      key: 'sign-out',
      emoji: '↩️',
      label: 'Sign out',
      tone: 'danger' as const,
      onPress: onSignOut,
    },
  ];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.menuBackdrop} />
        </Pressable>
        <View style={[styles.menuWrap, { top: topOffset, width: menuWidth }]} pointerEvents="box-none">
          <View style={[styles.menuPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={[styles.menuIdentity, { borderBottomColor: theme.colors.border }]}>
              <View style={[styles.menuAvatar, { backgroundColor: theme.colors.primarySoft }]}>
                <StableImage
                  uri={avatarUri ?? undefined}
                  containerStyle={styles.menuAvatarFill}
                  imageStyle={styles.menuAvatarFill}
                  fallback={
                    <View style={[StyleSheet.absoluteFill, styles.avatarInitialsBg]}>
                      <AppText variant="subtitle" tone="primary">{initials}</AppText>
                    </View>
                  }
                />
              </View>
              <View style={styles.menuIdentityText}>
                <AppText variant="bodyBold" numberOfLines={2} ellipsizeMode="tail">
                  {displayName}
                </AppText>
                {handle ? (
                  <AppText variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="tail">
                    {handle}
                  </AppText>
                ) : null}
              </View>
            </View>
            <ScrollView
              style={{ maxHeight }}
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.menuContent}
            >
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    item.onPress();
                    onClose();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.menuItem,
                    { borderBottomColor: theme.colors.border },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText variant="subtitle">{item.emoji}</AppText>
                  <View style={styles.menuItemText}>
                    <AppText
                      variant="bodyBold"
                      tone={item.tone === 'danger' ? 'danger' : 'default'}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.label}
                    </AppText>
                  </View>
                  {item.key !== 'sign-out' ? (
                    <AppText variant="subtitle" tone="muted">
                      ›
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
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

  const closeStudio = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  const retry = useCallback(() => {
    setWebUrl(null);
    setLoadState('booting');
    setRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (status === 'loading') return;
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

      try {
        const intendedPath = buildStudioPath(resolvedRouteKey, { productId, orderId });
        const handoff = await StudioApi.createHandoff(intendedPath);
        if (!mounted) return;
        setWebUrl(
          buildStudioWebUrl({
            routeKey: resolvedRouteKey,
            params: { productId, orderId },
            handoffCode: handoff.code,
            theme: scheme,
          }),
        );
        trackStudioWebViewEvent('route-open', { routeKey: resolvedRouteKey });
        setLoadState('loading');
      } catch (error) {
        if (!mounted) return;
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
  }, [hasBrandWorkspace, invalidRouteKey, isStudioEligible, orderId, productId, resolvedRouteKey, retryKey, scheme, status]);

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

  const openNavigationTarget = useCallback(
    (target: string, source: 'navigation' | 'message') => {
      const aliasTarget = getTrustedAliasPath(target);
      if (aliasTarget) {
        perfMark('studio-webview-tap');
        router.push({
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
        router.push(classification.nativeRoute as any);
        return false;
      }

      if (classification.type === 'external') {
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
      toast.info('Open this from the Threadly app');
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
          break;
        case 'AUTH_REQUIRED':
        case 'HANDOFF_FAILED':
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
            openNavigationTarget(message.path, 'message');
          }
          break;
        case 'CLOSE':
          closeStudio();
          break;
        case 'ACTION_COMPLETE':
        default:
          break;
      }
    },
    [closeStudio, openNavigationTarget, toast],
  );

  const openSearch = useCallback(() => {
    if (loadState === 'ready' && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.dispatchEvent(new CustomEvent('threadly:native-search-open'));
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

  const handleMenuProfile = useCallback(() => {
    setProfileMenuVisible(false);
    router.replace((hasBrandWorkspace ? '/catalog' : '/(tabs)/me') as any);
  }, [hasBrandWorkspace]);

  const handleMenuNotifications = useCallback(() => {
    setProfileMenuVisible(false);
    router.replace('/notifications' as any);
  }, []);

  const handleMenuOrders = useCallback(() => {
    setProfileMenuVisible(false);
    router.replace('/orders' as any);
  }, []);

  const handleMenuStaff = useCallback(() => {
    setProfileMenuVisible(false);
    router.push('/studio/staff' as any);
  }, []);

  const handleStudioSignOut = useCallback(() => {
    setProfileMenuVisible(false);
    void signOut().finally(() => {
      router.replace('/(auth)/login' as any);
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
          loadState === 'ready' ? (
            <StudioHeaderActions
              user={user}
              onSearchPress={openSearch}
              onProfilePress={() => setProfileMenuVisible(true)}
            />
          ) : undefined
        }
      />

      <View style={[styles.webHost, { backgroundColor: studioShellBackground }]}>
        {webUrl ? (
          <WebView
            ref={webViewRef}
            key={`${webUrl}:${retryKey}`}
            source={{ uri: webUrl }}
            originWhitelist={originWhitelist}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onMessage={handleMessage}
            injectedJavaScript={`
              (function() {
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
              })();
            `}
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
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={[styles.webView, { backgroundColor: studioShellBackground }]}
          />
        ) : null}

        {loadState === 'booting' || loadState === 'loading' ? (
          <View style={[styles.loadingOverlay, { backgroundColor: studioShellBackground }]}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <AppText variant="h3">Studio</AppText>
              <AppText variant="body" tone="muted" style={styles.centerText}>
                Preparing secure brand session
              </AppText>
            </View>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  headerAvatarButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarFill: {
    width: '100%',
    height: '100%',
  },
  avatarInitialsBg: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xl,
  },
  loadingContent: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  menuWrap: {
    position: 'absolute',
    right: tokens.spacing.lg,
    alignItems: 'stretch',
  },
  menuPanel: {
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: tokens.colors.dark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  menuIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
  },
  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  menuAvatarFill: {
    width: '100%',
    height: '100%',
  },
  menuIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  menuContent: {
    paddingVertical: tokens.spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemText: {
    flex: 1,
    minWidth: 0,
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

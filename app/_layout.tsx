import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import 'react-native-reanimated';

import { ThemeProvider, useTheme, type ThemeMode } from '@/src/theme/ThemeProvider';
import { ThemeBackendSync } from '@/src/theme/ThemeBackendSync';
import { normalizeThemePreference } from '@/src/types/theme';
import { AuthProvider } from '@/src/auth/AuthContext';
import { setNetworkTraceScreen } from '@/src/api/networkTrace';
import { setFontFallbackMode } from '@/src/styles/FontMode';

import { ToastProvider } from '@/src/toast/ToastContext';
import { useToast } from '@/src/toast/ToastContext';
import { useAuth } from '@/src/auth/AuthContext';
import { BagCountProvider } from '@/src/features/bagging/BagCountContext';
import { BagFlowProvider } from '@/src/features/bagging/BagFlowProvider';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

import { handleInitialNotification, setupNotificationListeners } from '@/src/utils/notificationRouting';
import { useNotificationRouting } from '@/src/utils/notificationRouting';
import { useAuthenticatedPushTokenRegistration } from '@/src/notifications/pushTokenRegistration';
import {
  isMessageThreadActive,
  shouldShowMessageForegroundAlert,
  useMessagingRealtimeChannel,
} from '@/src/realtime/messaging';
import type { MessageCreatedRealtimeEvent } from '@/src/types/messaging';
import {
  applyAndroidSystemBarsPolicy,
  getInitialAndroidSystemScheme,
  useAndroidSystemBars,
} from '@/src/system/AndroidSystemBars';
import { ScreenChromeProvider } from '@/src/system/ScreenChrome';
import { QueryProvider } from '@/src/query/QueryProvider';
import { isThreadlyDebugEnabled } from '@/src/features/feed/utils/feedDiagnostics';


export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

const THEME_MODE_KEY = 'threadly.theme.mode';
// Must stay in lock-step with the native splash (expo-splash-screen plugin in
// app.json): same asset, same backgroundColor, same logo size. This makes the JS
// fallback a pixel-identical continuation of the native splash, so the native→JS
// handoff is a single continuous surface with no tiny→large logo jump and no
// blank flash between the native splash and the first app shell.
const BOOT_BACKGROUND = '#FFFFFF';
const SPLASH_LOGO_SIZE = 116; // matches app.json splash plugin `imageWidth: 116`

function StartupFallback() {
  return (
    <View style={[styles.appRoot, { backgroundColor: BOOT_BACKGROUND, alignItems: 'center', justifyContent: 'center' }]}>
      <Image
        source={require('../assets/images/weaz-splash-icon.png')}
        style={{ width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE }}
        contentFit="contain"
      />
    </View>
  );
}

void applyAndroidSystemBarsPolicy(getInitialAndroidSystemScheme(), 'module-load');

let rootLayoutMountCount = 0;
let rootBootstrapMountCount = 0;
let splashHideCallCount = 0;
let splashHidden = false;
// Captured at module load (before React boots) so splash-visible time spans the
// whole native-splash → first-shell window, not just the React lifetime.
const bootStartedAt = Date.now();

function devBootLog(event: string, details?: Record<string, unknown>) {
  if (!isThreadlyDebugEnabled('boot')) return;
  console.log('[boot]', details ? { event, ...details } : { event });
}

function hideNativeSplashOnce(reason: string) {
  if (splashHidden) return;
  splashHidden = true;
  splashHideCallCount += 1;
  devBootLog('hide-native-splash', {
    reason,
    splashHideCallCount,
    splashVisibleMs: Date.now() - bootStartedAt,
  });
  void SplashScreen.hideAsync().catch((error) => {
    if (__DEV__) {
      console.warn('[boot] hide-native-splash failed', error);
    }
  });
}

function NotificationSetup() {
  const { handleNotification, handleDeepLink } = useNotificationRouting();

  useEffect(() => {
    let isMounted = true;
    let cleanupNotificationHandling: (() => void) | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (isMounted) {
          callback();
        }
      }, delay);
      timers.add(timer);
    };

    // Handle initial notification (cold start from notification tap)
    const initializeNotificationHandling = async () => {
      try {
        // Check if app was opened from a notification
        const { notification, error } = await handleInitialNotification();
        if (error) {
          console.warn('Error handling initial notification:', error);
        }
        if (notification) {
          // Small delay to ensure navigation is ready
          schedule(() => {
            handleNotification(notification);
          }, 100);
        }

        // Set up notification listeners - skip in Expo Go on Android
        const isExpoGoAndroid = Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android';
        const unsubscribe = isExpoGoAndroid ? () => {} : setupNotificationListeners(
          (notification) => {
            // Handle foreground notification
            if (isThreadlyDebugEnabled('boot')) {
              console.log('Notification received while foreground');
            }
          },
          (response) => {
            // Handle notification tap
            handleNotification(response.notification);
          },
        );

        // Set up deep link listener
        const handleUrl = ({ url }: { url: string }) => {
          handleDeepLink(url);
        };

        // Handle URL when app is already running
        const urlSubscription = Linking.addEventListener('url', handleUrl);

        // Check for initial URL (app opened from link while closed)
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          schedule(() => {
            handleDeepLink(initialUrl);
          }, 100);
        }

        const cleanup = () => {
          unsubscribe();
          urlSubscription.remove();
        };

        if (isMounted) {
          cleanupNotificationHandling = cleanup;
        } else {
          cleanup();
        }
      } catch (error) {
        console.warn('Failed to initialize notification handling:', error);
      }
    };

    void initializeNotificationHandling();

    return () => {
      isMounted = false;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      cleanupNotificationHandling?.();
    };
  }, [handleNotification, handleDeepLink]);

  return null;
}

function PushTokenRegistrationGate() {
  const { status, token, user } = useAuth();

  useAuthenticatedPushTokenRegistration({
    authenticated: status === 'authenticated',
    userId: user?.id ?? null,
    authToken: token,
  });

  return null;
}

function isMessagesInboxPath(pathname: string) {
  return pathname === '/inbox' || pathname === '/(tabs)/inbox';
}

function getPathThreadId(pathname: string) {
  const match = pathname.match(/^\/messages\/([^/?#]+)/);
  const routeThreadId = match?.[1] ? decodeURIComponent(match[1]) : null;
  return routeThreadId && routeThreadId !== 'resolve' ? routeThreadId : null;
}

function ForegroundMessagingSetup() {
  const { status, token, user } = useAuth();
  const toast = useToast();
  const pathname = usePathname();

  const handleMessageCreated = useCallback(
    (payload: MessageCreatedRealtimeEvent) => {
      const threadId = payload.threadId ?? payload.conversationId ?? null;
      const routeThreadId = getPathThreadId(pathname);
      const isViewingThread =
        Boolean(threadId && routeThreadId && threadId === routeThreadId) ||
        isMessageThreadActive(threadId);

      if (isViewingThread || isMessagesInboxPath(pathname)) {
        return;
      }

      if (!shouldShowMessageForegroundAlert(payload)) {
        return;
      }

      toast.info('New message received', 2800);
    },
    [pathname, toast],
  );

  useMessagingRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
    onMessageCreated: handleMessageCreated,
  });

  return null;
}

function NetworkTraceRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    setNetworkTraceScreen(pathname || null);
    return () => setNetworkTraceScreen(null);
  }, [pathname]);

  return null;
}

// Reads the current route in an isolated leaf so a navigation re-renders ONLY
// this null node, not RootBootstrap. RootBootstrap renders the entire app tree
// (RootStack + every screen) below it; when it subscribed to usePathname()
// directly, every tab switch re-rendered the whole tree — a major contributor to
// the ~700–1700ms route_call→path_changed window measured on device. Keeping the
// pathname subscription here confines that cost to a no-op component.
function AndroidSystemBarsRouteSync({
  scheme,
  bootReady,
}: {
  scheme: ReturnType<typeof useTheme>['scheme'];
  bootReady: boolean;
}) {
  const pathname = usePathname();
  useAndroidSystemBars(scheme, bootReady ? `route:${pathname}` : 'bootstrap');
  return null;
}

function RootBootstrap({
  fontsLoaded,
}: {
  fontsLoaded: boolean;
}) {
  const { ready: themeReady, scheme, theme } = useTheme();
  const { status } = useAuth();
  const bootReady = fontsLoaded && themeReady && status !== 'loading';
  const hasLoggedReadyRef = useRef(false);

  useEffect(() => {
    rootBootstrapMountCount += 1;
    devBootLog('root-bootstrap-mounted', { rootBootstrapMountCount });
  }, []);

  useEffect(() => {
    if (!bootReady || hasLoggedReadyRef.current) return;
    hasLoggedReadyRef.current = true;
    devBootLog('root-bootstrap-ready', {
      fontsLoaded,
      themeReady,
      authStatus: status,
    });
  }, [bootReady, fontsLoaded, status, themeReady]);

  if (!bootReady) {
    return (
      <>
        <AndroidSystemBarsRouteSync scheme={scheme} bootReady={false} />
        <StartupFallback />
      </>
    );
  }

  return (
    <View
      style={[styles.appRoot, { backgroundColor: theme.colors.bg }]}
      onLayout={() => {
        hideNativeSplashOnce('root-bootstrap-layout');
      }}
    >
      <AndroidSystemBarsRouteSync scheme={scheme} bootReady />
      <NotificationSetup />
      <NetworkTraceRouteSync />
      <PushTokenRegistrationGate />
      <ForegroundMessagingSetup />
      <RootStack />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...FontAwesome.font,
  });
  const [themeBootstrapReady, setThemeBootstrapReady] = useState(false);
  const [initialThemeMode, setInitialThemeMode] = useState<ThemeMode>('system');
  const [fontsTimeout, setFontsTimeout] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        setFontsTimeout(true);
      }
    }, 3000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    rootLayoutMountCount += 1;
    devBootLog('root-layout-mounted', { rootLayoutMountCount });
    void applyAndroidSystemBarsPolicy(getInitialAndroidSystemScheme(), 'root-layout-first-render');
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);



  useEffect(() => {
    let isMounted = true;
    let resolvedMode: ThemeMode = 'system';

    SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((value) => {
        if (!isMounted) return;
        resolvedMode = normalizeThemePreference(value);
        setInitialThemeMode(resolvedMode);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setThemeBootstrapReady(true);
          devBootLog('theme-bootstrap-complete', {
            mode: resolvedMode,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const fontsReady = loaded || fontsTimeout || !!error;
  
  useEffect(() => {
    if (fontsReady && !loaded) {
      setFontFallbackMode(true);
      if (__DEV__) {
        console.warn('[boot] Font loading failed or timed out. Locked to system font fallback.');
      }
    }
  }, [fontsReady, loaded]);

  if (!fontsReady || !themeBootstrapReady) {
    return <StartupFallback />;
  }

  return <RootLayoutNav fontsLoaded={loaded} initialThemeMode={initialThemeMode} />;
}

function RootLayoutNav({
  fontsLoaded,
  initialThemeMode,
}: {
  fontsLoaded: boolean;
  initialThemeMode: ThemeMode;
}) {
  return (
    <ThemeProvider initialMode={initialThemeMode} bootstrapped>
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ThemeBackendSync />
            <BagCountProvider>
              <BagFlowProvider>
                <ScreenChromeProvider>
                  <RootBootstrap fontsLoaded={fontsLoaded} />
                </ScreenChromeProvider>
              </BagFlowProvider>
            </BagCountProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
      {/* Catalogue moved into the (tabs) group for persistent top-level lifetime;
          the /catalog URL is unchanged (route groups are omitted from the path). */}
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="reviews/index" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="messages/[threadId]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="market-viewer" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="collection-viewer" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="collection-gallery" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="products/[productId]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="studio" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
});

import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { ThemeProvider, useTheme, type ThemeMode } from '@/src/theme/ThemeProvider';
import { AuthProvider } from '@/src/auth/AuthContext';

import { ToastProvider } from '@/src/toast/ToastContext';
import { useAuth } from '@/src/auth/AuthContext';
import { BagFlowProvider } from '@/src/features/bagging/BagFlowProvider';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

import { configurePushNotifications, handleInitialNotification, setupNotificationListeners } from '@/src/utils/notificationRouting';
import { useNotificationRouting } from '@/src/utils/notificationRouting';


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
const BOOT_BACKGROUND = '#0b0710';

let rootLayoutMountCount = 0;
let rootBootstrapMountCount = 0;
let splashHideCallCount = 0;
let splashHidden = false;

function devBootLog(event: string, details?: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log('[boot]', details ? { event, ...details } : { event });
}

function hideNativeSplashOnce(reason: string) {
  if (splashHidden) return;
  splashHidden = true;
  splashHideCallCount += 1;
  devBootLog('hide-native-splash', {
    reason,
    splashHideCallCount,
  });
  void SplashScreen.hideAsync().catch((error) => {
    if (__DEV__) {
      console.warn('[boot] hide-native-splash failed', error);
    }
  });
}

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'auto' || value === 'system' || value === 'time' || value === 'light' || value === 'dark';
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

    // Configure push notifications on app start
    configurePushNotifications().then((result) => {
      if (result.error && !result.unsupported) {
        console.warn('Failed to configure push notifications:', result.error);
      }
    }).catch((error) => {
      console.warn('Failed to configure push notifications:', error);
    });

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
            if (__DEV__) {
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

function RootBootstrap({
  fontsLoaded,
}: {
  fontsLoaded: boolean;
}) {
  const { ready: themeReady, theme } = useTheme();
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
    return <View style={[styles.appRoot, { backgroundColor: BOOT_BACKGROUND }]} />;
  }

  return (
    <View
      style={[styles.appRoot, { backgroundColor: theme.colors.bg }]}
      onLayout={() => {
        hideNativeSplashOnce('root-bootstrap-layout');
      }}
    >
      <NotificationSetup />
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
  const [initialThemeMode, setInitialThemeMode] = useState<ThemeMode>('auto');

  useEffect(() => {
    rootLayoutMountCount += 1;
    devBootLog('root-layout-mounted', { rootLayoutMountCount });
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);



  useEffect(() => {
    let isMounted = true;
    let resolvedMode: ThemeMode = 'auto';

    SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((value) => {
        if (!isMounted) return;
        if (isThemeMode(value)) {
          resolvedMode = value;
          setInitialThemeMode(value);
        }
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

  if (!loaded || !themeBootstrapReady) {
    return <View style={[styles.appRoot, { backgroundColor: BOOT_BACKGROUND }]} />;
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
      <ToastProvider>
        <AuthProvider>
          <BagFlowProvider>
            <RootBootstrap fontsLoaded={fontsLoaded} />
          </BagFlowProvider>
        </AuthProvider>
      </ToastProvider>
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
      <Stack.Screen name="catalog" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="messages/[threadId]" options={{ headerShown: false, animation: 'slide_from_right' }} />
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

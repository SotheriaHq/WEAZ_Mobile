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
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { ThemeProvider, useTheme, type ThemeMode } from '@/src/theme/ThemeProvider';
import { AuthProvider } from '@/src/auth/AuthContext';

import { ToastProvider } from '@/src/toast/ToastContext';
import { useAuth } from '@/src/auth/AuthContext';
import { FallbackLoaderScreen } from '@/components/ui/AppLoader';


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

function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'auto' || value === 'system' || value === 'time' || value === 'light' || value === 'dark';
}

function BootSplash({
  ready,
}: {
  ready: boolean;
}) {
  const { scheme, theme } = useTheme();
  const hasHiddenSplash = useRef(false);

  const handleLayout = useCallback(() => {
    if (hasHiddenSplash.current) return;
    hasHiddenSplash.current = true;
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.bootRoot} onLayout={handleLayout}>
      <FallbackLoaderScreen
        title="Threadly"
        message={ready ? 'Opening Threadly' : 'Preparing your space'}
        tone={scheme}
        themeOverride={{ background: theme.colors.bg }}
      />
    </View>
  );
}

function RootBootstrap({
  fontsLoaded,
}: {
  fontsLoaded: boolean;
}) {
  const { ready: themeReady, theme } = useTheme();
  const { status } = useAuth();
  const bootReady = fontsLoaded && themeReady && status !== 'loading';

  if (!bootReady) {
    return <BootSplash ready={bootReady} />;
  }

  return (
    <View style={[styles.appRoot, { backgroundColor: theme.colors.bg }]} onLayout={() => void SplashScreen.hideAsync()}>
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

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    let isMounted = true;

    SecureStore.getItemAsync(THEME_MODE_KEY)
      .then((value) => {
        if (!isMounted) return;
        if (isThemeMode(value)) {
          setInitialThemeMode(value);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setThemeBootstrapReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!loaded || !themeBootstrapReady) {
    return null;
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
          <RootBootstrap fontsLoaded={fontsLoaded} />
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
      <Stack.Screen name="search" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="products" options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  bootRoot: {
    flex: 1,
  },
  appRoot: {
    flex: 1,
  },
});

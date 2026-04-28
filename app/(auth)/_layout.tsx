import React from 'react';
import { Stack } from 'expo-router';

import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Auth Layout — Theme-Aware
 *
 * Uses the active theme's bg color as the interstitial contentStyle so
 * there is never a flash of wrong background during the fade transition.
 * Both Login and Signup adapt to light/dark/time-based themes via ThemeProvider.
 *
 * Do NOT change animation back to 'slide_from_right' — that exposes the seam
 * between the two editorial gradient backgrounds.
 */
export default function AuthLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: 320,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}

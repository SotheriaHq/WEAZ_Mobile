import { Stack } from 'expo-router';

export default function StudioLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Island hops stay on `index` (the WebView). A slide animation here
        // made every Dashboard↔Store chip feel like a new screen even when
        // the document did not remount.
        animation: 'none',
        // Not frozen. Freezing suspends the WebView screen under Finance/Staff,
        // and a suspended tree is `display: none` — under Fabric that destroys
        // the native WebView, so coming back rebuilt and reloaded it (Finance →
        // Dashboard: T1->T3=3382ms, 2026-10-19). The native stack already
        // keeps that screen off screen; its re-renders are cheap.
        freezeOnBlur: false,
      }}
    >
      <Stack.Screen
        name="index"
        dangerouslySingular={() => 'studio-webview'}
        options={{ animation: 'none' }}
      />
      <Stack.Screen
        name="webview"
        dangerouslySingular={() => 'studio-webview'}
        options={{ animation: 'none' }}
      />
      {/* 150ms fade, not the 400ms slide — see RootStack in app/_layout.tsx. */}
      <Stack.Screen name="finance" options={{ animation: 'fade' }} />
      <Stack.Screen name="staff" options={{ animation: 'fade' }} />
      <Stack.Screen name="resolve-alias" options={{ animation: 'fade' }} />
    </Stack>
  );
}

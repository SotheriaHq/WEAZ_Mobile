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
        freezeOnBlur: true,
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
      <Stack.Screen name="finance" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="staff" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="resolve-alias" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

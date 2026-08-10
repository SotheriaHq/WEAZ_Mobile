import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Painted from theme tokens, not a hardcoded dark slab. A stray deep link used
 * to drop users here mid-sign-in and the screen came back black while the rest
 * of the app was in the light theme, which read as a crash rather than a
 * wrong-turn. Typography comes from `variant`/`tone` — `AppText` rejects raw
 * `fontSize`/`color` overrides.
 */
export default function NotFoundScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <AppText variant="subtitle">This screen doesn&apos;t exist.</AppText>

        <Link href="/" style={styles.link}>
          <AppText variant="body" tone="secondary">
            Go to home screen
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});

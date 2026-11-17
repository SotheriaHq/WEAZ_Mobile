import { useEffect, useRef } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Sentry } from '@/src/observability/sentry';
import { telemetryPath } from '@/src/privacy/telemetryUrl';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * Never a dead end.
 *
 * This used to be a "This screen doesn't exist" page with a "Go to home
 * screen" link, and people met it with no idea why: after coming back to the
 * app (Android had killed it and route restoration replayed a saved path),
 * right after installing an update (a path saved by the previous build), and
 * from the odd link. None of those is something the person did wrong, and
 * none of them is fixed by reading an error. So a path the app cannot place
 * goes back to where the person came from, or to the Runway when there is
 * nowhere to go back to, in the same frame.
 *
 * The path is still reported (route only, ids and tokens scrubbed) so the
 * door it came through can be closed at the source.
 */
export default function NotFoundScreen() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    const route = telemetryPath(pathname || '/');
    if (reportedRef.current !== route) {
      reportedRef.current = route;
      console.warn(`[WIEZ-NAV] unmatched route ${route}; recovering`);
      Sentry.addBreadcrumb({ category: 'navigation', level: 'warning', message: `unmatched route ${route}` });
      Sentry.captureMessage(`Unmatched route ${route}`, 'warning');
    }
    // After mount, so the navigator has committed this screen before it is
    // replaced; a navigation dispatched during the commit can be dropped.
    const frame = requestAnimationFrame(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'none' }} />
      <View
        style={[styles.container, { backgroundColor: theme.colors.bg }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

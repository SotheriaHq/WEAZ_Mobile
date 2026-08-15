import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type ThemeContextValue } from '@/src/theme/ThemeProvider';
import { PRODUCT_NAME } from '@/src/config/productIdentity';
import { tokens } from '@/src/styles/tokens';

import { WiezLogoLoader } from './WiezLogoLoader';

type LoaderTone = 'light' | 'dark';

/**
 * `title` / `message` are gone: nothing renders them since the loader stopped
 * narrating. What remains is a backdrop and two ambient orbs, all from tokens —
 * the dark branch used to hardcode its backdrop and four alpha values while the
 * light branch right beside it read from the theme.
 */
type LoaderVisualTheme = {
  background: string;
  orbPrimary: string;
  orbSecondary: string;
};

type LoaderContentProps = {
  title?: string;
  message?: string;
  size?: number;
  visualTheme: LoaderVisualTheme;
};

type AppLoaderScreenProps = {
  title?: string;
  message?: string;
  size?: number;
  themeOverride?: Partial<LoaderVisualTheme>;
  includeSafeArea?: boolean;
};

type LoaderBlockProps = {
  title?: string;
  message?: string;
  size?: number;
  minHeight?: number;
  themeOverride?: Partial<LoaderVisualTheme>;
  style?: StyleProp<ViewStyle>;
};

function buildVisualTheme(
  scheme: ThemeContextValue['scheme'],
  theme: ThemeContextValue['theme'],
  override?: Partial<LoaderVisualTheme>,
): LoaderVisualTheme {
  const base =
    scheme === 'dark'
      ? {
          background: tokens.colors.loaderBackdropDark,
          orbPrimary: tokens.colors.loaderOrbPrimaryDark,
          orbSecondary: tokens.colors.loaderOrbSecondaryDark,
        }
      : {
          background: theme.colors.bg,
          orbPrimary: tokens.colors.loaderOrbPrimaryLight,
          orbSecondary: tokens.colors.loaderOrbSecondaryLight,
        };

  return {
    ...base,
    ...override,
  };
}

function buildFallbackTheme(tone: LoaderTone = 'dark', override?: Partial<LoaderVisualTheme>): LoaderVisualTheme {
  const theme = tone === 'dark' ? tokens.themes.dark : tokens.themes.light;
  return buildVisualTheme(tone, theme, override);
}

function LoaderBackdrop({ visualTheme }: { visualTheme: LoaderVisualTheme }) {
  return (
    <>
      <View style={[styles.orb, styles.orbPrimary, { backgroundColor: visualTheme.orbPrimary }]} />
      <View style={[styles.orb, styles.orbSecondary, { backgroundColor: visualTheme.orbSecondary }]} />
    </>
  );
}

/**
 * The mark IS the loading state — no wordmark, no caption.
 *
 * This used to paint the logo, then "WIEZ" under it, then a sentence under
 * that. Stacked behind the Studio shell's own narrated wait it read as three
 * consecutive loading screens for one navigation. `title` / `message` are still
 * accepted (call sites pass them) and deliberately not rendered; a wait needs a
 * heartbeat, not a script. Anything the user must ACT on is an error state, not
 * a loader.
 */
function LoaderContent({ size = 88 }: LoaderContentProps) {
  return (
    <View style={styles.content} accessibilityLabel={`Loading ${PRODUCT_NAME}`}>
      <WiezLogoLoader size={size} />
    </View>
  );
}

export function AppLoaderScreen({
  title,
  message,
  size,
  themeOverride,
  includeSafeArea = true,
}: AppLoaderScreenProps) {
  const { scheme, theme } = useTheme();
  const visualTheme = buildVisualTheme(scheme, theme, themeOverride);

  const body = (
    <View style={[styles.screen, { backgroundColor: visualTheme.background }]}>
      <LoaderBackdrop visualTheme={visualTheme} />
      <LoaderContent title={title} message={message} size={size} visualTheme={visualTheme} />
    </View>
  );

  if (!includeSafeArea) {
    return body;
  }

  return <SafeAreaView style={[styles.screen, { backgroundColor: visualTheme.background }]}>{body}</SafeAreaView>;
}

export function LoaderBlock({
  title,
  message,
  size = 72,
  minHeight = 220,
  themeOverride,
  style,
}: LoaderBlockProps) {
  const { scheme, theme } = useTheme();
  const visualTheme = buildVisualTheme(scheme, theme, themeOverride);

  return (
    <View style={[styles.block, { minHeight, backgroundColor: visualTheme.background }, style]}>
      <LoaderBackdrop visualTheme={visualTheme} />
      <LoaderContent title={title} message={message} size={size} visualTheme={visualTheme} />
    </View>
  );
}

export function FallbackLoaderScreen({
  title,
  message,
  size,
  tone = 'dark',
  themeOverride,
}: {
  title?: string;
  message?: string;
  size?: number;
  tone?: LoaderTone;
  themeOverride?: Partial<LoaderVisualTheme>;
}) {
  const visualTheme = buildFallbackTheme(tone, themeOverride);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: visualTheme.background }]}>
      <LoaderBackdrop visualTheme={visualTheme} />
      <LoaderContent title={title} message={message} size={size} visualTheme={visualTheme} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  block: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbPrimary: {
    width: 240,
    height: 240,
    top: -78,
    left: -62,
  },
  orbSecondary: {
    width: 220,
    height: 220,
    right: -56,
    bottom: -82,
  },
});

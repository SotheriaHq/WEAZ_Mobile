import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type ThemeContextValue } from '@/src/theme/ThemeProvider';
import { tokens } from '@/src/styles/tokens';

import { ThreadlyLogoLoader } from './ThreadlyLogoLoader';
import { AppText } from '@/components/ui/AppText';

type LoaderTone = 'light' | 'dark';

type LoaderVisualTheme = {
  background: string;
  orbPrimary: string;
  orbSecondary: string;
  title: string;
  message: string;
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
          background: '#0b0710',
          orbPrimary: 'rgba(147, 51, 234, 0.18)',
          orbSecondary: 'rgba(212, 175, 55, 0.14)',
          title: '#ffffff',
          message: 'rgba(255,255,255,0.72)',
        }
      : {
          background: theme.colors.bg,
          orbPrimary: 'rgba(147, 51, 234, 0.12)',
          orbSecondary: 'rgba(212, 175, 55, 0.12)',
          title: theme.colors.text,
          message: theme.colors.textMuted,
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

function LoaderContent({ title = 'Threadly', message = 'Loading your feed', size = 88, visualTheme }: LoaderContentProps) {
  return (
    <View style={styles.content}>
      <ThreadlyLogoLoader
        size={size}
        showWordmark={false}
      />
      <AppText
        variant="display"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.84}
        style={styles.wordmark}
      >
        {title}
      </AppText>
      <AppText variant="smallBold" tone="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={styles.message}>
        {message}
      </AppText>
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
  wordmark: {
    marginTop: 24,
    letterSpacing: 0.2,
  },
  message: {
    marginTop: 6,
    letterSpacing: 0.15,
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

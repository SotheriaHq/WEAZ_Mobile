import React from 'react';
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { isFontFallbackMode } from '@/src/styles/FontMode';

type Variant =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'captionRegular'
  | 'captionBold'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bodyBold'
  | 'bodyRegular'
  | 'bodyStrong'
  | 'small'
  | 'smallBold'
  | 'screenTitle'
  | 'profileName'
  | 'brandName'
  | 'sectionTitle'
  | 'cardTitle'
  | 'bodyReadable'
  | 'actionLabel'
  | 'buttonLabel'
  | 'badgeLabel'
  | 'navLabel'
  | 'meta'
  | 'statValue'
  | 'statLabel';

type Tone = 'default' | 'secondary' | 'muted' | 'inverse' | 'primary' | 'danger' | 'success' | 'warning';
type TypographyTokenKey =
  | 'display'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bodyBold'
  | 'small'
  | 'smallBold'
  | 'screenTitle'
  | 'profileName'
  | 'brandName'
  | 'sectionTitle'
  | 'cardTitle'
  | 'bodyReadable'
  | 'actionLabel'
  | 'buttonLabel'
  | 'badgeLabel'
  | 'navLabel'
  | 'meta'
  | 'statValue'
  | 'statLabel';

type Props = Omit<TextProps, 'style'> & {
  variant?: Variant;
  tone?: Tone;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
};

const FORBIDDEN_STYLE_KEYS: Array<keyof TextStyle> = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'fontFamily',
];

const warnedOverrides = new Set<string>();
const warnedMissingVariant = new Set<string>();

const VARIANT_MAP: Record<Variant, TypographyTokenKey> = {
  display: 'display',
  title: 'title',
  subtitle: 'subtitle',
  body: 'body',
  caption: 'caption',
  captionRegular: 'caption',
  captionBold: 'caption',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  bodyBold: 'bodyBold',
  bodyRegular: 'body',
  bodyStrong: 'body',
  small: 'small',
  smallBold: 'smallBold',
  screenTitle: 'screenTitle',
  profileName: 'profileName',
  brandName: 'brandName',
  sectionTitle: 'sectionTitle',
  cardTitle: 'cardTitle',
  bodyReadable: 'bodyReadable',
  actionLabel: 'actionLabel',
  buttonLabel: 'buttonLabel',
  badgeLabel: 'badgeLabel',
  navLabel: 'navLabel',
  meta: 'meta',
  statValue: 'statValue',
  statLabel: 'statLabel',
};

const FONT_FAMILY_MAP: Record<TypographyTokenKey, string> = {
  display: tokens.fontFamily.bold,
  title: tokens.fontFamily.bold,
  subtitle: tokens.fontFamily.semiBold,
  body: tokens.fontFamily.medium,
  caption: tokens.fontFamily.medium,
  h1: tokens.fontFamily.bold,
  h2: tokens.fontFamily.semiBold,
  h3: tokens.fontFamily.semiBold,
  bodyBold: tokens.fontFamily.semiBold,
  small: tokens.fontFamily.medium,
  smallBold: tokens.fontFamily.semiBold,
  screenTitle: tokens.fontFamily.bold,
  profileName: tokens.fontFamily.bold,
  brandName: tokens.fontFamily.bold,
  sectionTitle: tokens.fontFamily.semiBold,
  cardTitle: tokens.fontFamily.semiBold,
  bodyReadable: tokens.fontFamily.regular,
  actionLabel: tokens.fontFamily.semiBold,
  buttonLabel: tokens.fontFamily.semiBold,
  badgeLabel: tokens.fontFamily.bold,
  navLabel: tokens.fontFamily.semiBold,
  meta: tokens.fontFamily.medium,
  statValue: tokens.fontFamily.bold,
  statLabel: tokens.fontFamily.bold,
};

function getToneColor(tone: Tone, theme: ReturnType<typeof useTheme>['theme']) {
  switch (tone) {
    case 'secondary':
      return theme.colors.textSecondary;
    case 'muted':
      return theme.colors.textMuted;
    case 'inverse':
      return theme.colors.textInverse;
    case 'primary':
      return theme.colors.primary;
    case 'danger':
      return theme.colors.danger;
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.warning;
    case 'default':
    default:
      return theme.colors.text;
  }
}

function sanitizeStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flattened = StyleSheet.flatten(style);
  if (!flattened) return undefined;

  const textStyle = flattened as TextStyle;
  const safeStyle: TextStyle = {};

  for (const [key, value] of Object.entries(textStyle)) {
    if (FORBIDDEN_STYLE_KEYS.includes(key as keyof TextStyle)) {
      if (__DEV__) {
        const cacheKey = `${key}:${String(value)}`;
        if (!warnedOverrides.has(cacheKey)) {
          warnedOverrides.add(cacheKey);
          console.warn(
            `[AppText] Ignored forbidden style override "${key}". Typography and color must come from variant/tone only.`,
          );
        }
      }
      continue;
    }

    (safeStyle as Record<string, unknown>)[key] = value;
  }

  return safeStyle;
}

export function AppText({
  variant: providedVariant,
  tone = 'default',
  muted = false,
  style,
  children,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const variant = providedVariant ?? 'body';

  if (__DEV__ && !providedVariant) {
    const cacheKey = rest.testID ?? 'default';
    if (!warnedMissingVariant.has(cacheKey)) {
      warnedMissingVariant.add(cacheKey);
      console.warn('[AppText] Missing explicit variant; defaulting to body. Use explicit variants for structural text.');
    }
  }

  const tokenKey = VARIANT_MAP[variant];
  const tier = tokens.typography[tokenKey];
  const resolvedTone = muted && tone === 'default' ? 'muted' : tone;
  const fontFamily = isFontFallbackMode
    ? undefined
    : variant === 'captionRegular'
      ? tokens.fontFamily.regular
      : variant === 'captionBold'
        ? tokens.fontFamily.bold
        : variant === 'bodyRegular'
          ? tokens.fontFamily.regular
          : variant === 'bodyStrong'
            ? tokens.fontFamily.bold
            : FONT_FAMILY_MAP[tokenKey];

  let defaultMaxFontSizeMultiplier: number | undefined = undefined;
  if (['navLabel', 'badgeLabel', 'actionLabel', 'meta', 'caption', 'small', 'smallBold'].includes(variant)) {
    defaultMaxFontSizeMultiplier = 1.2;
  } else if (['screenTitle', 'profileName', 'brandName', 'display', 'title', 'h1'].includes(variant)) {
    defaultMaxFontSizeMultiplier = 1.4;
  } else {
    // default for body, bodyReadable, etc.
    defaultMaxFontSizeMultiplier = 1.6;
  }

  const { maxFontSizeMultiplier = defaultMaxFontSizeMultiplier, ...restProps } = rest;

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...restProps}
      style={[
        {
          ...(fontFamily ? { fontFamily } : {}),
          fontSize: tier.size,
          lineHeight: tier.lineHeight,
          color: getToneColor(resolvedTone, theme),
        },
        sanitizeStyle(style),
      ]}
    >
      {children}
    </Text>
  );
}

export function DisplayText(props: Omit<Props, 'variant'>) {
  return <AppText variant="display" {...props} />;
}

export function TitleText(props: Omit<Props, 'variant'>) {
  return <AppText variant="title" {...props} />;
}

export function SubtitleText(props: Omit<Props, 'variant'>) {
  return <AppText variant="subtitle" {...props} />;
}

export function BodyText(props: Omit<Props, 'variant'>) {
  return <AppText variant="body" {...props} />;
}

export function CaptionText(props: Omit<Props, 'variant'>) {
  return <AppText variant="caption" {...props} />;
}

export default AppText;

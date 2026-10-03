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
import { getFontFallbackMode, subscribeToFontMode } from '@/src/styles/FontMode';

/**
 * Live fallback state, not a value captured at first render.
 *
 * Read directly from the module, the flag never re-rendered anything — so a
 * boot that timed out waiting for Inter stayed on the device's system font for
 * the rest of the session even after the faces finished loading. See
 * `src/styles/FontMode.ts`.
 */
function useFontFallbackMode(): boolean {
  return React.useSyncExternalStore(
    subscribeToFontMode,
    getFontFallbackMode,
    getFontFallbackMode,
  );
}

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
  | 'statLabel'
  | 'money'
  | 'moneyLarge'
  | 'moneySmall';

type Tone = 'default' | 'secondary' | 'muted' | 'inverse' | 'primary' | 'danger' | 'success' | 'warning' | 'disabled';
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
  | 'statLabel'
  | 'money'
  | 'moneyLarge'
  | 'moneySmall';

type Props = Omit<TextProps, 'style'> & {
  variant?: Variant;
  tone?: Tone;
  muted?: boolean;
  /**
   * Resolve `tone` against the DARK palette regardless of the active theme.
   *
   * For chrome that sits on a scheme-independent dark surface — the Runway
   * stage is deep black in both themes (see `RUNWAY_MATTE`) — so in light mode
   * `tone="default"` resolves to near-black text and disappears against it.
   * This is the sanctioned way to fix that: colour still comes from
   * variant/tone, never from a `style` override (which `sanitizeStyle` strips).
   */
  onDarkStage?: boolean;
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

/** Palette used by `onDarkStage` — the same tokens the Runway matte is built
 *  from, so stage chrome stays legible in light mode. */
const DARK_STAGE_THEME = { colors: tokens.themes.dark.colors } as ReturnType<
  typeof useTheme
>['theme'];

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
  money: 'money',
  moneyLarge: 'moneyLarge',
  moneySmall: 'moneySmall',
};

/**
 * Tiers whose glyphs are digits that line up in a column.
 *
 * `tabular-nums` fixes every digit to the same advance width. Inter's default
 * figures are proportional, so a 1 is narrower than a 0 and a stack of amounts
 * in a list never aligns — the reason a column of prices looks subtly untidy
 * however carefully the row is laid out.
 */
const TABULAR_TIERS: ReadonlySet<TypographyTokenKey> = new Set([
  'money',
  'moneyLarge',
  'moneySmall',
  'statValue',
]);

/**
 * Family per tier. Two deliberate changes from the original mapping:
 *
 * - Everything that is meant to read as a HEADING is `bold` (700), not
 *   `semiBold` (600). At 16-18px, 600 against a 500 body is roughly one visual
 *   step — enough to measure, not enough to see — which is why section headers
 *   were landing as "as light and thin as main text".
 * - Body stays `medium` (500). Making body heavier does not create hierarchy,
 *   it just removes the contrast the headings need.
 */
const FONT_FAMILY_MAP: Record<TypographyTokenKey, string> = {
  display: tokens.fontFamily.extraBold,
  title: tokens.fontFamily.extraBold,
  subtitle: tokens.fontFamily.bold,
  body: tokens.fontFamily.medium,
  caption: tokens.fontFamily.medium,
  h1: tokens.fontFamily.extraBold,
  h2: tokens.fontFamily.bold,
  h3: tokens.fontFamily.bold,
  bodyBold: tokens.fontFamily.bold,
  small: tokens.fontFamily.medium,
  smallBold: tokens.fontFamily.bold,
  screenTitle: tokens.fontFamily.extraBold,
  profileName: tokens.fontFamily.bold,
  brandName: tokens.fontFamily.bold,
  sectionTitle: tokens.fontFamily.bold,
  cardTitle: tokens.fontFamily.bold,
  bodyReadable: tokens.fontFamily.medium,
  actionLabel: tokens.fontFamily.bold,
  buttonLabel: tokens.fontFamily.bold,
  badgeLabel: tokens.fontFamily.bold,
  navLabel: tokens.fontFamily.bold,
  meta: tokens.fontFamily.semiBold,
  statValue: tokens.fontFamily.bold,
  statLabel: tokens.fontFamily.bold,
  money: tokens.fontFamily.extraBold,
  moneyLarge: tokens.fontFamily.extraBold,
  moneySmall: tokens.fontFamily.bold,
};

/**
 * Numeric weight per family, emitted ALONGSIDE `fontFamily`.
 *
 * The tier tokens have always carried a `weight`, and this component has never
 * applied it — every glyph's weight came from the family name alone. Two
 * consequences, both of which are the reported symptom:
 *
 *   1. When the Inter load times out (`isFontFallbackMode`, which the splash
 *      path can and does hit on a cold start), `fontFamily` is dropped and
 *      nothing replaces it — so the ENTIRE app renders in the system regular
 *      face. Titles, headers and body become literally the same weight. That is
 *      "some headers are as light and basic and thin as main text".
 *   2. On iOS, family-only weighting leaves the text renderer no numeric hint,
 *      so synthetic weighting never kicks in for a face that fails to resolve.
 *
 * Emitting both is what every mature RN design system does: the family wins
 * when the font is present, the weight carries the hierarchy when it is not.
 */
const FONT_WEIGHT_BY_FAMILY: Record<string, TextStyle['fontWeight']> = {
  [tokens.fontFamily.regular]: '400',
  [tokens.fontFamily.medium]: '500',
  [tokens.fontFamily.semiBold]: '600',
  [tokens.fontFamily.bold]: '700',
  [tokens.fontFamily.extraBold]: '800',
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
    // Label of a control that cannot be pressed. Sits below `muted`, which is
    // reading ink for captions and would make a dead button look live.
    case 'disabled':
      return theme.colors.textDisabled;
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
  onDarkStage = false,
  style,
  children,
  ...rest
}: Props) {
  const { theme: activeTheme } = useTheme();
  const theme = onDarkStage ? DARK_STAGE_THEME : activeTheme;
  const fontFallbackMode = useFontFallbackMode();
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
  // Resolve the family the variant WANTS first, independently of whether the
  // font is available — the weight is derived from it either way, so fallback
  // mode keeps the hierarchy instead of flattening to a single face.
  const intendedFamily =
    variant === 'captionRegular'
      ? tokens.fontFamily.regular
      : variant === 'captionBold'
        ? tokens.fontFamily.bold
        : variant === 'bodyRegular'
          ? tokens.fontFamily.regular
          : variant === 'bodyStrong'
            ? tokens.fontFamily.bold
            : FONT_FAMILY_MAP[tokenKey];
  const fontFamily = fontFallbackMode ? undefined : intendedFamily;
  const fontWeight = FONT_WEIGHT_BY_FAMILY[intendedFamily] ?? tier.weight;
  const fontVariant = TABULAR_TIERS.has(tokenKey)
    ? (['tabular-nums'] as TextStyle['fontVariant'])
    : undefined;

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
          fontWeight,
          lineHeight: tier.lineHeight,
          /*
            Tracking, which the scale carries and this component never emitted.

            Inter is drawn on a wide default sidebearing: set at 24-32px with no
            adjustment it reads loose and soft, which is most of why the app's
            type looked flat next to a designed comp. Headings tighten (negative
            tracking), small all-caps labels open up (positive), and body is left
            essentially alone. A tier without the field keeps RN's default.
          */
          ...(tier.letterSpacing != null ? { letterSpacing: tier.letterSpacing } : {}),
          ...(fontVariant ? { fontVariant } : {}),
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

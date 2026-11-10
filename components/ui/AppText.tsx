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
  | 'moneySmall'
  /**
   * Notification copy: 15px at a light 400, with names at 600. The owner found
   * the bell list "so bold and boring" at 17px/600–700 (Nov 2026); messages
   * are skimmed, so a quieter face with italic titles reads faster. Scoped to
   * notifications — the heavier ladder stays everywhere else.
   */
  | 'notification'
  | 'notificationStrong';

type Tone ='default' | 'secondary' | 'muted' | 'inverse' | 'primary' | 'danger' | 'success' | 'warning' | 'disabled';
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
  /**
   * Resolve `tone` against the LIGHT palette regardless of the active theme.
   *
   * Counterpart to `onDarkStage` for optical calibration surfaces and light
   * stage canvases evaluated while the device theme is set to dark mode.
   */
  onLightStage?: boolean;
  /**
   * Set in the true italic face — for a title or a quoted line inside copy
   * (notification titles, a reviewer's note). Not for whole paragraphs.
   */
  italic?: boolean;
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

/** Palette used by `onLightStage` — ensures high-contrast dark ink on light
 *  test stages when the surrounding app chrome is running in dark mode. */
const LIGHT_STAGE_THEME = { colors: tokens.themes.light.colors } as ReturnType<
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
  notification: 'bodyReadable',
  notificationStrong: 'bodyReadable',
};

/**
 * The real italic face for each family, loaded in app/_layout.tsx. Android
 * otherwise fakes a slant from the upright face, and on a phone whose system
 * font is a handwriting face (the test A17) an unresolved family can render in
 * that instead. Families without an entry fall back to `fontStyle: 'italic'`.
 */
const ITALIC_FAMILY: Record<string, string> = {
  [tokens.fontFamily.regular]: tokens.fontFamily.regularItalic,
  [tokens.fontFamily.semiBold]: tokens.fontFamily.semiBoldItalic,
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
 * Family per tier: 600 reads, 700 labels, 800 heads — set in Roboto.
 *
 * The app was set in Inter on a 500 body / 700 label ladder, which read thin
 * and washed out next to the Android apps beside it on the phone (owner
 * feedback 2026-10-17: "too thin compared with industry standards"). Two
 * changes answered that: the family moved to Roboto, the face most Android
 * apps use (tokens.fontFamily), and reading text moved up to SemiBold with
 * explicit "regular" variants at Medium. Labels stay Bold and headings
 * ExtraBold, so the ladder keeps three distinct steps. Do not lighten this
 * without the owner's say-so.
 */
const FONT_FAMILY_MAP: Record<TypographyTokenKey, string> = {
  display: tokens.fontFamily.extraBold,
  title: tokens.fontFamily.extraBold,
  subtitle: tokens.fontFamily.bold,
  body: tokens.fontFamily.semiBold,
  caption: tokens.fontFamily.semiBold,
  h1: tokens.fontFamily.extraBold,
  h2: tokens.fontFamily.bold,
  h3: tokens.fontFamily.bold,
  bodyBold: tokens.fontFamily.bold,
  small: tokens.fontFamily.semiBold,
  smallBold: tokens.fontFamily.bold,
  screenTitle: tokens.fontFamily.extraBold,
  profileName: tokens.fontFamily.bold,
  brandName: tokens.fontFamily.bold,
  sectionTitle: tokens.fontFamily.bold,
  cardTitle: tokens.fontFamily.bold,
  bodyReadable: tokens.fontFamily.semiBold,
  actionLabel: tokens.fontFamily.bold,
  buttonLabel: tokens.fontFamily.bold,
  badgeLabel: tokens.fontFamily.bold,
  navLabel: tokens.fontFamily.bold,
  meta: tokens.fontFamily.semiBold,
  statValue: tokens.fontFamily.extraBold,
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
  onLightStage = false,
  italic = false,
  style,
  children,
  ...rest
}: Props) {
  const { theme: activeTheme } = useTheme();
  const theme = onDarkStage
    ? DARK_STAGE_THEME
    : onLightStage
      ? LIGHT_STAGE_THEME
      : activeTheme;
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
      ? tokens.fontFamily.medium
      : variant === 'captionBold'
        ? tokens.fontFamily.bold
        : variant === 'bodyRegular'
          ? tokens.fontFamily.medium
          : variant === 'bodyStrong'
            ? tokens.fontFamily.bold
            : variant === 'notification'
              ? tokens.fontFamily.regular
              : variant === 'notificationStrong'
                ? tokens.fontFamily.semiBold
                : FONT_FAMILY_MAP[tokenKey];
  const italicFamily = italic ? ITALIC_FAMILY[intendedFamily] : undefined;
  const fontFamily = fontFallbackMode ? undefined : italicFamily ?? intendedFamily;
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
          // With a true italic face loaded the family already slants; the
          // style still tells fallback mode and unmapped families to slant.
          ...(italic ? { fontStyle: 'italic' as const } : {}),
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

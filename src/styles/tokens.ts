import type { ResolvedTheme } from '@/src/types/theme';
import {
  brandPrimitives,
  neutralPrimitives,
  feedbackPrimitives,
  spacingPrimitives,
  radiusPrimitives,
  motionPrimitives,
  elevationPrimitives,
  lightSemanticTokens,
  darkSemanticTokens,
  type SemanticColors,
} from './design-tokens';

export * from './design-tokens';


export type ThemeScheme = ResolvedTheme;


// 📐 Layout constants for consistent spacing across the app
export const LAYOUT = {
  TAB_BAR_HEIGHT: 68,
  HEADER_HEIGHT: 100,
  STATUS_BAR_HEIGHT: 44,
  FEED_BOTTOM_PADDING: 80,
  RAIL_BOTTOM_OFFSET: 180,
  META_BOTTOM: 80,
} as const;

type Theme = {
  colors: {
    // ── Canonical Semantic Tokens ────────────────────────────────────────────
    semantic: SemanticColors;
    surfacePage: string;
    surfaceCard: string;
    surfaceRecessed: string;
    surfaceSubtle: string;
    textPrimary: string;
    borderDefault: string;
    actionBrand: string;
    actionPrimary: string;
    button: SemanticColors['button'];

    bg: string;
    /**
     * Matte behind full-bleed feed media — the Runway stage.
     *
     * Distinct from `bg` because letterboxed portrait photography needs a
     * settled backdrop, not paper white. In the light theme the stage is a soft
     * neutral rather than `#FFFFFF`: a pure-white matte strobes on every swipe
     * as media slides across it, which is what the light-theme eye-strain report
     * was about. Keeping it a token means the stage can be tuned per theme
     * without any screen hardcoding a colour again.
     */
    runwayStage: string;
    surface: string;
    surfaceAlt: string;
    surfaceOverlay: string;
    overlay: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    /**
     * Placeholder ink — the ONLY correct value for `placeholderTextColor`.
     *
     * `textMuted` was doing this job, and `textMuted` is deliberately dark
     * (#334155 on light) because captions and helper text are read, not
     * skimmed. A hint rendered in reading ink is indistinguishable from a
     * typed value: users reported tapping into empty fields and pressing
     * backspace to "clear" text that was never there. A placeholder has to sit
     * clearly below the body ramp — present enough to read on purpose, faint
     * enough that an empty field never looks filled.
     */
    textPlaceholder: string;
    /**
     * Disabled control surface/ink. Never the brand colour.
     *
     * A disabled primary button used to be full purple at 55% opacity, which
     * on white still reads as a lit, pressable brand button — the control
     * announced "press me" and then refused. Disabled is an absence of
     * affordance, so it drops to neutral chrome in both themes.
     */
    disabledSurface: string;
    disabledBorder: string;
    textDisabled: string;
    textInverse: string;
    border: string;
    primary: string;
    primaryActive: string;
    primaryDark: string;
    primarySoft: string;
    /**
     * Fill behind the ACTIVE island tab.
     *
     * Its own token rather than `primarySoft`, because the two want different
     * things: `primarySoft` is a background tint used behind text all over the
     * app and has to stay light, while this one sits on frosted white chrome
     * and has to be legible AS a selection. One step deeper than the tint —
     * same hue, enough separation from the chrome to read at a glance without
     * turning the navigation into a block of colour.
     */
    navActiveSurface: string;
    /**
     * The active island chip, as frosted glass rather than a solid tint.
     *
     * Separate from `navActiveSurface` because it is doing a different job.
     * That token is opaque: it covers the island's blur, so the selected chip
     * became a flat lozenge sitting ON the glass and needed a ring drawn round
     * it to have any shape at all. This one is translucent, so the island's own
     * blur reads THROUGH the chip — which is what makes it look like a thicker
     * piece of the same glass instead of a sticker, and is why the ring is no
     * longer needed to define its edge.
     *
     * Alpha is the whole design. Too low and the selection disappears into the
     * chrome; too high and it is `navActiveSurface` again with extra steps.
     * Light sits near-opaque because it has to separate from frosted WHITE;
     * dark sits much lower because a violet at any real weight glows on dark
     * glass and only needs a hint to register.
     */
    navActiveGlass: string;
    /**
     * The two stops of the faint brand wash laid over a tile or a card.
     *
     * Cards that are only a fill and a hairline read as bare, and a screen of
     * them reads as a form. This is the smallest thing that fixes that: a
     * barely-perceptible vertical gradient in the brand hue, light enough that
     * nothing sitting on it loses contrast, present enough that a surface stops
     * looking like untouched paper.
     *
     * Both stops are declared per theme rather than derived with opacity: a
     * translucent purple over a near-black ground goes muddy, so the dark pair
     * is picked by eye to lift the same amount without greying.
     */
    surfaceTintGradient: readonly [string, string, ...string[]];
    surfaceTintLocations?: readonly [number, number, ...number[]];
    focusRing: string;
    onPrimary: string;
    danger: string;
    onDanger: string;
    success: string;
    warning: string;
    badgeRed: string;
    skeletonBase: string;
    skeletonHighlight: string;
    backdrop: string;
    backdropStrong: string;
    bottomSheetSurface: string;
    bottomSheetHandle: string;
    mutedSurface: string;
    controlSurface: string;
    controlSurfaceActive: string;
    // Phase 12: semantic glassmorphism tokens (replaces GLASS export)
    glassSurfaceSoft: string;
    glassSurface: string;
    glassSurfaceStrong: string;
    glassBorder: string;
    glassBlur: number;
  };
};

export const tokens = {
  motion: motionPrimitives,
  primitives: {
    brand: brandPrimitives,
    neutral: neutralPrimitives,
    feedback: feedbackPrimitives,
    spacing: spacingPrimitives,
    radius: radiusPrimitives,
    motion: motionPrimitives,
    elevation: elevationPrimitives,
  },
  semantic: {
    light: lightSemanticTokens,
    dark: darkSemanticTokens,
  },

  themes: {
    light: {
      colors: {
        semantic: lightSemanticTokens,
        surfacePage: lightSemanticTokens.surface.page,
        surfaceCard: lightSemanticTokens.surface.card,
        surfaceRecessed: lightSemanticTokens.surface.recessed,
        surfaceSubtle: lightSemanticTokens.surface.subtle,
        textPrimary: lightSemanticTokens.text.primary,
        borderDefault: lightSemanticTokens.border.default,
        actionBrand: lightSemanticTokens.action.brand,
        actionPrimary: lightSemanticTokens.action.primary,
        button: lightSemanticTokens.button,

        bg: '#FFFFFF',
        runwayStage: '#E9EEF5',
        surface: '#ffffff',
        surfaceAlt: '#E9EEF5',
        surfaceOverlay: '#FFFFFF',
        overlay: 'rgba(255,255,255,0.75)',
        // Deeper ink across all three tiers. The old ramp leaned on slate,
        // which carries a blue cast that reads as washed-out next to a white
        // surface — and `textMuted` (#475569) is the colour most captions and
        // helper text use, so the app's most common text was also its faintest.
        text: '#050914',
        textSecondary: '#1E293B',
        textMuted: '#334155',
        textPlaceholder: '#98A4B8',
        disabledSurface: '#EDF0F5',
        disabledBorder: '#DCE2EC',
        textDisabled: '#9AA5B5',
        textInverse: '#ffffff',
        border: '#D4DCE8',
        primary: '#9333EA',
        primaryActive: '#7E22CE',
        primaryDark: '#7E22CE',
        primarySoft: '#F3E8FF',
        // One shade deeper than `primarySoft` (#F3E8FF), which disappeared into
        // the island's frosted white. Same family, enough weight to register.
        navActiveSurface: '#E4D2FA',
        // `navActiveSurface` at 0.9: the island behind it is frosted WHITE, so
        // the chip needs most of its weight to separate, and the remaining
        // tenth is what lets the blur through and keeps it glass.
        navActiveGlass: 'rgba(228,210,250,0.90)',
        // Roughly a 3% purple over white at the top, clearing to plain surface.
        surfaceTintGradient: [
          '#ffffff',
          '#faf7fe',
          '#f6f0fd',
          '#f3e8fc',
          '#efe3fb',
          '#ecdefa',
          '#f3e8fc',
          '#ffffff',
        ] as readonly [string, string, ...string[]],
        surfaceTintLocations: [0, 0.14, 0.28, 0.42, 0.56, 0.70, 0.84, 1.0] as readonly [number, number, ...number[]],
        focusRing: '#C084FC',
        onPrimary: '#ffffff',
        danger: '#ef4444',
        onDanger: '#ffffff',
        success: '#22c55e',
        warning: '#f59e0b',
        badgeRed: '#ef4444',
        skeletonBase: 'rgba(0,0,0,0.02)',
        skeletonHighlight: 'rgba(255,255,255,0.9)',
        backdrop: 'rgba(8,15,26,0.22)',
        backdropStrong: 'rgba(8,15,26,0.4)',
        bottomSheetSurface: '#ffffff',
        bottomSheetHandle: 'rgba(0,0,0,0.06)',
        mutedSurface: '#ffffff',
        controlSurface: '#ffffff',
        controlSurfaceActive: 'rgba(17,24,39,0.08)',
        glassSurfaceSoft: 'rgba(255,255,255,0.42)',
        glassSurface: 'rgba(255,255,255,0.78)',
        glassSurfaceStrong: 'rgba(255,255,255,0.92)',
        glassBorder: 'rgba(15,23,42,0.12)',
        glassBlur: 32,
      },
    } satisfies Theme,
    dark: {
      colors: {
        semantic: darkSemanticTokens,
        surfacePage: darkSemanticTokens.surface.page,
        surfaceCard: darkSemanticTokens.surface.card,
        surfaceRecessed: darkSemanticTokens.surface.recessed,
        surfaceSubtle: darkSemanticTokens.surface.subtle,
        textPrimary: darkSemanticTokens.text.primary,
        borderDefault: darkSemanticTokens.border.default,
        actionBrand: darkSemanticTokens.action.brand,
        actionPrimary: darkSemanticTokens.action.primary,
        button: darkSemanticTokens.button,

        bg: '#080A0F',
        runwayStage: '#080A0F',
        surface: '#111620',
        surfaceAlt: '#1A2230',
        surfaceOverlay: '#202938',
        overlay: 'rgba(8,10,15,0.58)',
        // On a near-black ground "deeper" means lighter — same intent, mirrored.
        text: '#FFFFFF',
        textSecondary: '#E2E8F0',
        textMuted: '#B6C2D2',
        textPlaceholder: '#69758A',
        disabledSurface: '#171E29',
        disabledBorder: '#232C3A',
        textDisabled: '#6B7789',
        textInverse: '#ffffff',
        // #303B4D against the #111620 surface was a hard, opaque rule that read
        // louder than the content it framed. A dark-theme border should sit
        // just clear of its surface — enough to divide, not enough to look
        // drawn on. Focus states carry the brand colour, so nothing depends on
        // the resting border being loud.
        border: '#1F2733',
        primary: '#9333EA',
        primaryActive: '#7E22CE',
        primaryDark: '#7E22CE',
        primarySoft: '#2B1742',
        // Same one-step-deeper treatment applied to the dark tint (#2B1742),
        // which had the same "is that selected?" problem on dark chrome.
        navActiveSurface: '#3B2260',
        // Far lower alpha than light, and deliberately a brighter violet than
        // `navActiveSurface`: on dark glass a lit chip has to read as light
        // coming through, not as a darker patch. 0.34 registers at a glance
        // and still lets the blur carry.
        navActiveGlass: 'rgba(167,112,247,0.34)',
        // The same lift, mirrored: a touch of violet INTO the surface rather
        // than a wash over it, so the card warms without going grey.
        surfaceTintGradient: [
          '#1b122f',
          '#19102b',
          '#170e28',
          '#150c24',
          '#130a20',
          '#11081c',
          '#0e0717',
          '#0b0512',
        ] as readonly [string, string, ...string[]],
        surfaceTintLocations: [0, 0.14, 0.28, 0.42, 0.56, 0.70, 0.84, 1.0] as readonly [number, number, ...number[]],
        focusRing: '#C084FC',
        onPrimary: '#ffffff',
        danger: '#ef4444',
        onDanger: '#ffffff',
        success: '#22c55e',
        warning: '#f59e0b',
        badgeRed: '#ef4444',
        skeletonBase: 'rgba(255,255,255,0.04)',
        skeletonHighlight: 'rgba(255,255,255,0.04)',
        backdrop: 'rgba(0,0,0,0.58)',
        backdropStrong: 'rgba(0,0,0,0.8)',
        bottomSheetSurface: '#111620',
        bottomSheetHandle: 'rgba(255,255,255,0.08)',
        mutedSurface: 'rgba(255,255,255,0.07)',
        controlSurface: 'rgba(255,255,255,0.08)',
        controlSurfaceActive: 'rgba(255,255,255,0.14)',
        glassSurfaceSoft: 'rgba(3,7,18,0.52)',
        glassSurface: 'rgba(0,0,0,0.58)',
        glassSurfaceStrong: 'rgba(3,7,18,0.74)',
        glassBorder: 'rgba(255,255,255,0.12)',
        glassBlur: 36,
      },
    } satisfies Theme,
  } as const,

  // Backwards-compatible aliases used by existing screens.
  colors: {
    // Keep aligned with the web app's Tailwind tokens (fwiez/tailwind.config.js).
    dark: '#000000',
    lightGray: '#f0f2f5',
    primary: '#9333EA',
    /**
     * The loader ring, per ground.
     *
     * Two colours, not two shades of one. `wiezRingLight` sits at 1.9:1 against
     * the night ground and `wiezRingDark` at 2.2:1 against paper — neither
     * survives on the other side, which is exactly the mistake the old logo
     * made when it used one palette everywhere. Kept in step with
     * `--wiez-ring` in the web build and `BRAND_COLORS` in src/brand/identity.
     */
    wiezRingLight: '#6015e2',
    wiezRingDark: '#af87f4',
    /**
     * Loader backdrop and the two ambient orbs behind the mark.
     *
     * `loaderBackdropDark` is deliberately deeper than the dark theme's `bg`:
     * the loader is a full-screen hold, and dropping a shade makes the mark the
     * only lit thing on screen. The light scheme uses the ambient `bg` instead,
     * so only the dark value needs a home here. The orbs differ per scheme only
     * in opacity — same hues, softer on paper.
     *
     * These were half violet and half brand gold, from the era when the mark
     * itself was gold. The mark is violet now and a gold wash behind it read as
     * a colour bug.
     */
    loaderBackdropDark: '#0b0710',
    loaderOrbPrimaryDark: 'rgba(96,21,226,0.20)',
    loaderOrbSecondaryDark: 'rgba(175,135,244,0.14)',
    loaderOrbPrimaryLight: 'rgba(96,21,226,0.12)',
    loaderOrbSecondaryLight: 'rgba(169,126,243,0.12)',
    /**
     * Elevation shadow colour. Eleven files had written `shadowColor: '#000'`
     * independently; it is one concept and belongs in one place.
     */
    shadow: '#000000',
    /** Neutral (not black) wash used for inline message/attachment surfaces. */
    neutralWash: 'rgba(128,128,128,0.15)',
    /**
     * Scrim behind a modal sheet.
     *
     * Scheme-independent, and it has to be: the job is to darken whatever is
     * behind the sheet, which on the light theme is paper and on the dark theme
     * is already near-black. The per-scheme `theme.colors.backdrop` pair is for
     * surfaces that sit IN the theme; a scrim sits over it. This also has to be
     * reachable from a static StyleSheet, where the scheme is not known.
     */
    scrim: 'rgba(0,0,0,0.5)',
    /** Paint behind the app before the theme resolves — matches light `bg`. */
    bootBackground: '#FFFFFF',
    /** Opaque white. Chrome over media, where the backdrop is unknown. */
    light: '#FFFFFF',
    /** Frosted plate for controls floating over a photograph. */
    glassPlateDark: 'rgba(18, 18, 24, 0.78)',
    /** Faint blue-black wash used behind light-theme header chrome. */
    inkWash: 'rgba(8,10,18,0.08)',
    /** QR modules and quiet zone. Fixed high contrast — scanners depend on it. */
    qrForeground: '#6d28d9',
    qrBackground: '#ffffff',
    /**
     * Thread / patch burst accents. Written as both `#0f766e` and `#0F766E` in
     * the same file before this — one colour, two spellings, which is the drift
     * in miniature.
     */
    threadBurstDeep: '#0F766E',
    threadBurstSoft: '#CCFBF1',
    /** Thread rail: purple glow behind an active glyph, and its lit state. */
    threadRailGlow: 'rgba(126, 34, 206, 0.55)',
  },

  /**
   * Black scrim at an explicit opacity.
   *
   * A count across the mobile app found ~20 DIFFERENT black-scrim opacities
   * written by hand — 0.03, 0.1, 0.12, 0.15, 0.16, 0.18, 0.4, 0.46, 0.48, 0.5,
   * 0.55, 0.58, 0.7, 0.72, 0.75, 0.8 — several of them in the same visual role,
   * differing only because whoever typed them could not see the others. A
   * function rather than a fixed ladder of named steps: overlays genuinely need
   * a continuum (a sheet backdrop and a photo veil are not the same weight),
   * and inventing `scrimSoftish` names for sixteen values would move the guessing
   * rather than remove it.
   *
   * `tokens.ts` is exempt from the hardcoded-colour rule, so this is the one
   * place the literal may be written.
   */
  scrim: (opacity: number): string => `rgba(0,0,0,${opacity})`,

  /**
   * White veil at an explicit opacity — the counterpart to `scrim`.
   *
   * Used for chrome drawn ON TOP of photography (hairlines, control fills,
   * pressed states on a card cover), where the surface underneath is unknown
   * and only a translucent white reads reliably.
   */
  tintLight: (opacity: number): string => `rgba(255,255,255,${opacity})`,

  /**
   * Third-party brand colours.
   *
   * Same status as `GoogleMark`'s exemption: these belong to Instagram, Meta
   * and X, are fixed by their brand guidelines, and must never follow our
   * theme. They live here — named and in one place — rather than as loose hex
   * in whichever component happened to render a social row.
   */
  socialBrand: {
    instagram: '#E1306C',
    facebook: '#1877F2',
    twitter: '#1DA1F2',
  },

  /**
   * Toast severities: a 95%-opaque fill over a solid edge of the same hue.
   * Deliberately NOT the theme's semantic colours — a toast floats over
   * arbitrary content and needs its own guaranteed contrast.
   */
  toast: {
    successFill: 'rgba(16, 185, 129, 0.95)',
    successEdge: '#10B981',
    errorFill: 'rgba(239, 68, 68, 0.95)',
    errorEdge: '#EF4444',
    infoFill: 'rgba(59, 130, 246, 0.95)',
    infoEdge: '#3B82F6',
    warningFill: 'rgba(245, 158, 11, 0.95)',
    warningEdge: '#F59E0B',
  },

  /**
   * The floating island dock's own glass.
   *
   * Blur tints sit under a `BlurView`; the solid pair is the fallback when blur
   * is unavailable. Both are near-neutral rather than themed `surface`, because
   * the dock floats over whatever the screen is showing.
   */
  island: {
    blurDark: 'rgba(10,12,20,0.58)',
    blurLight: 'rgba(255,255,255,0.66)',
    solidDark: 'rgba(14,16,24,0.92)',
    solidLight: 'rgba(250,250,252,0.94)',
    shadowLight: 'rgba(15, 23, 42, 0.9)',
    glyphHaloDark: 'rgba(255,255,255,0.10)',
    glyphHaloLight: 'rgba(147,51,234,0.14)',
  },

  /**
   * Full-bleed content-viewer chrome palette.
   *
   * A full-bleed viewer that is deep-dark in BOTH themes (same policy as the
   * Runway stage — see `runwayStage` in this file), so it cannot read
   * ambient theme colours without turning into a bright slab in light mode.
   * Naming the ladder is what stops the next edit inventing a fifth near-black.
   */
  viewer: {
    backdrop: '#06060b',
    surface: '#0b0b12',
    surfaceAlt: '#111',
    plate: '#121826',
    plateDeep: '#0B0F17',
    accent: '#9333EA',
    accentEdge: '#C084FC',
    muted: '#64748B',
    hairline: '#273244',
  },

  /**
   * The auth surface's own palette.
   *
   * Login, signup, forgot-password, reset-password and verify-email are a
   * deliberately separate visual world from the rest of the app — a gradient
   * backdrop with a gold accent, not the ambient theme. That is a legitimate
   * design decision; duplicating the hex values in five screens was not. The
   * three password/verify screens were byte-identical, and `login` and
   * `AnimatedAuthBackground` each carried near-copies whose middle stops had
   * quietly drifted apart (`#1a0a2e` vs `#1a1122`, `#ede8f5` vs `#ede9f5`).
   *
   * Those drifts are PRESERVED below rather than reconciled — the ambient
   * background and the screen backdrop are separate layers and this pass is
   * value-identical by design. Reconciling them is a visual decision for
   * someone looking at a device, not a side effect of tokenising.
   */

  /**
   * WIEZ Lumina Multi-Stop (7-12 stops) Gradients & Physical Lighting System
   * Features perceptual non-linear color interpolation + specular reflection
   */
  lumina: {
    brandPrimary: {
      colors: [
        '#4c0519',
        '#3b0764',
        '#581c87',
        '#6b21a8',
        '#7e22ce',
        '#9333ea',
        '#a855f7',
        '#b86cf9',
        '#c084fc',
        '#d8b4fe',
        '#e9d5ff',
        '#faf5ff',
      ] as const,
      locations: [0, 0.08, 0.18, 0.28, 0.39, 0.50, 0.61, 0.72, 0.82, 0.91, 0.97, 1.0] as const,
    },
    activeIndicator: {
      colors: [
        'rgba(88, 28, 135, 0.38)',
        'rgba(107, 33, 168, 0.32)',
        'rgba(126, 34, 206, 0.28)',
        'rgba(147, 51, 234, 0.24)',
        'rgba(168, 85, 247, 0.20)',
        'rgba(192, 132, 252, 0.17)',
        'rgba(216, 180, 254, 0.13)',
        'rgba(233, 213, 255, 0.09)',
        'rgba(243, 232, 255, 0.05)',
        'rgba(255, 255, 255, 0.02)',
      ] as const,
      locations: [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.94, 1.0] as const,
    },
    cardElevatedDark: {
      colors: [
        '#171026',
        '#160f24',
        '#140d21',
        '#130c1f',
        '#110a1c',
        '#10091a',
        '#0e0817',
        '#0c0714',
        '#0a0512',
      ] as const,
      locations: [0, 0.14, 0.28, 0.42, 0.56, 0.70, 0.84, 0.94, 1.0] as const,
    },
    cardLiveDark: {
      colors: [
        '#1b122f',
        '#19102b',
        '#170e28',
        '#150c24',
        '#130a20',
        '#11081c',
        '#0e0717',
        '#0b0512',
      ] as const,
      locations: [0, 0.16, 0.32, 0.48, 0.64, 0.78, 0.90, 1.0] as const,
    },
  },

  auth: {
    /** Full-screen backdrop on the password / verify screens. */
    screenGradientDark: [
      '#090510',
      '#0c0714',
      '#110a1c',
      '#150c24',
      '#180a2b',
      '#1a0a2e',
      '#180a2b',
      '#150c24',
      '#110a1c',
      '#0c0714',
      '#090510',
    ] as const,
    screenGradientLight: [
      '#faf9fb',
      '#f7f6f8',
      '#f2edf9',
      '#ede8f5',
      '#e8e0f2',
      '#ede8f5',
      '#f2edf9',
      '#f7f6f8',
      '#faf9fb',
    ] as const,
    /** 9-stop accent panel behind the form card. */
    cardGradientDark: [
      '#2B1742',
      '#271a3f',
      '#231d3b',
      '#201e38',
      '#1E293B',
      '#192334',
      '#141d2c',
      '#101825',
      '#0F172A',
    ] as const,
    cardGradientLight: [
      '#EDE9FE',
      '#F4ECFD',
      '#FAF0F5',
      '#FEF3C7',
      '#FCF6DC',
      '#FAF9ED',
      '#F8FAFC',
    ] as const,
    /** 11-stop `AnimatedAuthBackground` ambient wash with specular center. */
    ambientGradientDark: [
      '#090510',
      '#0c0714',
      '#110a1c',
      '#150e24',
      '#170f28',
      '#1a1122',
      '#170f28',
      '#150e24',
      '#110a1c',
      '#0c0714',
      '#090510',
    ] as const,
    ambientGradientLight: [
      '#faf9fb',
      '#f7f6f8',
      '#f3edf9',
      '#eee9f6',
      '#ede9f5',
      '#eee9f6',
      '#f3edf9',
      '#f7f6f8',
      '#faf9fb',
    ] as const,
    ambientOrbPrimaryDark: 'rgba(147, 51, 234, 0.25)',
    ambientOrbPrimaryLight: 'rgba(147, 51, 234, 0.15)',
    ambientOrbSecondaryDark: 'rgba(212, 175, 55, 0.20)',
    ambientOrbSecondaryLight: 'rgba(212, 175, 55, 0.12)',
    ambientOrbAccentDark: 'rgba(6, 182, 212, 0.15)',
    ambientOrbAccentLight: 'rgba(6, 182, 212, 0.10)',
    /** Gold accent — the auth surface's primary call to action. */
    gold: '#D4AF37',
    /** Deep plum plate behind the auth card on login. */
    plate: '#2B1742',
    /** Purple rule used for the focused/selected auth control. */
    edge: '#9333EA',
    /**
     * Inline notice tints. Four states, each a border at 0.35 over a fill at
     * 0.08 of the same hue — the pairing is the pattern, so keep them together.
     */
    noticeGoldBorder: 'rgba(212,175,55,0.35)',
    noticeGoldFill: 'rgba(212,175,55,0.08)',
    noticeInfoBorder: 'rgba(147,51,234,0.3)',
    noticeInfoFill: 'rgba(147,51,234,0.08)',
    noticeSuccessBorder: 'rgba(34,197,94,0.35)',
    noticeSuccessFill: 'rgba(34,197,94,0.08)',
    noticeDangerBorder: 'rgba(239,68,68,0.35)',
    noticeDangerFill: 'rgba(239,68,68,0.08)',
  },

  // ─── Font family ────────────────────────────────────────────────────────────
  // Roboto, bundled and loaded in app/_layout.tsx via @expo-google-fonts/roboto.
  // The face most Android apps are set in (owner decision 2026-10-17). Bundled
  // rather than taken from the OS: Samsung lets owners replace the system font
  // (the test A17 has a handwriting face), and an app that relies on the OS
  // `sans-serif` renders in whatever the owner picked.
  fontFamily: {
    regular: 'Roboto_400Regular',
    medium: 'Roboto_500Medium',
    semiBold: 'Roboto_600SemiBold',
    bold: 'Roboto_700Bold',
    /**
     * The top of the ladder.
     *
     * Every heading tier in the scale below used to be 700 — a 32px display
     * and a 17px card title carried identical weight, so size was the ONLY
     * thing separating them. That is what reads as flat: there is no weight
     * hierarchy to see. ExtraBold gives the display and screen-title tiers
     * somewhere to go.
     */
    extraBold: 'Roboto_800ExtraBold',
    // Fallback stack for any place fontFamily is not yet set
    stack: 'Roboto_400Regular, Roboto, system-ui, -apple-system, sans-serif',
  },

  // ─── Typography scale (strict — do not freestyle) ──────────────────────────
  // Each tier carries: size (px), weight (string), lineHeight (px)
  // Rule: NEVER go below 12px for readable content. 16px is body minimum.
  typography: {
    /** 32px / 700 — hero splash, big editorial headers */
    display: { size: 32, weight: '800' as const, lineHeight: 36, letterSpacing: -0.8 },
    /** 24px / 700 — primary screen titles */
    screenTitle: { size: 24, weight: '800' as const, lineHeight: 28, letterSpacing: -0.5 },
    /** 24px / 700 — primary mobile titles */
    title: { size: 24, weight: '800' as const, lineHeight: 28, letterSpacing: -0.5 },
    /** 22px / 700 — profile names (Instagram-dense) */
    profileName: { size: 22, weight: '700' as const, lineHeight: 26, letterSpacing: -0.4 },
    /** 22px / 700 — brand names (Instagram-dense) */
    brandName: { size: 22, weight: '700' as const, lineHeight: 26, letterSpacing: -0.4 },
    /** 18px / 700 — section headers */
    sectionTitle: { size: 18, weight: '700' as const, lineHeight: 22, letterSpacing: -0.3 },
    /** 18px / 700 — section headers and strong subtitles */
    subtitle: { size: 18, weight: '700' as const, lineHeight: 22, letterSpacing: -0.3 },
    /** 17px / 700 — card titles. One step ABOVE body, not level with it: at the
     *  old 16/600 a card title and its body copy shared a size and sat one
     *  weight apart, which is not a hierarchy anyone can see. */
    cardTitle: { size: 17, weight: '700' as const, lineHeight: 22, letterSpacing: -0.2 },
    /** 16px / 500 — main body content */
    body: { size: 16, weight: '500' as const, lineHeight: 23, letterSpacing: -0.1 },
    /** 14px / 500 — highly readable, Instagram-dense body text (bio/about).
     *  Was 13 despite the comment saying 14 — 13px reads as fine print, which
     *  is exactly the "scanty" complaint. */
    bodyReadable: { size: 14, weight: '500' as const, lineHeight: 21, letterSpacing: -0.05 },
    /** 16px / 700 — button labels */
    buttonLabel: { size: 16, weight: '700' as const, lineHeight: 20, letterSpacing: -0.2 },
    /** 16px / 700 — action labels */
    actionLabel: { size: 16, weight: '700' as const, lineHeight: 20, letterSpacing: -0.2 },
    /** 12px / 500 — supporting meta text */
    caption: { size: 12, weight: '500' as const, lineHeight: 16, letterSpacing: 0 },
    /** 13px / 600 — meta */
    meta: { size: 13, weight: '600' as const, lineHeight: 17, letterSpacing: 0 },
    /** 12px / 700 — badge labels */
    badgeLabel: { size: 12, weight: '700' as const, lineHeight: 16, letterSpacing: 0.3 },
    /** 12px / 700 — nav + island labels. Was 11/600: below the 12px floor the
     *  rules set for readable content, and too light to hold its own against
     *  the icon above it — the "island links are not deep enough" report. */
    navLabel: { size: 12, weight: '700' as const, lineHeight: 15, letterSpacing: 0.2 },
    /** 14px / 700 — stat numbers. The number is the point of a stat; at 13px it
     *  was smaller than body text. */
    statValue: { size: 14, weight: '700' as const, lineHeight: 18, letterSpacing: -0.2 },

    /**
     * Money. Its own tier, because a price is not a heading that happens to
     * contain digits.
     *
     * Amounts were rendering as `bodyBold` — the same face, weight and spacing
     * as a card title — so "₦60,500" read as a label rather than as the figure
     * the row exists to communicate. Two changes carry it: 800 lifts it clear
     * of the 700 title beside it, and the slight negative tracking tightens the
     * digit run so a five-figure sum reads as one number instead of five
     * glyphs. `AppText` pairs these tiers with `tabular-nums`, which is what
     * keeps a column of amounts aligned on the decimal — proportional digits
     * make a stack of prices ragged no matter how the row is laid out.
     */
    money: { size: 17, weight: '800' as const, lineHeight: 22, letterSpacing: -0.3 },
    /** 22px / 800 — the headline amount on an order or a receipt. */
    moneyLarge: { size: 22, weight: '800' as const, lineHeight: 26, letterSpacing: -0.5 },
    /** 13px / 700 — a secondary amount: a line item, a fee, a deduction. */
    moneySmall: { size: 13, weight: '700' as const, lineHeight: 17, letterSpacing: -0.2 },
    /** 11px / 700 — stat labels (compact, Instagram-dense) */
    statLabel: { size: 11, weight: '700' as const, lineHeight: 14, letterSpacing: 0.6 },

    // Compatibility aliases for existing mobile code during migration.
    h1: { size: 24, weight: '800' as const, lineHeight: 30, letterSpacing: -0.5 },
    h2: { size: 20, weight: '700' as const, lineHeight: 26, letterSpacing: -0.4 },
    h3: { size: 18, weight: '700' as const, lineHeight: 24, letterSpacing: -0.3 },
    /** The single most-used "this is a heading" variant in the app. 600 next to
     *  a 500 body is the flattest pairing in the scale; 700 makes it a heading. */
    bodyBold: { size: 16, weight: '700' as const, lineHeight: 22, letterSpacing: -0.2 },
    small: { size: 13, weight: '500' as const, lineHeight: 18, letterSpacing: 0 },
    smallBold: { size: 13, weight: '700' as const, lineHeight: 18, letterSpacing: -0.1 },

    // ── Legacy flat values kept for backward-compat with existing screens ──
    // New code should use the tier objects above instead.
    title_px: 22, // → use title.size
    body_px: 16,  // → use body.size
    small_px: 14, // → use small.size
    xs:     12,   // → use caption.size
  },

  // ─── Spacing scale (4px base rhythm — industry standard) ───────────────────
  spacing: {
    0: 0,
    xs:  4,
    sm:  8,
    md:  12,
    lg:  16,
    xl2: 20,
    xl:  24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
  },

  // ─── Border radius ──────────────────────────────────────────────────────────
  radius: {
    none: radiusPrimitives.none,
    xs:   radiusPrimitives.xs,
    modal: radiusPrimitives.modal,
    sm:   8,
    md:   12,
    lg:   16,
    xl:   24,
    full: 9999,
  },

  // ─── Elevation / Shadows ──────────────────────────────────────────────────
  elevation: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 12,
    },
  },

  // ─── Button dimensions (mobile tap-target compliant) ───────────────────────
  // Min height 44px per iOS HIG / Android Material Design 3
  button: {
    xs: { height: 32, paddingHorizontal: 12 },
    sm: { height: 38, paddingHorizontal: 16 },
    md: { height: 44, paddingHorizontal: 20 },
    lg: { height: 52, paddingHorizontal: 24 },
  },
} as const;

export type AppTheme = (typeof tokens.themes)[ThemeScheme];

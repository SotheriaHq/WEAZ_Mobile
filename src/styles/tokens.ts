export type ThemeScheme = 'light' | 'dark';


// 📐 Layout constants for consistent spacing across the app
export const LAYOUT = {
  TAB_BAR_HEIGHT: 68,
  HEADER_HEIGHT: 100,
  STATUS_BAR_HEIGHT: 44,
  FEED_BOTTOM_PADDING: 80,
  RAIL_BOTTOM_OFFSET: 180,
  META_BOTTOM: 80,
} as const;

// 🌟 Glassmorphism tokens
export const GLASS = {
  dark: {
    bg: 'rgba(0, 0, 0, 0.5)',
    bgStrong: 'rgba(0, 0, 0, 0.75)',
    border: 'rgba(255, 255, 255, 0.08)',
    blur: 25,
  },
  light: {
    bg: 'rgba(255, 255, 255, 0.7)',
    bgStrong: 'rgba(255, 255, 255, 0.9)',
    border: 'rgba(0, 0, 0, 0.08)',
    blur: 20,
  },
} as const;

// 🎬 Gradient presets for overlays (use with LinearGradient)
export const GRADIENTS = {
  // Top overlay: dark at top, fades to transparent
  feedTop: {
    colors: ['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'transparent'] as const,
    locations: [0, 0.5, 1] as const,
  },
  // Bottom overlay: transparent at top, dark at bottom
  feedBottom: {
    colors: ['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)'] as const,
    locations: [0, 0.25, 1] as const,
  },
  // Primary button gradient
  primaryButton: {
    colors: ['#9333EA', '#7e22ce'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
} as const;

type Theme = {
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    surfaceOverlay: string;
    overlay: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;
    border: string;
    primary: string;
    primaryActive: string;
    primaryDark: string;
    primarySoft: string;
    focusRing: string;
    onPrimary: string;
    danger: string;
    onDanger: string;
    success: string;
    warning: string;
    badgeRed: string;
  };
};

export const tokens = {
  // Theme schedule for time-based mode.
  timeTheme: {
    // 7pm -> dark; 7am -> light
    darkStartHour: 19,
    lightStartHour: 7,
  },

  themes: {
    light: {
      colors: {
        bg: '#F4F6FA',
        surface: '#ffffff',
        surfaceAlt: '#E9EEF5',
        surfaceOverlay: '#FFFFFF',
        overlay: 'rgba(255,255,255,0.75)',
        text: '#0B1220',
        textSecondary: '#334155',
        textMuted: '#64748B',
        textInverse: '#ffffff',
        border: '#D4DCE8',
        primary: '#9333EA',
        primaryActive: '#7E22CE',
        primaryDark: '#7E22CE',
        primarySoft: '#F3E8FF',
        focusRing: '#C084FC',
        onPrimary: '#ffffff',
        danger: '#ef4444',
        onDanger: '#ffffff',
        success: '#22c55e',
        warning: '#f59e0b',
        badgeRed: '#ef4444',
      },
    } satisfies Theme,
    dark: {
      colors: {
        bg: '#000000',
        surface: '#0B0F17',
        surfaceAlt: '#121826',
        surfaceOverlay: '#121826',
        overlay: 'rgba(0,0,0,0.55)',
        text: '#F8FAFC',
        textSecondary: '#CBD5E1',
        textMuted: '#94A3B8',
        textInverse: '#ffffff',
        border: '#273244',
        primary: '#9333EA',
        primaryActive: '#7E22CE',
        primaryDark: '#7E22CE',
        primarySoft: '#2B1742',
        focusRing: '#C084FC',
        onPrimary: '#ffffff',
        danger: '#ef4444',
        onDanger: '#ffffff',
        success: '#22c55e',
        warning: '#f59e0b',
        badgeRed: '#ef4444',
      },
    } satisfies Theme,
  } as const,

  // Backwards-compatible aliases used by existing screens.
  colors: {
    // Keep aligned with the web app's Tailwind tokens (fthreadly/tailwind.config.js).
    dark: '#000000',
    lightGray: '#f0f2f5',
    primary: '#9333EA',
  },

  // ─── Font family ────────────────────────────────────────────────────────────
  // Inter is loaded in app/_layout.tsx via @expo-google-fonts/inter
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    // Fallback stack for any place fontFamily is not yet set
    stack: 'Inter_400Regular, system-ui, -apple-system, sans-serif',
  },

  // ─── Typography scale (strict — do not freestyle) ──────────────────────────
  // Each tier carries: size (px), weight (string), lineHeight (px)
  // Rule: NEVER go below 12px for readable content. 16px is body minimum.
  typography: {
    /** 32px / 700 — hero splash, big editorial headers */
    display: { size: 32, weight: '700' as const, lineHeight: 38 },
    /** 24px / 700 — primary mobile titles */
    title: { size: 24, weight: '700' as const, lineHeight: 30 },
    /** 18px / 600 — section headers and strong subtitles */
    subtitle: { size: 18, weight: '600' as const, lineHeight: 24 },
    /** 16px / 500 — main body content */
    body: { size: 16, weight: '500' as const, lineHeight: 22 },
    /** 12px / 500 — supporting meta text */
    caption: { size: 12, weight: '500' as const, lineHeight: 15 },

    // Compatibility aliases for existing mobile code during migration.
    h1: { size: 24, weight: '700' as const, lineHeight: 30 },
    h2: { size: 18, weight: '600' as const, lineHeight: 24 },
    h3: { size: 18, weight: '600' as const, lineHeight: 24 },
    bodyBold: { size: 16, weight: '600' as const, lineHeight: 22 },
    small: { size: 12, weight: '500' as const, lineHeight: 15 },
    smallBold: { size: 12, weight: '600' as const, lineHeight: 15 },

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
    sm: { height: 38, paddingHorizontal: 14 },
    md: { height: 44, paddingHorizontal: 18 },
    lg: { height: 52, paddingHorizontal: 24 },
  },
} as const;

export type AppTheme = (typeof tokens.themes)[ThemeScheme];

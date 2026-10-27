/**
 * WIEZ Design Foundation — Primitive Tokens (Native)
 *
 * Primitive tokens represent raw design values (colors, spacing, typography, radius, motion).
 */

export const brandPrimitives = {
  violet: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#af87f4', // Canonical On-Dark Brand Identity Mark (contrast 7.1:1 on #0c0b11)
    600: '#9333ea', // Established Interactive Component Accent (Tailwind purple-600)
    700: '#7e22ce', // Interactive hover / active state
    800: '#6015e2', // Canonical Light-Ground Brand Identity Mark (contrast 7.8:1 on #ffffff)
    900: '#4e11b8', // Strong / pressed state for canonical light mark
    950: '#1e0836', // Deep plum surface
  },
  gold: {
    400: '#facc15',
    500: '#d4af37', // WIEZ Luxury/Auth Gold Accent
    600: '#b5952f',
  },
  ink: {
    900: '#0c0b11', // Canonical WIEZ Brand Ground (AMOLED night base)
    950: '#080a0f', // Deepest runway stage matte
  },
} as const;

export const neutralPrimitives = {
  0: '#ffffff',
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#0a0a0a',
  1000: '#000000',
} as const;

export const feedbackPrimitives = {
  success: {
    light: '#22c55e',
    dark: '#16a34a',
    subtleLight: '#f0fdf4',
    subtleDark: 'rgba(34, 197, 94, 0.12)',
  },
  warning: {
    light: '#f59e0b',
    dark: '#d97706',
    subtleLight: '#fffbeb',
    subtleDark: 'rgba(245, 158, 11, 0.12)',
  },
  error: {
    light: '#ef4444',
    dark: '#dc2626',
    subtleLight: '#fef2f2',
    subtleDark: 'rgba(239, 68, 68, 0.12)',
  },
  info: {
    light: '#3b82f6',
    dark: '#2563eb',
    subtleLight: '#eff6ff',
    subtleDark: 'rgba(59, 130, 246, 0.12)',
  },
} as const;

export const spacingPrimitives = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const radiusPrimitives = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  modal: 28, // Standardized modal container radius (replaces arbitrary 26-30px)
  full: 9999,
} as const;

export const motionPrimitives = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 250,
    slow: 400,
  },
  easing: {
    standard: 'cubic-bezier(0.16, 1, 0.3, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    linear: 'linear',
  },
} as const;

export const elevationPrimitives = {
  levels: ['none', 'sm', 'md', 'lg', 'modal', 'recessed'] as const,
} as const;

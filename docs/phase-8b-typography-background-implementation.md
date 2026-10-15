# Phase 8B: Typography & Background Implementation

## Overview
This phase enforces the Inter font family across the Threadly mobile application, removes raw typography styles, establishes semantic typography tiers, and standardizes background layering tokens. It relies on the Phase 8A typography/background audit as its source of truth.

## Font Family Decision
- **Brand Font**: Inter.
- **Decision**: Maintained Inter as the primary brand font instead of falling back to system fonts by default. The Phase 8A audit identified hierarchy, scaling, and contrast issues rather than problems with the font family itself.

## Font Fallback Strategy
React Native does not support CSS-style font fallback arrays. A custom fallback strategy was implemented:
- Added a 3-second timeout to `expo-font` loading in `app/_layout.tsx`.
- Introduced `src/styles/FontMode.ts` to hold a global fallback lock state (`isFontFallbackMode`).
- If Inter fails to load within 3 seconds, `isFontFallbackMode` is set to `true`.
- `AppText` dynamically omits the `fontFamily` style if `isFontFallbackMode` is true, permitting the native platform system font (Roboto/San Francisco) to render seamlessly.
- This mode is locked for the entire session to prevent layout shifts/reflow mid-session.

## Typography Tiers & Scaling
Replaced direct `fontSize`/`fontWeight` styling with semantic variants defined in `src/styles/tokens.ts`:
- **display**: `36px`, `900` weight (Cap: 1.2x)
- **screenTitle**: `28px`, `800` weight (Cap: 1.3x)
- **h1**: `22px`, `800` weight (Cap: 1.3x)
- **h2**: `18px`, `700` weight (Cap: 1.3x)
- **h3**: `16px`, `700` weight (Cap: 1.4x)
- **subtitle**: `15px`, `600` weight (Cap: 1.4x)
- **body**: `14px`, `400` weight (Cap: 1.6x)
- **bodyBold**: `14px`, `600` weight (Cap: 1.6x)
- **small**: `13px`, `400` weight (Cap: 1.6x)
- **smallBold**: `13px`, `600` weight (Cap: 1.6x)
- **caption**: `12px`, `500` weight (Cap: 1.2x)
- **captionBold**: `12px`, `700` weight (Cap: 1.2x)
- **captionRegular**: `12px`, `400` weight (Cap: 1.2x)
- **badgeLabel**: `11px`, `700` weight (Cap: 1.15x)

These variants enforce strict `maxFontSizeMultiplier` limits based on their context.

## AppText Enforcement
- `AppText` strictly enforces the use of these variants.
- `sanitizeStyle` strips forbidden keys (`fontSize`, `fontWeight`, `lineHeight`, `color`, `fontFamily`) from inline `style` props passed to `AppText` to prevent accidental raw typography overrides.

## Background Layering & Contrast
- `textMuted` contrast was improved (Light: `#475569`, Dark: `#94A3B8`) to easily pass WCAG AA.
- `CollectionDetailViewer` and `MarketFeedScreen` raw hardcoded dark layouts and `backgroundColor` hex values were replaced with dynamic `theme.colors` tokens or stripped if redundant.
- Cleaned up raw text color, font sizes, and weight declarations across major UI entry points.

## Components Migrated
- `src/features/feed/components/MarketFeedScreen.tsx`
- `components/catalog/CollectionDetailViewer.tsx`
- `components/catalog/ThreadRailAction.tsx`
- `components/navigation/NativeIslandBottomNav.tsx`
- `src/toast/ToastContext.tsx`


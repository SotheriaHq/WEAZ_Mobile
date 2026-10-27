# WIEZ Native Mobile Design System & Token Architecture

## 1. Overview

The WIEZ native mobile design system provides a unified, production-grade visual language synchronized with the WIEZ Web platform. It builds upon `tokens.ts` and `ThemeProvider` to provide typed theme tokens, standardized scales, and strict semantic parity.

```
WIEZ DESIGN FOUNDATION
        │
        ├── Primitive Tokens (color ramps, spacing, radius, motion, elevation)
        │
        └── Semantic Tokens (brand, action, surface, text, border, status, focus)
                 │
                 ├── Native Adapter (tokens.ts, ThemeProvider)
                 │         ↓
                 │    Native Components & Screens
                 │
                 └── Web Adapter (CSS custom properties, Tailwind config)
                           ↓
                      Web Components & Screens
```

---

## 2. Brand Identity & Interactive Semantics

WIEZ explicitly separates canonical brand identity from interactive component accents:

| Token | Light Value | Dark Value | Purpose |
|---|---|---|---|
| `brand.mark` | `#6015e2` | `#6015e2` | Canonical brand identity mark on light backgrounds |
| `brand.markOnDark` | `#af87f4` | `#af87f4` | Contrast-safe brand identity mark on dark backgrounds |
| `brand.markStrong` | `#4e11b8` | `#4e11b8` | Deep brand mark variant for high-contrast presentation |
| `brand.accent` | `#9333ea` | `#9333ea` | Component-level interactive accent (buttons, chips, active tabs) |
| `brand.accentHover` | `#7e22ce` | `#a855f7` | Hover interaction state |
| `brand.accentPressed` | `#6b21a8` | `#9333ea` | Pressed / active interaction state |
| `brand.subtle` | `rgba(147, 51, 234, 0.08)` | `rgba(175, 135, 244, 0.12)` | Subtle tinted container backgrounds |
| `brand.border` | `rgba(147, 51, 234, 0.20)` | `rgba(175, 135, 244, 0.25)` | Brand-tinted container outlines |

> [!NOTE]
> **Brand Role Distinction**: `brand.markStrong` (`#4e11b8`) is reserved for deep canonical identity mark presentation with 9.8:1 contrast on white. `brand.accentPressed` (`#6b21a8`) is the interactive pressed state for component-level purple accents (buttons, chips). They represent intentionally different semantic roles and must not be merged.

---

## 3. Scale Foundations

### Standardized Radius (`tokens.radius`)
- `none`: `0`
- `xs`: `2`
- `sm`: `4`
- `md`: `8`
- `lg`: `12`
- `xl`: `16`
- `modal`: `28` (Standardized across all native sheets, dialogs, and modal cards)
- `full`: `9999`

### Motion Durations (`tokens.motion.duration`)
- `instant`: `0`
- `fast`: `150` (micro-interactions, chip taps)
- `normal`: `250` (drawer expansions, transitions)
- `slow`: `400` (modal presentations, stage transitions)

---

## 4. Semantic Domains

Every theme (Light and Dark) defines explicit values for seven core semantic domains:
1. `brand`: Identity and accent tokens.
2. `action`: Interactive roles (`primary`, `brand`, `secondary`, `outline`, `ghost`, `danger`, `disabled`).
3. `focus`: Focus rings (`ring: #9333ea`).
4. `surface`: Background layers (`page`, `card`, `elevated`, `recessed`, `overlay`, `modal`, `stage`).
   - *Invariant Exception*: `surface.stage` is locked to deep black `#080a0f` in both light and dark themes for the Runway stage matte.
5. `text`: Typography roles (`primary`, `secondary`, `muted`, `inverse`, `onBrand`).
6. `border`: Structural boundary dividers (`subtle`, `default`, `strong`, `focus`).
7. `status`: Semantic feedback (`success`, `warning`, `danger`, `info`).

---

## 5. Native Consumption Patterns

### Using Theme Hook
```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function ExampleCard() {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.borderSubtle }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>WIEZ Card</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28, // or tokens.radius.modal
    borderWidth: 2,   // Rule 35: native borders must be 0 or >= 2px
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

### Direct Token Access
```tsx
import { tokens } from '../styles/tokens';

const modalRadius = tokens.radius.modal; // 28
const animationDuration = tokens.motion.duration.fast; // 150
```

---

## 6. Verification & Auditing

### Design System Audit
Ensures that zero unauthorized hardcoded colors or broken tokens are introduced:
```bash
npm run audit:design-system
```

### Cross-Repository Contract Verification
Verifies token synchronization with the Web platform:
```bash
npm run test:design-tokens-contract
```

### Combined CI Check
```bash
npm run ci:design-system
```

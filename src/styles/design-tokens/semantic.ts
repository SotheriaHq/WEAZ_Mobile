import { brandPrimitives, feedbackPrimitives, neutralPrimitives } from './primitives';

export interface SemanticColors {
  brand: {
    mark: string;
    markOnDark: string;
    markStrong: string;
    accent: string;
    accentHover: string;
    accentPressed: string;
    subtle: string;
    border: string;
  };
  action: {
    primary: string;
    primaryHover: string;
    primaryText: string;
    brand: string;
    brandHover: string;
    brandPressed: string;
    brandText: string;
    secondary: string;
    secondaryHover: string;
    secondaryText: string;
    outline: string;
    outlineBorder: string;
    outlineText: string;
    ghost: string;
    ghostHover: string;
    ghostText: string;
    danger: string;
    dangerHover: string;
    dangerText: string;
    disabled: string;
    disabledText: string;
    disabledBorder: string;
  };
  focus: {
    ring: string;
  };
  surface: {
    page: string;
    card: string;
    subtle: string;
    recessed: string;
    elevated: string;
    modal: string;
    stage: string;
    overlay: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    placeholder: string;
    disabled: string;
    inverse: string;
  };
  border: {
    default: string;
    subtle: string;
    strong: string;
    input: string;
    inputHover: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  button: {
    surface: {
      primary: string;
      primaryPressed: string;
      brand: string;
      brandPressed: string;
      secondary: string;
      secondaryPressed: string;
      outline: string;
      outlinePressed: string;
      danger: string;
      dangerPressed: string;
      disabled: string;
    };
    text: {
      primary: string;
      brand: string;
      secondary: string;
      outline: string;
      danger: string;
      disabled: string;
    };
    border: {
      secondaryTop: string;
      secondaryBottom: string;
      secondaryTopPressed: string;
      secondaryBottomPressed: string;
      outline: string;
      outlinePressed: string;
      disabled: string;
    };
    tactile: {
      primaryOverlay: readonly [string, string];
      secondaryRestOverlay: readonly [string, string];
      secondaryPressedOverlay: readonly [string, string];
      outlineOverlay: readonly [string, string];
    };
  };
}

export const lightSemanticTokens: SemanticColors = {
  brand: {
    mark: brandPrimitives.violet[800], // #6015e2 canonical identity
    markOnDark: brandPrimitives.violet[500], // #af87f4
    markStrong: brandPrimitives.violet[900], // #4e11b8
    accent: brandPrimitives.violet[600], // #9333ea component accent
    accentHover: brandPrimitives.violet[700], // #7e22ce
    accentPressed: brandPrimitives.violet[750], // #6b21a8
    subtle: brandPrimitives.violet[100], // #f3e8ff
    border: brandPrimitives.violet[200], // #e9d5ff
  },
  action: {
    primary: neutralPrimitives[950], // #0a0a0a
    primaryHover: '#171717',
    primaryText: neutralPrimitives[0], // #ffffff
    brand: brandPrimitives.violet[600], // #9333ea
    brandHover: brandPrimitives.violet[700], // #7e22ce
    brandPressed: brandPrimitives.violet[750], // #6b21a8 WCAG AA compliant pressed state (8.84:1 on white)
    brandText: neutralPrimitives[0],
    secondary: '#eff0ed', // WIEZ Material & Surface Lab tactile paper
    secondaryHover: '#e1e4de',
    secondaryText: '#252824',
    outline: 'transparent',
    outlineBorder: '#e2e8f0',
    outlineText: neutralPrimitives[950],
    ghost: 'transparent',
    ghostHover: 'rgba(147, 51, 234, 0.08)',
    ghostText: '#475569',
    danger: feedbackPrimitives.error.light,
    dangerHover: feedbackPrimitives.error.dark,
    dangerText: neutralPrimitives[0],
    disabled: '#edf0f5',
    disabledText: '#9aa5b5',
    disabledBorder: '#dce2ec',
  },
  focus: {
    ring: brandPrimitives.violet[600], // #9333ea WCAG SC 1.4.11 compliant focus ring
  },
  surface: {
    page: neutralPrimitives[50], // #f8fafc quiet neutral off-white baseline canvas
    card: neutralPrimitives[0], // #ffffff crisp white content card
    subtle: neutralPrimitives[100], // #f1f5f9 calm neutral subtle surface
    recessed: neutralPrimitives[100], // #f1f5f9 recessed well (search, inbound chat, headers)
    elevated: neutralPrimitives[0], // #ffffff elevated popover/menu surface
    modal: neutralPrimitives[0], // #ffffff clean modal panel
    stage: '#080a0f', // deep runway matte preserved
    overlay: 'rgba(15, 23, 42, 0.40)',
  },
  text: {
    primary: neutralPrimitives[950], // #0a0a0a
    secondary: neutralPrimitives[600], // #475569 (7.58:1 on #fff, 7.24:1 on #f8fafc)
    muted: '#525f72', // 6.48:1 on #fff, 5.92:1 on #f1f5f9
    placeholder: '#5e6b7e', // 5.41:1 on #fff, 5.17:1 on #f8fafc, 4.94:1 on #f1f5f9 (WCAG AA)
    disabled: '#9aa5b5',
    inverse: neutralPrimitives[0],
  },
  border: {
    default: neutralPrimitives[200], // #e2e8f0
    subtle: neutralPrimitives[200], // #e2e8f0
    strong: neutralPrimitives[300], // #cbd5e1
    input: '#cfcfcf',
    inputHover: '#9ca3af',
  },
  status: {
    success: feedbackPrimitives.success.light,
    warning: feedbackPrimitives.warning.light,
    error: feedbackPrimitives.error.light,
    info: feedbackPrimitives.info.light,
  },
  button: {
    surface: {
      primary: neutralPrimitives[950], // #0a0a0a
      primaryPressed: '#171717',
      brand: brandPrimitives.violet[600], // #9333ea
      brandPressed: brandPrimitives.violet[750], // #6b21a8 WCAG AA compliant pressed state
      secondary: '#e1e4de', // approved Material & Surface Lab paper/stone
      secondaryPressed: '#d8ded4',
      outline: 'transparent',
      outlinePressed: '#f5f5f4',
      danger: feedbackPrimitives.error.light,
      dangerPressed: '#b91c1c',
      disabled: '#edf0f5',
    },
    text: {
      primary: neutralPrimitives[0], // #ffffff
      brand: neutralPrimitives[0],
      secondary: '#273329', // approved Material & Surface Lab ink
      outline: neutralPrimitives[950],
      danger: neutralPrimitives[0],
      disabled: '#9aa5b5',
    },
    border: {
      secondaryTop: '#bbc2b9', // resting shadow border bevel
      secondaryBottom: '#ffffff', // resting reflection highlight bevel
      secondaryTopPressed: '#9ba398', // deepened pressed shadow border
      secondaryBottomPressed: '#e1e4de', // dimmed pressed reflection
      outline: '#e5e5e5',
      outlinePressed: '#d4d4d4',
      disabled: '#dce2ec',
    },
    tactile: {
      primaryOverlay: ['rgba(0, 0, 0, 0.30)', 'transparent'] as const,
      secondaryRestOverlay: ['rgba(0, 0, 0, 0.08)', 'transparent'] as const,
      secondaryPressedOverlay: ['rgba(0, 0, 0, 0.22)', 'transparent'] as const,
      outlineOverlay: ['rgba(0, 0, 0, 0.12)', 'transparent'] as const,
    },
  },
};

export const darkSemanticTokens: SemanticColors = {
  brand: {
    mark: brandPrimitives.violet[500], // #af87f4 canonical on-dark mark
    markOnDark: brandPrimitives.violet[500],
    markStrong: brandPrimitives.violet[400],
    accent: brandPrimitives.violet[600], // #9333ea
    accentHover: brandPrimitives.violet[400], // #c084fc
    accentPressed: brandPrimitives.violet[700],
    subtle: 'rgba(175, 135, 244, 0.12)',
    border: 'rgba(175, 135, 244, 0.24)',
  },
  action: {
    primary: '#fafafa',
    primaryHover: neutralPrimitives[0],
    primaryText: neutralPrimitives[950],
    brand: brandPrimitives.violet[600],
    brandHover: brandPrimitives.violet[700],
    brandPressed: brandPrimitives.violet[500], // #af87f4 approved lighter violet
    brandText: neutralPrimitives[0],
    secondary: '#171e29',
    secondaryHover: '#1f2733',
    secondaryText: '#e2e8f0',
    outline: 'transparent',
    outlineBorder: 'rgba(255, 255, 255, 0.10)',
    outlineText: '#fafafa',
    ghost: 'transparent',
    ghostHover: 'rgba(255, 255, 255, 0.08)',
    ghostText: '#d4d0cb',
    danger: feedbackPrimitives.error.light,
    dangerHover: feedbackPrimitives.error.dark,
    dangerText: neutralPrimitives[0],
    disabled: '#171e29',
    disabledText: '#6b7789',
    disabledBorder: '#232c3a',
  },
  focus: {
    ring: brandPrimitives.violet[400],
  },
  surface: {
    page: '#000000',
    card: '#160e28', // rich deep violet Lumina velvet
    subtle: '#1a1030',
    recessed: '#110a20',
    elevated: '#1e1338', // luminous violet plate
    modal: '#160e28',
    stage: '#080a0f',
    overlay: 'rgba(0, 0, 0, 0.75)',
  },
  text: {
    primary: '#fafafa',
    secondary: '#d4d0cb',
    muted: '#9d968f',
    placeholder: '#69758a',
    disabled: '#6b7789',
    inverse: neutralPrimitives[950],
  },
  border: {
    default: 'rgba(255, 255, 255, 0.055)',
    subtle: 'rgba(255, 255, 255, 0.035)',
    strong: 'rgba(255, 255, 255, 0.10)',
    input: 'rgba(255, 255, 255, 0.13)',
    inputHover: 'rgba(255, 255, 255, 0.24)',
  },
  status: {
    success: feedbackPrimitives.success.light,
    warning: feedbackPrimitives.warning.light,
    error: feedbackPrimitives.error.light,
    info: feedbackPrimitives.info.light,
  },
  button: {
    surface: {
      primary: '#fafafa',
      primaryPressed: neutralPrimitives[0],
      brand: brandPrimitives.violet[600], // #9333ea unified default purple across themes
      brandPressed: brandPrimitives.violet[500], // #af87f4 approved lighter violet
      secondary: '#1c1c1c', // approved dark Material & Surface Lab stone
      secondaryPressed: '#121212',
      outline: 'transparent',
      outlinePressed: '#27272a',
      danger: feedbackPrimitives.error.light,
      dangerPressed: '#991b1b',
      disabled: '#171e29',
    },
    text: {
      primary: neutralPrimitives[950],
      brand: neutralPrimitives[0], // #ffffff high-contrast text on #9333ea
      secondary: '#f4f4f5',
      outline: '#fafafa',
      danger: neutralPrimitives[0],
      disabled: '#6b7789',
    },
    border: {
      secondaryTop: '#0d0d0d',
      secondaryBottom: '#262626',
      secondaryTopPressed: '#000000',
      secondaryBottomPressed: '#1c1c1c',
      outline: 'rgba(255, 255, 255, 0.10)',
      outlinePressed: 'rgba(255, 255, 255, 0.20)',
      disabled: '#232c3a',
    },
    tactile: {
      primaryOverlay: ['rgba(0, 0, 0, 0.45)', 'transparent'] as const,
      secondaryRestOverlay: ['rgba(0, 0, 0, 0.20)', 'transparent'] as const,
      secondaryPressedOverlay: ['rgba(0, 0, 0, 0.50)', 'transparent'] as const,
      outlineOverlay: ['rgba(0, 0, 0, 0.20)', 'transparent'] as const,
    },
  },
};

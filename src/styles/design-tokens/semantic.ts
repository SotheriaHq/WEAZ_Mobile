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
}

export const lightSemanticTokens: SemanticColors = {
  brand: {
    mark: brandPrimitives.violet[800], // #6015e2 canonical identity
    markOnDark: brandPrimitives.violet[500], // #af87f4
    markStrong: brandPrimitives.violet[900], // #4e11b8
    accent: brandPrimitives.violet[600], // #9333ea component accent
    accentHover: brandPrimitives.violet[700], // #7e22ce
    accentPressed: brandPrimitives.violet[900],
    subtle: brandPrimitives.violet[100], // #f3e8ff
    border: brandPrimitives.violet[200], // #e9d5ff
  },
  action: {
    primary: neutralPrimitives[950], // #0a0a0a
    primaryHover: '#171717',
    primaryText: neutralPrimitives[0], // #ffffff
    brand: brandPrimitives.violet[600], // #9333ea
    brandHover: brandPrimitives.violet[700], // #7e22ce
    brandPressed: brandPrimitives.violet[900],
    brandText: neutralPrimitives[0],
    secondary: '#eff0ed', // WIEZ Material & Surface Lab tactile paper
    secondaryHover: '#e1e4de',
    secondaryText: '#252824',
    outline: 'transparent',
    outlineBorder: '#e5e5e5',
    outlineText: neutralPrimitives[950],
    ghost: 'transparent',
    ghostHover: 'rgba(147, 51, 234, 0.08)',
    ghostText: '#44403c',
    danger: feedbackPrimitives.error.light,
    dangerHover: feedbackPrimitives.error.dark,
    dangerText: neutralPrimitives[0],
    disabled: '#edf0f5',
    disabledText: '#9aa5b5',
    disabledBorder: '#dce2ec',
  },
  focus: {
    ring: brandPrimitives.violet[400], // #c084fc
  },
  surface: {
    page: neutralPrimitives[0], // #ffffff
    card: '#f5f5f4', // warm gray
    subtle: '#e7e5e4',
    recessed: '#eff0ed',
    elevated: neutralPrimitives[0],
    modal: '#eff0ed',
    stage: '#080a0f', // deep runway matte preserved
    overlay: 'rgba(8, 15, 26, 0.35)',
  },
  text: {
    primary: neutralPrimitives[950], // #0a0a0a
    secondary: '#44403c', // stone-700
    muted: '#6b6560',
    placeholder: '#98a4b8',
    disabled: '#9aa5b5',
    inverse: neutralPrimitives[0],
  },
  border: {
    default: '#e5e5e5',
    subtle: '#f1f5f9',
    strong: '#d4d4d4',
    input: '#cfcfcf',
    inputHover: '#9ca3af',
  },
  status: {
    success: feedbackPrimitives.success.light,
    warning: feedbackPrimitives.warning.light,
    error: feedbackPrimitives.error.light,
    info: feedbackPrimitives.info.light,
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
    brandPressed: brandPrimitives.violet[900],
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
    page: '#0a0a0a',
    card: '#141414',
    subtle: '#1c1c1c',
    recessed: '#111620',
    elevated: '#202938',
    modal: '#111620',
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
};

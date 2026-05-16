export const DESIGN_MEDIA_REQUIRED_SLOTS = ['Front', 'Back', 'Left', 'Right'] as const;
export const DESIGN_MEDIA_OPTIONAL_SLOTS = ['Extra 1', 'Extra 2'] as const;
export const DESIGN_MEDIA_SLOTS = [
  ...DESIGN_MEDIA_REQUIRED_SLOTS,
  ...DESIGN_MEDIA_OPTIONAL_SLOTS,
] as const;

export const DESIGN_REQUIRED_MEDIA_COUNT = DESIGN_MEDIA_REQUIRED_SLOTS.length;
export const DESIGN_EDITOR_MAX_MEDIA = DESIGN_MEDIA_SLOTS.length;

export const DESIGN_SIZING_LABELS = {
  NONE: 'No size specification',
  RTW: 'Ready-to-Wear only',
  RTW_PLUS_FITTINGS: 'Ready-to-Wear + fittings',
  CUSTOM: 'Custom only',
} as const;

export const DESIGN_AUDIENCE_LABELS = {
  EVERYBODY: 'Unisex / Everybody',
  FEMALE: 'Womenswear',
  MALE: 'Menswear',
} as const;

export const DESIGN_VISIBILITY_LABELS = {
  PUBLIC: 'Everyone',
  PRIVATE: 'Only me',
} as const;

export const DESIGN_FIT_PREFERENCE_LABELS = {
  SLIM: 'Slim',
  REGULAR: 'Regular',
  LOOSE: 'Loose',
  OVERSIZED: 'Oversized',
} as const;

export const DESIGN_TARGET_AGE_LABELS = {
  ADULT: 'Adult',
  CHILD: 'Kids',
} as const;

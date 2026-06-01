export type BackendMediaViewSlot =
  | 'FRONT'
  | 'BACK'
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'DETAIL'
  | 'ON_MODEL'
  | 'FABRIC_DETAIL'
  | 'OTHER';
export type MediaViewSlot = BackendMediaViewSlot | 'INSPIRATION';

export const REQUIRED_MEDIA_VIEW_SLOTS = ['FRONT', 'BACK', 'LEFT_SIDE', 'RIGHT_SIDE'] as const;
export const MEDIA_VIEW_SLOT_OPTIONS: Array<{ value: MediaViewSlot; label: string; required?: boolean }> = [
  { value: 'FRONT', label: 'Front', required: true },
  { value: 'BACK', label: 'Back', required: true },
  { value: 'LEFT_SIDE', label: 'Left Side', required: true },
  { value: 'RIGHT_SIDE', label: 'Right Side', required: true },
  { value: 'DETAIL', label: 'Detail' },
  { value: 'ON_MODEL', label: 'On Model' },
  { value: 'FABRIC_DETAIL', label: 'Fabric Detail' },
  { value: 'INSPIRATION', label: 'Inspiration' },
  { value: 'OTHER', label: 'Other' },
];

const MEDIA_VIEW_SLOT_LABELS = MEDIA_VIEW_SLOT_OPTIONS.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export const DESIGN_MEDIA_REQUIRED_SLOTS = ['Front', 'Back', 'Left Side', 'Right Side'] as const;
export const DESIGN_MEDIA_OPTIONAL_SLOTS = ['Detail', 'On Model'] as const;
export const DESIGN_MEDIA_SLOTS = [
  ...DESIGN_MEDIA_REQUIRED_SLOTS,
  ...DESIGN_MEDIA_OPTIONAL_SLOTS,
] as const;

export const DESIGN_REQUIRED_MEDIA_COUNT = DESIGN_MEDIA_REQUIRED_SLOTS.length;
export const DESIGN_EDITOR_MAX_MEDIA = DESIGN_MEDIA_SLOTS.length;

export function normalizeMediaViewSlot(value?: string | null): MediaViewSlot | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (raw === 'LEFT') return 'LEFT_SIDE';
  if (raw === 'RIGHT') return 'RIGHT_SIDE';
  return MEDIA_VIEW_SLOT_OPTIONS.some((option) => option.value === raw)
    ? (raw as MediaViewSlot)
    : null;
}

export function toBackendMediaViewSlot(value?: string | null): BackendMediaViewSlot {
  const slot = normalizeMediaViewSlot(value);
  if (!slot || slot === 'INSPIRATION') return 'OTHER';
  return slot;
}

export function getMediaViewSlotLabel(value?: string | null): string {
  const slot = normalizeMediaViewSlot(value);
  return slot ? MEDIA_VIEW_SLOT_LABELS[slot] ?? 'Other' : 'Other';
}

export function getMissingRequiredMediaSlots(
  assets: Array<{ viewSlot?: string | null }>,
): BackendMediaViewSlot[] {
  const present = new Set(
    assets
      .map((asset) => normalizeMediaViewSlot(asset.viewSlot))
      .filter((slot): slot is MediaViewSlot => Boolean(slot)),
  );
  return REQUIRED_MEDIA_VIEW_SLOTS.filter((slot) => !present.has(slot));
}

export type ContentPublicationStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'FAILED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'REMOVED';

export function getContentStatusLabel(status?: string | null): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'IN_REVIEW':
      return 'In Review';
    case 'CHANGES_REQUESTED':
      return 'Changes Requested';
    case 'REJECTED':
      return 'Rejected';
    case 'FAILED':
      return 'Review Failed';
    case 'PUBLISHED':
      return 'Published';
    case 'ARCHIVED':
      return 'Archived';
    case 'REMOVED':
      return 'Removed';
    default:
      return 'Draft';
  }
}

export const DESIGN_SIZING_LABELS = {
  NONE: 'No size specification',
  RTW: 'No size specification',
  RTW_PLUS_FITTINGS: 'Custom order',
  CUSTOM: 'Custom order only',
} as const;

export const DESIGN_CREATION_SIZING_OPTIONS = ['CUSTOM', 'NONE'] as const;

export type DesignCreationSizingMode = (typeof DESIGN_CREATION_SIZING_OPTIONS)[number];

export function normalizeDesignCreationSizingMode(value?: string | null): DesignCreationSizingMode {
  if (value === 'CUSTOM' || value === 'RTW_PLUS_FITTINGS') {
    return 'CUSTOM';
  }
  return 'NONE';
}

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

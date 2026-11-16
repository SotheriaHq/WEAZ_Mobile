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

export function isImageDesignMediaAsset(asset: { mediaKind?: string | null; mimeType?: string | null }) {
  const mediaKind = String(asset.mediaKind ?? '').toLowerCase();
  const mimeType = String(asset.mimeType ?? '').toLowerCase();
  if (mediaKind) return mediaKind === 'image';
  return mimeType.startsWith('image/');
}

export function getMissingRequiredImageMediaSlots(
  assets: Array<{ viewSlot?: string | null; mediaKind?: string | null; mimeType?: string | null }>,
): BackendMediaViewSlot[] {
  return REQUIRED_MEDIA_VIEW_SLOTS.filter(
    (slot) =>
      !assets.some(
        (asset) =>
          normalizeMediaViewSlot(asset.viewSlot) === slot &&
          isImageDesignMediaAsset(asset),
      ),
  );
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

/**
 * Rush fee ceiling, mirroring the backend guardrail in
 * custom-order-configurations.service (RUSH_FEE_CAP_EXCEEDED): the rush fee may
 * be at most 70% of the estimated outfit subtotal before delivery, i.e.
 * base production charge + (largest rule yardage x fabric cost per yard).
 *
 * Checked inline in the composer and before Preview, so a creator can never
 * reach Review (or a failed upload in Needs Attention) with a fee the server
 * will reject. Returns null when there is no estimate yet (the backend also
 * skips the cap when the estimate is 0).
 */
export const RUSH_FEE_CAP_RATIO = 0.7;

export function getRushFeeCap(input: {
  baseProductionCharge: string;
  fabricCostPerYard: string;
  outputYards: Array<string | number | null | undefined>;
}): number | null {
  const base = Number(input.baseProductionCharge);
  const fabric = Number(input.fabricCostPerYard);
  if (!input.baseProductionCharge.trim() || !Number.isFinite(base)) return null;
  if (!input.fabricCostPerYard.trim() || !Number.isFinite(fabric)) return null;
  const maxYards = input.outputYards.reduce<number>((max, value) => {
    const yards = Number(value);
    return Number.isFinite(yards) ? Math.max(max, yards) : max;
  }, 0);
  const estimate = base + maxYards * fabric;
  if (!(estimate > 0)) return null;
  // Floor to whole naira so the shown maximum is always accepted by the server.
  return Math.floor(estimate * RUSH_FEE_CAP_RATIO);
}

/** "₦12,600": whole naira with thousands separators (no Intl dependency). */
export function formatNaira(value: number): string {
  return `₦${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** A stored zero price shows as an empty field (placeholder), never a literal "0". */
export function blankZeroAmount(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value).trim();
  return text !== '' && Number(text) === 0 ? '' : text;
}

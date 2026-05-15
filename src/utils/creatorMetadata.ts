export type CreatorAudience = 'FEMALE' | 'MALE' | 'EVERYBODY';

export const CREATOR_AUDIENCE_OPTIONS: Array<{ value: CreatorAudience; label: string }> = [
  { value: 'EVERYBODY', label: 'Everyone / Unisex' },
  { value: 'FEMALE', label: 'Women' },
  { value: 'MALE', label: 'Men' },
];

export const CREATOR_FILTER_DIMENSION_ORDER = [
  'style',
  'heritage',
  'occasion',
  'fabric',
  'color-family',
  'fit',
] as const;

export const LEGACY_DISCOVERY_DIMENSION_SLUGS = new Set([
  'fabric-type',
  'fit-shape',
  'designer-location',
  'price-range',
]);

export const CREATOR_FILTER_DIMENSION_LABELS: Record<string, string> = {
  style: 'Style details',
  heritage: 'Cultural vibe',
  occasion: 'Where would you wear it?',
  fabric: 'Fabric',
  'color-family': 'Color family',
  fit: 'Fit',
};

export const CREATOR_METADATA_HELP = {
  audience:
    'Choose the people this item is mainly designed for. This helps buyers discover styles that fit them.',
  style:
    'Pick the visual style of this look, such as casual, corporate, luxury, modest, or statement.',
  heritage:
    'Add cultural or heritage signals like Ankara, Aso Ebi, Adire, or African-inspired.',
  occasion:
    'Choose the occasions this look fits, such as wedding, office, party, church, or everyday wear.',
  hashtags: 'Add searchable social tags. Use words buyers may search for.',
  visibility: 'Choose whether this is visible to everyone or kept private while you work.',
} as const;

const CREATOR_FILTER_DIMENSION_HELP: Record<string, string> = {
  style: CREATOR_METADATA_HELP.style,
  heritage: CREATOR_METADATA_HELP.heritage,
  occasion: CREATOR_METADATA_HELP.occasion,
  fabric: 'Choose the main material or textile used in this look.',
  'color-family': 'Choose the main color family buyers would recognize.',
  fit: 'Choose how the item is intended to sit on the body.',
};

const TECHNICAL_ERROR_LABELS: Array<{ keywords: string[]; message: string }> = [
  {
    keywords: ['subcategoryid', 'categorytypeid', 'garment type', 'subcategory'],
    message: 'Choose a garment type.',
  },
  {
    keywords: ['categoryid', 'category', 'what this item'],
    message: 'Choose what this item is.',
  },
  {
    keywords: ['filtervalueids', 'filterdimension', 'entityfilter', 'style details', 'filter value', 'discovery'],
    message: 'Add at least one style detail.',
  },
  {
    keywords: ['hashtag', 'tags', 'tag'],
    message: 'Add at least one hashtag.',
  },
  {
    keywords: ['audience', 'gender', 'type'],
    message: 'Choose who this item is for.',
  },
];

export function getAudienceLabel(value?: string | null) {
  return CREATOR_AUDIENCE_OPTIONS.find((option) => option.value === value)?.label ?? 'Everyone / Unisex';
}

export function getDiscoveryDimensionLabel(slug?: string | null, fallbackName?: string | null) {
  if (slug && CREATOR_FILTER_DIMENSION_LABELS[slug]) {
    return CREATOR_FILTER_DIMENSION_LABELS[slug];
  }
  return fallbackName?.trim() || 'Style details';
}

export function getDiscoveryDimensionHelp(slug?: string | null) {
  if (!slug) return undefined;
  return CREATOR_FILTER_DIMENSION_HELP[slug];
}

export function getSelectedFilterValueIds(selection: Record<string, string[]> | null | undefined) {
  return Array.from(
    new Set(
      Object.values(selection ?? {})
        .flat()
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  );
}

export function normalizeHashtagLabel(tag: string) {
  const normalized = tag.trim().replace(/^#+/, '');
  return normalized ? `#${normalized}` : '#';
}

export function isLegacyDiscoveryDimensionSlug(slug?: string | null) {
  return Boolean(slug && LEGACY_DISCOVERY_DIMENSION_SLUGS.has(slug));
}

export function getDiscoveryDimensionSortIndex(slug?: string | null) {
  const order = CREATOR_FILTER_DIMENSION_ORDER as readonly string[];
  const index = slug ? order.indexOf(slug) : -1;
  return index >= 0 ? index : CREATOR_FILTER_DIMENSION_ORDER.length;
}

export function mapCreatorMetadataError(raw: unknown, fallback = 'Please check the required metadata.') {
  const message = Array.isArray(raw)
    ? raw.join(', ')
    : typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : fallback;
  const normalized = message.toLowerCase();
  const match = TECHNICAL_ERROR_LABELS.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword)),
  );
  return match?.message ?? message ?? fallback;
}

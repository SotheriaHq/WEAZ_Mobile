export type BrandTagOption = {
  label: string;
  value: string;
};

/**
 * How many tags a brand profile may carry. Must match the API's
 * `BRAND_PROFILE_TAG_LIMIT` (`bthreadly/src/brands/dto/update-brand-profile.dto.ts`)
 * and web's `BRAND_TAG_SELECTION_LIMIT` — the editor used to allow 10, and the
 * 8th tag turned every save into a 400 with no field-level explanation.
 */
export const BRAND_TAG_SELECTION_LIMIT = 7;

const makeOption = (label: string): BrandTagOption => ({
  label,
  value: label,
});

export const BRAND_TAG_OPTIONS: BrandTagOption[] = [
  'Ankara',
  'Atelier',
  'Bridal',
  'Casual',
  'Couture',
  'Ethical',
  'Eveningwear',
  'Handmade',
  'Heritage',
  'Jewelry',
  'Kidswear',
  'Luxury',
  'Menswear',
  'Minimalist',
  'PlusSize',
  'ReadyToWear',
  'Resort',
  'Streetwear',
  'Sustainable',
  'Womenswear',
].map(makeOption);

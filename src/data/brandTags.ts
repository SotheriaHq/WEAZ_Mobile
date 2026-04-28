export type BrandTagOption = {
  label: string;
  value: string;
};

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

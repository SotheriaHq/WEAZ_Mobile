import { env } from '@/src/config/env';

export const PRODUCT_NAME = 'WEAZ';
export const MOBILE_APP_NAME = PRODUCT_NAME;
export const PRODUCT_NAME_FORMER = 'Threadly';
export const PRODUCT_TAGLINE = 'When you think WEARS, you think WEAZ.';
export const PRODUCT_LOGO_TAGLINE = 'JUST WEAR';
export const PUBLIC_WEB_URL =
  env.webAppUrl || '[PRODUCT CONFIRMATION NEEDED]';
export const SUPPORT_EMAIL = '[PRODUCT CONFIRMATION NEEDED]';
export const LEGAL_EMAIL = '[PRODUCT CONFIRMATION NEEDED]';
export const LOGO_ACCESSIBILITY_LABEL = `${PRODUCT_NAME} logo`;

export const LOGO_ASSET_PATHS = {
  mark: 'assets/brand/weaz-logo-mark.svg',
  wordmark: 'assets/brand/weaz-wordmark.svg',
  lockup: 'assets/brand/weaz-logo-lockup.svg',
} as const;

export const BRAND_PALETTE = {
  deepNavy: '#16233f',
  softNavy: '#4b5670',
  metallicGold: '#d8b24a',
  highlightGold: '#fff1a8',
  burnishedGold: '#9f6419',
} as const;

export const LEGAL_DISPLAY_LABELS = {
  legalIndex: 'Legal',
  terms: 'Terms and Conditions',
  privacy: 'Privacy Policy',
  cookies: 'Cookie and Tracking Policy',
  communityGuidelines: 'Community Guidelines',
  sellerTerms: 'Seller and Brand Terms',
  buyerPolicy: 'Buyer Marketplace Policy',
  paymentPolicy: 'Payment, Billing, and Subscription Policy',
  copyrightPolicy: 'Content, IP, and Copyright Policy',
  accountDeletion: 'Account and Data Deletion Policy',
} as const;

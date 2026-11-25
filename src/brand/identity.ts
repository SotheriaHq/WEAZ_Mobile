/**
 * The single source for WIEZ's name, palette and artwork on native.
 *
 * Export names match `fthreadly/src/brand/identity.ts` and
 * `bthreadly/src/common/branding/product-identity.constants.ts` exactly, so a
 * value can be grepped across all three repos. They cannot import each other —
 * three separate git repos, no shared package — so the guarantee is a pinning
 * test per repo rather than a build-time one.
 *
 * This replaced `src/config/productIdentity.ts`, which exported the product
 * name twice (`PRODUCT_NAME`, `MOBILE_APP_NAME`), a `@deprecated` former name
 * that was set to the current name, and `LOGO_ASSET_PATHS` pointing at three
 * SVGs that nothing had ever imported.
 */

/** The product name. There is no former name to surface anywhere. */
export const PRODUCT_NAME = 'ARU';

export const PRODUCT_SLOGAN = 'Just wear';

export const PRODUCT_TAGLINE = 'When you think WEARS, you think ARU.';

export const PRODUCT_CATEGORY = 'African fashion social commerce marketplace';

export const LOGO_ACCESSIBILITY_LABEL = `${PRODUCT_NAME} logo`;

/**
 * The brand palette, as actually painted.
 *
 * `primary` and `onDark` are a deliberate pair, not two shades of one colour:
 * `primary` clears white at 7.8:1 and `onDark` clears the night ground at
 * 7.1:1, and neither survives on the other side — `primary` sits at 1.9:1 on
 * ink. The old mark ignored that and dissolved on the dark theme. The figures
 * are asserted in scripts/test-product-identity-contract.js.
 */
export const BRAND_COLORS = {
  primary: '#6015e2',
  primaryStrong: '#4e11b8',
  onDark: '#af87f4',
  soft: '#a97ef3',
  ink: '#0c0b11',
} as const;

/**
 * Statically analyzable relative asset imports for Expo/Metro bundler.
 * Uses official ARU brand assets with backward compatibility mirrors.
 */
export const BRAND_ASSETS = {
  markLight: require('../../assets/images/aru-mark-light.png'),
  markDark: require('../../assets/images/aru-mark-dark.png'),
  loaderMarkLight: require('../../assets/images/aru-loader-mark-light.png'),
  loaderMarkDark: require('../../assets/images/aru-loader-mark-dark.png'),
  icon: require('../../assets/images/aru-icon.png'),
  adaptiveIcon: require('../../assets/images/aru-adaptive-icon.png'),
  favicon: require('../../assets/images/aru-favicon.png'),
  splashLight: require('../../assets/images/aru-splash-icon.png'),
  splashDark: require('../../assets/images/aru-splash-icon-dark.png'),
  wordmarkLight: require('../../assets/images/aru-wordmark-light.png'),
  wordmarkDark: require('../../assets/images/aru-wordmark-dark.png'),
  wordmarkSloganLight: require('../../assets/images/aru-wordmark-slogan-light.png'),
  wordmarkSloganDark: require('../../assets/images/aru-wordmark-slogan-dark.png'),
} as const;

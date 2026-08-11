const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { compile, createScriptRequire } = require('./helpers/mobile-script-require');

const repoRoot = path.resolve(__dirname, '..');
const brandApiPath = path.join(repoRoot, 'src', 'api', 'BrandApi.ts');
const imageUriPath = path.join(repoRoot, 'src', 'hooks', 'useResolvedImageUri.ts');
const formatCountPath = path.join(repoRoot, 'src', 'utils', 'formatCount.ts');
const catalogPath = path.join(repoRoot, 'app', '(tabs)', 'catalog', 'index.tsx');
const badgePath = path.join(repoRoot, 'components', 'catalog', 'ProfileBadge.tsx');
const appBadgePath = path.join(repoRoot, 'components', 'ui', 'AppBadge.tsx');
const brandHeaderPath = path.join(repoRoot, 'components', 'catalog', 'BrandProfileHeader.tsx');
const socialLinksPath = path.join(repoRoot, 'src', 'utils', 'socialLinks.ts');
const editProfilePath = path.join(repoRoot, 'app', '(tabs)', 'catalog', 'edit-profile.tsx');
const studioWebViewPath = path.join(repoRoot, 'app', '(tabs)', 'studio', 'webview.tsx');
const brandTagsPath = path.join(repoRoot, 'src', 'data', 'brandTags.ts');
const brandTagDtoPath = path.join(
  repoRoot,
  '..',
  'bthreadly',
  'src',
  'brands',
  'dto',
  'update-brand-profile.dto.ts',
);

function loadBrandApiWithMock(mockApiClient) {
  const module = { exports: {} };
  const scriptRequire = createScriptRequire({
    repoRoot,
    mocks: {
      './httpClient': { apiClient: mockApiClient },
      '@/src/api/httpClient': { apiClient: mockApiClient },
      '@/src/features/catalog/catalogEntity': {
        resolveCatalogEntityType: (value, fallback = null) => {
          if (value && typeof value === 'object' && typeof value.entityType === 'string') {
            return value.entityType;
          }
          return fallback;
        },
      },
    },
  });
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => scriptRequire(request, brandApiPath),
    console,
  };

  vm.runInNewContext(compile(brandApiPath), sandbox, { filename: brandApiPath });
  return module.exports;
}

function loadFormatCount() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: createScriptRequire({ repoRoot }),
  };

  vm.runInNewContext(compile(formatCountPath), sandbox, { filename: formatCountPath });
  return module.exports.formatCount;
}

function loadSocialLinks() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: createScriptRequire({ repoRoot }),
  };

  vm.runInNewContext(compile(socialLinksPath), sandbox, { filename: socialLinksPath });
  return module.exports;
}

function loadImageResolverWithMock(mockBrandApi) {
  const module = { exports: {} };
  const queryCalls = [];
  const scriptRequire = createScriptRequire({
    repoRoot,
    mocks: {
      react: {
        useEffect: () => undefined,
        useRef: (value) => ({ current: value }),
        useState: (value) => [typeof value === 'function' ? value() : value, () => undefined],
      },
      'react-native': { Platform: { OS: 'ios' } },
      'expo-image': { Image: { prefetch: async () => true } },
      '@/src/api/BrandApi': { brandApi: mockBrandApi },
      '@/src/features/feed/utils/feedDiagnostics': {
        mediaDevLog: () => undefined,
        mediaDevWarn: () => undefined,
      },
      '@/src/query/queryClient': {
        queryClient: {
          removeQueries: () => undefined,
          fetchQuery: async ({ queryKey, queryFn }) => {
            queryCalls.push(queryKey);
            return queryFn();
          },
        },
      },
      '@/src/query/queryKeys': {
        queryKeys: {
          media: {
            publicUrl: (fileId) => ['media', 'publicUrl', fileId],
            signedUrl: (fileId) => ['media', 'signedUrl', fileId],
          },
        },
      },
    },
  });
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => scriptRequire(request, imageUriPath),
    console,
    URL,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(compile(imageUriPath), sandbox, { filename: imageUriPath });
  return { exports: module.exports, queryCalls };
}

async function main() {
  const calls = [];
  const mockApiClient = {
    get: async (url) => {
      calls.push(url);
      return {
        data: {
          data: {
            id: 'brand-owner-1',
            brandFullName: 'Maison Vant',
            description: 'Luxury menswear.',
            location: 'New York, USA',
            logoImage: 'https://cdn.test/logo.jpg',
            logoImageId: 'logo-file-id',
            logoImageMeta: {
              fileId: 'logo-file-id',
              s3Url: 'https://s3.test/logo.jpg',
              url: 'https://cdn.test/logo.jpg',
            },
            bannerImage: 'https://cdn.test/banner.jpg',
            bannerImageId: 'banner-file-id',
            bannerImageMeta: {
              fileId: 'banner-file-id',
              s3Url: 'https://s3.test/banner.jpg',
              url: 'https://cdn.test/banner.jpg',
            },
            tags: ['menswear', 'sustainable', 'minimalist', 'atelier'],
            isStoreOpen: true,
            storeStatus: 'OPEN',
            emailVerified: true,
            verified: true,
            verificationStatus: 'APPROVED',
            verificationBadgeVisible: true,
            averageRating: 4.9,
            totalReviews: 18,
            collectionsCount: 248,
            designsCount: 248,
            productsCount: 12,
            patchesCount: 12400,
            followersCount: 12400,
            totalThreads: 1800,
            totalLikes: 1800,
            totalShares: null,
            publicProfileUrl: 'https://threadly.test/u/maison-vant',
            qrTargetUrl: 'https://threadly.test/u/maison-vant',
            shareUrl: 'https://threadly.test/u/maison-vant',
          },
        },
      };
    },
  };

  const { brandApi } = loadBrandApiWithMock(mockApiClient);
  const profile = await brandApi.getProfileById('brand-owner-1');

  assert.equal(calls[0], '/brands/brand-owner-1');
  assert.equal(profile.logoImage, 'https://cdn.test/logo.jpg');
  assert.equal(profile.logoImageId, 'logo-file-id');
  assert.equal(profile.logoImageMeta.fileId, 'logo-file-id');
  assert.equal(profile.bannerImage, 'https://cdn.test/banner.jpg');
  assert.equal(profile.bannerImageId, 'banner-file-id');
  assert.equal(profile.bannerImageMeta.fileId, 'banner-file-id');
  assert.equal(profile.storeStatus, 'OPEN');
  assert.equal(profile.emailVerified, true);
  assert.equal(profile.verified, true);
  assert.equal(profile.verificationBadgeVisible, true);
  assert.equal(profile.averageRating, 4.9);
  assert.equal(profile.totalReviews, 18);
  assert.equal(profile.collectionsCount, 248);
  assert.equal(profile.designsCount, 248);
  assert.equal(profile.productsCount, 12);
  assert.equal(profile.followersCount, 12400);
  assert.equal(profile.totalThreads, 1800);
  assert.equal(profile.totalLikes, 1800);
  assert.equal(profile.totalShares, null);
  assert.equal(profile.publicProfileUrl, 'https://threadly.test/u/maison-vant');
  assert.equal(profile.qrTargetUrl, 'https://threadly.test/u/maison-vant');
  assert.equal(profile.shareUrl, 'https://threadly.test/u/maison-vant');

  const resolverCalls = [];
  const { exports: imageResolver } = loadImageResolverWithMock({
    getPublicFileUrl: async (fileId) => {
      resolverCalls.push(['public', fileId]);
      return 'https://signed.example/banner.jpg';
    },
    getPrivateSignedFileUrl: async (fileId) => {
      resolverCalls.push(['private', fileId]);
      return null;
    },
  });
  const resolvedBannerUri = await imageResolver.resolveImageUri({
    src: 'https://voguely.s3.eu-north-1.amazonaws.com/BANNER_IMAGE/brand/banner.jpg',
    fileId: 'banner-file-id',
  });

  assert.equal(resolvedBannerUri, 'https://signed.example/banner.jpg');
  assert.deepEqual(resolverCalls, [['public', 'banner-file-id']]);

  const formatCount = loadFormatCount();
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1200), '1.2K');
  assert.equal(formatCount(12400), '12.4K');
  assert.equal(formatCount(1000000), '1M');

  const catalogSource = fs.readFileSync(catalogPath, 'utf8');
  assert.match(catalogSource, /getBrandBadges\(/);
  assert.match(catalogSource, /const effectiveProfile = profileQuery\.data !== undefined \? profileQuery\.data : profile/);
  assert.match(catalogSource, /effectiveProfile\?\.designsCount/);
  assert.match(catalogSource, /effectiveProfile\?\.collectionsCount/);
  assert.match(catalogSource, /effectiveProfile\?\.followersCount/);
  assert.match(catalogSource, /effectiveProfile\?\.totalThreads/);
  assert.match(catalogSource, /effectiveProfile\?\.totalLikes/);
  assert.match(catalogSource, /label:\s*totalThreads === 1 \? 'Thread' : 'Threads'/);
  assert.doesNotMatch(catalogSource, /label:\s*totalLikes === 1 \? 'Like' : 'Likes'/);
  assert.doesNotMatch(catalogSource, /totalShares.*stats\.push/s);
  assert.match(catalogSource, /effectiveProfile\?\.qrTargetUrl/);
  assert.match(catalogSource, /effectiveProfile\?\.publicProfileUrl/);
  assert.match(catalogSource, /effectiveProfile\?\.shareUrl/);
  assert.match(catalogSource, /buildProfileUrlFromConfig/);
  assert.doesNotMatch(catalogSource, /https:\/\/threadly\.app\/brand/);

  const badgeSource = fs.readFileSync(badgePath, 'utf8');
  assert.match(badgeSource, /brand_verified/);
  assert.match(badgeSource, /store_open/);
  assert.match(badgeSource, /pending_verification/);
  assert.match(badgeSource, /import \{ AppBadge, getStoreBadgeModel, type AppBadgeTone \}/);
  assert.match(badgeSource, /<AppBadge/);
  assert.match(badgeSource, /accessibilityLabel=\{badge\.accessibilityLabel\}/);
  assert.doesNotMatch(badgeSource, /rotate:\s*'45deg'/);

  const appBadgeSource = fs.readFileSync(appBadgePath, 'utf8');
  assert.match(appBadgeSource, /export type AppBadgeTone = 'primary' \| 'success' \| 'warning' \| 'muted' \| 'verified' \| 'neutral'/);
  assert.match(appBadgeSource, /export function getStoreBadgeModel/);
  assert.match(appBadgeSource, /state:\s*'open_verified'/);
  assert.match(appBadgeSource, /state:\s*'closed_verified'/);
  assert.match(appBadgeSource, /borderRadius:\s*tokens\.radius\.md/);
  assert.match(appBadgeSource, /iconBox:/);

  const brandHeaderSource = fs.readFileSync(brandHeaderPath, 'utf8');
  assert.match(brandHeaderSource, /function StoreStatusBadge/);
  assert.match(brandHeaderSource, /Color-only wavy square/);
  assert.match(brandHeaderSource, /storeStatusBadge:[\s\S]*transform:\s*\[\{\s*rotate:\s*'45deg'\s*\}\]/);
  assert.match(brandHeaderSource, /BRAND_DESCRIPTION_PREVIEW_LINES\s*=\s*2/);
  assert.match(brandHeaderSource, /BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH/);
  assert.match(brandHeaderSource, /descriptionMeasureText/);
  assert.match(brandHeaderSource, /See more/);
  assert.match(brandHeaderSource, /See less/);

  // The avatar edit affordance is a bare glyph, not a filled purple disc, and it
  // sits in the bottom-LEFT corner.
  assert.doesNotMatch(
    brandHeaderSource,
    /styles\.avatarEditBadge, \{ backgroundColor: theme\.colors\.primary/,
  );
  assert.match(brandHeaderSource, /avatarEditBadge:[\s\S]*?left: tokens\.spacing\.xs/);
  assert.match(brandHeaderSource, /avatarEditGlyph:[\s\S]*?textShadowColor/);
  // Contact rows (email, website, socials, QR code) read in the body colour.
  assert.doesNotMatch(brandHeaderSource, /QR code[\s\S]{0,80}tone="primary"/);
  assert.match(
    brandHeaderSource,
    /<FontAwesome5 name="qrcode"[\s\S]{0,220}tone="default"/,
  );

  // --- Brand profile save: the payload the API will actually accept ---------
  //
  // Both halves of this were 400s in the field: `@IsUrl()` rejects a bare
  // handle, and `@ArrayMaxSize(BRAND_PROFILE_TAG_LIMIT)` rejects the 8th tag.
  const { normalizeSocialLink, ensureHttps } = loadSocialLinks();

  assert.equal(normalizeSocialLink('instagram', '@maisonvant'), 'https://instagram.com/maisonvant');
  assert.equal(normalizeSocialLink('instagram', 'maisonvant'), 'https://instagram.com/maisonvant');
  assert.equal(normalizeSocialLink('twitter', '@maison'), 'https://x.com/maison');
  assert.equal(normalizeSocialLink('facebook', 'maison.vant'), 'https://facebook.com/maison.vant');
  assert.equal(normalizeSocialLink('website', 'maisonvant.com'), 'https://maisonvant.com');
  // Already-absolute URLs pass through untouched.
  assert.equal(
    normalizeSocialLink('instagram', 'https://instagram.com/maisonvant'),
    'https://instagram.com/maisonvant',
  );
  // Empty stays undefined: the DTO field is optional and '' fails @IsUrl().
  assert.equal(normalizeSocialLink('website', '   '), undefined);
  assert.equal(normalizeSocialLink('website', null), undefined);
  assert.equal(ensureHttps('wiez.com'), 'https://wiez.com');
  for (const platform of ['instagram', 'facebook', 'twitter', 'website']) {
    const value = normalizeSocialLink(platform, '@handle');
    assert.ok(/^https?:\/\//i.test(value), `${platform} must normalize to an absolute URL`);
  }

  // The mobile tag cap must equal the API's, or the save 400s with no field hint.
  const brandTagsSource = fs.readFileSync(brandTagsPath, 'utf8');
  const mobileTagLimit = Number(
    /BRAND_TAG_SELECTION_LIMIT\s*=\s*(\d+)/.exec(brandTagsSource)?.[1],
  );
  const apiTagLimit = Number(
    /BRAND_PROFILE_TAG_LIMIT\s*=\s*(\d+)/.exec(fs.readFileSync(brandTagDtoPath, 'utf8'))?.[1],
  );
  assert.ok(Number.isInteger(mobileTagLimit), 'mobile BRAND_TAG_SELECTION_LIMIT must be a number');
  assert.equal(mobileTagLimit, apiTagLimit);

  const editProfileSource = fs.readFileSync(editProfilePath, 'utf8');
  assert.match(editProfileSource, /socialInstagram: normalizeSocialLink\('instagram'/);
  assert.match(editProfileSource, /socialFacebook: normalizeSocialLink\('facebook'/);
  assert.match(editProfileSource, /socialTwitter: normalizeSocialLink\('twitter'/);
  assert.match(editProfileSource, /socialWebsite: normalizeSocialLink\('website'/);
  assert.match(editProfileSource, /brandTags: form\.brandTags\.slice\(0, BRAND_TAG_SELECTION_LIMIT\)/);
  assert.match(editProfileSource, /maxSelected=\{BRAND_TAG_SELECTION_LIMIT\}/);
  // A 400 must name the field, not hide behind a generic failure line.
  assert.match(editProfileSource, /function getProfileSaveErrorMessage/);
  assert.match(editProfileSource, /toast\.error\(getProfileSaveErrorMessage\(error\)\)/);
  // The tags sheet carries no explanatory subtitle.
  assert.doesNotMatch(editProfileSource, /Pick the specialties that describe this brand/);

  // --- Store setup gating ---------------------------------------------------
  //
  // A brand mid-setup is offered the wizard, never a store it does not have,
  // and the Studio re-checks on entry so a deep link cannot bypass the menu.
  assert.match(catalogSource, /storeSetupComplete === false/);
  assert.match(catalogSource, /title: 'Set up store'/);
  assert.match(catalogSource, /routeKey: 'setup'/);

  const studioSource = fs.readFileSync(studioWebViewPath, 'utf8');
  assert.match(studioSource, /STORE_SETUP_EXEMPT_ROUTES = new Set<StudioRouteKey>\(\['setup', 'essentials'\]\)/);
  assert.match(
    studioSource,
    /storeSetupComplete === false && !STORE_SETUP_EXEMPT_ROUTES\.has\(resolvedRouteKey\)/,
  );
  // The gate sits AHEAD of the warm-session shortcut, otherwise an island hop
  // reaches a gated route through an already-booted WebView.
  assert.ok(
    studioSource.indexOf('STORE_SETUP_EXEMPT_ROUTES.has(resolvedRouteKey)') <
      studioSource.indexOf('// Warm session: island tab switch'),
    'store setup gate must run before the warm-session shortcut',
  );
  // An unknown status must never lock out a brand whose store is live.
  assert.doesNotMatch(studioSource, /storeSetupComplete !== true/);

  console.log('Brand profile contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

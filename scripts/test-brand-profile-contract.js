const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '..');
const brandApiPath = path.join(repoRoot, 'src', 'api', 'BrandApi.ts');
const formatCountPath = path.join(repoRoot, 'src', 'utils', 'formatCount.ts');
const catalogPath = path.join(repoRoot, 'app', 'catalog', 'index.tsx');
const badgePath = path.join(repoRoot, 'components', 'catalog', 'ProfileBadge.tsx');
const brandHeaderPath = path.join(repoRoot, 'components', 'catalog', 'BrandProfileHeader.tsx');

function compile(filePath) {
  return ts.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filePath,
  }).outputText;
}

function loadBrandApiWithMock(mockApiClient) {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === './httpClient' || request === '@/src/api/httpClient') {
        return { apiClient: mockApiClient };
      }
      if (request === '@/src/features/catalog/catalogEntity') {
        return {
          resolveCatalogEntityType: (value, fallback = null) => {
            if (value && typeof value === 'object' && typeof value.entityType === 'string') {
              return value.entityType;
            }
            return fallback;
          },
        };
      }
      return require(request);
    },
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
    require,
  };

  vm.runInNewContext(compile(formatCountPath), sandbox, { filename: formatCountPath });
  return module.exports.formatCount;
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

  const formatCount = loadFormatCount();
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1200), '1.2K');
  assert.equal(formatCount(12400), '12.4K');
  assert.equal(formatCount(1000000), '1M');

  const catalogSource = fs.readFileSync(catalogPath, 'utf8');
  assert.match(catalogSource, /getBrandBadges\(/);
  assert.match(catalogSource, /profile\?\.designsCount/);
  assert.match(catalogSource, /profile\?\.collectionsCount/);
  assert.match(catalogSource, /profile\?\.followersCount/);
  assert.match(catalogSource, /profile\?\.totalThreads/);
  assert.match(catalogSource, /profile\?\.totalLikes/);
  assert.match(catalogSource, /label:\s*totalThreads === 1 \? 'Thread' : 'Threads'/);
  assert.doesNotMatch(catalogSource, /label:\s*totalLikes === 1 \? 'Like' : 'Likes'/);
  assert.doesNotMatch(catalogSource, /totalShares.*stats\.push/s);
  assert.match(catalogSource, /profile\?\.qrTargetUrl/);
  assert.match(catalogSource, /profile\?\.publicProfileUrl/);
  assert.match(catalogSource, /profile\?\.shareUrl/);
  assert.match(catalogSource, /buildProfileUrlFromConfig/);
  assert.doesNotMatch(catalogSource, /https:\/\/threadly\.app\/brand/);

  const badgeSource = fs.readFileSync(badgePath, 'utf8');
  assert.match(badgeSource, /brand_verified/);
  assert.match(badgeSource, /store_open/);
  assert.match(badgeSource, /pending_verification/);
  assert.match(badgeSource, /transform:\s*\[\{\s*rotate:\s*'45deg'\s*\}\]/);

  const brandHeaderSource = fs.readFileSync(brandHeaderPath, 'utf8');
  assert.match(brandHeaderSource, /BRAND_DESCRIPTION_PREVIEW_LINES\s*=\s*2/);
  assert.match(brandHeaderSource, /BRAND_DESCRIPTION_FALLBACK_TOGGLE_LENGTH/);
  assert.match(brandHeaderSource, /descriptionMeasureText/);
  assert.match(brandHeaderSource, /See more/);
  assert.match(brandHeaderSource, /See less/);

  console.log('Brand profile contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

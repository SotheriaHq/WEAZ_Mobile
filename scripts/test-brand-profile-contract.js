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
            productsCount: 12,
            patchesCount: 12400,
            followersCount: 12400,
            totalLikes: 1800,
            totalShares: null,
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
  assert.equal(profile.productsCount, 12);
  assert.equal(profile.followersCount, 12400);
  assert.equal(profile.totalLikes, 1800);
  assert.equal(profile.totalShares, null);

  const formatCount = loadFormatCount();
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1200), '1.2K');
  assert.equal(formatCount(12400), '12.4K');
  assert.equal(formatCount(1000000), '1M');

  const catalogSource = fs.readFileSync(catalogPath, 'utf8');
  assert.match(catalogSource, /getBrandBadges\(/);
  assert.match(catalogSource, /profile\?\.collectionsCount/);
  assert.match(catalogSource, /profile\?\.followersCount/);
  assert.match(catalogSource, /profile\?\.totalLikes/);
  assert.doesNotMatch(catalogSource, /totalShares.*stats\.push/s);

  const badgeSource = fs.readFileSync(badgePath, 'utf8');
  assert.match(badgeSource, /brand_verified/);
  assert.match(badgeSource, /store_open/);
  assert.match(badgeSource, /pending_verification/);
  assert.match(badgeSource, /transform:\s*\[\{\s*rotate:\s*'45deg'\s*\}\]/);

  console.log('Brand profile contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

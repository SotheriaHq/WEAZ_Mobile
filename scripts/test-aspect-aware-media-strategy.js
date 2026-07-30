const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.join(__dirname, '..');
const moduleCache = new Map();

function loadTsModule(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (moduleCache.has(resolvedPath)) return moduleCache.get(resolvedPath).exports;

  const source = fs.readFileSync(resolvedPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: resolvedPath,
  });
  const moduleShim = { exports: {} };
  moduleCache.set(resolvedPath, moduleShim);
  const localRequire = (request) => {
    if (request.startsWith('@/')) {
      return loadTsModule(path.join(projectRoot, request.slice(2) + '.ts'));
    }
    if (request.startsWith('.')) {
      return loadTsModule(path.join(path.dirname(resolvedPath), request + '.ts'));
    }
    return require(request);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText);
  evaluate(moduleShim.exports, localRequire, moduleShim, resolvedPath, path.dirname(resolvedPath));
  return moduleShim.exports;
}

const strategyPath = path.join(projectRoot, 'src', 'components', 'media', 'aspectAwareMediaStrategy.ts');
const moduleShim = { exports: loadTsModule(strategyPath) };

const {
  getContainerAspectBucket,
  getImageAspectClass,
  resolveMediaStrategy,
} = moduleShim.exports;
const {
  RUNWAY_SAFE_COVER_CROP_TOLERANCE,
  resolveRunwayMediaStrategy,
} = loadTsModule(path.join(projectRoot, 'src', 'features', 'feed', 'media', 'runwayMediaStrategy.ts'));
const {
  buildFeedImageCacheKey,
  resolveFeedImageSourcePolicy,
} = loadTsModule(path.join(projectRoot, 'src', 'features', 'feed', 'media', 'feedImageSourcePolicy.ts'));

const bucketAspects = {
  'ultra-tall': 0.4,
  tall: 0.5,
  'standard-tall': 0.6,
  'near-square-portrait': 0.75,
  'square-ish': 1,
  'near-square-landscape': 1.3,
  wide: 1.7,
  'ultra-wide': 2.1,
};

const imageAspects = {
  'ultra-portrait': 0.4,
  portrait: 0.7,
  square: 1,
  landscape: 1.4,
  'ultra-wide': 2,
};

// Phase 10 contract: square media must never share landscape's treatment.
//   • edge        → immersive cover (crop <= 0.28 of the image)
//   • letter-solid → contained image on a clean dominant-color matte (square / non-fitting portrait)
//   • letter-blur  → contained image on a subtle, image-reflective blur (landscape / ultra-wide)
const matrix = {
  // Portrait media only edge-fills when the cover crop stays within tolerance
  // (<= 0.28). Beyond that it contains on the solid matte — cover-filling badly
  // mismatched portrait media hid 30%+ of near-square shots off-screen.
  'ultra-portrait': {
    'ultra-tall': 'edge',
    tall: 'edge',
    'standard-tall': 'letter-solid',
    'near-square-portrait': 'letter-solid',
    'square-ish': 'letter-solid',
    'near-square-landscape': 'letter-solid',
    wide: 'letter-solid',
    'ultra-wide': 'letter-solid',
  },
  portrait: {
    'ultra-tall': 'letter-solid',
    tall: 'letter-solid',
    'standard-tall': 'edge',
    'near-square-portrait': 'edge',
    'square-ish': 'letter-solid',
    'near-square-landscape': 'letter-solid',
    wide: 'letter-solid',
    'ultra-wide': 'letter-solid',
  },
  square: {
    'ultra-tall': 'letter-soft',
    tall: 'letter-soft',
    'standard-tall': 'letter-soft',
    'near-square-portrait': 'edge',
    'square-ish': 'edge',
    'near-square-landscape': 'edge',
    wide: 'letter-soft',
    'ultra-wide': 'letter-soft',
  },
  landscape: {
    'ultra-tall': 'letter-blur',
    tall: 'letter-blur',
    'standard-tall': 'letter-blur',
    'near-square-portrait': 'letter-blur',
    'square-ish': 'letter-blur',
    'near-square-landscape': 'edge',
    wide: 'edge',
    'ultra-wide': 'letter-blur',
  },
  'ultra-wide': {
    'ultra-tall': 'letter-blur',
    tall: 'letter-blur',
    'standard-tall': 'letter-blur',
    'near-square-portrait': 'letter-blur',
    'square-ish': 'letter-blur',
    'near-square-landscape': 'letter-blur',
    wide: 'edge',
    'ultra-wide': 'edge',
  },
};

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) {
    failures.push(`${name}: expected ${expected}, received ${actual}`);
  }
}

for (const [bucket, aspect] of Object.entries(bucketAspects)) {
  check(`bucket ${bucket}`, getContainerAspectBucket(aspect), bucket);
}

for (const [imageClass, aspect] of Object.entries(imageAspects)) {
  check(`image class ${imageClass}`, getImageAspectClass(aspect), imageClass);
}

for (const [imageClass, byBucket] of Object.entries(matrix)) {
  for (const [bucket, expected] of Object.entries(byBucket)) {
    const containerAspect = bucketAspects[bucket];
    const imageAspect = imageAspects[imageClass];
    const actual = resolveMediaStrategy({
      containerWidth: containerAspect * 1000,
      containerHeight: 1000,
      imageAspectRatio: imageAspect,
    });
    check(`${imageClass} in ${bucket}`, actual, expected);
  }
}

check(
  'unknown image aspect with known container',
  resolveMediaStrategy({ containerWidth: 400, containerHeight: 600 }),
  'letter-solid',
);
check(
  'invalid image dimensions with known container',
  resolveMediaStrategy({ containerWidth: 400, containerHeight: 600, imageWidth: 0, imageHeight: 800 }),
  'letter-solid',
);
check(
  'missing all dimensions',
  resolveMediaStrategy({ containerWidth: 0, containerHeight: 0 }),
  'letter-solid',
);
check(
  'known portrait image before container is measured stays immersive',
  resolveMediaStrategy({ containerWidth: 0, containerHeight: 0, imageAspectRatio: 0.7 }),
  'edge',
);
// Square and landscape must resolve to DIFFERENT strategies (subtle vs stronger ambient).
const squareRunway = resolveMediaStrategy({ containerWidth: 500, containerHeight: 1000, imageAspectRatio: 1 });
const landscapeRunway = resolveMediaStrategy({ containerWidth: 500, containerHeight: 1000, imageAspectRatio: 1.4 });
check('square media in a tall runway container uses the subtle ambient', squareRunway, 'letter-soft');
check('landscape media in a tall runway container uses the stronger ambient', landscapeRunway, 'letter-blur');
if (squareRunway === landscapeRunway) {
  failures.push('square and landscape must not share the same strategy value');
}
check(
  'override strategy',
  resolveMediaStrategy({
    containerWidth: 400,
    containerHeight: 600,
    imageAspectRatio: 2,
    override: 'letter-solid',
  }),
  'letter-solid',
);

const unknownRunway = resolveRunwayMediaStrategy({ viewportWidth: 400, viewportHeight: 800 });
check('runway unknown stays unknown', unknownRunway.imageClass, 'unknown');
check('runway unknown uses safe matte', unknownRunway.strategy, 'letter-solid');
check('runway unknown has no fake aspect', unknownRunway.imageAspectRatio, null);

const safePortraitRunway = resolveRunwayMediaStrategy({
  viewportWidth: 400,
  viewportHeight: 800,
  imageAspectRatio: 0.55,
});
check('runway portrait within crop tolerance uses edge', safePortraitRunway.strategy, 'edge');
if (safePortraitRunway.coverCropFraction > RUNWAY_SAFE_COVER_CROP_TOLERANCE) {
  failures.push('runway edge strategy exceeded the safe crop tolerance');
}

// Runway full-view policy: vertical media fills the phone screen edge-to-edge
// only while the cover crop stays within the portrait cap (<= 0.2); beyond
// that, near-square portrait shots (4:5, 3:4) contain UNCROPPED so no design
// detail hides off-screen. Square/landscape are contained UNCROPPED on the
// deep-black matte. Blur/soft ambient backdrops are banned on the runway.
const portraitRunway = resolveRunwayMediaStrategy({
  viewportWidth: 400,
  viewportHeight: 800,
  imageAspectRatio: 0.7,
});
const tallPhonePortraitRunway = resolveRunwayMediaStrategy({
  viewportWidth: 450,
  viewportHeight: 1000,
  imageAspectRatio: 9 / 16,
});
const squareSpecificRunway = resolveRunwayMediaStrategy({
  viewportWidth: 400,
  viewportHeight: 800,
  imageAspectRatio: 1,
});
const landscapeSpecificRunway = resolveRunwayMediaStrategy({
  viewportWidth: 400,
  viewportHeight: 800,
  imageAspectRatio: 1.4,
});
check('runway near-square portrait contains uncropped', portraitRunway.strategy, 'letter-solid');
check('runway 9:16 on a 20:9 phone stays immersive', tallPhonePortraitRunway.strategy, 'edge');
check('runway square uses the solid black matte', squareSpecificRunway.strategy, 'letter-solid');
check('runway landscape uses the solid black matte', landscapeSpecificRunway.strategy, 'letter-solid');
for (const [label, result] of [
  ['portrait', portraitRunway],
  ['square', squareSpecificRunway],
  ['landscape', landscapeSpecificRunway],
]) {
  if (result.strategy === 'letter-blur' || result.strategy === 'letter-soft') {
    failures.push(`runway ${label} must never use a blurred/soft ambient backdrop`);
  }
}

// Feed image tiering is DETAIL-FIRST as of 2026-07-27. These assertions used to
// describe the older progressive path (start on the card tier, upgrade to detail
// once the page went active) and were left behind when the policy changed, so
// this file had been failing ever since.
//
// The upgrade was removed on purpose: swapping tiers after activation changed the
// ExpoImage recyclingKey + cacheKey and remounted the image every time a page
// became active — the per-scroll "blink", which also repeated on revisit when
// windowSize-evicted rows remounted. A lower tier still rides along as the
// placeholder so the decode gap shows a soft image rather than a black frame.
//
// `hasDetailUpgrade === false` is the anti-blink invariant. If it ever reads true
// again, the blink is back.
const progressiveSources = resolveFeedImageSourcePolicy({
  displayUrl: 'https://cdn.threadly.test/look-detail.webp',
  previewUrl: 'https://cdn.threadly.test/look-card.webp',
  thumbnailUrl: 'https://cdn.threadly.test/look-thumb.webp',
});
check('feed source starts at the detail tier', progressiveSources.initialUrl, 'https://cdn.threadly.test/look-detail.webp');
check('feed source reports the detail tier', progressiveSources.initialTier, 'detail');
check('feed source detail target equals the initial url', progressiveSources.detailUrl, 'https://cdn.threadly.test/look-detail.webp');
check('feed source uses the best sub-tier as placeholder', progressiveSources.placeholderUrl, 'https://cdn.threadly.test/look-card.webp');
check('feed source must not re-introduce a per-activation upgrade', progressiveSources.hasDetailUpgrade, false);

// Degradation path: the policy has to start at the best tier that actually
// exists, and must never hand back a placeholder identical to the image it is
// standing in for (that would render the same decode twice).
const previewOnlySources = resolveFeedImageSourcePolicy({
  displayUrl: null,
  previewUrl: 'https://cdn.threadly.test/look-card.webp',
  thumbnailUrl: 'https://cdn.threadly.test/look-thumb.webp',
});
check('preview-only source starts at the preview tier', previewOnlySources.initialUrl, 'https://cdn.threadly.test/look-card.webp');
check('preview-only source reports the preview tier', previewOnlySources.initialTier, 'preview');
check('preview-only source falls back to the thumbnail placeholder', previewOnlySources.placeholderUrl, 'https://cdn.threadly.test/look-thumb.webp');
check('preview-only source has no upgrade', previewOnlySources.hasDetailUpgrade, false);

const thumbnailOnlySources = resolveFeedImageSourcePolicy({
  displayUrl: '   ',
  previewUrl: null,
  thumbnailUrl: 'https://cdn.threadly.test/look-thumb.webp',
});
check('blank display url is treated as absent', thumbnailOnlySources.initialUrl, 'https://cdn.threadly.test/look-thumb.webp');
check('thumbnail-only source reports the thumbnail tier', thumbnailOnlySources.initialTier, 'thumbnail');
check('thumbnail-only source has no duplicate placeholder', thumbnailOnlySources.placeholderUrl, null);

const singleTierSources = resolveFeedImageSourcePolicy({
  displayUrl: 'https://cdn.threadly.test/look-detail.webp',
  previewUrl: 'https://cdn.threadly.test/look-detail.webp',
  thumbnailUrl: null,
});
check('placeholder must not repeat the initial url', singleTierSources.placeholderUrl, null);
check(
  'signed URL query does not fragment cache key',
  buildFeedImageCacheKey({
    url: 'https://cdn.threadly.test/look-card.webp?X-Amz-Signature=one',
    tier: 'preview',
  }),
  'runway:preview:https://cdn.threadly.test/look-card.webp',
);

if (failures.length > 0) {
  console.error('Aspect-aware media strategy contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Aspect-aware media strategy contract passed.');

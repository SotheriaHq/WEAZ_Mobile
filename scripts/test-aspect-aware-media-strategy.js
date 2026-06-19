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
  'ultra-portrait': {
    'ultra-tall': 'edge',
    tall: 'edge',
    'standard-tall': 'edge',
    'near-square-portrait': 'edge',
    'square-ish': 'letter-solid',
    'near-square-landscape': 'letter-solid',
    wide: 'letter-solid',
    'ultra-wide': 'letter-solid',
  },
  portrait: {
    'ultra-tall': 'edge',
    tall: 'edge',
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

const portraitRunway = resolveRunwayMediaStrategy({
  viewportWidth: 400,
  viewportHeight: 800,
  imageAspectRatio: 0.7,
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
check('runway portrait avoids generic dark letterbox', portraitRunway.strategy, 'letter-soft');
check('runway square uses restrained ambience', squareSpecificRunway.strategy, 'letter-soft');
check('runway landscape uses image-reflective ambience', landscapeSpecificRunway.strategy, 'letter-blur');
if (squareSpecificRunway.strategy === landscapeSpecificRunway.strategy) {
  failures.push('runway square and landscape must use distinct ambience');
}

const progressiveSources = resolveFeedImageSourcePolicy({
  displayUrl: 'https://cdn.threadly.test/look-detail.webp',
  previewUrl: 'https://cdn.threadly.test/look-card.webp',
  thumbnailUrl: 'https://cdn.threadly.test/look-thumb.webp',
});
check('progressive source starts with card', progressiveSources.initialUrl, 'https://cdn.threadly.test/look-card.webp');
check('progressive source finishes with detail', progressiveSources.detailUrl, 'https://cdn.threadly.test/look-detail.webp');
check('progressive source exposes thumbnail placeholder', progressiveSources.placeholderUrl, 'https://cdn.threadly.test/look-thumb.webp');
check('progressive source has detail upgrade', progressiveSources.hasDetailUpgrade, true);
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

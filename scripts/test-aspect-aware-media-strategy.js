const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const strategyPath = path.join(__dirname, '..', 'src', 'components', 'media', 'aspectAwareMediaStrategy.ts');
const source = fs.readFileSync(strategyPath, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
  },
  fileName: strategyPath,
});

const moduleShim = { exports: {} };
const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText);
evaluate(moduleShim.exports, require, moduleShim, strategyPath, path.dirname(strategyPath));

const {
  getContainerAspectBucket,
  getImageAspectClass,
  resolveMediaStrategy,
} = moduleShim.exports;

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

if (failures.length > 0) {
  console.error('Aspect-aware media strategy contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Aspect-aware media strategy contract passed.');

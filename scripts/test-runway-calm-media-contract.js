const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const mobileRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(mobileRoot, '..');
const webRoot = path.join(workspaceRoot, 'fthreadly');

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: filePath,
  });
  const moduleShim = { exports: {} };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText);
  evaluate(moduleShim.exports, require, moduleShim, filePath, path.dirname(filePath));
  return moduleShim.exports;
}

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const nativeCurves = loadTsModule(
  path.join(mobileRoot, 'src', 'features', 'feed', 'utils', 'runwayTransitCurves.ts'),
);
const nativeFeed = fs.readFileSync(
  path.join(mobileRoot, 'src', 'features', 'feed', 'components', 'RunwayFeedScreen.tsx'),
  'utf8',
);
const nativeCarousel = fs.readFileSync(
  path.join(mobileRoot, 'src', 'features', 'feed', 'components', 'FeedMediaCarousel.tsx'),
  'utf8',
);
check(
  nativeCurves.RUNWAY_PAGE_SCRIM_MAX_OPACITY === 0,
  'native Runway must not place a luminance-changing scrim over ready media',
);
check(
  nativeCurves.RUNWAY_PAGE_SCALE_MIN === 1,
  'native Runway must not shrink ready media during a swipe',
);
check(
  nativeFeed.includes('activePageIndex + 3') && nativeFeed.includes('void hydrateCollectionMedia(candidate)'),
  'native Runway must warm upcoming cover images and angle data before a swipe reaches them',
);
check(
  nativeCarousel.includes('safeActiveIndex - 2'),
  'native Runway must warm horizontal-neighbor media in both directions',
);

if (!fs.existsSync(webRoot)) {
  console.log('Runway calm-media contract skipped: sibling web checkout is unavailable.');
  process.exit(0);
}

const webCssPath = path.join(webRoot, 'src', 'index.css');
const webReelsPath = path.join(webRoot, 'src', 'components', 'runway', 'RunwayReelsFeed.tsx');
const webItemPath = path.join(webRoot, 'src', 'components', 'runway', 'RunwayReelsItem.tsx');
const webCss = fs.readFileSync(webCssPath, 'utf8');
const webReels = fs.readFileSync(webReelsPath, 'utf8');
const webItem = fs.readFileSync(webItemPath, 'utf8');

check(
  /@keyframes wiez-reel-scale\s*\{[\s\S]*?0%\s*\{\s*transform:\s*scale\(1\);[\s\S]*?100%\s*\{\s*transform:\s*scale\(1\);/.test(webCss),
  'web Runway scale must match native: no media shrink during a swipe',
);
check(
  /@keyframes wiez-reel-scrim\s*\{[\s\S]*?0%\s*\{\s*opacity:\s*0;[\s\S]*?25%\s*\{\s*opacity:\s*0;[\s\S]*?75%\s*\{\s*opacity:\s*0;[\s\S]*?100%\s*\{\s*opacity:\s*0;/.test(webCss),
  'web Runway scrim must match native: no media veil during a swipe',
);
check(
  webReels.includes('priority={Math.abs(index - activeIndex) <= 2}'),
  'web Runway must warm the active reel and two vertical neighbors',
);
check(
  webItem.includes('void preloadImageUrl(candidate.url)'),
  'web Runway must decode horizontal-neighbor images before a swipe reaches them',
);
check(
  webItem.includes('waitForDecode'),
  'web Runway must hide first-time progressive image paint until final decode',
);

if (failures.length) {
  console.error('Runway calm-media contract failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Runway calm-media contract passed.');

/**
 * Behavioural tests for the Runway transit curves.
 *
 * The responsiveness contract test asserts *source text*, which is the right
 * tool for "this prop must never come back" but proves nothing about geometry —
 * a reformat breaks it and a sign error slips through. These tests evaluate the
 * curves at real scroll offsets and assert what they output.
 */
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
    if (request.startsWith('@/')) return loadTsModule(path.join(projectRoot, request.slice(2) + '.ts'));
    if (request.startsWith('.')) return loadTsModule(path.join(path.dirname(resolvedPath), request + '.ts'));
    return require(request);
  };
  const evaluate = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled.outputText);
  evaluate(moduleShim.exports, localRequire, moduleShim, resolvedPath, path.dirname(resolvedPath));
  return moduleShim.exports;
}

const {
  RUNWAY_PAGE_SCRIM_MAX_OPACITY,
  RUNWAY_PAGE_SCALE_MIN,
  CHROME_FADE_END_RATIO,
  SCRIM_MIDPOINT_RATIO,
  SCRIM_INCOMING_RATIO,
  buildScrimCurve,
  buildScaleCurve,
  buildChromeCurve,
  evaluateCurve,
} = loadTsModule(path.join(projectRoot, 'src', 'features', 'feed', 'utils', 'runwayTransitCurves.ts'));

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const near = (actual, expected, message, tolerance = 1e-9) => {
  if (Math.abs(actual - expected) > tolerance) {
    failures.push(`${message} (expected ~${expected}, got ${actual})`);
  }
};

// Realistic viewports plus the degenerate values the screen guards against, so
// the curves are proven safe even if that guard is ever refactored away.
const PAGE_HEIGHTS = [820, 844.6666564941406, 915.4285888671875, 640, 1, 0, -5, NaN];
const PAGE_INDICES = [0, 1, 2, 37, 500];

const curveBuilders = [
  ['scrim', (i, h) => buildScrimCurve(i, h)],
  ['scale', (i, h) => buildScaleCurve(i, h, true)],
  ['scale(reduced)', (i, h) => buildScaleCurve(i, h, false)],
  ['chrome', (i, h) => buildChromeCurve(i, h)],
];

// --- Invariant 1: inputRange strictly increasing --------------------------
// Animated.interpolate throws on a non-monotonic inputRange. That is a crash,
// not a visual glitch, so it is checked at every height including the bad ones.
for (const [name, build] of curveBuilders) {
  for (const height of PAGE_HEIGHTS) {
    for (const index of PAGE_INDICES) {
      const { inputRange, outputRange } = build(index, height);
      check(
        inputRange.length === outputRange.length,
        `${name}: inputRange/outputRange length mismatch at height=${height}`,
      );
      for (let i = 1; i < inputRange.length; i += 1) {
        check(
          inputRange[i] > inputRange[i - 1],
          `${name}: inputRange must strictly increase (height=${height}, index=${index}, at ${i})`,
        );
      }
      for (const value of inputRange.concat(outputRange)) {
        check(Number.isFinite(value), `${name}: non-finite range value at height=${height}, index=${index}`);
      }
    }
  }
}

// --- Invariant 2: an idle feed is untouched -------------------------------
// The single most important property. A centred page must read exactly its rest
// value, or shipping this blind would change how a stationary feed looks.
for (const height of PAGE_HEIGHTS) {
  for (const index of PAGE_INDICES) {
    const centre = index * (Number.isFinite(height) && height > 1 ? height : 1);
    near(evaluateCurve(buildScrimCurve(index, height), centre), 0, `scrim must be 0 at centre (h=${height}, i=${index})`);
    near(evaluateCurve(buildScaleCurve(index, height, true), centre), 1, `scale must be 1 at centre (h=${height}, i=${index})`);
    near(evaluateCurve(buildChromeCurve(index, height), centre), 1, `chrome must be 1 at centre (h=${height}, i=${index})`);
  }
}

// --- Invariant 3: symmetry where it is claimed ----------------------------
// Scale and chrome carry no directional bias, so they must read identically
// either side of centre. The scrim is deliberately excluded — Invariant 10.
{
  const height = 820;
  const index = 4;
  const centre = index * height;
  const symmetricBuilders = curveBuilders.filter(([name]) => name !== 'scrim');
  check(symmetricBuilders.length === curveBuilders.length - 1, 'exactly one builder (scrim) may be asymmetric');
  for (const delta of [1, 37, height / 4, height / 2, height * 0.9, height, height * 3]) {
    for (const [name, build] of symmetricBuilders) {
      const curve = build(index, height);
      near(
        evaluateCurve(curve, centre - delta),
        evaluateCurve(curve, centre + delta),
        `${name}: must be symmetric about centre at delta=${delta}`,
      );
    }
  }
}

// --- Invariant 4: clamping ------------------------------------------------
{
  const height = 820;
  const index = 3;
  const centre = index * height;
  for (const far of [height * 1.5, height * 10, height * 1000]) {
    near(evaluateCurve(buildScrimCurve(index, height), centre + far), RUNWAY_PAGE_SCRIM_MAX_OPACITY, 'scrim must clamp to the departure peak');
    near(
      evaluateCurve(buildScrimCurve(index, height), centre - far),
      RUNWAY_PAGE_SCRIM_MAX_OPACITY * SCRIM_INCOMING_RATIO,
      'scrim must clamp to the (lighter) approach peak',
    );
    near(evaluateCurve(buildScaleCurve(index, height, true), centre + far), RUNWAY_PAGE_SCALE_MIN, 'scale must clamp to min');
    near(evaluateCurve(buildChromeCurve(index, height), centre + far), 0, 'chrome must clamp to 0');
  }
}

// --- Invariant 5: outputs stay in legal ranges ----------------------------
// Opacity outside [0,1] and scale outside (0,1] are both undefined behaviour.
{
  const height = 820;
  const index = 2;
  const centre = index * height;
  for (let step = -2 * height; step <= 2 * height; step += height / 64) {
    const at = centre + step;
    const scrim = evaluateCurve(buildScrimCurve(index, height), at);
    const scale = evaluateCurve(buildScaleCurve(index, height, true), at);
    const chrome = evaluateCurve(buildChromeCurve(index, height), at);
    check(scrim >= 0 && scrim <= 1, `scrim out of [0,1] at offset ${at}: ${scrim}`);
    check(chrome >= 0 && chrome <= 1, `chrome out of [0,1] at offset ${at}: ${chrome}`);
    check(scale >= RUNWAY_PAGE_SCALE_MIN && scale <= 1, `scale out of range at offset ${at}: ${scale}`);
  }
}

// --- Invariant 6: the scrim is front-loaded -------------------------------
// The whole point of SCRIM_MIDPOINT_RATIO. If this degrades to linear, the
// outgoing page stops receding while the two pages actually overlap.
{
  const height = 820;
  const index = 1;
  const centre = index * height;
  const half = evaluateCurve(buildScrimCurve(index, height), centre + height / 2);
  near(half, RUNWAY_PAGE_SCRIM_MAX_OPACITY * SCRIM_MIDPOINT_RATIO, 'scrim midpoint must follow SCRIM_MIDPOINT_RATIO');
  check(
    half > RUNWAY_PAGE_SCRIM_MAX_OPACITY * 0.5,
    'scrim must be front-loaded: halfway must exceed a linear ramp',
  );
}

// --- Invariant 7: chrome retires before the media does --------------------
// Two action rails sliding past each other are a bigger share of the mid-swipe
// load than the photographs, so the chrome must be gone well before the scrim
// has finished its own ramp.
{
  const height = 820;
  const index = 6;
  const centre = index * height;
  check(CHROME_FADE_END_RATIO < 0.5, 'chrome must finish fading before the pages are halfway');
  near(evaluateCurve(buildChromeCurve(index, height), centre + height * CHROME_FADE_END_RATIO), 0, 'chrome must reach 0 at its fade end');
  check(
    evaluateCurve(buildChromeCurve(index, height), centre + height / 2) === 0,
    'chrome must already be gone at the halfway point',
  );
  check(
    evaluateCurve(buildScrimCurve(index, height), centre + height / 2) < RUNWAY_PAGE_SCRIM_MAX_OPACITY,
    'scrim must still be ramping at the halfway point (chrome leads, media follows)',
  );
}

// --- Invariant 8: Reduce Motion suppresses scale and nothing else ---------
{
  const height = 820;
  const index = 5;
  const centre = index * height;
  const reduced = buildScaleCurve(index, height, false);
  for (const delta of [0, height / 3, height, height * 4]) {
    near(evaluateCurve(reduced, centre + delta), 1, `reduced-motion scale must stay 1 at delta=${delta}`);
  }
  // The cross-fades are not motion and must survive Reduce Motion untouched.
  check(
    evaluateCurve(buildScrimCurve(index, height), centre + height) === RUNWAY_PAGE_SCRIM_MAX_OPACITY,
    'scrim must be unaffected by the reduce-motion path',
  );
}

// --- Invariant 9: page offsets match the list contract --------------------
// getItemLayout uses `offset: pageHeight * index`. If the curves ever disagree,
// every page dims against the wrong centre.
{
  const height = 844.6666564941406;
  for (const index of PAGE_INDICES) {
    const curve = buildScrimCurve(index, height);
    near(curve.inputRange[2], index * height, `scrim centre must equal pageHeight * index (index=${index})`, 1e-6);
  }
}

// --- Invariant 10: the incoming page wins the mid-swipe contrast ----------
// Uniform dimming leaves the eye two equally murky candidates. The approach
// side (scrollY < centre, i.e. the page still below the viewport and being
// scrolled toward) must be measurably clearer than the departure side, or the
// transition is calm but undirected.
{
  const height = 820;
  const index = 7;
  const centre = index * height;
  const scrim = buildScrimCurve(index, height);

  check(SCRIM_INCOMING_RATIO > 0 && SCRIM_INCOMING_RATIO <= 1, 'SCRIM_INCOMING_RATIO must be within (0, 1]');

  for (const delta of [height / 8, height / 4, height / 2, height * 0.75, height, height * 2]) {
    const arriving = evaluateCurve(scrim, centre - delta);
    const leaving = evaluateCurve(scrim, centre + delta);
    check(
      arriving < leaving,
      `scrim must dim an approaching page less than a departing one at delta=${delta} (${arriving} vs ${leaving})`,
    );
    near(arriving, leaving * SCRIM_INCOMING_RATIO, `scrim asymmetry must follow SCRIM_INCOMING_RATIO at delta=${delta}`);
  }

  // Both halves still meet at exactly 0, so the asymmetry can never produce a
  // step at centre — a settled page is untouched no matter which way it arrived.
  near(evaluateCurve(scrim, centre), 0, 'asymmetric scrim must still rest at 0');
  near(evaluateCurve(scrim, centre - 1e-6), 0, 'approach side must reach 0 at centre', 1e-6);
  near(evaluateCurve(scrim, centre + 1e-6), 0, 'departure side must reach 0 at centre', 1e-6);
}

// --- Invariant 11: the dot row is bound to the chrome curve ---------------
// The dot indicator lives inside FeedMediaCarousel, outside the page's chrome
// layer, so it can only fade if the curve is handed to it explicitly. Without
// this it stays fully opaque while every other overlay fades.
{
  const carousel = fs.readFileSync(
    path.join(projectRoot, 'src', 'features', 'feed', 'components', 'FeedMediaCarousel.tsx'),
    'utf8',
  );
  const item = fs.readFileSync(
    path.join(projectRoot, 'src', 'features', 'feed', 'components', 'RunwayFeedItem.tsx'),
    'utf8',
  );
  check(/chromeOpacity\?\s*:\s*Animated\.AnimatedInterpolation/.test(carousel), 'carousel must accept the page chrome fade');
  check(/opacity:\s*chromeOpacity/.test(carousel), 'carousel dot row must bind the chrome fade to its opacity');
  check(/chromeOpacity=\{chromeOpacity\}/.test(item), 'page must hand its chrome fade to the carousel');
}

if (failures.length) {
  console.error('Runway transit curve tests failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Runway transit curve tests passed.');

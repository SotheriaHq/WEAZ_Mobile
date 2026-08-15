const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expectIncludes = (file, value, message) => {
  if (!read(file).includes(value)) failures.push(`${file}: ${message}`);
};
const expectNotMatches = (file, pattern, message) => {
  if (pattern.test(read(file))) failures.push(`${file}: ${message}`);
};
const expectMatches = (file, pattern, message) => {
  if (!pattern.test(read(file))) failures.push(`${file}: ${message}`);
};

// The prop assertions below are anchored to "bare JSX prop on its own line" so
// they describe the actual list config and are not satisfied (or tripped) by the
// same words appearing in the explanatory comments above the props.
const bareProp = (name) => new RegExp(`\\n\\s+${name}\\s*\\n`);

// `MarketFeedScreen.tsx` is a deprecated re-export shim; the real screen (and the
// only place these props live) is RunwayFeedScreen.
const feedScreen = 'src/features/feed/components/RunwayFeedScreen.tsx';
// Exactly ONE paging owner, and it must be native paging. Interval snapping is
// banned here: `snapToInterval` + `disableIntervalMomentum` on a full-screen page
// is what made the settle accelerate and slam into the target instead of easing
// into it (Android's flingAndSnap adds `(largerOffset - targetOffset) * 10` to the
// fling velocity, and that term is a whole page of travel; iOS retargets off the
// raw finger-lift offset). Do not "restore" them — see the comment on the list.
expectMatches(feedScreen, bareProp('pagingEnabled'), 'vertical feed must use native paging as its single paging owner');
expectNotMatches(feedScreen, /snapToInterval=\{/, 'vertical feed must not combine interval snapping with native paging');
expectNotMatches(feedScreen, bareProp('disableIntervalMomentum'), 'vertical feed must not re-add the boosted/retargeted interval settle');
expectNotMatches(feedScreen, /shouldCorrectJump/, 'momentum end must not teleport multi-page flings');
// Two rows on first paint so the next page is already committed when the first
// swipe starts (IG-style). Batches stay small enough that a mid-scroll mount
// cannot rebuild the whole window, but large enough to cover prev/active/next.
expectIncludes(feedScreen, 'initialNumToRender={2}', 'first render must mount active + next full-screen rows');
expectIncludes(feedScreen, 'maxToRenderPerBatch={3}', 'row batches must stay bounded');
expectIncludes(feedScreen, 'windowSize={5}', 'render window must keep previous/next pages painted for smooth paging');
expectIncludes(feedScreen, 'removeClippedSubviews={false}', 'full-screen rows must avoid Android clipping flashes');
expectIncludes(feedScreen, 'InteractionManager.runAfterInteractions', 'hydration and analytics must wait for interaction idle');
expectIncludes(feedScreen, 'hydratedCandidates: adjacentItem ? 2 : 1', 'hydration candidates must be bounded to current and next');
expectNotMatches(feedScreen, /for \(let offset = -1; offset <= 2/, 'four-row hydration must not return');

// Transit scrim: during a swipe both the outgoing and incoming pages sit in the
// viewport at full luminance, with two action rails sliding past each other. The
// scrim interpolates each page's opacity on distance from centre so the outgoing
// page recedes instead of competing. It MUST stay native-driven — a JS-driven
// per-frame scroll listener would put back the bridge traffic the paging work
// removed.
expectIncludes(feedScreen, 'useNativeDriver: true', 'feed scroll offset must be native-driven');
expectIncludes(feedScreen, 'onScroll={handleFeedScroll}', 'feed must publish its scroll offset for the transit scrim');
expectIncludes(feedScreen, 'scrollY={feedScrollY}', 'rows must receive the shared scroll offset');
expectNotMatches(
  feedScreen,
  /Animated\.event\([\s\S]{0,200}listener:/,
  'scroll event must not carry a JS listener on the per-frame path',
);

// The scrim must dissolve pages toward the STAGE matte — scrimming toward
// theme.colors.bg makes the light theme brighten at the midpoint of every swipe,
// which is the fatigue this work exists to remove.
//
// This asserted the literal `tokens.themes.dark.colors.bg`, from when the stage
// was pinned deep-black in both themes. The stage has since become a themed
// token of its own (`runwayStage`: #E9EEF5 light / #080A0F dark), so the literal
// assertion had been failing permanently and therefore guarding nothing. The
// invariant it was written to protect is unchanged and is what is checked now:
// scrim to the stage, never to the page background.
expectIncludes(feedScreen, 'scrimColor={theme.colors.runwayStage}', 'scrim must match the Runway stage matte in both themes');
expectNotMatches(feedScreen, /scrimColor=\{theme\.colors\.bg\}/, 'scrim must not resolve to the page background');

// Geometry itself is NOT asserted here. The curves live in a pure module and are
// covered behaviourally by `npm run test:runway-transit-curves`, which evaluates
// them at real scroll offsets. What is asserted below are the things a unit test
// genuinely cannot see: that the component keeps binding to the native scroll
// value, and that the render tree stays shaped the way the design requires.
const feedItem = 'src/features/feed/components/RunwayFeedItem.tsx';
expectIncludes(feedItem, 'runwayTransitCurves', 'transition geometry must stay in the unit-tested pure module');
expectNotMatches(
  feedItem,
  /inputRange:\s*\[/,
  'interpolation ranges must not be hand-rolled in the component — use runwayTransitCurves',
);
expectIncludes(feedItem, 'scrollY.interpolate', 'curves must be driven by scroll position, not by active-page state');
expectMatches(feedItem, /extrapolate:\s*'clamp'/, 'curves must clamp outside the adjacent-page range');
expectIncludes(feedItem, 'pointerEvents="none"', 'scrim must not intercept taps meant for the action rail');
expectIncludes(feedItem, 'pointerEvents="box-none"', 'chrome fade wrapper must stay transparent to touches');
// The scrim has to be the LAST child or it stops covering the chrome, and the
// chrome wrapper has to wrap all three overlays or the rails keep competing.
expectMatches(
  feedItem,
  /badgeOverlay\}[\s\S]{0,80}\{actionRail\}[\s\S]{0,80}\{metaOverlay\}/,
  'badge, action rail and meta must share one fade wrapper',
);
// Scale must stay a transform: row height feeds getItemLayout and native paging,
// so any layout-affecting recede desynchronises paging from row geometry.
expectIncludes(feedItem, 'transform: [{ scale: pageScale }]', 'page recede must be a transform, never a layout change');
expectMatches(feedItem, /height:\s*pageHeight\s*[,}]/, 'row height must be exactly pageHeight');
expectNotMatches(feedItem, /height:\s*pageHeight\s*\*/, 'row height must never be scaled');
// Reduce Motion suppresses the scale only. If the component stops accepting the
// flag, the accessibility path silently dies.
expectIncludes(feedItem, 'pageScaleEnabled', 'scale must be suppressible for Reduce Motion');
expectIncludes(feedScreen, 'pageScaleEnabled={pageScaleEnabled}', 'screen must pass the Reduce Motion state to rows');
expectIncludes(feedScreen, 'useReduceMotion()', 'screen must read the OS Reduce Motion setting');

// The pure module is the single source of truth for every tuning knob.
const curves = 'src/features/feed/utils/runwayTransitCurves.ts';
for (const constant of [
  'RUNWAY_PAGE_SCRIM_MAX_OPACITY',
  'SCRIM_MIDPOINT_RATIO',
  'SCRIM_INCOMING_RATIO',
  'RUNWAY_PAGE_SCALE_MIN',
  'CHROME_FADE_END_RATIO',
]) {
  expectIncludes(curves, `export const ${constant}`, `${constant} must stay an exported named constant`);
}
expectNotMatches(curves, /from 'react/, 'transit curves must stay free of React/RN imports so they remain unit-testable');

// These two files used to re-export the whole RunwayFeedScreen under component
// names, so importing one silently pulled in the entire feed screen.
for (const shim of ['src/features/feed/components/FeedActionRail.tsx', 'src/features/feed/components/FeedMetaOverlay.tsx']) {
  if (fs.existsSync(path.join(root, shim))) {
    failures.push(`${shim}: mis-pointed re-export shim must not come back (components are local to RunwayFeedScreen)`);
  }
}

const carousel = 'src/features/feed/components/FeedMediaCarousel.tsx';
expectIncludes(carousel, 'Math.abs(index - activeIndex) <= 2', 'carousel must mount a bounded window around the active media');
expectIncludes(carousel, 'shouldMountSlide(index, safeActiveIndex, isActive)', 'off-window angle frames must not mount media');
expectIncludes(carousel, 'scrollEnabled={isActive}', 'inactive vertical pages must not compete for horizontal pans');
expectNotMatches(carousel, /scrollTo\(\{ x: nextIndex \* width, y: 0, animated: false \}\)/, 'horizontal settle must not visibly correct momentum');
// The dot row is the only overlay outside the page's chrome layer. It must keep
// receiving the fade explicitly, or it silently becomes the brightest moving
// element mid-swipe while every other overlay dims.
expectIncludes(carousel, 'chromeOpacity', 'carousel must keep accepting the page chrome fade for its dot row');

const chip = 'components/ui/Chip.tsx';
expectIncludes(chip, 'minHeight: 44', 'chip touch frame must meet the 44px target');
expectNotMatches(chip, /pressed\s*\?\s*theme\.colors\.primarySoft/, 'pressed chip must not imitate selected fill');

const tabs = 'app/(tabs)/_layout.tsx';
expectIncludes(tabs, 'subscribeRunwayFirstMediaVisible', 'tab preload must key off first Runway media');
// Preload deliberately no longer gates on InteractionManager: Runway carousels keep
// interactions busy, so runAfterInteractions delayed warming by seconds and left
// Market/Catalog/Me cold (the "tap and wait ~3s" complaint). The contract is now
// first-media-driven with an early-warm fallback, both observable in navDevLog.
expectIncludes(tabs, "schedulePreloads('first-media-visible'", 'preload must start when first Runway media is visible');
expectIncludes(tabs, "schedulePreloads('early-warm')", 'preload must still warm when Runway media is slow or empty');

if (failures.length) {
  console.error('Runway responsiveness contract failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Runway responsiveness contract passed.');

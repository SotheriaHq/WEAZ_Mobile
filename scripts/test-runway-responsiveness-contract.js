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
expectIncludes(feedScreen, 'initialNumToRender={1}', 'first render must mount one full-screen row');
expectIncludes(feedScreen, 'maxToRenderPerBatch={2}', 'row batches must stay bounded');
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

const feedItem = 'src/features/feed/components/RunwayFeedItem.tsx';
expectIncludes(feedItem, 'RUNWAY_PAGE_SCRIM_MAX_OPACITY', 'page scrim depth must stay a single named constant');
expectIncludes(feedItem, 'scrollY.interpolate', 'scrim must be driven by scroll position, not by active-page state');
expectIncludes(feedItem, "extrapolate: 'clamp'", 'scrim must clamp outside the adjacent-page range');
expectIncludes(feedItem, 'pointerEvents="none"', 'scrim must not intercept taps meant for the action rail');

const carousel = 'src/features/feed/components/FeedMediaCarousel.tsx';
expectIncludes(carousel, 'Math.abs(index - activeIndex) <= 2', 'carousel must mount a bounded window around the active media');
expectIncludes(carousel, 'shouldMountSlide(index, safeActiveIndex) ?', 'off-window angle frames must not mount media');
expectNotMatches(carousel, /scrollTo\(\{ x: nextIndex \* width, y: 0, animated: false \}\)/, 'horizontal settle must not visibly correct momentum');

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

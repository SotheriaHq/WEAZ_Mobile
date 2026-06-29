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

const feedScreen = 'src/features/feed/components/MarketFeedScreen.tsx';
expectIncludes(feedScreen, 'snapToInterval={pageHeight}', 'vertical feed must use measured interval snapping');
expectIncludes(feedScreen, 'disableIntervalMomentum', 'vertical feed must stop at one interval per gesture');
expectNotMatches(feedScreen, /pagingEnabled=\{true\}/, 'vertical feed must not combine pagingEnabled with interval snapping');
expectNotMatches(feedScreen, /shouldCorrectJump/, 'momentum end must not teleport multi-page flings');
expectIncludes(feedScreen, 'initialNumToRender={1}', 'first render must mount one full-screen row');
expectIncludes(feedScreen, 'maxToRenderPerBatch={1}', 'row batches must stay bounded');
expectIncludes(feedScreen, 'removeClippedSubviews={false}', 'full-screen rows must avoid Android clipping flashes');
expectIncludes(feedScreen, 'InteractionManager.runAfterInteractions', 'hydration and analytics must wait for interaction idle');
expectIncludes(feedScreen, 'hydratedCandidates: adjacentItem ? 2 : 1', 'hydration candidates must be bounded to current and next');
expectNotMatches(feedScreen, /for \(let offset = -1; offset <= 2/, 'four-row hydration must not return');

const carousel = 'src/features/feed/components/FeedMediaCarousel.tsx';
expectIncludes(carousel, 'Math.abs(index - activeIndex) <= 1', 'carousel must mount only current and adjacent media');
expectIncludes(carousel, 'shouldMountSlide(index, safeActiveIndex) ?', 'off-window angle frames must not mount media');
expectNotMatches(carousel, /scrollTo\(\{ x: nextIndex \* width, y: 0, animated: false \}\)/, 'horizontal settle must not visibly correct momentum');

const chip = 'components/ui/Chip.tsx';
expectIncludes(chip, 'minHeight: 44', 'chip touch frame must meet the 44px target');
expectNotMatches(chip, /pressed\s*\?\s*theme\.colors\.primarySoft/, 'pressed chip must not imitate selected fill');

const tabs = 'app/(tabs)/_layout.tsx';
expectIncludes(tabs, 'subscribeRunwayFirstMediaVisible', 'tab preload must wait for first Runway media');
expectIncludes(tabs, 'InteractionManager.runAfterInteractions', 'tab preload must wait for an idle interaction window');
expectIncludes(tabs, "reason: 'awaiting-first-runway-media'", 'preload defer reason must be observable');

if (failures.length) {
  console.error('Runway responsiveness contract failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Runway responsiveness contract passed.');

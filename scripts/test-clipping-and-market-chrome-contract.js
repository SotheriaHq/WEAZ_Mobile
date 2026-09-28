/**
 * Clipping vocabulary, market chrome, and the island's active state.
 *
 * Three things that are cheap to regress because each one is a handful of
 * strings spread over a dozen screens:
 *
 *  - "save" had four names (Save / Saved / Save look / Saved Looks) and a heart
 *    glyph that meant "like". One vocabulary now lives in `src/constants/clipping.ts`
 *    and every surface reads it.
 *  - a market row is a heading and a way out. Subtitles written for whoever
 *    tuned the ranking, and "see more" dressed as a button, both came back
 *    once already.
 *  - the island's active chip had a border the same colour as its fill, so the
 *    selected tab had no edge at all.
 *
 * Reads the screens as source: none of this can run under Node.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('one clip vocabulary, and every surface reads it', () => {
  const constants = read('src/constants/clipping.ts');
  for (const token of [
    'CLIP_LABEL',
    'CLIPPED_LABEL',
    'UNCLIP_LABEL',
    'CLIPS_TAB_LABEL',
    'clipActionLabel',
    'clipAccessibilityLabel',
  ]) {
    assert.match(constants, new RegExp(`export const ${token}\\b`), `${token} is the shared name`);
  }

  for (const file of [
    'app/(tabs)/me.tsx',
    'components/commerce/UnifiedProductCard.tsx',
    'src/features/feed/components/RunwayFeedScreen.tsx',
    'src/features/market/components/MarketCommerceViewer.tsx',
    'src/features/market/components/CollectionCommerceViewer.tsx',
  ]) {
    assert.match(read(file), /constants\/clipping/, `${file} reads the shared vocabulary`);
  }
});

check('clip does not collide with the hashtag vocabulary', () => {
  // The reason this is not called "tag": `tags` means hashtags everywhere in
  // this codebase, and a second meaning would cost a reader a beat every time.
  const constants = read('src/constants/clipping.ts');
  assert.doesNotMatch(constants, /TAG_|tagAction/, 'no tag-named export survives');
  // The market screen keeps its hashtag filter chips untouched.
  assert.match(read('src/features/market/components/MarketScreen.tsx'), /tag: activeTag|tag: params\.filters\.category|tagKeys/);
});

check('no surface still says Saved Looks or Save look', () => {
  const surfaces = [
    'app/(tabs)/me.tsx',
    'src/features/feed/components/RunwayFeedScreen.tsx',
    'src/features/market/components/MarketCommerceViewer.tsx',
    'src/features/market/components/MarketScreen.tsx',
  ];
  for (const file of surfaces) {
    const source = read(file);
    assert.doesNotMatch(source, /'Saved Looks'|Saved to Saved Looks|Remove from Saved Looks/, `${file} still says Saved Looks`);
    assert.doesNotMatch(source, /'Save look'/, `${file} still says Save look`);
  }
});

check('the clip control is one shape, and the fill carries the state', () => {
  const card = read('components/commerce/UnifiedProductCard.tsx');

  /*
    This check used to require the OPPOSITE — two glyphs, a paperclip and a
    bookmark — on the reasoning that two hearts differing only in tint are
    invisible over a photograph. The reasoning was right and the remedy was
    wrong: swapping the glyph changes the silhouette the eye tracks, so the
    control looked like a different control after every press and neither
    symbol on its own said which state you were in.

    The mark is fixed now and the SURFACE behind it changes — a brand-filled
    disc when clipped, glass when not. That survives a photograph and greyscale
    for the same reason a second shape did, without the button changing
    identity. The tint objection still stands and is still checked below.
  */
  assert.match(card, /const FAVORITE_ICON = CLIP_EMOJI;/, 'one clip glyph, in both states');
  assert.doesNotMatch(card, /FAVORITE_EMPTY_ICON/, 'no second glyph for the empty state');
  assert.doesNotMatch(card, /CLIPPED_EMOJI/, 'the second glyph is retired');
  // The state has to be legible as something other than a tint on the icon.
  assert.match(
    card,
    /favorite\s*\n?\s*\?\s*\{ backgroundColor: theme\.colors\.primary/,
    'clipped fills the control',
  );
  assert.doesNotMatch(card, /0x2764/, 'no heart glyph');
  assert.doesNotMatch(card, /0x1f90d/, 'no white-heart glyph');

  // ...and the one glyph is the only one the constants offer, so no surface
  // can quietly reintroduce a pair.
  const constants = read('src/constants/clipping.ts');
  assert.doesNotMatch(constants, /CLIPPED_EMOJI/, 'no second clip glyph is exported');
});

check('clipping a design sends only the two fields /saved declares', () => {
  /*
    The backend validates this body with `forbidNonWhitelisted: true`, so an
    extra property is a 400 rather than a key the server ignores. The legacy
    mapper returns `legacyCollectionId` on the DESIGN branch, which is the
    branch the Runway uses — so every clip from the feed was rejected while
    collections and products were fine.
  */
  const api = read('src/api/SavedItemsApi.ts');
  assert.match(api, /toSavedItemRequest\(legacyTarget\)/, 'the payload is narrowed before it is sent');

  const target = read('src/features/catalog/catalogTarget.ts');
  assert.match(
    target,
    /export function toSavedItemRequest[\s\S]*?return \{ targetType: target\.targetType, targetId: target\.targetId \};/,
    'the request carries targetType and targetId only',
  );
});

check('a market row is a heading and a way out', () => {
  const market = read('src/features/market/components/MarketScreen.tsx');
  assert.doesNotMatch(
    market,
    /<AppText variant="caption" tone="muted" numberOfLines=\{1\}>\{subtitle\}/,
    'section subtitles are back',
  );
  assert.doesNotMatch(market, />See all</, 'the see-more affordance is not a bespoke label');
  assert.match(market, /<SeeMoreLink/, 'rows use the shared see-more link');
});

check('see more and going back are links, never buttons', () => {
  const link = read('components/ui/InlineNavLink.tsx');
  assert.match(link, /fontStyle: 'italic'/, 'italic is the signal');
  assert.match(link, /tone=\{disabled \? 'disabled' : 'primary'\}/, 'system colour');
  assert.match(link, /accessibilityRole="link"/);

  for (const file of [
    'src/features/market/components/CollectionCommerceViewer.tsx',
    'src/features/market/components/CollectionGalleryViewer.tsx',
    'app/(tabs)/me.tsx',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /title="Back to /, `${file} still wraps a way back in a Button`);
    assert.match(source, /<BackLink/, `${file} uses the pointer link`);
  }
});

check('the island active chip has an edge', () => {
  const island = read('components/navigation/NativeIslandBottomNav.tsx');
  assert.match(
    island,
    /borderColor: focused \? theme\.colors\.focusRing : 'transparent'/,
    'the ring must not be the fill colour',
  );
  assert.doesNotMatch(
    island,
    /borderColor: focused \? theme\.colors\.navActiveSurface/,
    'ring and fill were the same value — no visible edge',
  );
  // The box may not change on focus: that is what blanks the glyph on Android.
  assert.doesNotMatch(island, /borderWidth: focused/, 'border width must not depend on focus');
});

check('every section grid uses the system card', () => {
  const section = read('src/features/market/components/MarketSectionDetailScreen.tsx');
  assert.match(section, /<UnifiedProductCard/, 'the See-more page uses the same card as Market');
  assert.doesNotMatch(section, /styles\.cardBody/, 'no card body of its own');
  // The pill was `<AppText ...>{item.entityType}</AppText>`. Anchored on the
  // `>` so the key builder's `${item.entityType}:${item.sourceId}` does not match.
  assert.doesNotMatch(section, />\s*\{item\.entityType\}/, 'no entity-type pill');
});

check('a section of brands renders designer fronts', () => {
  const section = read('src/features/market/components/MarketSectionDetailScreen.tsx');
  assert.match(section, /isDesignerSection/);
  assert.match(section, /<DesignerFrontCard/);

  const front = read('src/features/market/components/DesignerFrontCard.tsx');
  // Media one side, the designer's facts the other.
  assert.match(front, /flexDirection: 'row'/);
  // The work is swipeable, and the panel names whichever piece is showing.
  assert.match(front, /pagingEnabled/);
  assert.match(front, /Now showing/);
  // And it goes to the catalogue, which is where the standard back control lives.
  assert.match(front, /onOpenCatalogue/);
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${String(error && error.message).split('\n')[0]}`);
  }
}
if (failed) {
  console.error(`Clipping and market chrome contract: ${failed} of ${checks.length} checks failed`);
  process.exit(1);
}
console.log(`Clipping and market chrome contract: ${checks.length} checks passed`);

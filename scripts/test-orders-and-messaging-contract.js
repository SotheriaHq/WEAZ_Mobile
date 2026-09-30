/**
 * Orders lists and the message thread.
 *
 * Four regressions that each looked like a styling preference and were not:
 *
 *  - The custom-order LIST payload is flat (`sourcePrimaryMediaUrl`) while the
 *    DETAIL payload nests (`source.primaryMediaUrl`). The mobile normaliser
 *    read only the nested shape, so every custom order in every list lost its
 *    title, its cover photo and its kind at once — silently, because each read
 *    had a plausible-looking default.
 *  - Both order surfaces drew each order as a bordered rounded card, and the
 *    profile tab had no way to separate standard from custom.
 *  - The thread reloaded itself after every send, re-rendering the list the
 *    composer lives in.
 *  - `[Attachment]` is a placeholder the API stores, not a line anyone wrote.
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

check('a custom order keeps its cover photo, title and kind in a LIST', () => {
  const api = read('src/api/BuyerOrdersApi.ts');

  // The list shape and the detail shape are both read.
  assert.match(api, /function readCustomSource/, 'one place resolves the source');
  for (const flat of ['sourceType', 'sourceId', 'sourceTitle', 'sourcePrimaryMediaUrl']) {
    assert.match(
      api,
      new RegExp(`item\\.${flat}\\b`),
      `the flat list field ${flat} is read`,
    );
  }
  assert.match(api, /nested\.primaryMediaUrl/, 'the nested detail field is still read');

  // And the summary takes its values from the resolver, not from `item.source`
  // alone — the bug was three independent reads each falling back to a default.
  assert.match(api, /const source = readCustomSource\(item\);/);
  assert.match(api, /thumbnail: source\.primaryMediaUrl/);
});

check('an order is a row with a cover, not a card in a stack of cards', () => {
  const row = read('components/orders/OrderListRow.tsx');

  // The cover is the point: an order is a garment.
  assert.match(row, /order\.thumbnail/, 'the row renders the cover');
  assert.match(row, /StableImage/, 'through the shared image component');

  // One hairline underneath, and none under the last row.
  assert.match(row, /borderBottomWidth: StyleSheet\.hairlineWidth/);
  assert.match(row, /last \? null :|!last \?/, 'the last row leaves the rule off');
  assert.doesNotMatch(
    row,
    /^\s*row: \{[^}]*borderRadius/ms,
    'the row itself carries no radius',
  );

  // A custom order has no line items — its count is measurements.
  assert.match(row, /measurement\$\{count === 1 \? '' : 's'\}/);

  // Both order surfaces use it, so they cannot drift apart again.
  for (const file of ['app/(tabs)/me.tsx', 'app/orders/index.tsx']) {
    assert.match(read(file), /OrderListRow/, `${file} uses the shared row`);
  }
});

check('orders can be sorted by kind, and searched, on both surfaces', () => {
  const profile = read('app/(tabs)/me.tsx');
  assert.match(profile, /SegmentedTabs/, 'the profile tab has a kind rail');
  assert.match(profile, /orderKindTabs/);
  assert.match(profile, /STANDARD/);
  assert.match(profile, /CUSTOM/);
  assert.match(profile, /orderSearch/, 'and a search');
  // Filtering happens BEFORE the frame batcher, or search only ever sees the
  // rows already on screen.
  assert.match(profile, /const orderMatches = useMemo/);
  assert.match(profile, /useFrameBatchedItems\(orderMatches/);

  const history = read('app/orders/index.tsx');
  assert.match(history, /KIND_FILTERS/);
  assert.match(history, /matchesKindFilter/);
  assert.match(history, /<SegmentedTabs/);
});

check('the status axis is offered once, as counts, with no rounded pills', () => {
  const history = read('app/orders/index.tsx');

  // The duplicate chip row is gone — it wrote the same state as the counts.
  assert.doesNotMatch(history, /STATUS_FILTERS/, 'no second status control');
  assert.doesNotMatch(history, /statusChip|statPill/, 'and no pill styles left behind');

  // The band is square and shares its rules.
  assert.match(history, /statBand: \{/);
  assert.match(history, /borderLeftWidth: StyleSheet\.hairlineWidth/);
  assert.doesNotMatch(
    history,
    /statBand: \{[^}]*borderRadius/ms,
    'the band has no radius',
  );
});

check('the tab indicator MOVES, and moves on the native driver', () => {
  const tabs = read('components/ui/SegmentedTabs.tsx');
  // translateX + scaleX rather than left/width: a layout pass per frame on the
  // JS thread is exactly what a tab press cannot afford.
  assert.match(tabs, /useNativeDriver: true/);
  assert.match(tabs, /translateX/);
  assert.match(tabs, /scaleX/);
  assert.doesNotMatch(tabs, /useNativeDriver: false/);
  // The first measurement places the bar instead of sliding it in from zero.
  assert.match(tabs, /placedRef/);
});

check('sending a message does not reload the thread', () => {
  const thread = read('app/messages/[threadId].tsx');

  const dispatchStart = thread.indexOf('const dispatchSend = useCallback');
  const dispatchEnd = thread.indexOf('const handleSend = useCallback');
  assert.ok(dispatchStart > 0 && dispatchEnd > dispatchStart, 'dispatchSend is findable');
  const dispatchSend = thread.slice(dispatchStart, dispatchEnd);

  assert.doesNotMatch(
    dispatchSend,
    /loadThread\(/,
    'a send never refetches the conversation it just added to',
  );
  // The one thing a send can change about the thread is its identity.
  assert.match(dispatchSend, /nextThreadId !== targetThreadId/);

  // And nothing locks the composer while a message is in flight.
  assert.doesNotMatch(thread, /!sending &&/, 'no send-in-flight gate on canSend');
  assert.doesNotMatch(thread, /const \[sending, setSending\]/, 'the dead flag is gone');
});

check('the composer is one compact row, and the field has no ring of its own', () => {
  const thread = read('app/messages/[threadId].tsx');

  // `bare` inside a pill the composer draws: no 1.5pt brand focus border, and
  // no left padding pushing the first character off the edge.
  assert.match(thread, /variant="bare"/);
  assert.match(thread, /density="compact"/);
  assert.match(thread, /composerBar: \{/);

  // Send is a mark in a circle, not a 76pt word.
  assert.doesNotMatch(thread, /title="Send"/, 'no "Send" label');
  assert.doesNotMatch(thread, /minWidth: 76/, 'and no slab to hold it');
  assert.match(thread, /<IconButton\s+size=\{44\}/);

  // Compact density exists and is a real height change, not a name.
  const input = read('components/ui/Input.tsx');
  assert.match(input, /density = 'comfortable'/);
  assert.match(input, /isCompact \? 40 : multiline \? 104 : 52/);
});

check('the thread marks where the day changes', () => {
  const thread = read('app/messages/[threadId].tsx');
  assert.match(thread, /function buildThreadRows/);
  assert.match(thread, /'Yesterday'/);
  assert.match(thread, /'Today'/);
  // The list is inverted, so the marker is pushed AFTER the day's oldest
  // message. Getting this backwards labels every day with the one before it.
  assert.match(thread, /opensTheDay/);
  assert.match(thread, /data=\{threadRows\}/);
});

check('the inbox shows a photo, not a placeholder, and drops the internal label', () => {
  const inbox = read('app/(tabs)/inbox.tsx');
  assert.match(inbox, /ATTACHMENT_PLACEHOLDER/);
  assert.match(inbox, /'📎 Photo'/);
  // "Inquiry" was on every non-order row and said the same thing on all of them.
  assert.doesNotMatch(inbox, /return 'Inquiry';/);
  // Order references stay: they say WHICH conversation with a brand this is.
  assert.match(inbox, /Custom #\$\{/);
  assert.match(inbox, /Order #\$\{/);
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
  console.error(`Orders and messaging contract: ${failed} of ${checks.length} checks failed`);
  process.exit(1);
}
console.log(`Orders and messaging contract: ${checks.length} checks passed`);

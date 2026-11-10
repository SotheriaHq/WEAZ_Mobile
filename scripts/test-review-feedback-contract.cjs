/**
 * Content review on the app (owner, Nov 2026).
 *
 *  - A review notification opens the brand's EDITOR (never the shopper view)
 *    until the piece is approved; approved/published open it where the brand
 *    manages it (the Studio editor / the catalogue's Public shelf), never the
 *    shopper product page or design viewer.
 *  - The editor and the preview show what the reviewer asked for, mark the
 *    part of the form it points at, and the submit button says "Resubmit for
 *    review" instead of "Create".
 *  - Notification rows are lighter: 15px/400, the whole sentence in true italic (the
 *    italic faces are loaded), names at 600.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadReviewFeedback() {
  const output = ts.transpileModule(read('src/features/content-review/reviewFeedback.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '@tanstack/react-query') return { useQuery: () => ({ data: undefined }) };
      if (request === '@/src/api/ContentIntegrityApi') return { contentIntegrityApi: {} };
      return require(request);
    },
  });
  return module.exports;
}

const review = loadReviewFeedback();
const cycle = (status, reasonCode = null, extra = {}) => ({
  id: `s-${status}`,
  entityType: 'DESIGN',
  status,
  reasonCode,
  reasonLabel: reasonCode ? 'Label' : null,
  reasonNote: 'Front view is blurry.',
  submittedAt: '2026-11-09T10:00:00Z',
  reviewedAt: '2026-11-09T11:00:00Z',
  ...extra,
});

// Only the newest cycle counts; a resubmission (IN_REVIEW) clears the notes.
assert.equal(review.feedbackFromHistory([]), null);
assert.equal(review.feedbackFromHistory([cycle('IN_REVIEW'), cycle('CHANGES_REQUESTED', 'POOR_IMAGE_QUALITY')]), null);
assert.equal(review.feedbackFromHistory([cycle('APPROVED')]), null);
const changes = review.feedbackFromHistory([cycle('CHANGES_REQUESTED', 'POOR_IMAGE_QUALITY')]);
assert.equal(changes.status, 'CHANGES_REQUESTED');
assert.equal(changes.focus, 'media');
assert.equal(changes.reasonNote, 'Front view is blurry.');
assert.match(changes.guidance, /photos/);
assert.equal(review.feedbackFromHistory([cycle('REJECTED', 'WRONG_CATEGORY_OR_METADATA_MISMATCH')]).focus, 'details');
assert.equal(review.feedbackFromHistory([cycle('CHANGES_REQUESTED', 'UNSAFE_OR_FALSE_CLAIM')]).focus, 'listing');
assert.equal(review.feedbackFromHistory([cycle('CHANGES_REQUESTED', null)]).guidance.length > 0, true, 'a note with no code still guides');

// The button says what it does.
assert.equal(review.submitLabelFor('CHANGES_REQUESTED'), 'Resubmit for review');
assert.equal(review.submitLabelFor('REJECTED'), 'Resubmit for review');
assert.equal(review.submitLabelFor('DRAFT'), 'Create');
assert.equal(review.statusMayCarryFeedback('IN_REVIEW'), false, 'nothing to fix while in review');

// Wiring.
const composer = read('app/(tabs)/catalog/create-design/composer.tsx');
assert.match(composer, /useReviewFeedback\(\{ designId: activeDesignId, status: activeDesignStatus \}\)/);
assert.match(composer, /<ReviewFeedbackCard feedback=\{reviewFeedback\} \/>/, 'the notes sit at the top of the editor');
assert.match(composer, /<ReviewFieldHint feedback=\{reviewFeedback\} focus="media" \/>/, 'photo feedback sits on the photos');
assert.match(composer, /<ReviewFieldHint feedback=\{reviewFeedback\} focus="details" \/>/, 'detail feedback sits on the details');
const preview = read('app/(tabs)/catalog/create-design/preview.tsx');
assert.match(preview, /submitLabelFor\(activeDesignStatus\)/, 'the preview submit button is named for what it does');
assert.match(preview, /<ReviewFeedbackCard feedback=\{reviewFeedback\} \/>/, 'the notes are beside the resubmit button');

// Routing: the editor until approved, never the shopper view.
const routing = read('src/utils/mobileRouting.ts');
for (const type of [
  'CONTENT_SUBMITTED_FOR_REVIEW',
  'CONTENT_RESUBMITTED',
  'CONTENT_CHANGES_REQUESTED',
  'CONTENT_REVIEW_REJECTED',
  'CONTENT_REVIEW_FAILED',
  'CONTENT_PUBLISH_FAILED',
]) {
  assert.match(routing, new RegExp(`CONTENT_REVIEW_EDIT_TYPES = new Set\\(\\[[^\\]]*'${type}'`), `${type} opens the editor`);
}
assert.match(routing, /CONTENT_REVIEW_LIVE_TYPES = new Set\(\['CONTENT_REVIEW_APPROVED', 'CONTENT_PUBLISHED'\]\)/);
// Approved/published: the brand's own surfaces, never a shopper view (owner,
// Nov 2026: "Notifications routing brands to view screens. That is bad.").
{
  const start = routing.indexOf('if (CONTENT_REVIEW_LIVE_TYPES.has(type)) {');
  const end = routing.indexOf('} else {', start);
  assert.ok(start > 0 && end > start, 'the approved/published branch exists');
  const liveBranch = routing.slice(start, end);
  assert.doesNotMatch(liveBranch, /\/products\/\[productId\]/, 'an approved product does not open the shopper product page');
  assert.doesNotMatch(liveBranch, /routeForDesignTarget/, 'an approved design does not open the design viewer');
  assert.match(liveBranch, /routeKey: 'editProduct', productId/, 'an approved product opens in the Studio editor');
  assert.match(liveBranch, /tab: 'Collections', visibility: 'Public'/, "an approved design opens the catalogue's Public shelf");
}
assert.match(routing, /pathname: '\/designs\/\[designId\]\/edit', params: \{ designId \}/, 'designs open in the composer');
assert.match(routing, /routeKey: 'editProduct', productId/, 'products open in the Studio product editor');
assert.ok(
  routing.indexOf('CONTENT_REVIEW_EDIT_TYPES.has(type)') < routing.indexOf("if (targetType === 'DESIGN' && targetId)"),
  'the review branch runs before the generic design (shopper view) target',
);

// Notification typography: lighter, with true italics.
const appText = read('components/ui/AppText.tsx');
assert.match(appText, /\| 'notification'/);
assert.match(appText, /variant === 'notification'\s*\?\s*tokens\.fontFamily\.regular/);
assert.match(appText, /\[tokens\.fontFamily\.regular\]: tokens\.fontFamily\.regularItalic/);
const layout = read('app/_layout.tsx');
assert.match(layout, /Roboto_400Regular_Italic,/, 'the italic face is loaded, not faked');
const notifications = read('app/notifications.tsx');
// The whole sentence slants, not just titles (owner, Nov 2026).
assert.match(notifications, /<AppText variant="notification" italic accessibilityLabel=/, 'the sentence is italic');
assert.match(notifications, /variant="notificationStrong" italic/, 'the actor is italic too');
assert.match(notifications, /variant="notification" tone="primary" italic/, 'titles are italic');
// The count lives on the header action, not as a floating badge.
assert.match(notifications, /title=\{`Mark all as read · /, 'count on the Mark all action');
assert.doesNotMatch(notifications, /unreadPill|headerActions/, 'no separate badge or action row');
// Unread rows are tinted edge to edge; no inset list padding.
assert.match(notifications, /backgroundColor: unread \? theme\.colors\.surface : 'transparent'/, 'the tint marks unread');
assert.doesNotMatch(notifications, /\n {2}content: \{[^}]*paddingHorizontal/, 'the list has no side inset');
assert.doesNotMatch(notifications, /<AppText key=\{key\} variant="bodyBold"/, 'no bold runs in the sentence');

console.log('review feedback contract: all checks passed');

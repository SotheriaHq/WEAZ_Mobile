/**
 * Tagging — what the product used to call "saving" (and, in places, "favouriting".)
 *
 * A shopper who keeps a piece is TAGGING it, and their own tab is their Tags.
 * The backend contract is untouched (`/saved`, `targetType`, `isSaved`): this is
 * the vocabulary the reader sees.
 *
 * Kept byte-identical in wording to `fthreadly/src/constants/tagging.ts`. A
 * shopper who tags on the phone and opens the browser must not be told the two
 * things are different features.
 *
 * Tag and Tagged are two states of one control, not two words for one thing.
 * The glyphs are two different SHAPES, not one shape in two tints, because a
 * tint alone is invisible over a photograph and to anyone who cannot separate
 * the two colours.
 */

/** Outline tag: not tagged yet. */
export const TAG_EMOJI = String.fromCodePoint(0x1f3f7, 0xfe0f);
/** Filled bookmark: tagged. */
export const TAGGED_EMOJI = String.fromCodePoint(0x1f516);

export const TAG_LABEL = 'Tag';
export const TAGGED_LABEL = 'Tagged';
export const UNTAG_LABEL = 'Untag';
/** The shopper's own tab. */
export const TAGS_TAB_LABEL = 'Tags';

export const TAG_ADDED_TOAST = 'Tagged.';
export const TAG_REMOVED_TOAST = 'Untagged.';
export const TAG_ERROR_TOAST = 'Unable to update your tags.';

/** State → the label the control shows. */
export const tagActionLabel = (tagged: boolean): string => (tagged ? TAGGED_LABEL : TAG_LABEL);
/** State → what pressing it will do. Accessibility labels want this one. */
export const tagActionHint = (tagged: boolean): string => (tagged ? UNTAG_LABEL : TAG_LABEL);
/** The one accessibility label for a tag control anywhere in the app. */
export const tagAccessibilityLabel = (tagged: boolean): string =>
  tagged ? 'Remove from your tags' : 'Tag this';

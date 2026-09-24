/**
 * Clipping — what the product used to call "saving" (and, in places, "favouriting").
 *
 * A shopper who keeps a piece CLIPS it, and their own tab is their Clips. The
 * word is the one stylists and editors have always used: a clipping is what you
 * cut out of a magazine and put on a board, which is exactly what this feature
 * is for. It sits with Runway and Market rather than against them.
 *
 * WHY NOT "tag": `tags` already means hashtags across this codebase, and a
 * second meaning for that word would cost every engineer a moment of doubt on
 * every read. `patch` is following a brand and `thread` is reacting, so `clip`
 * is the free slot.
 *
 * Kept byte-identical in wording to `fthreadly/src/constants/clipping.ts`. A
 * shopper who clips on the phone and opens the browser must not be told the two
 * things are different features.
 *
 * Clip and Clipped are two states of one control, not two words for one thing.
 */

/** Paperclip: the invitation. */
export const CLIP_EMOJI = String.fromCodePoint(0x1f4ce);
/**
 * Bookmark ribbon: kept.
 *
 * A different SILHOUETTE, not the same shape in another tint — a tint alone is
 * swallowed over a photograph and says nothing to anyone who cannot separate
 * the two colours. (Scissors would have been the obvious partner to a clip, but
 * ✂️ is already the custom-order mark in `src/constants/bagging.ts`.)
 */
export const CLIPPED_EMOJI = String.fromCodePoint(0x1f516);

export const CLIP_LABEL = 'Clip';
export const CLIPPED_LABEL = 'Clipped';
export const UNCLIP_LABEL = 'Unclip';
/** The shopper's own tab. */
export const CLIPS_TAB_LABEL = 'Clips';

export const CLIP_ADDED_TOAST = 'Clipped.';
export const CLIP_REMOVED_TOAST = 'Unclipped.';
export const CLIP_ERROR_TOAST = 'Unable to update your clips.';

/** State → the label the control shows. */
export const clipActionLabel = (clipped: boolean): string =>
  clipped ? CLIPPED_LABEL : CLIP_LABEL;
/** State → what pressing it will do. Accessibility labels want this one. */
export const clipActionHint = (clipped: boolean): string =>
  clipped ? UNCLIP_LABEL : CLIP_LABEL;
/** The one accessibility label for a clip control anywhere in the app. */
export const clipAccessibilityLabel = (clipped: boolean): string =>
  clipped ? 'Remove from your clips' : 'Clip this';

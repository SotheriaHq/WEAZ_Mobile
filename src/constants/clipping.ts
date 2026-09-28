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

/**
 * The paperclip, in BOTH states.
 *
 * There used to be a second glyph — a bookmark ribbon for "kept" — on the
 * theory that a different silhouette reads over a photograph where a tint
 * would not. It does read, but it reads as a different control: the shape the
 * eye tracks changed on every press, so a shopper had to learn two symbols to
 * understand one button, and neither one on its own told them which state they
 * were in.
 *
 * One mark, and the SURFACE carries the state: a clipped control is filled
 * (brand background), an unclipped one is bare. The icon answers "what does
 * this do", the fill answers "is it on" — and the fill is the affordance every
 * other toggle in the app already uses.
 */
export const CLIP_EMOJI = String.fromCodePoint(0x1f4ce);

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

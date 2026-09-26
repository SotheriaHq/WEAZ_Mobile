/**
 * "Something was clipped since you last looked."
 *
 * The profile's Clips tab is not a react-query list — it is `state.saved`,
 * filled by the screen's own `load()`. So invalidating the saved query keys
 * (which `SavedItemsApi` already does) never reaches it, `useFocusEffect` does
 * not reload the profile, and `load()` coalesces anything inside 15 seconds.
 * Net effect: clip a piece in the viewer, walk straight to the profile, and the
 * tab shows the list it cached before the clip.
 *
 * A counter is enough. `SavedItemsApi` bumps it — one chokepoint, so no call
 * site has to remember — and the profile compares it on focus and reloads only
 * when it actually moved. No subscription, no store, no reload on a focus where
 * nothing happened.
 */

let revision = 0;

/** Called by `SavedItemsApi` after any write to `/saved`. */
export const markClipsChanged = (): void => {
  revision += 1;
};

/** Read by a screen that shows clips, against its own last-seen value. */
export const getClipRevision = (): number => revision;

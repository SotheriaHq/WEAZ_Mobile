# Native Runtime QA

## Status
- [x] Fix Plus sheet render latency (optimize conditional mounting)
- [x] Fix user-facing error policy (generic errors, no technical jargon)
- [x] Fix required-field / Preview blocker
- [x] Fix immediate routing response
- [x] Fix navPerf measurement model

## Fixes Implemented
- **Routing Latency:** Wrapped `router.push`/`router.replace` in `requestAnimationFrame` to ensure visual tap feedback renders before UI thread blocks on navigation.
- **NavPerf Model:** Separated user tap measurement from actual navigation call measurement.
- **Composer Conditional Rendering:** Converted `AppBottomSheet` children to a render prop (`typeof children === 'function' ? children() : children`) and updated `composer.tsx` to pass heavy rendering functions (like `renderDiscoverySections`) as render props. This prevents React from evaluating the entire DOM tree when the sheet is unmounted, directly reducing main thread UI latency.
- **Floating Menu Fix:** Updated `AppFloatingMenu` to synchronously calculate position based on provided `anchorMetrics` rather than waiting for an asynchronous layout measurement, eliminating a double-render flash.
- **Error Policy:** Replaced technical exception messages (e.g. `nextError.message`) with safe, generic fallback errors that the user can understand ("Could not update profile. Please try again.") inside `app/(tabs)/me.tsx`, `app/orders/index.tsx`, `app/orders/[orderId].tsx`, and `app/reviews/index.tsx`.

## Verification Instructions
1. Test opening the Style details, Occasion, and Cultural vibe sheets in the composer; they should open smoothly without heavy lag.
2. Trigger an intentional failure (e.g., turn off network) and attempt to save profile/fittings, or skip a review prompt. Verify the error shown is non-technical.
3. Tap routing links (e.g., Profile icon) and confirm the immediate visual feedback occurs before the screen transition.

# Phase 9B-2: Design Detail/View Consistency, Metadata, and Bagging Validation

## Goal Description
Enhance the immersive view experience for Design Detail/View screens (`MarketCommerceViewer` and `CollectionDetailViewer`), refine the suggestion blocks, polish the UI, and harden the Bagging validation logic in `useMobileBagging`.

## Changes Implemented

### 1. MarketCommerceViewer
- **Media Alignment**: Swapped `StableImage` for `AspectAwareMedia` inside `MediaSlide`. Ensured stable viewer container dimensions. Added post-load dimension fallbacks (`AspectAwareMedia` determines them post-load safely when missing). Added explicit tracking properties to `ViewerMediaEntry` for image dimensions, aspect ratio, blurhash, and dominant color.
- **Suggestion Blocks Deferred Rendering**: Bound `<MobileMarketSuggestionBlocks />` behind a new `suggestionsExpanded` state within the `sheetExpanded` content. It is no longer mounted while hidden, preventing heavy API/render work. Added a "Similar pieces" toggle to access it.
- **Action Buttons**: Removed the explicit `borderWidth: StyleSheet.hairlineWidth` and `borderColor` from `styles.iconButton` to achieve a cleaner ghost aesthetic.

### 2. CollectionDetailViewer (Catalog UI)
- **Right Rail Polish**: Removed `<OwnerAvatar />` from `rightRail` to reduce visual clutter.
- **Info Overlay Footprint**: Shrunk `infoOverlay` `gap` from 8 to 4, reduced `infoBrandRow` `gap` from 10 to 6, and shrunk `infoAvatar` from 44 to 28. Hid the description text to keep the view highly immersive.
- **Action Buttons**: Removed `borderWidth` and `borderColor` from `glassButton`, `glassIconBtn`, and `railBtn` to create a more consistent, airy design without harsh borders.

### 3. Bagging Validation (`useMobileBagging.ts`)
- **Null-Safe Exhaustive Verification**: In both `bagProduct` and `bagSource`, added explicit checks for `fittingState`. The flow correctly permits `COMPLETE` and `NOT_REQUIRED` to proceed with bagging.
- **Missing/Partial Forwarding**: Added explicit routing to `openFittings` for `MISSING` or `PARTIAL` states.
- **Unknown State Fallback**: Handled unknown/loading/error states safely by displaying a toast error and not silently proceeding, ensuring the user is explicitly informed.

## Verification
- Validated TypeScript via `npx tsc --noEmit`.
- Validated Design System conformance via `npm run audit:design-system`.

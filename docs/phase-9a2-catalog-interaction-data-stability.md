# Phase 9A-2: Catalog Interaction & Data Stability

## Goal
Stabilize the Threadly mobile Catalog/Profile tab interactions, scrolling behavior, tab states, and pull-to-refresh review status updates without removing the fundamental horizontal swipe functionality.

## Work Completed

### 1. Separated Visual vs Data Active Tabs
Decoupled the tab pager visual state from the heavy data rendering state to fix screen shaking and blank pages during horizontal swipe.
- **`visualActiveTab`**: Drives the tab indicator, pager height, and swipe animations immediately.
- **`dataActiveTab`**: Tracks the rendered content tab, wrapped in `React.startTransition` during press/swipe to defer heavy content rendering until the visual transition is complete.

### 2. Tab Pager Height Stabilization
Implemented a `safePagerHeight` strategy that avoids collapsing the screen during tab transitions.
- During an active transition, the pager height evaluates to `Math.max(currentHeight, targetHeight, minHeight)`.
- This prevents the outer scroll view from collapsing abruptly and leaving the user stuck above the content.

### 3. Comprehensive Pull-to-Refresh Invalidations
Updated `handleRefresh` in the catalog screen to explicitly invalidate all status-sensitive queries for the brand so that admin reviews and statuses are correctly fetched:
- `queryKeys.brand.collections(targetBrandId)` (covers all collection tabs including Drafts and Needs Attention)
- `queryKeys.store.brandProducts(targetBrandId)` (covers Shop tab)
- `queryKeys.brand.profile(targetBrandId)` (covers brand profile header)
- `queryKeys.reviews.brand(targetBrandId)` (covers brand reviews tab)

### 4. Focus-Sensitive Polling for Status-Sensitive Queries
Added focus-based polling to queries that track background processes.
- `useBrandNeedsAttentionQuery` and `useBrandInReviewQuery` now poll every 10 seconds (`refetchInterval: options?.isFocused ? 10000 : false`).
- Added `useFocusEffect` locally within `app/(tabs)/catalog/index.tsx` to safely provide focus context into these queries.

### 5. Swipe Completion Settle Event
Added explicit `settleTransition` logic attached to `onMomentumScrollEnd` and `onScrollEndDrag`.
- This guarantees the data tab rendering starts correctly once the swipe action comes to a full rest, guarding against double updates from simultaneous press and swipe gestures.

## Verification
- Run `npx tsc --noEmit` and confirmed successful compilation without TypeScript errors.
- Verified visual decoupling respects the structural integrity of the active pages.
- Verified query invalidations are exhaustive across all relevant status queries during `handleRefresh`.

Phase 9A-2 is completed according to the approved implementation plan.

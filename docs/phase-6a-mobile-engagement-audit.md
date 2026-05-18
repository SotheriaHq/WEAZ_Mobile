# Phase 6A Mobile Engagement Audit

Date: 2026-05-18
Scope: audit and documentation only
Repos inspected: `threadly-mobile`, `bthreadly`

## Decision Summary

Wishlist and Moodboard are separate product concepts:

- Wishlist is commerce intent. It is for products or orderable items the buyer may want to buy later.
- Moodboard is inspiration intent. It is for looks, designs, and visual references a user wants to curate.
- V1 should use Moodboard-lite as "Saved Looks" unless named moodboards are added later.
- Existing thread behavior should not be replaced in V1. Phase 6B should only smooth the current thread interaction and animation path.
- V1 should not include parallax, auto-expanding previews, new-drop progress bars, or advanced emoji reactions.

## Current Capability Audit

| Capability | Current support | Evidence | V1 interpretation |
| --- | --- | --- | --- |
| Saved looks / saved designs | Supported as flat saved items. Mobile uses `/saved` for collection/design-style targets. | `src/api/SavedItemsApi.ts`, `src/api/ProfileApi.ts`, backend `users/saved-items.controller.ts` and `saved-items.service.ts` | Treat as inspiration intent. Rename/copy can become "Saved Looks" in Phase 6B, but no data-model change is needed for V1. |
| Product wishlist | Supported and product-only in the mobile commerce paths. | `src/api/StoreApi.ts`, `components/catalog/BrandShopTab.tsx`, backend `store.controller.ts`, `store.service.ts` | Treat as commerce intent. Do not mix with Saved Looks. |
| Backend saved item target types | Backend supports `COLLECTION`, `COLLECTION_MEDIA`, `DESIGN`, and `PRODUCT`. | `bthreadly/src/users/dto/create-saved-item.dto.ts`, `bthreadly/src/users/saved-items.service.ts` | Mobile intentionally blocks product favorites from `/saved` and routes them to wishlist. Preserve this split. |
| Named moodboards | Not found. No `Moodboard` model, mobile API, or named board screen was found. | Repository search across mobile and backend | V2 only. V1 should use one default Saved Looks collection. |
| Collections of saved items | Not found as a user-managed saved collection feature. | Repository search across mobile and backend | V2 only if product wants named moodboards. |
| Profile saved items | Supported through `GET /saved/me`, normalized into profile saved cards. | `src/api/ProfileApi.ts`, `app/(tabs)/me.tsx` | V1 can relabel this surface to Saved Looks later, with existing API data. |
| Brand shop saved filter | Uses product wishlist state, not inspiration saves. | `components/catalog/BrandShopTab.tsx` | Copy should avoid implying moodboard. This is wishlist-backed saved products. |

## Count Field Audit

| Count | Backend status | Mobile exposure | Classification | V1 rule |
| --- | --- | --- | --- | --- |
| likes | Feed payload exposes `stats.likes` / `likesCount`, but backend maps this from collection reactions with legacy fallbacks. | `MarketItem.likesCount`, feed action rail | Ambiguous | Keep existing UI only. Do not use for new social-proof copy until semantics are confirmed. |
| comments | Feed payload exposes media and combined comment counts. | `commentsCount`, `combinedCommentsCount` | Available and reliable for existing comment UI | Can stay in existing rail. Do not invent new proof copy unless count is real and thresholded. |
| threads | Backend media thread toggle returns `threads`; feed exposes media/item thread counts. | `threadsCount`, `FeedViewerMedia.threadsCount` | Available and reliable | V1 may show "X people threaded this" only when count >= 3. |
| patches | Feed payload exposes patch/collab-style counts. | `patchesCount` | Available but not a direct buyer social-proof count | Do not use for V1 item social proof. |
| saves | Saved item rows exist, but no aggregate save count was found in the mobile feed contract. | Not exposed on `MarketItem` | Missing for mobile social proof | Do not show "X saved this" until backend exposes a privacy-safe count. Threshold should be count >= 3. |
| wishlist count | Backend can count a user's wishlist and product wishlists internally, but product-level public count is not exposed in mobile feed/shop contracts. | Not exposed as product public count | Missing for mobile social proof | Do not show. |
| moodboard count | No moodboard model or aggregate found. | Not exposed | Missing | Do not show. |
| views | Backend has collection/product views and `viewsCount`; feed contract does not expose a stable view count for mobile social proof. | Not exposed in mobile feed item types | Available but not exposed to mobile | Do not show in V1. |
| shares | No share count model/API field found. | Not exposed | Missing | Do not show. |
| designer likes | No distinct designer-like count found. | Not exposed | Missing / ambiguous | Do not show. |
| people saved this | Requires aggregate save count and privacy threshold. | Not exposed | Missing | Do not show until backend support exists. |
| trending | Search/scoring uses views and relevance, but feed item contract does not expose an explicit trending flag. | Not exposed | Should not be shown in V1 | Show "Trending" only if backend sends an explicit flag. |
| new drop | Feed items have timestamps; no progress-bar support should be added. | `createdAt`/item timestamps exist in market item shapes | Available as deterministic badge input if product accepts age-based rule | V1 can show a simple New Drop badge from explicit backend flag or a documented timestamp window. No progress bar. |

## V1 Social Proof Rules

1. Use only confirmed real data returned to mobile. Never fake, inflate, or locally infer popularity from missing fields.
2. Hide zero counts where they weaken social proof.
3. Hide weak proof below the useful threshold. Default threshold: `count >= 3`.
4. `X people threaded this` is allowed in V1 only from real thread counts and only when `threadsCount >= 3`.
5. `X saved this` is deferred until mobile receives a backend aggregate save count. When available, show only when `saveCount >= 3`.
6. Do not use likes for new social-proof copy until the backend count semantics are confirmed.
7. Do not use patches as buyer-facing social proof. It represents collaboration/patch behavior, not broad demand.
8. Do not show views, shares, wishlist count, moodboard count, designer likes, or people-saved-this until backend contracts expose those fields clearly.
9. Show `Trending` only from an explicit backend flag or classification.
10. Show `New Drop` only from an explicit backend flag or a documented timestamp rule. Do not add V1 progress bars.

## V1 Animation And Performance Rules

Target devices include Tecno Pop 7-class Android hardware and iPad 5th generation/tablet layouts.

- Prefer transform and opacity animations. Avoid layout animation inside feed rows.
- Do not animate blur. Existing frosted/blurred media backdrops should remain static.
- Avoid parallax in V1. It adds scroll coupling and GPU work with low retention evidence.
- Avoid auto-expanding feed previews in V1. They increase layout churn and can break paging.
- Avoid new-drop progress bars in V1. A simple badge is cheaper and clearer.
- Avoid advanced emoji reaction trays in V1. They add gesture, state, analytics, and rendering complexity.
- Keep feed row components memoized where practical with `React.memo`, `useMemo`, and `useCallback`.
- Use native-driver/Reanimated shared values for micro-interactions where existing infrastructure supports it.
- Keep optimistic toggles bounded. Thread/save/bag actions should not trigger full feed re-renders.
- Add or use a reduced-motion/performance guard before shipping richer interactions.
- Validate on small Android, large Android, and iPad/tablet portrait before closing Phase 6B.

## Analytics Contract

No generic mobile analytics event client or backend event ingestion endpoint was found. Backend analytics currently focuses on daily thread aggregates through `bthreadly/src/analytics`. Phase 6B should add or wire an analytics transport before relying on these events.

Common required properties for all events:

- `eventName`
- `sourceScreen`
- `userId` when authenticated, otherwise anonymous/session id
- `sessionId`
- `timestamp`
- `platform`
- `appVersion`

Privacy baseline:

- Do not send email, phone, raw names, free-form message text, raw IP address, or exact location.
- Use stable ids already used by product APIs.
- For social proof impressions, log the displayed count and threshold, not hidden user identities.

| Event | Trigger | Required properties | Optional properties | Privacy concern | Source screen |
| --- | --- | --- | --- | --- | --- |
| `feed_item_viewed` | Feed item becomes viewable under a viewability threshold. | `itemId`, `itemType`, `feedPosition`, `sourceScreen` | `collectionId`, `mediaId`, `brandId`, `categoryFilter`, `viewDurationMs` | Avoid logging raw media URL. | Runway feed |
| `feed_item_swiped` | User pages from one feed item to another. | `fromItemId`, `toItemId`, `direction`, `sourceScreen` | `fromPosition`, `toPosition`, `categoryFilter` | No personal content payload. | Runway feed |
| `media_angle_swiped` | User swipes carousel media within one feed item. | `itemId`, `mediaId`, `fromIndex`, `toIndex`, `sourceScreen` | `mediaCount`, `aspectClass` | No raw media URL. | Runway feed |
| `design_saved` | User saves a design/collection look through `/saved`. | `targetType`, `targetId`, `sourceScreen` | `collectionId`, `mediaId`, `brandId`, `feedPosition` | Do not expose private saved list contents in public analytics views. | Feed, market, catalog, profile |
| `design_unsaved` | User removes a saved look. | `targetType`, `targetId`, `sourceScreen` | `collectionId`, `mediaId`, `brandId` | Same as save. | Feed, market, catalog, profile |
| `saved_looks_opened` | User opens the Saved Looks surface. | `sourceScreen` | `savedCountBucket` | Use count bucket if needed, not full saved inventory. | Profile |
| `moodboard_created` | User creates a named moodboard. | `moodboardId`, `sourceScreen` | `initialItemCount` | V2 only. Do not log moodboard title if user-generated. | V2 moodboards |
| `thread_tapped` | User taps the existing thread action. | `itemId`, `mediaId`, `sourceScreen` | `currentThreaded`, `threadCount`, `feedPosition` | No private user list. | Runway feed |
| `thread_toggled` | Thread action completes or rolls back. | `itemId`, `mediaId`, `nextThreaded`, `result`, `sourceScreen` | `previousThreaded`, `threadCount`, `errorCode` | No private user list. | Runway feed |
| `brand_opened` | User opens a brand profile/catalog from feed or market. | `brandId`, `sourceScreen` | `itemId`, `mediaId`, `feedPosition` | Do not log brand private fields. | Feed, market, catalog |
| `bag_tapped` | User taps Bag/Bag It. | `sourceType`, `sourceId`, `sourceScreen` | `productId`, `designId`, `collectionId`, `eligibilityState`, `result` | Do not log measurements or payment data. | Feed, market, product, collection |
| `custom_order_tapped` | User starts custom order intent. | `sourceType`, `sourceId`, `sourceScreen` | `brandId`, `eligibilityState`, `result` | Do not log measurement values or design notes. | Feed, market, catalog |
| `new_drop_badge_seen` | A New Drop badge is rendered in a viewable item. | `itemId`, `sourceScreen`, `badgeRule` | `ageHours`, `feedPosition` | No sensitive payload. | Runway feed, market |
| `social_proof_seen` | Social proof text is rendered and viewable. | `itemId`, `proofType`, `countValue`, `threshold`, `sourceScreen` | `feedPosition`, `mediaId` | Counts only, no user identities. | Runway feed |
| `social_proof_tapped` | User taps social proof affordance. | `itemId`, `proofType`, `countValue`, `sourceScreen` | `mediaId`, `feedPosition` | Do not reveal who saved/threaded unless backend has a privacy-approved list. | Runway feed |

## V1 Scope

- Saved Looks / Moodboard-lite using the existing saved-design/saved-collection infrastructure.
- Product Wishlist remains separate and continues to use `/store/wishlist`.
- New Drop badge as a simple deterministic badge from explicit backend flag or timestamp threshold.
- Smoother existing thread/like/save/bag animations using transform/opacity only.
- Conditional social proof from real counts only.
- Analytics client and event instrumentation for the contract above.

## V2 Deferred Scope

- Full named moodboards.
- Moodboard privacy/sharing/collaboration.
- Parallax feed movement.
- Auto-expanding previews.
- New-drop progress bars.
- Multi-emoji quick reactions.
- Advanced social proof such as "people saved this", view milestones, share counts, or friend activity.

Deferral reasons:

- Device performance risk on Tecno Pop 7-class phones and older tablets.
- Feed stability risk from layout-coupled animations.
- Backend/data-model complexity for named boards and social proof aggregates.
- Analytics should exist first so V2 features are informed by real V1 behavior.

## Phase 6B Recommendation

Implement Phase 6B in this order:

1. Add a small mobile analytics abstraction and backend event transport, or explicitly no-op until the backend endpoint exists.
2. Rename/copy the inspiration saved surface to Saved Looks while keeping the existing `/saved` data model.
3. Keep product wishlist UI/copy separate from Saved Looks.
4. Add thresholded V1 social proof for threads only, because it is the reliable mobile count today.
5. Add save-count proof only after backend exposes an aggregate save count in the feed contract.
6. Add a simple New Drop badge from an explicit backend flag or timestamp threshold.
7. Smooth existing thread/save/bag micro-interactions with transform/opacity, memoization, and no layout animation.
8. Run device QA on Tecno Pop 7 or equivalent small Android and iPad/tablet portrait before closing the phase.

## QA Checklist For Phase 6B

- Saved Looks and Wishlist labels do not conflict.
- Product wishlist actions still use `/store/wishlist`.
- Design/collection saved looks still use `/saved`.
- Thread social proof only appears when `threadsCount >= 3`.
- Save social proof stays hidden until a real aggregate count exists.
- New Drop badge does not animate layout or show a progress bar.
- Feed paging and media fit from Phase 5A remain intact.
- Thread/save/bag actions do not re-render the whole feed.
- Reduced-motion or performance guard is respected when added.
- Analytics events do not include private text, raw media URLs, email, phone, IP, or exact location.
- Tecno Pop 7-class Android and iPad/tablet QA are completed.

## Phase 6A Checklist

- [x] Wishlist vs Moodboard distinction documented.
- [x] Existing save/wishlist APIs audited.
- [x] Real social proof counts audited.
- [x] Missing count fields documented.
- [x] V1 social proof thresholds defined.
- [x] Low-end device animation rules documented.
- [x] V2 deferred features documented with reasons.
- [x] Analytics events documented.
- [x] Phase 6B implementation scope defined.

# Phase 6B Mobile V1 Engagement Implementation

Date: 2026-05-18
Scope: mobile V1 engagement improvements based on Phase 6A audit

## Summary

Phase 6B implemented V1-safe engagement improvements without adding V2 product behavior or assuming unavailable backend fields.

- Wishlist remains commerce intent through `/store/wishlist`.
- Saved Looks remains inspiration intent through the existing `/saved` design/collection save system.
- No named moodboard model, API, or screen was added.
- Social proof uses only real thread counts and only renders at `threadCount >= 3`.
- Likes, saves, views, shares, wishlist counts, and moodboard counts are not used for new social-proof copy.
- New Drop uses real item timestamps with a 72-hour rule.
- Animations stay low-cost: transform/opacity only, no animated blur, no parallax, no auto-preview, no progress bar, and no layout-changing feed animation.

## Analytics

Mobile now has a typed no-op-safe analytics wrapper at `src/analytics/mobileAnalytics.ts`.

The wrapper is intentionally non-blocking:

- UI interactions do not await analytics calls.
- Analytics failures are caught and ignored.
- No email, phone, raw message text, raw media URL, exact location, or other sensitive payloads are sent.
- Until a real mobile analytics transport exists, events are dev-visible only and production-safe no-ops.

Events wired in Phase 6B:

- `feed_item_viewed`
- `feed_item_swiped`
- `media_angle_swiped`
- `design_saved`
- `design_unsaved`
- `saved_looks_opened`
- `thread_tapped`
- `thread_toggled`
- `brand_opened`
- `bag_tapped`
- `custom_order_tapped`
- `new_drop_badge_seen`
- `social_proof_seen`
- `moodboard_section_seen`
- `moodboard_suggestion_seen`
- `moodboard_suggestion_opened`
- `moodboard_suggestion_saved`

Backend still needs a privacy-safe event ingestion endpoint before analytics can drive production decisions.

## Saved Looks And Wishlist Separation

Saved Looks:

- Inspiration intent.
- Uses existing `/saved` APIs.
- Feed and Market design save actions use Saved Looks copy.
- Profile saved tab is user-facing as `Saved Looks`.

Wishlist:

- Commerce intent.
- Uses existing `/store/wishlist` APIs.
- Product/shop copy remains wishlist-oriented.
- Product wishlist behavior was not merged with Saved Looks.

## New Drop Rule

The V1 New Drop badge is timestamp-based and deterministic:

- Source: `createdAt` from the item/media/product/design shape.
- Rule: show only when content age is within 72 hours.
- Animation: static badge only.
- Rendering: tokenized badge that does not block media or action rails.

If the backend later exposes an explicit `isNewDrop` or campaign flag, that should replace the timestamp-only heuristic.

## Thread Social Proof Rule

The only V1 social-proof copy added is thread-count proof:

- Copy: `X people threaded this`.
- Data source: real thread/comment-thread count already exposed to mobile.
- Threshold: hidden unless `threadCount >= 3`.
- Hidden for zero, one, and two.

Explicitly not used:

- Likes, because semantics remain ambiguous.
- Save counts, because aggregate saves are not exposed to mobile.
- Wishlist counts, moodboard counts, view counts, share counts, and fake trending.

## Recommendation Foundation

Reusable scoring lives at `src/recommendations/recommendationScoring.ts`.

The service is deterministic, section-aware, and explainable. It accepts:

- recommendation candidates;
- optional user interaction profile;
- section type;
- section weights;
- exclusion rules;
- diversity rules.

V1 moodboard suggestion weights:

- taste match: 35%;
- social signal: 20%;
- commerce readiness: 15%;
- brand affinity: 10%;
- freshness: 10%;
- diversity/exploration: 10%.

Missing fields are skipped and remaining available weights are normalized. The service never fabricates metrics.

Diversity caps used by the V1 Market moodboard section:

- max 2 items per brand;
- max 4 items per category/tag cluster;
- default limit 10.

## For Your Moodboard Market Section

Market now has a V1 moodboard-lite section labeled `For your moodboard`.

Candidate rules:

- design/look candidates only;
- exclude already-saved items when saved state exists;
- exclude broken/unready media;
- exclude hidden, reported, or unavailable candidates when fields exist;
- use thread count as the safe social signal;
- use timestamp freshness;
- use category/tag taste signals when available;
- use commerce readiness only when a real field exists;
- apply brand/category diversity caps.

The section is hidden when there are no valid candidates.

## V2 Deferrals

The following remain V2:

- named moodboards;
- full moodboard management screen;
- moodboard privacy/sharing/collaboration;
- visual similarity or embeddings;
- color/fabric similarity learning;
- parallax;
- auto-expanding preview;
- new-drop progress bar;
- multi-emoji quick reactions;
- advanced social proof such as `X saved this`, view milestones, share counts, or friend activity.

Deferral reasons remain unchanged:

- older Android and iPad performance risk;
- feed stability risk from layout-coupled interactions;
- backend/data-model complexity;
- analytics should exist first so V2 is informed by real V1 behavior.

## Backend Needs

Future backend/mobile contracts needed before V2:

- privacy-safe aggregate save count for designs/looks;
- aggregate wishlist count if product proof is desired;
- explicit trending/new-drop flags if those labels should mean more than age;
- named moodboard model and CRUD APIs;
- mobile analytics event ingestion endpoint;
- optional user-interest profile endpoint if recommendation personalization should become server-backed.

## QA Checklist

- [x] Wishlist vs Moodboard separation preserved.
- [x] Saved Looks uses existing `/saved`.
- [x] Wishlist uses existing `/store/wishlist`.
- [x] No named moodboard feature added.
- [x] Thread social proof threshold set to `>= 3`.
- [x] Likes are not used for new social proof.
- [x] Save/view/share/wishlist proof is not shown.
- [x] New Drop uses real timestamps and a 72-hour threshold.
- [x] No parallax, auto-preview, progress bar, animated blur, or layout animation added.
- [x] Analytics calls are no-op-safe.
- [x] TypeScript passed.
- [x] Design-system audit passed.
- [x] Diff check passed with CRLF warnings only.

# Phase 4A Shopper Surface Polish

## Scope

Phase 4A improves the native shopper profile, order discovery, settings density, catalog header controls, dark theme, feed filter contrast, bottom navigation, and New Drop treatment. Messaging, chat, search behavior, backend contracts, web behavior, and protected system-bar/navigation-safe-area infrastructure are unchanged.

## Implemented behavior

- Shopper profile actions use an explicit three-plus-two layout with semantic accent treatments. The handle uses the primary accent and the summary statistics are borderless.
- Orders open as an embedded profile tab. The preview merges standard and custom order summaries, shows at most six recent orders, handles loading/empty states compactly, and links to order detail or the complete Orders screen.
- The full Orders screen keeps its filters, review prompts, search, refresh, empty/error behavior, and back fallback. Its five statistics now occupy one horizontally scrollable compact row and can select the corresponding status filter.
- Settings option/toggle primitives use divider rows with reduced horizontal inset. The duplicate Orders shortcut was removed from the Settings shopping group; Saved runway and Measurements remain intentional task shortcuts.
- Floating menus estimate width from their longest label, clamp to the viewport, omit the icon column when no icon exists, and preserve outside-tap, Android-back, close animation, and pressed behavior.
- Catalog top controls are role-aware: owners receive Settings/Store; authenticated shoppers receive Settings plus public sharing actions and a notification bell; unauthenticated visitors receive public sharing actions without a notification bell. Patch, Message, and Share profile actions remain available in the header body.
- The catalog banner renders behind the top inset while its controls receive the safe-area offset. No protected app-shell/system-bar file was modified.
- Dark surfaces use layered charcoal rather than pure black. Dark feed navigation chips have a clearer inactive/selected surface; light-theme chip behavior is unchanged.
- Bottom navigation uses clearer Runway/Shop/Bag/Inbox semantics and 12px tokenized labels without changing route mapping or island safe-area math.
- New Drop uses a softer accent surface, organic sparkle label, hairline outline, and lighter elevation while preserving the low-cost transform-only pulse and session dismissal rule.

## Data and compatibility notes

`BuyerOrdersApi.list` accepts an optional bounded limit. It still calls the existing `/store/orders` and `/custom-orders` endpoints, merges and sorts their existing normalized summaries, and slices only after sorting. The full Orders screen retains its default 50-item cap; the profile requests six. No schema, endpoint, or response shape changed.

The profile warm-state key was versioned because the embedded order payload moved from the standard-only profile DTO to the existing unified buyer order summary. This prevents incompatible in-memory snapshots from rendering after a fast refresh.

## Validation

- `npx tsc --noEmit`
- `npm run audit:design-system`
- `npm run test:brand-profile-contract`
- `node scripts/test-catalog-entity-contract.js`
- `npm run test:design-editor-contract`
- `npm run test:measurement-bagging-contract`
- `npm run test:shopper-settings-contract`
- `git diff --check`

All automated checks pass. Real-device visual and interaction QA remains required.

## Manual QA matrix

- 360px Android with large text: verify the three-plus-two profile action layout, two-line labels, embedded order rows, and View all orders.
- Slow/offline authenticated profile: verify compact recent-order loading, cached content preservation, empty state, pull-to-refresh, and no duplicate order navigation.
- Full Orders: verify standard/custom merge, all five stat selectors, existing status chips/search, review prompts, detail navigation, and back to profile.
- Settings: verify divider rows, selected theme/sizing state, Saved runway and Measurements routes, and absence of the duplicate Orders shortcut.
- Catalog owner: verify edge-to-edge banner, safe top controls, notification badge, Settings/Store menu, create menu, QR, and Share.
- Catalog authenticated shopper: verify notification bell; Settings, Share, Copy, and QR menu items; and Patch/Message/Share actions.
- Catalog signed out: verify Search and Share/Copy/QR menu, no notification bell, and auth gating for shopper-only actions.
- Dark and light themes: verify card separation, text contrast, feed chips, floating-menu width, and no light-theme regression.
- Bottom island: verify Runway, Shop, Bag, Inbox, and profile routes, badges, pressed state, long profile label, and small-width clipping.
- New Drop: verify pulse cost, compact/full copy, dark/light contrast, and dismissal after an active item leaves view.

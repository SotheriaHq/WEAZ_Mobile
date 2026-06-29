# Native Navigation Timing — Real-Device QA Checklist

Dev-only `[NAV_PERF]` instrumentation (`src/utils/navPerf.ts`) measures the
tap → route shell → first paint → data-ready timeline for high-value flows.
It is `__DEV__`-only and emits **nothing** unless `EXPO_PUBLIC_DEBUG_NAV=1`.

## How to run

```bash
EXPO_PUBLIC_DEBUG_NAV=1 npx expo start --dev-client --host tunnel
```

Open the dev build on a real Android/iOS device, then watch the Metro / device
log stream for `[NAV_PERF]` lines. Each line is:

```
[NAV_PERF] <stage> <flow> +<ms since tap>ms
```

Stages, in order: `tap → navigation_called → screen_mounted → first_visible_ui → data_ready`.

> Note: shared destinations (product detail, design detail) emit their **own**
> flow label (`product_detail`, `design_detail`) while the `+ms` offset stays
> relative to the originating tap. So `wishlist→product` shows a `tap` /
> `navigation_called` under `wishlist→product`, then `screen_mounted` /
> `data_ready` under `product_detail` — correlate by the ascending `+ms`.

## Flows instrumented

| # | Flow | tap+navigation_called | screen_mounted/first_visible_ui/data_ready |
|---|------|----------------------|--------------------------------------------|
| 1 | Tabs → Market | `app/(tabs)/_layout.tsx` (`tabs→market`) | `MarketScreen` |
| 2 | Tabs → Designs/Runway | `app/(tabs)/_layout.tsx` (`tabs→runway`) | `MarketFeedScreen` |
| 3 | Market → section detail | `MarketScreen.openApiSection` (`market→section`) | `MarketSectionDetailScreen` |
| 4 | Wishlist → product | `app/(tabs)/me.tsx SavedDesignCard` (`wishlist→product`) | shared `product_detail` / `design_detail` |
| 5 | Notifications → target | `app/notifications.tsx` (`notifications→target`) | shared target detail screen (varies) |
| 6 | Profile → settings | `app/(tabs)/_layout.tsx onOpenSettings` (`profile→settings`) | `app/settings.tsx` |
| 7 | Messages → thread | `app/(tabs)/inbox.tsx` (`inbox→thread`) | `app/messages/[threadId].tsx` |
| 8 | Cart/bag → checkout | `components/bagging/MyBagSheet.tsx` (`bag→checkout`) | `MobileCheckoutScreen` |

Pre-existing from Phase 2: `search→<type>`, `back`, `product_detail`,
`design_detail`, `create_design`.

## Test sequence (capture per flow)

1. Search → brand result
2. Search → back
3. Tabs → Market
4. Market → product
5. Product → back
6. Market → section detail
7. Runway/design feed → design detail
8. Design tab → create design
9. Create design → option modal
10. Wishlist (Profile → Saved Looks) → product
11. Notifications → target
12. Profile → settings
13. Messages → thread
14. Cart/bag → checkout

For each, record the four deltas:

```
tap            -> navigation_called
navigation_called -> screen_mounted
screen_mounted -> first_visible_ui
first_visible_ui -> data_ready
```

## Classification

- **PASS** — route shell appears immediately (small tap→navigation_called,
  small navigation_called→screen_mounted→first_visible_ui).
- **FAIL: nav delay** — `navigation_called` lags well behind `tap`.
- **FAIL: mount delay** — `screen_mounted` lags well behind `navigation_called`.
- **FAIL: paint delay** — `first_visible_ui` lags well behind `screen_mounted`.
- **DATA_ONLY** — shell appears fast but `data_ready` arrives much later
  (acceptable: network/data cost, not a routing blocker).

## Signals not available (documented, not forced)

- **Notifications → target**: the destination is dynamic (product/design/post/
  thread/profile). The entry emits `tap`/`navigation_called` only; the
  destination emits its own `screen_mounted`/`data_ready` if that screen is
  instrumented (product/design/thread are). Generic post/profile targets have no
  per-screen data-ready hook yet — capture tap→navigation_called only.
- **Cart/bag → product**: bagging adds items via sheets, not a product route, so
  the only bag-originated navigation is `bag→checkout`. Product drilldown from a
  bag context reuses the shared `product_detail` flow.

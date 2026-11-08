# Product card, Bag It and Market section system

One card, one bag mark and one set of section rules across Studio's store grid
(web, also shown inside the app's WebView), a brand's Shop tab and Market — on
web desktop, tablet, mobile browser and the native app.

## 1. The product card

Layout follows the familiar video-feed card: the photograph owns the top of the
card, edge to edge; everything you read sits underneath it on the card surface.

| Part | Rule | Why |
| --- | --- | --- |
| Photo frame | Fixed 100:148 (`PRODUCT_TILE_MEDIA_RATIO = 1.48`), cover crop, rounded | A fixed frame keeps rails and grids even; one ratio everywhere makes a product the same object in Studio, the Shop tab and Market. |
| Over the photo | Only small corner controls (clip/wishlist, New Drop, owner status) with a light top band | Copy laid on the image needs a dark wash to stay legible, and the wash dulls every product. Moving copy off the photo lets the image stay at full colour. |
| Title | Two lines always reserved | A one-line and a two-line name produce cards of the same height, so a row's prices and buttons line up. |
| Meta line | Brand (Market/Shop) or views (owner) — always rendered | Keeps the body height constant. |
| Price | Gradient/primary money style, compare-at struck through | Price is the second thing a shopper reads after the photo. |
| Action | Bag It (shared button) or View; every card has one | A row never changes height mid-row. |

Implementations: web `src/components/commerce/ProductTile.tsx` (compound parts:
`Root`, `Media`, `Body`, `Title`, `Meta`, `Price`) used by `StoreProductCard` and
the Studio store grid; native `components/commerce/UnifiedProductCard.tsx`.

## 2. Bag It

- **One mark everywhere:** the shopping-bags emoji `BAG_IT_EMOJI` (U+1F6CD + VS16)
  on its light plate. It is never typed inline into a label. The web chip names
  colour-emoji fonts first so no symbol font can substitute a monochrome glyph.
- **The pulse is the point.** Whenever bagging is possible the button beats (a
  double beat, then a rest). Motion is the strongest pre-attentive cue on a page
  of still photographs; it pulls the eye to the action. A still button means
  "not available" (sold out, own product, brand account) without extra copy.
- **Cost-bounded motion.**
  - Web: only `transform` and the `opacity` of a pre-painted glow animate, so
    thirty cards stay on the compositor (no per-frame `box-shadow` repaint).
  - Native: one shared clock (`src/features/bagging/bagHeartbeat.ts`) drives every
    button in step, in bursts that keep the UI thread animating under 25% of the
    time; only focused screens subscribe; it stops in the background, when no
    button is mounted, and under the system reduce-motion setting. An endless
    loop per card previously cost a 24MB GC every ~1.3s on Android.
  - Both honour reduce motion.
- **No double requests.** Web ignores taps while a request is in flight; native
  uses `Button`'s single-fire guard.

## 3. Market sections

### Laws applied

1. **Proximity (Gestalt).** Space between sections is at least 3x the space
   between a section's title and its cards (native 40:12, web 48:16). Each title
   then clearly belongs to the cards below it, so sections separate without
   rules or boxes.
2. **Common region.** Collections — groups of pieces, a different kind of thing —
   sit on a tinted band. The change is visible before a card is read.
3. **Similarity and contrast (Von Restorff).** Formats vary by entity so the page
   has landmarks: portrait product rails, two-row grids, landscape collection
   covers, rounded-square brand marks, short style tiles. No more than two
   identical formats should run back to back.
4. **Hierarchy.** Each header is a shopper-facing label (uppercase, brand colour),
   then an emoji marker and the title (heavier and larger than any card text),
   then "See all". Labels describe what the shopper will find and never claim
   more than the data behind them (a stock filter is never called "best sellers").
5. **Affordance through peeking.** Rail card widths leave part of the next card
   visible (about 2.3 cards on a phone), which tells a thumb the row scrolls.
6. **Fixed section height.** More items make a section longer sideways, never
   taller. Rails are one row; grid formats are two rows; all scroll inline with
   snapping, and with no scrollbar, tap highlight or overscroll glow. Keyboard
   focus rings stay for keyboard users only.

### Format selection

`resolveMarketSectionFormat(layout, entityTypes)` (web and native twins, kept
equal by `threadly-mobile/scripts/test-market-presentation-contract.js`):

| Section holds / API layout | Format |
| --- | --- |
| only collections | `collection-rail` (landscape collage of product covers) |
| only brands | `brand-rail` |
| only categories | `category-grid` (two rows, sideways) |
| `PRODUCT_GRID` | `product-grid` (two rows, sideways) |
| any products or designs | `product-rail` |

Collection covers are built from the products the collections endpoint already
returns — no extra request per card. Images resolve through the shared cached,
de-duplicated resolvers on both platforms; web cards fetch only the cover until
hovered.

## 4. What is deliberately not inline-scrolled

A brand's full catalogue (Shop tab, Studio store) is the page's primary list, not
a section. It stays a single scroll owner: virtualized on native, paginated on
web. Nesting a second vertical scroller inside the page creates scroll traps and
is prohibited for primary grids.

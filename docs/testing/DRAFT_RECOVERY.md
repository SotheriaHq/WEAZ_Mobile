# Draft recovery and catalogue freshness

The design composer must keep the same hook order while a saved draft loads,
when loading is retried, and when the editor becomes usable. Footer measurement
hooks run before the loading return; retaining the loading screen is required.

`npm run test:catalog-draft-recovery` renders the actual composer through those
transitions and presses Save draft. It also runs real Query observers against
the catalogue API mapper to check navigation refresh, unselected bucket data,
cached cards during an outage, a single recovery refresh, and owner isolation.
The regression fails with the original composer from SIT770f498. Both the
quality gate and Android build run this test.

Catalogue route focus and foreground resume revalidate the routed owner's
profile and collection queries while leaving cached content visible. Requests
bypass settled transport/profile caches. Failed reads reject instead of being
cached as empty success; an uncached failed tab offers Retry. Manual refresh
uses the same refresh path rather than racing a direct fetch with invalidation.

Product drafts run in Studio's shared web implementation on desktop, tablet,
mobile browser and native WebView. Its regression suite covers failed media
resume separately in `src/features/products/productPublishJob.test.ts`.

Device acceptance: open Needs Attention, choose Retry / Edit, wait for the
existing design to load and confirm its photos and fields remain. Return to
Catalogue, visit another screen, return and check tab counts/cards without
pulling to refresh. Repeat after backgrounding. In airplane mode, cached cards
must remain and an uncached tab must offer Retry rather than imply deletion.
Do not uninstall or clear application data to verify a recovery fix.

The original retry crash was reproduced on Android before the fix. Post-fix
device acceptance is pending reconnection; automated checks do not replace it.

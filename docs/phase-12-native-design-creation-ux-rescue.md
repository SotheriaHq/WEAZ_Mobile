# Phase 12 Native Design Creation UX Rescue

Date: 2026-06-19

## Audit Summary

| Task | Finding | Resolution |
| --- | --- | --- |
| P12B-01 launch and splash | App startup already uses `SplashScreen.preventAutoHideAsync`, a matching JS fallback splash, and one native hide path. No protected app-shell defect was proven from code. | No app-shell or system-bar files changed. Manual slow-device startup smoke still recommended. |
| P12C-01 selector sheets | Non-input selectors always observed animated keyboard height, so a previous input keyboard could leave later sheets floating. Category action copy still said `Use selection`. | Added `keyboardBehavior` to `AppBottomSheet`, used no-keyboard mode for chip/select sheets, added drag-down close, and updated category/tag action copy. |
| P12C-01 hashtags | Custom selected tags could lose the pending-review marker after reopening the sheet. | Pending state now includes unknown selected tag values, not only tags added during the current open session. |
| P12C-01 custom orders | Native, web, and backend still used old 5-13 day rush and 3-14 day production limits. | Production is now 1-7 days. Rush uses the existing days field with a 1-3 day cap, which represents 72 hours without a schema rename. |
| P12C-01 save progress | Preview waited on upload/save progress, leaving the user stuck on Preview with disabled controls. | Publish now routes immediately to Catalog > Collections > In Review and renders a disabled optimistic progress card while upload continues. |
| P12D-01 catalog/profile polish | Owner profile showed a corrupted patch stat label, oversized menu, and QR row with a wide blank hit area. | Stat label is now Patch/Patches, menu width is compact, menu rows retain 44px tap height, and QR/contact rows share content-width hit areas. |
| P12D-01 upload card status | Background publish tasks were not visible in the In Review lane and had no card-level progress UI. | In Review now includes running publish tasks. Cards render dimmed media, percent text, progress bar, and current task message. |
| P12E-01 parity | Web and backend could still accept values mobile rejected. | Backend DTO/service, seed fixtures, web editor validation/copy, and relevant tests/contracts were aligned. |

## Files Changed

Mobile:
- `app/(tabs)/catalog/create-design/composer.tsx`
- `app/(tabs)/catalog/index.tsx`
- `components/catalog/BrandProfileHeader.tsx`
- `components/catalog/CollectionCard.tsx`
- `components/ui/AppBottomSheet.tsx`
- `components/ui/AppFloatingMenu.tsx`
- `components/ui/AppSelectSheet.tsx`
- `scripts/test-brand-profile-contract.js`
- `scripts/test-design-editor-contract.js`
- `src/api/BrandApi.ts`
- `src/features/design-editor/DesignEditorProvider.tsx`

Backend:
- `prisma/seed.ts`
- `src/custom-order-configurations/custom-order-configurations.service.ts`
- `src/custom-order-configurations/dto/custom-order-configurations.dto.ts`
- `test/custom-order-admin.e2e-spec.ts`

Web:
- `src/components/custom-orders/CustomOrderConfigurationEditor.tsx`
- `src/__tests__/CustomOrderConfigurationEditor.test.tsx`

## Validation

Passed:
- `threadly-mobile`: `npm run test:design-editor-contract`
- `threadly-mobile`: `npm exec tsc -- --noEmit`
- `threadly-mobile`: `npm run audit:design-system`
- `threadly-mobile`: `npm run test:aspect-aware-media`
- `threadly-mobile`: `npm run test:brand-profile-contract`
- `fthreadly`: `npm exec tsc -- --noEmit`
- `fthreadly`: `npm test -- --run src/__tests__/CustomOrderConfigurationEditor.test.tsx`
- `bthreadly`: `npm exec tsc -- --noEmit`
- `bthreadly`: `npm run build`
- all repos: `git diff --check`

Blocked or unrelated failures:
- `fthreadly npm run lint` still fails on unrelated `src/pages/admin/AdminContentReviewPage.tsx` raw `<img>` invariant.
- `bthreadly npm run test:e2e -- --runTestsByPath test/custom-order-admin.e2e-spec.ts --runInBand --testTimeout=30000` ran but failed on existing payout-status assertions, not on custom-order lead-day validation.

## Manual QA Needed

- On Android, open create design, category, style details, hashtags, and permission sheets after using an input sheet; confirm no stale keyboard lift.
- Publish from Preview with multiple media; confirm immediate route to Catalog > In Review and a progress card with percent/message.
- Confirm failed publish tasks appear only in Needs Attention with Retry/Edit and Dismiss.
- Confirm profile owner menu is compact and QR row only responds on visible content.
- Confirm web custom-order editor rejects production > 7 and rush > 3 days.


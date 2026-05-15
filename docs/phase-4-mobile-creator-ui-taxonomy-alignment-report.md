# Phase 4 Mobile Creator UI Taxonomy Alignment Report

## 1. Summary of changes

Aligned the mobile create-design composer and preview screens with the creator metadata contract while preserving the existing backend payload fields. Core metadata is now visible in compact rows instead of being hidden behind a generic "More options" sheet, and publish/go-live validation now requires structured discovery metadata and hashtags without blocking flexible draft saves.

## 2. Files changed

- `app/catalog/create-design/composer.tsx`
- `app/catalog/create-design/preview.tsx`
- `components/ui/AppSelectSheet.tsx`
- `src/features/design-editor/DesignEditorProvider.tsx`
- `src/utils/creatorMetadata.ts`
- `docs/phase-4-mobile-creator-ui-taxonomy-alignment-report.md`

## 3. Screens audited

- Create-design composer
- Create-design preview
- Design editor provider save/publish flow
- Category and garment type selection sheet
- Audience selection
- Discovery filter rendering
- Hashtag selection
- Custom-order and measurement selection
- Shared select and multi-select bottom sheets

## 4. Before/after label mapping

- `Privacy` -> `Who can see this?`
- `Category` -> `What is it?`
- `Subcategory` -> `Garment type`
- `Audience` -> `Who is it for?`
- `More options` -> removed as the main metadata entry point
- `Discovery filters` -> `Style details`, `Cultural vibe`, `Where would you wear it?`
- `Tags` -> `Hashtags`
- `Publish` -> `Go live`
- `Published` -> `Live`

## 5. Discovery dimension handling

Mobile now filters and sorts active creator discovery dimensions in this order:

1. `style`
2. `heritage`
3. `occasion`
4. `fabric`
5. `color-family`
6. `fit`

Legacy dimensions are excluded from current creator metadata:

- `fabric-type`
- `fit-shape`
- `designer-location`
- `price-range`

Unknown active dimensions that apply to `DESIGN` or `COLLECTION` are still rendered gracefully in the Style details sheet using their backend name.

## 6. Metadata loading/caching/error behavior

The provider continues to load category and filter metadata once for the design editor flow. Category and filter fetches now use separate settled results so a metadata fetch failure does not crash the composer. The composer shows a retryable metadata warning, draft save remains possible, and preview/go-live remains blocked until required metadata is available and selected.

## 7. Draft behavior

Draft saves remain flexible. A draft can still be saved with partial metadata when the current draft UX allows it. The stricter metadata checks apply only to preview/go-live and publish saves.

## 8. Preview/publish validation behavior

Preview/go-live now requires:

- Required media
- Title
- What is it?
- Garment type
- Who is it for?
- At least one active structured style detail
- At least one hashtag
- Existing custom-order required fields and pricing when custom orders are enabled

User-facing validation copy uses:

- `Choose what this item is.`
- `Choose a garment type.`
- `Choose who this item is for.`
- `Add at least one style detail.`
- `Add at least one hashtag.`

Technical backend terms such as `categoryId`, `subCategoryId`, `categoryTypeId`, `filterValueIds`, `FilterDimension`, and `EntityFilter` are not exposed in creator-facing validation.

## 9. API payload compatibility confirmation

The mobile API payload field names were not renamed. The flow still sends:

- `visibility`
- `type`
- `categoryId`
- `subCategoryId`
- `categoryTypeId`
- `tags`
- `filterValueIds`
- `sizingMode`
- `customOrderEnabled`
- `customMeasurementKeys`
- `fitPreference`
- `targetAgeGroup`
- Custom-order pricing, policy, fabric sourcing, and measurement fields

## 10. UI compactness changes

The composer keeps one compact metadata card using short `OptionRow` rows and bottom sheets for detail selection. No large card was added per metadata field. Helper copy is kept in bottom-sheet subtitles and compact sheet section captions. Existing custom-order and measurement controls remain in their existing availability/custom-order areas.

## 11. Commands run and results

- `npm exec tsc -- --noEmit` - passed
- `npm run test:design-editor-contract` - passed
- `npm run audit:design-system` - passed
- `git diff --check` - passed with existing line-ending normalization warnings only

## 12. Known limitations

- Existing drafts with old inactive filter selections will not crash, but inactive/legacy dimensions are not rendered as current metadata. Users must choose at least one active structured style detail before going live.
- No new automated UI tests were added because this mobile repo currently exposes contract scripts rather than a screen-level test harness for the composer/preview UI.
- No local device/emulator manual run was performed in this phase.

## 13. Explicit exclusions

Backend files were not changed. Web files were not changed. Feed scoring, feed rendering, recommendation logic, market/feed redesign, and interaction event tracking were not implemented.

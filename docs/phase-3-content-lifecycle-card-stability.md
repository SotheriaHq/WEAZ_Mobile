# Phase 3 Content Lifecycle and Card Stability

## Upload and route-back lifecycle

Both Publish and Save draft validate and build the full payload before creating a persisted client task. Publish immediately routes to Catalog > Content > In Review; draft immediately routes to Drafts. Upload continues from the editor provider after navigation. Progress comes only from `saveDesignEditor` callbacks and is never timer-faked.

The task card states are:

- `running`: cover preview, circular progress, percentage, and current upload message;
- `complete`: task snapshot is cleared, catalog queries are invalidated, and the server card replaces the task card;
- `failed`: the card remains for 24 hours with its actual error and Retry/Edit plus Dismiss actions.

The full-card task scrim uses opacity only. It is intentionally blur-free for low-end Android. Normal cards no longer receive a full-image dark tone overlay; only the bottom metadata gradient remains.

## Edit and retry

Post-ID failures route through `/designs/[designId]/edit`. The alias forwards both `designId` and the failed task id, and the editor hydrates the server detail plus active custom-order configuration. Starting a replacement save removes the superseded failed task.

Pre-ID failures persist a snapshot inside the existing AsyncStorage task. The snapshot contains the complete form, media asset descriptors/local URIs, cover selection, tags through `form.tagsInput`, category/style/filter values, prices, visibility, custom-order/delivery/rush data, measurement keys, and draft metadata. Retry reopens the composer with `recoveryTaskId` and rehydrates this snapshot.

Snapshots are bound to `ownerUserId`. Another authenticated user receives neither the task nor its snapshot. Snapshots are removed on successful save, Dismiss, replacement submit, the existing failed-task expiry, and logout/session cleanup. Local `file://` or picker URIs may become unavailable after OS cleanup or app reinstall; metadata still recovers, but the creator may need to reselect missing media. True cross-device pre-ID recovery would require a new non-public backend draft-intent contract and was intentionally not added.

Progress writes are coalesced before AsyncStorage. Status, design-id, and cleanup writes remain immediate.

## Render stability

React Query is the single source for native catalog lists. The previous duplicate `collections`/`drafts` component state and dual mutation writes were removed. Deletes optimistically update the catalog query cache and restore captured query snapshots on failure.

Card callbacks use stable functions with latest values held in refs. `CatalogEntityCard` passes the original DTO instead of spreading a new object. Task-to-card mapping caches each DTO by task object and profile context, so one progress update changes only that task card's object. Stable keys, frame batching, pull-to-refresh, swipe paging, and filters remain unchanged.

Status badges use one deduplicated server-plus-task count model. A task with a server `designId` is not counted again when the server row appears. All tab pages have the same estimated minimum height until measured, avoiding first-switch collapse.

## QR target

The mobile QR Pressable remains content-width and no longer has expanding hit slop. It retains a button role and explicit accessibility label. Email and social contact rows retain their existing behavior and now have link semantics.

## Validation

- `npm exec tsc -- --noEmit`
- `npm run audit:design-system`
- `npm run test:design-editor-contract`
- `node scripts/test-catalog-entity-contract.js`
- `npm run test:measurement-bagging-contract`
- `npm run test:phase2a-selector-tags-contract`
- `npm run check:perf-regressions`
- `git diff --check`

## Manual QA checklist

- Publish routes immediately to In Review and only its task card updates per progress tick.
- Save draft routes immediately to Drafts and shows a task card.
- Success replaces the task card without a full-tab skeleton.
- Post-ID failed Edit/Retry opens fully populated server data.
- Pre-ID failed Retry restores form metadata and locally available media.
- Dismiss removes the failed snapshot; account switching never exposes it.
- Delete one card and verify siblings do not flash or rerender visibly; force a failure and verify rollback.
- Tap QR icon/text and adjacent blank space separately.
- Compare thumbnail brightness and edges in light/dark mode.
- Switch and swipe all status/main tabs; verify stable height, active state, and counts.
- Repeat on Tecno Pop 7-class Android hardware and iPad.

# Phase 2B — Mobile Validation, Parity & Delivery Rules

Date: 2026-06-20
Scope: `threadly-mobile` (Expo / React Native)

## 1. Phase 2A gate result

Phase 2A (native selector + tag interactions) was audited and verified **complete and
clean** before Phase 2B. Manual commit `66012f1` was correctly scoped; `tsc`,
design-system audit, the Phase 2A selector/tag contract, and the design-editor contract
all pass.

## 2. Field-level validation model

The composer already surfaces per-field inline errors (`customOrderFieldErrors`) and an
aggregate `missingRequiredFields` summary with a "Required: <first missing>" hint, and
gates Preview via `getPublishValidationMessage`. Phase 2B extends this:

- **Delivery (1–7):** new `getCustomOrderDeliveryValidationMessage` (provider) +
  `customOrderFieldErrors.delivery` (composer). Min and max must each be `1–7`; min must
  not exceed max. Inline errors render on the relevant delivery input.
- **Price range:** new `getPriceRangeValidationMessage` enforces `minPrice <= maxPrice`
  and gates Preview (previously only a soft `priceError`, not blocking).
- Both checks also guard the **draft-save** path (alongside production/rush) so an
  invalid value can never reach the backend as a 400 (`DELIVERY_RANGE_INVALID` /
  `PRICE_RANGE_INVALID`).

### First-invalid-field focus — partial

Inline per-field errors and the aggregate "Required: <field>" hint are present. Programmatic
scroll/focus to the first invalid **section** is **not yet implemented** (deferred — it
requires section measurement refs against the Phase-2A-stabilized scroll/keyboard owner,
and is best validated on-device). Tracked as a follow-up; no regression to existing
inline error UX.

## 3. Web/native price & custom-order parity

Implemented in `DesignEditorProvider.updateField`:

- Min price **auto-populates** the custom-order base charge (pre-existing).
- If min changes and base was not manually overridden, base updates (pre-existing,
  tracked via `lastAutoBaseChargeRef`).
- **NEW:** if min price is cleared and base was auto-populated (still equal to the last
  auto value), base clears too — matching web.
- Manual base overrides are never silently overwritten (pre-existing).

## 4. Custom-order draft persistence

Already wired and retained: on draft **save**, the full custom-order configuration
(`baseProductionCharge`, `productionLeadDays`, `deliveryMin/MaxDays`, rush fields,
policies, fallback rule) is sent; on **load/edit**, it is restored from the active
configuration into the form. No change needed beyond the new validation gates.

## 5. Delivery / production 1–7 and rush 72h

- Delivery min/max locked to 1–7 (see §2), consistent with backend + web.
- Production lead 1–7 (pre-existing).
- Rush lead 1–3 days = 72h max (pre-existing), shorter than production.

## 6. Backend validation alignment

Native validation mirrors the backend structured-error contract
(`DELIVERY_RANGE_INVALID`, `PRICE_RANGE_INVALID`, rush codes), so creators are blocked
inline before Preview rather than receiving a submit-time 400.

## 7. Button loading / double-submit

- `save()` (draft + publish) already guards double-submit via the synchronous
  `isSavingRef`.
- **NEW:** `deleteDraft()` now uses the same `isSavingRef` guard so a double-tap on
  "Delete draft" cannot fire two deletes before the async disabled state applies.
- Retry-failed-task is synchronous navigation (no loader applied, per guidance; the
  Button pressed state covers feedback).

## 8. Retry preservation boundary

- **Post-ID failures** (design already created): retry routes to the design editor and
  restores the design — data preserved (pre-existing).
- **Pre-ID failures** (failure before a `designId` exists, e.g. media upload): retry
  currently opens a fresh composer. Capturing and re-hydrating the in-progress form
  payload requires snapshotting it into the persisted background-task store (an upload
  lifecycle change). **Deferred to Phase 3** per the agreed boundary; the safe current
  behavior (touch task to preserve failure reason + route) is unchanged.

## 9. Tests run

- `npx tsc --noEmit` — clean.
- `npm run audit:design-system` — pass (80/188).
- Phase 2A selector/tag contract — pass.
- `npm run test:design-editor-contract` — pass.
- `git diff --check` — clean.

## 10. Manual QA checklist

- [ ] Custom orders on: set delivery max `8` → inline error, Preview blocked.
- [ ] Delivery min `5` / max `3` → inline "min cannot exceed max".
- [ ] Set min price `100`, enable custom orders → base charge auto-fills `100`.
- [ ] Change min to `120` (base untouched) → base updates to `120`.
- [ ] Manually edit base to `200`, change min → base stays `200`.
- [ ] Clear min price → auto-populated base clears.
- [ ] Min price `50`, max price `20` → Preview blocked with price-range message.
- [ ] Save draft, reopen → custom-order config restored.
- [ ] Double-tap "Delete draft" → only one delete fires.

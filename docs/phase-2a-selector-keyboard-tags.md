# Phase 2A: Native Selectors, Keyboard, and Tags

## Scope

This phase covers native selector hierarchy, sheet and keyboard interaction, tag scrolling, custom-tag normalization, and pending-review behavior. Field-level form validation, custom-order draft parity, delivery/rush changes, and retry preservation remain Phase 2B.

## Root Causes

Selector summaries rendered as divider-only rows, and placeholder text occupied the same visual slot as selected values. Native platform switches had no theme colors, while small sheet controls used 38px targets.

The composer combined an iOS `KeyboardAvoidingView`, automatic scroll insets, and manual keyboard-height padding. `AppBottomSheet` also combined Reanimated keyboard observation with keyboard event fallback. On resized Android windows, those layers could apply the keyboard height twice.

The tag list was already bounded and nested-scroll-enabled, but selected suggestions were removed before reaching the sheet. That made approved selected tags look like unknown pending tags. Local normalization also differed from the backend contract.

## Implementation

- `OptionRow` now uses tokenized surfaces and borders with explicit placeholder, selected, error, pending, pressed, and disabled states.
- Sheet headers support contextual selection metadata, and close/Done/Add actions have at least 44px targets.
- Composer switches use a small theme-aware wrapper.
- The composer keeps one keyboard owner: iOS `KeyboardAvoidingView`; Android uses system resize. Manual and automatic scroll insets were removed.
- `AppBottomSheet` uses one keyboard event path. It suppresses its inset when Android already resized the window.
- The tag sheet activates its keyboard inset only while its search or custom-tag input is focused.
- Tag overflow remains capped at 280px with Android nested scrolling and keyboard-open taps enabled.
- Native custom tags use the backend rules: lowercase, collapsed whitespace, allowed punctuation, 2-24 characters, case-insensitive de-duplication, and a maximum of 10 selected tags.
- Approved and pending suggestion status now reaches the sheet. Pending tags remain usable immediately and show a calm pending label.

## Custom Tag Lifecycle

1. Add normalizes and selects the tag locally without waiting for the network.
2. Closing with `Save tags` commits it to the design form, so preview and design draft/submit payloads include it.
3. On backend draft/save/finalize, unknown tags are registered internally as `PENDING` with `createdById`.
4. Registration creates no public `TagBinding`; draft and private designs remain undiscoverable.
5. The creator can read their pending suggestion status, while global users see only approved tags.
6. Existing `/tags/admin` moderation and `/tags/admin/status/:normalizedName` approval remain authoritative.

## Phase 2B Locked Rule

Delivery/production ranges must be 1-7 days. One day is valid, and values above seven must be invalid. Backend 2-14 validation is wrong and must change in Phase 2B with a compatibility plan for existing 8-14 day records. Rush remains capped at 72 hours. Rush fees must be open/configurable; removal of the current 70% cap belongs to Phase 2B.

## Files Changed

- `app/(tabs)/catalog/create-design/composer.tsx`
- `components/ui/AppBottomSheet.tsx`
- `components/ui/AppSelectSheet.tsx`
- `components/ui/Chip.tsx`
- `components/ui/OptionRow.tsx`
- `components/ui/ThemedSwitch.tsx`
- `src/api/TagsApi.ts`
- `src/utils/tagNormalization.ts`
- `scripts/test-phase2a-selector-tags-contract.js`
- `package.json`

## Validation

- Mobile TypeScript
- Mobile design-system audit
- Design editor, shopper settings, and Phase 2A selector/tag contracts
- Diff whitespace check
- Android/iOS runtime QA remains manual because no device or emulator is attached to this workspace.

## Manual QA

- Android: open/close every non-keyboard selector with the keyboard previously open; verify no bottom gap.
- Android: focus tag search and custom tag inputs, Add/select while keyboard is open, drag the list, then swipe the sheet handle down.
- Android: verify backdrop and close button dismissal and rapid reopen stability.
- Add 10 tags, including mixed case, spaces, punctuation, duplicates, one-character input, and input longer than 24 characters.
- Save tags, visit Preview, return to Edit, and verify pending labels and selected values remain correct.
- Save a draft and reopen it; verify pending creator tags remain visible to that creator only.
- iPad: verify selector width, title/count hierarchy, wrapping, touch targets, and keyboard transition.

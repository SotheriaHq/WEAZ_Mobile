# NAV_PERF_PHASE_1_RUNBOOK.md

Phase 1 instrumentation runbook for objective navigation latency measurement.

**Goal of Phase 1**: Collect reliable timings for:
- Tap → optimistic active
- Route scheduling / call
- Pathname change
- Screen mount
- Shell visible
- First meaningful UI visible

This tells us **where** the delay is (before/after route call, mount, paint) before any fixes.

---

## Enabling Logs

Set the flag (works in both dev and perf builds):

```bash
# .env.local (or pass via shell)
EXPO_PUBLIC_DEBUG_NAV=1
```

- Use `EXPO_PUBLIC_DEBUG_NAV=1` (or `true`)
- The gate lives in `isThreadlyDebugEnabled('nav')` — logs are **completely silent** unless the flag is set.
- Safe for `--no-dev --minify`.

---

## Run Commands

### 1. Dev / Debug (baseline with Metro overhead)

From `threadly-mobile/`:

```bash
npm run start:dev:lan
# or
npm run start:dev:tunnel
```

Clear cache if needed: add `-c`

### 2. Perf / Closer to Release (recommended first for real numbers)

```bash
npm run start:perf
# equivalent to: expo start --no-dev --minify -c
```

This runs production JS bundle speed without native release build.

### 3. Local Release-style (if you have EAS / dev client built)

- Build a release/profile variant via EAS or local:
  - `eas build --platform android --profile preview` (or production)
  - Or use `expo export` + install the bundle.
- Run the installed app (no Metro).

**Order recommendation**:
1. First run with `npm run start:perf` + flag (fastest way to compare).
2. Then dev if you want to see the delta.
3. Finally true release build if available.

---

## What Routes to Test (repeat each 5–8 times)

From island (bottom nav):
- Tap **Runway** (designs)
- Tap **Shop** (market/discover)
- Tap **Inbox**
- Tap **Me** (or Catalog if brand)
- Tap **Bag** (sheet — record separately)

From inside app:
- From Me → **Settings**
- From Settings → **Profile information** (`me-edit`)
- Search → tap a result (product / design / profile)
- Any product card or design card → detail
- Notification sheet if open → tap one

Also test rapid taps (2-3 quick) on same item to observe stacking behavior.

**For each tap**:
- Note the exact time you tap (or just watch logs).
- Wait until screen feels usable.
- Swipe back or tap another tab.
- Repeat.

---

## How to Collect Data

1. Enable flag + start the app (perf preferred).
2. Open device logs (Metro console, `adb logcat`, Xcode console, or Flipper).
3. Filter for `[NAV_PERF]`
4. Perform the taps.
5. Copy the block of `[NAV_PERF]` lines for that flow.
6. Optionally record screen video (slow-mo if possible) synced with logs.

Example log line (after Phase 1 changes):
```
[NAV_PERF] route=me source=/ target=/(tabs)/me event=tap_press_in t=1718823... deltaMs=0 pathname=/
[NAV_PERF] route=me source=/ target=/(tabs)/me event=optimistic_active_set t=... deltaMs=2 pathname=/
[NAV_PERF] route=me source=/ target=/(tabs)/me event=route_scheduled t=... deltaMs=18 pathname=/
...
[NAV_PERF] route=me source=/ target=/(tabs)/me event=target_shell_visible t=... deltaMs=184 pathname=/(tabs)/me
[NAV_PERF] route=me source=/ target=/(tabs)/me event=target_first_visible_ui t=... deltaMs=312 pathname=/(tabs)/me
```

---

## How to Analyze Logs

Look at deltas from the first `tap_press_in` (or `tap_start`):

- **tap_press_in → route_call_start** : time in island + scheduling + RAF
- **route_call_start → pathname_changed** : router decision time
- **pathname_changed → target_screen_mounted** : JS navigation + component creation
- **target_screen_mounted → target_shell_visible** : first render of surface bg + basic shell
- **target_shell_visible → target_first_visible_ui** : time until user sees actual content/skeletons

**Key questions this answers**:
- Is the delay mostly before `route_call` (island/RAF)?
- Mostly after `route_call` but before mount?
- Mount is fast but shell/first UI is slow (heavy render/effects/media)?
- Does perf build shrink any of the deltas dramatically?

---

## Screen Recordings

- Record the full sequence at 60fps (or slow motion).
- Include the island tap + resulting screen.
- For best results, record while logs are also captured (side by side or timestamp overlay).
- Note device model and whether dev/perf/release build.

---

## Cleanup / Notes

- All instrumentation is gated behind the env flag.
- No production impact.
- Do not leave flag on in store builds.
- Phase 1 does **not** change any visible behavior or add guards.

When you have logs + video, paste representative blocks (one good flow + one worst flow) back for analysis.

Happy measuring!

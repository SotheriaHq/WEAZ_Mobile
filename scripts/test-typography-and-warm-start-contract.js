/**
 * Two regressions that both present as "the app looks and feels wrong", and
 * neither of which is visible in a typecheck or a design-system audit.
 *
 * 1. TYPOGRAPHY. `isFontFallbackMode` was a module-level `let`, written once by
 *    the boot path and read during render by every `AppText`. Nothing
 *    subscribed to it. When the Inter load lost a race with the boot timeout
 *    the flag latched true, `fontFamily` was dropped, and Android resolved the
 *    DEVICE's default typeface — which on a phone whose owner has chosen a
 *    handwriting system font means the entire app renders in that face. Inter
 *    finishing a second later changed nothing, because a plain `let` schedules
 *    no re-render. The whole session stayed wrong.
 *
 * 2. WARM START. The profile's snapshot lived in an in-memory `Map`, so every
 *    cold start opened the screen empty and waited on the network, and the
 *    fetch itself was queued behind a `requestAnimationFrame` that cannot fire
 *    while the JS thread is busy rendering the feed.
 *
 * Both are the kind of thing that silently comes back the next time someone
 * simplifies the code they live in.
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function read(relative) {
  return fs.readFileSync(path.join(MOBILE, relative), 'utf8');
}

function check(label, condition, why) {
  if (condition) {
    passed += 1;
    console.log('ok    ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label + (why ? '\n      ' + why : ''));
  }
}

// ── 1. Font fallback must be recoverable ────────────────────────────────────
const fontMode = read('src/styles/FontMode.ts');
const appText = read('components/ui/AppText.tsx');
const layout = read('app/_layout.tsx');

check(
  'FontMode notifies subscribers instead of being a bare mutable export',
  /subscribeToFontMode/.test(fontMode) &&
    /listeners\.(add|forEach)|\[\.\.\.listeners\]/.test(fontMode),
  'A plain `export let` re-renders nothing, so fallback becomes permanent.',
);
check(
  'FontMode no longer exports the raw latched boolean for render paths',
  !/export let isFontFallbackMode/.test(fontMode),
  'Reading the binding directly during render is what made this a one-way door.',
);
check(
  'AppText reads font mode through useSyncExternalStore',
  /useSyncExternalStore\(/.test(appText) && /subscribeToFontMode/.test(appText),
  'Mounted text must re-render when Inter finally loads.',
);
check(
  'boot sets fallback mode from an effect, not during render',
  /useLayoutEffect\(\(\) => \{\s*setFontFallbackMode\(usingFontFallback\);/.test(layout),
  'Notifying subscribers mid-render updates other components while rendering.',
);
check(
  'the dev font timeout is longer than the production one',
  /__DEV__ \? \d{4,} : \d{3,}/.test(layout),
  'Metro serves each face over the LAN; 3s loses that race most sessions.',
);

// ── 2. Money has its own type tier ──────────────────────────────────────────
const tokens = read('src/styles/tokens.ts');
check(
  'the type scale carries a money tier',
  /money: \{ size: \d+, weight: '800'/.test(tokens),
  'An amount set in bodyBold reads as a label, not as the figure.',
);
check(
  'money and stat figures are tabular',
  /TABULAR_TIERS/.test(appText) && /tabular-nums/.test(appText),
  'Proportional digits make a column of prices ragged.',
);

// ── 3. One card background ──────────────────────────────────────────────────
const card = read('components/ui/Card.tsx');
check(
  'the elevated card no longer fills with a different colour than surface',
  !/variant === 'elevated'[\s\S]{0,120}backgroundColor: theme\.colors\.surfaceAlt/.test(card),
  'A grey elevated card beside a white one reads as two materials.',
);
check(
  'a tinted card variant exists for the brand wash',
  /'tinted'/.test(card) && /surfaceTintGradient/.test(card),
);
check(
  'the tint is defined per theme so dark mode is not an afterthought',
  (tokens.match(/surfaceTintGradient: \[/g) || []).length >= 2,
);

// ── 4. The profile opens on content, not on a spinner ───────────────────────
const persistent = read('src/state/persistentScreenCache.ts');
const me = read('app/(tabs)/me.tsx');
const tabLayout = read('app/(tabs)/_layout.tsx');
const shopperProfileWarmup = read('src/profile/shopperProfileWarmup.ts');

check(
  'the screen cache is written through to disk',
  /AsyncStorage/.test(persistent) && /persistScreenState/.test(persistent),
  'An in-memory Map is empty on every cold start.',
);
check(
  'boot primes the persisted cache before any tab can be reached',
  /primePersistentScreenCache\(\)/.test(layout),
);
check(
  'a primed entry never overwrites fresher state from this session',
  /readWarmScreenState\(key\) != null\) return;/.test(persistent),
);
check(
  'the profile persists its snapshot rather than only warming memory',
  /persistScreenState\(/.test(me) && !/writeWarmScreenState\(/.test(me),
);
check(
  'the profile fetch is not gated behind the deferred-work frame',
  !/if \(!deferredWorkReady\) return;\s*\n\s*navPerf\.mark\('background_refresh_started'/.test(me),
  'rAF cannot fire while the JS thread renders the feed — a 2.5s stall.',
);
check(
  'the authenticated tab shell warms the full shopper profile before Me is opened',
  /fetchShopperProfileWarmState/.test(tabLayout) && /persistScreenState\(shopperProfileWarmStateKey/.test(tabLayout),
  'Saved, Patches and Orders must start before the shopper taps the Me island item.',
);
check(
  'a fast Me tap joins the shell warm-up rather than duplicating its six requests',
  /inFlightWarmups/.test(shopperProfileWarmup) && /await fetchShopperProfileWarmState\(user\.id\)/.test(me),
  'A fast route must share the in-flight work, not compete with it.',
);

// ── 5. An answered extension does not come back ─────────────────────────────
const extensionScreen = read('app/orders/extension/[requestId].tsx');
check(
  'answering an extension publishes the result to the order screen cache',
  /writeCachedQueryData\(queryKeys\.orders\.detail\(order\.id, 'CUSTOM'\), updated\)/.test(
    extensionScreen,
  ) && /writeCachedQueryData\(queryKeys\.orders\.detail\(order\.id\), updated\)/.test(extensionScreen),
  'Otherwise routing back re-renders a cached order with the request still open.',
);
check(
  'order mutations bump a revision the profile list watches',
  /markOrdersChanged/.test(read('src/api/BuyerOrdersApi.ts')) &&
    /getOrderRevision/.test(me),
  'A row carries a deadline; a stale one is wrong, not merely untidy.',
);
check(
  'an approved extension replaces visible order rows synchronously',
  /markOrdersChanged\(\{ summary: toBuyerOrderSummary\(detail\) \}\)/.test(read('src/api/BuyerOrdersApi.ts')) &&
    /subscribeOrderChanges/.test(me) &&
    /subscribeOrderChanges/.test(read('app/orders/index.tsx')),
  'The returned schedule must replace the old countdown without a reroute or refetch.',
);

// ── 5b. The island clips to its own shape ───────────────────────────────────
const island = read('components/navigation/NativeIslandBottomNav.tsx');
check(
  'the island clips content to the pill, not to its bounding box',
  /navItems: \{[\s\S]{0,900}?borderRadius: NATIVE_ISLAND_NAV\.radius/.test(island),
  'navWrap cannot carry overflow:hidden (Android drops layers when paired with '
    + 'elevation), so navItems does the clipping — and without the radius it '
    + 'clipped to a rectangle while the island drew a pill, letting scrolling '
    + 'chips paint across the curved ends.',
);
check(
  'the scrolling dock insets its chips clear of the curved ends',
  /scrollDockContent: \{[\s\S]{0,1400}?paddingHorizontal: 12/.test(island),
  'At the shared 4pt the first and last chips sit inside the corner arc.',
);

// ── 6. Lateness is answerable on every order ────────────────────────────────
const schedulePolicy = fs.readFileSync(
  path.join(MOBILE, '..', 'bthreadly/src/custom-orders/custom-order-schedule.policy.ts'),
  'utf8',
);
const service = fs.readFileSync(
  path.join(MOBILE, '..', 'bthreadly/src/custom-orders/custom-orders.service.ts'),
  'utf8',
);

check(
  'the schedule falls back to the brand lead times snapshotted on the order',
  /productionLeadDaysSnapshot/.test(schedulePolicy) &&
    /deliveryMaxDaysSnapshot/.test(schedulePolicy),
  '`promised*` is only written at payment confirmation; without this an order '
    + 'accepted another way can never be shown as late.',
);
check(
  'the dispute gate is fed the EXPECTED dates, not the raw promise columns',
  /promisedProductionAt: detailSchedule\.expectedProductionAt/.test(service),
  'Reading the nulls directly is what made the report control unreachable.',
);
check(
  'the list payload carries the countdown so a row need not be opened',
  /schedule: serializeOrderSchedule\(/.test(service),
);
check(
  'the row renders a day count with an overdue marker',
  /formatOrderCountdown/.test(read('components/orders/OrderListRow.tsx')),
);
check(
  'order timelines use the shared purple metric surface and red issue marker',
  /variant="tinted"/.test(read('components/orders/OrderScheduleBadge.tsx')) &&
    /🟥/.test(read('components/orders/OrderScheduleBadge.tsx')),
  'Healthy order timing needs the brand wash; delays need a recognisable red issue signal.',
);
check(
  'order timing text wraps instead of truncating on a narrow phone',
  !/numberOfLines|ellipsizeMode/.test(read('components/orders/OrderListRow.tsx')) &&
    !/numberOfLines|ellipsizeMode/.test(read('components/orders/OrderScheduleBadge.tsx')),
  'A deadline must remain readable at large text sizes and narrow widths.',
);
check(
  'both clients read the schedule rather than recomputing lateness',
  /order\?\.schedule/.test(
    fs.readFileSync(
      path.join(MOBILE, '..', 'fthreadly/src/pages/profile/tabs/OrdersPanel.tsx'),
      'utf8',
    ),
  ),
  'A client that recomputes policy eventually disagrees with the endpoint.',
);

console.log(
  '\nTypography and warm-start contract: ' +
    passed +
    '/' +
    (passed + failed) +
    ' checks passed',
);
if (failed > 0) process.exit(1);

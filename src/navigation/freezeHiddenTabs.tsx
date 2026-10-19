/**
 * Hidden tabs are NOT frozen. This layout is deliberately a pass-through.
 *
 * HISTORY. The tab navigator sets `freezeOnBlur: true` with
 * `detachInactiveScreens={false}`, and the second silently cancels the first:
 * `react-native-screens` only applies the freeze inside its `enabled` branch,
 * and the tab view passes `enabled: detachInactiveScreens`. A react-freeze
 * wrapper was added here instead (2026-10-15) to stop hidden tabs
 * re-rendering on every context change.
 *
 * WHY IT IS GONE. react-freeze freezes by suspending, and a suspended tree is
 * hidden with `display: none`. Under Fabric a `display: none` subtree is not
 * mounted: its native views are destroyed, and showing it again recreates
 * every view and image and lays the whole screen out from scratch. So every
 * tab press paid twice — tearing down the tab being left and rebuilding the
 * tab being opened — on the JS thread (the commit and Yoga layout) and on the
 * UI thread (view creation). The island's pill animates on that same UI
 * thread, which is why the pill and the screen arrived TOGETHER, after the
 * finger had already lifted: "press, then indicator and screen".
 *
 * The captures said so long before the cause was understood: Market's thaw
 * cost 1-2s on every entry (2026-10-17, almost all `unattributed`) and went
 * away when Market was exempted; every remaining `unattribMs` on tab presses
 * (2026-10-19: 278-800ms on tabs→market, which froze Runway) is the same
 * teardown and rebuild for the tabs still frozen.
 *
 * Unfrozen, a hidden tab is a scene parked off screen by the tab view, its
 * native views intact; switching tabs moves a container. What freezing was
 * protecting against — hidden tabs re-rendering — is handled at the source:
 * Market's body sits behind a memo shell that absorbs auth and bag changes,
 * the BagFlow value no longer changes per route, and no tab screen subscribes
 * to the app's URL (Catalogue reads its own route, not `usePathname`).
 */
import type React from 'react';

type TabLayoutArgs = {
  children: React.ReactElement;
};

export function freezeHiddenTabLayout({ children }: TabLayoutArgs) {
  return children;
}

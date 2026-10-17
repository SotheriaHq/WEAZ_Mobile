/**
 * Which app overlays (Modal-backed menus and sheets) are mounted right now.
 *
 * WHY. On Android a React Native `Modal` is a separate window stacked over the
 * activity. A hidden tab is frozen (`freezeHiddenTabs.tsx`) one tick after it
 * blurs, and a frozen tree cannot commit anything — including the state update
 * that unmounts a closing menu or sheet. So an overlay whose action navigated
 * away, and which closed AFTER its fade, stayed mounted in a frozen tree as an
 * empty full-screen window that took every touch. Device log 2026-10-17
 * 17:07:55: the Catalogue profile menu's "Store" opened Studio, the menu window
 * was re-created at 55.608 and never removed, and every tap after it went to
 * that window — "the press sounds but nothing moves".
 *
 * Overlays register while mounted; the tab freeze waits until none are.
 */
import { useEffect } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function hasOpenOverlay(): boolean {
  return openCount > 0;
}

export function subscribeOpenOverlays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call with the flag that decides whether the overlay's `Modal` is mounted. */
export function useRegisterOpenOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return undefined;
    openCount += 1;
    notify();
    return () => {
      openCount = Math.max(0, openCount - 1);
      notify();
    };
  }, [open]);
}

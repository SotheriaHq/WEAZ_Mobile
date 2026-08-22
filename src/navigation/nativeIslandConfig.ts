import type { NativeIslandNavItem } from '@/components/navigation/NativeIslandBottomNav';
import { MY_BAG_EMOJI } from '@/src/constants/bagging';

export const NATIVE_ISLAND_KEYS = {
  designs: 'designs',
  market: 'market',
  bag: 'bag',
  inbox: 'inbox',
  profile: 'profile',
} as const;

export type NativeIslandKey = (typeof NATIVE_ISLAND_KEYS)[keyof typeof NATIVE_ISLAND_KEYS];

/** Studio dock keys — mirror `fthreadly` StudioSidebar / IslandBottomNav. */
export const STUDIO_ISLAND_KEYS = {
  overview: 'overview',
  store: 'store',
  reviews: 'reviews',
  orders: 'orders',
  messages: 'messages',
  staff: 'staff',
  customers: 'customers',
  analytics: 'analytics',
  finance: 'finance',
} as const;

export type StudioIslandKey = (typeof STUDIO_ISLAND_KEYS)[keyof typeof STUDIO_ISLAND_KEYS];

export type AnyIslandKey = NativeIslandKey | StudioIslandKey | string;

export const NATIVE_ISLAND_ICONS: Record<NativeIslandKey | 'signIn', string> = {
  designs: String.fromCodePoint(0x1f457),
  market: String.fromCodePoint(0x1f3ea),
  bag: MY_BAG_EMOJI,
  inbox: String.fromCodePoint(0x2709, 0xfe0f),
  profile: String.fromCodePoint(0x1f464),
  signIn: String.fromCodePoint(0x1f510),
};

const normalizePathname = (pathname: string) => pathname.replace(/^\/\(tabs\)/, '') || '/';

/**
 * Marks a native screen as being entered from — and still part of — the Studio.
 *
 * Most Studio destinations live under `/studio/...`, so the pathname is enough.
 * Messaging does not: the native inbox is the Studio's messages screen AND the
 * shopper's inbox, and the two need different docks. The pathname cannot tell
 * them apart, so the navigation that got you there says which one it is.
 */
export const STUDIO_SURFACE_PARAM = 'surface';
export const STUDIO_SURFACE_PARAM_VALUE = 'studio';

/** True while the brand is inside the Studio surface (should show studio dock). */
export function isStudioIslandPath(pathname: string, surfaceParam?: string | null): boolean {
  if (surfaceParam === STUDIO_SURFACE_PARAM_VALUE) return true;
  const normalized = normalizePathname(pathname);
  return normalized === '/studio' || normalized.startsWith('/studio/');
}

export function isStudioIslandKey(key: string): key is StudioIslandKey {
  return Object.values(STUDIO_ISLAND_KEYS).includes(key as StudioIslandKey);
}

/**
 * Studio WebView sub-routes (create product, verification, …) map onto the
 * nearest primary dock tab so the active chip still makes sense.
 */
const STUDIO_ROUTE_KEY_TO_ISLAND: Record<string, StudioIslandKey> = {
  overview: STUDIO_ISLAND_KEYS.overview,
  store: STUDIO_ISLAND_KEYS.store,
  createProduct: STUDIO_ISLAND_KEYS.store,
  editProduct: STUDIO_ISLAND_KEYS.store,
  productDetail: STUDIO_ISLAND_KEYS.store,
  createCollection: STUDIO_ISLAND_KEYS.store,
  setup: STUDIO_ISLAND_KEYS.store,
  essentials: STUDIO_ISLAND_KEYS.store,
  reviews: STUDIO_ISLAND_KEYS.reviews,
  orders: STUDIO_ISLAND_KEYS.orders,
  customOrders: STUDIO_ISLAND_KEYS.orders,
  customOrderDetail: STUDIO_ISLAND_KEYS.orders,
  messages: STUDIO_ISLAND_KEYS.messages,
  staff: STUDIO_ISLAND_KEYS.staff,
  customers: STUDIO_ISLAND_KEYS.customers,
  analytics: STUDIO_ISLAND_KEYS.analytics,
  finance: STUDIO_ISLAND_KEYS.finance,
  verification: STUDIO_ISLAND_KEYS.overview,
  verificationApply: STUDIO_ISLAND_KEYS.overview,
  verificationSubmitted: STUDIO_ISLAND_KEYS.overview,
};

export function mapPathnameToStudioIslandKey(
  pathname: string,
  routeKey?: string | null,
): StudioIslandKey {
  const normalized = normalizePathname(pathname);

  // Reached through the Studio dock's Messages chip (see `isStudioIslandPath`).
  if (
    normalized === '/inbox' ||
    normalized === '/messages' ||
    normalized.startsWith('/messages/')
  ) {
    return STUDIO_ISLAND_KEYS.messages;
  }

  if (normalized === '/studio/finance' || normalized.startsWith('/studio/finance/')) {
    return STUDIO_ISLAND_KEYS.finance;
  }
  if (normalized === '/studio/staff' || normalized.startsWith('/studio/staff/')) {
    return STUDIO_ISLAND_KEYS.staff;
  }

  const fromParam =
    typeof routeKey === 'string' && routeKey.trim().length > 0
      ? STUDIO_ROUTE_KEY_TO_ISLAND[routeKey.trim()]
      : undefined;
  if (fromParam) return fromParam;

  return STUDIO_ISLAND_KEYS.overview;
}

type StudioIslandTarget = {
  pathname: string;
  params?: Record<string, string>;
};

/**
 * Native targets for each Studio dock chip. Finance and Staff are native
 * screens; everything else reuses the Studio WebView with a `routeKey`.
 */
export function getStudioIslandTarget(key: string): StudioIslandTarget {
  // Finance stays native (wallet UI). Everything else — including Staff — stays
  // inside the Studio WebView so island hops do not unmount/re-handoff the shell.
  if (key === STUDIO_ISLAND_KEYS.finance) {
    return { pathname: '/studio/finance' };
  }

  /**
   * Messages is native, so go there directly instead of via the web route.
   *
   * This chip used to load `/studio/messages` in the WebView — a URL the
   * navigation bridge is guaranteed to reject, because `classifyMessagePath`
   * runs before the allowed-Studio-routes check and hands every messaging path
   * to the native inbox. So the tap painted the web messages screen, then threw
   * it away and pushed the native one: the flicker, and a wasted page load
   * every time.
   *
   * `surface: 'studio'` is what tells the island this is still Studio. Without
   * it the dock reads the pathname, sees `/inbox`, and swaps the Studio dock for
   * the shopper one — so a brand who tapped a Studio chip ends up looking at the
   * buyer island with no way back to the rest of Studio.
   */
  if (key === STUDIO_ISLAND_KEYS.messages) {
    return { pathname: '/(tabs)/inbox', params: { surface: STUDIO_SURFACE_PARAM_VALUE } };
  }

  if (key === STUDIO_ISLAND_KEYS.overview) {
    return { pathname: '/studio' };
  }
  return { pathname: '/studio', params: { routeKey: key } };
}

/**
 * Same primary set as web `StudioSidebar` / mobile web IslandBottomNav —
 * INCLUDING its setup gating, which this had been missing entirely.
 *
 * Rule 1 of the Studio is that its links are inactive until store setup is
 * complete. Web enforced that; this dock did not carry `requiresSetup` at all,
 * so every chip rendered live. It went unnoticed because the two look
 * interchangeable, but they are not interchangeable in the one place that
 * matters: inside the native app `StudioScaffold` skips `StudioSidebar`
 * (`!isEmbeddedMobile`), so the web gate is not merely bypassed — the entire
 * component that owns it is never rendered. This dock IS the Studio nav on
 * native, and it is the only thing that can gate it.
 *
 * `Store` is the one always-open destination: it is where setup lives, so
 * locking it would lock the brand out of finishing.
 */
export function buildStudioIslandItems(args: {
  activeKey: string;
  messagesBadge?: number;
  /**
   * Tri-state, matching `useStoreSetupStatus`: false = incomplete, true =
   * complete, null/undefined = not known yet. Only an explicit `false` locks.
   * A slow or failed status check must never strand a brand whose store is
   * live — the same stance the web guard takes.
   */
  storeSetupComplete?: boolean | null;
  /**
   * True while the brand is on a setup screen. Proof that setup is unfinished
   * that costs no network, which matters because `storeSetupComplete` is null
   * for as long as the status request is in flight — exactly the window the
   * brand spends walking through setup.
   */
  isOnSetupRoute?: boolean;
}): NativeIslandNavItem[] {
  const items: Array<{
    key: StudioIslandKey;
    label: string;
    emoji: string;
    badge?: number;
    requiresSetup: boolean;
  }> = [
    { key: STUDIO_ISLAND_KEYS.overview, label: 'Dashboard', emoji: '📊', requiresSetup: true },
    { key: STUDIO_ISLAND_KEYS.store, label: 'Store', emoji: '🛍️', requiresSetup: false },
    { key: STUDIO_ISLAND_KEYS.reviews, label: 'Reviews', emoji: '⭐', requiresSetup: true },
    { key: STUDIO_ISLAND_KEYS.orders, label: 'Orders', emoji: '📦', requiresSetup: true },
    {
      key: STUDIO_ISLAND_KEYS.messages,
      label: 'Messages',
      emoji: '💬',
      badge: args.messagesBadge,
      requiresSetup: true,
    },
    { key: STUDIO_ISLAND_KEYS.staff, label: 'Staff', emoji: '👥', requiresSetup: true },
    { key: STUDIO_ISLAND_KEYS.customers, label: 'Customers', emoji: '👤', requiresSetup: true },
    { key: STUDIO_ISLAND_KEYS.analytics, label: 'Analytics', emoji: '📈', requiresSetup: true },
    { key: STUDIO_ISLAND_KEYS.finance, label: 'Finance', emoji: '💰', requiresSetup: true },
  ];

  const setupLocked = args.storeSetupComplete === false || args.isOnSetupRoute === true;

  return items.map((item) => {
    const target = getStudioIslandTarget(item.key);
    return {
      key: item.key,
      label: item.label,
      emoji: item.emoji,
      active: args.activeKey === item.key,
      badge: item.badge,
      disabled: setupLocked && item.requiresSetup,
      navFlow: `studio→${item.key}`,
      targetRoute: target.pathname,
      targetParams: target.params,
    };
  });
}

export function mapPathnameToIslandKey(pathname: string): NativeIslandKey {
  const normalized = normalizePathname(pathname);

  if (
    normalized === '/discover' ||
    normalized === '/search' ||
    normalized.startsWith('/products/') ||
    normalized === '/market-section' ||
    normalized === '/market-viewer' ||
    normalized === '/collection-viewer' ||
    normalized === '/collection-gallery'
  ) {
    return NATIVE_ISLAND_KEYS.market;
  }

  if (normalized === '/bag' || normalized === '/checkout' || normalized === '/payment') return NATIVE_ISLAND_KEYS.bag;

  if (normalized === '/inbox' || normalized.startsWith('/messages/')) return NATIVE_ISLAND_KEYS.inbox;

  if (
    normalized === '/me' ||
    normalized === '/me-edit' ||
    normalized === '/catalog' ||
    normalized.startsWith('/catalog/') ||
    normalized.startsWith('/profile/') ||
    normalized === '/orders' ||
    normalized.startsWith('/orders/') ||
    normalized === '/notifications' ||
    normalized === '/reviews' ||
    normalized.startsWith('/reviews/') ||
    normalized === '/settings' ||
    normalized.startsWith('/settings/') ||
    // Studio uses its own dock while open; outside Studio the entry still
    // lives under the brand Profile / Me surface.
    normalized === '/studio' ||
    normalized.startsWith('/studio/')
  ) {
    return NATIVE_ISLAND_KEYS.profile;
  }

  return NATIVE_ISLAND_KEYS.designs;
}

export function buildNativeIslandItems(args: {
  activeKey: NativeIslandKey;
  isBrand: boolean;
  profileLabel: string;
  profileIcon: string;
  profileAvatarUri?: string | null;
  profileBadge?: number;
  inboxBadge?: number;
  bagBadge?: number;
}): NativeIslandNavItem[] {
  const baseItems: NativeIslandNavItem[] = [
    {
      key: NATIVE_ISLAND_KEYS.designs,
      label: 'Runway',
      emoji: NATIVE_ISLAND_ICONS.designs,
      active: args.activeKey === NATIVE_ISLAND_KEYS.designs,
    },
    {
      key: NATIVE_ISLAND_KEYS.market,
      label: 'Market',
      emoji: NATIVE_ISLAND_ICONS.market,
      active: args.activeKey === NATIVE_ISLAND_KEYS.market,
    },
    {
      key: NATIVE_ISLAND_KEYS.bag,
      label: 'Bag',
      emoji: NATIVE_ISLAND_ICONS.bag,
      active: args.activeKey === NATIVE_ISLAND_KEYS.bag,
      badge: args.bagBadge,
    },
    {
      key: NATIVE_ISLAND_KEYS.inbox,
      label: 'Inbox',
      emoji: NATIVE_ISLAND_ICONS.inbox,
      active: args.activeKey === NATIVE_ISLAND_KEYS.inbox,
      badge: args.inboxBadge,
    },
    {
      key: NATIVE_ISLAND_KEYS.profile,
      label: args.profileLabel,
      emoji: args.profileIcon,
      avatarUri: args.profileAvatarUri ?? null,
      active: args.activeKey === NATIVE_ISLAND_KEYS.profile,
    },
  ];

  // Brands do not shop. Bag is a buyer surface, and leaving it on the brand
  // island gave sellers a route into their own checkout — and from there into
  // the buyer orders screen, which is not their orders at all.
  return args.isBrand
    ? baseItems.filter((item) => item.key !== NATIVE_ISLAND_KEYS.bag)
    : baseItems;
}

export function getNativeIslandRoute(key: string, isBrand: boolean) {
  if (key === NATIVE_ISLAND_KEYS.designs) return '/' as const;
  if (key === NATIVE_ISLAND_KEYS.market) return '/(tabs)/discover' as const;
  if (key === NATIVE_ISLAND_KEYS.inbox) return '/(tabs)/inbox' as const;
  if (key === NATIVE_ISLAND_KEYS.profile) return isBrand ? '/catalog' : '/(tabs)/me';
  return null;
}

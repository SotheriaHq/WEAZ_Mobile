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

/** True while the brand is inside the Studio surface (should show studio dock). */
export function isStudioIslandPath(pathname: string): boolean {
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
  if (key === STUDIO_ISLAND_KEYS.overview) {
    return { pathname: '/studio' };
  }
  return { pathname: '/studio', params: { routeKey: key } };
}

/** Same primary set as web `StudioSidebar` / mobile web IslandBottomNav. */
export function buildStudioIslandItems(args: {
  activeKey: string;
  messagesBadge?: number;
}): NativeIslandNavItem[] {
  const items: Array<{
    key: StudioIslandKey;
    label: string;
    emoji: string;
    badge?: number;
  }> = [
    { key: STUDIO_ISLAND_KEYS.overview, label: 'Dashboard', emoji: '📊' },
    { key: STUDIO_ISLAND_KEYS.store, label: 'Store', emoji: '🛍️' },
    { key: STUDIO_ISLAND_KEYS.reviews, label: 'Reviews', emoji: '⭐' },
    { key: STUDIO_ISLAND_KEYS.orders, label: 'Orders', emoji: '📦' },
    {
      key: STUDIO_ISLAND_KEYS.messages,
      label: 'Messages',
      emoji: '💬',
      badge: args.messagesBadge,
    },
    { key: STUDIO_ISLAND_KEYS.staff, label: 'Staff', emoji: '👥' },
    { key: STUDIO_ISLAND_KEYS.customers, label: 'Customers', emoji: '👤' },
    { key: STUDIO_ISLAND_KEYS.analytics, label: 'Analytics', emoji: '📈' },
    { key: STUDIO_ISLAND_KEYS.finance, label: 'Finance', emoji: '💰' },
  ];

  return items.map((item) => {
    const target = getStudioIslandTarget(item.key);
    return {
      key: item.key,
      label: item.label,
      emoji: item.emoji,
      active: args.activeKey === item.key,
      badge: item.badge,
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

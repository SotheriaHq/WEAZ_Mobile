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

export const NATIVE_ISLAND_ICONS: Record<NativeIslandKey | 'signIn', string> = {
  designs: String.fromCodePoint(0x1f9f5),
  market: String.fromCodePoint(0x1f6cd, 0xfe0f),
  bag: MY_BAG_EMOJI,
  inbox: String.fromCodePoint(0x2709, 0xfe0f),
  profile: String.fromCodePoint(0x1f464),
  signIn: String.fromCodePoint(0x1f510),
};

export function mapPathnameToIslandKey(pathname: string): NativeIslandKey {
  if (pathname === '/discover' || pathname.startsWith('/products/') || pathname === '/search') return NATIVE_ISLAND_KEYS.market;
  if (pathname === '/inbox' || pathname.startsWith('/messages/')) return NATIVE_ISLAND_KEYS.inbox;
  if (pathname === '/me' || pathname === '/me-edit' || pathname === '/catalog' || pathname.startsWith('/catalog/')) {
    return NATIVE_ISLAND_KEYS.profile;
  }
  return NATIVE_ISLAND_KEYS.designs;
}

export function buildNativeIslandItems(args: {
  activeKey: NativeIslandKey;
  isBrand: boolean;
  profileLabel: string;
  profileIcon: string;
  profileBadge?: number;
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
      label: 'Msgs',
      emoji: NATIVE_ISLAND_ICONS.inbox,
      active: args.activeKey === NATIVE_ISLAND_KEYS.inbox,
    },
    {
      key: NATIVE_ISLAND_KEYS.profile,
      label: args.profileLabel,
      emoji: args.profileIcon,
      active: args.activeKey === NATIVE_ISLAND_KEYS.profile,
      badge: args.profileBadge,
    },
  ];

  return baseItems;
}

export function getNativeIslandRoute(key: string, isBrand: boolean) {
  if (key === NATIVE_ISLAND_KEYS.designs) return '/' as const;
  if (key === NATIVE_ISLAND_KEYS.market) return '/(tabs)/discover' as const;
  if (key === NATIVE_ISLAND_KEYS.inbox) return '/(tabs)/inbox' as const;
  if (key === NATIVE_ISLAND_KEYS.profile) return isBrand ? '/catalog' : '/(tabs)/me';
  return null;
}

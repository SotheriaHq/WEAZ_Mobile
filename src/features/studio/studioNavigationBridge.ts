import type { Href } from 'expo-router';

import { env } from '@/src/config/env';
import { getTrustedStudioOrigins } from '@/src/features/studio/studioRoutes';
import { normalizeNotificationContext, getMessageNotificationTarget } from '@/src/utils/mobileRouting';

export type StudioWebNavigationClassification =
  | { type: 'studio'; path: string }
  | { type: 'native'; nativeRoute: Href; path: string }
  | { type: 'external'; url: string }
  | { type: 'blocked'; reason: string; path?: string };

const STUDIO_TAB_VALUES = new Set(['orders', 'customers', 'analytics', 'finance']);
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_STUDIO_PATHS = new Set([
  '/studio',
  '/studio/store',
  '/studio/store/products/new',
  '/studio/store/collections/new',
  '/studio/verification',
  '/studio/verification/apply',
  '/studio/verification/submitted',
  '/studio/custom-orders',
  '/studio/messages',
  '/studio/store/setup',
  '/studio/store/essentials',
]);

function normalizeAppUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(value, env.webAppUrl);
    } catch {
      return null;
    }
  }
}

function pathWithSearch(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function singleSegmentAfter(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

function isAllowedStudioRoute(url: URL): boolean {
  const pathname = url.pathname.replace(/\/+$/g, '') || '/';
  if (pathname === '/studio') {
    const tab = url.searchParams.get('tab');
    return !tab || STUDIO_TAB_VALUES.has(tab);
  }

  if (STATIC_STUDIO_PATHS.has(pathname)) return true;
  if (/^\/studio\/store\/products\/[^/]+$/.test(pathname)) return true;
  if (/^\/studio\/store\/products\/[^/]+\/edit$/.test(pathname)) return true;
  if (/^\/studio\/custom-orders\/[^/]+$/.test(pathname)) return true;

  return false;
}

function classifyNativeOwnedPath(url: URL): StudioWebNavigationClassification | null {
  const pathname = url.pathname.replace(/\/+$/g, '') || '/';
  const path = pathWithSearch(url);

  if (pathname === '/') {
    return { type: 'native', path, nativeRoute: '/(tabs)' as Href };
  }

  if (pathname === '/market' || pathname === '/market-place' || pathname === '/marketplace') {
    return { type: 'native', path, nativeRoute: '/(tabs)/discover' as Href };
  }

  if (pathname === '/catalog') {
    return { type: 'native', path, nativeRoute: '/catalog' as Href };
  }

  if (pathname === '/messages') {
    return { type: 'native', path, nativeRoute: '/(tabs)/inbox' as Href };
  }

  if (pathname === '/search') {
    const query = url.searchParams.get('q') || url.searchParams.get('query') || undefined;
    return {
      type: 'native',
      path,
      nativeRoute: query
        ? ({ pathname: '/search', params: { q: query } } as Href)
        : ('/search' as Href),
    };
  }

  if (pathname === '/orders' || pathname === '/custom-orders') {
    return {
      type: 'native',
      path,
      nativeRoute: { pathname: '/(tabs)/me', params: { tab: 'orders' } } as Href,
    };
  }

  const orderId = singleSegmentAfter(pathname, '/orders/');
  const customOrderId = singleSegmentAfter(pathname, '/custom-orders/');
  if (orderId || customOrderId) {
    return { type: 'blocked', path, reason: 'order_detail_native_route_missing' };
  }

  if (pathname === '/profile') {
    const tab = url.searchParams.get('tab');
    const normalizedTab = tab?.toLowerCase();
    if (normalizedTab === 'orders') {
      return {
        type: 'native',
        path,
        nativeRoute: { pathname: '/(tabs)/me', params: { tab: 'orders' } } as Href,
      };
    }
    if (normalizedTab === 'saved') {
      return {
        type: 'native',
        path,
        nativeRoute: { pathname: '/(tabs)/me', params: { tab: 'saved' } } as Href,
      };
    }
    return {
      type: 'native',
      path,
      nativeRoute: {
        pathname: '/catalog',
        params: normalizedTab === 'store' || normalizedTab === 'shop' ? { tab: 'Shop' } : undefined,
      } as Href,
    };
  }

  if (pathname === '/profile/collections/create') {
    return { type: 'native', path, nativeRoute: '/catalog/create-design' as Href };
  }

  const designEditId = singleSegmentAfter(pathname, '/profile/collections/edit/');
  if (designEditId) {
    return {
      type: 'native',
      path,
      nativeRoute: { pathname: '/catalog/create-design', params: { designId: designEditId } } as Href,
    };
  }

  const profileId = singleSegmentAfter(pathname, '/profile/');
  if (profileId) {
    return {
      type: 'native',
      path,
      nativeRoute: {
        pathname: '/catalog/[brandId]',
        params: { brandId: profileId, tab: url.searchParams.get('tab') || undefined },
      } as Href,
    };
  }

  const productId = singleSegmentAfter(pathname, '/products/');
  if (productId) {
    return {
      type: 'native',
      path,
      nativeRoute: { pathname: '/products/[productId]', params: { productId } } as Href,
    };
  }

  const collectionId = singleSegmentAfter(pathname, '/collections/');
  if (collectionId) {
    return {
      type: 'native',
      path,
      nativeRoute: { pathname: '/catalog/view/[collectionId]', params: { collectionId } } as Href,
    };
  }

  const storeBrandId = singleSegmentAfter(pathname, '/store/');
  if (storeBrandId && UUID_LIKE_RE.test(storeBrandId)) {
    return {
      type: 'native',
      path,
      nativeRoute: { pathname: '/catalog/[brandId]', params: { brandId: storeBrandId, tab: 'Shop' } } as Href,
    };
  }

  if (pathname === '/subscriptions') {
    return { type: 'blocked', path, reason: 'subscriptions_native_route_missing' };
  }

  if (pathname.startsWith('/u/') || pathname.startsWith('/brand/') || pathname.startsWith('/p/')) {
    return { type: 'blocked', path, reason: 'slug_native_route_missing' };
  }

  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/bag') ||
    pathname.startsWith('/size-charts') ||
    pathname.startsWith('/help/')
  ) {
    return { type: 'blocked', path, reason: 'native_route_not_supported_from_studio' };
  }

  return null;
}

function classifyMessagePath(url: URL): StudioWebNavigationClassification | null {
  const pathname = url.pathname.replace(/\/+$/g, '') || '/';
  const path = pathWithSearch(url);

  if (pathname === '/studio/messages') {
    const params: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams) {
      if (['threadId', 'conversationId', 'messageId', 'orderId', 'customOrderId', 'brandId', 'customerId'].includes(key)) {
        params[key] = value;
      }
    }

    const target = getMessageNotificationTarget(params);
    if (!target) {
      return { type: 'native', path, nativeRoute: '/(tabs)/inbox' as Href };
    }

    if (target.type === 'thread') {
      const routeParams: Record<string, string> = {};
      if (target.params.threadId) routeParams.threadId = target.params.threadId;
      if (target.params.conversationId) routeParams.conversationId = target.params.conversationId;
      if (target.params.messageId) routeParams.messageId = target.params.messageId;
      if (target.params.orderId) routeParams.orderId = target.params.orderId;
      if (target.params.customOrderId) routeParams.customOrderId = target.params.customOrderId;
      if (target.params.brandId) routeParams.brandId = target.params.brandId;
      if (target.params.customerId) routeParams.customerId = target.params.customerId;

      return {
        type: 'native',
        path,
        nativeRoute: { pathname: '/messages/[threadId]', params: routeParams } as Href,
      };
    }

    if (target.type === 'inbox' || target.type === 'unsupported') {
      return { type: 'native', path, nativeRoute: '/(tabs)/inbox' as Href };
    }
  }

  return null;
}

export function classifyStudioWebUrl(
  value: string,
  trustedOrigins: Set<string> = getTrustedStudioOrigins(),
): StudioWebNavigationClassification {
  const url = normalizeAppUrl(value);
  if (!url) {
    return { type: 'blocked', reason: 'invalid_url' };
  }

  if (!trustedOrigins.has(url.origin)) {
    return { type: 'external', url: url.toString() };
  }

  const messageRoute = classifyMessagePath(url);
  if (messageRoute) {
    return messageRoute;
  }

  if (isAllowedStudioRoute(url)) {
    return { type: 'studio', path: pathWithSearch(url) };
  }

  const nativeRoute = classifyNativeOwnedPath(url);
  if (nativeRoute) {
    return nativeRoute;
  }

  return { type: 'blocked', path: pathWithSearch(url), reason: 'non_studio_route_not_allowed' };
}

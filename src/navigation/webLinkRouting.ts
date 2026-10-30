import appLinkPaths from './appLinkPaths.json';
import { env } from '@/src/config/env';
import { deriveStudioRouteKeyFromPath } from '@/src/features/studio/studioRoutes';

/**
 * Opens a WIEZ web link on the native screen that shows the same thing.
 *
 * Emails carry ordinary https links to the web app. Android hands the paths in
 * `appLinkPaths.json` to this app once the domain is verified (App Links, see
 * app.config.js), so the same button opens the app on a phone that has it and
 * the website everywhere else, laptops included. This is the other half: which
 * screen the app shows for the link it was given.
 *
 * Every claimed prefix lands somewhere. A claimed link the app cannot place
 * would strand the person inside the app instead of on the page they asked
 * for, so each family falls back to its own list rather than to nothing.
 */
export const APP_LINK_PATH_PREFIXES: readonly string[] = appLinkPaths.pathPrefixes;

/** Same rule Android applies to `pathPrefix`: a plain string prefix. */
export function isClaimedAppLinkPath(pathname: string): boolean {
  return APP_LINK_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    appLinkPaths.paths.includes(pathname) ||
    appLinkPaths.pathPatterns.some((pattern) => {
      // The manifest uses fixed-length simple globs, supported on Android
      // before API 31 too. Each dot matches one character, not a regex '*'.
      const expression = pattern.split('.').map((part) =>
        part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      ).join('[^/]');
      return new RegExp(`^${expression}$`).test(pathname);
    });
}

/** The web app's host and its `www.` twin, when the web app is served over https. */
export function appLinkHosts(webAppUrl: string = env.webAppUrl): Set<string> {
  try {
    const { protocol, hostname } = new URL(webAppUrl);
    if (protocol !== 'https:' || !hostname) return new Set();
    const apex = hostname.toLowerCase().replace(/^www\./, '');
    return new Set([apex, `www.${apex}`]);
  } catch {
    return new Set();
  }
}

const SETTINGS_TAB_ROUTES: Record<string, string> = {
  'account-security': '/settings/account-security',
  notifications: '/settings/notifications',
  billing: '/settings/subscriptions',
  'subscription-billing': '/settings/subscriptions',
};

function nativePath(pathname: string, query: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** One decoded path segment usable as a route id, or null. */
function idFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && !/[/\\?#]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function orderPath(id: string, kind: 'STANDARD' | 'CUSTOM'): string {
  return nativePath(`/orders/${encodeURIComponent(id)}`, { kind });
}

function threadPath(thread: string | null, messageId: string | null): string {
  const threadId = idFrom(thread);
  return threadId
    ? nativePath(`/messages/${encodeURIComponent(threadId)}`, { messageId: idFrom(messageId) })
    : '/inbox';
}

function studioPath(path: string, search: string, parts: string[]): string {
  if (parts[1] === 'messages') {
    return threadPath(new URLSearchParams(search).get('thread'), null);
  }
  const routeKey = deriveStudioRouteKeyFromPath(`${path}${search}`) ?? 'overview';
  if (routeKey === 'overview') return '/studio';
  // /studio/store/products/:id[/edit] and /studio/custom-orders/:orderId
  const productId = parts[1] === 'store' && parts[2] === 'products' ? idFrom(parts[3]) : null;
  const orderId = parts[1] === 'custom-orders' ? idFrom(parts[2]) : null;
  return nativePath('/studio', { routeKey, productId, orderId });
}

/** The native path for a claimed web path. Never null: see the file comment. */
export function nativePathForWebPath(pathname: string, search = ''): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(search);
  const [head, second, third, fourth] = parts;

  switch (head) {
    case 'orders': {
      const id = idFrom(second);
      return id ? orderPath(id, 'STANDARD') : '/orders';
    }
    case 'custom-orders': {
      const orderId = idFrom(second);
      const requestId = third === 'extensions' ? idFrom(fourth) : null;
      if (orderId && requestId) {
        return nativePath(`/orders/extension/${encodeURIComponent(requestId)}`, { orderId });
      }
      return orderId ? orderPath(orderId, 'CUSTOM') : '/orders';
    }
    case 'profile': {
      const profileId = idFrom(second);
      if (profileId) return `/profile/${encodeURIComponent(profileId)}`;
      const tab = (query.get('tab') ?? '').toLowerCase();
      if (tab === 'orders') {
        const customOrderId = idFrom(query.get('customOrderId'));
        if (customOrderId) return orderPath(customOrderId, 'CUSTOM');
        const orderId = idFrom(query.get('orderId'));
        return orderId ? orderPath(orderId, 'STANDARD') : '/orders';
      }
      if (tab === 'fits') return '/fittings';
      return '/me';
    }
    case 'messages':
      return threadPath(
        second ?? query.get('thread') ?? query.get('threadId') ?? query.get('conversationId'),
        query.get('messageId'),
      );
    case 'notifications':
      return '/notifications';
    case 'settings':
      return SETTINGS_TAB_ROUTES[query.get('tab') ?? ''] ?? '/settings';
    case 'studio':
      return studioPath(path, search, parts);
    case 'store':
      return second === 'payouts' ? nativePath('/studio', { routeKey: 'finance' }) : '/studio';
    case 'products': {
      const id = idFrom(second);
      return id ? `/products/${encodeURIComponent(id)}` : '/';
    }
    case 'posts': {
      const id = idFrom(second);
      return id ? `/posts/${encodeURIComponent(id)}` : '/';
    }
    case 'catalog': {
      const id = idFrom(second);
      return id ? `/catalog/${encodeURIComponent(id)}` : '/catalog';
    }
    case 'u': {
      const handle = idFrom(second);
      return handle
        ? nativePath('/studio/resolve-alias', { aliasType: 'profile', aliasValue: handle, source: 'app-link' })
        : '/';
    }
    default:
      return '/';
  }
}

/**
 * The native path for an https link to the web app on a claimed path, or null
 * for anything else: native paths, custom schemes, other hosts and web paths
 * the app does not claim all pass through untouched.
 */
export function nativePathForWebLink(url: string, hosts: Set<string> = appLinkHosts()): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname.toLowerCase())) return null;
  if (!isClaimedAppLinkPath(parsed.pathname)) return null;
  return nativePathForWebPath(parsed.pathname, parsed.search);
}

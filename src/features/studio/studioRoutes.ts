import { env } from '@/src/config/env';
import type { ResolvedTheme } from '@/src/types/theme';

export type StudioRouteKey =
  | 'overview'
  | 'store'
  | 'createProduct'
  | 'editProduct'
  | 'productDetail'
  | 'createCollection'
  | 'verification'
  | 'verificationApply'
  | 'verificationSubmitted'
  | 'customOrders'
  | 'customOrderDetail'
  | 'messages'
  | 'staff'
  | 'setup'
  | 'essentials'
  | 'orders'
  | 'customers'
  | 'analytics'
  | 'reviews'
  | 'finance';

export type StudioRouteParams = {
  productId?: string;
  orderId?: string;
};

export type StudioRouteConfig = {
  key: StudioRouteKey;
  title: string;
  subtitle: string;
  emoji: string;
  path: string;
  requires?: Array<keyof StudioRouteParams>;
};

export const STUDIO_ROUTES: Record<StudioRouteKey, StudioRouteConfig> = {
  overview: {
    key: 'overview',
    title: 'Dashboard',
    subtitle: 'Sales, activity, and store health',
    emoji: '📊',
    path: '/studio',
  },
  store: {
    key: 'store',
    title: 'Manage Store',
    subtitle: 'Products, collections, stock, and settings',
    emoji: '🛍️',
    // Stay on StudioHome (`?tab=`) so an island hop does not unmount the
    // dashboard shell and lazy-load `/studio/store` as a new document tree.
    path: '/studio?tab=store',
  },
  createProduct: {
    key: 'createProduct',
    title: 'Create Product',
    subtitle: 'Add a purchasable item to your store',
    emoji: '➕',
    path: '/studio/store/products/new',
  },
  editProduct: {
    key: 'editProduct',
    title: 'Edit Product',
    subtitle: 'Update product details',
    emoji: '✏️',
    path: '/studio/store/products/:id/edit',
    requires: ['productId'],
  },
  productDetail: {
    key: 'productDetail',
    title: 'Product Detail',
    subtitle: 'Review product state',
    emoji: '👗',
    path: '/studio/store/products/:id',
    requires: ['productId'],
  },
  createCollection: {
    key: 'createCollection',
    title: 'Create Collection',
    subtitle: 'Group products for a drop or campaign',
    emoji: '🧵',
    path: '/studio/store/collections/new',
  },
  verification: {
    key: 'verification',
    title: 'Verification',
    subtitle: 'Track brand verification status',
    emoji: '✅',
    path: '/studio/verification',
  },
  verificationApply: {
    key: 'verificationApply',
    title: 'Apply for Verification',
    subtitle: 'Submit documents and business details',
    emoji: '🪪',
    path: '/studio/verification/apply',
  },
  verificationSubmitted: {
    key: 'verificationSubmitted',
    title: 'Verification Submitted',
    subtitle: 'Review submitted verification state',
    emoji: '📨',
    path: '/studio/verification/submitted',
  },
  customOrders: {
    key: 'customOrders',
    title: 'Custom Orders',
    subtitle: 'Manage commissioned work',
    emoji: '📦',
    path: '/studio/custom-orders',
  },
  customOrderDetail: {
    key: 'customOrderDetail',
    title: 'Custom Order Detail',
    subtitle: 'Review one order',
    emoji: '🧾',
    path: '/studio/custom-orders/:orderId',
    requires: ['orderId'],
  },
  messages: {
    key: 'messages',
    title: 'Messages',
    subtitle: 'Customer conversations',
    emoji: '💬',
    path: '/studio/messages',
  },
  staff: {
    key: 'staff',
    title: 'Staff',
    subtitle: 'Team access and roles',
    emoji: '👥',
    path: '/studio/staff',
  },
  setup: {
    key: 'setup',
    title: 'Store Setup',
    subtitle: 'Complete the full store wizard',
    emoji: '🏗️',
    path: '/studio/store/setup',
  },
  essentials: {
    key: 'essentials',
    title: 'Store Essentials',
    subtitle: 'Required profile and policy setup',
    emoji: '🧰',
    path: '/studio/store/essentials',
  },
  orders: {
    key: 'orders',
    title: 'Orders',
    subtitle: 'Standard and custom order queues',
    emoji: '📦',
    path: '/studio?tab=orders',
  },
  customers: {
    key: 'customers',
    title: 'Customers',
    subtitle: 'Buyer relationships and history',
    emoji: '👥',
    path: '/studio?tab=customers',
  },
  analytics: {
    key: 'analytics',
    title: 'Analytics',
    subtitle: 'Performance and product insights',
    emoji: '📈',
    path: '/studio?tab=analytics',
  },
  reviews: {
    key: 'reviews',
    title: 'Reviews',
    subtitle: 'Ratings and customer feedback',
    emoji: '⭐',
    path: '/studio?tab=reviews',
  },
  finance: {
    key: 'finance',
    title: 'Finance',
    subtitle: 'Payouts, earnings, and account state',
    emoji: '💰',
    path: '/studio/finance',
  },
};

export function isStudioRouteKey(value: string | undefined): value is StudioRouteKey {
  return Boolean(value && value in STUDIO_ROUTES);
}

export function isStudioFocusedFlow(routeKey?: string | null): boolean {
  return (
    routeKey === 'createProduct' ||
    routeKey === 'editProduct' ||
    routeKey === 'createCollection'
  );
}

export function deriveStudioRouteKeyFromPath(pathValue?: string | null): StudioRouteKey | null {
  if (!pathValue) return null;
  const normalized = pathValue.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (normalized === '/studio/store/products/new') return 'createProduct';
  if (/^\/studio\/store\/products\/[^/]+\/edit$/.test(normalized)) return 'editProduct';
  if (/^\/studio\/store\/products\/[^/]+$/.test(normalized)) return 'productDetail';
  if (normalized === '/studio/store/collections/new') return 'createCollection';
  if (normalized === '/studio/store/setup') return 'setup';
  if (normalized === '/studio/store/essentials') return 'essentials';
  if (normalized === '/studio/verification') return 'verification';
  if (normalized === '/studio/verification/apply') return 'verificationApply';
  if (normalized === '/studio/verification/submitted') return 'verificationSubmitted';
  if (normalized === '/studio/custom-orders') return 'customOrders';
  if (/^\/studio\/custom-orders\/[^/]+$/.test(normalized)) return 'customOrderDetail';
  if (normalized === '/studio/staff') return 'staff';
  if (normalized === '/studio/finance') return 'finance';
  if (normalized === '/studio/messages') return 'messages';

  if (pathValue.includes('tab=')) {
    try {
      const parsed = new URL(pathValue, 'https://wiez.local');
      const tab = parsed.searchParams.get('tab');
      if (tab === 'store') return 'store';
      if (tab === 'orders') return 'orders';
      if (tab === 'customers') return 'customers';
      if (tab === 'analytics') return 'analytics';
      if (tab === 'reviews') return 'reviews';
      if (tab === 'finance') return 'finance';
      if (tab === 'overview') return 'overview';
    } catch {}
  }

  if (normalized === '/studio' || normalized === '/studio/store') {
    return normalized === '/studio/store' ? 'store' : 'overview';
  }

  return null;
}

export function buildStudioPath(routeKey: StudioRouteKey, params?: StudioRouteParams): string {
  const route = STUDIO_ROUTES[routeKey];
  let path = route.path;
  if (path.includes(':id')) {
    if (!params?.productId) throw new Error('Missing productId for Studio route');
    path = path.replace(':id', encodeURIComponent(params.productId));
  }
  if (path.includes(':orderId')) {
    if (!params?.orderId) throw new Error('Missing orderId for Studio route');
    path = path.replace(':orderId', encodeURIComponent(params.orderId));
  }
  return path;
}

export function buildStudioWebUrl(args: {
  routeKey: StudioRouteKey;
  params?: StudioRouteParams;
  handoffCode?: string | null;
  theme?: ResolvedTheme;
}): string {
  const base = env.webAppUrl.replace(/\/$/, '');
  const path = buildStudioPath(args.routeKey, args.params);
  const url = new URL(path, base);
  url.searchParams.set('surface', 'mobile-app');
  if (args.theme) {
    url.searchParams.set('theme', args.theme);
  }
  if (args.handoffCode) {
    url.searchParams.set('handoffCode', args.handoffCode);
  }
  return url.toString();
}

export function appendStudioEmbeddedParams(path: string, theme: ResolvedTheme): string {
  const [pathWithSearch, hash = ''] = path.split('#');
  const [pathname, search = ''] = pathWithSearch.split('?');
  const params = new URLSearchParams(search);
  params.set('surface', 'mobile-app');
  params.set('theme', theme);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function getTrustedStudioOrigins(): Set<string> {
  const origins = new Set<string>();

  const addOrigin = (value: string) => {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed optional environment entries.
    }
  };

  addOrigin(env.webAppUrl);
  env.trustedWebOrigins.forEach(addOrigin);

  return origins;
}

export function getStudioOriginWhitelist(): string[] {
  return Array.from(getTrustedStudioOrigins());
}

import { env } from '@/src/config/env';

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
  | 'setup'
  | 'essentials'
  | 'orders'
  | 'customers'
  | 'analytics'
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
    path: '/studio/store',
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
  finance: {
    key: 'finance',
    title: 'Finance',
    subtitle: 'Payouts, earnings, and account state',
    emoji: '💰',
    path: '/studio?tab=finance',
  },
};

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
}): string {
  const base = env.webAppUrl.replace(/\/$/, '');
  const path = buildStudioPath(args.routeKey, args.params);
  const url = new URL(path, base);
  url.searchParams.set('surface', 'mobile-app');
  if (args.handoffCode) {
    url.searchParams.set('handoffCode', args.handoffCode);
  }
  return url.toString();
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

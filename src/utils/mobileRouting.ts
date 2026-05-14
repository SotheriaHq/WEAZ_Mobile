import type { Href } from 'expo-router';

import type { MobileNotification } from '@/src/api/NotificationsApi';
import type { SearchItem } from '@/src/types/search';
import type { MessageContextParams } from '@/src/types/messaging';

type RouterTarget = Href;

function parseHrefId(href: string, pattern: RegExp): string | null {
  const match = href.match(pattern);
  return match?.[1] ?? null;
}

function parseTargetUrlPath(targetUrl: string) {
  try {
    return new URL(targetUrl, 'https://threadly.mobile').pathname;
  } catch {
    return targetUrl.split('?')[0] || targetUrl;
  }
}

export function routeForSearchItem(item: SearchItem): RouterTarget {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const ownerId = typeof metadata.ownerId === 'string' ? metadata.ownerId : null;
  const brandId = typeof metadata.brandId === 'string' ? metadata.brandId : null;
  const brandOwnerId = typeof metadata.brandOwnerId === 'string' ? metadata.brandOwnerId : null;

  switch (item.type) {
    case 'brand': {
      const routeBrandId = ownerId ?? item.id ?? parseHrefId(item.href, /\/profile\/([^/?#]+)/);
      if (routeBrandId) {
        return { pathname: '/catalog/[brandId]', params: { brandId: routeBrandId } } as Href;
      }
      break;
    }
    case 'product': {
      const routeBrandId = brandId ?? brandOwnerId;
      if (routeBrandId) {
        return {
          pathname: '/catalog/[brandId]',
          params: { brandId: routeBrandId, tab: 'Shop', productId: item.id },
        } as Href;
      }
      return { pathname: '/products/[productId]', params: { productId: item.id } } as Href;
    }
    case 'collection':
      return routeForStoreCollectionTarget(item.id);
    case 'design':
      return routeForDesignTarget(item.id, { legacyCollectionId: item.id });
    case 'tag':
      return {
        pathname: '/search',
        params: { q: item.title, type: 'tag', autoSubmit: '1' },
      } as Href;
    default:
      break;
  }

  return '/search' as Href;
}

export function routeForDesignTarget(
  designId: string,
  options: {
    legacyCollectionId?: string | null;
    openComments?: boolean;
    commentId?: string | null;
  } = {},
): RouterTarget {
  return {
    pathname: '/designs/[designId]',
    params: {
      designId,
      ...(options.legacyCollectionId && options.legacyCollectionId !== designId
        ? { legacyCollectionId: options.legacyCollectionId }
        : null),
      ...(options.openComments ? { openComments: '1' } : null),
      ...(options.commentId ? { commentId: options.commentId } : null),
    },
  } as unknown as Href;
}

export function routeForStoreCollectionTarget(
  collectionId: string,
  options: {
    openComments?: boolean;
    commentId?: string | null;
  } = {},
): RouterTarget {
  return {
    pathname: '/collections/[collectionId]',
    params: {
      collectionId,
      ...(options.openComments ? { openComments: '1' } : null),
      ...(options.commentId ? { commentId: options.commentId } : null),
    },
  } as unknown as Href;
}

function routeForLegacyCollectionBackedDesignTarget(
  legacyCollectionId: string,
  openComments?: boolean,
  commentId?: string | null,
): RouterTarget {
  return routeForDesignTarget(legacyCollectionId, {
    legacyCollectionId,
    openComments,
    commentId,
  });
}

function routeForProductTarget(notification: MobileNotification): RouterTarget {
  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const brandId =
    (typeof payload.brandId === 'string' ? payload.brandId : null) ??
    (typeof payload.brandOwnerId === 'string' ? payload.brandOwnerId : null);

  if (brandId) {
    return {
      pathname: '/catalog/[brandId]',
      params: {
        brandId,
        tab: 'Shop',
        productId: notification.target?.id ?? (typeof payload.productId === 'string' ? payload.productId : ''),
      },
    } as Href;
  }

  const productId =
    notification.target?.id ??
    (typeof payload.productId === 'string' ? payload.productId : null);

  if (productId) {
    return { pathname: '/products/[productId]', params: { productId } } as Href;
  }

  return '/(tabs)/discover' as Href;
}

export function routeForNotification(notification: MobileNotification): RouterTarget {
  const type = notification.type.toUpperCase();
  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const target = notification.target;
  const targetType = target?.type;
  const targetId = target?.id ?? null;
  const actorId = notification.actor?.id ?? null;
  const commentId =
    notification.subTargetId ??
    (typeof payload.commentId === 'string' ? payload.commentId : null);

  if (targetType === 'COLLECTION_MEDIA') {
    const collectionId = typeof payload.collectionId === 'string' ? payload.collectionId : null;
    if (collectionId) {
      return routeForLegacyCollectionBackedDesignTarget(collectionId, true, commentId);
    }
  }

  if (targetType === 'DESIGN' && targetId) {
    return routeForDesignTarget(targetId, {
      legacyCollectionId: typeof payload.legacyCollectionId === 'string' ? payload.legacyCollectionId : null,
      openComments: Boolean(commentId),
      commentId,
    });
  }

  if (targetType === 'COLLECTION' && targetId) {
    // Backend notifications can still use COLLECTION for legacy
    // collection-backed design alerts. Keep routing old payloads to the
    // design alias until Phase D separates persistence.
    return routeForLegacyCollectionBackedDesignTarget(targetId, Boolean(commentId), commentId);
  }

  if (targetType === 'PRODUCT') {
    return routeForProductTarget(notification);
  }

  if (targetType === 'POST' && targetId) {
    return { pathname: '/posts/[postId]', params: { postId: targetId, ...(commentId ? { commentId } : null) } } as unknown as Href;
  }

  if (targetType === 'USER' && targetId) {
    return { pathname: '/catalog/[brandId]', params: { brandId: targetId } } as Href;
  }

  if (type.includes('MESSAGE')) {
    return '/(tabs)/inbox' as Href;
  }

  if (type === 'TAG_MENTION') {
    if (actorId) {
      return { pathname: '/catalog/[brandId]', params: { brandId: actorId } } as Href;
    }
  }

  if (
    type === 'PRIVATE_ACCESS_REQUESTED' ||
    type === 'PRIVATE_ACCESS_APPROVED' ||
    type === 'PRIVATE_ACCESS_REJECTED' ||
    type === 'PRIVATE_ACCESS_REVOKED' ||
    type === 'CONTRIBUTION_REQUEST' ||
    type === 'CONTRIBUTION_ACCEPTED' ||
    type === 'CONTRIBUTION_REJECTED' ||
    type === 'COLLECTION_UPLOAD'
  ) {
    if (typeof payload.collectionId === 'string') {
      return routeForLegacyCollectionBackedDesignTarget(payload.collectionId, Boolean(commentId));
    }
  }

  if (type.startsWith('ORDER_') || type.startsWith('CUSTOM_ORDER_')) {
    return '/orders' as Href;
  }

  if (type.startsWith('SIZE_FIT_')) {
    return '/(tabs)/me' as Href;
  }

  if (type.startsWith('BRAND_PATCH_') || type === 'PATCH') {
    return { pathname: '/(tabs)/me', params: { tab: 'Patches' } } as Href;
  }

  if (type === 'FOLLOW' && actorId) {
    return { pathname: '/catalog/[brandId]', params: { brandId: actorId } } as Href;
  }

  if (type === 'PRODUCT_UPLOAD') {
    return routeForProductTarget(notification);
  }

  if (type === 'WISHLIST_PRODUCT_AVAILABLE' || type === 'WISHLIST_PRODUCT_UNAVAILABLE') {
    return routeForProductTarget(notification);
  }

  if (type === 'COLLECTION_DELETED') {
    return {
      pathname: '/catalog',
      params: { tab: 'Collections', visibility: 'Drafts' },
    } as Href;
  }

  if (type === 'LOGIN' || type === 'LOGOUT' || type === 'LOGOUT_ALL' || type === 'SIGNUP') {
    return '/(tabs)/me' as Href;
  }

  if (type.startsWith('VERIFICATION_')) {
    return '/catalog' as Href;
  }

  if (typeof notification.targetUrl === 'string' && notification.targetUrl.trim().length > 0) {
    const targetUrl = notification.targetUrl.trim();
    const path = parseTargetUrlPath(targetUrl);
    const designId = parseHrefId(targetUrl, /\/designs\/([^/?#]+)/);
    const collectionId = parseHrefId(targetUrl, /\/collections\/([^/?#]+)/);
    const productId = parseHrefId(targetUrl, /\/products\/([^/?#]+)/);
    const profileId = parseHrefId(targetUrl, /\/profile\/([^/?#]+)/);
    const draftId = parseHrefId(targetUrl, /\/studio\/drafts\/([^/?#]+)/);

    if (designId) {
      return routeForDesignTarget(designId, {
        legacyCollectionId: typeof payload.legacyCollectionId === 'string' ? payload.legacyCollectionId : null,
        openComments: Boolean(commentId),
        commentId,
      });
    }
    if (collectionId) {
      // Historical shared links used /collections/:id for design-backed rows.
      // Keep that compatibility path until backend target URLs are fully typed.
      return routeForLegacyCollectionBackedDesignTarget(collectionId, Boolean(commentId), commentId);
    }
    if (productId) {
      return { pathname: '/products/[productId]', params: { productId } } as Href;
    }
    if (profileId) {
      return { pathname: '/catalog/[brandId]', params: { brandId: profileId } } as Href;
    }
    if (draftId) {
      return { pathname: '/designs/[designId]/edit', params: { designId: draftId } } as unknown as Href;
    }
    if (path === '/profile') {
      const tab = new URL(targetUrl, 'https://threadly.mobile').searchParams.get('tab')?.toLowerCase();
      if (tab === 'orders') return '/orders' as Href;
      return '/(tabs)/me' as Href;
    }
    const orderId = parseHrefId(targetUrl, /\/orders\/([^/?#]+)/);
    const customOrderId = parseHrefId(targetUrl, /\/custom-orders\/([^/?#]+)/);
    if (orderId || customOrderId) {
      return { pathname: '/orders/[orderId]', params: { orderId: orderId ?? customOrderId } } as Href;
    }
    if (path === '/orders' || path === '/custom-orders') {
      return '/orders' as Href;
    }
    if (path.startsWith('/messages') || path.startsWith('/inbox')) {
      return '/(tabs)/inbox' as Href;
    }
    if (path.startsWith('/settings')) {
      const tabMatch = targetUrl.match(/[?&]tab=([^&#]+)/i);
      const normalizedTab = tabMatch?.[1]?.toLowerCase();
      if (normalizedTab === 'patches') {
        return { pathname: '/(tabs)/me', params: { tab: 'Patches' } } as Href;
      }
      if (normalizedTab === 'notifications' || normalizedTab === 'orders') {
        return normalizedTab === 'orders'
          ? ('/orders' as Href)
          : ('/notifications' as Href);
      }
      return '/(tabs)/me' as Href;
    }
  }

  return '/notifications' as Href;
}

/**
 * Normalize a notification or deep-link payload into message context params.
 * Handles notification payload fields: threadId, conversationId, messageId, orderId,
 * customOrderId, brandId, customerId, actorUserId, etc.
 */
export function normalizeNotificationContext(
  payload: Record<string, unknown> | null | undefined,
  contextOverrides: MessageContextParams = {},
): MessageContextParams {
  if (!payload) {
    return { ...contextOverrides };
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : null;
  const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
  const customOrderId = typeof payload.customOrderId === 'string' ? payload.customOrderId : null;
  const brandId = typeof payload.brandId === 'string' ? payload.brandId : null;
  const customerId = typeof payload.customerId === 'string' ? payload.customerId : null;
  const designId = typeof payload.designId === 'string' ? payload.designId : null;
  const productId = typeof payload.productId === 'string' ? payload.productId : null;

  // Do not route unsupported design/product context as valid thread context
  // These should be caught by the ChatThread unsupported state
  const hasUnsupportedContext = Boolean(designId || productId);

  return {
    ...contextOverrides,
    threadId,
    conversationId,
    messageId,
    orderId,
    customOrderId,
    brandId,
    customerId,
    designId,
    productId,
    _hasUnsupportedContext: hasUnsupportedContext,
  };
}

/**
 * Determine the target route for a message notification payload.
 * Prioritizes threadId/conversationId for direct navigation, then falls back
 * to resolver-capable params (messageId, orderId, customOrderId, brandId, etc.)
 * Returns null for generic message notifications without context.
 */
export function getMessageNotificationTarget(
  payload: Record<string, unknown> | null | undefined,
): {
  type: 'thread' | 'inbox' | 'unsupported';
  params: MessageContextParams;
} | null {
  const context = normalizeNotificationContext(payload);

  // Check for unsupported design/product context first
  if (context._hasUnsupportedContext) {
    return { type: 'unsupported', params: context };
  }

  const { threadId, conversationId, messageId, orderId, customOrderId, brandId, customerId } = context;

  // Direct thread navigation
  if (threadId || conversationId) {
    return { type: 'thread', params: context };
  }

  // Context that can be resolved by the ChatThread resolver
  if (messageId || orderId || customOrderId || brandId || customerId) {
    return { type: 'thread', params: context };
  }

  // Generic message notification without specific context - route to inbox
  if (payload && typeof payload.type === 'string' && String(payload.type).toLowerCase().includes('message')) {
    return { type: 'inbox', params: context };
  }

  return null;
}

import type { Href } from 'expo-router';

import type { MobileNotification } from '@/src/api/NotificationsApi';
import type { SearchItem } from '@/src/types/search';
import type { MessageContextParams } from '@/src/types/messaging';

type RouterTarget = Href;
type MessageNotificationTarget = {
  type: 'thread' | 'inbox' | 'unsupported';
  params: MessageContextParams;
};

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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstQueryValue(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(params.get(key));
    if (value) return value;
  }
  return null;
}

function parseTargetUrl(targetUrl: string): { path: string; params: URLSearchParams } | null {
  try {
    const parsed = new URL(targetUrl, 'https://threadly.mobile');
    const schemeHostPath =
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:' &&
      parsed.hostname &&
      !parsed.pathname;
    const rawPath = schemeHostPath ? `/${parsed.hostname}` : parsed.pathname || '/';
    return {
      path: rawPath.startsWith('/') ? rawPath : `/${rawPath}`,
      params: parsed.searchParams,
    };
  } catch {
    return null;
  }
}

function isMessageLikeValue(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('message');
}

function isMessageTargetUrl(targetUrl: unknown): boolean {
  const normalizedTargetUrl = readString(targetUrl);
  if (!normalizedTargetUrl) return false;

  const parsed = parseTargetUrl(normalizedTargetUrl);
  if (!parsed) return false;

  const path = parsed.path.toLowerCase();
  const tab = readString(parsed.params.get('tab'))?.toLowerCase();
  const openChat = readString(parsed.params.get('openChat'))?.toLowerCase();

  return (
    path === '/messages' ||
    path.startsWith('/messages/') ||
    path === '/inbox' ||
    path === '/studio/messages' ||
    path.startsWith('/studio/messages/') ||
    tab === 'messages' ||
    openChat === '1' ||
    openChat === 'true'
  );
}

function isMessageNotificationPayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) return false;
  return (
    isMessageLikeValue(payload.type) ||
    isMessageLikeValue(payload.category) ||
    isMessageLikeValue(payload.notificationType) ||
    isMessageTargetUrl(payload.targetUrl)
  );
}

export function parseMessageTargetUrl(targetUrl: unknown): MessageContextParams {
  const normalizedTargetUrl = readString(targetUrl);
  if (!normalizedTargetUrl || !isMessageTargetUrl(normalizedTargetUrl)) {
    return {};
  }

  const parsed = parseTargetUrl(normalizedTargetUrl);
  if (!parsed) return {};

  const threadId = firstQueryValue(parsed.params, ['threadId', 'thread']);
  const conversationId = firstQueryValue(parsed.params, ['conversationId']) ?? threadId;

  return {
    threadId,
    conversationId,
    messageId: firstQueryValue(parsed.params, ['messageId']),
    orderId: firstQueryValue(parsed.params, ['orderId']),
    customOrderId: firstQueryValue(parsed.params, ['customOrderId']),
    brandId: firstQueryValue(parsed.params, ['brandId']),
    customerId: firstQueryValue(parsed.params, ['customerId']),
    targetUrl: normalizedTargetUrl,
  };
}

function mergeMessageContexts(
  primary: MessageContextParams,
  fallback: MessageContextParams,
): MessageContextParams {
  return {
    threadId: primary.threadId ?? fallback.threadId ?? null,
    conversationId: primary.conversationId ?? fallback.conversationId ?? primary.threadId ?? fallback.threadId ?? null,
    messageId: primary.messageId ?? fallback.messageId ?? null,
    orderId: primary.orderId ?? fallback.orderId ?? null,
    customOrderId: primary.customOrderId ?? fallback.customOrderId ?? null,
    brandId: primary.brandId ?? fallback.brandId ?? null,
    customerId: primary.customerId ?? fallback.customerId ?? null,
    actorUserId: primary.actorUserId ?? fallback.actorUserId ?? null,
    targetUrl: primary.targetUrl ?? fallback.targetUrl ?? null,
    designId: primary.designId ?? fallback.designId ?? null,
    productId: primary.productId ?? fallback.productId ?? null,
  };
}

function hasSupportedMessageContext(context: MessageContextParams): boolean {
  return Boolean(
    context.threadId ||
      context.conversationId ||
      context.messageId ||
      context.orderId ||
      context.customOrderId ||
      context.brandId ||
      context.customerId,
  );
}

export function buildMessageNotificationRoute(target: MessageNotificationTarget): RouterTarget {
  if (target.type !== 'thread') {
    return '/(tabs)/inbox' as Href;
  }

  const routeThreadId =
    target.params.threadId ??
    target.params.conversationId ??
    'resolve';

  return {
    pathname: '/messages/[threadId]',
    params: {
      threadId: routeThreadId,
      ...(target.params.conversationId ? { conversationId: target.params.conversationId } : null),
      ...(target.params.messageId ? { messageId: target.params.messageId } : null),
      ...(target.params.orderId ? { orderId: target.params.orderId } : null),
      ...(target.params.customOrderId ? { customOrderId: target.params.customOrderId } : null),
      ...(target.params.brandId ? { brandId: target.params.brandId } : null),
      ...(target.params.customerId ? { customerId: target.params.customerId } : null),
    },
  } as Href;
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
    const target = getMessageNotificationTarget({
      ...payload,
      ...(typeof notification.targetUrl === 'string' ? { targetUrl: notification.targetUrl } : null),
    });
    return target ? buildMessageNotificationRoute(target) : ('/(tabs)/inbox' as Href);
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
  const targetUrlContext = parseMessageTargetUrl(payload?.targetUrl ?? contextOverrides.targetUrl);
  if (!payload) {
    return mergeMessageContexts(contextOverrides, targetUrlContext);
  }

  const directContext: MessageContextParams = {
    threadId: readString(payload.threadId),
    conversationId: readString(payload.conversationId),
    messageId: readString(payload.messageId),
    orderId: readString(payload.orderId),
    customOrderId: readString(payload.customOrderId),
    brandId: readString(payload.brandId),
    customerId: readString(payload.customerId),
    actorUserId: readString(payload.actorUserId),
    targetUrl: readString(payload.targetUrl),
    designId: readString(payload.designId),
    productId: readString(payload.productId),
  };

  const context = mergeMessageContexts(
    directContext,
    mergeMessageContexts(targetUrlContext, contextOverrides),
  );
  const hasUnsupportedContext = Boolean((context.designId || context.productId) && !hasSupportedMessageContext(context));

  return {
    ...context,
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
): MessageNotificationTarget | null {
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
  if (isMessageNotificationPayload(payload)) {
    return { type: 'inbox', params: context };
  }

  return null;
}

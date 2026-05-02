import { apiClient } from '@/src/api/httpClient';
import type {
  ConversationListResponse,
  ConversationParticipant,
  ConversationSummary,
  ConversationThread,
  MessageAttachment,
  MessageAttachmentKind,
  MessageContextParams,
  MessageContextType,
  MessageDeliveryStatus,
  MessageItem,
  MessageKind,
  MessageParticipantRole,
  MessageUnreadCountResponse,
  MessageSendResponse,
  MessageSendTarget,
  MessageThreadStatus,
  MessageVisibilityState,
  NativeMessageUpload,
  ResolvedConversationRoute,
  SendMessagePayload,
  StartConversationPayload,
  ThreadOrderItem,
  UploadedMessageAttachment,
} from '@/src/types/messaging';

export type ListConversationsParams = {
  cursorLastMessageAt?: string | null;
  cursorThreadId?: string | null;
  limit?: number;
  filter?: 'all' | 'unread' | 'archived';
  contextType?: 'all' | MessageContextType;
  q?: string | null;
};

export type ConversationMessagesParams = {
  cursorCreatedAt?: string | null;
  cursorId?: string | null;
  limit?: number;
};

const MESSAGE_CONTEXT_TYPES = new Set(['DIRECT', 'INQUIRY', 'STANDARD_ORDER', 'CUSTOM_ORDER']);
const THREAD_STATUSES = new Set(['OPEN', 'READ_ONLY', 'ARCHIVED', 'BLOCKED']);
const PARTICIPANT_ROLES = new Set(['BUYER', 'BRAND_OWNER', 'ADMIN', 'SYSTEM']);
const MESSAGE_KINDS = new Set(['USER', 'SYSTEM', 'MODERATION_NOTICE']);
const VISIBILITY_STATES = new Set(['VISIBLE', 'HIDDEN', 'REDACTED']);
const DELIVERY_STATUSES = new Set(['SENT', 'DELIVERED', 'READ']);
const ATTACHMENT_KINDS = new Set(['IMAGE', 'DOCUMENT']);

const unwrapData = <T,>(payload: unknown): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

const asBoolean = (value: unknown): boolean => value === true || value === 'true' || value === 1;

const enumValue = <T extends string>(value: unknown, allowed: Set<string>, fallback: T): T => {
  const normalized = asString(value)?.toUpperCase();
  return normalized && allowed.has(normalized) ? (normalized as T) : fallback;
};

const optionalEnumValue = <T extends string>(value: unknown, allowed: Set<string>): T | null => {
  const normalized = asString(value)?.toUpperCase();
  return normalized && allowed.has(normalized) ? (normalized as T) : null;
};

const getThreadId = (source: Record<string, unknown>, fallback?: string | null) =>
  asString(source.threadId) ?? asString(source.id) ?? fallback ?? null;

const normalizeContext = (
  raw: unknown,
  fallback?: MessageContextParams,
): MessageContextParams => {
  const source = asRecord(raw);
  const threadId = asString(source.threadId) ?? fallback?.threadId ?? null;
  return {
    threadId,
    conversationId: asString(source.conversationId) ?? threadId ?? fallback?.conversationId ?? null,
    orderId: asString(source.orderId) ?? fallback?.orderId ?? null,
    customOrderId: asString(source.customOrderId) ?? fallback?.customOrderId ?? null,
    messageId: asString(source.messageId) ?? fallback?.messageId ?? null,
    brandId: asString(source.brandId) ?? fallback?.brandId ?? null,
    customerId: asString(source.customerId) ?? fallback?.customerId ?? null,
    designId: asString(source.designId) ?? fallback?.designId ?? null,
    productId: asString(source.productId) ?? fallback?.productId ?? null,
  };
};

export function createMessageClientId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (marker) => {
    const value = Math.floor(Math.random() * 16);
    const resolved = marker === 'x' ? value : (value & 0x3) | 0x8;
    return resolved.toString(16);
  });
}

export function normalizeConversationParticipant(raw: unknown): ConversationParticipant | null {
  const source = asRecord(raw);
  if (Object.keys(source).length === 0) return null;

  const id = asString(source.id);
  const firstName = asString(source.firstName);
  const lastName = asString(source.lastName);
  const username = asString(source.username);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    id,
    username,
    firstName,
    lastName,
    name: fullName || username || null,
    avatarUrl: asString(source.profileImage) ?? asString(source.avatarUrl) ?? asString(source.avatar),
  };
}

export function normalizeMessageAttachment(raw: unknown): MessageAttachment | null {
  const source = asRecord(raw);
  const id = asString(source.id);
  if (!id) return null;

  const file = asRecord(source.file);
  return {
    id,
    kind: optionalEnumValue<MessageAttachmentKind>(source.kind, ATTACHMENT_KINDS),
    file: {
      id: asString(file.id) ?? asString(source.fileUploadId),
      url: asString(file.s3Url) ?? asString(file.url) ?? asString(source.url),
      originalName: asString(file.originalName) ?? asString(file.fileName),
      mimeType: asString(file.mimeType),
      size: asNumber(file.size),
    },
  };
}

export function normalizeMessageItem(raw: unknown, fallbackThreadId?: string | null): MessageItem | null {
  const source = asRecord(raw);
  const id = asString(source.id);
  const threadId = asString(source.threadId) ?? fallbackThreadId ?? null;
  if (!id || !threadId) return null;

  const attachments = Array.isArray(source.attachments)
    ? source.attachments
        .map((entry) => normalizeMessageAttachment(entry))
        .filter((entry): entry is MessageAttachment => Boolean(entry))
    : [];

  return {
    id,
    threadId,
    conversationId: threadId,
    senderUserId: asString(source.senderUserId),
    senderRole: enumValue<MessageParticipantRole>(source.senderRole, PARTICIPANT_ROLES, 'SYSTEM'),
    kind: enumValue<MessageKind>(source.kind, MESSAGE_KINDS, 'USER'),
    visibilityState: enumValue<MessageVisibilityState>(source.visibilityState, VISIBILITY_STATES, 'VISIBLE'),
    bodyText: asString(source.bodyText),
    createdAt: asString(source.createdAt),
    deliveryStatus: optionalEnumValue<MessageDeliveryStatus>(source.deliveryStatus, DELIVERY_STATUSES),
    sender: normalizeConversationParticipant(source.sender),
    attachments,
  };
}

export function normalizeConversationSummary(raw: unknown): ConversationSummary | null {
  const source = asRecord(raw);
  const threadId = asString(source.threadId);
  if (!threadId) return null;

  const participant = normalizeConversationParticipant(source.participant);
  const unreadCount = asNumber(source.unreadCount) ?? 0;
  const context = normalizeContext(source, { threadId });

  return {
    threadId,
    conversationId: threadId,
    contextType: enumValue<MessageContextType>(source.contextType, MESSAGE_CONTEXT_TYPES, 'DIRECT'),
    context,
    orderId: context.orderId ?? null,
    customOrderId: context.customOrderId ?? null,
    inquiryId: asString(source.inquiryId),
    title: asString(source.title) ?? 'Conversation',
    subtitle: asString(source.subtitle),
    participant,
    lastMessageAt: asString(source.lastMessageAt),
    createdAt: asString(source.createdAt),
    unreadCount,
    hasUnread: asBoolean(source.hasUnread) || unreadCount > 0,
    mutedUntil: asString(source.mutedUntil),
    archivedAt: asString(source.archivedAt),
    targetUrl: asString(source.targetUrl),
    orderDetailUrl: asString(source.orderDetailUrl),
  };
}

export function normalizeConversationList(raw: unknown): ConversationListResponse {
  const payload = asRecord(unwrapData<unknown>(raw));
  const items = Array.isArray(payload.items)
    ? payload.items
        .map((entry) => normalizeConversationSummary(entry))
        .filter((entry): entry is ConversationSummary => Boolean(entry))
    : [];

  const cursor = asRecord(payload.endCursor);
  const cursorLastMessageAt = asString(cursor.cursorLastMessageAt);
  const cursorThreadId = asString(cursor.cursorThreadId);

  return {
    items,
    hasNextPage: asBoolean(payload.hasNextPage),
    endCursor: cursorLastMessageAt && cursorThreadId
      ? { cursorLastMessageAt, cursorThreadId }
      : null,
  };
}

export function normalizeConversationThread(raw: unknown, fallbackThreadId?: string | null): ConversationThread {
  const payload = asRecord(unwrapData<unknown>(raw));
  const thread = asRecord(payload.thread);
  const threadId =
    asString(thread.id) ??
    getThreadId(payload, fallbackThreadId) ??
    fallbackThreadId ??
    '';

  const messages = Array.isArray(payload.items)
    ? payload.items
        .map((entry) => normalizeMessageItem(entry, threadId))
        .filter((entry): entry is MessageItem => Boolean(entry))
    : [];

  const cursor = asRecord(payload.endCursor);
  const createdAt = asString(cursor.createdAt);
  const id = asString(cursor.id);

  return {
    threadId,
    conversationId: threadId,
    status: optionalEnumValue<MessageThreadStatus>(thread.status, THREAD_STATUSES),
    messages,
    hasNextPage: asBoolean(payload.hasNextPage),
    endCursor: createdAt && id ? { createdAt, id } : null,
  };
}

export function normalizeResolvedConversationRoute(raw: unknown): ResolvedConversationRoute | null {
  const source = asRecord(unwrapData<unknown>(raw));
  const threadId = asString(source.threadId);
  if (!threadId) return null;

  const context = normalizeContext(source, { threadId });
  return {
    threadId,
    conversationId: threadId,
    contextType: enumValue<MessageContextType>(source.contextType, MESSAGE_CONTEXT_TYPES, 'DIRECT'),
    context,
    orderId: context.orderId ?? null,
    customOrderId: context.customOrderId ?? null,
    inquiryType: asString(source.inquiryType),
    targetUrl: asString(source.targetUrl),
    orderDetailUrl: asString(source.orderDetailUrl),
  };
}

export function normalizeThreadOrderItem(raw: unknown): ThreadOrderItem | null {
  const source = asRecord(raw);
  const id = asString(source.id);
  if (!id) return null;

  return {
    id,
    type: enumValue<'STANDARD_ORDER' | 'CUSTOM_ORDER'>(
      source.type,
      new Set(['STANDARD_ORDER', 'CUSTOM_ORDER']),
      'STANDARD_ORDER',
    ),
    status: asString(source.status) ?? 'UNKNOWN',
    state: enumValue<'active' | 'closed' | 'cancelled' | 'disputed'>(
      source.state,
      new Set(['active', 'closed', 'cancelled', 'disputed']),
      'active',
    ),
    title: asString(source.title) ?? 'Order',
    totalAmount: asNumber(source.totalAmount) ?? 0,
    currency: asString(source.currency),
    createdAt: asString(source.createdAt),
    orderDetailUrl: asString(source.orderDetailUrl),
    canView: asBoolean(source.canView),
    canDispute: asBoolean(source.canDispute),
    canCancel: asBoolean(source.canCancel),
  };
}

export function normalizeUploadedMessageAttachment(raw: unknown): UploadedMessageAttachment | null {
  const source = asRecord(unwrapData<unknown>(raw));
  const id = asString(source.id);
  if (!id) return null;

  return {
    id,
    url: asString(source.url) ?? asString(source.s3Url),
    fileName: asString(source.fileName),
    originalName: asString(source.originalName) ?? asString(source.fileName),
    mimeType: asString(source.mimeType),
    size: asNumber(source.size),
  };
}

const normalizeSendResponse = (raw: unknown, fallbackThreadId?: string | null): MessageSendResponse => {
  const payload = asRecord(unwrapData<unknown>(raw));
  const thread = asRecord(payload.thread);
  const threadId = asString(thread.id) ?? fallbackThreadId ?? null;
  const message = normalizeMessageItem(payload.message, threadId);

  return {
    threadId: threadId ?? message?.threadId ?? null,
    conversationId: threadId ?? message?.threadId ?? null,
    message,
    replay: asBoolean(payload.replay),
  };
};

const normalizeUnreadCount = (raw: unknown): MessageUnreadCountResponse => {
  const payload = asRecord(unwrapData<unknown>(raw));
  return {
    unreadCount: Math.max(0, asNumber(payload.unreadCount) ?? 0),
  };
};

const resolveMessagePath = (target: MessageSendTarget, action: 'messages' | 'read') => {
  if (target.threadId || target.conversationId) {
    const threadId = target.threadId ?? target.conversationId;
    return `/messaging/threads/${threadId}/${action === 'messages' ? 'messages' : 'read'}`;
  }

  if (target.orderId) {
    return target.brandId
      ? `/brands/${target.brandId}/orders/${target.orderId}/messages${action === 'read' ? '/read' : ''}`
      : `/orders/${target.orderId}/messages${action === 'read' ? '/read' : ''}`;
  }

  if (target.customOrderId) {
    return target.brandId
      ? `/brands/${target.brandId}/custom-orders/${target.customOrderId}/messages${action === 'read' ? '/read' : ''}`
      : `/custom-orders/${target.customOrderId}/messages${action === 'read' ? '/read' : ''}`;
  }

  throw new Error('A threadId, conversationId, orderId, or customOrderId is required');
};

const resolveThreadPath = (context: MessageContextParams) => {
  if (context.threadId || context.conversationId) {
    return {
      path: `/messaging/threads/${context.threadId ?? context.conversationId}/messages`,
      fallbackThreadId: context.threadId ?? context.conversationId ?? null,
    };
  }

  if (context.orderId) {
    return {
      path: context.brandId
        ? `/brands/${context.brandId}/orders/${context.orderId}/messages`
        : `/orders/${context.orderId}/messages`,
      fallbackThreadId: null,
    };
  }

  if (context.customOrderId) {
    return {
      path: context.brandId
        ? `/brands/${context.brandId}/custom-orders/${context.customOrderId}/messages`
        : `/custom-orders/${context.customOrderId}/messages`,
      fallbackThreadId: null,
    };
  }

  throw new Error('A threadId, conversationId, orderId, or customOrderId is required');
};

export const MessagingApi = {
  async listConversations(params?: ListConversationsParams): Promise<ConversationListResponse> {
    const response = await apiClient.get('/messaging/inbox', {
      params: {
        cursorLastMessageAt: params?.cursorLastMessageAt ?? undefined,
        cursorThreadId: params?.cursorThreadId ?? undefined,
        limit: params?.limit ?? 30,
        filter: params?.filter ?? undefined,
        contextType: params?.contextType ?? undefined,
        q: params?.q ?? undefined,
      },
    });

    return normalizeConversationList(response.data);
  },

  async resolveConversation(threadId: string): Promise<ResolvedConversationRoute | null> {
    const response = await apiClient.get(`/messaging/threads/${threadId}/resolve`);
    return normalizeResolvedConversationRoute(response.data);
  },

  async resolveConversationFromContext(
    context: MessageContextParams,
  ): Promise<ResolvedConversationRoute | null> {
    const response = await apiClient.get('/messaging/conversations/resolve', {
      params: {
        threadId: context.threadId ?? undefined,
        conversationId: context.conversationId ?? undefined,
        messageId: context.messageId ?? undefined,
        orderId: context.orderId ?? undefined,
        customOrderId: context.customOrderId ?? undefined,
        brandId: context.brandId ?? undefined,
        customerId: context.customerId ?? undefined,
        designId: context.designId ?? undefined,
        productId: context.productId ?? undefined,
      },
    });
    return normalizeResolvedConversationRoute(response.data);
  },

  async getUnreadMessageCount(): Promise<MessageUnreadCountResponse> {
    const response = await apiClient.get('/messaging/unread-count');
    return normalizeUnreadCount(response.data);
  },

  async getConversationThread(
    context: MessageContextParams,
    params?: ConversationMessagesParams,
  ): Promise<ConversationThread> {
    const { path, fallbackThreadId } = resolveThreadPath(context);
    const response = await apiClient.get(path, {
      params: {
        cursorCreatedAt: params?.cursorCreatedAt ?? undefined,
        cursorId: params?.cursorId ?? undefined,
        limit: params?.limit ?? 50,
      },
    });

    return normalizeConversationThread(response.data, fallbackThreadId);
  },

  async listThreadOrders(
    threadId: string,
    filter?: 'all' | 'active' | 'closed' | 'cancelled' | 'disputed',
  ): Promise<{ items: ThreadOrderItem[] }> {
    const response = await apiClient.get(`/messaging/threads/${threadId}/orders`, {
      params: { filter },
    });
    const payload = asRecord(unwrapData<unknown>(response.data));
    const items = Array.isArray(payload.items)
      ? payload.items
          .map((entry) => normalizeThreadOrderItem(entry))
          .filter((entry): entry is ThreadOrderItem => Boolean(entry))
      : [];
    return { items };
  },

  async sendMessage(target: MessageSendTarget, payload: SendMessagePayload): Promise<MessageSendResponse> {
    const path = resolveMessagePath(target, 'messages');
    const response = await apiClient.post(path, payload, {
      headers: {
        'Idempotency-Key': payload.clientMessageId,
      },
    });

    return normalizeSendResponse(response.data, target.threadId ?? target.conversationId ?? null);
  },

  async startConversation(payload: StartConversationPayload): Promise<MessageSendResponse> {
    const hasOrderContext = Boolean(payload.orderId || payload.customOrderId);
    if (!hasOrderContext && !payload.brandId) {
      throw new Error('brandId, orderId, or customOrderId is required');
    }
    const endpoint = hasOrderContext
      ? '/messaging/conversations/start'
      : `/messaging/brands/${payload.brandId}/messages`;
    const body = hasOrderContext
      ? {
          brandId: payload.brandId ?? undefined,
          orderId: payload.orderId ?? undefined,
          customOrderId: payload.customOrderId ?? undefined,
          customerId: payload.customerId ?? undefined,
          designId: payload.designId ?? undefined,
          productId: payload.productId ?? undefined,
          bodyText: payload.bodyText,
          clientMessageId: payload.clientMessageId,
          attachmentFileIds: payload.attachmentFileIds,
        }
      : {
          bodyText: payload.bodyText,
          clientMessageId: payload.clientMessageId,
          attachmentFileIds: payload.attachmentFileIds,
        };

    const response = await apiClient.post(
      endpoint,
      body,
      {
        headers: {
          'Idempotency-Key': payload.clientMessageId,
        },
      },
    );

    return normalizeSendResponse(response.data);
  },

  async markConversationRead(
    target: MessageSendTarget,
    upToMessageId?: string | null,
  ): Promise<{ success: boolean; threadId: string | null }> {
    const path = resolveMessagePath(target, 'read');
    const response = await apiClient.post(path, {
      upToMessageId: upToMessageId ?? undefined,
    });
    const payload = asRecord(unwrapData<unknown>(response.data));

    return {
      success: asBoolean(payload.success),
      threadId: asString(payload.threadId) ?? target.threadId ?? target.conversationId ?? null,
    };
  },

  async uploadMessageAttachment(file: NativeMessageUpload): Promise<UploadedMessageAttachment> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const endpoint = file.type === 'application/pdf'
      ? '/uploads/message-document'
      : '/uploads/message-image';
    const response = await apiClient.post(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const attachment = normalizeUploadedMessageAttachment(response.data);
    if (!attachment) {
      throw new Error('Message attachment upload did not return a file id');
    }
    return attachment;
  },
};

export default MessagingApi;

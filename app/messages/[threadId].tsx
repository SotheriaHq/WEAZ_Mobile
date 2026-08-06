import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { backOrNavigate, drillDownPush } from '@/src/utils/mobileNavigation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { MessagingApi, createMessageClientId } from '@/src/api/MessagingApi';
import { compressPickedImage } from '@/src/utils/imageCompression';
import { getMobileUploadValidationMessage } from '@/src/utils/uploadValidation';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import {
  refreshUnreadMessageCount,
  setActiveMessageThreadId,
  useMessagingRealtimeChannel,
} from '@/src/realtime/messaging';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { navPerf } from '@/src/utils/navPerf';
import type {
  ConversationParticipant,
  ConversationThread,
  MessageAttachment,
  MessageContextParams,
  MessageReadRealtimeEvent,
  MessageItem,
  QuotedMessage,
  ResolvedConversationRoute,
  ThreadOrderItem,
} from '@/src/types/messaging';

type LoadPhase = 'loading' | 'resolving' | 'ready' | 'error' | 'invalid' | 'unsupported' | 'unauthenticated';
type LoadMode = 'reset' | 'refresh' | 'more' | 'realtime';

const PAGE_SIZE = 50;
const REALTIME_REFRESH_DEBOUNCE_MS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_PENDING_ATTACHMENTS = 4;
// Lightweight curated emoji set inserted into the composer — no extra dependency
// and no heavy picker. Opens an inline row the user can tap to append an emoji.
const COMPOSER_EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🔥', '🎉', '✨', '😎', '😅', '❤️', '👀', '🙌', '💯', '🥳', '😢'];

// A locally-picked attachment in the composer. `fileId` is set once the upload
// to the existing /uploads/message-image contract succeeds; only uploaded
// attachments (real ids) are ever sent — never fabricated.
type PendingAttachment = {
  localId: string;
  uri: string;
  name: string;
  mimeType: string;
  status: 'uploading' | 'ready' | 'error';
  fileId: string | null;
};

function firstParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function validId(value: string | null | undefined) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function normalizePathThreadId(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'resolve' || normalized === 'brand' || normalized === 'new') return null;
  return value ?? null;
}

function getErrorStatus(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

function hasResolverContext(context: MessageContextParams) {
  return Boolean(
    validId(context.messageId) ||
      validId(context.orderId) ||
      validId(context.customOrderId) ||
      validId(context.brandId) ||
      validId(context.customerId),
  );
}

function getErrorMessage(error: unknown) {
  const responseMessage =
    (error as { response?: { data?: { message?: string | string[]; error?: string } }; message?: string })?.response
      ?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.filter(Boolean).join(', ');
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
  const responseError =
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (typeof responseError === 'string' && responseError.trim()) return responseError;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unable to load this conversation right now.';
}

function classifyError(error: unknown, context: MessageContextParams) {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes('design/product')) {
    return {
      phase: 'unsupported' as const,
      title: 'Unsupported message context',
      body: 'Design and product-specific messaging is not enabled yet. Open an existing thread, order thread, custom-order thread, or brand conversation.',
    };
  }

  if (status === 403) {
    return {
      phase: 'error' as const,
      title: 'Conversation unavailable',
      body: 'You do not have access to this conversation.',
    };
  }

  if (status === 404) {
    const customerOnly = Boolean(validId(context.customerId)) &&
      !validId(context.threadId) &&
      !validId(context.conversationId) &&
      !validId(context.messageId) &&
      !validId(context.orderId) &&
      !validId(context.customOrderId) &&
      !validId(context.brandId);

    return customerOnly
      ? {
          phase: 'unsupported' as const,
          title: 'Customer direct start is not supported',
          body: 'Customer-specific direct starts need a supported brand/customer contract. Open an existing thread or start from a brand entry point.',
        }
      : {
          phase: 'error' as const,
          title: 'Conversation not found',
          body: message,
        };
  }

  if (status === 400) {
    return {
      phase: 'invalid' as const,
      title: 'Invalid conversation',
      body: message,
    };
  }

  return {
    phase: 'error' as const,
    title: 'Could not load conversation',
    body: message,
  };
}

function mergeMessages(current: MessageItem[], incoming: MessageItem[]) {
  const byId = new Map<string, MessageItem>();
  [...current, ...incoming].forEach((message) => {
    byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? '');
    const bTime = Date.parse(b.createdAt ?? '');
    if (aTime === bTime) return b.id.localeCompare(a.id);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function applyReadReceipt(
  current: MessageItem[],
  payload: MessageReadRealtimeEvent,
  currentUserId: string | null,
) {
  const readMessageId = validId(payload.lastReadMessageId);
  const readByUserId = validId(payload.readByUserId);
  if (!currentUserId || !readMessageId || readByUserId === currentUserId) return current;

  const readMessage = current.find((message) => message.id === readMessageId);
  const readTimestamp = Date.parse(readMessage?.createdAt ?? '');
  let changed = false;

  const nextMessages = current.map((message) => {
    if (message.senderUserId !== currentUserId || message.deliveryStatus === 'READ') {
      return message;
    }

    const messageTimestamp = Date.parse(message.createdAt ?? '');
    const isReadBoundary = message.id === readMessageId;
    const isAtOrBeforeReadBoundary =
      Number.isFinite(readTimestamp) &&
      Number.isFinite(messageTimestamp) &&
      messageTimestamp <= readTimestamp;

    if (!isReadBoundary && !isAtOrBeforeReadBoundary) {
      return message;
    }

    changed = true;
    return { ...message, deliveryStatus: 'READ' as const };
  });

  return changed ? nextMessages : current;
}

function formatMessageTime(value: string | null) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatOrderLabel(order: ThreadOrderItem | null, context: MessageContextParams) {
  if (order) {
    return `${order.type === 'CUSTOM_ORDER' ? 'Custom order' : 'Order'} · ${order.status}`;
  }
  if (context.customOrderId) {
    return `Custom #${context.customOrderId.slice(0, 8).toUpperCase()}`;
  }
  if (context.orderId) {
    return `Order #${context.orderId.slice(0, 8).toUpperCase()}`;
  }
  return null;
}

function getParticipantName(participant: ConversationParticipant | null) {
  return participant?.name ?? participant?.username ?? null;
}

function resolveParticipantFromMessages(messages: MessageItem[], currentUserId: string | null) {
  return messages.find((message) => message.senderUserId && message.senderUserId !== currentUserId)?.sender ?? null;
}

function AttachmentPreview({ attachment, mine }: { attachment: MessageAttachment; mine: boolean }) {
  const { theme } = useTheme();
  const resolvedUri = useResolvedImageUri({
    src: attachment.file.url,
    debugContext: { sourceField: 'messaging.attachment.file.url' },
  });

  if (attachment.kind === 'IMAGE' && resolvedUri) {
    return (
      <StableImage
        uri={resolvedUri}
        containerStyle={[styles.attachmentImage, { backgroundColor: theme.colors.surface }]}
        imageStyle={styles.attachmentImage}
        resizeMode="cover"
        fallback={<View style={[styles.attachmentImageFallback, { backgroundColor: theme.colors.surfaceAlt }]} />}
      />
    );
  }

  return (
    <View
      style={[
        styles.documentAttachment,
        { backgroundColor: mine ? theme.colors.primaryActive : theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <AppText variant="captionBold" tone={mine ? 'inverse' : 'secondary'} numberOfLines={1}>
        {attachment.file.originalName ?? 'Attachment'}
      </AppText>
      {attachment.file.mimeType ? (
        <AppText variant="captionRegular" tone={mine ? 'inverse' : 'muted'} numberOfLines={1}>
          {attachment.file.mimeType}
        </AppText>
      ) : null}
    </View>
  );
}

const SWIPE_REPLY_THRESHOLD = 56;

const MessageBubble = memo(function MessageBubble({
  item,
  currentUserId,
  onReply,
}: {
  item: MessageItem;
  currentUserId: string | null;
  onReply?: (msg: MessageItem) => void;
}) {
  const { theme } = useTheme();
  const mine = Boolean(item.senderUserId && item.senderUserId === currentUserId);
  const system = item.kind !== 'USER' || item.senderRole === 'SYSTEM';
  const timestamp = formatMessageTime(item.createdAt);
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const triggeredRef = useRef(false);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, gs) =>
      Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
    onPanResponderMove: (_e, gs) => {
      const dx = Math.max(0, Math.min(gs.dx, 80));
      swipeAnim.setValue(dx);
      if (dx >= SWIPE_REPLY_THRESHOLD && !triggeredRef.current) {
        triggeredRef.current = true;
        onReply?.(item);
      }
    },
    onPanResponderRelease: () => {
      triggeredRef.current = false;
      Animated.spring(swipeAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => {
      triggeredRef.current = false;
      Animated.spring(swipeAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    },
  }), [item, onReply, swipeAnim]);

  const designTitle = item.metadataJson?.contextDesignTitle;
  const designCoverUrl = item.metadataJson?.contextDesignCoverUrl as string | undefined;
  const hasDesignCard = Boolean(designTitle);
  const replyIconOpacity = swipeAnim.interpolate({ inputRange: [0, SWIPE_REPLY_THRESHOLD], outputRange: [0, 1] });

  if (system) {
    return (
      <View style={styles.systemRow}>
        <View style={[styles.systemBubble, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
            {item.bodyText ?? 'Thread update'}
          </AppText>
          {timestamp ? (
            <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
              {timestamp}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}>
      {/* Reply swipe indicator */}
      <Animated.View
        style={[
          styles.replyIndicator,
          mine ? styles.replyIndicatorMine : styles.replyIndicatorOther,
          { opacity: replyIconOpacity },
        ]}
        pointerEvents="none"
      >
        <AppText style={{ fontSize: 18 }}>↩️</AppText>
      </Animated.View>

      <Animated.View
        style={[styles.bubbleColumn, mine ? styles.bubbleColumnMine : styles.bubbleColumnOther, { transform: [{ translateX: swipeAnim }] }]}
        {...panResponder.panHandlers}
      >
        {/* Design context card — sits above the bubble, no fill */}
        {hasDesignCard && (
          <View style={[styles.designCard, { borderColor: theme.colors.border }]}>
            {designCoverUrl ? (
              <StableImage
                uri={designCoverUrl}
                containerStyle={styles.designCoverImage}
                imageStyle={styles.designCoverImage}
                resizeMode="cover"
                fallback={<View style={[styles.designCoverImage, { backgroundColor: theme.colors.surfaceAlt }]} />}
              />
            ) : null}
            <View style={[styles.designCardTitle, { backgroundColor: theme.colors.surface }]}>
              <AppText variant="captionBold" tone="default" numberOfLines={1}>
                🎨 {String(designTitle)}
              </AppText>
            </View>
          </View>
        )}

        {/* Quoted reply reference */}
        {item.quotedMessage ? (
          <View style={[
            styles.quotedMessage,
            mine
              ? { borderLeftColor: theme.colors.onPrimary, backgroundColor: theme.colors.primaryActive }
              : { borderLeftColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
          ]}>
            <AppText variant="captionBold" tone={mine ? 'inverse' : 'primary'} numberOfLines={1}>
              {item.quotedMessage.senderName || item.quotedMessage.senderRole}
            </AppText>
            <AppText variant="captionRegular" tone={mine ? 'inverse' : 'muted'} numberOfLines={2}>
              {item.quotedMessage.bodyText || '📎 Attachment'}
            </AppText>
          </View>
        ) : null}

        {/* Main message bubble */}
        <View
          style={[
            styles.messageBubble,
            mine
              ? { backgroundColor: theme.colors.primary }
              : { backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          {item.bodyText ? (
            <AppText variant="bodyRegular" tone={mine ? 'inverse' : 'default'}>
              {item.bodyText}
            </AppText>
          ) : null}
          {item.attachments.length > 0 ? (
            <View style={styles.attachmentsWrap}>
              {item.attachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} mine={mine} />
              ))}
            </View>
          ) : null}
          <View style={styles.messageMeta}>
            {timestamp ? (
              <AppText variant="captionRegular" tone={mine ? 'inverse' : 'muted'}>
                {timestamp}
              </AppText>
            ) : null}
            {mine && item.deliveryStatus ? (
              <AppText
                variant="captionRegular"
                style={item.deliveryStatus === 'READ'
                  ? { color: theme.colors.primarySoft, fontWeight: '700' }
                  : { color: theme.colors.onPrimary }}
              >
                {item.deliveryStatus === 'READ' ? '✓✓' : item.deliveryStatus === 'DELIVERED' ? '✓✓' : '✓'}
              </AppText>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </View>
  );
});

function ThreadAvatar({ participant }: { participant: ConversationParticipant | null }) {
  const { theme } = useTheme();
  const avatarUri = useResolvedImageUri({
    src: participant?.avatarUrl,
    debugContext: { sourceField: 'messaging.thread.participant.avatarUrl' },
  });

  const label = getParticipantName(participant);
  const initials = label
    ? label
        .replace(/^(conversation with|inquiry with)\s+/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || '💬'
    : '💬';

  const fallback = (
    <View style={[styles.headerAvatarFallback, { backgroundColor: theme.colors.primarySoft }]}>
      <AppText variant="captionBold" tone="primary">
        {initials}
      </AppText>
    </View>
  );

  if (!avatarUri) return fallback;

  return (
    <StableImage
      uri={avatarUri}
      containerStyle={styles.headerAvatar}
      imageStyle={styles.headerAvatar}
      fallback={fallback}
    />
  );
}

function ChatThreadSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 8 }).map((_, index) => {
        const mine = index % 3 === 0;
        return (
          <View key={index} style={[styles.skeletonLine, mine ? styles.skeletonMine : styles.skeletonOther]}>
            <Skeleton width={index % 2 === 0 ? '68%' : '48%'} height={44} borderRadius={16} />
            <Skeleton width={48} height={12} borderRadius={5} />
          </View>
        );
      })}
    </View>
  );
}

function StateBlock({
  title,
  body,
  actionTitle,
  onAction,
}: {
  title: string;
  body: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateWrap}>
      <AppText variant="subtitle" style={styles.centerText}>
        {title}
      </AppText>
      <AppText variant="body" tone="muted" style={styles.centerText}>
        {body}
      </AppText>
      {actionTitle && onAction ? (
        <Button title={actionTitle} size="sm" onPress={onAction} />
      ) : null}
    </View>
  );
}

export default function ChatThreadScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { status, token, user } = useAuth();
  const params = useLocalSearchParams();
  const paramThreadId = normalizePathThreadId(firstParam(params.threadId));
  const paramConversationId = firstParam(params.conversationId);
  const paramMessageId = firstParam(params.messageId);
  const paramOrderId = firstParam(params.orderId);
  const paramCustomOrderId = firstParam(params.customOrderId);
  const paramBrandId = firstParam(params.brandId);
  const paramCustomerId = firstParam(params.customerId);
  const paramDesignId = firstParam(params.designId);
  const paramProductId = firstParam(params.productId);
  const paramParticipantName = firstParam(params.participantName);
  const paramParticipantUsername = firstParam(params.participantUsername);
  const paramParticipantAvatarUrl = firstParam(params.participantAvatarUrl);
  const paramParticipantId = firstParam(params.participantId);

  // Participant identity handed down from the inbox row (when navigated from the
  // list). Used as an immediate, reliable header source so the chat never shows
  // "Conversation / Participant unavailable" when the identity is already known.
  const routeParticipant = useMemo<ConversationParticipant | null>(() => {
    if (!paramParticipantName && !paramParticipantUsername && !paramParticipantAvatarUrl) {
      return null;
    }
    return {
      id: paramParticipantId,
      username: paramParticipantUsername,
      firstName: null,
      lastName: null,
      name: paramParticipantName ?? paramParticipantUsername,
      avatarUrl: paramParticipantAvatarUrl,
    };
  }, [paramParticipantAvatarUrl, paramParticipantId, paramParticipantName, paramParticipantUsername]);

  const routeContext = useMemo<MessageContextParams>(() => ({
    threadId: paramThreadId,
    conversationId: paramConversationId,
    messageId: paramMessageId,
    orderId: paramOrderId,
    customOrderId: paramCustomOrderId,
    brandId: paramBrandId,
    customerId: paramCustomerId,
    designId: paramDesignId,
    productId: paramProductId,
  }), [
    paramBrandId,
    paramConversationId,
    paramCustomOrderId,
    paramCustomerId,
    paramDesignId,
    paramMessageId,
    paramOrderId,
    paramProductId,
    paramThreadId,
  ]);

  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [stateTitle, setStateTitle] = useState('Loading conversation');
  const [stateBody, setStateBody] = useState('Preparing the thread.');
  const [activeContext, setActiveContext] = useState<MessageContextParams | null>(null);
  const [resolvedRoute, setResolvedRoute] = useState<ResolvedConversationRoute | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [orders, setOrders] = useState<ThreadOrderItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [readWarning, setReadWarning] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<QuotedMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Dev-only nav timing for inbox→thread. Shell (header + skeleton) renders at
  // mount; primary data is ready when the load phase settles to 'ready'.
  useEffect(() => {
    navPerf.screenMounted('inbox→thread');
    navPerf.firstVisibleUi('inbox→thread');
  }, []);
  useEffect(() => {
    if (phase === 'ready') navPerf.dataReady('inbox→thread');
  }, [phase]);

  const cursorRef = useRef<ConversationThread['endCursor']>(null);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasNextPageRef = useRef(false);
  const markedReadRef = useRef<string | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealtimeThreadRefreshRef = useRef<() => void>(() => undefined);
  const skipInitialFocusRefreshRef = useRef(true);

  const directThreadId = validId(routeContext.threadId) ?? validId(routeContext.conversationId);
  const activeThreadId = validId(activeContext?.threadId) ?? validId(activeContext?.conversationId) ?? directThreadId;
  const messageParticipant = useMemo(
    () => resolveParticipantFromMessages(messages, user?.id ?? null),
    [messages, user?.id],
  );
  // Header identity priority: the actual message sender (most authoritative,
  // carries the real avatar) → the participant passed from the inbox row →
  // null. This keeps empty/own-only threads from falling back to "Conversation".
  const participant = messageParticipant ?? routeParticipant;
  const participantName = getParticipantName(participant);
  const firstOrder = orders[0] ?? null;
  const orderLabel = formatOrderLabel(firstOrder, {
    ...routeContext,
    ...resolvedRoute?.context,
    threadId: activeContext?.threadId ?? directThreadId,
  });
  const title = participantName ?? (validId(activeContext?.brandId) && !activeThreadId ? 'Message brand' : 'Conversation');
  const subtitle =
    orderLabel ??
    (participant ? undefined : validId(activeContext?.brandId) && !activeThreadId ? 'Start the conversation' : 'Participant unavailable');
  const canSend =
    phase === 'ready' &&
    !sending &&
    Boolean(activeThreadId || validId(activeContext?.brandId)) &&
    !['READ_ONLY', 'ARCHIVED', 'BLOCKED'].includes(thread?.status ?? '');
  const attachmentsUploading = pendingAttachments.some((entry) => entry.status === 'uploading');
  const readyAttachmentIds = pendingAttachments
    .filter((entry) => entry.status === 'ready' && entry.fileId)
    .map((entry) => entry.fileId as string);
  const sendDisabled =
    !canSend ||
    attachmentsUploading ||
    (composerText.trim().length === 0 && readyAttachmentIds.length === 0);

  const markRead = useCallback(async (target: MessageContextParams, latestMessageId?: string | null) => {
    const threadId = validId(target.threadId) ?? validId(target.conversationId);
    if (!threadId) return;
    const markKey = `${threadId}:${latestMessageId ?? 'empty'}`;
    if (markedReadRef.current === markKey) return;
    markedReadRef.current = markKey;

    try {
      await MessagingApi.markConversationRead({ threadId }, latestMessageId ?? null);
      setReadWarning(null);
      void refreshUnreadMessageCount({ authenticated: true });
    } catch (error) {
      markedReadRef.current = null;
      setReadWarning(getErrorMessage(error));
    }
  }, []);

  const loadThread = useCallback(async (context: MessageContextParams, mode: LoadMode) => {
    const threadId = validId(context.threadId) ?? validId(context.conversationId);
    if (!threadId) return;
    if (mode === 'more' && (loadingMoreRef.current || !hasNextPageRef.current)) return;

    const requestId = requestIdRef.current;
    const isReset = mode !== 'more';
    setActiveContext({ ...context, threadId, conversationId: threadId });
    if (mode === 'refresh') {
      setRefreshing(true);
    } else if (mode === 'more') {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (mode !== 'realtime') {
      setPhase('loading');
      setStateTitle('Loading conversation');
      setStateBody('Fetching real messages from WIEZ.');
    }

    try {
      const cursor = isReset ? null : cursorRef.current;
      const response = await MessagingApi.getConversationThread(
        { ...context, threadId },
        {
          limit: PAGE_SIZE,
          cursorCreatedAt: cursor?.createdAt,
          cursorId: cursor?.id,
        },
      );

      if (requestId !== requestIdRef.current) return;

      cursorRef.current = response.endCursor;
      hasNextPageRef.current = response.hasNextPage;
      setHasNextPage(response.hasNextPage);
      setThread(response);
      setMessages((current) => (isReset ? response.messages : mergeMessages(current, response.messages)));
      setPhase('ready');

      if (isReset) {
        const latestMessageId = response.messages[0]?.id ?? null;
        void markRead({ ...context, threadId }, latestMessageId);
        MessagingApi.listThreadOrders(threadId, 'all')
          .then((result) => {
            if (requestId === requestIdRef.current) {
              setOrders(result.items);
            }
          })
          .catch(() => {
            if (requestId === requestIdRef.current) {
              setOrders([]);
            }
          });
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const classified = classifyError(error, context);
      setPhase(classified.phase);
      setStateTitle(classified.title);
      setStateBody(classified.body);
    } finally {
      if (requestId === requestIdRef.current) {
        setRefreshing(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [markRead]);

  const scheduleRealtimeThreadRefresh = useCallback(() => {
    if (status !== 'authenticated' || !activeContext) return;

    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }

    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      cursorRef.current = null;
      hasNextPageRef.current = true;
      void loadThread(activeContext, 'realtime');
      void refreshUnreadMessageCount({ authenticated: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [activeContext, loadThread, status]);

  useEffect(() => {
    scheduleRealtimeThreadRefreshRef.current = scheduleRealtimeThreadRefresh;
  }, [scheduleRealtimeThreadRefresh]);

  useEffect(() => {
    if (status !== 'authenticated' || !activeThreadId) {
      setActiveMessageThreadId(null);
      return undefined;
    }

    setActiveMessageThreadId(activeThreadId);
    return () => setActiveMessageThreadId(null);
  }, [activeThreadId, status]);

  const isRealtimeEventForActiveThread = useCallback(
    (threadId: string | null | undefined) => {
      const eventThreadId = validId(threadId);
      return Boolean(eventThreadId && activeThreadId && eventThreadId === activeThreadId);
    },
    [activeThreadId],
  );

  const handleRealtimeMessageCreated = useCallback(
    (payload: { threadId?: string | null }) => {
      if (isRealtimeEventForActiveThread(payload.threadId)) {
        scheduleRealtimeThreadRefresh();
        return;
      }

      void refreshUnreadMessageCount({ authenticated: status === 'authenticated' });
    },
    [isRealtimeEventForActiveThread, scheduleRealtimeThreadRefresh, status],
  );

  const handleRealtimeThreadUpdated = useCallback(
    (payload: { threadId?: string | null }) => {
      if (isRealtimeEventForActiveThread(payload.threadId)) {
        scheduleRealtimeThreadRefresh();
        return;
      }

      void refreshUnreadMessageCount({ authenticated: status === 'authenticated' });
    },
    [isRealtimeEventForActiveThread, scheduleRealtimeThreadRefresh, status],
  );

  const handleRealtimeMessageRead = useCallback(
    (payload: MessageReadRealtimeEvent) => {
      if (isRealtimeEventForActiveThread(payload.threadId)) {
        setMessages((current) => applyReadReceipt(current, payload, user?.id ?? null));
      }

      void refreshUnreadMessageCount({ authenticated: status === 'authenticated' });
    },
    [isRealtimeEventForActiveThread, status, user?.id],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = null;
    }
    cursorRef.current = null;
    hasNextPageRef.current = false;
    loadingMoreRef.current = false;
    markedReadRef.current = null;
    setHasNextPage(false);
    setThread(null);
    setMessages([]);
    setOrders([]);
    setResolvedRoute(null);
    setActiveContext(null);
    setReadWarning(null);
    setSendError(null);
    setComposerText('');
    setReplyToMessage(null);
    setPendingAttachments([]);
    setEmojiOpen(false);

    if (status === 'loading') {
      setPhase('loading');
      return;
    }

    if (status !== 'authenticated') {
      setPhase('unauthenticated');
      setStateTitle('Sign in to view messages');
      setStateBody('This conversation can only be opened by an authenticated participant.');
      return;
    }

    const unsupportedContext = Boolean(!directThreadId && (routeContext.designId || routeContext.productId));
    if (unsupportedContext) {
      setPhase('unsupported');
      setStateTitle('Unsupported message context');
      setStateBody('Design and product-specific messaging is not supported yet. Use an existing thread, order thread, custom-order thread, or brand conversation.');
      return;
    }

    if (directThreadId) {
      void loadThread({ ...routeContext, threadId: directThreadId, conversationId: directThreadId }, 'reset');
      return;
    }

    if (!hasResolverContext(routeContext)) {
      setPhase('invalid');
      setStateTitle('Invalid conversation');
      setStateBody('No usable conversation, message, order, custom-order, brand, or customer parameter was provided.');
      return;
    }

    setPhase('resolving');
    setStateTitle('Resolving conversation');
    setStateBody('Finding the authorized message thread for this context.');

    MessagingApi.resolveConversationFromContext(routeContext)
      .then((resolved) => {
        if (requestId !== requestIdRef.current) return;
        if (!resolved?.threadId) {
          setPhase('error');
          setStateTitle('Conversation not found');
          setStateBody('The resolver did not return a usable thread.');
          return;
        }
        setResolvedRoute(resolved);
        void loadThread({ ...routeContext, ...resolved.context, threadId: resolved.threadId, conversationId: resolved.threadId }, 'reset');
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        if (
          getErrorStatus(error) === 404 &&
          validId(routeContext.brandId) &&
          !validId(routeContext.messageId) &&
          !validId(routeContext.orderId) &&
          !validId(routeContext.customOrderId) &&
          !validId(routeContext.customerId)
        ) {
          setResolvedRoute(null);
          setActiveContext({ brandId: routeContext.brandId });
          setThread(null);
          setMessages([]);
          setOrders([]);
          setHasNextPage(false);
          setPhase('ready');
          setStateTitle('New message');
          setStateBody('Send the first message to start this brand conversation.');
          return;
        }
        const classified = classifyError(error, routeContext);
        setPhase(classified.phase);
        setStateTitle(classified.title);
        setStateBody(classified.body);
      });
  }, [directThreadId, loadThread, routeContext, status]);

  useFocusEffect(
    useCallback(() => {
      if (skipInitialFocusRefreshRef.current) {
        skipInitialFocusRefreshRef.current = false;
        return undefined;
      }
      scheduleRealtimeThreadRefreshRef.current();
      return undefined;
    }, []),
  );

  useEffect(() => {
    if (status !== 'authenticated') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleRealtimeThreadRefresh();
      }
    });

    return () => subscription.remove();
  }, [scheduleRealtimeThreadRefresh, status]);

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, []);

  useMessagingRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(user?.id),
    token: token ?? null,
    userId: user?.id ?? null,
    onMessageCreated: handleRealtimeMessageCreated,
    onThreadUpdated: handleRealtimeThreadUpdated,
    onMessageRead: handleRealtimeMessageRead,
  });

  const handleRefresh = useCallback(() => {
    if (!activeContext) return;
    cursorRef.current = null;
    hasNextPageRef.current = true;
    void loadThread(activeContext, 'refresh');
    void refreshUnreadMessageCount({ authenticated: status === 'authenticated' });
  }, [activeContext, loadThread, status]);

  const handleEndReached = useCallback(() => {
    if (!activeContext || loadingMore || refreshing || !hasNextPage) return;
    void loadThread(activeContext, 'more');
  }, [activeContext, hasNextPage, loadThread, loadingMore, refreshing]);

  const handleReply = useCallback((msg: MessageItem) => {
    setReplyToMessage({
      id: msg.id,
      bodyText: msg.bodyText,
      senderRole: msg.senderRole,
      senderName: msg.sender?.name || msg.sender?.username || msg.senderRole,
    });
  }, []);

  const handleSend = useCallback(async () => {
    const targetThreadId = validId(activeContext?.threadId) ?? validId(activeContext?.conversationId);
    const targetBrandId = validId(activeContext?.brandId);
    const bodyText = composerText.trim();
    const attachmentFileIds = pendingAttachments
      .filter((entry) => entry.status === 'ready' && entry.fileId)
      .map((entry) => entry.fileId as string);
    // Block while any attachment is still uploading; require either text or at
    // least one successfully-uploaded attachment.
    if (
      (!targetThreadId && !targetBrandId) ||
      sending ||
      pendingAttachments.some((entry) => entry.status === 'uploading') ||
      (!bodyText && attachmentFileIds.length === 0)
    ) {
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const clientMessageId = createMessageClientId();
      const response = targetThreadId
        ? await MessagingApi.sendMessage(
            { threadId: targetThreadId },
            {
              ...(bodyText ? { bodyText } : {}),
              clientMessageId,
              ...(attachmentFileIds.length > 0 ? { attachmentFileIds } : {}),
              ...(replyToMessage ? { replyToMessageId: replyToMessage.id } : {}),
            },
          )
        : await MessagingApi.startConversation({
            brandId: targetBrandId,
            ...(bodyText ? { bodyText } : {}),
            clientMessageId,
            ...(attachmentFileIds.length > 0 ? { attachmentFileIds } : {}),
          });

      setComposerText('');
      setReplyToMessage(null);
      setPendingAttachments([]);
      setEmojiOpen(false);
      const nextThreadId = validId(response.threadId) ?? targetThreadId ?? null;
      if (response.message) {
        setMessages((current) => mergeMessages([response.message as MessageItem], current));
        if (nextThreadId) {
          setThread((current) => current ? { ...current, threadId: nextThreadId, conversationId: nextThreadId } : current);
        }
      }
      if (nextThreadId) {
        const nextContext = { ...activeContext, threadId: nextThreadId, conversationId: nextThreadId };
        setActiveContext(nextContext);
        await loadThread(nextContext, 'refresh');
      } else {
        await loadThread({ ...activeContext, threadId: targetThreadId }, 'refresh');
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setSendError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [activeContext, composerText, loadThread, pendingAttachments, replyToMessage, sending, toast]);

  const handleInsertEmoji = useCallback((emoji: string) => {
    setComposerText((current) => `${current}${emoji}`);
  }, []);

  const handleRemoveAttachment = useCallback((localId: string) => {
    setPendingAttachments((current) => current.filter((entry) => entry.localId !== localId));
  }, []);

  const handlePickAttachment = useCallback(async () => {
    if (pendingAttachments.length >= MAX_PENDING_ATTACHMENTS) {
      toast.info(`You can attach up to ${MAX_PENDING_ATTACHMENTS} images per message.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow photo access to attach an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
      base64: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const raw = result.assets[0];
    let asset = { uri: raw.uri, fileName: raw.fileName ?? `attachment-${Date.now()}.jpg`, mimeType: raw.mimeType ?? 'image/jpeg' };
    try {
      const compressed = await compressPickedImage(raw.uri, raw.width ?? 0, raw.height ?? 0, raw.fileName, 'messageImage');
      asset = { uri: compressed.uri, fileName: compressed.fileName, mimeType: compressed.mimeType };
    } catch {
      // Compression is best-effort; upload validation still guards the original.
    }

    const localId = createMessageClientId();
    setPendingAttachments((current) => [
      ...current,
      { localId, uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, status: 'uploading', fileId: null },
    ]);
    setEmojiOpen(false);

    try {
      const uploaded = await MessagingApi.uploadMessageAttachment({
        uri: asset.uri,
        name: asset.fileName,
        type: asset.mimeType,
      });
      setPendingAttachments((current) =>
        current.map((entry) =>
          entry.localId === localId ? { ...entry, status: 'ready', fileId: uploaded.id } : entry,
        ),
      );
    } catch (error) {
      setPendingAttachments((current) => current.map((entry) =>
        entry.localId === localId ? { ...entry, status: 'error' } : entry,
      ));
      toast.error(getMobileUploadValidationMessage(error));
    }
  }, [pendingAttachments.length, toast]);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<MessageItem>) => (
      <MessageBubble item={item} currentUserId={user?.id ?? null} onReply={handleReply} />
    ),
    [handleReply, user?.id],
  );

  const keyExtractor = useCallback((item: MessageItem) => item.id, []);

  const listFooter = useMemo(
    () => loadingMore ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    ) : null,
    [loadingMore, theme.colors.primary],
  );

  const composerHelper = thread?.status === 'READ_ONLY'
    ? 'This thread is read-only.'
    : thread?.status === 'ARCHIVED'
      ? 'This thread is archived.'
      : thread?.status === 'BLOCKED'
        ? 'This thread is blocked.'
        : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <Header
          title={title}
          subtitle={subtitle}
          left={<AppBackButton fallbackHref="/(tabs)/inbox" />}
          right={<ThreadAvatar participant={participant} />}
        />

        {phase === 'loading' || phase === 'resolving' ? (
          <View style={styles.loadingWrap}>
            {phase === 'resolving' ? (
              <View style={[styles.resolvingBanner, { backgroundColor: theme.colors.surfaceAlt }]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <AppText variant="captionRegular" tone="muted">
                  Resolving conversation context
                </AppText>
              </View>
            ) : null}
            <ChatThreadSkeleton />
          </View>
        ) : phase === 'unauthenticated' ? (
          <StateBlock
            title={stateTitle}
            body={stateBody}
            actionTitle="Sign in"
            onAction={() => drillDownPush({ pathname: '/(auth)/login', params: { next: '/(tabs)/inbox' } } as any)}
          />
        ) : phase === 'invalid' || phase === 'unsupported' || phase === 'error' ? (
          <StateBlock
            title={stateTitle}
            body={stateBody}
            actionTitle={phase === 'error' && activeContext ? 'Retry' : 'Back to Messages'}
            onAction={phase === 'error' && activeContext
              ? () => void loadThread(activeContext, 'reset')
              : () => backOrNavigate('/(tabs)/inbox' as any)}
          />
        ) : (
          <>
            {readWarning ? (
              <View style={[styles.inlineWarning, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText variant="captionRegular" tone="warning" numberOfLines={2}>
                  Read status could not be updated: {readWarning}
                </AppText>
              </View>
            ) : null}

            <FlatList
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={[
                styles.listContent,
                messages.length === 0 ? styles.emptyListContent : null,
              ]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
              }
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.35}
              ListFooterComponent={listFooter}
              ListEmptyComponent={
                <View style={styles.emptyThread}>
                  <AppText variant="subtitle" style={styles.centerText}>
                    No messages yet
                  </AppText>
                  <AppText variant="body" tone="muted" style={styles.centerText}>
                    {thread
                      ? 'This thread is real, but it has no visible messages yet.'
                      : 'Send the first message to start this brand conversation.'}
                  </AppText>
                </View>
              }
              keyboardShouldPersistTaps="handled"
            />

            <View
              style={[
                styles.composerShell,
                {
                  backgroundColor: theme.colors.surface,
                  borderTopColor: theme.colors.border,
                  paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
                },
              ]}
            >
              {composerHelper ? (
                <AppText variant="captionRegular" tone="muted">
                  {composerHelper}
                </AppText>
              ) : null}
              {sendError ? (
                <AppText variant="captionRegular" tone="danger" numberOfLines={2}>
                  {sendError}
                </AppText>
              ) : null}
              {/* Reply preview */}
              {replyToMessage ? (
                <View style={[styles.replyPreview, { borderLeftColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}>
                  <View style={styles.replyPreviewContent}>
                    <AppText variant="captionBold" tone="primary" numberOfLines={1}>
                      ↩️ {replyToMessage.senderName || replyToMessage.senderRole}
                    </AppText>
                    <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
                      {replyToMessage.bodyText || '📎 Attachment'}
                    </AppText>
                  </View>
                  <TouchableOpacity onPress={() => setReplyToMessage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <AppText style={{ fontSize: 16, color: theme.colors.textMuted }}>✕</AppText>
                  </TouchableOpacity>
                </View>
              ) : null}
              {/* Pending attachment previews — only uploaded ids are ever sent */}
              {pendingAttachments.length > 0 ? (
                <View style={styles.attachmentPreviewRow}>
                  {pendingAttachments.map((attachment) => (
                    <View key={attachment.localId} style={[styles.attachmentPreview, { borderColor: theme.colors.border }]}>
                      <StableImage
                        uri={attachment.uri}
                        containerStyle={styles.attachmentPreviewImage}
                        imageStyle={styles.attachmentPreviewImage}
                        resizeMode="cover"
                        fallback={<View style={[styles.attachmentPreviewImage, { backgroundColor: theme.colors.surfaceAlt }]} />}
                      />
                      {attachment.status !== 'ready' ? (
                        <View style={[styles.attachmentPreviewOverlay, { backgroundColor: theme.colors.overlay }]} pointerEvents="none">
                          {attachment.status === 'uploading' ? (
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                          ) : (
                            <AppText variant="captionBold" tone="danger">!</AppText>
                          )}
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => handleRemoveAttachment(attachment.localId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[styles.attachmentRemoveButton, { backgroundColor: theme.colors.backdropStrong }]}
                        accessibilityRole="button"
                        accessibilityLabel="Remove attachment"
                      >
                        <AppText variant="captionBold" style={{ color: theme.colors.textInverse }}>✕</AppText>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Lightweight emoji row (no extra dependency) */}
              {emojiOpen ? (
                <View style={[styles.emojiRow, { borderColor: theme.colors.border }]}>
                  {COMPOSER_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => handleInsertEmoji(emoji)}
                      style={styles.emojiButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Insert ${emoji}`}
                    >
                      <AppText style={styles.emojiGlyph}>{emoji}</AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.composerRow}>
                <TouchableOpacity
                  onPress={handlePickAttachment}
                  disabled={!canSend}
                  style={[styles.composerIconButton, !canSend ? styles.composerIconButtonDisabled : null]}
                  accessibilityRole="button"
                  accessibilityLabel="Add image attachment"
                >
                  <AppText variant="subtitle">📎</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEmojiOpen((current) => !current)}
                  disabled={!canSend}
                  style={[
                    styles.composerIconButton,
                    emojiOpen ? { backgroundColor: theme.colors.primarySoft } : null,
                    !canSend ? styles.composerIconButtonDisabled : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: emojiOpen }}
                  accessibilityLabel="Insert emoji"
                >
                  <AppText variant="subtitle">😊</AppText>
                </TouchableOpacity>
                <Input
                  label="Message"
                  hideLabel
                  value={composerText}
                  onChangeText={setComposerText}
                  placeholder="Write a message"
                  autoCorrect
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (!sendDisabled) {
                      void handleSend();
                    }
                  }}
                  editable={canSend}
                  containerStyle={styles.composerInput}
                />
                <Button
                  title="Send"
                  size="md"
                  onPress={() => void handleSend()}
                  disabled={sendDisabled}
                  loading={sending}
                  style={styles.sendButton}
                />
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardRoot: {
    flex: 1,
  },
  centerText: {
    textAlign: 'center',
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
  },
  headerAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  loadingWrap: {
    flex: 1,
  },
  resolvingBanner: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  skeletonWrap: {
    flex: 1,
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xl,
  },
  skeletonLine: {
    gap: tokens.spacing.xs,
  },
  skeletonMine: {
    alignItems: 'flex-end',
  },
  skeletonOther: {
    alignItems: 'flex-start',
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
  },
  inlineWarning: {
    marginHorizontal: tokens.spacing.lg,
    marginTop: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
  },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyThread: {
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
  },
  messageRow: {
    flexDirection: 'row',
    position: 'relative',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '78%',
    flexDirection: 'column',
  },
  bubbleColumnMine: {
    alignItems: 'flex-end',
  },
  bubbleColumnOther: {
    alignItems: 'flex-start',
  },
  replyIndicator: {
    position: 'absolute',
    top: '50%',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  replyIndicatorMine: {
    left: 0,
  },
  replyIndicatorOther: {
    right: 0,
  },
  designCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.spacing.xs,
    maxWidth: 240,
  },
  designCoverImage: {
    width: '100%',
    height: 120,
  },
  designCardTitle: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  quotedMessage: {
    borderLeftWidth: 3,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
    gap: tokens.spacing.xs,
    maxWidth: '100%',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  replyPreviewContent: {
    flex: 1,
    gap: 2,
  },
  messageBubble: {
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: tokens.spacing.sm,
  },
  systemRow: {
    alignItems: 'center',
  },
  systemBubble: {
    maxWidth: '88%',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  attachmentsWrap: {
    gap: tokens.spacing.sm,
  },
  attachmentImage: {
    width: 220,
    height: 150,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  attachmentImageFallback: {
    flex: 1,
  },
  documentAttachment: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  footerLoader: {
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  composerShell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  composerInput: {
    flex: 1,
  },
  composerIconButton: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerIconButtonDisabled: {
    opacity: 0.4,
  },
  sendButton: {
    minWidth: 76,
  },
  attachmentPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  attachmentPreview: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  attachmentPreviewImage: {
    width: '100%',
    height: '100%',
  },
  attachmentPreviewOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRemoveButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xs,
  },
  emojiButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 22,
  },
});

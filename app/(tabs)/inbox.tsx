import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/ui/BrandHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { Tabs } from '@/components/catalog/Tabs';
import { MessagingApi } from '@/src/api/MessagingApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { ConversationListResponse, ConversationSummary } from '@/src/types/messaging';
import { useScreenChrome } from '@/src/system/ScreenChrome';

type FilterKey = 'all' | 'unread' | 'orders';
type InboxCursor = ConversationListResponse['endCursor'];
type LoadMode = 'reset' | 'refresh' | 'more';

const PAGE_SIZE = 50;
const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'orders', label: 'Orders' },
];

function getErrorMessage(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } }; message?: string })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(Boolean).join(', ');
  if (typeof message === 'string' && message.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unable to load messages right now.';
}

function mergeConversationPages(current: ConversationSummary[], incoming: ConversationSummary[]) {
  const byId = new Map<string, ConversationSummary>();
  [...current, ...incoming].forEach((item) => {
    byId.set(item.threadId, item);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = Date.parse(a.lastMessageAt ?? a.createdAt ?? '');
    const bTime = Date.parse(b.lastMessageAt ?? b.createdAt ?? '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function formatConversationTime(value: string | null) {
  if (!value) return 'No date';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'No date';

  const delta = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return 'now';
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function getConversationName(item: ConversationSummary) {
  return item.participant?.name ?? item.participant?.username ?? item.title ?? 'Conversation';
}

function getConversationPreview(item: ConversationSummary) {
  return item.subtitle ?? 'No messages yet';
}

function getContextLabel(item: ConversationSummary) {
  if (item.customOrderId) {
    return `Custom #${item.customOrderId.slice(0, 8).toUpperCase()}`;
  }
  if (item.orderId) {
    return `Order #${item.orderId.slice(0, 8).toUpperCase()}`;
  }
  if (item.contextType === 'INQUIRY') {
    return 'Inquiry';
  }
  return null;
}

function isMuted(item: ConversationSummary) {
  if (!item.mutedUntil) return false;
  const timestamp = Date.parse(item.mutedUntil);
  return Number.isFinite(timestamp) ? timestamp > Date.now() : true;
}

function matchesFilter(item: ConversationSummary, filter: FilterKey) {
  if (filter === 'unread') {
    return item.hasUnread || item.unreadCount > 0;
  }
  if (filter === 'orders') {
    return Boolean(item.orderId || item.customOrderId || item.contextType === 'STANDARD_ORDER' || item.contextType === 'CUSTOM_ORDER');
  }
  return true;
}

function matchesSearch(item: ConversationSummary, query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const participant = item.participant;
  const values = [
    item.title,
    item.subtitle,
    participant?.name,
    participant?.username,
    participant?.firstName,
    participant?.lastName,
    item.orderId,
    item.customOrderId,
    item.inquiryId,
  ];

  return values.some((value) => typeof value === 'string' && value.toLowerCase().includes(trimmed));
}

function buildThreadParams(item: ConversationSummary) {
  return {
    threadId: item.threadId,
    conversationId: item.conversationId,
    ...(item.orderId ? { orderId: item.orderId } : null),
    ...(item.customOrderId ? { customOrderId: item.customOrderId } : null),
    ...(item.context.messageId ? { messageId: item.context.messageId } : null),
  };
}

function ConversationAvatar({ item }: { item: ConversationSummary }) {
  const { theme } = useTheme();
  const avatarUri = useResolvedImageUri({
    src: item.participant?.avatarUrl,
    debugContext: { sourceField: 'messaging.participant.avatarUrl' },
  });

  const fallback = (
    <View style={[styles.avatarFallback, { backgroundColor: theme.colors.primarySoft }]}>
      <AppText variant="captionBold" tone="primary">DM</AppText>
    </View>
  );

  if (!avatarUri) {
    return fallback;
  }

  return (
    <StableImage
      uri={avatarUri}
      containerStyle={styles.avatar}
      imageStyle={styles.avatar}
      fallback={fallback}
    />
  );
}

const ConversationRow = memo(function ConversationRow({
  item,
  onPress,
}: {
  item: ConversationSummary;
  onPress: (item: ConversationSummary) => void;
}) {
  const { theme } = useTheme();
  const name = getConversationName(item);
  const contextLabel = getContextLabel(item);
  const muted = isMuted(item);
  const unread = item.unreadCount > 0 || item.hasUnread;

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.rowPressable,
        pressed ? { backgroundColor: theme.colors.surfaceAlt } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${name}`}
    >
      <View style={styles.row}>
        <ConversationAvatar item={item} />
        <View style={[styles.rowBody, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.rowTop}>
            <View style={styles.nameWrap}>
              <AppText variant="bodyBold" numberOfLines={1} style={styles.flexText}>
                {name}
              </AppText>
              {muted ? (
                <View style={[styles.metaPill, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <AppText variant="captionRegular" tone="muted">Muted</AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="captionRegular" tone={unread ? 'primary' : 'muted'} numberOfLines={1}>
              {formatConversationTime(item.lastMessageAt ?? item.createdAt)}
            </AppText>
          </View>

          <View style={styles.rowBottom}>
            <View style={styles.previewWrap}>
              <AppText variant="small" tone={unread ? 'secondary' : 'muted'} numberOfLines={1}>
                {getConversationPreview(item)}
              </AppText>
              {contextLabel ? (
                <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                  {contextLabel}
                </AppText>
              ) : null}
            </View>

            {item.unreadCount > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <AppText variant="captionBold" tone="inverse" numberOfLines={1}>
                  {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
});

function MessagesSkeleton({ bottomPadding }: { bottomPadding: number }) {
  return (
    <View style={[styles.skeletonWrap, { paddingBottom: bottomPadding }]}>
      {Array.from({ length: 8 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={52} height={52} borderRadius={16} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTopLine}>
              <Skeleton width="55%" height={16} borderRadius={6} />
              <Skeleton width={36} height={12} borderRadius={5} />
            </View>
            <Skeleton width="78%" height={14} borderRadius={5} />
            <Skeleton width="32%" height={12} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function InboxScreen() {
  const { theme } = useTheme();
  const { standardScreenBottomPadding } = useScreenChrome();
  const { status, user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    params: {
      threadId?: string;
      conversationId?: string;
      messageId?: string;
      orderId?: string;
      customOrderId?: string;
    } | null;
  } | null>(null);

  const cursorRef = useRef<InboxCursor>(null);
  const hasNextPageRef = useRef(true);
  const fetchInFlightRef = useRef(false);

  const filteredConversations = useMemo(
    () => conversations.filter((item) => matchesFilter(item, activeFilter) && matchesSearch(item, searchQuery)),
    [activeFilter, conversations, searchQuery],
  );

  const loadConversations = useCallback(
    async (mode: LoadMode) => {
      if (status !== 'authenticated') {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      const isReset = mode !== 'more';
      if (fetchInFlightRef.current) return;
      if (!isReset && !hasNextPageRef.current) return;

      fetchInFlightRef.current = true;
      if (mode === 'reset') {
        setLoading(true);
        setError(null);
      } else if (mode === 'refresh') {
        setRefreshing(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const cursor = isReset ? null : cursorRef.current;
        const response = await MessagingApi.listConversations({
          limit: PAGE_SIZE,
          contextType: 'all',
          filter: 'all',
          cursorLastMessageAt: cursor?.cursorLastMessageAt,
          cursorThreadId: cursor?.cursorThreadId,
        });

        cursorRef.current = response.endCursor;
        hasNextPageRef.current = response.hasNextPage;
        setHasNextPage(response.hasNextPage);
        setConversations((current) => (isReset ? response.items : mergeConversationPages(current, response.items)));
      } catch (nextError) {
        setError(getErrorMessage(nextError));
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [status],
  );

  useEffect(() => {
    cursorRef.current = null;
    hasNextPageRef.current = true;
    setHasNextPage(false);
    setConversations([]);
    setError(null);
    setSearchQuery('');
    setActiveFilter('all');

    if (status === 'authenticated') {
      setLoading(true);
      void loadConversations('reset');
      return;
    }

    setLoading(false);
  }, [loadConversations, status, user?.id]);

  // Handle pending navigation after authentication
  useEffect(() => {
    if (status === 'authenticated' && pendingNavigation) {
      const { params } = pendingNavigation;
      // Small delay to ensure conversations are loaded
      setTimeout(() => {
        if (params?.threadId || params?.conversationId) {
          router.push({
            pathname: '/messages/[threadId]',
            params: {
              threadId: params.threadId || params.conversationId,
              conversationId: params.conversationId || params.threadId,
              ...(params.messageId ? { messageId: params.messageId } : {}),
              ...(params.orderId ? { orderId: params.orderId } : {}),
              ...(params.customOrderId ? { customOrderId: params.customOrderId } : {}),
            },
          } as any);
        }
        setPendingNavigation(null);
      }, 500);
    }
  }, [status, pendingNavigation]);

  const handleRefresh = useCallback(() => {
    cursorRef.current = null;
    hasNextPageRef.current = true;
    void loadConversations('refresh');
  }, [loadConversations]);

  const handleEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasNextPage) return;
    void loadConversations('more');
  }, [hasNextPage, loadConversations, loading, loadingMore, refreshing]);

  const handlePressConversation = useCallback((item: ConversationSummary) => {
    router.push({
      pathname: '/messages/[threadId]',
      params: buildThreadParams(item),
    } as any);
  }, []);

  const handleFilterChange = useCallback((key: string) => {
    if (key === 'all' || key === 'unread' || key === 'orders') {
      setActiveFilter(key);
    }
  }, []);

  const renderConversation = useCallback(
    ({ item }: ListRenderItemInfo<ConversationSummary>) => (
      <ConversationRow item={item} onPress={handlePressConversation} />
    ),
    [handlePressConversation],
  );

  const keyExtractor = useCallback((item: ConversationSummary) => item.threadId, []);

  const listFooter = useMemo(
    () => (
      loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      ) : null
    ),
    [loadingMore, theme.colors.primary],
  );

  const isSearching = searchQuery.trim().length > 0;
  const hasLoadedConversations = conversations.length > 0;
  const bottomPadding = standardScreenBottomPadding;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <BrandHeader />

      <View style={styles.headerBlock}>
        <AppText variant="title">Messages</AppText>
        <Input
          label="Search messages"
          hideLabel
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search names, messages, or order refs"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          containerStyle={styles.searchInput}
        />
        <Tabs tabs={FILTER_TABS} activeTab={activeFilter} onTabChange={handleFilterChange} scrollable />
      </View>

      {status !== 'authenticated' ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">Messages</AppText>
          <AppText variant="body" tone="muted" style={styles.stateText}>
            Sign in to see real conversations from brands, customers, and orders.
          </AppText>
          <Button
            title="Sign in"
            onPress={() => router.push({ pathname: '/(auth)/login', params: { next: '/(tabs)/inbox' } } as any)}
          />
        </View>
      ) : loading ? (
        <MessagesSkeleton bottomPadding={bottomPadding} />
      ) : error && !hasLoadedConversations ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">Could not load messages</AppText>
          <AppText variant="body" tone="muted" style={styles.stateText}>{error}</AppText>
          <Button title="Retry" size="sm" onPress={() => void loadConversations('reset')} />
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">
            {isSearching ? 'No matching messages' : activeFilter === 'unread' ? 'No unread messages' : activeFilter === 'orders' ? 'No order messages' : 'No messages yet'}
          </AppText>
          <AppText variant="body" tone="muted" style={styles.stateText}>
            {isSearching
              ? 'Try another real name, message preview, or order reference.'
              : activeFilter === 'all'
                ? 'Conversations will appear here after a real message is started.'
                : 'This filter only uses real conversation data already returned by messaging.'}
          </AppText>
          {error ? (
            <Button title="Retry" size="sm" onPress={() => void loadConversations('reset')} />
          ) : null}
        </View>
      ) : (
        <>
          {error ? (
            <View style={[styles.inlineError, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="captionRegular" tone="warning" numberOfLines={2}>
                {error}
              </AppText>
              <Button title="Retry" size="xs" variant="ghost" onPress={() => void loadConversations('reset')} />
            </View>
          ) : null}
          <FlatList
            data={filteredConversations}
            keyExtractor={keyExtractor}
            renderItem={renderConversation}
            contentInset={{ bottom: bottomPadding }}
            scrollIndicatorInsets={{ bottom: bottomPadding }}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.45}
            ListFooterComponent={listFooter}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerBlock: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.sm,
  },
  searchInput: {
    marginTop: tokens.spacing.xs,
  },
  listContent: {
    paddingTop: tokens.spacing.sm,
  },
  rowPressable: {
    minHeight: 76,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingLeft: tokens.spacing.lg,
    paddingRight: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  flexText: {
    flexShrink: 1,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  previewWrap: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  metaPill: {
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonWrap: {
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  skeletonCopy: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  skeletonTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xl,
  },
  stateText: {
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: tokens.spacing.lg,
    alignItems: 'center',
  },
  inlineError: {
    marginHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
});

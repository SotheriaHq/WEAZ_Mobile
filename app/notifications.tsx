import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';

import { drillDownPush } from '@/src/utils/mobileNavigation';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import {
  describeNotificationCategory,
  describeNotificationSegments,
  describeNotificationText,
  type NotificationCopySource,
} from '@/src/features/notifications/notificationCopy';
import { Button } from '@/components/ui/Button';
import { StableImage } from '@/components/ui/StableImage';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useCachedQuery } from '@/src/cache/cachedQuery';
import { cachePolicies } from '@/src/cache/policies';
import { queryKeys } from '@/src/query/queryKeys';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { groupNotifications } from '@/src/utils/notificationGrouping';
import {
  decrementUnreadNotificationCount,
  incrementUnreadNotificationCount,
  replaceUnreadNotificationCount,
  useNotificationRealtimeChannel,
} from '@/src/realtime/notifications';
import { LAYOUT, tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { routeForNotification } from '@/src/utils/mobileRouting';
import { navPerf } from '@/src/utils/navPerf';
import { MuseLoader } from '@/components/ui/MuseLoader';

type NotificationGroup = {
  title: string;
  items: MobileNotification[];
};

function getErrorMessage(error: unknown) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } }; message?: string })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(Boolean).join(', ');
  if (typeof message === 'string' && message.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unable to load notifications right now.';
}

function actorName(item: MobileNotification) {
  const fullName = [item.actor?.firstName, item.actor?.lastName].filter(Boolean).join(' ').trim();
  return item.actor?.username || fullName || (item.type.toUpperCase().includes('SYSTEM') ? 'WIEZ' : 'Someone');
}

function compactTime(value: string) {
  const timestamp = new Date(value).getTime();
  const delta = Math.max(0, Date.now() - (Number.isNaN(timestamp) ? Date.now() : timestamp));
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'now';
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  return `${Math.floor(delta / day)}d`;
}

function notificationCopySource(item: MobileNotification): NotificationCopySource {
  const payload = item.payload as Record<string, unknown> | undefined;
  const readString = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  return {
    type: item.type,
    message: item.message ?? null,
    actorName: actorName(item),
    // The title arrives under whichever name the emitting service used; a
    // notification is not worth failing over because one of them is missing.
    contentTitle:
      readString(payload?.contentTitle) ??
      readString(payload?.title) ??
      readString(payload?.designTitle) ??
      readString(payload?.collectionTitle) ??
      null,
    excerpt: readString(payload?.excerpt),
  };
}

/**
 * One notification sentence, with the actor and the content set apart.
 *
 * Nested `AppText` inherits the parent's typography and overrides only what the
 * child sets, which is what lets a single wrapped paragraph carry mixed
 * emphasis without the segments becoming separate blocks that wrap
 * independently. The whole sentence is still one accessible string on the
 * wrapper, so a screen reader hears a sentence rather than four fragments.
 */
function NotificationCopy({ item }: { item: MobileNotification }) {
  const source = notificationCopySource(item);
  const segments = describeNotificationSegments(source);

  return (
    <AppText variant="body" numberOfLines={3} accessibilityLabel={describeNotificationText(source)}>
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;
        if (segment.kind === 'actor') {
          // Bold and in the app's own ink: the actor is the primary scan target
          // and must win against everything else in the row.
          return (
            <AppText key={key} variant="bodyBold">
              {segment.text}
            </AppText>
          );
        }
        if (segment.kind === 'content') {
          // Brand-toned, because the content title is the part that is also a
          // destination — pressing the row opens it.
          return (
            <AppText key={key} variant="bodyBold" tone="primary">
              {segment.text}
            </AppText>
          );
        }
        if (segment.kind === 'quote') {
          return (
            <AppText key={key} variant="body" tone="secondary">
              {segment.text}
            </AppText>
          );
        }
        return (
          <AppText key={key} variant="body" tone="secondary">
            {segment.text}
          </AppText>
        );
      })}
    </AppText>
  );
}

function NotificationAvatar({ item }: { item: MobileNotification }) {
  const { theme } = useTheme();
  const avatarUri = useResolvedImageUri({ src: item.actor?.profileImage ?? undefined });
  const system = !item.actor?.id || item.type.toUpperCase().includes('SYSTEM');

  if (system) {
    return (
      <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}>
        <AppText variant="captionBold" tone="primary">🔔</AppText>
      </View>
    );
  }

  if (avatarUri) {
    return <StableImage uri={avatarUri} containerStyle={styles.avatar} imageStyle={styles.avatar} />;
  }

  return (
    <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}>
      <AppText variant="captionBold" tone="primary">
        {actorName(item).slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
}

/**
 * The nouns in a bag notification that are destinations in their own right.
 *
 * Pressing the ROW opens the bag, because that is what the notification is
 * about. These open the item that was bagged and the brand that made it. They
 * are built from the payload rather than matched out of the rendered sentence —
 * that sentence is server-authored copy, and substring matching would break the
 * moment a brand is named something that also appears in it.
 */
function bagEntityLinks(item: MobileNotification): {
  content: { label: string; href: Href } | null;
  brand: { label: string; href: Href } | null;
} {
  if (!item.type.toUpperCase().startsWith('BAG_')) {
    return { content: null, brand: null };
  }

  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const readString = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  const firstOf = (value: unknown) => (Array.isArray(value) ? readString(value[0]) : null);

  const sourceType = readString(payload.sourceType)?.toUpperCase() ?? null;
  const productId =
    readString(payload.productId) ??
    firstOf(payload.productIds) ??
    (sourceType === 'PRODUCT' ? readString(payload.sourceId) : null);
  const title =
    readString(payload.productName) ??
    readString(payload.collectionName) ??
    firstOf(payload.productNames) ??
    readString(payload.topItemTitle);
  const brandId = readString(payload.brandId);
  const brandName = readString(payload.brandName);

  return {
    content:
      productId && title
        ? {
            label: title,
            href: { pathname: '/products/[productId]', params: { productId } } as Href,
          }
        : null,
    brand:
      brandId && brandName
        ? {
            label: brandName,
            href: { pathname: '/catalog/[brandId]', params: { brandId } } as Href,
          }
        : null,
  };
}

function NotificationRow({
  item,
  onPress,
}: {
  item: MobileNotification;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const unread = !item.isRead;
  const entityLinks = bagEntityLinks(item);
  const rawPreview = item.target?.preview ?? (typeof item.payload?.preview === 'string' ? item.payload.preview : null);
  // `target.preview` is a thumbnail URL for content notifications, but system
  // notifications reuse it to carry a route path (e.g. "/custom-orders/:id").
  // Only feed real image sources to StableImage — never an app path.
  const previewUri =
    rawPreview && !rawPreview.startsWith('/') ? rawPreview : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowTop}>
        <NotificationAvatar item={item} />
        <View style={styles.copyWrap}>
          <View style={styles.rowMeta}>
            <AppText variant="captionBold" tone={unread ? 'primary' : 'muted'}>
              {describeNotificationCategory(item.type)}
            </AppText>
            <AppText variant="captionRegular" tone="muted">
              {compactTime(item.createdAt)}
            </AppText>
          </View>
          <NotificationCopy item={item} />
          {entityLinks.content || entityLinks.brand ? (
            <View style={styles.entityRow}>
              {entityLinks.content ? (
                <Pressable
                  onPress={() => drillDownPush(entityLinks.content!.href)}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${entityLinks.content.label}`}
                >
                  <AppText variant="smallBold" tone="primary">
                    {entityLinks.content.label}
                  </AppText>
                </Pressable>
              ) : null}
              {entityLinks.content && entityLinks.brand ? (
                <AppText variant="small" tone="muted">
                  ·
                </AppText>
              ) : null}
              {entityLinks.brand ? (
                <Pressable
                  onPress={() => drillDownPush(entityLinks.brand!.href)}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${entityLinks.brand.label}'s catalogue`}
                >
                  <AppText variant="smallBold" tone="primary">
                    {entityLinks.brand.label}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        {previewUri ? (
          <StableImage uri={previewUri} containerStyle={styles.previewThumb} imageStyle={styles.previewThumb} />
        ) : null}
        {unread ? <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, token, user } = useAuth();
  const hasAuthenticatedSession = status === 'authenticated' && Boolean(token) && Boolean(user?.id);
  const [markingAll, setMarkingAll] = useState(false);

  // Cache-first: a revisit within the TTL paints from cache with no request.
  // Realtime events and read-marking below write through `mutate`, so the
  // cached list stays truthful between revalidations.
  const notificationsQuery = useCachedQuery<MobileNotification[]>({
    key: queryKeys.notifications.list(user?.id),
    fetcher: async () => {
      const [response, unread] = await Promise.all([
        NotificationsApi.list(undefined, 100),
        NotificationsApi.getUnreadCount(),
      ]);
      replaceUnreadNotificationCount(unread.count);
      return response.items;
    },
    policy: cachePolicies.defaultQuery,
    enabled: hasAuthenticatedSession,
  });
  const items = useMemo(() => notificationsQuery.data ?? [], [notificationsQuery.data]);
  const mutateItems = notificationsQuery.mutate;
  const loading = hasAuthenticatedSession && notificationsQuery.isLoading;
  const error = notificationsQuery.error ? getErrorMessage(notificationsQuery.error) : null;
  const refetchNotifications = notificationsQuery.refetch;

  const groups = useMemo(() => groupNotifications(items), [items]);
  // Counted from the list this screen already holds rather than from the
  // unread-count store, so the badge and the rows below it can never disagree.
  const unreadCount = useMemo(
    () => items.reduce((total, item) => (item.isRead ? total : total + 1), 0),
    [items],
  );

  const load = useCallback(async () => {
    if (!hasAuthenticatedSession) return;
    await refetchNotifications({ forceRefresh: true }).catch(() => undefined);
  }, [hasAuthenticatedSession, refetchNotifications]);

  const handleOpenNotification = useCallback((item: MobileNotification) => {
    if (!item.isRead) {
      decrementUnreadNotificationCount(1);
      mutateItems((current) => (current ?? []).map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      void NotificationsApi.markAsRead(item.id).catch(() => {
        incrementUnreadNotificationCount(1);
        mutateItems((current) => (current ?? []).map((entry) => (entry.id === item.id ? { ...entry, isRead: false } : entry)));
      });
    }
    // Target route varies (product/design/post/thread/profile); the destination
    // screen emits its own screen_mounted/data_ready under its flow label, while
    // this measures tap→navigation_called for the notification open.
    navPerf.tap('notifications→target');
    navPerf.navigationCalled();
    // Viewer type decides where "your profile" is — brands own a catalogue, not
    // the shopper profile.
    drillDownPush(routeForNotification(item, user));
  }, [user]);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await NotificationsApi.markAllAsRead();
      mutateItems((current) => (current ?? []).map((item) => ({ ...item, isRead: true })));
      replaceUnreadNotificationCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, [mutateItems]);

  const handleRealtimeCreated = useCallback((notification: MobileNotification) => {
    mutateItems((current) => [notification, ...(current ?? []).filter((entry) => entry.id !== notification.id)]);
  }, [mutateItems]);

  const handleRealtimeDeleted = useCallback(({ id }: { id?: string }) => {
    if (!id) return;
    mutateItems((current) => (current ?? []).filter((entry) => entry.id !== id));
  }, [mutateItems]);

  useNotificationRealtimeChannel({
    enabled: hasAuthenticatedSession,
    token,
    userId: user?.id ?? null,
    onCreated: handleRealtimeCreated,
    onDeleted: handleRealtimeDeleted,
  });

  if (!hasAuthenticatedSession) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <AppBackButton fallbackHref="/(tabs)" />
        </View>
        <View style={styles.stateWrap}>
          {status === 'loading' ? (
            <MuseLoader size={20} />
          ) : (
            <>
              <AppText variant="subtitle">Notifications</AppText>
              <AppText variant="body" tone="muted" style={styles.guestStateText}>
                Sign in to see activity on your designs, orders, and messages.
              </AppText>
              <Button
                title="Sign in"
                onPress={() =>
                  drillDownPush({ pathname: '/(auth)/login', params: { next: '/notifications' } } as any)
                }
              />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      {/*
        Two rows, for the same reason the web header has two: back + title +
        "Mark all" on one line leaves the title about 120dp on a 360dp phone,
        which truncates "Notifications". The action gets its own right-aligned
        line and can therefore carry its real name — the same words the web
        surface uses, so the action is called one thing across the product.
      */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerTop}>
          <AppBackButton fallbackHref="/(tabs)" />
          <View style={styles.headerCopy}>
            <AppText variant="title" numberOfLines={1}>Notifications</AppText>
          </View>
          {/* Soft-primary pill with primary text, the same treatment the system
              avatar in this list already uses. Colour comes from tone, never a
              style override. */}
          {unreadCount > 0 ? (
            <View style={[styles.unreadPill, { backgroundColor: theme.colors.primarySoft }]}>
              <AppText variant="captionBold" tone="primary">
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </AppText>
            </View>
          ) : null}
        </View>
        {unreadCount > 0 ? (
          <View style={styles.headerActions}>
            <Button
              title="Mark all as read"
              size="sm"
              variant="ghost"
              onPress={() => void handleMarkAllRead()}
              loading={markingAll}
            />
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <MuseLoader size={20} />
          <AppText variant="body" tone="muted">Loading notifications...</AppText>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">⚠️</AppText>
          <AppText variant="bodyBold">Could not load notifications</AppText>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Button title="Retry" onPress={() => void load()} size="sm" />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.stateWrap}>
          <AppText variant="subtitle">🔔</AppText>
          <AppText variant="bodyBold">You're all caught up</AppText>
          <AppText variant="body" tone="muted">New activity will appear here.</AppText>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + LAYOUT.TAB_BAR_HEIGHT + tokens.spacing.lg },
          ]}
        >
          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <View style={styles.groupHeader}>
                <AppText variant="bodyBold">{group.title}</AppText>
                <View style={[styles.groupDivider, { backgroundColor: theme.colors.border }]} />
              </View>
              <View style={[styles.groupRows, { backgroundColor: theme.colors.surface }]}>
                {group.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onPress={() => handleOpenNotification(item)} />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  unreadPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  guestStateText: {
    textAlign: 'center',
  },
  group: {
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  groupDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  groupRows: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  row: {
    minHeight: 86,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  copyWrap: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  previewThumb: {
    width: 48,
    height: 64,
    borderRadius: tokens.radius.md,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  entityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.82,
  },
});

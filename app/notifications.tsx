import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { StableImage } from '@/components/ui/StableImage';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
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
  return item.actor?.username || fullName || (item.type.toUpperCase().includes('SYSTEM') ? 'WEAZ' : 'Someone');
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

function describeNotification(item: MobileNotification) {
  const type = item.type.toUpperCase();
  const name = actorName(item);
  const excerpt = typeof item.payload?.excerpt === 'string' ? item.payload.excerpt : null;

  if (type.includes('FOLLOW')) return `${name} patched you.`;
  if (type.includes('COMMENT')) return `${name} commented on your design${excerpt ? `: "${excerpt}"` : '.'}`;
  if (type.includes('THREAD')) return `${name} threaded your design.`;
  if (type.includes('TAG_MENTION')) return `${name} mentioned you in new activity.`;
  if (type.includes('PATCH')) return item.message || `${name} updated a patch request.`;
  if (type.startsWith('ORDER_')) return item.message || 'Your order has new activity.';
  if (type.startsWith('CUSTOM_ORDER_')) return item.message || 'Your custom order has new activity.';
  if (type.includes('MESSAGE')) return item.message || `${name} sent you a message.`;
  if (type.includes('SIZE_FIT')) return item.message || `${name} updated size-fit activity.`;
  return item.message || `${name} sent you a notification.`;
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

function NotificationRow({
  item,
  onPress,
}: {
  item: MobileNotification;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const unread = !item.isRead;
  const previewUri = item.target?.preview ?? (typeof item.payload?.preview === 'string' ? item.payload.preview : null);

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
              {item.type.replace(/_/g, ' ')}
            </AppText>
            <AppText variant="captionRegular" tone="muted">
              {compactTime(item.createdAt)}
            </AppText>
          </View>
          <AppText variant="body" numberOfLines={3}>
            {describeNotification(item)}
          </AppText>
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
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const groups = useMemo(() => groupNotifications(items), [items]);

  const load = useCallback(async () => {
    if (!hasAuthenticatedSession) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [response, unread] = await Promise.all([
        NotificationsApi.list(undefined, 100),
        NotificationsApi.getUnreadCount(),
      ]);
      setItems(response.items);
      replaceUnreadNotificationCount(unread.count);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [hasAuthenticatedSession]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      setItems([]);
      setLoading(false);
      router.replace({
        pathname: '/(auth)/login',
        params: { next: '/notifications' },
      } as any);
      return;
    }

    if (status === 'loading') {
      setItems([]);
      setLoading(true);
      return;
    }

    void load();
  }, [load, status]);

  const handleOpenNotification = useCallback((item: MobileNotification) => {
    if (!item.isRead) {
      decrementUnreadNotificationCount(1);
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      void NotificationsApi.markAsRead(item.id).catch(() => {
        incrementUnreadNotificationCount(1);
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: false } : entry)));
      });
    }
    router.push(routeForNotification(item));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await NotificationsApi.markAllAsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      replaceUnreadNotificationCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const handleRealtimeCreated = useCallback((notification: MobileNotification) => {
    setItems((current) => [notification, ...current.filter((entry) => entry.id !== notification.id)]);
  }, []);

  const handleRealtimeDeleted = useCallback(({ id }: { id?: string }) => {
    if (!id) return;
    setItems((current) => current.filter((entry) => entry.id !== id));
  }, []);

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
        <View style={styles.stateWrap}>
          {status === 'loading' ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Notifications</AppText>
          <AppText variant="captionRegular" tone="muted">
            Activity grouped by time, not buried in one long stream.
          </AppText>
        </View>
        <Button
          title="Mark all"
          size="sm"
          variant="ghost"
          onPress={() => void handleMarkAllRead()}
          loading={markingAll}
          disabled={items.length === 0 || items.every((item) => item.isRead)}
        />
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.82,
  },
});

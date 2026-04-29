import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StableImage } from '@/components/ui/StableImage';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import {
  decrementUnreadNotificationCount,
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
  return item.actor?.username || fullName || (item.type.toUpperCase().includes('SYSTEM') ? 'Threadly' : 'Someone');
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

  if (type.includes('FOLLOW')) return `${name} started following you.`;
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

function groupLabel(dateValue: string) {
  const date = new Date(dateValue);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return 'Earlier';

  const now = new Date();
  const delta = Math.max(0, now.getTime() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - day;

  if (delta < minute) return 'Just now';
  if (delta < hour) {
    const minutes = Math.max(1, Math.floor(delta / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (delta < 6 * hour) {
    const hours = Math.max(1, Math.floor(delta / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfYesterday) return 'Yesterday';
  if (delta < 7 * day) return 'Last week';
  if (delta < 30 * day) return 'Last month';
  if (delta < 365 * day) return 'Last year';
  return 'Earlier';
}

function groupNotifications(items: MobileNotification[]): NotificationGroup[] {
  const ordered = [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt) || 0;
    const bTime = Date.parse(b.createdAt) || 0;
    return bTime - aTime;
  });
  const buckets = new Map<string, MobileNotification[]>();

  ordered.forEach((item) => {
    const label = groupLabel(item.createdAt);
    const current = buckets.get(label) ?? [];
    current.push(item);
    buckets.set(label, current);
  });

  return Array.from(buckets.entries()).map(([title, grouped]) => ({ title, items: grouped }));
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
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <Card
        padding="md"
        style={[
          styles.rowCard,
          {
            backgroundColor: unread ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: 'transparent',
            borderWidth: 0,
          },
        ]}
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
      </Card>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, token, user } = useAuth();
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const groups = useMemo(() => groupNotifications(items), [items]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await NotificationsApi.list(undefined, 100);
      setItems(response.items);
      replaceUnreadNotificationCount(response.items.filter((entry) => !entry.isRead).length);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenNotification = useCallback((item: MobileNotification) => {
    if (!item.isRead) {
      decrementUnreadNotificationCount(1);
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      void NotificationsApi.markAsRead(item.id).catch(() => undefined);
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

  useNotificationRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(token) && Boolean(user?.id),
    token,
    userId: user?.id ?? null,
    onCreated: (notification) => {
      setItems((current) => [notification, ...current.filter((entry) => entry.id !== notification.id)]);
    },
    onDeleted: ({ id }) => {
      if (!id) return;
      setItems((current) => current.filter((entry) => entry.id !== id));
    },
  });

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
              <View style={styles.groupRows}>
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
    gap: tokens.spacing.sm,
  },
  rowCard: {
    minHeight: 86,
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

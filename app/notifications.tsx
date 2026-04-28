import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { AppText } from '@/components/ui/AppText';
import { Header } from '@/components/ui/Header';
import { StableImage } from '@/components/ui/StableImage';
import { NotificationsApi, type MobileNotification } from '@/src/api/NotificationsApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens, LAYOUT } from '@/src/styles/tokens';
import {
  decrementUnreadNotificationCount,
  useNotificationRealtimeChannel,
} from '@/src/realtime/notifications';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth } from '@/src/auth/AuthContext';

type Row = { kind: 'section'; id: string; title: string } | { kind: 'item'; id: string; item: MobileNotification };

const IMPORTANT_TYPES = new Set(['MENTION', 'POST_MENTION', 'COMMENT', 'POST_COMMENT', 'FOLLOW', 'NEW_FOLLOWER', 'SYSTEM', 'PLATFORM_UPDATE']);

function compactTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const delta = Math.max(0, Date.now() - (Number.isNaN(timestamp) ? Date.now() : timestamp));
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'now';
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`;
  return `${Math.floor(delta / (7 * day))}w`;
}

function actorName(item: MobileNotification): string {
  return item.actor?.username || [item.actor?.firstName, item.actor?.lastName].filter(Boolean).join(' ').trim() || (item.type.toUpperCase().includes('SYSTEM') ? 'Threadly' : 'Someone');
}

function messageText(item: MobileNotification): string {
  const name = actorName(item);
  const type = item.type.toUpperCase();
  const excerpt = typeof item.payload?.excerpt === 'string' ? item.payload.excerpt : undefined;
  if (type.includes('FOLLOW')) return `${name} started following you.`;
  if (type.includes('LIKE')) return `${name} liked your post.`;
  if (type.includes('COMMENT')) return `${name} commented on your post${excerpt ? `: "${excerpt}"` : '.'}`;
  if (type.includes('SHARE') || type.includes('REPOST')) return `${name} shared your post.`;
  if (type.includes('MENTION')) return `${name} mentioned you in a post.`;
  return item.message || `${name} sent you a notification.`;
}

function preview(item: MobileNotification): string | undefined {
  const candidates = [
    item.target?.preview,
    item.payload?.thumbnailUrl,
    item.payload?.previewUrl,
    item.payload?.imageUrl,
    item.payload?.mediaUrl,
  ];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function buildRows(items: MobileNotification[]): Row[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within30 = items.filter((item) => {
    const age = now - new Date(item.createdAt).getTime();
    return age >= 0 && age <= 30 * day;
  });
  const highlights = within30.filter((item) => !item.isRead || IMPORTANT_TYPES.has(item.type.toUpperCase())).slice(0, 6);
  const highlightIds = new Set(highlights.map((item) => item.id));
  const groups = [
    { title: 'Highlights', items: highlights },
    { title: 'Last 7 days', items: within30.filter((item) => !highlightIds.has(item.id) && now - new Date(item.createdAt).getTime() <= 7 * day) },
    { title: 'Last 30 days', items: within30.filter((item) => !highlightIds.has(item.id) && now - new Date(item.createdAt).getTime() > 7 * day) },
  ];
  return groups.flatMap((group) => (group.items.length ? [{ kind: 'section' as const, id: group.title, title: group.title }, ...group.items.map((item) => ({ kind: 'item' as const, id: item.id, item }))] : []));
}

function NotificationAvatar({ item }: { item: MobileNotification }) {
  const { theme } = useTheme();
  const isSystem = item.type.toUpperCase().includes('SYSTEM') || item.type.toUpperCase().includes('PLATFORM');
  const avatarUri = useResolvedImageUri({ src: item.actor?.profileImage ?? undefined });
  if (isSystem) {
    return (
      <View style={[styles.avatar, { backgroundColor: theme.colors.text }]}>
        <AppText variant="smallBold" tone="inverse">⚙️</AppText>
      </View>
    );
  }
  return avatarUri ? (
    <StableImage uri={avatarUri} containerStyle={styles.avatar} imageStyle={styles.avatar} />
  ) : (
    <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}>
      <AppText variant="smallBold" tone="primary">{actorName(item).slice(0, 1).toUpperCase()}</AppText>
    </View>
  );
}

function NotificationRow({
  item,
  onRead,
  animateIn,
}: {
  item: MobileNotification;
  onRead: (id: string) => void;
  animateIn: boolean;
}) {
  const { theme } = useTheme();
  const animated = useRef(new Animated.Value(item.isRead ? 0 : 1)).current;
  const entry = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const image = preview(item);
  const text = messageText(item);
  const name = actorName(item);
  const rest = text.startsWith(name) ? text.slice(name.length).trimStart() : text;
  const previewUri = useResolvedImageUri({ src: image });

  useEffect(() => {
    Animated.timing(animated, {
      toValue: item.isRead ? 0 : 1,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [animated, item.isRead]);

  useEffect(() => {
    if (!animateIn) {
      entry.setValue(1);
      return;
    }

    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [animateIn, entry]);

  const bg = animated.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', `${theme.colors.primary}18`],
  });

  const translateY = entry.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <Pressable onPress={() => onRead(item.id)}>
      <Animated.View style={[styles.row, { backgroundColor: bg, opacity: entry, transform: [{ translateY }] }]}>
        <NotificationAvatar item={item} />
        <View style={styles.rowText}>
          <AppText variant="small" numberOfLines={3}>
            <AppText variant="smallBold">{name}</AppText> {rest}{' '}
            <AppText variant="caption" tone="muted">{compactTime(item.createdAt)}</AppText>
          </AppText>
        </View>
        {previewUri ? <StableImage uri={previewUri} containerStyle={styles.thumb} imageStyle={styles.thumb} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, token, user } = useAuth();
  const [items, setItems] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentArrivalIds, setRecentArrivalIds] = useState<string[]>([]);
  const recentArrivalTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const itemsRef = useRef<MobileNotification[]>([]);
  const rows = useMemo(() => buildRows(items), [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      Object.values(recentArrivalTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      recentArrivalTimersRef.current = {};
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await NotificationsApi.list(undefined, 100);
      setItems(response.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => undefined;
    }, [load]),
  );

  const handleRealtimeCreated = useCallback((notification: MobileNotification) => {
    setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
    setRecentArrivalIds((current) => (current.includes(notification.id) ? current : [...current, notification.id]));

    const existingTimer = recentArrivalTimersRef.current[notification.id];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    recentArrivalTimersRef.current[notification.id] = setTimeout(() => {
      setRecentArrivalIds((current) => current.filter((entry) => entry !== notification.id));
      recentArrivalTimersRef.current[notification.id] = null;
    }, 1400);
  }, []);

  const handleRealtimeDeleted = useCallback((payload: { id?: string }) => {
    if (!payload.id) return;
    setItems((current) => current.filter((item) => item.id !== payload.id));
  }, []);

  useNotificationRealtimeChannel({
    enabled: status === 'authenticated' && Boolean(token) && Boolean(user?.id),
    token,
    userId: user?.id ?? null,
    onCreated: handleRealtimeCreated,
    onDeleted: handleRealtimeDeleted,
  });

  const markRead = useCallback((id: string) => {
    const existing = itemsRef.current.find((item) => item.id === id);
    if (existing && !existing.isRead) {
      decrementUnreadNotificationCount(1);
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    void NotificationsApi.markAsRead(id).catch(() => undefined);
  }, []);

  const visibleItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: Row }> }) => {
    viewableItems.forEach((entry) => {
      if (entry.item?.kind === 'item' && !entry.item.item.isRead) {
        markRead(entry.item.item.id);
      }
    });
  }).current;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <Header
        title="Notifications"
        left={
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as any))}
            style={({ pressed }) => [styles.backButton, { borderColor: theme.colors.border }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <AppText variant="subtitle">←</AppText>
          </Pressable>
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + LAYOUT.TAB_BAR_HEIGHT + tokens.spacing.xl }]}
        onViewableItemsChanged={visibleItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <AppText variant="h1" tone="muted">🔔</AppText>
              <AppText variant="h3">You're all caught up</AppText>
              <AppText variant="body" tone="muted">New activity will appear here.</AppText>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <AppText variant="bodyBold" style={styles.sectionTitle}>{item.title}</AppText>
          ) : (
            <NotificationRow item={item.item} onRead={markRead} animateIn={recentArrivalIds.includes(item.item.id)} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  sectionTitle: {
    marginTop: tokens.spacing.lg,
    marginBottom: tokens.spacing.xs,
  },
  row: {
    minHeight: 72,
    borderRadius: tokens.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  empty: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
});

import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { MessagingApi, type OrderConversationRef } from '@/src/api/MessagingApi';
import { cachePolicies, useCachedQuery } from '@/src/cache';
import { queryKeys } from '@/src/query/queryKeys';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { drillDownPush } from '@/src/utils/mobileNavigation';

type OrderConversationStatus = { exists: boolean; threadId: string | null };

/**
 * The order screen's way into the conversation with that order's brand.
 *
 * The label tells the truth about what a press does: "Go to conversation" when
 * a window with the brand already exists, "Open conversation" when the press
 * starts one. Both land in the SAME buyer<->brand thread — the message screen
 * opens it through `openOrderConversation`, which reuses the pair thread and
 * links this order into it. It never opens a second window.
 *
 * Plain Pressable with an opacity/scale press state: no `android_ripple`, so
 * there is no rectangular ripple painted over the rounded pill.
 */
export function OrderConversationButton({
  orderId,
  kind,
  brandName,
}: {
  orderId: string;
  kind: 'STANDARD' | 'CUSTOM';
  brandName?: string | null;
}) {
  const { theme } = useTheme();
  const ref = useMemo<OrderConversationRef>(
    () => (kind === 'CUSTOM' ? { customOrderId: orderId } : { orderId }),
    [kind, orderId],
  );

  const statusQuery = useCachedQuery<OrderConversationStatus>({
    key: queryKeys.orders.conversation(orderId, kind),
    fetcher: () => MessagingApi.findOrderConversation(ref),
    // Short-lived: a press here creates the window, and coming back should say so.
    policy: cachePolicies.interactionStatus,
  });
  const { data, isLoading, mutate } = statusQuery;

  const exists = data?.exists === true;
  const pending = isLoading && !data;
  const label = exists ? 'Go to conversation' : 'Open conversation';

  const handlePress = useCallback(() => {
    mutate(() => ({ exists: true, threadId: data?.threadId ?? null }));
    // Always resolve through the order (never jump straight to a known
    // threadId): that is what links THIS order into the thread, so the
    // conversation opens with the order attached.
    drillDownPush({
      pathname: '/messages/[threadId]',
      params: { threadId: 'resolve', ...ref },
    } as never);
  }, [data?.threadId, mutate, ref]);

  const fg = theme.colors.textInverse;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={brandName ? `${label} with ${brandName}` : label}
      accessibilityState={{ busy: pending }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.chip, { backgroundColor: tokens.tintLight(0.18) }]}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke={fg}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        {exists ? (
          <View
            style={[styles.liveDot, { backgroundColor: theme.colors.success, borderColor: theme.colors.primary }]}
          />
        ) : null}
      </View>
      <View style={styles.copy}>
        <AppText variant="bodyBold" tone="inverse" numberOfLines={1}>
          {pending ? 'Conversation' : label}
        </AppText>
        {brandName ? (
          <AppText variant="captionRegular" tone="inverse" numberOfLines={1} style={styles.subtitle}>
            {exists ? `Your chat with ${brandName}` : `Message ${brandName} about this order`}
          </AppText>
        ) : null}
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M5 12h14M13 6l6 6-6 6" stroke={fg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minHeight: tokens.button.lg.height,
    paddingVertical: tokens.spacing.sm,
    paddingLeft: tokens.spacing.sm,
    paddingRight: tokens.spacing.md,
    borderRadius: tokens.radius.full,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: tokens.radius.full,
    borderWidth: 2,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    opacity: 0.8,
  },
});

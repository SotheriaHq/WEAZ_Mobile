import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { NEW_DROP_BADGE_RULE, getNewDropInfo } from '@/src/engagement/newDrop';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type NewDropBadgeProps = {
  itemId: string;
  createdAt?: string | null;
  sourceScreen: string;
  feedPosition?: number;
  compact?: boolean;
  isActive?: boolean;
  style?: StyleProp<ViewStyle>;
};

const dismissedSessionItems = new Set<string>();

export function NewDropBadge({
  itemId,
  createdAt,
  sourceScreen,
  feedPosition,
  compact = false,
  isActive = false,
  style,
}: NewDropBadgeProps) {
  const { theme } = useTheme();
  const trackedKeyRef = useRef<string | null>(null);
  const info = getNewDropInfo(createdAt);
  const [dismissed, setDismissed] = useState(() => dismissedSessionItems.has(itemId));
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      dismissedSessionItems.add(itemId);
      setDismissed(true);
    }
    wasActiveRef.current = isActive;
  }, [isActive, itemId]);

  useEffect(() => {
    if (!info.isNewDrop) return;
    const key = `${sourceScreen}:${itemId}:${NEW_DROP_BADGE_RULE}`;
    if (trackedKeyRef.current === key) return;
    trackedKeyRef.current = key;
    trackMobileEvent('new_drop_badge_seen', {
      sourceScreen,
      itemId,
      badgeRule: NEW_DROP_BADGE_RULE,
      ageHours: info.ageHours ?? undefined,
      feedPosition,
    });
  }, [feedPosition, info.ageHours, info.isNewDrop, itemId, sourceScreen]);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!info.isNewDrop || dismissed) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.delay(2000), // pulse every 2.8 seconds
      ])
    ).start();
  }, [info.isNewDrop, pulseAnim, dismissed]);

  if (!info.isNewDrop || dismissed) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.badge,
        compact && styles.compactBadge,
        {
          backgroundColor: theme.colors.primarySoft,
          borderColor: theme.colors.primary,
          transform: [{ scale: pulseAnim }],
        },
        style,
      ]}
    >
      <AppText variant="captionBold" tone="primary" numberOfLines={1}>
        {compact ? 'New' : '✦ New drop'}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    borderTopLeftRadius: tokens.radius.full,
    borderTopRightRadius: tokens.radius.md,
    borderBottomRightRadius: tokens.radius.full,
    borderBottomLeftRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  compactBadge: {
    minHeight: 20,
    paddingHorizontal: tokens.spacing.sm,
  },
});

export default NewDropBadge;

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
  style?: StyleProp<ViewStyle>;
};

export function NewDropBadge({
  itemId,
  createdAt,
  sourceScreen,
  feedPosition,
  style,
}: NewDropBadgeProps) {
  const { theme } = useTheme();
  const trackedKeyRef = useRef<string | null>(null);
  const info = getNewDropInfo(createdAt);

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

  if (!info.isNewDrop) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          backgroundColor: theme.colors.primarySoft,
          borderColor: theme.colors.primary,
        },
        style,
      ]}
    >
      <AppText variant="captionBold" tone="primary" numberOfLines={1}>
        New Drop
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NewDropBadge;

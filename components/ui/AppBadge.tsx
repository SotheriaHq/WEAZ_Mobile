import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type AppBadgeTone = 'primary' | 'success' | 'warning' | 'muted' | 'verified' | 'neutral';

export type StoreBadgeState =
  | 'open_verified'
  | 'open_unverified'
  | 'closed_verified'
  | 'closed_unverified'
  | 'pending_verification'
  | 'not_verified';

export type AppBadgeProps = {
  label: string;
  icon?: string | null;
  tone?: AppBadgeTone;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export type StoreBadgeModel = {
  state: StoreBadgeState;
  label: string;
  icon: string;
  tone: AppBadgeTone;
  accessibilityLabel: string;
};

const SHOP_ICON = String.fromCodePoint(0x1f6cd, 0xfe0f);
const VERIFIED_ICON = String.fromCodePoint(0x2726);
const PENDING_ICON = String.fromCodePoint(0x23f3);

const getToneColors = (tone: AppBadgeTone, theme: ReturnType<typeof useTheme>['theme']) => {
  switch (tone) {
    case 'success':
      return {
        border: theme.colors.success,
        background: 'transparent',
        iconBackground: theme.colors.success,
        textTone: 'success' as const,
      };
    case 'warning':
      return {
        border: theme.colors.warning,
        background: 'transparent',
        iconBackground: theme.colors.warning,
        textTone: 'warning' as const,
      };
    case 'muted':
      return {
        border: theme.colors.textMuted,
        background: 'transparent',
        iconBackground: theme.colors.textMuted,
        textTone: 'muted' as const,
      };
    case 'neutral':
      return {
        border: theme.colors.textMuted,
        background: 'transparent',
        iconBackground: theme.colors.textMuted,
        textTone: 'secondary' as const,
      };
    case 'verified':
    case 'primary':
    default:
      return {
        border: theme.colors.primary,
        background: 'transparent',
        iconBackground: theme.colors.primary,
        textTone: 'primary' as const,
      };
  }
};

export function getStoreBadgeModel({
  isOpen,
  verified,
  pending,
}: {
  isOpen?: boolean | null;
  verified?: boolean | null;
  pending?: boolean | null;
}): StoreBadgeModel {
  if (pending) {
    return {
      state: 'pending_verification',
      label: 'Pending',
      icon: PENDING_ICON,
      tone: 'neutral',
      accessibilityLabel: 'Verification pending',
    };
  }

  if (isOpen === true && verified) {
    return {
      state: 'open_verified',
      label: 'Open',
      icon: VERIFIED_ICON,
      tone: 'verified',
      accessibilityLabel: 'Verified store open',
    };
  }

  if (isOpen === true) {
    return {
      state: 'open_unverified',
      label: 'Open',
      icon: SHOP_ICON,
      tone: 'success',
      accessibilityLabel: 'Store open',
    };
  }

  if (isOpen === false && verified) {
    return {
      state: 'closed_verified',
      label: 'Closed',
      icon: VERIFIED_ICON,
      tone: 'muted',
      accessibilityLabel: 'Verified store closed',
    };
  }

  if (isOpen === false) {
    return {
      state: 'closed_unverified',
      label: 'Closed',
      icon: SHOP_ICON,
      tone: 'neutral',
      accessibilityLabel: 'Store closed',
    };
  }

  return {
    state: 'not_verified',
    label: 'Not verified',
    icon: SHOP_ICON,
    tone: 'neutral',
    accessibilityLabel: 'Store not verified',
  };
}

export function AppBadge({
  label,
  icon,
  tone = 'primary',
  compact = false,
  accessibilityLabel,
  style,
}: AppBadgeProps) {
  const { theme } = useTheme();
  const colors = getToneColors(tone, theme);

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.compactBadge : null,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
        style,
      ]}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? (
        <View style={styles.markerWrap}>
          <View style={[styles.markerShadow, { backgroundColor: colors.iconBackground }]} />
          <View style={[styles.iconBox, { backgroundColor: colors.iconBackground, borderColor: colors.border }]}>
            <AppText variant="captionBold" tone="inverse" numberOfLines={1} style={styles.iconText}>
              {icon}
            </AppText>
          </View>
        </View>
      ) : null}
      {!compact ? (
        <AppText variant="captionBold" tone={colors.textTone} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    borderRadius: tokens.radius.md,
    borderWidth: 0,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    maxWidth: 132,
  },
  compactBadge: {
    minHeight: 24,
    maxWidth: 24,
  },
  markerWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerShadow: {
    position: 'absolute',
    width: 21,
    height: 21,
    borderRadius: tokens.radius.sm,
    opacity: 0.28,
    transform: [{ rotate: '12deg' }],
  },
  iconBox: {
    width: 20,
    height: 20,
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    textAlign: 'center',
  },
});

export default AppBadge;

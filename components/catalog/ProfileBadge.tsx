import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type ProfileBadgeVariant =
  | 'email_verified'
  | 'user_verified'
  | 'brand_verified'
  | 'store_verified'
  | 'store_open'
  | 'store_closed'
  | 'pending_verification';

export type ProfileBadgeModel = {
  variant: ProfileBadgeVariant;
  label: string;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'muted';
  accessibilityLabel: string;
};

export type StoreStatus = 'OPEN' | 'CLOSED' | 'PENDING_VERIFICATION' | 'UNAVAILABLE' | null | undefined;

type BrandBadgeSource = {
  emailVerified?: boolean | null;
  userVerified?: boolean | null;
  brandVerified?: boolean | null;
  storeVerified?: boolean | null;
  isStoreOpen?: boolean | null;
  storeStatus?: StoreStatus;
  verificationStatus?: string | null;
};

const BADGE_LABELS: Record<ProfileBadgeVariant, Omit<ProfileBadgeModel, 'variant'>> = {
  email_verified: {
    label: 'Email',
    icon: '✉️',
    tone: 'primary',
    accessibilityLabel: 'Email verified',
  },
  user_verified: {
    label: 'User',
    icon: '✦',
    tone: 'primary',
    accessibilityLabel: 'Verified user',
  },
  brand_verified: {
    label: 'Verified',
    icon: '✦',
    tone: 'primary',
    accessibilityLabel: 'Verified brand',
  },
  store_verified: {
    label: 'Store',
    icon: '✦',
    tone: 'primary',
    accessibilityLabel: 'Verified store',
  },
  store_open: {
    label: 'Open',
    icon: '🛍️',
    tone: 'success',
    accessibilityLabel: 'Store open',
  },
  store_closed: {
    label: 'Closed',
    icon: '🛍️',
    tone: 'muted',
    accessibilityLabel: 'Store closed',
  },
  pending_verification: {
    label: 'Pending',
    icon: '⏳',
    tone: 'warning',
    accessibilityLabel: 'Verification pending',
  },
};

export function getProfileBadge(variant: ProfileBadgeVariant): ProfileBadgeModel {
  return { variant, ...BADGE_LABELS[variant] };
}

export function getStoreStatusBadge(status: StoreStatus, isStoreOpen?: boolean | null): ProfileBadgeModel | null {
  const normalized = String(status ?? '').toUpperCase();

  if (normalized === 'PENDING_VERIFICATION') {
    return getProfileBadge('pending_verification');
  }

  if (normalized === 'OPEN' || isStoreOpen === true) {
    return getProfileBadge('store_open');
  }

  if (normalized === 'CLOSED' || isStoreOpen === false) {
    return getProfileBadge('store_closed');
  }

  return null;
}

export function getBrandBadges(source: BrandBadgeSource): ProfileBadgeModel[] {
  const badges: ProfileBadgeModel[] = [];
  const verificationStatus = String(source.verificationStatus ?? '').toUpperCase();
  const pendingVerification =
    verificationStatus === 'SUBMITTED' ||
    verificationStatus === 'IN_REVIEW' ||
    verificationStatus === 'ADDITIONAL_INFO_REQUESTED' ||
    verificationStatus === 'PENDING';

  if (source.brandVerified) {
    badges.push(getProfileBadge('brand_verified'));
  } else if (source.storeVerified) {
    badges.push(getProfileBadge('store_verified'));
  } else if (source.userVerified) {
    badges.push(getProfileBadge('user_verified'));
  } else if (pendingVerification) {
    badges.push(getProfileBadge('pending_verification'));
  }

  if (source.emailVerified) {
    badges.push(getProfileBadge('email_verified'));
  }

  const storeStatus = getStoreStatusBadge(source.storeStatus, source.isStoreOpen);
  if (storeStatus) {
    badges.push(storeStatus);
  }

  return badges.slice(0, 3);
}

export function ProfileBadge({
  badge,
  compact = false,
}: {
  badge: ProfileBadgeModel;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const tint =
    badge.tone === 'success'
      ? theme.colors.success
      : badge.tone === 'warning'
        ? theme.colors.warning
        : badge.tone === 'muted'
          ? theme.colors.textMuted
          : theme.colors.primary;

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.compactBadge : null,
        {
          backgroundColor: theme.colors.surface,
          borderColor: tint,
        },
      ]}
      accessibilityLabel={badge.accessibilityLabel}
    >
      <View style={styles.sealStack}>
        <View style={[styles.sealBack, { backgroundColor: tint }]} />
        <View style={[styles.sealFront, { backgroundColor: tint }]} />
        <AppText variant="captionBold" tone="inverse" numberOfLines={1} style={styles.sealText}>
          {badge.icon}
        </AppText>
      </View>
      {!compact ? (
        <AppText variant="captionBold" tone={badge.tone === 'muted' ? 'muted' : badge.tone} numberOfLines={1}>
          {badge.label}
        </AppText>
      ) : null}
    </View>
  );
}

export function BrandBadgeRail({ badges }: { badges: ProfileBadgeModel[] }) {
  if (badges.length === 0) return null;

  return (
    <View style={styles.rail}>
      {badges.map((badge) => (
        <ProfileBadge key={badge.variant} badge={badge} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  badge: {
    minHeight: 30,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    maxWidth: 116,
  },
  compactBadge: {
    minHeight: 24,
    paddingHorizontal: tokens.spacing.xs,
  },
  sealStack: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealBack: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: tokens.spacing.xs,
    transform: [{ rotate: '45deg' }],
  },
  sealFront: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: tokens.spacing.xs,
  },
  sealText: {
    textAlign: 'center',
  },
});

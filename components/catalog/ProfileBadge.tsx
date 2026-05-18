import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBadge, getStoreBadgeModel, type AppBadgeTone } from '@/components/ui/AppBadge';
import { tokens } from '@/src/styles/tokens';

export type ProfileBadgeVariant =
  | 'email_verified'
  | 'user_verified'
  | 'brand_verified'
  | 'store_verified'
  | 'store_open'
  | 'store_closed'
  | 'store_open_verified'
  | 'store_open_unverified'
  | 'store_closed_verified'
  | 'store_closed_unverified'
  | 'not_verified'
  | 'pending_verification';

export type ProfileBadgeModel = {
  variant: ProfileBadgeVariant;
  label: string;
  icon: string;
  tone: AppBadgeTone;
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

const EMAIL_ICON = String.fromCodePoint(0x2709, 0xfe0f);
const VERIFIED_ICON = String.fromCodePoint(0x2726);
const PENDING_ICON = String.fromCodePoint(0x23f3);

const BADGE_LABELS: Record<ProfileBadgeVariant, Omit<ProfileBadgeModel, 'variant'>> = {
  email_verified: {
    label: 'Email',
    icon: EMAIL_ICON,
    tone: 'primary',
    accessibilityLabel: 'Email verified',
  },
  user_verified: {
    label: 'User',
    icon: VERIFIED_ICON,
    tone: 'primary',
    accessibilityLabel: 'Verified user',
  },
  brand_verified: {
    label: 'Verified',
    icon: VERIFIED_ICON,
    tone: 'verified',
    accessibilityLabel: 'Verified brand',
  },
  store_verified: {
    label: 'Store',
    icon: VERIFIED_ICON,
    tone: 'verified',
    accessibilityLabel: 'Verified store',
  },
  store_open: {
    label: 'Open',
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
    tone: 'success',
    accessibilityLabel: 'Store open',
  },
  store_closed: {
    label: 'Closed',
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
    tone: 'neutral',
    accessibilityLabel: 'Store closed',
  },
  store_open_verified: {
    label: 'Open',
    icon: VERIFIED_ICON,
    tone: 'verified',
    accessibilityLabel: 'Verified store open',
  },
  store_open_unverified: {
    label: 'Open',
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
    tone: 'success',
    accessibilityLabel: 'Store open',
  },
  store_closed_verified: {
    label: 'Closed',
    icon: VERIFIED_ICON,
    tone: 'muted',
    accessibilityLabel: 'Verified store closed',
  },
  store_closed_unverified: {
    label: 'Closed',
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
    tone: 'neutral',
    accessibilityLabel: 'Store closed',
  },
  not_verified: {
    label: 'Not verified',
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
    tone: 'neutral',
    accessibilityLabel: 'Store not verified',
  },
  pending_verification: {
    label: 'Pending',
    icon: PENDING_ICON,
    tone: 'neutral',
    accessibilityLabel: 'Verification pending',
  },
};

export function getProfileBadge(variant: ProfileBadgeVariant): ProfileBadgeModel {
  return { variant, ...BADGE_LABELS[variant] };
}

export function getStoreStatusBadge(
  status: StoreStatus,
  isStoreOpen?: boolean | null,
  verified?: boolean | null,
): ProfileBadgeModel | null {
  const normalized = String(status ?? '').toUpperCase();

  if (normalized === 'PENDING_VERIFICATION') {
    return getProfileBadge('pending_verification');
  }

  if (normalized === 'OPEN' || isStoreOpen === true) {
    const badge = getStoreBadgeModel({ isOpen: true, verified });
    return { variant: badge.state === 'open_verified' ? 'store_open_verified' : 'store_open_unverified', ...badge };
  }

  if (normalized === 'CLOSED' || isStoreOpen === false) {
    const badge = getStoreBadgeModel({ isOpen: false, verified });
    return { variant: badge.state === 'closed_verified' ? 'store_closed_verified' : 'store_closed_unverified', ...badge };
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

  const storeStatus = getStoreStatusBadge(source.storeStatus, source.isStoreOpen, Boolean(source.storeVerified || source.brandVerified));
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
  return (
    <AppBadge
      label={badge.label}
      icon={badge.icon}
      tone={badge.tone}
      compact={compact}
      accessibilityLabel={badge.accessibilityLabel}
    />
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
});

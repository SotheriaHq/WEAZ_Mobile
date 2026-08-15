/**
 * Catalog Screen - Mobile
 * Brand catalog page with profile header, collections, reviews, and about tabs
 * Routes: /catalog (owner view) or /catalog/[brandId] (visitor view)
 * Rule 5: emoji-only markers | Rule 6: rounded-square avatars
 */

import React, { useCallback, useEffect, useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  BackHandler,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import Animated, { useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth, useAuthSession } from '@/src/auth/AuthContext';
import { canManageCatalog, getActiveBrandId } from '@/src/auth/brandAccess';
import { brandApi, type BrandProfileDto, type CollectionDto } from '@/src/api/BrandApi';
import { ProfilePhotoViewApi } from '@/src/api/ProfilePhotoViewApi';
import { SavedItemsApi } from '@/src/api/SavedItemsApi';
import { OwnerCatalogMediaHeader } from '@/components/catalog/OwnerCatalogMediaHeader';
import { BrandProfileHeader, BrandProfileHeaderSkeleton, type BrandHeaderContactItem, type BrandHeaderStat } from '@/components/catalog/BrandProfileHeader';
import MobileProfileImageModal from '@/components/profile/ProfileImageModal';
import { Tabs } from '@/components/catalog/Tabs';
import { CollectionsGrid } from '@/components/catalog/CollectionsGrid';
import { VisibilityFilter } from '@/components/catalog/VisibilityFilter';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/src/toast/ToastContext';
import { useBrandPatchStatus } from '@/src/hooks/useBrandPatchStatus';
import { useUnreadNotificationCount } from '@/src/realtime/notifications';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { resolveBannerImageSource, resolveProfileImageSource } from '@/src/utils/profileImage';
import { BrandShopTab } from '@/components/catalog/BrandShopTab';
import { BrandReviewsTab } from '@/components/catalog/BrandReviewsTab';
import EmailVerificationNotice from '@/components/auth/EmailVerificationNotice';
import { getBrandBadges } from '@/components/catalog/ProfileBadge';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AppConfirmDialog } from '@/components/ui/AppConfirmDialog';
import { AppActionSheet, type AppActionSheetOption } from '@/components/ui/AppActionSheet';
import { AppFloatingMenu, type FloatingMenuOption } from '@/components/ui/AppFloatingMenu';
import { AppQrSheet } from '@/components/ui/AppQrSheet';
import { BrandSwitcherSheet } from '@/components/brand/BrandSwitcherSheet';
import {
  pickDesignEditorMediaAssets,
  stageDesignEditorAssetBundle,
  type DesignEditorMediaSource,
} from '@/src/features/design-editor/designEditorMediaFlow';
import {
  readDesignEditorBackgroundTasks,
  removeDesignEditorBackgroundTask,
  subscribeDesignEditorBackgroundTasks,
  touchDesignEditorBackgroundTask,
  type DesignEditorBackgroundTask,
} from '@/src/features/design-editor/designEditorBackgroundTasks';
import { tokens } from '@/src/styles/tokens';
import { catalogDevLog } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { formatCount } from '@/src/utils/formatCount';
import { env } from '@/src/config/env';
import { routeForDesignTarget } from '@/src/utils/mobileRouting';
import { backOrNavigate, drillDownPush } from '@/src/utils/mobileNavigation';
import { perfMark } from '@/src/utils/perf';
import { navPerf } from '@/src/utils/navPerf';
import {
  refreshBrandCollectionsQuery,
  refreshBrandDraftsQuery,
  refreshBrandProfileQuery,
  useBrandCollectionsQuery,
  useBrandDraftsQuery,
  useBrandInReviewQuery,
  useBrandNeedsAttentionQuery,
  useBrandProfileQuery,
} from '@/src/query/catalogQueries';
import { WIEZ_SAVED_STATUS_STALE_TIME_MS } from '@/src/query/queryClient';
import { queryKeys } from '@/src/query/queryKeys';
import { readWarmScreenUiState, writeWarmScreenUiState } from '@/src/state/screenWarmState';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { useStoreSetupStatus } from '@/src/hooks/useStoreSetupStatus';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Types
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

type TabType = 'Collections' | 'Shop' | 'Reviews';
type VisibilityType = 'Public' | 'Private' | 'Drafts' | 'In Review' | 'Changes Requested' | 'Rejected' | 'Needs Attention';
type CatalogUiLifetimeState = {
  activeTab: TabType;
  visibilityFilter: VisibilityType;
  // Outer vertical scroll offset, preserved so a warm return restores the exact
  // reading position (not just the active tab/filter). UI-only lifetime state.
  scrollY?: number;
};
const TAB_ORDER: TabType[] = ['Collections', 'Shop', 'Reviews'];
const REVIEW_VISIBILITY_STATUS: Partial<Record<VisibilityType, 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED'>> = {
  'In Review': 'IN_REVIEW',
  'Changes Requested': 'CHANGES_REQUESTED',
  Rejected: 'REJECTED',
};
const BRAND_COLLECTIONS_QUERY_ROOT = ['brand', 'collections'] as const;
// Stable identity for "no data yet" — a fresh `?? []` per render makes every
// downstream memo/effect dependency churn, which can loop setState effects
// (Maximum update depth) whenever queries are still loading or failing.
const EMPTY_COLLECTIONS: CollectionDto[] = [];

function removeCollectionFromList(items: CollectionDto[] | undefined, collectionId: string) {
  if (!Array.isArray(items)) return items;
  const next = items.filter((collection) => collection.id !== collectionId);
  return next.length === items.length ? items : next;
}

function readMetricNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readContactValue(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProfileUrlFromConfig(brandId: string | null, username?: string | null): string | null {
  if (!brandId) return null;

  const baseUrl = env.webAppUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return null;

  if (!__DEV__ && /(?:localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    return null;
  }

  const cleanUsername = username?.trim();
  const path = cleanUsername
    ? `/u/${encodeURIComponent(cleanUsername)}`
    : `/profile/${encodeURIComponent(brandId)}`;

  return `${baseUrl}${path}`;
}

/** Extract `/u/:username` from backend public profile / QR / share URLs. */
function extractUsernameFromProfileUrl(url?: string | null): string | null {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return null;
  try {
    const path = raw.includes('://') ? new URL(raw).pathname : raw.startsWith('/') ? raw : `/${raw}`;
    const match = path.match(/\/u\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).replace(/^@+/, '').trim() || null;
  } catch {
    const match = raw.match(/\/u\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]).replace(/^@+/, '').trim() || null;
    } catch {
      return match[1].replace(/^@+/, '').trim() || null;
    }
  }
}

function resolveCatalogBrandUsername(profile: {
  username?: string | null;
  publicProfileUrl?: string | null;
  qrTargetUrl?: string | null;
  shareUrl?: string | null;
} | null | undefined): string {
  const direct = profile?.username?.trim().replace(/^@+/, '') || '';
  if (direct) return direct;
  return (
    extractUsernameFromProfileUrl(profile?.publicProfileUrl) ||
    extractUsernameFromProfileUrl(profile?.shareUrl) ||
    extractUsernameFromProfileUrl(profile?.qrTargetUrl) ||
    ''
  );
}

function resolveCatalogBrandDisplayName(profile: {
  brandFullName?: string | null;
  username?: string | null;
  publicProfileUrl?: string | null;
  qrTargetUrl?: string | null;
  shareUrl?: string | null;
} | null | undefined): string {
  const fullName = profile?.brandFullName?.trim() || '';
  if (fullName) return fullName;
  const username = resolveCatalogBrandUsername(profile);
  if (username) return username;
  return 'Brand';
}

function resolveCatalogBrandLocation(profile: {
  location?: string | null;
  brandCity?: string | null;
  brandState?: string | null;
  brandCountry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
} | null | undefined): string | undefined {
  const direct = profile?.location?.trim();
  if (direct) return direct;
  const joined = [
    profile?.brandCity ?? profile?.city,
    profile?.brandState ?? profile?.state,
    profile?.brandCountry ?? profile?.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ');
  return joined || undefined;
}

function resolveCatalogBrandTags(profile: {
  brandTags?: string[] | null;
  tags?: string[] | null;
  hashtags?: string[] | null;
} | null | undefined): string[] {
  const raw =
    Array.isArray(profile?.brandTags) && profile.brandTags.length > 0
      ? profile.brandTags
      : Array.isArray((profile as { tags?: string[] } | null | undefined)?.tags)
        ? (profile as { tags?: string[] }).tags!
        : Array.isArray((profile as { hashtags?: string[] } | null | undefined)?.hashtags)
          ? (profile as { hashtags?: string[] }).hashtags!
          : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    const tag = String(entry ?? '')
      .trim()
      .replace(/^#+/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function buildCatalogUiStateKey(targetBrandId: string, isOwner: boolean) {
  return `catalog:${isOwner ? 'owner' : 'visitor'}:${targetBrandId}`;
}

function CatalogLoadingSkeleton({ bottomPadding }: { bottomPadding: number }) {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={styles.scrollView}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.skeletonScrollContent,
        { paddingBottom: bottomPadding + tokens.spacing.xl },
      ]}
    >
      <BrandProfileHeaderSkeleton />

      <View style={styles.skeletonTabsRow}>
        <Skeleton width={72} height={32} borderRadius={tokens.radius.full} />
        <Skeleton width={64} height={32} borderRadius={tokens.radius.full} />
        <Skeleton width={72} height={32} borderRadius={tokens.radius.full} />
      </View>

      <View style={styles.skeletonGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} style={[styles.skeletonCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Skeleton width="100%" height={180} borderRadius={tokens.radius.lg} />
            <Skeleton width="72%" height={14} borderRadius={tokens.radius.sm} style={styles.skeletonCardTitle} />
            <Skeleton width="48%" height={12} borderRadius={tokens.radius.sm} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Empty States
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const EmptyCollections = ({ isOwner, onAdd }: { isOwner: boolean; onAdd?: () => void }) => {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display" tone="muted">+</AppText>
      <AppText variant="subtitle" style={styles.emptyTitle}>
        No Content Yet
      </AppText>
      <AppText variant="bodyRegular" tone="muted" style={styles.emptySubtitle}>
        {isOwner
          ? 'Start showcasing your fashion by creating your first design.'
          : 'This brand has not published content yet.'}
      </AppText>
      {isOwner && onAdd && (
        <Button title="Create Design" onPress={onAdd} size="md" style={styles.emptyButton} />
      )}
    </View>
  );
};

/**
 * What the owner sees on the Shop tab before their store exists.
 *
 * Store setup is itself gated on a verified email, so this states which step is
 * actually next instead of sending the brand to a screen that will turn them
 * away.
 */
const StoreSetupRequiredNotice = ({
  emailVerified,
  onStartSetup,
}: {
  emailVerified: boolean;
  onStartSetup: () => void;
}) => (
  <View style={styles.emptyState}>
    <AppText variant="display" tone="muted">🛍️</AppText>
    <AppText variant="subtitle" style={styles.emptyTitle}>
      {emailVerified ? 'Your store is not set up yet' : 'Verify your email to open a store'}
    </AppText>
    <AppText variant="bodyRegular" tone="muted" style={styles.emptySubtitle}>
      {emailVerified
        ? 'Set up your store to list products, take orders, and get paid. Your Shop tab goes live the moment setup is complete.'
        : 'Confirm the link we sent to your email address, then come back to set up your store.'}
    </AppText>
    {emailVerified ? (
      <Button title="Set up my store" onPress={onStartSetup} size="md" style={styles.emptyButton} />
    ) : null}
  </View>
);

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Main Component
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const CreateMenuWrapper = forwardRef<{ open: (e?: any) => void }, { options: FloatingMenuOption[], anchorRef: React.RefObject<any>, width?: number }>((props, ref) => {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<{ pageX: number; pageY: number; width: number; height: number } | null>(null);

  useImperativeHandle(ref, () => ({
    open: (e?: any) => {
      if (props.anchorRef?.current) {
        props.anchorRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (w > 0 && h > 0) {
            setMetrics({ pageX: x, pageY: y, width: w, height: h });
          } else if (e?.nativeEvent && e.nativeEvent.pageX != null) {
            setMetrics({ pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY, width: 40, height: 40 });
          } else {
            setMetrics(null);
          }
          setOpen(true);
        });
      } else {
        if (e?.nativeEvent && e.nativeEvent.pageX != null) {
          setMetrics({ pageX: e.nativeEvent.pageX, pageY: e.nativeEvent.pageY, width: 40, height: 40 });
        } else {
          setMetrics(null);
        }
        setOpen(true);
      }
    }
  }));

  return (
    <AppFloatingMenu
      visible={open}
      anchorRef={props.anchorRef}
      anchorMetrics={metrics}
      options={props.options}
      width={props.width}
      onClose={() => setOpen(false)}
    />
  );
});

export default function CatalogScreen() {
  const flowKey = 'catalog';
  // Phase 1 instrumentation
  React.useEffect(() => {
    navPerf.screenMounted(flowKey);
  }, []);

  React.useLayoutEffect(() => {
    navPerf.shellVisible(flowKey);
  }, []);

  React.useEffect(() => {
    navPerf.firstVisibleUi(flowKey);
  }, []);

  const { brandId: routeBrandId, tab: routeTabParam, visibility: routeVisibilityParam, productId: routeProductIdParam } = useLocalSearchParams<{
    brandId?: string;
    tab?: string | string[];
    visibility?: string | string[];
    productId?: string | string[];
  }>();
  const { theme, scheme } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { standardScreenBottomPadding } = useScreenChrome();
  const deferredWorkReady = useDeferredScreenWork();
  const { user } = useAuth();
  const { status, userId, userType, userEmailVerified, updateUser } = useAuthSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const unreadNotificationCount = useUnreadNotificationCount();
  const isDark = scheme === 'dark';
  const activeBrandId = getActiveBrandId(user);
  const isOwner = Boolean(canManageCatalog(user) && (!routeBrandId || routeBrandId === activeBrandId));
  const { isSetupComplete: storeSetupComplete } = useStoreSetupStatus();
  const targetBrandId = routeBrandId || activeBrandId || null;
  const catalogUiStateKey = targetBrandId ? buildCatalogUiStateKey(targetBrandId, isOwner) : null;
  const initialCatalogUiStateRef = useRef<CatalogUiLifetimeState | null>(
    catalogUiStateKey ? readWarmScreenUiState<CatalogUiLifetimeState>(catalogUiStateKey) : null,
  );
  const lastCatalogUiStateKeyRef = useRef<string | null>(catalogUiStateKey);
  const skipNextCatalogUiPersistRef = useRef(false);

  const routeTab = Array.isArray(routeTabParam) ? routeTabParam[0] : routeTabParam;
  const routeVisibility = Array.isArray(routeVisibilityParam) ? routeVisibilityParam[0] : routeVisibilityParam;
  const routeProductId = Array.isArray(routeProductIdParam) ? routeProductIdParam[0] : routeProductIdParam;
  const normalizeTab = (value?: string): TabType => {
    const key = String(value ?? '').trim().toLowerCase();
    if (key === 'shop' || key === 'store') return 'Shop';
    if (key === 'reviews') return 'Reviews';
    return 'Collections';
  };
  const normalizeVisibility = (value?: string): VisibilityType => {
    const key = String(value ?? '').trim().toLowerCase();
    if (key === 'private') return 'Private';
    if (key === 'drafts' || key === 'draft') return 'Drafts';
    if (key === 'in review' || key === 'in_review' || key === 'in-review') return 'In Review';
    // Changes Requested merged into Needs Attention. Existing deep links,
    // notifications and persisted UI state still carry the old value, so it
    // normalizes onto the surviving bucket rather than silently falling through
    // to Public and stranding the owner on the wrong tab.
    if (
      key === 'changes requested' ||
      key === 'changes_requested' ||
      key === 'changes-requested' ||
      key === 'needs attention' ||
      key === 'needs_attention' ||
      key === 'needs-attention'
    ) {
      return 'Needs Attention';
    }
    if (key === 'rejected') return 'Rejected';
    return 'Public';
  };

  // State
  const [profile, setProfile] = useState<BrandProfileDto | null>(null);
  const profileRef = useRef<BrandProfileDto | null>(null);
  const catalogInitialSurfaceMarkedRef = useRef(false);
  const catalogBackgroundRefreshActiveRef = useRef(false);
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(useCallback(() => { setIsFocused(true); return () => setIsFocused(false); }, []));
  const [designBackgroundTasks, setDesignBackgroundTasks] = useState<DesignEditorBackgroundTask[]>(
    () => readDesignEditorBackgroundTasks(userId),
  );
  const designBackgroundTasksRef = useRef(designBackgroundTasks);
  designBackgroundTasksRef.current = designBackgroundTasks;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(windowWidth);

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  const [visualActiveTab, setVisualActiveTab] = useState<TabType>(() =>
    routeTab ? normalizeTab(routeTab) : initialCatalogUiStateRef.current?.activeTab ?? 'Collections',
  );
  const [dataActiveTab, setDataActiveTab] = useState<TabType>(visualActiveTab);
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityType>(() =>
    routeVisibility ? normalizeVisibility(routeVisibility) : initialCatalogUiStateRef.current?.visibilityFilter ?? 'Public',
  );
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<CollectionDto | null>(null);
  const [draftDeletePhrase, setDraftDeletePhrase] = useState('');
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [savedCatalogById, setSavedCatalogById] = useState<Record<string, boolean>>({});
  const [savingCatalogById, setSavingCatalogById] = useState<Record<string, boolean>>({});
  const [shareActionsOpen, setShareActionsOpen] = useState(false);
  const createAnchorRef = useRef<View | null>(null);
  const [brandQrOpen, setBrandQrOpen] = useState(false);
  // Keyed by a page identity string, not just TabType: the Collections page's
  // height depends on the active visibility (Public vs Drafts vs Ã¢â‚¬Â¦), so each
  // visibility caches its own measured height. Sharing one Collections height
  // across visibilities left a stale/taller value behind, which is what created
  // the blank scroll space below the last card after switching to Drafts.
  const [tabHeights, setTabHeights] = useState<Record<string, number>>({});
  const tabPagerRef = useRef<Animated.ScrollView>(null);
  const outerScrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef<number>(initialCatalogUiStateRef.current?.scrollY ?? 0);
  const hasRestoredScrollRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeTabRef = useRef(visualActiveTab);
  const visibilityFilterRef = useRef(visibilityFilter);
  const hasInitialScrolledRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = visualActiveTab;
  }, [visualActiveTab]);

  useEffect(() => {
    visibilityFilterRef.current = visibilityFilter;
  }, [visibilityFilter]);

  const completedTaskRefreshKeyRef = useRef<string | null>(null);
  const tabSwipeProgress = useSharedValue(TAB_ORDER.indexOf(visualActiveTab));

  const estimatedPagerHeight = Math.max(360, Math.round(windowHeight * 0.6));

  /**
   * Placeholder height for a tab page that has not been measured yet — and only
   * until then.
   *
   * This used to be applied unconditionally as `minHeight` on every page, which
   * meant `onLayout` could never report anything below 60% of the window: an
   * empty catalogue measured as tall as a full one, the pager inherited that
   * height, and the outer ScrollView always had more content than viewport. That
   * is why an empty catalogue still scrolled. Dropping the floor once a real
   * measurement exists lets the page size to its content; the outer ScrollView
   * takes over on its own as soon as the content genuinely outgrows the screen,
   * so nothing is clipped at the top end.
   */
  const unmeasuredPageMinHeight = useCallback(
    (key: string) => (tabHeights[key] === undefined ? estimatedPagerHeight : undefined),
    [estimatedPagerHeight, tabHeights],
  );
  const visualTabKey = visualActiveTab === 'Collections' ? `Collections:${visibilityFilter}` : visualActiveTab;
  const dataTabKey = dataActiveTab === 'Collections' ? `Collections:${visibilityFilter}` : dataActiveTab;
  const targetHeight = tabHeights[visualTabKey];
  const currentHeight = tabHeights[dataTabKey];

  const activeTabPagerHeight = isTabTransitioning
    ? Math.max(currentHeight ?? estimatedPagerHeight, targetHeight ?? estimatedPagerHeight, estimatedPagerHeight)
    : (targetHeight ?? currentHeight ?? estimatedPagerHeight);

  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(
    () => new Set<TabType>(routeProductId ? ['Collections', 'Shop'] : [visualActiveTab]),
  );

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(dataActiveTab)) return current;
      const next = new Set(current);
      next.add(dataActiveTab);
      return next;
    });
  }, [dataActiveTab]);

  useEffect(() => {
    if (routeProductId) {
      setMountedTabs((current) => {
        if (current.has('Shop')) return current;
        const next = new Set(current);
        next.add('Shop');
        return next;
      });
    }
  }, [routeProductId]);

  useEffect(() => {
    navPerf.screenMounted('tabs→catalog');
    navPerf.shellVisible('tabs→catalog');
    navPerf.firstVisibleUi('tabs→catalog');
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Patching is a REGULAR-user-only action. The backend `patches/check` endpoint
  // is guarded by UserTypeGuard(REGULAR) and 403s for BRAND/owner/guest viewers,
  // which surfaced as a runtime "Endpoint requires user type REGULAR" error.
  // Only call it when the current viewer is an authenticated REGULAR user who is
  // not the owner of this brand.
  const patchEnabled = Boolean(
    deferredWorkReady && !isOwner && status === 'authenticated' && userType === 'REGULAR' && targetBrandId,
  );
  const {
    isPatched,
    loading: patchLoading,
    refresh: refreshPatchStatus,
    toggle: togglePatchStatus,
  } = useBrandPatchStatus({
    brandId: patchEnabled ? targetBrandId : undefined,
    enabled: patchEnabled,
  });

  const getCollectionOwnerId = useCallback(
    (sourceProfile?: BrandProfileDto | null) =>
      sourceProfile?.id ?? profileRef.current?.id ?? (isOwner ? userId : targetBrandId),
    [isOwner, targetBrandId, userId],
  );

  const profileQuery = useBrandProfileQuery(targetBrandId, { enabled: Boolean(targetBrandId) });
  const collectionOwnerId = getCollectionOwnerId(profileQuery.data !== undefined ? profileQuery.data : profile);
  const reviewStatusFilter = REVIEW_VISIBILITY_STATUS[visibilityFilter];
  const collectionVisibility = visibilityFilter === 'Drafts' || reviewStatusFilter
    ? undefined
    : visibilityFilter.toUpperCase() as 'PUBLIC' | 'PRIVATE';
  const collectionStatusFilter = visibilityFilter === 'Drafts'
    ? 'DRAFT'
    : reviewStatusFilter ?? 'PUBLISHED';
  const collectionsQuery = useBrandCollectionsQuery(
    {
      ownerId: collectionOwnerId,
      scope: 'all',
      visibility: collectionVisibility,
      status: collectionStatusFilter,
      limit: 80,
    },
    {
      enabled:
        Boolean(collectionOwnerId) &&
        visibilityFilter !== 'Drafts' &&
        visibilityFilter !== 'Needs Attention' &&
        visibilityFilter !== 'In Review',
    },
  );
  /**
   * These CANNOT be gated on the active tab.
   *
   * They were, as a network economy — but the tab bar renders each bucket's
   * COUNT from these very queries, so gating them on `visibilityFilter` meant a
   * bucket's count was unknowable until you had already opened it. On first
   * route every count read 0, and tapping Drafts fetched, re-laid-out, and
   * popped a card into what had rendered as an empty tab a frame earlier. The
   * counts exist precisely so you don't have to open a tab to see what's in it.
   *
   * The economy concern was real, so it is paid for differently: `staleTime`
   * keeps re-entry inside the window free, which is the common case (the owner
   * bouncing in and out of their own catalog) — rather than making the first
   * load wrong.
   */
  const ownerBucketsEnabled = isOwner && Boolean(collectionOwnerId);
  const draftsQuery = useBrandDraftsQuery({
    ownerId: collectionOwnerId,
    enabled: ownerBucketsEnabled,
  });
  const needsAttentionQuery = useBrandNeedsAttentionQuery({ isFocused,
    ownerId: collectionOwnerId,
    enabled: ownerBucketsEnabled,
  });
  const inReviewQuery = useBrandInReviewQuery({ isFocused,
    ownerId: collectionOwnerId,
    enabled: ownerBucketsEnabled,
  });
  const effectiveProfile = profileQuery.data !== undefined ? profileQuery.data : profile;
  let effectiveCollections = collectionsQuery.data ?? EMPTY_COLLECTIONS;
  if (visibilityFilter === 'Drafts') {
    effectiveCollections = draftsQuery.data ?? EMPTY_COLLECTIONS;
  } else if (visibilityFilter === 'Needs Attention') {
    effectiveCollections = needsAttentionQuery.data ?? EMPTY_COLLECTIONS;
  } else if (visibilityFilter === 'In Review') {
    effectiveCollections = inReviewQuery.data ?? EMPTY_COLLECTIONS;
  }
  const effectiveDrafts = draftsQuery.data ?? EMPTY_COLLECTIONS;
  const catalogItemsRef = useRef<CollectionDto[]>([]);
  catalogItemsRef.current = [...effectiveDrafts, ...effectiveCollections];

  const fetchProfile = useCallback(async (options?: { forceRefresh?: boolean }): Promise<BrandProfileDto | null> => {
    if (!targetBrandId) {
      profileRef.current = null;
      setProfile(null);
      return null;
    }

    try {
      const data = options?.forceRefresh
        ? await refreshBrandProfileQuery(queryClient, targetBrandId)
        : profileQuery.data !== undefined
          ? profileQuery.data
          : profileRef.current;
      if (!data) return null;
      profileRef.current = data;
      setProfile(data);
      if (isOwner && data) {
        updateUser({
          firstName: (data as any).firstName,
          lastName: (data as any).lastName,
          username: (data as any).username,
          brandFullName: (data as any).brandFullName,
          phoneNumber: data?.phoneNumber ?? undefined,
          profileImage: (data as any).profileImage,
          profileImageId: (data as any).profileImageId,
          profileImageFile: (data as any).profileImageFile,
          profilePhotoUpdatedAt: (data as any).profilePhotoUpdatedAt,
          bannerImage: (data as any).bannerImage,
          bannerImageId: (data as any).bannerImageId,
          bannerImageFile: (data as any).bannerImageMeta,
        });
      }
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Don't show toast for profile errors on initial load - will show empty state
      return null;
    }
  }, [isOwner, profileQuery.data, queryClient, targetBrandId, updateUser]);

  // Fetch collections
  const fetchCollections = useCallback(async (
    profileOverride?: BrandProfileDto | null,
    options?: { forceRefresh?: boolean },
  ) => {
    const collectionOwnerId = getCollectionOwnerId(profileOverride);
    const profileOwnerId = profileOverride?.id ?? profileRef.current?.id ?? null;

    if (!collectionOwnerId) {
      return;
    }

    try {
      if (visibilityFilter === 'Drafts' && isOwner) {
        const data = options?.forceRefresh
          ? await refreshBrandDraftsQuery(queryClient, collectionOwnerId)
          : draftsQuery.data ?? [];
        catalogDevLog('load', {
          tab: visibilityFilter,
          routeBrandId: targetBrandId,
          profileOwnerId,
          collectionOwnerId,
          ownerId: userId,
          endpoint: '/designs/my/drafts',
          itemCount: data.length,
          status: 'DRAFT',
          visibility: null,
        });
      } else {
        const items = options?.forceRefresh
          ? await refreshBrandCollectionsQuery(queryClient, {
            ownerId: collectionOwnerId,
            scope: 'all',
            visibility: collectionVisibility,
            status: collectionStatusFilter,
            limit: 80,
          })
          : collectionsQuery.data ?? [];
        catalogDevLog('load', {
          tab: visibilityFilter,
          routeBrandId: targetBrandId,
          profileOwnerId,
          collectionOwnerId,
          ownerId: userId,
          endpoint: `/collections/user/${collectionOwnerId}`,
          itemCount: items.length,
          status: collectionStatusFilter,
          visibility: collectionVisibility ?? null,
        });
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
      // Collections error will show empty state
    }
  }, [
    collectionStatusFilter,
    collectionVisibility,
    collectionsQuery.data,
    draftsQuery.data,
    getCollectionOwnerId,
    isOwner,
    queryClient,
    targetBrandId,
    userId,
    visibilityFilter,
  ]);

  useEffect(() => {
    if (profileQuery.data === undefined) return;
    const data = profileQuery.data;
    profileRef.current = data ?? null;
    setProfile(data ?? null);
    if (isOwner && data) {
      updateUser({
        firstName: (data as any).firstName,
        lastName: (data as any).lastName,
        username: (data as any).username,
        brandFullName: (data as any).brandFullName,
        phoneNumber: data?.phoneNumber ?? undefined,
        profileImage: (data as any).profileImage,
        profileImageId: (data as any).profileImageId,
        profileImageFile: (data as any).profileImageFile,
        profilePhotoUpdatedAt: (data as any).profilePhotoUpdatedAt,
        bannerImage: (data as any).bannerImage,
        bannerImageId: (data as any).bannerImageId,
        bannerImageFile: (data as any).bannerImageMeta,
      });
    }
  }, [isOwner, profileQuery.data, updateUser]);

  useEffect(() => {
    if (profileQuery.error) {
      console.error('Error fetching profile:', profileQuery.error);
    }
    if (collectionsQuery.error) {
      console.error('Error fetching collections:', collectionsQuery.error);
    }
    if (draftsQuery.error) {
      console.error('Error fetching drafts:', draftsQuery.error);
    }
  }, [collectionsQuery.error, draftsQuery.error, profileQuery.error]);

  useEffect(() => {
    if (patchEnabled) {
      void refreshPatchStatus({ silent: true });
    }
  }, [patchEnabled, refreshPatchStatus]);

  useEffect(() => {
    if (!deferredWorkReady) return undefined;
    setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
    return subscribeDesignEditorBackgroundTasks(() => {
      setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
    });
  }, [deferredWorkReady, userId]);

  useFocusEffect(
    useCallback(() => {
      setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
    }, [userId]),
  );

  useEffect(() => {
    if (!catalogUiStateKey) return;
    if (lastCatalogUiStateKeyRef.current === catalogUiStateKey) return;

    lastCatalogUiStateKeyRef.current = catalogUiStateKey;
    skipNextCatalogUiPersistRef.current = true;
    const savedUiState = readWarmScreenUiState<CatalogUiLifetimeState>(catalogUiStateKey);
    if (!routeTab && savedUiState?.activeTab) {
      setVisualActiveTab(savedUiState.activeTab);
      setDataActiveTab(savedUiState.activeTab);
    }
    if (!routeVisibility && savedUiState?.visibilityFilter) {
      // Normalize on the way out of storage: state persisted before Changes
      // Requested merged into Needs Attention would otherwise restore a tab
      // that no longer has a chip to show it as selected.
      setVisibilityFilter(normalizeVisibility(savedUiState.visibilityFilter));
    }
  }, [catalogUiStateKey, routeTab, routeVisibility]);

  // Single writer for the catalogue's warm UI lifetime state (active tab, filter,
  // and outer scroll offset). Reads the latest values from refs so the scroll
  // handler can persist without forcing a re-render on every scroll frame.
  const persistCatalogUiState = useCallback(() => {
    if (!catalogUiStateKey) return;
    writeWarmScreenUiState<CatalogUiLifetimeState>(catalogUiStateKey, {
      activeTab: activeTabRef.current,
      visibilityFilter: visibilityFilterRef.current,
      scrollY: scrollYRef.current,
    });
  }, [catalogUiStateKey]);

  useEffect(() => {
    if (!catalogUiStateKey) return;
    if (skipNextCatalogUiPersistRef.current) {
      skipNextCatalogUiPersistRef.current = false;
      return;
    }
    persistCatalogUiState();
  }, [visualActiveTab, catalogUiStateKey, persistCatalogUiState, visibilityFilter]);

  useEffect(() => {
    if (!routeTab) return;
    const tab = normalizeTab(routeTab);
    setVisualActiveTab(tab);
    setDataActiveTab(tab);
  }, [routeTab]);

  useEffect(() => {
    if (routeProductId) {
      setVisualActiveTab('Shop');
      setDataActiveTab('Shop');
    }
  }, [routeProductId]);

  useEffect(() => {
    if (!routeVisibility) return;
    setVisibilityFilter(normalizeVisibility(routeVisibility));
  }, [routeVisibility]);

  // Visitors only ever see published public content. Owner-only sub-filters
  // (Private/Drafts/In Review/Changes Requested/Rejected) must never be selected
  // for a non-owner Ã¢â‚¬â€ force the Public filter so the visitor view cannot request
  // or display owner-only statuses, and the sub-filter bar is hidden below.
  useEffect(() => {
    if (!isOwner && visibilityFilter !== 'Public') {
      setVisibilityFilter('Public');
    }
  }, [isOwner, visibilityFilter]);

  useEffect(() => {
    setIsAvatarModalOpen(false);
  }, [isOwner, targetBrandId]);

  const handleBackNavigation = useCallback(() => {
    // navigate (not replace) on the no-history fallback so the persistent tab
    // shell is reused instead of remounted/refetched.
    backOrNavigate('/(tabs)');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) {
          router.back();
          return true;
        }

        // navigate (not replace) so the persistent tab shell is reused.
        router.navigate('/(tabs)');
        toast.info('Returned to Home. Press back again there to exit.');
        return true;
      });

      return () => subscription.remove();
    }, [toast]),
  );

  useEffect(() => {
    if (containerWidth > 0 && !hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;
      const idx = TAB_ORDER.indexOf(activeTabRef.current);
      if (idx > 0) {
        tabPagerRef.current?.scrollTo({ x: idx * containerWidth, animated: false });
      }
    }
  }, [containerWidth]);

  // Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    const loadedProfile = await fetchProfile({ forceRefresh: true });
    await Promise.all([
      fetchCollections(loadedProfile, { forceRefresh: true }),
      refreshPatchStatus({ force: true, silent: true }),
      // Broad prefix so EVERY collection tab refetches (Public/Private/Drafts/
      // In Review/Changes Requested/Rejected/Needs Attention). Each per-tab query
      // carries its own {scope,status} filter in the key, so a fully-qualified
      // single key (the previous behaviour) silently missed In Review.
      queryClient.invalidateQueries({ queryKey: ['brand', 'collections'] }).catch(() => undefined),
      queryClient.invalidateQueries({ queryKey: queryKeys.store.brandProducts(targetBrandId) }).catch(() => undefined),
      queryClient.invalidateQueries({ queryKey: queryKeys.brand.profile(targetBrandId) }).catch(() => undefined),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.brand(targetBrandId) }).catch(() => undefined),
    ]);
    setIsRefreshing(false);
  };

  const settleTransition = useCallback((nextTab: TabType) => {
    setIsTabTransitioning(false);

    // Clamp scroll offset safely if the new tab is shorter and outer scroll is beyond it
    requestAnimationFrame(() => {
      if (outerScrollRef.current) {
        // Safe height strategy natively handles preventing clamps mid-swipe.
        // Once settled, if outer offset is visually disconnected, it can be nudged here.
      }
    });
  }, []);

  const handleMainTabChange = useCallback(
    (key: string) => {
      const nextTab = key as TabType;
      const index = TAB_ORDER.indexOf(nextTab);
      if (index < 0 || nextTab === activeTabRef.current) return;

      isProgrammaticScrollRef.current = true;
      setIsTabTransitioning(true);
      clearTimeout(programmaticScrollTimeout.current);
      programmaticScrollTimeout.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        settleTransition(nextTab);
      }, 500);

      setVisualActiveTab(nextTab);
      React.startTransition(() => {
        setDataActiveTab(nextTab);
      });

      if (containerWidth > 0) {
        tabPagerRef.current?.scrollTo({ x: index * containerWidth, animated: true });
      }
    },
    [containerWidth, settleTransition],
  );

  const handlePageChangeSync = useCallback((nextIndex: number) => {
    if (!isProgrammaticScrollRef.current) {
      const nextTab = TAB_ORDER[nextIndex];
      if (nextTab && nextTab !== activeTabRef.current) {
        setVisualActiveTab(nextTab);
        setIsTabTransitioning(true);
      }
    }
  }, []);

  const handleTabPagerScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (containerWidth <= 0) return;
      const progress = event.contentOffset.x / containerWidth;
      tabSwipeProgress.value = progress;
      const nextIndex = Math.max(0, Math.min(2, Math.round(progress)));
      runOnJS(handlePageChangeSync)(nextIndex);
    },
  }, [containerWidth, handlePageChangeSync, tabSwipeProgress]);

  const handleTabPagerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isProgrammaticScrollRef.current = false;
      clearTimeout(programmaticScrollTimeout.current);
      if (containerWidth <= 0) return;

      const progress = event.nativeEvent.contentOffset.x / containerWidth;
      const nextIndex = Math.max(0, Math.min(TAB_ORDER.length - 1, Math.round(progress)));
      const nextTab = TAB_ORDER[nextIndex];

      if (nextTab) {
        if (nextTab !== activeTabRef.current) {
          setVisualActiveTab(nextTab);
        }
        React.startTransition(() => {
          setDataActiveTab(nextTab);
        });
        settleTransition(nextTab);
      }
    },
    [containerWidth, settleTransition],
  );

  const handleTabPagerScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // If the user drags and releases without momentum, it will not fire momentumEnd.
      if (!event.nativeEvent.velocity || (event.nativeEvent.velocity.x === 0 && event.nativeEvent.velocity.y === 0)) {
        handleTabPagerMomentumEnd(event);
      }
    },
    [handleTabPagerMomentumEnd],
  );

  const handleTabPageLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height <= 0) return;

    setTabHeights((current) => (
      current[key] === height ? current : { ...current, [key]: height }
    ));
  }, []);

  // Track the outer vertical scroll offset (cheap ref write Ã¢â‚¬â€ no re-render) and
  // persist it to warm UI state when scrolling settles, so a warm return can
  // restore the exact reading position.
  const handleOuterScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleOuterScrollSettled = useCallback(() => {
    persistCatalogUiState();
  }, [persistCatalogUiState]);

  // Restore the saved vertical scroll position once the content is tall enough to
  // accept it (active tab height measured + container width known). Runs once.
  useEffect(() => {
    if (hasRestoredScrollRef.current) return;
    const targetY = initialCatalogUiStateRef.current?.scrollY ?? 0;
    if (targetY <= 0) {
      hasRestoredScrollRef.current = true;
      return;
    }
    if (containerWidth <= 0 || !activeTabPagerHeight) return;
    hasRestoredScrollRef.current = true;
    requestAnimationFrame(() => {
      outerScrollRef.current?.scrollTo({ y: targetY, animated: false });
    });
  }, [activeTabPagerHeight, containerWidth]);

  // Handle patch/unpatch
  const handlePatch = async () => {
    if (!targetBrandId || patchLoading) return;
    try {
      const nextPatched = await togglePatchStatus();
      toast.success(nextPatched ? 'Brand patched.' : 'Unpatched brand.');
    } catch {
      toast.error('Could not update patch status. Please try again.');
    }
  };

  // Handle collection actions
  const handleCollectionPress = useCallback((collection: CollectionDto) => {
    if (collection.clientStatus) {
      return;
    }

    // Published content opens in the SAME viewer the shop uses — the immersive
    // full-bleed media stage with the collapsible metadata dock — rather than
    // the separate catalog detail screen. One review surface for brands and
    // shoppers means one place to fix, and a brand sees their piece exactly as a
    // shopper will.
    //
    // Unfinished work opens the EDITOR, not a viewer — matching web.
    //
    // A draft, or anything a reviewer has handed back, exists precisely because
    // it is not done. Opening a read-only stage for it offers the one thing the
    // owner cannot use: a preview of something they came to finish. Tapping the
    // card now lands where the work continues, and publishing/resubmitting is
    // reachable from there.
    const ownerStatus = String(collection.publicationStatus ?? collection.status ?? '').toUpperCase();
    /**
     * The editor is for work the owner can still CHANGE.
     *
     * DRAFT, CHANGES_REQUESTED and REJECTED are handed back to the brand to
     * edit; FAILED is a publish that has to be re-submitted, which also starts
     * in the editor. Everything else — IN_REVIEW, PUBLISHED, PRIVATE, ARCHIVED
     * — opens the viewer, because there is nothing to edit: a design under
     * review must not be mutable mid-review, and opening the editor on it
     * invites a change that would silently invalidate the submission.
     *
     * The tab is a FALLBACK only, for when the payload carries no usable
     * status. It must not override a known one: Needs Attention holds
     * PROCESSING alongside CHANGES_REQUESTED, and treating the bucket as
     * authoritative would open the editor on a design that is still uploading.
     */
    const EDITABLE_STATUSES = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED', 'FAILED'];
    const VIEWER_STATUSES = ['IN_REVIEW', 'PUBLISHED', 'PROCESSING', 'ARCHIVED', 'REMOVED'];
    const opensInEditor = EDITABLE_STATUSES.includes(ownerStatus)
      ? true
      : VIEWER_STATUSES.includes(ownerStatus)
        ? false
        : // Status absent or unrecognized — fall back to what the tab implies.
          visibilityFilter === 'Drafts';

    if (isOwner && opensInEditor) {
      drillDownPush({
        pathname: '/designs/[designId]/edit',
        params: { designId: collection.id },
      } as any);
      return;
    }

    drillDownPush(
      collection.isAvailableInStore
        ? ({ pathname: '/collection-viewer', params: { collectionId: collection.id } } as any)
        : ({
            pathname: '/market-viewer',
            params: {
              sourceType: 'DESIGN',
              sourceId: collection.id,
              title: collection.title ?? '',
              // The card's cover is already decoded and cached on this screen —
              // handing it over lets the viewer paint the image on the first
              // frame instead of holding a spinner for the detail request.
              coverImage: collection.coverImage ?? '',
              coverFileId: collection.coverFileId ?? '',
            },
          } as any),
    );
  }, [isOwner, visibilityFilter]);

  const handleEditCollection = useCallback((id: string) => {
    drillDownPush({
      pathname: '/designs/[designId]/edit',
      params: { designId: id },
    } as any);
  }, []);

  // Dismiss a failed publish/draft background task from the Needs-attention banner.
  const handleDismissFailedTask = useCallback((taskId: string) => {
    removeDesignEditorBackgroundTask(taskId);
    setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
  }, [userId]);

  // Retry a failed publish/draft: route to the editor pre-populated with the
  // previous design when we have its id, otherwise open a fresh composer. Touching
  // the task resets its 24-hour cleanup clock so the failure reason remains
  // available while the creator acts on it.
  const handleRetryFailedTask = useCallback(
    (task: DesignEditorBackgroundTask) => {
      touchDesignEditorBackgroundTask(task.id);
      setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
      if (task.designId) {
        drillDownPush({
          pathname: '/designs/[designId]/edit',
          params: { designId: task.designId, recoveryTaskId: task.id },
        } as any);
        return;
      }
      drillDownPush({
        pathname: '/catalog/create-design/composer',
        params: { recoveryTaskId: task.id, blank: '1' },
      } as any);
    },
    [userId],
  );

  const handleRetryFailedCollection = useCallback(
    (collection: CollectionDto) => {
      const taskId = collection.clientTaskId ?? collection.id;
      const task = designBackgroundTasksRef.current.find((entry) => entry.id === taskId);
      if (task) {
        handleRetryFailedTask(task);
      }
    },
    [handleRetryFailedTask],
  );

  const handleDismissFailedCollection = useCallback(
    (collection: CollectionDto) => {
      handleDismissFailedTask(collection.clientTaskId ?? collection.id);
    },
    [handleDismissFailedTask],
  );

  const handleDeleteCollection = useCallback((id: string) => {
    const target = catalogItemsRef.current.find((collection) => collection.id === id);
    setDraftDeleteTarget(target ?? ({ id, title: 'Untitled collection' } as CollectionDto));
    setDraftDeletePhrase('');
  }, []);

  const confirmDraftDelete = useCallback(async () => {
    if (!draftDeleteTarget || draftDeletePhrase !== 'DELETE' || draftDeleteBusy) return;

    const deletedId = draftDeleteTarget.id;
    const querySnapshots = queryClient.getQueriesData<CollectionDto[]>({
      queryKey: BRAND_COLLECTIONS_QUERY_ROOT,
    });

    setDraftDeleteBusy(true);
    void queryClient.cancelQueries({ queryKey: BRAND_COLLECTIONS_QUERY_ROOT }).catch(() => undefined);
    setSavedCatalogById((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, deletedId)) return current;
      const next = { ...current };
      delete next[deletedId];
      return next;
    });
    queryClient.setQueriesData<CollectionDto[]>(
      { queryKey: BRAND_COLLECTIONS_QUERY_ROOT },
      (current) => removeCollectionFromList(current, deletedId),
    );
    setDraftDeleteTarget(null);
    setDraftDeletePhrase('');

    try {
      await brandApi.deleteDesign(deletedId);
      void queryClient.invalidateQueries({
        queryKey: BRAND_COLLECTIONS_QUERY_ROOT,
        refetchType: 'inactive',
      }).catch(() => undefined);
      toast.success(visibilityFilter === 'Drafts' ? 'Draft deleted.' : 'Collection deleted.');
    } catch {
      querySnapshots.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error('Could not delete this collection. Please try again.');
    } finally {
      setDraftDeleteBusy(false);
    }
  }, [
    draftDeleteBusy,
    draftDeletePhrase,
    draftDeleteTarget,
    queryClient,
    toast,
    visibilityFilter,
  ]);

  const ownerAvatar = useMemo(() => resolveProfileImageSource(effectiveProfile as any), [effectiveProfile]);
  const visitorAvatar = useMemo(() => resolveProfileImageSource(effectiveProfile as any), [effectiveProfile]);
  const visitorBanner = useMemo(() => resolveBannerImageSource(effectiveProfile as any), [effectiveProfile]);
  const ownerAvatarUri = useResolvedImageUri({
    src: ownerAvatar.src ?? undefined,
    fileId: ownerAvatar.fileId ?? undefined,
    allowSignedFallback: true,
  });
  const visitorAvatarUri = useResolvedImageUri({
    src: visitorAvatar.src ?? undefined,
    fileId: visitorAvatar.fileId ?? undefined,
    allowSignedFallback: false,
  });
  const modalAvatarUri = isOwner
    ? ownerAvatarUri ?? ownerAvatar.src ?? null
    : visitorAvatarUri ?? visitorAvatar.src ?? null;
  const profileUsername = useMemo(
    () => resolveCatalogBrandUsername(effectiveProfile),
    [effectiveProfile],
  );
  const profileDisplayName = useMemo(
    () => resolveCatalogBrandDisplayName(effectiveProfile),
    [effectiveProfile],
  );
  const profileLocation = useMemo(
    () => resolveCatalogBrandLocation(effectiveProfile),
    [effectiveProfile],
  );
  const profileTags = useMemo(
    () => resolveCatalogBrandTags(effectiveProfile),
    [effectiveProfile],
  );
  const profileShareUrl = useMemo(
    () =>
      effectiveProfile?.shareUrl ??
      effectiveProfile?.publicProfileUrl ??
      effectiveProfile?.qrTargetUrl ??
      buildProfileUrlFromConfig(
        targetBrandId,
        profileUsername || effectiveProfile?.username || user?.username || null,
      ),
    [
      effectiveProfile?.publicProfileUrl,
      effectiveProfile?.qrTargetUrl,
      effectiveProfile?.shareUrl,
      effectiveProfile?.username,
      profileUsername,
      targetBrandId,
      user?.username,
    ],
  );
  const profileQrTargetUrl = useMemo(
    () =>
      effectiveProfile?.qrTargetUrl ??
      effectiveProfile?.publicProfileUrl ??
      effectiveProfile?.shareUrl ??
      profileShareUrl,
    [effectiveProfile?.publicProfileUrl, effectiveProfile?.qrTargetUrl, effectiveProfile?.shareUrl, profileShareUrl],
  );
  const profileShareMessage = useMemo(() => {
    if (!profileShareUrl) return undefined;
    return `Check out ${effectiveProfile?.brandFullName || 'this brand'} on WIEZ: ${profileShareUrl}`;
  }, [effectiveProfile?.brandFullName, profileShareUrl]);

  const applyProfilePhotoViewState = useCallback(
    (nextState: NonNullable<BrandProfileDto['profilePhotoViewState']>) => {
      if (!targetBrandId) return;
      setProfile((current) => {
        const next = current
          ? {
              ...current,
              profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
              profilePhotoViewState: nextState,
            }
          : current;
        profileRef.current = next;
        return next;
      });
      queryClient.setQueryData(
        queryKeys.brand.profile(targetBrandId),
        (current: BrandProfileDto | null | undefined) =>
          current
            ? {
                ...current,
                profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
                profilePhotoViewState: nextState,
              }
            : current,
      );
      brandApi.invalidateBrandProfileCache(targetBrandId);
    },
    [queryClient, targetBrandId],
  );

  /**
   * The user id that owns this profile photo.
   *
   * `targetBrandId` comes off the route and may be a Brand-table id;
   * `GET /brands/:id` resolves either form, but `/users/:id/profile-photo-view`
   * does not. The brand profile response always carries the owner's user id, so
   * prefer it and keep the route param only as a fallback.
   */
  const profilePhotoOwnerId = effectiveProfile?.id ?? null;

  const handleViewOwnerAvatar = useCallback(() => {
    if (!ownerAvatarUri && !ownerAvatar.src) {
      return;
    }

    setIsAvatarModalOpen(true);

    if (!targetBrandId || !effectiveProfile?.profilePhotoViewState?.canMarkViewed) {
      return;
    }

    // The route param may be a Brand-table id, but this endpoint keys on the
    // OWNER's user id — /brands/:id accepts either, /users/:id does not, which
    // is why this logged "User not found" 404s on every avatar open. The
    // profile response's own id is always the owner.
    void ProfilePhotoViewApi.markViewed(profilePhotoOwnerId ?? targetBrandId)
      .then(applyProfilePhotoViewState)
      .catch((error) => {
        console.error('Failed to mark profile photo viewed', error);
      });
  }, [
    applyProfilePhotoViewState,
    effectiveProfile?.profilePhotoViewState,
    profilePhotoOwnerId,
    ownerAvatar.src,
    ownerAvatarUri,
    targetBrandId,
  ]);

  const handleViewVisitorAvatar = useCallback(() => {
    if (visitorAvatarUri || visitorAvatar.src) {
      setIsAvatarModalOpen(true);
    }
    if (!targetBrandId || !effectiveProfile?.profilePhotoViewState?.canMarkViewed) {
      return;
    }
    // The route param may be a Brand-table id, but this endpoint keys on the
    // OWNER's user id — /brands/:id accepts either, /users/:id does not, which
    // is why this logged "User not found" 404s on every avatar open. The
    // profile response's own id is always the owner.
    void ProfilePhotoViewApi.markViewed(profilePhotoOwnerId ?? targetBrandId)
      .then(applyProfilePhotoViewState)
      .catch((error) => {
        console.error('Failed to mark profile photo viewed', error);
      });
  }, [
    applyProfilePhotoViewState,
    effectiveProfile?.profilePhotoViewState,
    profilePhotoOwnerId,
    targetBrandId,
    visitorAvatar.src,
    visitorAvatarUri,
  ]);

  // Handle share
  const handleNativeShareProfile = useCallback(async () => {
    if (!profileShareUrl || !profileShareMessage) {
      toast.error('Profile link is not available yet.');
      return;
    }

    try {
      await Share.share({
        message: profileShareMessage,
        url: profileShareUrl,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  }, [profileShareMessage, profileShareUrl, toast]);

  const handleCopyProfileLink = useCallback(async () => {
    if (!profileShareUrl) {
      toast.error('Profile link is not available yet.');
      return;
    }

    await Clipboard.setStringAsync(profileShareUrl);
    toast.success('Profile link copied.');
  }, [profileShareUrl, toast]);

  const currentCollections = visibilityFilter === 'Drafts' ? effectiveDrafts : effectiveCollections;
  const visibleDesignBackgroundTasks = useMemo(() => {
    if (!isOwner || dataActiveTab !== 'Collections') return [];

    return designBackgroundTasks.filter((task) => {
      if (visibilityFilter === 'Needs Attention') return task.status === 'failed';
      if (visibilityFilter === 'Drafts' && task.action === 'draft') return true;
      if (
        visibilityFilter === 'In Review' &&
        task.action === 'publish' &&
        (task.status === 'running' || task.status === 'complete' || task.status === 'failed')
      ) {
        return true;
      }
      // Do not leak optimistic PROCESSING/FAILED into Public or Private.
      return false;
    });
  }, [dataActiveTab, designBackgroundTasks, isOwner, visibilityFilter]);
  // Failed publish/draft attempts must NEVER render as cards in the Public/Private
  // grid. In Review intentionally keeps failed publish cards visible with a reason
  // and Retry/Edit controls so failed uploads do not disappear.
  const failedDesignTasks = useMemo(
    () =>
      visibilityFilter === 'Needs Attention'
        ? visibleDesignBackgroundTasks.filter((task) => task.status === 'failed')
        : [],
    [visibilityFilter, visibleDesignBackgroundTasks],
  );
  const renderedDesignBackgroundTasks = visibleDesignBackgroundTasks;
  const backgroundTaskCollectionCacheRef = useRef(new Map<string, {
    task: DesignEditorBackgroundTask;
    contextKey: string;
    collection: CollectionDto;
  }>());
  const backgroundTaskCollections = useMemo<CollectionDto[]>(
    () => {
      const contextKey = [
        effectiveProfile?.brandFullName,
        effectiveProfile?.username,
        effectiveProfile?.profileImage,
        effectiveProfile?.profileImageId,
        effectiveProfile?.logoImageId,
        ownerAvatarUri,
        targetBrandId,
        userId,
      ].join('|');
      const activeTaskIds = new Set(renderedDesignBackgroundTasks.map((task) => task.id));
      backgroundTaskCollectionCacheRef.current.forEach((_value, taskId) => {
        if (!activeTaskIds.has(taskId)) backgroundTaskCollectionCacheRef.current.delete(taskId);
      });

      return renderedDesignBackgroundTasks.map((task) => {
        const cached = backgroundTaskCollectionCacheRef.current.get(task.id);
        if (cached?.task === task && cached.contextKey === contextKey) {
          return cached.collection;
        }
        const collection: CollectionDto = {
          // Prefer the DESIGN id the moment the server hands one back, and fall
          // back to the local task id only before that.
          //
          // This is the card's list key. Keying it to the task id meant the key
          // CHANGED when the task retired and the real row took over — same
          // picture, new identity — so the list unmounted the card and mounted a
          // fresh one, re-resolving the image. That is the flash owners see when
          // an upload completes. Sharing the id makes the handoff a reconcile:
          // the row updates in place and nothing remounts.
          //
          // Safe against double cards because the merge below filters server
          // collections whose id matches a task's designId, so exactly one card
          // for this design exists at any moment either way.
          id: task.designId ?? task.id,
          entityType: 'DESIGN',
          title: task.title,
          description: task.error ?? task.message,
          visibility: task.visibility,
          status: task.status === 'failed' ? 'FAILED' : task.action === 'draft' ? 'DRAFT' : 'IN_REVIEW',
          publicationStatus: task.status === 'failed' ? 'FAILED' : task.action === 'draft' ? 'DRAFT' : 'IN_REVIEW',
          coverImage: task.previewUri ?? null,
          coverFileId: null,
          likesCount: 0,
          commentsCount: 0,
          itemCount: task.previewUri ? 1 : 0,
          postsCount: task.previewUri ? 1 : 0,
          minPrice: 0,
          maxPrice: 0,
          saleMinPrice: null,
          saleMaxPrice: null,
          saleStartAt: null,
          saleEndAt: null,
          brandName: effectiveProfile?.brandFullName ?? effectiveProfile?.username ?? null,
          username: effectiveProfile?.username ?? null,
          brandLogo: ownerAvatarUri ?? effectiveProfile?.profileImage ?? null,
          brandLogoFileId: effectiveProfile?.profileImageId ?? effectiveProfile?.logoImageId ?? null,
          isAvailableInStore: false,
          ownerId: userId ?? targetBrandId ?? '',
          createdAt: new Date(task.startedAt).toISOString(),
          updatedAt: new Date(task.updatedAt).toISOString(),
          clientStatus: task.status === 'failed' ? 'publish-failed' : 'publishing',
          clientStatusMessage: task.message,
          clientProgress: task.progress,
          clientTaskId: task.id,
          clientFailureReason: task.error ?? null,
        };
        backgroundTaskCollectionCacheRef.current.set(task.id, { task, contextKey, collection });
        return collection;
      });
    },
    [renderedDesignBackgroundTasks, effectiveProfile, ownerAvatarUri, targetBrandId, userId],
  );
  const currentCollectionsWithBackgroundTasks = useMemo(() => {
    if (backgroundTaskCollections.length === 0) return currentCollections;

    const taskDesignIds = new Set(
      renderedDesignBackgroundTasks
        .map((task) => task.designId)
        .filter((id): id is string => Boolean(id)),
    );

    return [
      ...backgroundTaskCollections,
      ...currentCollections.filter((collection) => !taskDesignIds.has(collection.id)),
    ];
  }, [renderedDesignBackgroundTasks, backgroundTaskCollections, currentCollections]);
  const currentCollectionsRef = useRef(currentCollectionsWithBackgroundTasks);
  currentCollectionsRef.current = currentCollectionsWithBackgroundTasks;
  const savedCatalogIds = useMemo(
    () =>
      Array.from(
        new Set(
          currentCollectionsWithBackgroundTasks
            .map((collection) => collection.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ).sort(),
    [currentCollectionsWithBackgroundTasks],
  );
  const savedCatalogIdsKey = savedCatalogIds.join('|');
  const savedCatalogIdsRef = useRef(savedCatalogIds);
  savedCatalogIdsRef.current = savedCatalogIds;
  const savedCatalogByIdRef = useRef(savedCatalogById);
  savedCatalogByIdRef.current = savedCatalogById;

  const statusCounts = useMemo(() => {
    const countWithTasks = (
      serverItems: CollectionDto[],
      taskPredicate: (task: DesignEditorBackgroundTask) => boolean,
    ) => {
      const ids = new Set(serverItems.map((item) => item.id));
      let count = ids.size;
      designBackgroundTasks.forEach((task) => {
        if (!taskPredicate(task)) return;
        if (task.designId && ids.has(task.designId)) return;
        count += 1;
      });
      return count;
    };

    return {
      drafts: countWithTasks(effectiveDrafts, (task) => task.action === 'draft'),
      inReview: countWithTasks(
        inReviewQuery.data ?? [],
        (task) => task.action === 'publish',
      ),
      needsAttention: countWithTasks(
        needsAttentionQuery.data ?? [],
        (task) => task.status === 'failed',
      ),
    };
  }, [designBackgroundTasks, effectiveDrafts, inReviewQuery.data, needsAttentionQuery.data]);

  useEffect(() => {
    // Reset via functional update returning `prev` when already empty so a
    // no-op reset never triggers a re-render (guards against update loops).
    const resetIfNeeded = () =>
      setSavedCatalogById((prev) => (Object.keys(prev).length === 0 ? prev : {}));

    if (isOwner || status !== 'authenticated') {
      resetIfNeeded();
      return;
    }

    // Read the ids from the ref: depending on the array identity re-fires this
    // effect every render while queries are loading/failing (`?? []` churn).
    const ids = savedCatalogIdsRef.current;
    if (ids.length === 0) {
      resetIfNeeded();
      return;
    }

    let cancelled = false;
    queryClient.fetchQuery({
      queryKey: queryKeys.saved.batch('COLLECTION', savedCatalogIds),
      queryFn: () => SavedItemsApi.checkBatch('COLLECTION', ids),
      staleTime: WIEZ_SAVED_STATUS_STALE_TIME_MS,
    })
      .then((result) => {
        if (cancelled) return;
        setSavedCatalogById(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isOwner, queryClient, savedCatalogIdsKey, status]);

  useEffect(() => {
    const completedVisibleTasks = visibleDesignBackgroundTasks.filter((task) => task.status === 'complete');
    if (completedVisibleTasks.length === 0) return;
    const completedTaskIds = completedVisibleTasks.map((task) => task.id).sort();
    const refreshKey = `${visibilityFilter}:${completedTaskIds.join('|')}`;
    if (completedTaskRefreshKeyRef.current === refreshKey) return;
    completedTaskRefreshKeyRef.current = refreshKey;

    let cancelled = false;
    void (async () => {
      try {
        await fetchCollections(undefined, { forceRefresh: true });
        if (cancelled) return;
        completedVisibleTasks.forEach((task) => removeDesignEditorBackgroundTask(task.id));
        setDesignBackgroundTasks(readDesignEditorBackgroundTasks(userId));
      } catch {
        if (!cancelled) {
          completedTaskRefreshKeyRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (completedTaskRefreshKeyRef.current === refreshKey) {
        completedTaskRefreshKeyRef.current = null;
      }
    };
  }, [fetchCollections, userId, visibilityFilter, visibleDesignBackgroundTasks]);

  const headerStats = useMemo<BrandHeaderStat[]>(() => {
    const backendDesigns = readMetricNumber(effectiveProfile?.designsCount) ?? readMetricNumber(effectiveProfile?.collectionsCount);
    const localDesigns = Math.max(effectiveCollections.length, currentCollectionsWithBackgroundTasks.length);
    const designsCount = backendDesigns ?? localDesigns;
    const patchesCount = readMetricNumber(effectiveProfile?.patchesCount) ?? readMetricNumber(effectiveProfile?.followersCount) ?? 0;
    const totalThreads = readMetricNumber(effectiveProfile?.totalThreads) ?? readMetricNumber(effectiveProfile?.totalLikes) ?? 0;
    const totalReviews = readMetricNumber(effectiveProfile?.totalReviews) ?? 0;
    const stats: BrandHeaderStat[] = [];

    stats.push({ value: formatCount(patchesCount), label: patchesCount === 1 ? 'Patch' : 'Patches' });

    if (Number.isFinite(designsCount)) {
      stats.push({ value: formatCount(designsCount), label: designsCount === 1 ? 'Design' : 'Designs' });
    }

    stats.push({ value: formatCount(totalThreads), label: totalThreads === 1 ? 'Thread' : 'Threads' });

    stats.push({ value: formatCount(totalReviews), label: totalReviews === 1 ? 'Review' : 'Reviews' });

    return stats.slice(0, 4);
  }, [
    effectiveCollections.length,
    currentCollectionsWithBackgroundTasks.length,
    effectiveProfile?.collectionsCount,
    effectiveProfile?.designsCount,
    effectiveProfile?.followersCount,
    effectiveProfile?.patchesCount,
    effectiveProfile?.totalLikes,
    effectiveProfile?.totalThreads,
    effectiveProfile?.totalReviews,
  ]);
  const headerContactItems = useMemo<BrandHeaderContactItem[]>(() => {
    // Account email is owner-only (public brand API redacts it for visitors).
    // Never surface another account's email on a scanned/shared brand profile.
    const candidates: BrandHeaderContactItem[] = [
      ...(isOwner
        ? [{ label: 'Email', value: readContactValue(effectiveProfile?.email) ?? '' }]
        : []),
      { label: 'Phone', value: readContactValue(effectiveProfile?.phoneNumber) ?? '' },
      { label: 'Website', value: readContactValue(effectiveProfile?.socialWebsite) ?? '' },
      { label: 'Instagram', value: readContactValue(effectiveProfile?.socialInstagram) ?? '' },
      { label: 'Facebook', value: readContactValue(effectiveProfile?.socialFacebook) ?? '' },
      { label: 'X', value: readContactValue(effectiveProfile?.socialTwitter) ?? '' },
    ];

    return candidates.filter((item) => item.value.length > 0);
  }, [
    effectiveProfile?.email,
    effectiveProfile?.phoneNumber,
    effectiveProfile?.socialFacebook,
    effectiveProfile?.socialInstagram,
    effectiveProfile?.socialTwitter,
    effectiveProfile?.socialWebsite,
    isOwner,
  ]);
  const headerBadges = useMemo(
    () =>
      getBrandBadges({
        brandVerified: Boolean(effectiveProfile?.verified || effectiveProfile?.verificationBadgeVisible),
        storeVerified: effectiveProfile?.verificationStatus === 'APPROVED',
        isStoreOpen: effectiveProfile?.isStoreOpen,
        storeStatus: effectiveProfile?.storeStatus,
        verificationStatus: effectiveProfile?.verificationStatus,
      }),
    [
      effectiveProfile?.isStoreOpen,
      effectiveProfile?.storeStatus,
      effectiveProfile?.verificationBadgeVisible,
      effectiveProfile?.verificationStatus,
      effectiveProfile?.verified,
    ],
  );
  const profileInitialLoading = profileQuery.isLoading && !effectiveProfile && !profileRef.current;
  const listInitialLoading = visibilityFilter === 'Drafts'
    ? draftsQuery.isLoading && effectiveDrafts.length === 0
    : visibilityFilter === 'Needs Attention'
      ? needsAttentionQuery.isLoading && effectiveCollections.length === 0
      : visibilityFilter === 'In Review'
        ? inReviewQuery.isLoading && effectiveCollections.length === 0
        : collectionsQuery.isLoading && effectiveCollections.length === 0;
  const activeListFetching = visibilityFilter === 'Drafts'
    ? draftsQuery.isFetching
    : visibilityFilter === 'Needs Attention'
      ? needsAttentionQuery.isFetching
      : visibilityFilter === 'In Review'
        ? inReviewQuery.isFetching
        : collectionsQuery.isFetching;
  // Warm return must never flash a skeleton. The skeleton is reserved for a
  // genuine cold load where neither the profile nor the active grid has data.
  const hasCachedCatalogContent =
    Boolean(effectiveProfile) ||
    effectiveCollections.length > 0 ||
    effectiveDrafts.length > 0;
  const showInitialSkeleton =
    !hasCachedCatalogContent &&
    Boolean(
      targetBrandId &&
      (profileInitialLoading || listInitialLoading),
    );
  const overlayScrollPadding = standardScreenBottomPadding;
  const shouldMountShopTab = mountedTabs.has('Shop') || Boolean(routeProductId);
  const shouldMountReviewsTab = mountedTabs.has('Reviews');

  useEffect(() => {
    if (!catalogInitialSurfaceMarkedRef.current) {
      catalogInitialSurfaceMarkedRef.current = true;
      if (showInitialSkeleton) {
        navPerf.mark('cache_miss', 'tabs→catalog');
        navPerf.mark('cold_skeleton_rendered', 'tabs→catalog');
      } else if (hasCachedCatalogContent) {
        navPerf.mark('cache_hit', 'tabs→catalog');
        navPerf.mark('stale_ui_rendered', 'tabs→catalog');
        navPerf.mark('cached_or_empty_state_visible', 'tabs→catalog');
      } else {
        navPerf.mark('cached_or_empty_state_visible', 'tabs→catalog');
      }
    }
    if (!showInitialSkeleton && !profileInitialLoading && !listInitialLoading) {
      navPerf.dataReady('tabs→catalog');
    }
  }, [hasCachedCatalogContent, listInitialLoading, profileInitialLoading, showInitialSkeleton]);

  useEffect(() => {
    const refreshingCachedUi = hasCachedCatalogContent && (profileQuery.isFetching || activeListFetching);
    if (refreshingCachedUi && !catalogBackgroundRefreshActiveRef.current) {
      catalogBackgroundRefreshActiveRef.current = true;
      navPerf.mark('background_refresh_started', 'tabs→catalog');
      return;
    }
    if (!refreshingCachedUi && catalogBackgroundRefreshActiveRef.current) {
      catalogBackgroundRefreshActiveRef.current = false;
      navPerf.mark('background_refresh_completed', 'tabs→catalog');
    }
  }, [activeListFetching, hasCachedCatalogContent, profileQuery.isFetching]);

  // Tab configuration — UI labels only; keys stay Collections for routing/state.
  const tabs = [
    { key: 'Collections', label: isOwner ? 'My Content' : 'Content' },
    { key: 'Shop', label: 'Shop' },
    { key: 'Reviews', label: 'Reviews' },
  ];

  const handleMessageBrand = useCallback(() => {
    if (!targetBrandId) {
      toast.error('Brand profile is not ready yet.');
      return;
    }

    if (status !== 'authenticated') {
      drillDownPush({ pathname: '/(auth)/login', params: { next: `/catalog/${targetBrandId}` } } as any);
      return;
    }

    drillDownPush({ pathname: '/messages/[threadId]', params: { threadId: 'resolve', brandId: targetBrandId } } as any);
  }, [status, targetBrandId, toast]);

  const handleShareCollection = useCallback(
    async (collectionId: string) => {
      const collection = currentCollectionsRef.current.find((item) => item.id === collectionId);
      const title = collection?.title?.trim() || 'WIEZ design';
      const profileUrl = profileShareUrl ?? '';
      const url = profileUrl ? `${profileUrl}${profileUrl.includes('?') ? '&' : '?'}collectionId=${encodeURIComponent(collectionId)}` : '';

      try {
        await Share.share({
          title,
          message: url ? `${title}\n${url}` : title,
          url: url || undefined,
        });
      } catch {
        toast.error('Could not share this item.');
      }
    },
    [profileShareUrl, toast],
  );

  const handleToggleSaveCollection = useCallback(
    async (collection: CollectionDto) => {
      if (isOwner) return;
      if (status !== 'authenticated') {
        drillDownPush({ pathname: '/(auth)/login', params: { next: `/catalog/${targetBrandId ?? ''}` } } as any);
        return;
      }

      const wasSaved = Boolean(savedCatalogByIdRef.current[collection.id]);
      const savedBatchQueryKey = queryKeys.saved.batch('COLLECTION', savedCatalogIdsRef.current);
      setSavedCatalogById((current) => ({ ...current, [collection.id]: !wasSaved }));
      queryClient.setQueryData<Record<string, boolean>>(savedBatchQueryKey, (current) => ({
        ...(current ?? {}),
        [collection.id]: !wasSaved,
      }));
      setSavingCatalogById((current) => ({ ...current, [collection.id]: true }));

      try {
        if (wasSaved) {
          await SavedItemsApi.unsaveCatalogTarget({
            targetType: collection.entityType === 'DESIGN' ? 'DESIGN' : 'COLLECTION',
            collectionId: collection.id,
            legacyCollectionId: collection.id,
            designId: collection.entityType === 'DESIGN' ? collection.id : undefined,
          });
          toast.success('Removed from saved.');
        } else {
          await SavedItemsApi.saveCatalogTarget({
            targetType: collection.entityType === 'DESIGN' ? 'DESIGN' : 'COLLECTION',
            collectionId: collection.id,
            legacyCollectionId: collection.id,
            designId: collection.entityType === 'DESIGN' ? collection.id : undefined,
          });
          toast.success('Saved for later.');
        }
      } catch {
        setSavedCatalogById((current) => ({ ...current, [collection.id]: wasSaved }));
        queryClient.setQueryData<Record<string, boolean>>(savedBatchQueryKey, (current) => ({
          ...(current ?? {}),
          [collection.id]: wasSaved,
        }));
        toast.error('Could not update saved items.');
      } finally {
        setSavingCatalogById((current) => {
          const next = { ...current };
          delete next[collection.id];
          return next;
        });
      }
    },
    [isOwner, queryClient, status, targetBrandId, toast],
  );

  const shareActionOptions = useMemo(
    () => [
      {
        key: 'share-profile',
        title: 'Share profile',
        description: profileShareUrl ?? undefined,
        onPress: () => void handleNativeShareProfile(),
        disabled: !profileShareUrl,
      },
      {
        key: 'copy-profile-link',
        title: 'Copy profile link',
        description: profileShareUrl ?? undefined,
        onPress: () => void handleCopyProfileLink(),
        disabled: !profileShareUrl,
      },
      {
        key: 'show-qr-code',
        title: 'Show QR code',
        description: 'Open a scannable public brand profile QR.',
        onPress: () => setBrandQrOpen(true),
        disabled: !profileQrTargetUrl,
      },
    ],
    [handleCopyProfileLink, handleNativeShareProfile, profileQrTargetUrl, profileShareUrl],
  );

  const launchComposer = useCallback(
    (opts: { source?: DesignEditorMediaSource; openPicker: boolean }) => {
      navPerf.tap('create_design');
      navPerf.mark('create_design_option_selected');

      const doLaunch = () => {
        navPerf.mark('create_design_navigation_called');
        navPerf.navigationCalled();

        if (opts.openPicker && opts.source) {
          drillDownPush({
            pathname: '/catalog/create-design/composer',
            params: { autoOpenPickerSource: opts.source, brandId: targetBrandId },
          } as any);
        } else {
          drillDownPush({
            pathname: '/catalog/create-design/composer',
            params: { blank: '1', brandId: targetBrandId },
          } as any);
        }
      };

      doLaunch();
    },
    [targetBrandId, toast],
  );

  const createMenuRef = useRef<{ open: (e?: any) => void } | null>(null);

  const handleCreatePress = useCallback((e?: any) => {
    if (canManageCatalog(user) && userEmailVerified === false) {
      toast.error('Verify your email before creating designs.');
      return;
    }
    perfMark('catalog-plus-tap');
    createMenuRef.current?.open(e);
  }, [toast, user, userEmailVerified]);

  const createDesignOptions = useMemo<FloatingMenuOption[]>(
    () => [
      {
        key: 'camera',
        icon: '📷',
        title: 'Camera',
        onPress: () => launchComposer({ source: 'camera', openPicker: true }),
      },
      {
        key: 'library',
        icon: '🖼️',
        title: 'Photo library',
        onPress: () => launchComposer({ source: 'library', openPicker: true }),
      },
      // "Start blank" removed: a design cannot be published without media, so
      // the option only ever led to a composer that immediately asked for the
      // photo the other two options already collect.
    ],
    [launchComposer],
  );

  // The same anchored control exposes role-safe actions: owner workspace actions,
  // signed-in shopper settings plus public sharing, or public sharing only.
  const profileMenuAnchorRef = useRef<View | null>(null);
  const profileMenuRef = useRef<{ open: (e?: any) => void } | null>(null);
  const handleOpenProfileMenu = useCallback((e?: any) => {
    profileMenuRef.current?.open(e);
  }, []);
  const profileMenuOptions = useMemo<FloatingMenuOption[]>(
    () => {
      // Emoji + separators mirror the Studio profile menu so both menus read as
      // the same control (see `StudioProfileMenu` in app/(tabs)/studio/webview.tsx).
      if (isOwner) {
        // A brand that has not finished the store wizard has no store to
        // manage, so it must not be offered one. Showing "Store" here dropped
        // the brand into a Studio dashboard for a store that does not exist,
        // behind a verification notice — the entry point promised something the
        // destination could not deliver. Offer the wizard instead, which is the
        // action actually available to them.
        //
        // `null` means the status is still unknown; keep "Store" (a brand with
        // a live store must never be locked out by a slow or failed request)
        // and let the Studio screen itself re-check on entry.
        const storeOption: FloatingMenuOption =
          storeSetupComplete === false
            ? {
                key: 'store-setup',
                icon: '🏗️',
                title: 'Set up store',
                onPress: () => drillDownPush({ pathname: '/studio', params: { routeKey: 'essentials' } } as any),
              }
            : { key: 'store', icon: '🛍️', title: 'Store', onPress: () => drillDownPush('/studio' as any) };

        return [
          { key: 'settings', icon: '⚙️', title: 'Settings', onPress: () => drillDownPush('/settings' as any) },
          storeOption,
        ];
      }

      const publicActions: FloatingMenuOption[] = [
        {
          key: 'share-profile',
          icon: '↗️',
          title: 'Share profile',
          onPress: () => void handleNativeShareProfile(),
          disabled: !profileShareUrl,
        },
        {
          key: 'copy-profile-link',
          icon: '🔗',
          title: 'Copy profile link',
          onPress: () => void handleCopyProfileLink(),
          disabled: !profileShareUrl,
        },
        {
          key: 'show-qr-code',
          icon: '🔳',
          title: 'Show QR code',
          onPress: () => setBrandQrOpen(true),
          disabled: !profileQrTargetUrl,
        },
      ];

      return status === 'authenticated'
        ? [
            { key: 'settings', icon: '⚙️', title: 'Settings', onPress: () => drillDownPush('/settings' as any) },
            ...publicActions,
          ]
        : publicActions;
    },
    [
      handleCopyProfileLink,
      handleNativeShareProfile,
      isOwner,
      profileQrTargetUrl,
      profileShareUrl,
      status,
      storeSetupComplete,
    ],
  );

  if (showInitialSkeleton) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.surface }]} edges={[]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <CatalogLoadingSkeleton bottomPadding={overlayScrollPadding} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.surface }]} edges={[]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        ref={outerScrollRef}
        style={styles.scrollView}
        scrollIndicatorInsets={{ bottom: overlayScrollPadding }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: overlayScrollPadding + tokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleOuterScroll}
        onScrollEndDrag={handleOuterScrollSettled}
        onMomentumScrollEnd={handleOuterScrollSettled}
        onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Profile Header */}
        {isOwner ? (
          <OwnerCatalogMediaHeader
            profile={effectiveProfile}
            isLoading={false}
            stats={headerStats}
            contactItems={headerContactItems}
            badges={headerBadges}
            onEditProfile={() => {
              if (!targetBrandId) return;
              drillDownPush({ pathname: '/catalog/edit-profile', params: { brandId: targetBrandId } } as any);
            }}
            onCreate={handleCreatePress}
            createAnchorRef={createAnchorRef}
            onViewAvatar={handleViewOwnerAvatar}
            onShare={() => setShareActionsOpen(true)}
            onOpenMenu={handleOpenProfileMenu}
            menuAnchorRef={profileMenuAnchorRef}
            qrTargetUrl={profileQrTargetUrl}
            onOpenQr={() => setBrandQrOpen(true)}
            onBack={handleBackNavigation}
            onSearch={() => drillDownPush('/search' as any)}
            onNotifications={() => drillDownPush('/notifications' as any)}
            unreadNotificationCount={unreadNotificationCount}
          />
        ) : (
          <BrandProfileHeader
            brandName={profileDisplayName}
            username={profileUsername || undefined}
            location={profileLocation}
            description={
              effectiveProfile?.brandDescription ??
              effectiveProfile?.description ??
              null
            }
            contactItems={headerContactItems}
            tags={profileTags}
            stats={headerStats}
            badges={headerBadges}
            avatarUrl={visitorAvatarUri ?? visitorAvatar.src ?? undefined}
            avatarFileId={visitorAvatar.fileId ?? undefined}
            profilePhotoViewState={effectiveProfile?.profilePhotoViewState ?? null}
            bannerUrl={visitorBanner.src ?? undefined}
            bannerFileId={visitorBanner.fileId ?? undefined}
            isOwner={false}
            isLoading={false}
            isPatched={isPatched}
            patchLoading={patchLoading}
            onPatch={patchEnabled ? handlePatch : undefined}
            onViewAvatar={handleViewVisitorAvatar}
            onShare={() => setShareActionsOpen(true)}
            qrTargetUrl={profileQrTargetUrl}
            onOpenQr={() => setBrandQrOpen(true)}
            onMessage={handleMessageBrand}
            onBack={handleBackNavigation}
            onSearch={() => drillDownPush('/search' as any)}
            onOpenMenu={handleOpenProfileMenu}
            menuAnchorRef={profileMenuAnchorRef}
            onNotifications={
              status === 'authenticated' ? () => drillDownPush('/notifications' as any) : undefined
            }
            unreadNotificationCount={status === 'authenticated' ? unreadNotificationCount : undefined}
          />
        )}

        {isOwner ? (
          <View style={[styles.brandSwitcherWrap, { backgroundColor: theme.colors.surface }]}>
            <BrandSwitcherSheet />
          </View>
        ) : null}

        {isOwner ? (
          <View style={[styles.verificationNoticeWrap, { backgroundColor: theme.colors.surface }]}>
            <EmailVerificationNotice
              context="catalog"
              userId={userId}
              email={user?.email}
              emailVerified={userEmailVerified}
            />
          </View>
        ) : null}

        {/* Tabs */}
        <View style={[styles.tabsWrapper, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Tabs
            tabs={tabs}
            activeTab={visualActiveTab}
            onTabChange={handleMainTabChange}
            swipeProgress={tabSwipeProgress}
          />
        </View>



        <Animated.ScrollView
          ref={tabPagerRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleTabPagerScroll}
          onMomentumScrollEnd={handleTabPagerMomentumEnd}
          onScrollEndDrag={handleTabPagerScrollEndDrag}
          style={[styles.tabPager, { height: activeTabPagerHeight }]}
          contentContainerStyle={styles.tabPagerContent}
        >
          <View
            onLayout={(event) => handleTabPageLayout(`Collections:${visibilityFilter}`, event)}
            style={[
              styles.tabPage,
              {
                width: Math.max(containerWidth, 1),
                minHeight: unmeasuredPageMinHeight(`Collections:${visibilityFilter}`),
              },
            ]}
          >
              {isOwner ? (
                <View style={styles.catalogControls}>
                  <VisibilityFilter
                    selected={visibilityFilter}
                    onChange={setVisibilityFilter}
                    showDrafts={isOwner}
                    draftsCount={statusCounts.drafts}
                    needsAttentionCount={statusCounts.needsAttention}
                    inReviewCount={statusCounts.inReview}
                  />
                </View>
              ) : null}

              {isOwner && failedDesignTasks.length > 0 ? (
                <View style={styles.failedTaskList}>
                  {failedDesignTasks.map((task) => (
                    <View
                      key={task.id}
                      style={[
                        styles.failedTaskCard,
                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger },
                      ]}
                    >
                      <AppText variant="captionBold" tone="danger" numberOfLines={1}>
                        ! {task.action === 'draft' ? 'Draft failed' : 'Publish failed'}
                      </AppText>
                      <AppText variant="bodyBold" numberOfLines={1}>
                        {task.title}
                      </AppText>
                      <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
                        {task.error ?? task.message ?? 'Something went wrong. Please try again.'}
                      </AppText>
                      <View style={styles.failedTaskActions}>
                        <Button
                          title="Retry / Edit"
                          variant="primary"
                          size="sm"
                          onPress={() => handleRetryFailedTask(task)}
                        />
                        <Button
                          title="Dismiss"
                          variant="outline"
                          size="sm"
                          onPress={() => handleDismissFailedTask(task.id)}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <CollectionsGrid
                collections={currentCollectionsWithBackgroundTasks}
                /*
                  Hardcoded `false` here is what made a loading tab render "No
                  Content Yet" and then jolt as the first card arrived. The grid
                  already draws a skeleton for this exact case; it was just
                  never told the bucket was still loading.
                */
                isLoading={listInitialLoading}
                isOwner={isOwner}
                showDrafts={visibilityFilter === 'Drafts'}
                // The visibility filter already names the status, so its cards
                // do not repeat it — "DRAFT" on every tile of the Drafts tab.
                impliedStatus={
                  visibilityFilter === 'Drafts'
                    ? 'DRAFT'
                    : REVIEW_VISIBILITY_STATUS[visibilityFilter] ?? null
                }
                onCollectionPress={handleCollectionPress}
                onEdit={handleEditCollection}
                onDelete={handleDeleteCollection}
                onShare={handleShareCollection}
                onSave={handleToggleSaveCollection}
                onClientRetry={handleRetryFailedCollection}
                onClientDismiss={handleDismissFailedCollection}
                savedById={savedCatalogById}
                saveBusyById={savingCatalogById}
                initialRenderCount={6}
                batchRenderCount={6}
                renderKey={dataTabKey}
                emptyComponent={
                  <EmptyCollections
                    isOwner={isOwner}
                    onAdd={handleCreatePress}
                  />
                }
              />
          </View>

          <View
            onLayout={(event) => handleTabPageLayout('Shop', event)}
            style={[
              styles.tabPage,
              { width: Math.max(containerWidth, 1), minHeight: unmeasuredPageMinHeight('Shop') },
            ]}
          >
            {/*
              A brand that has not finished store setup has no store to show, so
              the Shop tab rendered an empty product grid — indistinguishable
              from "this brand sells nothing" and offering no way forward. The
              owner gets the setup call to action instead; visitors keep the
              normal (empty) shop. `storeSetupComplete` is tri-state and only
              `false` gates: unknown must never lock an owner out of their own
              shop because a status request failed.
            */}
            {isOwner && storeSetupComplete === false ? (
              <StoreSetupRequiredNotice
                emailVerified={userEmailVerified !== false}
                onStartSetup={() =>
                  drillDownPush({ pathname: '/studio', params: { routeKey: 'essentials' } } as any)
                }
              />
            ) : shouldMountShopTab && containerWidth > 0 && targetBrandId ? (
              <BrandShopTab
                brandId={targetBrandId}
                isOwner={isOwner}
                containerWidth={containerWidth}
                initialProductId={routeProductId ?? null}
                enabled={dataActiveTab === 'Shop' || Boolean(routeProductId)}
              />
            ) : null}
          </View>

          <View
            onLayout={(event) => handleTabPageLayout('Reviews', event)}
            style={[
              styles.tabPage,
              { width: Math.max(containerWidth, 1), minHeight: unmeasuredPageMinHeight('Reviews') },
            ]}
          >
            {/* Reviews stays lazy until first activation to keep catalogue shell-first. */}
            {shouldMountReviewsTab && targetBrandId ? (
              <BrandReviewsTab brandId={targetBrandId} enabled={dataActiveTab === 'Reviews'} />
            ) : (
              <View style={styles.tabContent} />
            )}
          </View>
        </Animated.ScrollView>
      </ScrollView>

      <MobileProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={modalAvatarUri}
        onClose={() => setIsAvatarModalOpen(false)}
      />

      <AppActionSheet
        visible={shareActionsOpen}
        title="Share brand"
        subtitle={profileShareUrl ?? 'Profile link is not available yet.'}
        options={shareActionOptions}
        onClose={() => setShareActionsOpen(false)}
      />

      <CreateMenuWrapper ref={createMenuRef} anchorRef={createAnchorRef} options={createDesignOptions} />

      <CreateMenuWrapper ref={profileMenuRef} anchorRef={profileMenuAnchorRef} options={profileMenuOptions} />

      <AppQrSheet
        visible={brandQrOpen}
        title={`${profileDisplayName} QR code`}
        subtitle="Scan to open this public brand profile."
        qrValue={profileQrTargetUrl}
        displayUrl={profileShareUrl}
        username={profileUsername || effectiveProfile?.username}
        shareMessage={profileShareMessage}
        onClose={() => setBrandQrOpen(false)}
      />

      <AppConfirmDialog
        visible={Boolean(draftDeleteTarget)}
        title={visibilityFilter === 'Drafts' ? 'Delete draft?' : 'Delete collection?'}
        description={`This permanently deletes "${draftDeleteTarget?.title || 'Untitled collection'}". This action cannot be reversed.`}
        confirmLabel={visibilityFilter === 'Drafts' ? 'Delete Draft' : 'Delete Collection'}
        destructive
        loading={draftDeleteBusy}
        confirmDisabled={draftDeletePhrase !== 'DELETE'}
        onCancel={() => {
          if (!draftDeleteBusy) {
            setDraftDeleteTarget(null);
            setDraftDeletePhrase('');
          }
        }}
        onConfirm={confirmDraftDelete}
      >
        <Input
          label="Type DELETE to confirm"
          value={draftDeletePhrase}
          onChangeText={setDraftDeletePhrase}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </AppConfirmDialog>


    </SafeAreaView>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Styles
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: tokens.spacing.xl,
  },
  skeletonScrollContent: {
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  skeletonTabsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  skeletonCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  skeletonCardTitle: {
    marginTop: tokens.spacing.xs,
  },
  tabsWrapper: {
    borderBottomWidth: 0,
  },
  brandSwitcherWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.xs,
  },
  verificationNoticeWrap: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
  },
  catalogControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  failedTaskList: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  failedTaskCard: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  failedTaskActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  // Tab content
  tabPager: {
    width: '100%',
    overflow: 'visible',
  },
  tabPagerContent: {
    alignItems: 'flex-start',
  },
  tabPage: {
    overflow: 'visible',
  },
  tabContent: {
    paddingVertical: tokens.spacing.lg,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.lg,
  },
  emptyTitle: {
    marginTop: tokens.spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: tokens.spacing.sm,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: tokens.spacing.lg,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
});

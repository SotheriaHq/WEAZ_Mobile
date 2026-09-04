import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import EmailVerificationNotice from '@/components/auth/EmailVerificationNotice';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ComputedSizeChip } from '@/components/sizing/ComputedSize';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import ProfileImageModal from '@/components/profile/ProfileImageModal';
import { ProfileApi, type ComputedSizeFitProfile, type PatchedBrand, type SavedItem, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { ProfilePhotoViewApi } from '@/src/api/ProfilePhotoViewApi';
import { readWarmScreenState, writeWarmScreenState } from '@/src/state/screenWarmState';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { useFrameBatchedItems } from '@/src/hooks/useFrameBatchedItems';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import {
  collectMeasurementProblems,
  resolveComputedSizeState,
  resolveCategorySizes,

} from '@/src/features/sizing/computedSize';
import {
  resolveDisplayCategory,
  useProfileSizeCategory,
} from '@/src/features/sizing/profileSizePreference';
import {
  CORE_MEASUREMENT_SLOTS,
  collapseMeasurements,
  compactMeasurementLabel,
  type CollapsedMeasurements,
  type CoreMeasurementKey,
} from '@/src/features/sizing/measurementCatalog';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { createUnviewedProfilePhotoViewState } from '@/src/types/profilePhoto';
import { resolveIdentity } from '@/src/utils/identity';
import { profileDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { routeForDesignTarget, routeForStoreCollectionTarget } from '@/src/utils/mobileRouting';
import { navPerf } from '@/src/utils/navPerf';
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';
import { compressPickedImage } from '@/src/utils/imageCompression';
import {
  refreshUnreadNotificationCount,
  useUnreadNotificationCount,
} from '@/src/realtime/notifications';
import {
  MOBILE_UPLOAD_POLICIES,
  getMobileUploadValidationMessage,
  assertValidPickedUploadAsset,
} from '@/src/utils/uploadValidation';
import { formatMoney } from '@/src/utils/money';

type ProfileTab = 'Saved' | 'Patches' | 'Orders';

type ProfileState = {
  profile: UserProfile | null;
  sizeFit: SizeFitProfile | null;
  computedSizeFit: ComputedSizeFitProfile | null;
  saved: SavedItem[];
  patches: PatchedBrand[];
  orders: BuyerOrderSummary[];
};

const PROFILE_LOGIN_ROUTE = { pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as const;

const PROFILE_TABS: ProfileTab[] = ['Saved', 'Patches', 'Orders'];
const PROFILE_INITIAL_SECTION_ITEMS = 6;
const PROFILE_SECTION_BATCH_ITEMS = 8;
const PROFILE_ORDERS_PREVIEW_LIMIT = 6;
/*
  The measurement vocabulary now lives in `src/features/sizing/measurementCatalog.ts`.

  It was defined here, and only here, which is how the profile ended up speaking
  a different language from both the server and the order flow: this file's six
  points were `CHEST`/`HIPS`, the recommendation engine weighs `CHEST_BUST`/
  `HIP_SEAT`, and a brand's order form asks for `MEN_CHEST`. The server resolves
  all three to one measurement; the profile rendered them as three rows.
*/

const getSavedLooksCountBucket = (count: number) => {
  if (count <= 0) return '0';
  if (count <= 2) return '1-2';
  if (count <= 9) return '3-9';
  return '10+';
};

const getProfileTabLabel = (tab: ProfileTab) => (tab === 'Saved' ? 'Saved Looks' : tab);

function formatCurrency(amount: number, currency = 'NGN') {
  return formatMoney(amount, currency);
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function createEmptyProfileState(): ProfileState {
  return {
    profile: null,
    sizeFit: null,
    computedSizeFit: null,
    saved: [],
    patches: [],
    orders: [],
  };
}

function buildFallbackProfile(user: AuthUser | null): UserProfile | null {
  if (!user?.id) return null;
  const identity = resolveIdentity(user);

  return {
    id: user.id,
    username: user.username?.trim() ?? '',
    firstName: user.firstName?.trim() ?? '',
    lastName: user.lastName?.trim() ?? '',
    email: user.email ?? null,
    themePreference: user.themePreference,
    profileImage: identity.avatarSrc,
    profileImageId: identity.avatarFileId,
    profileImageFile:
      identity.avatarSrc || identity.avatarFileId
        ? {
            id: identity.avatarFileId,
            s3Url: identity.avatarSrc,
            url: identity.avatarSrc,
          }
        : null,
    bannerImage: user.bannerImage ?? null,
    address: null,
    location: null,
    profileVisibility: 'UNLOCKED',
    showUsername: true,
    showLocation: true,
    profilePhotoUpdatedAt: user.profilePhotoUpdatedAt ?? null,
    profilePhotoViewState: null,
    isEmailVerified: typeof user.isEmailVerified === 'boolean' ? user.isEmailVerified : false,
    createdAt: user.updatedAt ?? null,
  };
}

function getHttpStatus(error: unknown): number | null {
  const status = Number((error as any)?.response?.status ?? 0);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function isNotFoundError(error: unknown): boolean {
  return getHttpStatus(error) === 404;
}

function EmptyState({
  emoji,
  title,
  body,
  cta,
  onPress,
}: {
  emoji: string;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card padding="md" style={[styles.emptyCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <AppText variant="display">{emoji}</AppText>
      <AppText variant="subtitle">{title}</AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>
        {body}
      </AppText>
      <Button title={cta} size="sm" onPress={onPress} fullWidth />
    </Card>
  );
}

function ProfileSkeleton({ bottomPadding }: { bottomPadding: number }) {
  return (
    <View style={[styles.skeletonWrap, { paddingBottom: bottomPadding }]}>
      <View style={styles.skeletonHeader}>
        <Skeleton width={80} height={80} borderRadius={tokens.radius.xl} />
        <View style={styles.skeletonHeaderText}>
          <Skeleton width="60%" height={20} borderRadius={6} />
          <Skeleton width="40%" height={16} borderRadius={4} />
        </View>
      </View>
      <View style={styles.skeletonStats}>
        <Skeleton width={60} height={40} borderRadius={8} />
        <Skeleton width={60} height={40} borderRadius={8} />
        <Skeleton width={60} height={40} borderRadius={8} />
      </View>
      <View style={styles.skeletonTabs}>
        <Skeleton width="30%" height={32} borderRadius={16} />
        <Skeleton width="30%" height={32} borderRadius={16} />
        <Skeleton width="30%" height={32} borderRadius={16} />
      </View>
      <View style={styles.skeletonList}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={styles.skeletonItem}>
            <Skeleton width={50} height={50} borderRadius={tokens.radius.lg} />
            <View style={styles.skeletonItemText}>
              <Skeleton width="70%" height={16} borderRadius={4} />
              <Skeleton width="50%" height={14} borderRadius={4} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProfileSectionSkeleton() {
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading recent orders">
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={styles.skeletonItem}>
          <Skeleton width={50} height={50} borderRadius={tokens.radius.lg} />
          <View style={styles.skeletonItemText}>
            <Skeleton width="70%" height={16} borderRadius={tokens.radius.sm} />
            <Skeleton width="46%" height={14} borderRadius={tokens.radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

function SummaryStat({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View style={styles.summaryStat}>
      <AppText variant="captionRegular" tone="muted">{title}</AppText>
      <AppText variant="subtitle">{value}</AppText>
      <AppText variant="captionRegular" tone="muted">{subtitle}</AppText>
    </View>
  );
}

function ProfileAction({
  emoji,
  label,
  accent,
  onPress,
}: {
  emoji: string;
  label: string;
  /**
   * `neutral` exists because Settings used `textSecondary`, and
   * `theme.colors.textSecondary` in the dark theme is a near-white plate — the
   * grey gear glyph sat on it at almost no contrast and read as disabled. Text
   * tokens are not surface tokens; `controlSurfaceActive` is the subtle
   * overlay meant for exactly this, and it works in both schemes.
   */
  accent: 'primary' | 'success' | 'warning' | 'neutral';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accentColor =
    accent === 'neutral' ? theme.colors.controlSurfaceActive : theme.colors[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionCard,
        // Bare, theme-neutral tiles: no fill in either theme so they sit ON the
        // page instead of looking like misplaced cards; press feedback only.
        { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: accentColor }]}>
        <AppText variant="captionBold">{emoji}</AppText>
      </View>
      <AppText variant="captionBold" numberOfLines={2} style={styles.actionLabel}>{label}</AppText>
    </Pressable>
  );
}

/**
 * The profile shows the ANSWER, not the workings.
 *
 * This card used to render every stored measurement as a row — and because the
 * server deliberately stores one measurement under several keys (canonical,
 * gendered registry, plus whatever key the client originally sent), eight real
 * measurements arrived as nineteen rows: "Height 182" twice, "Chest Bust 45"
 * beside "Chest Full Bust 45", "Hip 26" beside "Hip Seat 26". A shopper looking
 * at their own body reported back as a nineteen-item list, with duplicates,
 * cannot check it, cannot correct it, and cannot tell which row a brand will
 * read.
 *
 * The full list, deduplicated and editable, is now `app/fittings.tsx`. What is
 * left here is what belongs on a profile: how complete the core set is, the
 * per-garment sizes that fall out of it, and a way in. The headline size itself
 * lives up beside the avatar (`ComputedSizeChip`) where the eye already is.
 */
/**
 * The saved measurements as chips, in the column beside the avatar.
 *
 * Values, not a progress bar. The bar answers "is this finished"; a shopper
 * checking whether the app has their body right needs to read the numbers, and
 * this is the screen they look at to do it.
 *
 * Core points only, in tailor order, with the extras rolled into a single "+n"
 * chip — the extras are garment-specific points a brand asked for once, so they
 * belong on `/fittings` rather than in a profile header, but their COUNT is
 * worth showing so the roll-up is not a hidden state.
 *
 * A chip whose value the server rejected is marked. That is the only place a
 * shopper ever sees the offending number and the reason together, and without it
 * a wrong measurement is invisible until it produces a wrong size.
 */
const FittingsChips = React.memo(function FittingsChips({
  collapsed,
  unit,
  problemKeys,
  onPress,
}: {
  collapsed: CollapsedMeasurements;
  unit: string;
  problemKeys: Set<string>;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const unitLabel = unit.toLowerCase();

  const saved = CORE_MEASUREMENT_SLOTS.map((slot) => ({
    key: slot.key,
    value: collapsed.core[slot.key],
  })).filter((entry): entry is { key: CoreMeasurementKey; value: string } =>
    Boolean(entry.value),
  );

  if (saved.length === 0) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add your measurements"
        style={({ pressed }) => [styles.fittingChipRow, pressed ? styles.pressed : null]}
      >
        <View style={[styles.fittingChip, { backgroundColor: theme.colors.primarySoft }]}>
          <AppText variant="captionBold" tone="primary">
            📏 Add your measurements
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${saved.length} measurements saved. Open my fittings.`}
      style={({ pressed }) => [styles.fittingChipRow, pressed ? styles.pressed : null]}
    >
      {saved.map((entry) => {
        const flagged = problemKeys.has(entry.key);
        return (
          <View
            key={entry.key}
            style={[
              styles.fittingChip,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: flagged ? theme.colors.warning : theme.colors.border,
              },
            ]}
          >
            <AppText variant="captionBold" tone={flagged ? 'warning' : 'secondary'}>
              {flagged ? '⚠ ' : ''}
              {compactMeasurementLabel(entry.key)} {entry.value}
              {unitLabel}
            </AppText>
          </View>
        );
      })}
      {collapsed.extras.length > 0 ? (
        <View
          style={[
            styles.fittingChip,
            { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
          ]}
        >
          <AppText variant="captionBold" tone="muted">
            +{collapsed.extras.length}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
});

function FittingsSummaryCard({
  sizeFit,
  computed,
  onPress,
}: {
  sizeFit: SizeFitProfile | null;
  computed: ComputedSizeFitProfile | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const collapsed = React.useMemo(
    () => collapseMeasurements(sizeFit?.measurements),
    [sizeFit?.measurements],
  );
  const categorySizes = React.useMemo(() => resolveCategorySizes(computed), [computed]);
  const { category: preferredCategory } = useProfileSizeCategory();
  const displaySize = React.useMemo(() => {
    const resolved = resolveDisplayCategory(preferredCategory, categorySizes);
    return categorySizes.find((entry) => entry.category === resolved) ?? null;
  }, [categorySizes, preferredCategory]);
  const measurementProblems = React.useMemo(
    () => collectMeasurementProblems(computed),
    [computed],
  );
  const totalCore = CORE_MEASUREMENT_SLOTS.length;
  const complete = collapsed.coreSavedCount >= totalCore;

  return (
    <Card padding="sm" style={[styles.fittingsCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <AppText variant="bodyBold">My fittings</AppText>
          <AppText variant="captionRegular" tone="muted">
            {complete
              ? 'Reused on every custom order, so no brand has to ask you again.'
              : 'Save these once and no brand has to ask you again.'}
          </AppText>
        </View>
        <Button
          title={collapsed.coreSavedCount > 0 ? 'Manage' : 'Add'}
          size="sm"
          variant="secondary"
          onPress={onPress}
        />
      </View>

      {/*
        A bar, not a list.

        "6 of 8" answers the only question the profile needs to answer about
        measurements — is this finished — in one glance, and it does not grow
        with the data.
      */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${collapsed.coreSavedCount} of ${totalCore} sizing points saved. Open my fittings.`}
        style={({ pressed }) => [styles.fittingsProgressWrap, pressed ? styles.pressed : null]}
      >
        <View style={styles.fittingsProgressCopy}>
          <AppText variant="captionBold" tone="secondary">
            Sizing points
          </AppText>
          <AppText variant="captionBold" tone={complete ? 'success' : 'secondary'}>
            {collapsed.coreSavedCount}/{totalCore}
          </AppText>
        </View>
        <View style={[styles.fittingsTrack, { backgroundColor: theme.colors.surface }]}>
          <View
            style={[
              styles.fittingsFill,
              {
                backgroundColor: complete ? theme.colors.success : theme.colors.primary,
                width: `${Math.round((collapsed.coreSavedCount / totalCore) * 100)}%`,
              },
            ]}
          />
        </View>
        {/*
          A rejected measurement outranks the completeness copy. "Every point we
          size you by is saved" is true of the COUNT and false of the answer when
          one of those points cannot describe a body, and a shopper who reads it
          stops looking for the thing that is actually blocking their size.
        */}
        <AppText
          variant="captionRegular"
          tone={measurementProblems.length > 0 ? 'warning' : 'muted'}
        >
          {measurementProblems.length > 0
            ? `${measurementProblems.length} saved measurement${measurementProblems.length === 1 ? '' : 's'} cannot be right — tap to check ${measurementProblems.length === 1 ? 'it' : 'them'}.`
            : complete
              ? collapsed.extras.length > 0
                ? `Plus ${collapsed.extras.length} extra point${collapsed.extras.length === 1 ? '' : 's'} brands have asked you for.`
                : 'Every point we size you by is saved.'
              : `Add ${totalCore - collapsed.coreSavedCount} more and WIEZ can work out your size.`}
        </AppText>
      </Pressable>

      {/*
        ONE size, not five.

        This used to render a pill for every category the engine could compute
        — Tops, Bottoms, Dresses, Shirts, Jackets — next to a progress bar and
        a completeness sentence. Five answers to a question with one answer, on
        a screen that is not the sizing screen. The full breakdown, the region
        switcher and the measurements all live on the fittings screen now; the
        profile shows the one the shopper chose there.
      */}
      {displaySize ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Your ${displaySize.label} size is ${displaySize.size}. Open my fittings.`}
          style={({ pressed }) => [
            styles.categorySizePill,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed ? styles.pressed : null,
          ]}
        >
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {displaySize.label}
          </AppText>
          <AppText variant="captionBold" numberOfLines={1}>
            {displaySize.size}
          </AppText>
        </Pressable>
      ) : null}

      {computed?.staleMeasurementWarning ? (
        <AppText variant="captionRegular" tone="warning">
          These measurements are getting old — worth checking before your next order.
        </AppText>
      ) : null}
    </Card>
  );
}

function SavedDesignCard({ item }: { item: SavedItem }) {
  const { theme } = useTheme();
  const destinationId =
    item.targetType === 'DESIGN'
      ? item.designId ?? item.targetId
      : item.targetType === 'PRODUCT'
        ? item.productId ?? item.targetId
        : item.targetType === 'COLLECTION_MEDIA'
          ? item.collectionId ?? item.targetId
          : item.collectionId ?? item.targetId;
  const onPress = () => {
    // Dev-only nav timing. Destination (product/design/collection) emits its own
    // screen_mounted/data_ready; this measures tap→navigation_called.
    navPerf.tap('wishlist→product');
    navPerf.navigationCalled();
    if (item.targetType === 'PRODUCT') {
      drillDownPush({ pathname: '/products/[productId]', params: { productId: destinationId } } as any);
      return;
    }
    if (item.targetType === 'COLLECTION') {
      drillDownPush(routeForStoreCollectionTarget(destinationId) as any);
      return;
    }
    drillDownPush(
      routeForDesignTarget(destinationId, {
        // This card's thumbnail is already decoded and in cache — handing it
        // over lets the viewer paint immediately instead of showing a loader
        // for the ~1.7s the detail request takes.
        coverImage: item.thumbnail ?? null,
      }) as any,
    );
  };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.savedCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed ? styles.pressed : null]}
    >
      {item.thumbnail ? (
        <StableImage uri={item.thumbnail} containerStyle={styles.savedThumb} imageStyle={styles.savedThumb} />
      ) : (
        <View style={[styles.savedThumb, styles.savedThumbFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="title">🗂️</AppText>
        </View>
      )}
      <View style={styles.savedCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{item.title}</AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {[item.brand.firstName, item.brand.lastName].filter(Boolean).join(' ') || item.brand.username}
        </AppText>
      </View>
    </Pressable>
  );
}

function PatchRow({ brand }: { brand: PatchedBrand }) {
  const { theme } = useTheme();
  const identity = resolveIdentity(brand);
  const avatarUri = useResolvedImageUri({
    src: identity.avatarSrc ?? undefined,
    fileId: identity.avatarFileId ?? undefined,
    enabled: Boolean(identity.avatarSrc || identity.avatarFileId),
  });

  return (
    <Pressable
      onPress={() =>
        drillDownPush({
          pathname: '/catalog/[brandId]',
          params: { brandId: brand.id },
        } as any)
      }
      style={({ pressed }) => [styles.listCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, pressed ? styles.pressed : null]}
    >
      {avatarUri ? (
        <StableImage uri={avatarUri} containerStyle={styles.rowAvatar} imageStyle={styles.rowAvatar} />
      ) : (
        <View style={[styles.rowAvatar, { backgroundColor: theme.colors.primarySoft }]}>
          <AppText variant="captionBold" tone="primary">{identity.initials}</AppText>
        </View>
      )}
      <View style={styles.listCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{identity.displayName}</AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {identity.locationLabel || identity.handle || 'Patched brand'}
        </AppText>
      </View>
    </Pressable>
  );
}

function OrderRow({ order }: { order: BuyerOrderSummary }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        const { topLevelNavigate } = require('@/src/utils/mobileNavigation');
        topLevelNavigate({ pathname: '/orders/[orderId]', params: { orderId: order.id } } as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${order.title}`}
      style={({ pressed }) => [
        styles.listCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      {order.thumbnail ? (
        <StableImage uri={order.thumbnail} containerStyle={styles.rowAvatar} imageStyle={styles.rowAvatar} />
      ) : (
        <View style={[styles.rowAvatar, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="captionBold">📦</AppText>
        </View>
      )}
      <View style={styles.listCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{order.title}</AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {order.brandName} · {order.status} · {formatDate(order.createdAt)}
        </AppText>
      </View>
      <View style={styles.orderMeta}>
        <AppText variant="captionBold">{formatCurrency(order.amount, order.currency)}</AppText>
        <AppText variant="captionRegular" tone="muted">
          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function BuyerProfileScreen() {
  const { theme } = useTheme();
  const { standardScreenBottomPadding } = useScreenChrome();
  const deferredWorkReady = useDeferredScreenWork();
  const contentBottomPadding = standardScreenBottomPadding;
  const { status, sessionSettled, user, updateUser, validateToken, signOut } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const warmProfileStateKey = user?.id ? `me:v2:${user.id}` : null;
  const initialWarmProfileState = warmProfileStateKey ? readWarmScreenState<ProfileState>(warmProfileStateKey) : null;

  const [state, setState] = useState<ProfileState>(() => initialWarmProfileState ?? createEmptyProfileState());
  const [loading, setLoading] = useState(() => !initialWarmProfileState);
  const [ordersLoading, setOrdersLoading] = useState(() => !initialWarmProfileState);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Saved');
  const [hasWarmProfileSnapshot, setHasWarmProfileSnapshot] = useState(() => Boolean(initialWarmProfileState));
  const unreadNotificationCount = useUnreadNotificationCount();

  useEffect(() => {
    navPerf.screenMounted('tabs→me');
    navPerf.firstVisibleUi('tabs→me');
    if (initialWarmProfileState) {
      navPerf.mark('cache_hit', 'tabs→me');
      navPerf.mark('stale_ui_rendered', 'tabs→me');
    } else {
      navPerf.mark('cache_miss', 'tabs→me');
      if (status === 'loading') navPerf.mark('cold_skeleton_rendered', 'tabs→me');
    }
  }, []);

  React.useLayoutEffect(() => {
    navPerf.shellVisible('tabs→me');
  }, []);
  const savedLooksOpenedTrackedRef = useRef(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const loadRequestIdRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!warmProfileStateKey || !state.profile) return;
    writeWarmScreenState(warmProfileStateKey, state);
  }, [state, warmProfileStateKey]);

  const fallbackProfile = useMemo(() => buildFallbackProfile(user), [user]);
  /**
   * `load` reads the fallback through a ref, and depends only on primitives.
   *
   * This was the most expensive line in the app. `fallbackProfile` is a
   * `useMemo` on the auth `user` OBJECT, so it got a new identity every time
   * the auth context re-set the user — and `EmailVerificationNotice` calls
   * `validateToken({ forceRefresh: true })` on a 15-second interval for every
   * unverified account. So: poll → new `user` → new `fallbackProfile` → new
   * `load` → the `[deferredWorkReady, load]` effect below re-fires → EIGHT
   * requests (`/auth/profile`, `/users/me/profile`, `/users/me/size-fit`,
   * `/users/me/size-fit/computed`, `/saved/me`, `/users/:id/patches`,
   * `/store/orders`, `/custom-orders`).
   *
   * Every fifteen seconds. For as long as the app was open. On whatever tab
   * the user happened to be looking at, because this screen is preloaded at
   * launch and therefore mounted the whole time. That is ~32 requests a minute
   * per idle unverified user, none of which anyone was waiting for.
   */
  const fallbackProfileRef = useRef(fallbackProfile);
  fallbackProfileRef.current = fallbackProfile;
  const profileRecord = state.profile ?? fallbackProfile;
  const profileIdentity = useMemo(() => resolveIdentity(profileRecord), [profileRecord]);
  const profileCounts = useMemo(
    () => ({
      saved: state.saved.length,
      patches: state.patches.length,
      orders: state.orders.length,
    }),
    [state.orders.length, state.patches.length, state.saved.length],
  );
  const visibleSavedItems = useFrameBatchedItems(state.saved, {
    enabled: activeTab === 'Saved',
    initialCount: PROFILE_INITIAL_SECTION_ITEMS,
    batchCount: PROFILE_SECTION_BATCH_ITEMS,
    resetKey: `Saved:${state.saved.length}:${state.saved[0]?.id ?? ''}:${state.saved[state.saved.length - 1]?.id ?? ''}`,
  });
  const visiblePatchItems = useFrameBatchedItems(state.patches, {
    enabled: activeTab === 'Patches',
    initialCount: PROFILE_INITIAL_SECTION_ITEMS,
    batchCount: PROFILE_SECTION_BATCH_ITEMS,
    resetKey: `Patches:${state.patches.length}:${state.patches[0]?.id ?? ''}:${state.patches[state.patches.length - 1]?.id ?? ''}`,
  });
  const visibleOrderItems = useFrameBatchedItems(state.orders, {
    enabled: activeTab === 'Orders',
    initialCount: PROFILE_INITIAL_SECTION_ITEMS,
    batchCount: PROFILE_SECTION_BATCH_ITEMS,
    resetKey: `Orders:${state.orders.length}:${state.orders[0]?.id ?? ''}:${state.orders[state.orders.length - 1]?.id ?? ''}`,
  });

  useEffect(() => {
    if (status !== 'authenticated' || activeTab !== 'Saved' || savedLooksOpenedTrackedRef.current) return;
    savedLooksOpenedTrackedRef.current = true;
    trackMobileEvent('saved_looks_opened', {
      sourceScreen: 'profile',
      savedCountBucket: getSavedLooksCountBucket(state.saved.length),
    });
  }, [activeTab, state.saved.length, status]);

  useEffect(() => {
    if (status === 'authenticated' && user?.id) {
      if (lastUserIdRef.current !== user.id) {
        lastUserIdRef.current = user.id;
        const cachedState = warmProfileStateKey ? readWarmScreenState<ProfileState>(warmProfileStateKey) : null;
        setState(cachedState ?? createEmptyProfileState());
        setError(null);
        setLoading(!cachedState);
        setRefreshing(false);
        setHasWarmProfileSnapshot(Boolean(cachedState));
      }
      return;
    }

    lastUserIdRef.current = null;
    setState(createEmptyProfileState());
    setError(null);
    setLoading(false);
    setRefreshing(false);
    setHasWarmProfileSnapshot(false);
  }, [status, user?.id]);

  // NO auto-redirect to /(auth)/login here. WIEZ is browse-first: signing in is
  // a choice, never a toll gate. This screen also mounts unfocused during the
  // island tab pre-warm, so a mount-time `router.replace` yanked a signed-out
  // shopper off the Runway and onto the login form seconds after cold start.
  // The signed-out branch below offers sign-in instead of forcing it.

  useEffect(() => {
    if (!requestedTab) return;
    const normalized = requestedTab.trim().toLowerCase();
    if (normalized === 'patches') setActiveTab('Patches');
    if (normalized === 'orders') {
      setActiveTab('Orders');
      return;
    }
    if (normalized === 'saved') setActiveTab('Saved');
  }, [requestedTab]);

  const lastProfileLoadAtRef = useRef(0);
  const load = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent ?? false;
    if (status !== 'authenticated' || !user?.id) {
      setLoading(false);
      setOrdersLoading(false);
      setRefreshing(false);
      setState(createEmptyProfileState());
      return;
    }

    // Tab pre-warm + deferredWorkReady can both schedule `load` within a few
    // hundred ms. Coalesce so Me does not double-hit profile/size-fit/saved/
    // patches/orders (the log showed every endpoint twice in one open).
    const now = Date.now();
    if (!options?.force && now - lastProfileLoadAtRef.current < 15_000) {
      setLoading(false);
      setOrdersLoading(false);
      setRefreshing(false);
      return;
    }
    lastProfileLoadAtRef.current = now;

    const requestId = ++loadRequestIdRef.current;
    if (!silent && !hasWarmProfileSnapshot) {
      setLoading(true);
    }
    setOrdersLoading(true);
    setError(null);
    try {
      const [profileResult, sizeFitResult, computedSizeFitResult, savedResult, patchesResult, ordersResult] = await Promise.allSettled([
        ProfileApi.getMe(),
        ProfileApi.getSizeFit(),
        ProfileApi.getComputedSizeFit(),
        ProfileApi.getSaved(),
        ProfileApi.getPatches(user.id),
        BuyerOrdersApi.list({ limit: PROFILE_ORDERS_PREVIEW_LIMIT }),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      const previousState = stateRef.current;
      const nextProfile =
        profileResult.status === 'fulfilled' && profileResult.value
          ? profileResult.value
          : previousState.profile ?? fallbackProfileRef.current;
      const nextSizeFit = sizeFitResult.status === 'fulfilled' ? sizeFitResult.value : previousState.sizeFit;
      const nextComputedSizeFit =
        computedSizeFitResult.status === 'fulfilled' ? computedSizeFitResult.value : previousState.computedSizeFit;
      const nextSaved = savedResult.status === 'fulfilled' ? savedResult.value : previousState.saved;
      const nextPatches = patchesResult.status === 'fulfilled' ? patchesResult.value : previousState.patches;
      const nextOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : previousState.orders;
      const profileFailed = profileResult.status === 'rejected' && !isNotFoundError(profileResult.reason);
      const optionalFailures = [
        { section: 'size-fit', endpoint: '/users/me/size-fit', result: sizeFitResult },
        { section: 'size-fit-computed', endpoint: '/users/me/size-fit/computed', result: computedSizeFitResult },
        { section: 'saved', endpoint: '/saved/me', result: savedResult },
        { section: 'patches', endpoint: `/users/${user.id}/patches`, result: patchesResult },
        { section: 'orders', endpoint: '/store/orders + /custom-orders', result: ordersResult },
      ].filter((entry) => entry.result.status === 'rejected');

      optionalFailures.forEach((entry) => {
        const reason = entry.result.status === 'rejected' ? entry.result.reason : null;
        profileDevWarn('section-load-failed', {
          section: entry.section,
          endpoint: entry.endpoint,
          status: reason?.response?.status ?? reason?.status ?? null,
        });
      });

      setState({
        profile: nextProfile,
        sizeFit: nextSizeFit,
        computedSizeFit: nextComputedSizeFit,
        saved: nextSaved,
        patches: nextPatches,
        orders: nextOrders,
      });
      setHasWarmProfileSnapshot(true);

      if (warmProfileStateKey) {
        writeWarmScreenState(warmProfileStateKey, {
          profile: nextProfile,
          sizeFit: nextSizeFit,
          computedSizeFit: nextComputedSizeFit,
          saved: nextSaved,
          patches: nextPatches,
          orders: nextOrders,
        });
      }

      if (profileFailed) {
        setError('Profile could not refresh right now.');
      } else {
        setError(null);
      }
    } catch (nextError) {
      if (requestId !== loadRequestIdRef.current) return;
      setState((current) => ({
        ...current,
        profile: fallbackProfileRef.current,
      }));
      setHasWarmProfileSnapshot(true);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your profile.');
    } finally {
      if (requestId === loadRequestIdRef.current) {
        if (!silent) {
          setLoading(false);
        }
        setOrdersLoading(false);
        setRefreshing(false);
      }
    }
    // Primitives only — see `fallbackProfileRef` above.
  }, [status, user?.id]);

  useEffect(() => {
    if (!deferredWorkReady) return;
    navPerf.mark('background_refresh_started', 'tabs→me');
    void load().finally(() => {
      navPerf.mark('background_refresh_completed', 'tabs→me');
    });
  }, [deferredWorkReady, load]);

  /**
   * Re-read size-fit when the user comes back from `/fittings`.
   *
   * Just the two size endpoints, not the whole profile: this fires on every
   * focus, and the rest of the screen has its own refresh path. Failures are
   * swallowed on purpose — the card is still showing the last good values, and
   * a toast about a background read the user did not ask for is noise.
   */
  const refreshSizeFit = useCallback(async () => {
    try {
      const [nextSizeFit, nextComputed] = await Promise.all([
        ProfileApi.getSizeFit(),
        ProfileApi.getComputedSizeFit().catch(() => null),
      ]);
      setState((current) => ({
        ...current,
        sizeFit: nextSizeFit ?? current.sizeFit,
        computedSizeFit: nextComputed ?? current.computedSizeFit,
      }));
    } catch {
      // Keep what is on screen.
    }
  }, []);

  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!deferredWorkReady) return undefined;
      void refreshUnreadNotificationCount({
        authenticated: status === 'authenticated',
        forceRefresh: true,
      });
      // Not on the first focus — `load()` has just fetched both of these, and a
      // second identical pair of requests on every cold open is pure cost.
      if (hasFocusedOnceRef.current && status === 'authenticated') {
        void refreshSizeFit();
      }
      hasFocusedOnceRef.current = true;
      return undefined;
    }, [deferredWorkReady, refreshSizeFit, status]),
  );

  useEffect(() => {
    if (status === 'authenticated' && !loading) {
      navPerf.mark('cached_or_empty_state_visible', 'tabs→me');
      navPerf.dataReady('tabs→me');
    }
  }, [loading, status]);

  const avatarUri = useResolvedImageUri({
    src: profileIdentity.avatarSrc ?? undefined,
    fileId: profileIdentity.avatarFileId ?? undefined,
    enabled: Boolean(profileIdentity.avatarSrc || profileIdentity.avatarFileId),
  });

  const handleViewAvatar = useCallback(() => {
    if (!avatarUri && !profileIdentity.avatarSrc && !profileIdentity.avatarFileId) return;
    setIsAvatarModalOpen(true);

    const currentState = profileRecord?.profilePhotoViewState;
    if (!profileRecord?.id || !currentState?.canMarkViewed) return;

    void ProfilePhotoViewApi.markViewed(profileRecord.id)
      .then((nextState) => {
        setState((current) => {
          const nextProfile = current.profile ?? profileRecord;
          if (!nextProfile) return current;

          return {
            ...current,
            profile: {
              ...nextProfile,
              profilePhotoUpdatedAt: nextState.profilePhotoUpdatedAt,
              profilePhotoViewState: nextState,
            },
          };
        });
      })
      .catch((markError) => {
        console.error('Failed to mark profile photo viewed', markError);
      });
  }, [
    avatarUri,
    profileIdentity.avatarFileId,
    profileIdentity.avatarSrc,
    profileRecord,
  ]);

  const handleOpenNotifications = useCallback(() => {
    drillDownPush('/notifications' as any);
  }, []);

  const handleOpenSettings = useCallback(() => {
    drillDownPush('/settings' as any);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    lastProfileLoadAtRef.current = 0;
    await Promise.all([
      validateToken({ forceRefresh: true }),
      load({ silent: true, force: true }),
      refreshUnreadNotificationCount({ authenticated: true, forceRefresh: true }),
    ]);
  }, [load, validateToken]);

  const handlePickAvatar = useCallback(async () => {
    if (!profileRecord) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Allow photo access to update your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const raw = result.assets[0];
    let asset = { uri: raw.uri, fileName: raw.fileName, mimeType: raw.mimeType ?? 'image/jpeg' };
    try {
      const compressed = await compressPickedImage(
        raw.uri, raw.width ?? 0, raw.height ?? 0, raw.fileName, 'profileImage',
      );
      asset = { uri: compressed.uri, fileName: compressed.fileName, mimeType: compressed.mimeType };
    } catch {
      // compression failed — validate original (may reject if >2 MB)
    }

    try {
      assertValidPickedUploadAsset(
        { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType },
        MOBILE_UPLOAD_POLICIES.profileImage,
      );
    } catch (validationError) {
      toast.error(getMobileUploadValidationMessage(validationError));
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: asset.mimeType,
      name: asset.fileName ?? `profile-${Date.now()}.jpg`,
    } as any);

    try {
      const uploaded = await ProfileApi.uploadProfileImage(formData);
      if (!uploaded) {
        toast.error('Failed to upload photo.');
        return;
      }
      const nextProfilePhotoUpdatedAt = new Date().toISOString();
      const nextProfilePhotoViewState = createUnviewedProfilePhotoViewState(
        profileRecord.id,
        nextProfilePhotoUpdatedAt,
      );
      updateUser({
        profileImage: uploaded.url,
        profileImageId: uploaded.id,
        profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
        profilePhotoUpdatedAt: nextProfilePhotoUpdatedAt,
      });
      setState((current) => {
        const nextProfile = current.profile ?? profileRecord;
        if (!nextProfile) return current;

        return {
          ...current,
          profile: {
            ...nextProfile,
            profileImage: uploaded.url,
            profileImageId: uploaded.id,
            profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
            profilePhotoUpdatedAt: nextProfilePhotoUpdatedAt,
            profilePhotoViewState: nextProfilePhotoViewState,
          },
        };
      });
      toast.success('Profile photo updated.');
    } catch {
      toast.error('Failed to upload photo.');
    }
  }, [profileRecord, toast, updateUser]);

  const handleOpenFittings = useCallback(() => {
    drillDownPush('/fittings' as never);
  }, []);

  const computedSizeState = useMemo(
    () => resolveComputedSizeState(state.computedSizeFit),
    [state.computedSizeFit],
  );

  /*
    Collapsed once, here, rather than inside the chip row — it is the same
    derivation `FittingsSummaryCard` runs further down the screen, and doing it
    in the leaf would repeat it on every render of a component that lives inside
    a scrolling hero.
  */
  const heroFittings = useMemo(
    () => collapseMeasurements(state.sizeFit?.measurements),
    [state.sizeFit?.measurements],
  );
  const fittingProblemKeys = useMemo(
    () => new Set(collectMeasurementProblems(state.computedSizeFit).map((p) => p.key.toUpperCase())),
    [state.computedSizeFit],
  );

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut().finally(() => {
            router.replace(PROFILE_LOGIN_ROUTE as any);
          });
        },
      },
    ]);
  }, [signOut]);

  /*
    Wait for the session to settle before showing anyone their profile.

    A cold start restores a CACHED user and reports `authenticated` before the
    server has been asked — great for the Runway, wrong here. This screen is
    nothing but private data, so rendering on the guess meant a stale session
    displayed a full profile for the 3-5s the validation request took, then
    replaced it with the guest state. The reader saw their own account appear
    and then be taken away.

    `sessionSettled` is not the same as "verified": an offline start keeps the
    cached session on purpose, settles, and renders it. So this waits for an
    ANSWER, never for a guarantee — which is why it cannot hang.
  */
  if (status === 'loading' || (status === 'authenticated' && !sessionSettled)) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <BrandHeader />
        <ProfileSkeleton bottomPadding={contentBottomPadding} />
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    // Signed-out is a valid, permanent state — not a stopover on the way to a
    // login form. Offer the door; never push anyone through it.
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.loadingState}>
          <AppText variant="display">👤</AppText>
          <AppText variant="subtitle">You&apos;re browsing as a guest</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>
            Keep exploring the Runway freely. Sign in whenever you want to save looks, patch brands,
            and track orders.
          </AppText>
          <View style={styles.guestActions}>
            <Button
              title="Sign in"
              onPress={() => drillDownPush(PROFILE_LOGIN_ROUTE as any)}
              fullWidth
            />
            <Button
              title="Create an account"
              variant="secondary"
              onPress={() => drillDownPush({ pathname: '/(auth)/signup', params: { next: '/(tabs)/me' } } as any)}
              fullWidth
            />
            <Button
              title="Back to Runway"
              variant="ghost"
              onPress={() => router.replace('/' as any)}
              fullWidth
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInset={{ bottom: standardScreenBottomPadding }}
        scrollIndicatorInsets={{ bottom: standardScreenBottomPadding }}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.headerActionsRow}>
          <Pressable
            onPress={handleOpenNotifications}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            style={({ pressed }) => [styles.headerActionButton, pressed && styles.pressed]}
          >
            <AppText variant="body">🔔</AppText>
            {unreadNotificationCount > 0 ? (
              <View style={[styles.notificationBadge, { backgroundColor: theme.colors.danger }]}>
                <AppText variant="badgeLabel" tone="inverse">
                  {unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount)}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/*
          A row, not a centred column.

          The hero was a 92pt avatar centred on a full-width screen with centred
          name and handle beneath it — roughly two thirds of a phone's width left
          empty on either side of the photo, and the one number a shopper opens
          this screen for ("what size am I") reduced to a caption at the bottom
          of the stack. Laying it out as a row puts the identity beside the
          photo where the space already was, and gives the computed size a real
          slot on the right instead of a footnote.
        */}
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <Pressable onPress={handleViewAvatar} style={({ pressed }) => [pressed ? styles.pressed : null]}>
              {avatarUri ? (
                <StableImage uri={avatarUri} containerStyle={styles.heroAvatar} imageStyle={styles.heroAvatar} />
              ) : (
                <View style={[styles.heroAvatar, { backgroundColor: theme.colors.primarySoft }]}>
                  <AppText variant="title" tone="primary">{profileIdentity.initials}</AppText>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={handlePickAvatar}
              style={({ pressed }) => [
                styles.avatarBadge,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: pressed ? theme.colors.primary : theme.colors.border,
                },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit profile photo"
            >
              <AppText variant="captionBold">📷</AppText>
            </Pressable>
          </View>

          <View style={styles.identityBlock}>
            <AppText variant="title" numberOfLines={2}>{profileIdentity.displayName}</AppText>
            {profileIdentity.handle ? (
              <AppText variant="body" tone="primary" numberOfLines={1} style={styles.profileHandle}>
                {profileIdentity.handle}
              </AppText>
            ) : null}
            {profileIdentity.locationLabel ? (
              <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                {profileIdentity.locationLabel}
              </AppText>
            ) : null}

            {/*
              The saved measurements, right here under the name.

              They were not on this screen at all — the card further down had
              been reduced to a "6 of 8" progress bar, which answers "is this
              finished" but never "what did I save", so a shopper could not
              check their own numbers without opening `/fittings`. That was the
              right call about the DUPLICATE-heavy full list and the wrong call
              about showing values at all. `collapseMeasurements` already
              resolves the fan-out (`HEIGHT` + `MEN_HEIGHT` + …) to one entry per
              point, so the honest short form fits in the space beside the
              avatar that was empty on every phone.
            */}
            <FittingsChips
              collapsed={heroFittings}
              unit={state.sizeFit?.preferredLengthUnit ?? 'CM'}
              problemKeys={fittingProblemKeys}
              onPress={handleOpenFittings}
            />
          </View>

          {/*
            Renders only when there IS a size. The reason there is not one — an
            unpublished size chart is a WIEZ setup step, missing points are the
            shopper's — belongs on `/fittings`, which can act on either.
          */}
          <ComputedSizeChip state={computedSizeState} onPress={handleOpenFittings} />
        </View>

        <EmailVerificationNotice
          context="profile"
          userId={user?.id}
          email={user?.email}
          emailVerified={user?.isEmailVerified}
        />

        {/*
          All five on one row.
          
          They used to be 3 + 2, which left a ragged half-empty second row and
          made the two orphans (Reviews, Settings) read as a different, lesser
          group than the three above them. Five equal columns is one group of
          five, which is what it is. Each tile is `flex: 1, minWidth: 0` so they
          divide the width evenly at any screen size, and the label wraps to two
          lines rather than truncating on the narrowest handsets.
        */}
        <View style={styles.actionRow}>
          <ProfileAction emoji="✏️" label="Edit info" accent="primary" onPress={() => drillDownPush('/(tabs)/me-edit' as any)} />
          <ProfileAction emoji="📏" label="My fittings" accent="success" onPress={handleOpenFittings} />
          <ProfileAction emoji="📦" label="Orders" accent="primary" onPress={() => setActiveTab('Orders')} />
          <ProfileAction emoji="⭐" label="Reviews" accent="warning" onPress={() => drillDownPush('/reviews' as any)} />
          <ProfileAction emoji="⚙️" label="Settings" accent="neutral" onPress={handleOpenSettings} />
        </View>

        <View style={styles.summaryRow}>
          <SummaryStat title="Saved Looks" value={String(profileCounts.saved)} subtitle="inspiration" />
          <SummaryStat title="Patched" value={String(profileCounts.patches)} subtitle="brands" />
          <SummaryStat title="Recent" value={String(profileCounts.orders)} subtitle="orders" />
        </View>

        <FittingsSummaryCard
          sizeFit={state.sizeFit}
          computed={state.computedSizeFit}
          onPress={handleOpenFittings}
        />

        {error ? (
          <View style={[styles.inlineNotice, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <View style={styles.inlineNoticeCopy}>
              <AppText variant="captionRegular" tone="muted">
                {error}
              </AppText>
            </View>
            <Button title="Retry" size="sm" variant="outline" onPress={() => void load()} />
          </View>
        ) : null}

        <View style={[styles.tabRail, { borderBottomColor: theme.colors.border }] }>
          {PROFILE_TABS.map((tab) => {
            const selected = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={({ pressed }) => [
                  styles.tabItem,
                  selected && [styles.tabItemActive, { borderBottomColor: theme.colors.primary }],
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <AppText variant="captionBold" tone={selected ? 'primary' : 'secondary'}>
                  {getProfileTabLabel(tab)}
                </AppText>
              </Pressable>
            );
            })}
        </View>

        {activeTab === 'Saved' ? (
          state.saved.length === 0 ? (
            <EmptyState
              emoji="🗂️"
              title="No saved looks yet"
              body="Save looks you love for inspiration so you can revisit them quickly from here."
              cta="Browse Runway"
              onPress={() => topLevelNavigate('/(tabs)' as any)}
            />
          ) : (
            <View style={styles.savedGrid}>
              {visibleSavedItems.map((item) => (
                <SavedDesignCard key={item.id} item={item} />
              ))}
            </View>
          )
        ) : null}

        {activeTab === 'Patches' ? (
          state.patches.length === 0 ? (
            <EmptyState
              emoji="🪡"
              title="No patched brands yet"
              body="Patch the brands you want to keep close and their latest drops will stay within reach."
              cta="Discover brands"
              onPress={() => topLevelNavigate('/(tabs)/discover' as any)}
            />
          ) : (
            <View style={styles.listStack}>
              {visiblePatchItems.map((brand) => (
                <PatchRow key={brand.id} brand={brand} />
              ))}
            </View>
          )
        ) : null}

        {activeTab === 'Orders' ? (
          ordersLoading && state.orders.length === 0 ? (
            <ProfileSectionSkeleton />
          ) : state.orders.length === 0 ? (
            <View style={[styles.ordersPreviewState, { backgroundColor: theme.colors.surfaceAlt }]}>
              <AppText variant="bodyBold">No orders yet</AppText>
              <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
                Standard and custom orders will appear here.
              </AppText>
              <Button title="Open market" size="sm" variant="secondary" onPress={() => topLevelNavigate('/(tabs)/discover' as any)} />
            </View>
          ) : (
            <>
              <View style={styles.listStack}>
                {visibleOrderItems.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </View>
              <Button title="View all orders" variant="outline" onPress={() => drillDownPush('/orders' as any)} />
            </>
          )
        ) : null}
      </ScrollView>

      <ProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={avatarUri ?? profileIdentity.avatarSrc ?? null}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
  },
  headerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: tokens.spacing.xs,
  },
  headerActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  guestActions: {
    alignSelf: 'stretch',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
  },
  heroAvatar: {
    width: 92,
    height: 92,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBlock: {
    // `minWidth: 0` so a long display name wraps inside the row instead of
    // pushing the size chip off the right edge.
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  fittingChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  fittingChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xs,
  },
  centerText: {
    textAlign: 'center',
  },
  profileHandle: {
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.xs,
  },
  // Instagram-style soft action tile: solid tokenized fill, no outline —
  // hairline accent borders rendered as scratchy dashes on Android densities.
  actionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: tokens.spacing.xs,
    // Two horizontal padding units, not three: at five across on a 360pt
    // handset each tile is ~64pt wide, and the label needs every point of it.
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
  },
  actionIcon: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingVertical: tokens.spacing.xs,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  fittingsCard: {
    gap: tokens.spacing.sm,
  },
  fittingsProgressWrap: {
    gap: tokens.spacing.xs,
  },
  fittingsProgressCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  fittingsTrack: {
    height: 6,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  fittingsFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  categorySizeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  categorySizePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    minHeight: 32,
    maxWidth: '100%',
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  errorCard: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  savedCard: {
    width: '48.5%',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  savedThumb: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  savedThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCopy: {
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
  },
  listStack: {
    gap: tokens.spacing.xs,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.sm,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  orderMeta: {
    alignItems: 'flex-end',
    gap: tokens.spacing.xs,
  },
  ordersPreviewState: {
    minHeight: 112,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
  },
  emptyCard: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  emptyBody: {
    textAlign: 'center',
  },
  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  inlineNoticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  tabRail: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomWidth: 2,
  },
  pressed: {
    opacity: 0.82,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  skeletonStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: tokens.spacing.sm,
  },
  skeletonTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  skeletonList: {
    gap: tokens.spacing.md,
  },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  skeletonItemText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
});

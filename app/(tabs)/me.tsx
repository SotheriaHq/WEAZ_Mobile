import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import EmailVerificationNotice from '@/components/auth/EmailVerificationNotice';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
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

type ProfileTab = 'Saved' | 'Patches' | 'Orders';

type ProfileState = {
  profile: UserProfile | null;
  sizeFit: SizeFitProfile | null;
  computedSizeFit: ComputedSizeFitProfile | null;
  saved: SavedItem[];
  patches: PatchedBrand[];
  orders: BuyerOrderSummary[];
};

type MeasurementKey = 'CHEST' | 'WAIST' | 'HIPS' | 'SHOULDER' | 'INSEAM' | 'HEIGHT';

const PROFILE_LOGIN_ROUTE = { pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as const;

const PROFILE_TABS: ProfileTab[] = ['Saved', 'Patches', 'Orders'];
const PROFILE_INITIAL_SECTION_ITEMS = 6;
const PROFILE_SECTION_BATCH_ITEMS = 8;
const PROFILE_ORDERS_PREVIEW_LIMIT = 6;
const MEASUREMENT_FIELDS: Array<{ key: MeasurementKey; label: string }> = [
  { key: 'CHEST', label: 'Chest' },
  { key: 'WAIST', label: 'Waist' },
  { key: 'HIPS', label: 'Hips' },
  { key: 'SHOULDER', label: 'Shoulder' },
  { key: 'INSEAM', label: 'Inseam' },
  { key: 'HEIGHT', label: 'Height' },
];

const getSavedLooksCountBucket = (count: number) => {
  if (count <= 0) return '0';
  if (count <= 2) return '1-2';
  if (count <= 9) return '3-9';
  return '10+';
};

const getProfileTabLabel = (tab: ProfileTab) => (tab === 'Saved' ? 'Saved Looks' : tab);

function formatCurrency(amount: number, currency = 'NGN') {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
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
  accent: 'primary' | 'success' | 'warning' | 'textSecondary';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accentColor = theme.colors[accent];
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

function formatMeasurementKeyLabel(key: string): string {
  const known = MEASUREMENT_FIELDS.find((field) => field.key === key);
  if (known) return known.label;
  // Measurement point KEYS carry MEN_/WOMEN_ namespacing, but labels must not:
  // the brand already chose who the design is for — "Inseam", never "Men Inseam".
  return key
    .replace(/^(MEN|WOMEN|MENS|WOMENS|UNISEX)_/i, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function FittingsMarqueeRow({
  entries,
  unitLabel,
  reverse = false,
}: {
  entries: Array<[string, unknown]>;
  unitLabel: string;
  reverse?: boolean;
}) {
  const { theme } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (contentWidth <= 0) return undefined;
    // The row holds its chips twice, so translating by half the content width
    // wraps seamlessly back to the start.
    const distance = contentWidth / 2;
    const duration = Math.max(9000, entries.length * (reverse ? 3400 : 2700));
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -distance,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [contentWidth, entries.length, reverse, translateX]);

  return (
    <View style={styles.marqueeClip}>
      <Animated.View
        onLayout={(event) => setContentWidth(Math.round(event.nativeEvent.layout.width))}
        style={[styles.marqueeRow, { transform: [{ translateX }] }]}
      >
        {[...entries, ...entries].map(([key, value], chipIndex) => (
          <View
            key={`${key}-${chipIndex}`}
            style={[styles.measurementChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
          >
            <AppText variant="captionBold">
              {formatMeasurementKeyLabel(key)} · {String(value).trim()} {unitLabel}
            </AppText>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function MeasurementCard({
  sizeFit,
  computed,
  onPress,
}: {
  sizeFit: SizeFitProfile | null;
  computed: ComputedSizeFitProfile | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const measurements = Object.entries(sizeFit?.measurements ?? {}).filter(([, value]) => String(value).trim().length > 0);
  const measurementCount = measurements.length;
  const unitLabel = (sizeFit?.preferredLengthUnit ?? 'CM').toLowerCase();
  const computedLabel = computed?.estimatedSize ?? computed?.displayRange ?? null;
  const computedRegion = computed?.preferredRegion ? computed.preferredRegion.replace(/_/g, ' ') : null;
  const missingBaseline = computed?.missingBaselineMeasurements ?? [];
  const marqueeTopRow = measurements.filter((_, index) => index % 2 === 0);
  const marqueeBottomRow = measurements.filter((_, index) => index % 2 === 1);

  return (
    <Card padding="sm" style={[styles.fittingsCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <AppText variant="bodyBold">My fittings</AppText>
          <AppText variant="captionRegular" tone="muted">
            {measurementCount > 0
              ? `${measurementCount} saved measurement${measurementCount === 1 ? '' : 's'} for custom orders.`
              : 'Add your measurements once for faster custom orders.'}
          </AppText>
        </View>
        <Button title={measurements.length > 0 ? 'Edit' : 'Add'} size="sm" variant="secondary" onPress={onPress} />
      </View>

      {computedLabel ? (
        <View style={[styles.computedFitRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText variant="captionRegular" tone="muted">Computed fit</AppText>
          <AppText variant="bodyBold">
            📐 {computedLabel}
            {computedRegion ? ` · ${computedRegion}` : ''}
          </AppText>
        </View>
      ) : missingBaseline.length > 0 ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Add the missing baseline measurements to compute your size"
          style={[styles.computedFitRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <AppText variant="captionRegular" tone="muted">Computed fit</AppText>
          <AppText variant="captionBold" tone="secondary">
            ⚠️ Add {missingBaseline.map((key) => formatMeasurementKeyLabel(key)).join(' · ')} to see your size
          </AppText>
        </Pressable>
      ) : null}

      {measurements.length === 0 ? (
        <AppText variant="body" tone="muted" style={styles.measurementCopy}>
          Add your baseline measurements once and reuse them across custom orders.
        </AppText>
      ) : (
        <View style={styles.marqueeGroup}>
          <FittingsMarqueeRow entries={marqueeTopRow} unitLabel={unitLabel} />
          {marqueeBottomRow.length > 0 ? (
            <FittingsMarqueeRow entries={marqueeBottomRow} unitLabel={unitLabel} reverse />
          ) : null}
        </View>
      )}
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
        legacyCollectionId: item.legacyCollectionId ?? item.collectionId ?? destinationId,
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
  const { status, user, updateUser, validateToken, signOut } = useAuth();
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
  const [fittingsOpen, setFittingsOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [savingFittings, setSavingFittings] = useState(false);
  const [fitUnit, setFitUnit] = useState<'CM' | 'IN'>('CM');
  const [fitValues, setFitValues] = useState<Record<MeasurementKey, string>>({
    CHEST: '',
    WAIST: '',
    HIPS: '',
    SHOULDER: '',
    INSEAM: '',
    HEIGHT: '',
  });
  const loadRequestIdRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const redirectToAuthRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!warmProfileStateKey || !state.profile) return;
    writeWarmScreenState(warmProfileStateKey, state);
  }, [state, warmProfileStateKey]);

  const fallbackProfile = useMemo(() => buildFallbackProfile(user), [user]);
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
      redirectToAuthRef.current = false;
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
    redirectToAuthRef.current = false;
    setState(createEmptyProfileState());
    setError(null);
    setLoading(false);
    setRefreshing(false);
    setHasWarmProfileSnapshot(false);
  }, [status, user?.id]);

  useEffect(() => {
    if (status !== 'unauthenticated' || redirectToAuthRef.current) return;
    redirectToAuthRef.current = true;
    router.replace(PROFILE_LOGIN_ROUTE as any);
  }, [status]);

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

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (status !== 'authenticated' || !user?.id) {
      setLoading(false);
      setOrdersLoading(false);
      setRefreshing(false);
      setState(createEmptyProfileState());
      return;
    }

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
          : previousState.profile ?? fallbackProfile;
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
        profile: fallbackProfile,
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
  }, [fallbackProfile, status, user?.id]);

  useEffect(() => {
    if (!deferredWorkReady) return;
    navPerf.mark('background_refresh_started', 'tabs→me');
    void load().finally(() => {
      navPerf.mark('background_refresh_completed', 'tabs→me');
    });
  }, [deferredWorkReady, load]);

  useFocusEffect(
    useCallback(() => {
      if (!deferredWorkReady) return undefined;
      void refreshUnreadNotificationCount({
        authenticated: status === 'authenticated',
        forceRefresh: true,
      });
      return undefined;
    }, [deferredWorkReady, status]),
  );

  useEffect(() => {
    if (status === 'authenticated' && !loading) {
      navPerf.mark('cached_or_empty_state_visible', 'tabs→me');
      navPerf.dataReady('tabs→me');
    }
  }, [loading, status]);

  useEffect(() => {
    if (!fittingsOpen) return;
    const measurements = state.sizeFit?.measurements ?? {};
    setFitUnit(state.sizeFit?.preferredLengthUnit ?? 'CM');
    setFitValues({
      CHEST: String(measurements.CHEST ?? ''),
      WAIST: String(measurements.WAIST ?? ''),
      HIPS: String(measurements.HIPS ?? ''),
      SHOULDER: String(measurements.SHOULDER ?? ''),
      INSEAM: String(measurements.INSEAM ?? ''),
      HEIGHT: String(measurements.HEIGHT ?? ''),
    });
  }, [fittingsOpen, state.sizeFit]);

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
    router.push('/notifications' as any);
  }, []);

  const handleOpenSettings = useCallback(() => {
    router.push('/settings' as any);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      validateToken({ forceRefresh: true }),
      load({ silent: true }),
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

  const handleSaveFittings = useCallback(async () => {
    if (savingFittings) return;
    setSavingFittings(true);
    try {
      const measurements = Object.fromEntries(
        Object.entries(fitValues)
          .map(([key, value]) => [key, value.trim()])
          .filter(([, value]) => value.length > 0),
      );
      const updated = await ProfileApi.updateSizeFit({
        measurements,
        preferredLengthUnit: fitUnit,
      });
      setState((current) => ({ ...current, sizeFit: updated }));
      setFittingsOpen(false);
      toast.success('Fittings updated.');
    } catch (nextError) {
      toast.error('Could not update fittings. Please try again.');
    } finally {
      setSavingFittings(false);
    }
  }, [fitUnit, fitValues, savingFittings, toast]);

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

  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <BrandHeader />
        <ProfileSkeleton bottomPadding={contentBottomPadding} />
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <AppText variant="subtitle">Redirecting to sign in</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>
            Sign in to manage your saved looks, fittings, and orders.
          </AppText>
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
            <AppText variant="title" style={styles.centerText}>{profileIdentity.displayName}</AppText>
            {profileIdentity.handle ? (
              <AppText variant="body" tone="primary" style={styles.profileHandle}>{profileIdentity.handle}</AppText>
            ) : null}
            {profileIdentity.locationLabel ? (
              <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
                {profileIdentity.locationLabel}
              </AppText>
            ) : null}
            {state.computedSizeFit?.estimatedSize || state.computedSizeFit?.displayRange ? (
              <AppText variant="captionBold" tone="secondary" style={styles.centerText}>
                📐 {state.computedSizeFit.estimatedSize ?? state.computedSizeFit.displayRange}
                {state.computedSizeFit.preferredRegion
                  ? ` · ${state.computedSizeFit.preferredRegion.replace(/_/g, ' ')}`
                  : ''}
              </AppText>
            ) : null}
          </View>
        </View>

        <EmailVerificationNotice
          context="profile"
          userId={user?.id}
          email={user?.email}
          emailVerified={user?.isEmailVerified}
        />

        <View style={styles.actionGrid}>
          <View style={styles.actionRow}>
            <ProfileAction emoji="✏️" label="Edit info" accent="primary" onPress={() => router.push('/(tabs)/me-edit' as any)} />
            <ProfileAction emoji="📏" label="My fits" accent="success" onPress={() => setFittingsOpen(true)} />
            <ProfileAction emoji="📦" label="Orders" accent="primary" onPress={() => setActiveTab('Orders')} />
          </View>
          <View style={styles.actionRow}>
            <ProfileAction emoji="⭐" label="Reviews" accent="warning" onPress={() => router.push('/reviews' as any)} />
            <ProfileAction emoji="⚙️" label="Settings" accent="textSecondary" onPress={handleOpenSettings} />
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryStat title="Saved Looks" value={String(profileCounts.saved)} subtitle="inspiration" />
          <SummaryStat title="Patched" value={String(profileCounts.patches)} subtitle="brands" />
          <SummaryStat title="Recent" value={String(profileCounts.orders)} subtitle="orders" />
        </View>

        <MeasurementCard sizeFit={state.sizeFit} computed={state.computedSizeFit} onPress={() => setFittingsOpen(true)} />

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
              <Button title="View all orders" variant="outline" onPress={() => router.push('/orders' as any)} />
            </>
          )
        ) : null}
      </ScrollView>

      <ProfileImageModal
        visible={isAvatarModalOpen}
        imageUrl={avatarUri ?? profileIdentity.avatarSrc ?? null}
        onClose={() => setIsAvatarModalOpen(false)}
      />

      <AppBottomSheet
        visible={fittingsOpen}
        title="My fittings"
        subtitle="Update your measurements"
        onClose={() => setFittingsOpen(false)}
        footer={(
          <View style={styles.sheetFooterActions}>
            <Button title="Cancel" size="md" variant="outline" onPress={() => setFittingsOpen(false)} style={styles.sheetFooterButton} />
            <Button title="Done" size="md" onPress={() => void handleSaveFittings()} loading={savingFittings} style={styles.sheetFooterButton} />
          </View>
        )}
      >
        <View style={styles.unitRow}>
          {(['CM', 'IN'] as const).map((unit) => {
            const selected = unit === fitUnit;
            return (
              <Pressable
                key={unit}
                onPress={() => setFitUnit(unit)}
                style={({ pressed }) => [
                  styles.unitPill,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="bodyBold" tone={selected ? 'primary' : 'secondary'}>{unit}</AppText>
              </Pressable>
            );
          })}
        </View>

        {MEASUREMENT_FIELDS.map((field) => (
          <Input
            key={field.key}
            label={field.label}
            value={fitValues[field.key]}
            onChangeText={(value) => setFitValues((current) => ({ ...current, [field.key]: value.replace(/[^0-9.]/g, '') }))}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        ))}
      </AppBottomSheet>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
  },
  hero: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
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
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  centerText: {
    textAlign: 'center',
  },
  profileHandle: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  actionGrid: {
    gap: tokens.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  // Instagram-style soft action tile: solid tokenized fill, no outline —
  // hairline accent borders rendered as scratchy dashes on Android densities.
  actionCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
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
  computedFitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  marqueeGroup: {
    gap: tokens.spacing.sm,
  },
  marqueeClip: {
    overflow: 'hidden',
  },
  marqueeRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.sm,
  },
  measurementChip: {
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
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
  measurementCopy: {
    lineHeight: 18,
  },
  measurementEmpty: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
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
  sheetFooterActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sheetFooterButton: {
    flex: 1,
  },
  unitRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  unitPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import EmailVerificationNotice from '@/components/auth/EmailVerificationNotice';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ComputedSizeChip } from '@/components/sizing/ComputedSize';
import { UnifiedProductCard } from '@/components/commerce/UnifiedProductCard';
import { BackLink } from '@/components/ui/InlineNavLink';
import { Input } from '@/components/ui/Input';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { OrderListRow } from '@/components/orders/OrderListRow';
import ProfileImageModal from '@/components/profile/ProfileImageModal';
import { ProfileApi, type ComputedSizeFitProfile, type PatchedBrand, type SavedItem, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { BuyerOrdersApi, type BuyerOrderSummary } from '@/src/api/BuyerOrdersApi';
import { ProfilePhotoViewApi } from '@/src/api/ProfilePhotoViewApi';
import {
  useDataUsable,
  useFirstMeaningfulRender,
  useSkeletonTiming,
} from '@/src/perf/usePerfStages';
import { readWarmScreenState, subscribeWarmScreenState } from '@/src/state/screenWarmState';
import {
  fetchShopperProfileWarmState,
  shopperProfileWarmStateKey,
} from '@/src/profile/shopperProfileWarmup';
// Written through to disk, not only to the in-memory warm map: the profile is
// the screen where an empty first frame reads as a broken app.
import { persistScreenState } from '@/src/state/persistentScreenCache';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { drainPendingEmailVerification } from '@/src/auth/pendingEmailVerification';
import { useFrameBatchedItems } from '@/src/hooks/useFrameBatchedItems';
import { useDeferredScreenWork } from '@/src/hooks/useDeferredScreenWork';
import { resolveComputedSizeState } from '@/src/features/sizing/computedSize';
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
import { CLIP_EMOJI, CLIPS_TAB_LABEL } from '@/src/constants/clipping';
import {
  applyOrderSummaryUpdate,
  getOrderRevision,
  subscribeOrderChanges,
} from '@/src/features/orders/orderRevision';
import { getClipRevision } from '@/src/features/clipping/clipRevision';

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
/** Below this many orders, the tab rail alone is enough to find one. */
const PROFILE_ORDERS_SEARCH_THRESHOLD = 5;
/** The saved grid, laid out like Market's: two up, same gap, same proportions. */
const SAVED_CARD_GAP = tokens.spacing.md;
const SAVED_CARD_RATIO = 1.58;
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

/*
  The tab is the shopper's CLIPS.

  It read "Saved Looks", which is a third name for the thing the runway rail
  called "Save look", the viewer called "Save" and the browser called "Saved" —
  four labels for one feature. `ProfileTab` keeps its internal 'Saved' key so
  the deep links and analytics buckets already in the wild keep resolving; only
  what the reader sees changes.
*/
const getProfileTabLabel = (tab: ProfileTab) => (tab === 'Saved' ? CLIPS_TAB_LABEL : tab);

/**
 * The stat label under each count beside the avatar.
 *
 * Past tense, not the tab's noun: these read as "1 CLIPPED", describing what
 * the shopper has done, where the rail below reads "Clips", naming a place to
 * go. The old label said SAVED, which is not a word this app uses anywhere
 * else — the feature has been called clipping throughout.
 */
const getProfileStatLabel = (tab: ProfileTab) =>
  tab === 'Saved' ? 'Clipped' : tab;

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
 * `FittingsChips` (raw measurement values under the name) and
 * `FittingsSummaryCard` (the "My fittings" card under the summary row) both
 * lived here and are deliberately gone. Between them they put the sizing
 * points, their completeness bar, their problem count and a SECOND copy of
 * the computed size on a screen whose sizing question is one word long.
 *
 * What a profile shows about sizing is now exactly one thing: the computed
 * size, beside the avatar (`ComputedSizeChip`). The values, the duplicate
 * keys the server stores them under, the completeness state and every
 * correction path live on `app/fittings.tsx`, one tap away via the 📏 tile —
 * which is the screen that can actually act on any of them.
 */

/**
 * Saved Looks uses the same card as every other grid in the app.
 *
 * It used to have its own: a tall photo with a solid copy panel bolted
 * underneath, which is why the saved grid read as a different product from
 * Market, the brand shop and Adire. `UnifiedProductCard` is the agreed
 * treatment — full-bleed media, frosted copy over the bottom of the image —
 * and a saved item carries everything it asks for.
 *
 * No favourite button here: on this grid every card is already saved, so a
 * heart would have nothing to say. Tapping opens the item, as before.
 *
 * The brand line the old card carried is gone with it — no grid in the app
 * puts a brand name on a card, and the shared card has no slot for one. Saved
 * items with a price show it; a saved look that is quoted per order reads
 * "Price on request", the same as it does in Market.
 */
function SavedDesignCard({ item, width }: { item: SavedItem; width: number }) {
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
    <UnifiedProductCard
      width={width}
      height={Math.round(width * SAVED_CARD_RATIO)}
      title={item.title}
      priceLabel={typeof item.price === 'number' ? formatMoney(item.price) : null}
      mediaSrc={item.thumbnail ?? null}
      analyticsSourceScreen="profile_saved"
      onPress={onPress}
    />
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


export default function BuyerProfileScreen() {
  const { theme } = useTheme();
  const { standardScreenBottomPadding } = useScreenChrome();
  const deferredWorkReady = useDeferredScreenWork();
  const contentBottomPadding = standardScreenBottomPadding;
  const { status, sessionSettled, user, updateUser, validateToken, signOut } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const warmProfileStateKey = user?.id ? shopperProfileWarmStateKey(user.id) : null;
  const initialWarmProfileState = warmProfileStateKey ? readWarmScreenState<ProfileState>(warmProfileStateKey) : null;

  const [state, setState] = useState<ProfileState>(() => initialWarmProfileState ?? createEmptyProfileState());
  const [loading, setLoading] = useState(() => !initialWarmProfileState);
  const [ordersLoading, setOrdersLoading] = useState(() => !initialWarmProfileState);
  const [orderKind, setOrderKind] = useState<'all' | 'STANDARD' | 'CUSTOM'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Saved');
  // This is deliberately a ref rather than state. `load` is intentionally
  // stable across ordinary auth-profile object updates; capturing the initial
  // `false` value in that stable callback made a later refresh behave like the
  // very first load and turn a warm profile section back into a skeleton.
  const hasWarmProfileSnapshotRef = useRef(Boolean(initialWarmProfileState));
  const unreadNotificationCount = useUnreadNotificationCount();
  const { width: windowWidth } = useWindowDimensions();
  // Measured, not a percentage: `UnifiedProductCard` needs a number to size its
  // copy panel against, and a whole-pixel width keeps the two columns even.
  const savedCardWidth = Math.floor(
    (windowWidth - tokens.spacing.lg * 2 - SAVED_CARD_GAP) / 2,
  );

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

  /*
    T4 / T9 / T10 for this screen.

    T4 is deliberately `state.profile`, not the rendered profile record. The
    screen falls back to the auth user for the header, which is available
    synchronously and would make T4 read ~0ms on every run — a flattering
    number that says nothing, since the tabs underneath are still empty. The
    shopper's report was about the tabs, so the stage that matters is the one
    where real profile content exists.
  */
  useFirstMeaningfulRender(Boolean(state.profile), 'me:profile');
  useDataUsable(Boolean(state.profile), 'me:profile');
  useSkeletonTiming(loading, 'me:profile');
  const savedLooksOpenedTrackedRef = useRef(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const loadRequestIdRef = useRef(0);
  const lastProfileLoadAtRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!warmProfileStateKey || !state.profile) return;
    persistScreenState(warmProfileStateKey, state);
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
  const shopperEmail = user?.email?.trim() || profileRecord?.email?.trim() || null;
  /**
   * The PLACE, as a brand's header shows it — city, state, country.
   *
   * The street used to lead this line, which is what made it wrap: a full
   * street address does not fit one line in the column beside the avatar at any
   * readable size. Where someone lives is identity; the street is delivery
   * detail, and it lives with the delivery address at checkout. The street is
   * the last fallback only, for a profile with nothing else to show.
   */
  const shopperAddress = useMemo(() => {
    const parts = [
      profileRecord?.city?.trim(),
      profileRecord?.state?.trim(),
      profileRecord?.country?.trim(),
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return (
      profileRecord?.location?.trim() ||
      profileIdentity.locationLabel ||
      profileRecord?.address?.trim() ||
      null
    );
  }, [profileIdentity.locationLabel, profileRecord]);
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
  /**
   * Orders are filtered BEFORE the frame batcher sees them.
   *
   * The batcher reveals a slice of whatever it is given, so filtering its
   * output would search only the handful of rows already on screen and report
   * "no matches" for an order sitting two rows below the fold.
   */
  const orderMatches = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    return state.orders.filter((order) => {
      if (orderKind !== 'all' && order.kind !== orderKind) return false;
      if (!query) return true;
      return [order.title, order.brandName, order.status, order.sourceLabel, order.id]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [orderKind, orderSearch, state.orders]);

  const visibleOrderItems = useFrameBatchedItems(orderMatches, {
    enabled: activeTab === 'Orders',
    initialCount: PROFILE_INITIAL_SECTION_ITEMS,
    batchCount: PROFILE_SECTION_BATCH_ITEMS,
    resetKey: `Orders:${orderKind}:${orderSearch}:${orderMatches.length}:${orderMatches[0]?.id ?? ''}:${orderMatches[orderMatches.length - 1]?.id ?? ''}`,
  });

  /*
    Labels only, no counts. Same reason the button below carries no number:
    this tab holds a preview, so a count here would describe the preview and
    read as the total. `/orders` loads the history and shows them there.
  */
  const orderKindTabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All' },
      { key: 'STANDARD' as const, label: 'Standard' },
      { key: 'CUSTOM' as const, label: 'Custom' },
    ],
    [],
  );

  const profileTabItems = useMemo(
    () => PROFILE_TABS.map((tab) => ({ key: tab, label: getProfileTabLabel(tab) })),
    [],
  );

  useEffect(() => {
    if (status !== 'authenticated' || activeTab !== 'Saved' || savedLooksOpenedTrackedRef.current) return;
    savedLooksOpenedTrackedRef.current = true;
    trackMobileEvent('saved_looks_opened', {
      sourceScreen: 'profile',
      savedCountBucket: getSavedLooksCountBucket(state.saved.length),
    });
  }, [activeTab, state.saved.length, status]);

  useEffect(() => {
    // The identity can change while one of the six profile reads is still in
    // flight. Invalidate that completion before clearing visible state, or a
    // late response can repopulate a signed-out or different user's profile.
    loadRequestIdRef.current += 1;
    lastProfileLoadAtRef.current = 0;

    if (status === 'authenticated' && user?.id) {
      if (lastUserIdRef.current !== user.id) {
        lastUserIdRef.current = user.id;
        const cachedState = warmProfileStateKey ? readWarmScreenState<ProfileState>(warmProfileStateKey) : null;
        setState(cachedState ?? createEmptyProfileState());
        setError(null);
        setLoading(!cachedState);
        setRefreshing(false);
        hasWarmProfileSnapshotRef.current = Boolean(cachedState);
      }
      return;
    }

    lastUserIdRef.current = null;
    setState(createEmptyProfileState());
    setError(null);
    setLoading(false);
    setRefreshing(false);
    hasWarmProfileSnapshotRef.current = false;
  }, [status, user?.id, warmProfileStateKey]);

  /**
   * The tab shell starts its shopper-profile warm-up before this route is
   * opened. If the route wins that race, adopt the completed snapshot instead
   * of leaving the shopper on a cold skeleton until a second request settles.
   */
  useEffect(() => {
    if (!warmProfileStateKey) return undefined;

    return subscribeWarmScreenState(warmProfileStateKey, () => {
      if (hasWarmProfileSnapshotRef.current) return;
      const snapshot = readWarmScreenState<ProfileState>(warmProfileStateKey);
      if (!snapshot?.profile) return;

      hasWarmProfileSnapshotRef.current = true;
      setState(snapshot);
      setLoading(false);
      setOrdersLoading(false);
      setError(null);
    });
  }, [warmProfileStateKey]);

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
    if (!silent && !hasWarmProfileSnapshotRef.current) {
      setLoading(true);
    }
    setOrdersLoading(true);
    setError(null);
    try {
      /*
       * If the tab shell has already started the all-tab profile warm-up, join
       * that exact promise instead of issuing the six requests again. This is
       * the fast-tap case: the shopper reaches Me while the island shell is
       * still warming it.
       */
      if (!options?.force && !stateRef.current.profile) {
        const warmSnapshot = await fetchShopperProfileWarmState(user.id);
        if (requestId !== loadRequestIdRef.current) return;

        if (warmSnapshot) {
          setState(warmSnapshot);
          hasWarmProfileSnapshotRef.current = true;
          if (warmProfileStateKey) persistScreenState(warmProfileStateKey, warmSnapshot);
          setError(null);
          return;
        }
      }

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
      hasWarmProfileSnapshotRef.current = true;

      if (warmProfileStateKey) {
        persistScreenState(warmProfileStateKey, {
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
      hasWarmProfileSnapshotRef.current = true;
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
  }, [status, user?.id, warmProfileStateKey]);

  /**
   * Fetch on mount, NOT behind the deferred-work gate.
   *
   * `useDeferredScreenWork` yields one animation frame before running, which is
   * the right contract for work that competes with the destination's first
   * paint — subscriptions, analytics, prefetch. A network request competes with
   * nothing: it is latency on another thread, and the sooner it leaves the
   * sooner the screen can settle.
   *
   * Worse, a rAF callback cannot run while the JS thread is busy, and on this
   * tab it reliably is: the Runway feed and the market pre-warm are both
   * rendering when Me mounts. The trace showed `screen_mounted` and then a
   * 2.5-SECOND wait before the request was even issued — the gate, not the API,
   * was most of the delay a shopper felt. Starting here overlaps the round trip
   * with that render instead of queueing behind it.
   */
  useEffect(() => {
    navPerf.mark('background_refresh_started', 'tabs→me');
    void load().finally(() => {
      navPerf.mark('background_refresh_completed', 'tabs→me');
    });
  }, [load]);

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
  /** Last clip-write count this screen has reloaded for. */
  const lastClipRevisionRef = useRef(getClipRevision());
  /** Same, for order writes that can move a date on a row. */
  const lastOrderRevisionRef = useRef(getOrderRevision());
  useEffect(() => {
    return subscribeOrderChanges((change) => {
      lastOrderRevisionRef.current = getOrderRevision();
      const summary = change.summary;
      if (!summary) return;

      // The extension endpoint has already returned the new server-resolved
      // schedule. Replace the visible row synchronously; do not make the
      // shopper leave and re-enter this tab to stop seeing the old deadline.
      setState((current) => ({
        ...current,
        orders: applyOrderSummaryUpdate(current.orders, summary),
      }));
    });
  }, []);
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

      /*
        Clips made elsewhere since the last time this screen was looked at.

        `load()` coalesces anything inside 15 seconds, which is right for a
        focus that changed nothing and wrong for the one case where the shopper
        just clipped a piece in the viewer and came straight here. The counter
        moves only on a real write, so this forces a reload exactly then.
      */
      if (status === 'authenticated' && lastClipRevisionRef.current !== getClipRevision()) {
        lastClipRevisionRef.current = getClipRevision();
        void load({ silent: true, force: true });
      }

      /*
        The same, for orders — and it matters more here.

        An order row carries a countdown, and an approved extension moves the
        date it counts to. Left to the 15-second coalescing window, a shopper
        who granted extra time and came straight back to their profile saw the
        OLD number: not merely stale, but wrong about the single fact the row
        exists to state. `silent` so the list updates underneath rather than
        collapsing into a skeleton the shopper has to watch reload.
      */
      if (status === 'authenticated' && lastOrderRevisionRef.current !== getOrderRevision()) {
        lastOrderRevisionRef.current = getOrderRevision();
        void load({ silent: true, force: true });
      }

      hasFocusedOnceRef.current = true;
      return undefined;
    }, [deferredWorkReady, load, refreshSizeFit, status]),
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

  /**
   * Pulling down on your own profile is also "check my email again".
   *
   * Refreshing already re-read the account, which is enough when the server
   * recorded the confirmation. It is not enough when the link reached this
   * device and its request never landed — a cold start with no network, or the
   * OS reclaiming the app while the person was still in their mail client. The
   * account is then genuinely unverified and no number of re-reads will change
   * that, which is exactly the "I confirmed it, the flag is still there, and
   * refreshing does nothing" case.
   *
   * So an unverified account retries the stored link first, and only then reads
   * the account back. The toast belongs here and nowhere else in this flow: the
   * person just asked, so an answer is owed. Every other path to the same check
   * runs on its own and lets the banner disappear without comment.
   */
  const emailUnverified = user?.isEmailVerified === false;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    lastProfileLoadAtRef.current = 0;
    await Promise.all([
      (async () => {
        const outcome = emailUnverified
          ? await drainPendingEmailVerification().catch(() => null)
          : null;
        await validateToken({ forceRefresh: true });
        if (outcome?.status === 'verified') {
          updateUser({ isEmailVerified: true });
          toast.success('Email verified.');
        }
      })(),
      load({ silent: true, force: true }),
      refreshUnreadNotificationCount({ authenticated: true, forceRefresh: true }),
    ]);
  }, [emailUnverified, load, toast, updateUser, validateToken]);

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

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          // Local session cleanup happens synchronously. Leave this private
          // screen at once; server revocation continues safely in background.
          void signOut();
          router.replace('/(tabs)' as any);
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
            {/* "Create an account" is the decision on this screen, so it is
                the only button. Leaving is a link. */}
            <BackLink
              label="Runway"
              onPress={() => router.replace('/' as any)}
              style={styles.signedOutBackLink}
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
        {/*
          No card around the identity.

          Wrapping it in an elevated panel gave the top of the screen a filled
          slab that the rest of the page did not share, so the profile read as a
          widget sitting on the app rather than as the top of it. The counts
          below still need their dividing rules, but the identity itself sits
          directly on the screen's own background — nothing behind it.
        */}
        <View style={styles.heroCard}>
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
            {/*
              Plain lines, the way a brand's header shows its location — no box.
              Each was a bordered tag, which made two facts about the person
              look like two buttons. One line each, never wrapped: a long
              address or email shrinks to fit (down to 80%) instead of breaking
              onto a second line and pushing the actions down.
            */}
            {(shopperEmail || shopperAddress) ? (
              <View style={styles.identityMetaStack}>
                {shopperAddress ? (
                  <AppText
                    variant="small"
                    tone="secondary"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.identityMetaLine}
                  >
                    📍 {shopperAddress}
                  </AppText>
                ) : null}
                {shopperEmail ? (
                  <AppText
                    variant="small"
                    tone="muted"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.identityMetaLine}
                  >
                    ✉️ {shopperEmail}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </View>

          {/*
            The ONLY sizing readout on this screen, by product decision.

            Raw measurement values used to sit under the name as a chip row, and
            a "My fittings" card further down repeated the completeness bar, the
            problem count and a second copy of the size. A profile answers "what
            size am I"; the numbers that produce that answer, their completeness
            and their problems all belong on `/fittings`, which is the screen
            that can act on them. Everything below is reachable in one tap from
            the 📏 tile in the action row.

            Renders only when there IS a size (or when a saved measurement is
            blocking one). The reason there is not one — an unpublished size
            chart is a WIEZ setup step, missing points are the shopper's —
            belongs on `/fittings` too.
          */}
            <ComputedSizeChip state={computedSizeState} onPress={handleOpenFittings} />
          </View>

          {/*
            The three counts, inside the identity card rather than only on the
            tab rail.

            A profile's first job is to say how much there IS of you here, and
            the rail answers that only for the tab you are already looking at.
            Divided cells rather than three floating numbers: the rules are what
            stop them reading as one run-on figure.
          */}
          <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.statRow}>
            {PROFILE_TABS.map((tab, index) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="button"
                accessibilityLabel={`${profileCounts[tab.toLowerCase() as keyof typeof profileCounts]} ${tab}`}
                style={({ pressed }) => [
                  styles.statCell,
                  index > 0
                    ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.colors.border }
                    : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="h2" numberOfLines={1}>
                  {profileCounts[tab.toLowerCase() as keyof typeof profileCounts]}
                </AppText>
                <AppText variant="statLabel" tone="muted" numberOfLines={1}>
                  {getProfileStatLabel(tab).toUpperCase()}
                </AppText>
              </Pressable>
            ))}
          </View>
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

        {/*
          The second counts row used to sit here — Clips / Patched / Recent,
          repeating the three numbers already shown beside the avatar and then
          repeating their names a third time on the tab rail directly below.
          Three statements of the same fact in one screenful. The counts belong
          next to the identity they describe, so that is the only place they
          are now.
        */}

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

        {/* One rule that travels to the tab you picked — see SegmentedTabs. */}
        <SegmentedTabs items={profileTabItems} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'Saved' ? (
          state.saved.length === 0 ? (
            <EmptyState
              emoji={CLIP_EMOJI}
              title="Nothing clipped yet"
              body="Clip a piece you want to come back to and it waits for you here."
              cta="Browse Runway"
              onPress={() => topLevelNavigate('/(tabs)' as any)}
            />
          ) : (
            <View style={styles.savedGrid}>
              {visibleSavedItems.map((item) => (
                <SavedDesignCard key={item.id} item={item} width={savedCardWidth} />
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
              <SegmentedTabs items={orderKindTabs} value={orderKind} onChange={setOrderKind} />

              {/* Search earns its place once sorting alone stops narrowing the
                  list — below that it is a control asking to be ignored. */}
              {state.orders.length >= PROFILE_ORDERS_SEARCH_THRESHOLD ? (
                <Input
                  label="Search orders"
                  hideLabel
                  placeholder="Search orders, brands or status"
                  value={orderSearch}
                  onChangeText={setOrderSearch}
                  autoCorrect={false}
                  returnKeyType="search"
                  containerStyle={styles.ordersSearch}
                />
              ) : null}

              {/* The FILTERED length, not the batched slice: the batcher's
                  first frame is a slice of the matches, not a verdict on them. */}
              {orderMatches.length === 0 ? (
                <View style={[styles.ordersPreviewState, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <AppText variant="bodyBold">No orders match</AppText>
                  <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
                    {orderSearch.trim()
                      ? `Nothing here matches “${orderSearch.trim()}”.`
                      : 'Nothing of this kind yet.'}
                  </AppText>
                </View>
              ) : (
                <View style={styles.ordersList}>
                  {visibleOrderItems.map((order, index) => (
                    <OrderListRow
                      key={order.id}
                      order={order}
                      last={index === visibleOrderItems.length - 1}
                      // Stacked cards here, hairline rules on `/orders`. This is
                      // a short preview among other kinds of content, so each
                      // order needs an edge of its own to read as one thing.
                      variant="card"
                      onPress={() =>
                        topLevelNavigate({
                          pathname: '/orders/[orderId]',
                          params: { orderId: order.id },
                        } as any)
                      }
                    />
                  ))}
                </View>
              )}

              {/* The full history is the destination this tab previews, so the
                  control that opens it is the primary action here, not a
                  hairline outline sitting under the last row. */}
              {/* No count in this label. This tab fetches a PREVIEW
                  (PROFILE_ORDERS_PREVIEW_LIMIT), so the number here would be 6
                  for a shopper with forty orders — an invitation to view all
                  of them that understates how many there are. */}
              <Button
                title="View all orders"
                variant="primary"
                onPress={() => drillDownPush('/orders' as any)}
              />
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
  /** Centred under the sign-up buttons it replaces a button in. */
  signedOutBackLink: {
    alignSelf: 'center',
  },
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
  heroCard: {
    gap: tokens.spacing.lg,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.lg,
  },
  statDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  statRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
    paddingVertical: tokens.spacing.xs,
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
  centerText: {
    textAlign: 'center',
  },
  profileHandle: {
    fontStyle: 'italic',
  },
  identityMetaStack: {
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  identityMetaLine: {
    // Full column width is what `adjustsFontSizeToFit` measures against.
    alignSelf: 'stretch',
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
  errorCard: {
    gap: tokens.spacing.xs,
    borderWidth: 1,
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SAVED_CARD_GAP,
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
  /**
   * Orders are a LIST, so they get list geometry: rows the full width of the
   * column, each closed by a hairline, and no gap. The gap plus a rounded,
   * bordered card per order made six orders read as six separate objects that
   * happened to be stacked.
   */
  ordersList: {
    marginTop: tokens.spacing.xs,
    // Cards need air between them; the hairline variant on `/orders` does not.
    gap: tokens.spacing.sm,
  },
  ordersSearch: {
    marginTop: tokens.spacing.xs,
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

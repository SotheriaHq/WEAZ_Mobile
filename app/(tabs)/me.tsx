import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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
/**
 * Every point carries a plain-language hint.
 *
 * "Inseam" is a tailoring word, not an everyday one, and a shopper who does not
 * know it has two options with a bare label: guess, or give up. A wrong guess is
 * worse than a blank — it produces a garment that does not fit and an order
 * nobody can explain. The hint says WHERE to put the tape, in the words someone
 * would use to describe it to a friend.
 */
const MEASUREMENT_FIELDS: Array<{ key: MeasurementKey; label: string; hint: string }> = [
  { key: 'CHEST', label: 'Chest', hint: 'Around the fullest part, under the arms' },
  { key: 'WAIST', label: 'Waist', hint: 'Around the narrowest part, above the belly button' },
  { key: 'HIPS', label: 'Hips', hint: 'Around the fullest part of your seat' },
  { key: 'SHOULDER', label: 'Shoulder', hint: 'Across the back, shoulder bone to shoulder bone' },
  { key: 'INSEAM', label: 'Inseam', hint: 'Inside the leg, crotch down to the ankle' },
  { key: 'HEIGHT', label: 'Height', hint: 'Standing, head to floor, no shoes' },
];

/** Hints for baseline points the SERVER asks for that are not in the six above. */
const EXTRA_MEASUREMENT_HINTS: Record<string, string> = {
  CHEST_BUST: 'Around the fullest part, under the arms',
  BUST: 'Around the fullest part of the bust',
  HIP_SEAT: 'Around the fullest part of your seat',
  NECK_COLLAR: 'Around the base of the neck, where a collar sits',
  SLEEVE_LENGTH: 'Shoulder bone to wrist, arm slightly bent',
  S_LENGTH: 'Shoulder bone to wrist, arm slightly bent',
  ARM_HOLE: 'Around the armhole, through the armpit',
  THIGH: 'Around the fullest part of the thigh',
  WRIST: 'Around the wrist bone',
  BACK_LENGTH: 'Base of the neck down to the waist',
};

function getMeasurementHint(key: string): string | null {
  const known = MEASUREMENT_FIELDS.find((field) => field.key === key);
  if (known) return known.hint;
  const normalized = key.replace(/^(MEN|WOMEN|MENS|WOMENS|UNISEX)_/i, '').toUpperCase();
  return EXTRA_MEASUREMENT_HINTS[normalized] ?? null;
}

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

/**
 * Canonical order for the fittings table.
 *
 * `Object.entries(sizeFit.measurements)` yields whatever order the server
 * happened to serialise, which changes between saves — so the same person's
 * measurements appeared in a different order each visit and could not be
 * compared against anything, including their own memory. Known points come
 * first in `MEASUREMENT_FIELDS` order (the order a tailor takes them), then any
 * extra points a brand asked for, alphabetically.
 */
function orderMeasurementEntries(
  entries: Array<[string, unknown]>,
): Array<[string, unknown]> {
  const rank = (key: string) => {
    const index = MEASUREMENT_FIELDS.findIndex((field) => field.key === key);
    return index === -1 ? MEASUREMENT_FIELDS.length : index;
  };
  return [...entries].sort((a, b) => {
    const delta = rank(a[0]) - rank(b[0]);
    if (delta !== 0) return delta;
    return formatMeasurementKeyLabel(a[0]).localeCompare(formatMeasurementKeyLabel(b[0]));
  });
}

/**
 * One measurement, as a row you can actually read.
 *
 * This replaces a pair of infinitely-looping marquees. The measurements used to
 * slide horizontally in opposite directions at different speeds, forever — so
 * the one thing the card exists to show could not be read without chasing it,
 * two values could never be compared because they were never on screen
 * together, and nothing lined up with anything. It also kept two
 * `Animated.loop`s running for the entire life of the profile screen to
 * decorate six static numbers.
 *
 * Label left, value right, one fixed column for the numbers so the digits stack
 * vertically and a wrong entry is obvious at a glance.
 */
function MeasurementRow({
  label,
  value,
  unitLabel,
  showDivider,
}: {
  label: string;
  /** `null` = not saved yet. Rendered as an em dash, not omitted. */
  value: string | null;
  unitLabel: string;
  showDivider: boolean;
}) {
  const { theme } = useTheme();
  const isSet = Boolean(value);
  return (
    <View
      style={[
        styles.measurementRow,
        showDivider ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border } : null,
      ]}
    >
      <AppText
        variant="body"
        tone={isSet ? 'secondary' : 'muted'}
        numberOfLines={1}
        style={styles.measurementRowLabel}
      >
        {label}
      </AppText>
      <View style={styles.measurementRowValue}>
        {isSet ? (
          <>
            <AppText variant="bodyBold" numberOfLines={1}>
              {value}
            </AppText>
            <AppText variant="captionRegular" tone="muted" style={styles.measurementRowUnit}>
              {unitLabel}
            </AppText>
          </>
        ) : (
          <AppText variant="bodyBold" tone="muted" numberOfLines={1}>
            —
          </AppText>
        )}
      </View>
    </View>
  );
}

const CONFIDENCE_LABELS: Record<string, string> = {
  VERY_HIGH: 'Very confident',
  HIGH: 'Confident',
  MODERATE: 'Fair confidence',
  LOW: 'Low confidence',
};

/**
 * The computed fit is the point of this card; the raw numbers are the workings.
 *
 * Two things were wrong. It rendered almost none of what
 * `/users/me/size-fit/computed` actually returns — `estimatedSize`,
 * `displayRange` and region only — while `confidenceLabel`, the per-garment
 * `categoryBreakdown` and `staleMeasurementWarning` were fetched on every
 * profile load and thrown away. And the measurement rows had a fixed,
 * always-open position, so the card's least interesting content (numbers the
 * user typed in themselves and already knows) took the most space and pushed
 * the answer they came for down the screen.
 *
 * The computed size leads now, the per-garment sizes sit under it, and the
 * points collapse behind a disclosure. It opens expanded only when there is no
 * computed answer yet — at that point the empty rows ARE the instruction.
 */
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
  const measurements = Object.entries(sizeFit?.measurements ?? {}).filter(
    ([, value]) => String(value).trim().length > 0,
  );
  const measurementCount = measurements.length;
  const unitLabel = (sizeFit?.preferredLengthUnit ?? 'CM').toLowerCase();
  const computedLabel = computed?.estimatedSize ?? computed?.displayRange ?? null;
  const computedRegion = computed?.preferredRegion ? computed.preferredRegion.replace(/_/g, ' ') : null;
  const confidence = computed?.confidenceLabel ? CONFIDENCE_LABELS[computed.confidenceLabel] : null;
  const missingBaseline = computed?.missingBaselineMeasurements ?? [];

  /**
   * Per-garment sizes. The server has always sent `categoryBreakdown` and
   * nothing rendered it, so a shopper could not see that their dress size and
   * their trouser size differ — which is most of what a size profile is for.
   */
  const categoryBreakdown = Object.entries(computed?.categoryBreakdown ?? {})
    .map(([category, recommendation]) => ({
      category,
      size:
        recommendation?.recommendedSize ??
        recommendation?.estimatedSize ??
        recommendation?.displayRange ??
        null,
    }))
    .filter((entry) => Boolean(entry.size));

  /**
   * ONE list, whether the value is there or not.
   *
   * The empty state used to be three separate things saying the same thing
   * twice: the subtitle ("Add your measurements once for faster custom
   * orders"), a paragraph underneath repeating it almost verbatim ("Add your
   * baseline measurements once and reuse them across custom orders"), and — in
   * between — the server's missing-baseline list crammed into a single line
   * beside the words "Computed fit". Eight point names separated by dots, wrapped
   * mid-word and clipped at the screen edge: "Add Height · Chest Bust · Waist ·
   * Hip Seat · Shoulder · S". Unreadable, and it told the user what was missing
   * in a shape they could not act on.
   *
   * The rows below ARE the answer to "what do you need from me": every point
   * this account is expected to have, in a tailor's order, values where they
   * exist and an em dash where they do not. Nothing is described in prose that
   * the table already shows.
   */
  const savedByKey = new Map(measurements.map(([key, value]) => [key, String(value).trim()]));
  const requiredKeys =
    missingBaseline.length > 0
      ? missingBaseline
      : MEASUREMENT_FIELDS.map((field) => field.key);
  const rowKeys = orderMeasurementEntries(
    Array.from(new Set([...savedByKey.keys(), ...requiredKeys])).map((key) => [key, null]),
  ).map(([key]) => String(key));

  // Expanded only while there is no computed answer to show in its place.
  const [pointsExpanded, setPointsExpanded] = React.useState(!computedLabel);

  const togglePoints = React.useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPointsExpanded((current) => !current);
  }, []);

  return (
    <Card padding="sm" style={[styles.fittingsCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <AppText variant="bodyBold">My fittings</AppText>
          <AppText variant="captionRegular" tone="muted">
            {computedLabel
              ? 'Worked out from your measurements — reused on every custom order.'
              : 'Save these once and no brand has to ask you again.'}
          </AppText>
        </View>
        <Button
          title={measurementCount > 0 ? 'Edit' : 'Add'}
          size="sm"
          variant="secondary"
          onPress={onPress}
        />
      </View>

      {computedLabel ? (
        <View
          style={[
            styles.computedFitHero,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <AppText variant="captionBold" tone="muted">Your size</AppText>
          <AppText variant="display">{computedLabel}</AppText>
          <AppText variant="captionRegular" tone="muted">
            {[computedRegion, confidence].filter(Boolean).join(' · ') ||
              'Based on your saved measurements'}
          </AppText>
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Add your measurements to see your computed size"
          style={({ pressed }) => [
            styles.computedFitHero,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pressed ? styles.pressed : null,
          ]}
        >
          <AppText variant="captionBold" tone="muted">Your size</AppText>
          <AppText variant="subtitle" tone="muted">Not worked out yet</AppText>
          <AppText variant="captionRegular" tone="muted">
            Fill in the points below and it appears here.
          </AppText>
        </Pressable>
      )}

      {categoryBreakdown.length > 0 ? (
        <View style={styles.categorySizeWrap}>
          {categoryBreakdown.map((entry) => (
            <View
              key={entry.category}
              style={[
                styles.categorySizePill,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
                {formatMeasurementKeyLabel(entry.category)}
              </AppText>
              <AppText variant="captionBold" numberOfLines={1}>{entry.size}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {computed?.staleMeasurementWarning ? (
        <AppText variant="captionRegular" tone="warning">
          These measurements are getting old — worth checking before your next order.
        </AppText>
      ) : null}

      <Pressable
        onPress={togglePoints}
        accessibilityRole="button"
        accessibilityState={{ expanded: pointsExpanded }}
        accessibilityLabel={`${pointsExpanded ? 'Hide' : 'Show'} your measurement points`}
        style={({ pressed }) => [
          styles.pointsToggle,
          { borderTopColor: theme.colors.border },
          pressed ? styles.pressed : null,
        ]}
      >
        <AppText variant="captionBold" tone="secondary">
          Measurement points · {measurementCount}/{rowKeys.length}
        </AppText>
        <AppText variant="captionBold" tone="secondary">{pointsExpanded ? '▲' : '▼'}</AppText>
      </Pressable>

      {pointsExpanded ? (
        <View style={styles.measurementTable}>
          {rowKeys.map((key, index) => (
            <MeasurementRow
              key={key}
              label={formatMeasurementKeyLabel(key)}
              value={savedByKey.get(key) ?? null}
              unitLabel={unitLabel}
              showDivider={index > 0}
            />
          ))}
        </View>
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
        legacyCollectionId: item.legacyCollectionId ?? item.collectionId ?? destinationId,
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
          <ProfileAction emoji="📏" label="My fittings" accent="success" onPress={() => setFittingsOpen(true)} />
          <ProfileAction emoji="📦" label="Orders" accent="primary" onPress={() => setActiveTab('Orders')} />
          <ProfileAction emoji="⭐" label="Reviews" accent="warning" onPress={() => drillDownPush('/reviews' as any)} />
          <ProfileAction emoji="⚙️" label="Settings" accent="neutral" onPress={handleOpenSettings} />
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
        {/*
          Units first, then the points in pairs.

          This was a bare toggle over six identical full-width fields — an
          undifferentiated stack the user had to scroll through with the
          keyboard up, with nothing saying which unit they were typing in once
          the toggle had scrolled off the top. Pairing the fields halves the
          height so the whole body fits above the keyboard on a normal handset,
          and every field now carries its unit as a suffix so the answer is
          always next to the question.
        */}
        <View style={styles.unitBlock}>
          <AppText variant="smallBold" tone="secondary">Units</AppText>
          <View style={styles.unitRow}>
            {(['CM', 'IN'] as const).map((unit) => {
              const selected = unit === fitUnit;
              return (
                <Pressable
                  key={unit}
                  onPress={() => setFitUnit(unit)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.unitPill,
                    {
                      backgroundColor: selected ? theme.colors.primarySoft : 'transparent',
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <AppText variant="bodyBold" tone={selected ? 'primary' : 'secondary'}>
                    {unit === 'CM' ? 'Centimetres' : 'Inches'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/*
          One field per row, each with a plain-language hint.

          The two-column grid that was here saved vertical space, but there is
          no room beside a 48%-wide field for "Inside the leg, crotch down to the
          ankle" — and without that hint a shopper who does not know what an
          inseam is has to guess. A wrong guess is worse than a blank: it makes a
          garment that does not fit and an order nobody can explain. The extra
          height is scrollable; the ambiguity was not fixable.
        */}
        <View style={styles.fitFieldList}>
          {MEASUREMENT_FIELDS.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              helperText={field.hint}
              value={fitValues[field.key]}
              onChangeText={(value) =>
                setFitValues((current) => ({
                  ...current,
                  [field.key]: value.replace(/[^0-9.]/g, ''),
                }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
              trailing={
                <AppText variant="captionRegular" tone="muted">
                  {fitUnit.toLowerCase()}
                </AppText>
              }
            />
          ))}
        </View>

        <View style={[styles.fitFooterNote, { borderTopColor: theme.colors.border }]}>
          <AppText variant="smallBold" tone="secondary">
            Measure over light clothing, tape snug but not tight.
          </AppText>
          <AppText variant="captionRegular" tone="muted" style={styles.fitFooterNoteBody}>
            Saved once and reused on every custom order, so a brand never has to ask again.
          </AppText>
        </View>
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
  measurementTable: {
    // No gap: the hairline dividers on each row do the separating, and a gap
    // would break the continuous rule down the list.
    marginTop: tokens.spacing.xs,
  },
  measurementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
    minHeight: 40,
    paddingVertical: tokens.spacing.xs,
  },
  measurementRowLabel: {
    flex: 1,
    minWidth: 0,
  },
  measurementRowValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: tokens.spacing.xs,
    // Fixed column so every number ends on the same vertical line — the whole
    // point of a table. Wide enough for "100" plus a two-letter unit.
    width: 88,
  },
  measurementRowUnit: {
    minWidth: 0,
  },
  computedFitHero: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
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
  pointsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing.sm,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: tokens.spacing.xs,
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
  sheetFooterActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sheetFooterButton: {
    flex: 1,
  },
  unitBlock: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  unitRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  fitFieldList: {
    gap: tokens.spacing.md,
  },
  fitFooterNote: {
    gap: tokens.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
  },
  fitFooterNoteBody: {
    lineHeight: 18,
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

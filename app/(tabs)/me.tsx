import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { StableImage } from '@/components/ui/StableImage';
import { ProfileApi, type Order, type PatchedBrand, type SavedItem, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { trackMobileEvent } from '@/src/analytics/mobileAnalytics';
import { useAuth, type AuthUser } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { resolveIdentity } from '@/src/utils/identity';
import { profileDevWarn } from '@/src/features/feed/utils/feedDiagnostics';
import { useScreenChrome } from '@/src/system/ScreenChrome';
import { routeForDesignTarget, routeForStoreCollectionTarget } from '@/src/utils/mobileRouting';
import {
  MOBILE_UPLOAD_POLICIES,
  getMobileUploadValidationMessage,
  assertValidPickedUploadAsset,
} from '@/src/utils/uploadValidation';

type ProfileTab = 'Saved' | 'Patches' | 'Orders';

type ProfileState = {
  profile: UserProfile | null;
  sizeFit: SizeFitProfile | null;
  saved: SavedItem[];
  patches: PatchedBrand[];
  orders: Order[];
};

type MeasurementKey = 'CHEST' | 'WAIST' | 'HIPS' | 'SHOULDER' | 'INSEAM' | 'HEIGHT';

const PROFILE_LOGIN_ROUTE = { pathname: '/(auth)/login', params: { next: '/(tabs)/me' } } as const;

const PROFILE_TABS: ProfileTab[] = ['Saved', 'Patches', 'Orders'];
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
        <Skeleton width={80} height={80} borderRadius={40} />
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
            <Skeleton width={50} height={50} borderRadius={25} />
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

function SummaryStat({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  const { theme } = useTheme();
  return (
    <Card padding="md" style={[styles.summaryCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <AppText variant="captionRegular" tone="muted">{title}</AppText>
      <AppText variant="subtitle">{value}</AppText>
      <AppText variant="captionRegular" tone="muted">{subtitle}</AppText>
    </Card>
  );
}

function ProfileAction({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionCard, { backgroundColor: theme.colors.surfaceAlt }, pressed ? styles.pressed : null]}
    >
      <AppText variant="captionBold">{emoji}</AppText>
      <AppText variant="bodyBold" numberOfLines={1}>{label}</AppText>
    </Pressable>
  );
}

function MeasurementCard({
  sizeFit,
  onPress,
}: {
  sizeFit: SizeFitProfile | null;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const measurements = Object.entries(sizeFit?.measurements ?? {}).filter(([, value]) => String(value).trim().length > 0);
  const measurementCount = measurements.length;

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

      {measurements.length === 0 ? (
        <AppText variant="body" tone="muted" style={styles.measurementCopy}>
          Add your baseline measurements once and reuse them across custom orders.
        </AppText>
      ) : null}

      {measurements.length > 0 ? (
        <AppText variant="captionRegular" tone="muted" style={styles.measurementCopy}>
          Tap Edit to update your saved fit or add a missing measurement.
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
    if (item.targetType === 'PRODUCT') {
      router.push({ pathname: '/products/[productId]', params: { productId: destinationId } } as any);
      return;
    }
    if (item.targetType === 'COLLECTION') {
      router.push(routeForStoreCollectionTarget(destinationId) as any);
      return;
    }
    router.push(
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
        router.push({
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

function OrderRow({ order }: { order: Order }) {
  const { theme } = useTheme();
  const firstItem = order.items?.[0];
  return (
    <View style={[styles.listCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {firstItem?.thumbnail ? (
        <StableImage uri={firstItem.thumbnail} containerStyle={styles.rowAvatar} imageStyle={styles.rowAvatar} />
      ) : (
        <View style={[styles.rowAvatar, { backgroundColor: theme.colors.surfaceAlt }]}>
          <AppText variant="captionBold">📦</AppText>
        </View>
      )}
      <View style={styles.listCopy}>
        <AppText variant="bodyBold" numberOfLines={1}>{firstItem?.productName || 'Order'}</AppText>
        <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
          {order.status} · {formatDate(order.createdAt)}
        </AppText>
      </View>
      <View style={styles.orderMeta}>
        <AppText variant="captionBold">{formatCurrency(order.totalAmount, order.currency)}</AppText>
        <AppText variant="captionRegular" tone="muted">
          {order.items?.length ?? 0} item{(order.items?.length ?? 0) === 1 ? '' : 's'}
        </AppText>
      </View>
    </View>
  );
}

export default function BuyerProfileScreen() {
  const { theme } = useTheme();
  const { standardScreenBottomPadding } = useScreenChrome();
  const contentBottomPadding = standardScreenBottomPadding;
  const { status, user, updateUser, signOut } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  const [state, setState] = useState<ProfileState>(() => createEmptyProfileState());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Saved');
  const savedLooksOpenedTrackedRef = useRef(false);
  const [editOpen, setEditOpen] = useState(false);
  const [fittingsOpen, setFittingsOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFittings, setSavingFittings] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
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

  const fallbackProfile = useMemo(() => buildFallbackProfile(user), [user]);
  const profileRecord = state.profile ?? fallbackProfile;
  const profileIdentity = useMemo(() => resolveIdentity(profileRecord), [profileRecord]);
  const hasProfile = Boolean(profileRecord);
  const profileCounts = useMemo(
    () => ({
      saved: state.saved.length,
      patches: state.patches.length,
      orders: state.orders.length,
    }),
    [state.orders.length, state.patches.length, state.saved.length],
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
    if (status === 'authenticated' && user?.id) {
      redirectToAuthRef.current = false;
      if (lastUserIdRef.current !== user.id) {
        lastUserIdRef.current = user.id;
        setState(createEmptyProfileState());
        setError(null);
        setLoading(true);
        setRefreshing(false);
      }
      return;
    }

    lastUserIdRef.current = null;
    redirectToAuthRef.current = false;
    setState(createEmptyProfileState());
    setError(null);
    setLoading(false);
    setRefreshing(false);
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
      router.replace('/orders' as any);
      return;
    }
    if (normalized === 'saved') setActiveTab('Saved');
  }, [requestedTab]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (status !== 'authenticated' || !user?.id) {
      setLoading(false);
      setRefreshing(false);
      setState(createEmptyProfileState());
      return;
    }

    const requestId = ++loadRequestIdRef.current;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [profileResult, sizeFitResult, savedResult, patchesResult, ordersResult] = await Promise.allSettled([
        ProfileApi.getMe(),
        ProfileApi.getSizeFit(),
        ProfileApi.getSaved(),
        ProfileApi.getPatches(user.id),
        ProfileApi.getOrders({ limit: 20, page: 1 }),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      const nextProfile =
        profileResult.status === 'fulfilled' && profileResult.value
          ? profileResult.value
          : fallbackProfile;
      const nextSizeFit = sizeFitResult.status === 'fulfilled' ? sizeFitResult.value : null;
      const nextSaved = savedResult.status === 'fulfilled' ? savedResult.value : [];
      const nextPatches = patchesResult.status === 'fulfilled' ? patchesResult.value : [];
      const nextOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const profileFailed = profileResult.status === 'rejected' && !isNotFoundError(profileResult.reason);
      const optionalFailures = [
        { section: 'size-fit', endpoint: '/users/me/size-fit', result: sizeFitResult },
        { section: 'saved', endpoint: '/saved/me', result: savedResult },
        { section: 'patches', endpoint: `/users/${user.id}/patches`, result: patchesResult },
        { section: 'orders', endpoint: '/store/orders', result: ordersResult },
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
        saved: nextSaved,
        patches: nextPatches,
        orders: nextOrders,
      });

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
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your profile.');
    } finally {
      if (requestId === loadRequestIdRef.current) {
        if (!silent) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    }
  }, [fallbackProfile, status, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editOpen || !profileRecord) return;
    setFirstName(profileRecord.firstName || '');
    setLastName(profileRecord.lastName || '');
    setAddress(profileRecord.address || profileRecord.location || '');
  }, [editOpen, profileRecord]);

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

  const handleOpenNotifications = useCallback(() => {
    router.push('/notifications' as any);
  }, []);

  const handleOpenSettings = useCallback(() => {
    toast.info('More settings are coming soon.');
  }, [toast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

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

    const asset = result.assets[0];
    try {
      assertValidPickedUploadAsset(
        {
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType ?? 'image/jpeg',
          fileSize: asset.fileSize,
        },
        MOBILE_UPLOAD_POLICIES.profileImage,
      );
    } catch (validationError) {
      toast.error(getMobileUploadValidationMessage(validationError));
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: asset.mimeType ?? 'image/jpeg',
      name: asset.fileName ?? `profile-${Date.now()}.jpg`,
    } as any);

    try {
      const uploaded = await ProfileApi.uploadProfileImage(formData);
      if (!uploaded) {
        toast.error('Failed to upload photo.');
        return;
      }
      updateUser({
        profileImage: uploaded.url,
        profileImageId: uploaded.id,
        profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
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
          },
        };
      });
      toast.success('Profile photo updated.');
    } catch {
      toast.error('Failed to upload photo.');
    }
  }, [profileRecord, toast, updateUser]);

  const handleSaveProfile = useCallback(async () => {
    if (!profileRecord || savingProfile) return;
    setSavingProfile(true);
    try {
      const updated = await ProfileApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: profileRecord.username,
        address: address.trim(),
      });
      if (!updated) throw new Error('Profile update failed');
      setState((current) => ({ ...current, profile: updated }));
      updateUser({
        firstName: updated.firstName,
        lastName: updated.lastName,
        username: updated.username,
      });
      setEditOpen(false);
      toast.success('Profile updated.');
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  }, [address, firstName, lastName, profileRecord, savingProfile, toast, updateUser]);

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
      toast.error(nextError instanceof Error ? nextError.message : 'Could not update fittings.');
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

  if (status === 'loading' || (status === 'authenticated' && loading)) {
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
            style={({ pressed }) => [styles.headerActionButton, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }, pressed && styles.pressed]}
          >
            <AppText variant="body">🔔</AppText>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Pressable onPress={handlePickAvatar} style={({ pressed }) => [styles.avatarWrap, pressed ? styles.pressed : null]}>
            {avatarUri ? (
              <StableImage uri={avatarUri} containerStyle={styles.heroAvatar} imageStyle={styles.heroAvatar} />
            ) : (
              <View style={[styles.heroAvatar, { backgroundColor: theme.colors.primarySoft }]}>
                <AppText variant="title" tone="primary">{profileIdentity.initials}</AppText>
              </View>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: theme.colors.surface }]}>
              <AppText variant="captionBold">📷</AppText>
            </View>
          </Pressable>

          <View style={styles.identityBlock}>
            <AppText variant="title" style={styles.centerText}>{profileIdentity.displayName}</AppText>
            {profileIdentity.handle ? (
              <AppText variant="body" tone="muted" style={styles.centerText}>{profileIdentity.handle}</AppText>
            ) : null}
            {profileIdentity.locationLabel || profileIdentity.joinedLabel ? (
              <AppText variant="captionRegular" tone="muted" style={styles.centerText}>
                {[profileIdentity.locationLabel, profileIdentity.joinedLabel].filter(Boolean).join(' · ')}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={styles.actionGrid}>
          <ProfileAction emoji="✏️" label="Edit info" onPress={() => setEditOpen(true)} />
          <ProfileAction emoji="📏" label="My fits" onPress={() => setFittingsOpen(true)} />
          <ProfileAction emoji="📦" label="Orders" onPress={() => router.push('/orders' as any)} />
          <ProfileAction emoji="⭐" label="Reviews" onPress={() => router.push('/reviews' as any)} />
          <ProfileAction emoji="⚙️" label="Settings" onPress={handleOpenSettings} />
        </View>

        <View style={styles.summaryRow}>
          <SummaryStat title="Saved Looks" value={String(profileCounts.saved)} subtitle="inspiration" />
          <SummaryStat title="Patched" value={String(profileCounts.patches)} subtitle="brands" />
          <SummaryStat title="History" value={String(profileCounts.orders)} subtitle="orders" />
        </View>

        <MeasurementCard sizeFit={state.sizeFit} onPress={() => setFittingsOpen(true)} />

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
                onPress={() => {
                  if (tab === 'Orders') {
                    setActiveTab(tab);
                    router.push('/orders' as any);
                    return;
                  }
                  setActiveTab(tab);
                }}
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
              onPress={() => router.push('/(tabs)' as any)}
            />
          ) : (
            <View style={styles.savedGrid}>
              {state.saved.map((item) => (
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
              onPress={() => router.push('/(tabs)/discover' as any)}
            />
          ) : (
            <View style={styles.listStack}>
              {state.patches.map((brand) => (
                <PatchRow key={brand.id} brand={brand} />
              ))}
            </View>
          )
        ) : null}

        {activeTab === 'Orders' ? (
          state.orders.length === 0 ? (
            <EmptyState
              emoji="📦"
              title="No orders yet"
              body="When you buy from the market, your order history and status updates will show up here."
              cta="Open market"
              onPress={() => router.push('/(tabs)/discover' as any)}
            />
          ) : (
            <View style={styles.listStack}>
              {state.orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </View>
          )
        ) : null}
      </ScrollView>

      <AppBottomSheet
        visible={editOpen}
        title="Edit profile"
        subtitle="Update your details"
        onClose={() => setEditOpen(false)}
        footer={(
          <View style={styles.sheetFooterActions}>
            <Button title="Cancel" size="md" variant="outline" onPress={() => setEditOpen(false)} style={styles.sheetFooterButton} />
            <Button
              title="Done"
              size="md"
              onPress={() => void handleSaveProfile()}
              disabled={!hasProfile || firstName.trim().length < 2 || lastName.trim().length < 2}
              loading={savingProfile}
              style={styles.sheetFooterButton}
            />
          </View>
        )}
      >
        <Input label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Input label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Input label="Location" value={address} onChangeText={setAddress} placeholder="City, Country" />
      </AppBottomSheet>

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
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
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
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  actionCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 68,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  summaryCard: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  fittingsCard: {
    gap: tokens.spacing.sm,
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

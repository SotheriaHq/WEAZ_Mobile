import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StableImage } from '@/components/ui/StableImage';
import { ProfileApi, type Order, type PatchedBrand, type SavedItem, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { useAuth } from '@/src/auth/AuthContext';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { LAYOUT, tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';
import { resolveIdentity } from '@/src/utils/identity';

type ProfileTab = 'Saved' | 'Patches' | 'Orders';

type ProfileState = {
  profile: UserProfile | null;
  sizeFit: SizeFitProfile | null;
  saved: SavedItem[];
  patches: PatchedBrand[];
  orders: Order[];
};

type MeasurementKey = 'CHEST' | 'WAIST' | 'HIPS' | 'SHOULDER' | 'INSEAM' | 'HEIGHT';

const PROFILE_TABS: ProfileTab[] = ['Saved', 'Patches', 'Orders'];
const MEASUREMENT_FIELDS: Array<{ key: MeasurementKey; label: string }> = [
  { key: 'CHEST', label: 'Chest' },
  { key: 'WAIST', label: 'Waist' },
  { key: 'HIPS', label: 'Hips' },
  { key: 'SHOULDER', label: 'Shoulder' },
  { key: 'INSEAM', label: 'Inseam' },
  { key: 'HEIGHT', label: 'Height' },
];

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
  return (
    <Card padding="lg" style={styles.emptyCard}>
      <AppText variant="display">{emoji}</AppText>
      <AppText variant="subtitle">{title}</AppText>
      <AppText variant="body" tone="muted" style={styles.emptyBody}>
        {body}
      </AppText>
      <Button title={cta} onPress={onPress} fullWidth />
    </Card>
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, { backgroundColor: theme.colors.surfaceAlt }, pressed ? styles.pressed : null]}>
      <AppText variant="subtitle">{emoji}</AppText>
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
  const unit = sizeFit?.preferredLengthUnit?.toLowerCase() ?? 'cm';

  return (
    <Card padding="lg" style={[styles.fittingsCard, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <AppText variant="bodyBold">My fittings</AppText>
          <AppText variant="captionRegular" tone="muted">
            Keep your measurements ready so brands can tailor faster.
          </AppText>
        </View>
        <Button title={measurements.length > 0 ? 'Edit' : 'Add'} size="sm" variant="secondary" onPress={onPress} />
      </View>

      {measurements.length > 0 ? (
        <View style={styles.measurementGrid}>
          {measurements.slice(0, 6).map(([key, value]) => (
            <View key={key} style={[styles.measurementPill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <AppText variant="captionRegular" tone="muted">{key.replace(/_/g, ' ')}</AppText>
              <AppText variant="bodyBold">{String(value)} {unit}</AppText>
            </View>
          ))}
        </View>
      ) : (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.measurementEmpty, pressed ? styles.pressed : null]}>
          <AppText variant="title">📏</AppText>
          <AppText variant="bodyBold">No fittings saved yet</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>
            Add your baseline measurements once and reuse them across custom orders.
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}

function SavedDesignCard({ item }: { item: SavedItem }) {
  const { theme } = useTheme();
  const destinationId = item.targetType === 'COLLECTION_MEDIA' ? item.collectionId ?? item.targetId : item.targetId;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/catalog/view/[collectionId]',
          params: { collectionId: destinationId, scope: 'design' },
        } as any)
      }
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
      <AppText variant="subtitle" tone="muted">›</AppText>
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
  const insets = useSafeAreaInsets();
  const { status, user, updateUser, signOut } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  const [state, setState] = useState<ProfileState>({
    profile: null,
    sizeFit: null,
    saved: [],
    patches: [],
    orders: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Saved');
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

  useEffect(() => {
    if (!requestedTab) return;
    const normalized = requestedTab.trim().toLowerCase();
    if (normalized === 'patches') setActiveTab('Patches');
    if (normalized === 'orders') setActiveTab('Orders');
    if (normalized === 'saved') setActiveTab('Saved');
  }, [requestedTab]);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.id) {
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const [profile, sizeFit, saved, patches, orders] = await Promise.all([
        ProfileApi.getMe(),
        ProfileApi.getSizeFit(),
        ProfileApi.getSaved(),
        ProfileApi.getPatches(user.id),
        ProfileApi.getOrders({ limit: 20, page: 1 }),
      ]);

      setState({
        profile,
        sizeFit,
        saved,
        patches,
        orders,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editOpen || !state.profile) return;
    setFirstName(state.profile.firstName || '');
    setLastName(state.profile.lastName || '');
    setAddress(state.profile.address || state.profile.location || '');
  }, [editOpen, state.profile]);

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

  const profileIdentity = useMemo(() => resolveIdentity(state.profile), [state.profile]);
  const avatarUri = useResolvedImageUri({
    src: profileIdentity.avatarSrc ?? undefined,
    fileId: profileIdentity.avatarFileId ?? undefined,
    enabled: Boolean(profileIdentity.avatarSrc || profileIdentity.avatarFileId),
  });

  const hasProfile = Boolean(state.profile);
  const profileCounts = {
    saved: state.saved.length,
    patches: state.patches.length,
    orders: state.orders.length,
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  const handlePickAvatar = useCallback(async () => {
    if (!state.profile) return;
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
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
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
      setState((current) => current.profile ? {
        ...current,
        profile: {
          ...current.profile,
          profileImage: uploaded.url,
          profileImageId: uploaded.id,
          profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
        },
      } : current);
      toast.success('Profile photo updated.');
    } catch {
      toast.error('Failed to upload photo.');
    }
  }, [state.profile, toast, updateUser]);

  const handleSaveProfile = useCallback(async () => {
    if (!state.profile || savingProfile) return;
    setSavingProfile(true);
    try {
      const updated = await ProfileApi.updateProfile(state.profile.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: state.profile.username,
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
  }, [address, firstName, lastName, savingProfile, state.profile, toast, updateUser]);

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
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  if (status === 'loading' || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <AppText variant="body" tone="muted">Loading your profile...</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]}>
        <View style={styles.loadingState}>
          <AppText variant="subtitle">Profile unavailable</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>
            Sign in to manage your saved designs, fittings, and orders.
          </AppText>
          <Button title="Sign in" onPress={() => router.push('/(auth)/login' as any)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + LAYOUT.TAB_BAR_HEIGHT + tokens.spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
      >
        <View style={styles.topBar}>
          <Button title="Notifications" size="sm" variant="ghost" onPress={() => router.push('/notifications' as any)} />
          <Button title="Settings" size="sm" variant="ghost" onPress={() => toast.info('More settings are coming soon.')} />
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
          <ProfileAction emoji="📦" label="Orders" onPress={() => setActiveTab('Orders')} />
          <ProfileAction emoji="🚪" label="Sign out" onPress={handleSignOut} />
        </View>

        <View style={styles.summaryRow}>
          <SummaryStat title="Saved" value={String(profileCounts.saved)} subtitle="designs" />
          <SummaryStat title="Patched" value={String(profileCounts.patches)} subtitle="brands" />
          <SummaryStat title="Orders" value={String(profileCounts.orders)} subtitle="active history" />
        </View>

        <MeasurementCard sizeFit={state.sizeFit} onPress={() => setFittingsOpen(true)} />

        {error ? (
          <Card padding="md" style={[styles.errorCard, { borderColor: theme.colors.danger }]}>
            <AppText variant="bodyBold">Could not load some profile data</AppText>
            <AppText variant="body" tone="muted">{error}</AppText>
            <Button title="Retry" size="sm" onPress={() => void load()} />
          </Card>
        ) : null}

        <View style={styles.tabWrap}>
          {PROFILE_TABS.map((tab) => {
            const selected = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={({ pressed }) => [
                  styles.tabPill,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                <AppText variant="bodyBold" tone={selected ? 'primary' : 'secondary'}>
                  {tab}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'Saved' ? (
          state.saved.length === 0 ? (
            <EmptyState
              emoji="🗂️"
              title="Nothing saved yet"
              body="Save designs you love so you can revisit them quickly from here."
              cta="Browse designs"
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
        subtitle="Keep your public buyer details clean and current."
        onClose={() => setEditOpen(false)}
        onDone={() => void handleSaveProfile()}
        doneLabel="Save"
        doneDisabled={!hasProfile || firstName.trim().length < 2 || lastName.trim().length < 2}
        loading={savingProfile}
        showCloseButton
      >
        <Input label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Input label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Input label="Location" value={address} onChangeText={setAddress} placeholder="City, Country" />
      </AppBottomSheet>

      <AppBottomSheet
        visible={fittingsOpen}
        title="My fittings"
        subtitle="Add your baseline measurements once. You can refine them per order later."
        onClose={() => setFittingsOpen(false)}
        onDone={() => void handleSaveFittings()}
        doneLabel="Save"
        loading={savingFittings}
        showCloseButton
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
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
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
    gap: tokens.spacing.md,
  },
  avatarWrap: {
    position: 'relative',
  },
  heroAvatar: {
    width: 104,
    height: 104,
    borderRadius: 28,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
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
    gap: tokens.spacing.sm,
  },
  actionCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 88,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  summaryCard: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  fittingsCard: {
    gap: tokens.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  measurementPill: {
    minWidth: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  measurementEmpty: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
  },
  errorCard: {
    gap: tokens.spacing.sm,
    borderWidth: 1,
  },
  tabWrap: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  tabPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
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
    gap: tokens.spacing.sm,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: tokens.spacing.md,
  },
  rowAvatar: {
    width: 48,
    height: 48,
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
    gap: tokens.spacing.sm,
  },
  emptyBody: {
    textAlign: 'center',
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
});

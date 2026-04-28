import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Easing, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { useAuth } from '@/src/auth/AuthContext';
import { useToast } from '@/src/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { AppLoaderScreen, LoaderBlock } from '@/components/ui/AppLoader';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProfileApi, type Order, type PatchedBrand, type SavedItem, type SizeFitProfile, type UserProfile } from '@/src/api/ProfileApi';
import { useResolvedImageUri } from '@/src/hooks/useResolvedImageUri';
import { tokens, LAYOUT } from '@/src/styles/tokens';
import { resolveProfileImageSource } from '@/src/utils/profileImage';
import { AppText } from '@/components/ui/AppText';
import { StableImage } from '@/components/ui/StableImage';
import { Tabs } from '@/components/catalog/Tabs';

const { width: SW } = Dimensions.get('window');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(firstName?: string | null, lastName?: string | null, username?: string | null): string {
  const f = firstName?.trim() ?? '';
  const l = lastName?.trim() ?? '';
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (username) return username.slice(0, 2).toUpperCase();
  return '??';
}

function fullName(p: UserProfile): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || p.username || 'User';
}

function formatJoined(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `Joined ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;
}

function formatCurrency(amount: number, currency = 'NGN'): string {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#10b981',
  SHIPPED: '#3b82f6',
  PROCESSING: '#f59e0b',
  PENDING: '#8b5cf6',
  CANCELLED: '#ef4444',
};

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? '#9ca3af';
}

function statusEmoji(s: string) {
  const map: Record<string, string> = {
    DELIVERED: '✅',
    SHIPPED: '🚚',
    PROCESSING: '⚙️',
    PENDING: '⏳',
    CANCELLED: '❌',
  };
  return map[s] ?? '📦';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarView({
  profile,
  isDark,
  primary,
  onPress,
}: {
  profile: UserProfile;
  isDark: boolean;
  primary: string;
  onPress: () => void;
}) {
  const ini = initials(profile.firstName, profile.lastName, profile.username);
  const avatar = resolveProfileImageSource(profile as any);
  const avatarUri = useResolvedImageUri({ src: avatar.src, fileId: avatar.fileId });
  return (
    <Pressable onPress={onPress} style={styles.avatarWrap}>
      {avatarUri ? (
        <StableImage uri={avatarUri} containerStyle={styles.avatar} imageStyle={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: primary }]}>
          <AppText variant="title" tone="primary">{ini}</AppText>
        </View>
      )}
      {/* Camera badge */}
      <View style={[styles.cameraBadge, { backgroundColor: primary }]}>
        <AppText variant="caption">📷</AppText>
      </View>
    </Pressable>
  );
}

function SizeFitCard({
  sizeFit,
  isDark,
  primary,
  onEdit,
}: {
  sizeFit: SizeFitProfile | null;
  isDark: boolean;
  primary: string;
  onEdit: () => void;
}) {
  const hasMeasurements = sizeFit && sizeFit.measurements && Object.keys(sizeFit.measurements).length > 0;
  const unit = sizeFit?.preferredLengthUnit ?? 'CM';

  return (
    <Card
      variant="surface"
      style={[
        styles.sizeFitCard,
        {
          backgroundColor: isDark ? tokens.themes.dark.colors.surfaceAlt : tokens.themes.light.colors.surfaceAlt,
          borderColor: isDark ? '#273244' : '#D4DCE8',
        },
      ]}
    >
      <View style={styles.sizeFitHeader}>
        <AppText variant="caption" tone="primary">📐 My Fittings</AppText>
        <Pressable
          onPress={onEdit}
          style={[styles.sizeFitEditBtn, { backgroundColor: isDark ? '#2B1742' : '#F3E8FF' }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <AppText variant="caption" tone="primary">
            {hasMeasurements ? 'Update' : 'Add'}
          </AppText>
        </Pressable>
      </View>

      {hasMeasurements ? (
        <View style={styles.measurementGrid}>
          {Object.entries(sizeFit!.measurements!).slice(0, 6).map(([key, val]) => (
            <View
              key={key}
              style={[styles.measurementItem, { backgroundColor: isDark ? tokens.themes.dark.colors.surfaceAlt : tokens.themes.light.colors.surface }]}
            >
              <AppText variant="caption" tone="muted" style={styles.measurementKey}>
                {key.replace(/^(WOMEN_|MEN_|UNISEX_)/, '').replace(/_/g, ' ')}
              </AppText>
              <AppText variant="bodyBold">
                {val} {unit.toLowerCase()}
              </AppText>
            </View>
          ))}
        </View>
      ) : (
        <Pressable onPress={onEdit} style={styles.sizeFitEmpty}>
          <AppText variant="title">📏</AppText>
          <AppText variant="caption" tone="muted" style={styles.sizeFitEmptyText}>
            Add your measurements so brands can tailor perfectly for you
          </AppText>
          <AppText variant="caption" tone="primary" style={styles.sizeFitEmptyCta}>Add measurements →</AppText>
        </Pressable>
      )}
    </Card>
  );
}

function OrderCard({ order, isDark, onPress }: { order: Order; isDark: boolean; onPress: () => void }) {
  const col = statusColor(order.status);
  const firstItem = order.items?.[0];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.orderCard,
        {
          backgroundColor: isDark ? '#121826' : '#ffffff',
          borderColor: isDark ? '#273244' : '#D4DCE8',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.orderCardLeft}>
        {firstItem?.thumbnail ? (
          <StableImage uri={firstItem.thumbnail} containerStyle={styles.orderThumb} imageStyle={styles.orderThumb} />
        ) : (
          <View style={[styles.orderThumbFallback, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <AppText variant="subtitle">📦</AppText>
          </View>
        )}
      </View>
      <View style={styles.orderCardBody}>
        <AppText variant="caption" style={styles.orderName} numberOfLines={1}>
          {firstItem?.productName ?? 'Order'}
        </AppText>
        {order.items && order.items.length > 1 && (
          <AppText variant="caption" tone="muted" style={styles.orderMore}>
            +{order.items.length - 1} more item{order.items.length > 2 ? 's' : ''}
          </AppText>
        )}
        <AppText variant="caption" tone="muted" style={styles.orderDate}>
          {formatDate(order.createdAt)}
        </AppText>
      </View>
      <View style={styles.orderCardRight}>
        <View style={[styles.orderStatusBadge, { backgroundColor: col }]}>
          <AppText variant="caption">{statusEmoji(order.status)}</AppText>
          <AppText variant="caption" style={styles.orderStatusText}>{order.status}</AppText>
        </View>
        <AppText variant="caption" style={styles.orderAmount}>
          {formatCurrency(order.totalAmount, order.currency)}
        </AppText>
      </View>
    </Pressable>
  );
}

function OrdersEmpty({ isDark, primary }: { isDark: boolean; primary: string }) {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display">🛍️</AppText>
      <AppText variant="subtitle">No orders yet</AppText>
      <AppText variant="caption" tone="muted" style={styles.emptyBody}>
        Your order history will appear here once you shop from the market.
      </AppText>
      <Button title="Explore Market" variant="primary" onPress={() => router.push('/(tabs)/discover' as any)} />
    </View>
  );
}

function SavedEmpty({ isDark, primary }: { isDark: boolean; primary: string }) {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display">🗂️</AppText>
      <AppText variant="subtitle">Nothing saved yet</AppText>
      <AppText variant="caption" tone="muted" style={styles.emptyBody}>
        Save designs you love to revisit them anytime. Start by exploring the designs feed.
      </AppText>
      <Button title="Browse Designs" variant="primary" onPress={() => router.push('/(tabs)' as any)} />
    </View>
  );
}

function PatchesEmpty({ isDark, primary }: { isDark: boolean; primary: string }) {
  return (
    <View style={styles.emptyState}>
      <AppText variant="display">🪡</AppText>
      <AppText variant="subtitle">No brands patched</AppText>
      <AppText variant="caption" tone="muted" style={styles.emptyBody}>
        Patch your favourite brands to follow their new drops and designs.
      </AppText>
      <Button title="Discover Brands" variant="primary" onPress={() => router.push('/(tabs)/discover' as any)} />
    </View>
  );
}

// ─── Edit Profile Sheet ───────────────────────────────────────────────────────

function EditSheet({
  visible,
  profile,
  isDark,
  primary,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: UserProfile;
  isDark: boolean;
  primary: string;
  onClose: () => void;
  onSave: (values: { firstName: string; lastName: string; address: string }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [address, setAddress] = useState(profile.address ?? '');
  const [saving, setSaving] = useState(false);
  const slideY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setAddress(profile.address ?? '');
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 600, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const canSave = firstName.trim().length >= 2 && lastName.trim().length >= 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: backdropOpacity }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.editSheet,
          {
            backgroundColor: isDark ? '#0f0b18' : '#ffffff',
            borderColor: isDark ? '#273244' : '#D4DCE8',
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Handle */}
          <View style={styles.sheetHandle}>
            <View style={[styles.sheetHandleBar, { backgroundColor: isDark ? '#64748B' : '#94A3B8' }]} />
          </View>

          <View style={styles.editSheetInner}>
            <AppText variant="subtitle">Edit Profile</AppText>
            <AppText variant="caption" tone="muted" style={styles.editSheetSub}>
              Update your basic details
            </AppText>

            <View style={{ marginTop: 20, gap: 14 }}>
              <View>
                <Input
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  returnKeyType="next"
                  containerStyle={styles.inputGroup}
                />
              </View>
              <View>
                <Input
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  returnKeyType="next"
                  containerStyle={styles.inputGroup}
                />
              </View>
              <View>
                <Input
                  label="Location"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="City, Country"
                  returnKeyType="done"
                  containerStyle={styles.inputGroup}
                />
              </View>
            </View>

            <View style={styles.editActions}>
              <Button title="Cancel" variant="outline" onPress={onClose} disabled={saving} style={styles.editCancelBtn} />
              <Button
                title="Save"
                variant="primary"
                onPress={async () => {
                  if (!canSave || saving) return;
                  setSaving(true);
                  try {
                    await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), address: address.trim() });
                  } finally {
                    setSaving(false);
                  }
                }}
                style={styles.editSaveBtn}
                disabled={!canSave || saving}
                loading={saving}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Size Fit Sheet ───────────────────────────────────────────────────────────

const COMMON_MEASUREMENTS = [
  { key: 'CHEST', label: 'Chest' },
  { key: 'WAIST', label: 'Waist' },
  { key: 'HIPS', label: 'Hips' },
  { key: 'SHOULDER', label: 'Shoulder' },
  { key: 'INSEAM', label: 'Inseam' },
  { key: 'HEIGHT', label: 'Height' },
];

function SizeFitSheet({
  visible,
  sizeFit,
  isDark,
  primary,
  onClose,
  onSave,
}: {
  visible: boolean;
  sizeFit: SizeFitProfile | null;
  isDark: boolean;
  primary: string;
  onClose: () => void;
  onSave: (payload: { measurements: Record<string, unknown>; preferredLengthUnit: 'CM' | 'IN' }) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<'CM' | 'IN'>('CM');
  const [saving, setSaving] = useState(false);
  const slideY = useRef(new Animated.Value(700)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Pre-fill from existing profile
      const existing: Record<string, string> = {};
      if (sizeFit?.measurements) {
        for (const [k, v] of Object.entries(sizeFit.measurements)) {
          const shortKey = k.replace(/^(WOMEN_|MEN_|UNISEX_)/, '');
          existing[shortKey] = String(v);
        }
      }
      setValues(existing);
      setUnit(sizeFit?.preferredLengthUnit ?? 'CM');

      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, damping: 22, stiffness: 200, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 700, duration: 250, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: backdropOpacity }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.editSheet,
          {
            backgroundColor: isDark ? '#0f0b18' : '#ffffff',
            borderColor: isDark ? '#273244' : '#D4DCE8',
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <View style={styles.sheetHandle}>
          <View style={[styles.sheetHandleBar, { backgroundColor: isDark ? '#64748B' : '#94A3B8' }]} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.editSheetInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppText variant="subtitle">My Fittings</AppText>
            <AppText variant="caption" tone="muted" style={styles.editSheetSub}>
              Brands use these to ensure the perfect fit for custom orders.
            </AppText>

            {/* Unit toggle */}
            <View style={[styles.unitToggle, { backgroundColor: isDark ? '#1E293B' : '#E9EEF5', marginTop: 16 }]}> 
              {(['CM', 'IN'] as const).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  style={[
                    styles.unitBtn,
                    unit === u && { backgroundColor: primary },
                  ]}
                >
                  <AppText variant="caption" tone={unit === u ? 'inverse' : 'muted'}>
                    {u}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 18, gap: 12 }}>
              {COMMON_MEASUREMENTS.map(({ key, label }) => (
                <View key={key}>
                  <Input
                    label={`${label} (${unit.toLowerCase()})`}
                    value={values[key] ?? ''}
                    onChangeText={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
                    placeholder={`e.g. ${key === 'HEIGHT' ? '175' : '90'}`}
                    keyboardType="numeric"
                    returnKeyType="next"
                    containerStyle={styles.inputGroup}
                  />
                </View>
              ))}
            </View>

            <View style={[styles.editActions, { marginTop: 24 }]}>
              <Button title="Cancel" variant="outline" onPress={onClose} style={styles.editCancelBtn} disabled={saving} />
              <Button
                title="Save"
                variant="primary"
                onPress={async () => {
                  if (saving) return;
                  setSaving(true);
                  const measurements: Record<string, unknown> = {};
                  for (const { key } of COMMON_MEASUREMENTS) {
                    const val = values[key]?.trim();
                    if (val && !isNaN(Number(val))) {
                      measurements[key] = Number(val);
                    }
                  }
                  try {
                    await onSave({ measurements, preferredLengthUnit: unit });
                  } finally {
                    setSaving(false);
                  }
                }}
                style={styles.editSaveBtn}
                disabled={saving}
                loading={saving}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type ProfileTab = 'Saved' | 'Patches' | 'Orders';

const TABS: ProfileTab[] = ['Saved', 'Patches', 'Orders'];

export default function MeScreen() {
  const navigation = useNavigation<any>();
  const { scheme, theme } = useTheme();
  const { status, user, signOut, updateUser } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const primary = theme.colors.primary;
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sizeFit, setSizeFit] = useState<SizeFitProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [patches, setPatches] = useState<PatchedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('Saved');
  const [tabLoading, setTabLoading] = useState(false);
  const [tabLoaded, setTabLoaded] = useState<Record<ProfileTab, boolean>>({
    Saved: false,
    Patches: false,
    Orders: false,
  });
  const [showSizeFit, setShowSizeFit] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const tabFade = useRef(new Animated.Value(1)).current;
  const showBlockingLoader = status === 'loading' || (loading && !profile);

  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: showBlockingLoader ? { display: 'none' } : undefined,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation, showBlockingLoader]);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace({ pathname: '/login', params: { reason: 'auth_required', next: pathname } });
    }
  }, [status, pathname]);

  // Brand accounts should use the brand catalog/profile surface instead of buyer profile tabs.
  useEffect(() => {
    if (status === 'authenticated' && user?.type === 'BRAND') {
      router.replace('/catalog' as any);
    }
  }, [status, user?.type]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(tabFade, {
        toValue: 0.97,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(tabFade, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab, tabFade]);

  useEffect(() => {
    if (requestedTab === 'Saved' || requestedTab === 'Patches' || requestedTab === 'Orders') {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  // Load profile + size fit on mount
  const loadProfile = useCallback(async () => {
    if (status !== 'authenticated') return;
    setProfileError(null);
    try {
      const [p, sf] = await Promise.all([ProfileApi.getMe(), ProfileApi.getSizeFit()]);
      if (p) {
        setProfile(p);
        updateUser({
          firstName: p.firstName,
          lastName: p.lastName,
          username: p.username,
          profileImage: p.profileImage,
          profileImageId: p.profileImageId,
          profileImageFile: p.profileImageFile,
        });
      }
      setSizeFit(sf);
    } catch {
      setProfileError('Could not load your profile right now.');
      toast.error('Could not load profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, updateUser]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      if (status === 'authenticated') {
        void loadProfile();
      }
    }, [loadProfile, status]),
  );

  // Load tab data whenever active tab changes
  useEffect(() => {
    if (!profile) return;
    const run = async () => {
      setTabLoading(true);
      try {
        if (activeTab === 'Saved') {
          const items = await ProfileApi.getSaved();
          setSaved(items);
        } else if (activeTab === 'Patches') {
          const items = await ProfileApi.getPatches(profile.id);
          setPatches(items);
        } else if (activeTab === 'Orders') {
          const items = await ProfileApi.getOrders();
          setOrders(items);
        }
      } catch {
        // Silently fail — empty state shown
      } finally {
        setTabLoaded((prev) => ({
          ...prev,
          [activeTab]: true,
        }));
        setTabLoading(false);
      }
    };
    void run();
  }, [activeTab, profile]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadProfile();
  }, [loadProfile]);

  const handleSaveSizeFit = useCallback(
    async (payload: { measurements: Record<string, unknown>; preferredLengthUnit: 'CM' | 'IN' }) => {
      try {
        const updated = await ProfileApi.updateSizeFit(payload);
        if (updated) setSizeFit(updated);
        toast.success('Fittings saved');
        setShowSizeFit(false);
      } catch {
        toast.error('Failed to save fittings');
      }
    },
    [],
  );

  const handlePickAvatar = useCallback(async () => {
    if (!profile) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to update your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName ?? 'profile.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    } as any);

    try {
      const uploaded = await ProfileApi.uploadProfileImage(formData);
      if (uploaded) {
        setProfile((prev) => prev ? { ...prev, profileImage: uploaded.url, profileImageId: uploaded.id, profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url } } : prev);
        updateUser({
          profileImage: uploaded.url,
          profileImageId: uploaded.id,
          profileImageFile: { id: uploaded.id, url: uploaded.url, s3Url: uploaded.url },
        });
        toast.success('Profile photo updated');
      }
    } catch {
      toast.error('Failed to upload photo');
    }
  }, [profile, updateUser]);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  // ── Loading state
  if (showBlockingLoader) {
    return <AppLoaderScreen message="Loading your profile" />;
  }

  if (status === 'unauthenticated' || !profile) {
    if (!profile && !loading && profileError) {
      return (
        <SafeAreaView style={[styles.root, { backgroundColor: 'transparent' }]}> 
          <View style={styles.loadingCenter}>
            <AppText variant="display">😕</AppText>
            <AppText variant="bodyBold">Profile unavailable</AppText>
            <AppText variant="caption" tone="muted" style={styles.profileUnavailableText}>
              {profileError}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Button title="Retry" variant="primary" onPress={loadProfile} />
              <Button title="Sign Out" variant="secondary" onPress={handleSignOut} />
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return null; // Redirect handled by useEffect above
  }

  const name = fullName(profile);
  const joined = formatJoined(profile.createdAt);
  const currentTabLoaded = tabLoaded[activeTab];
  const shouldShowBlockingLoader = tabLoading && !currentTabLoaded;
  const shouldShowRefreshingHint = tabLoading && currentTabLoaded;

  // ── Render
  return (
    <View style={[styles.root, { backgroundColor: 'transparent' }]}> 
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + LAYOUT.TAB_BAR_HEIGHT + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primary}
            colors={[primary]}
          />
        }
      >
        {/* ── PROFILE HEADER ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          {/* Avatar row */}
          <View style={styles.avatarRow}>
            <AvatarView profile={profile} isDark={isDark} primary={primary} onPress={handlePickAvatar} />
            <View style={styles.identityBlock}>
              <AppText style={styles.displayName} numberOfLines={1}>
                {name}
              </AppText>
              <AppText style={styles.username} tone="muted">@{profile.username}</AppText>
              {(profile.location || joined) ? (
                <View style={styles.metaRow}>
                  {profile.location ? (
                    <AppText style={styles.metaText} tone="muted">📍 {profile.location}</AppText>
                  ) : null}
                  {joined ? (
                    <AppText style={styles.metaText} tone="muted">{joined}</AppText>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* ── ACTION STRIP ── */}
          <View style={[styles.actionStrip, { marginTop: 10 }]}>
            {[
              { icon: '✏️', label: 'Edit', onPress: () => router.push('/(tabs)/me-edit' as any) },
              { icon: '📐', label: 'My Fits', onPress: () => setShowSizeFit(true) },
              { icon: '🔗', label: 'Share', onPress: () => toast.success('Share coming soon') },
              { icon: '🚪', label: 'Sign Out', onPress: handleSignOut },
            ].filter(({ label }) => label !== 'Edit' && label !== 'Share').map(({ icon, label, onPress }) => (
              <Pressable
                key={label}
                onPress={onPress}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: isDark ? '#121826' : '#E9EEF5',
                    borderColor: isDark ? '#273244' : '#D4DCE8',
                  },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                ]}
              >
                <AppText variant="caption">{icon}</AppText>
                <AppText style={styles.actionLabel} tone="muted">
                  {label}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* ── SIZE FIT CARD ── */}
          <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
            <SizeFitCard sizeFit={sizeFit} isDark={isDark} primary={primary} onEdit={() => setShowSizeFit(true)} />
          </View>
        </View>

        {/* ── TAB BAR ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Tabs tabs={TABS.map((tabKey) => ({ key: tabKey, label: tabKey }))} activeTab={activeTab} onTabChange={(tabKey) => setActiveTab(tabKey as ProfileTab)} />
        </View>

        {/* ── TAB CONTENT ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, minHeight: 300, position: 'relative' }}>
          <Animated.View
            style={[
              { opacity: tabFade, transform: [{ translateY: tabFade.interpolate({ inputRange: [0.97, 1], outputRange: [6, 0] }) }] },
            ]}
          >
            {activeTab === 'Saved' ? (
              saved.length === 0 ? (
                <SavedEmpty isDark={isDark} primary={primary} />
              ) : (
                <View style={styles.savedGrid}>
                  {saved.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.savedCard,
                        {
                          backgroundColor: isDark ? '#121826' : '#ffffff',
                          borderColor: isDark ? '#273244' : '#D4DCE8',
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() => {/* navigate to collection */}}
                    >
                      <View style={styles.savedThumbWrap}>
                        {item.thumbnail ? (
                          <StableImage uri={item.thumbnail} containerStyle={styles.savedThumb} imageStyle={styles.savedThumb} />
                        ) : (
                          <View style={[styles.savedThumbFallback, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}> 
                            <AppText variant="title">🗂️</AppText>
                          </View>
                        )}
                        <View style={styles.savedBookmarkBadge}>
                          <AppText variant="caption">🔖</AppText>
                        </View>
                      </View>
                      <View style={{ padding: 10 }}>
                        <AppText
                          style={styles.savedTitle}
                          numberOfLines={1}
                        >
                          {item.title}
                        </AppText>
                        <AppText
                          style={styles.savedBrand}
                          tone="muted"
                          numberOfLines={1}
                        >
                          {[item.brand.firstName, item.brand.lastName].filter(Boolean).join(' ') || item.brand.username}
                        </AppText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )
            ) : activeTab === 'Patches' ? (
              patches.length === 0 ? (
                <PatchesEmpty isDark={isDark} primary={primary} />
              ) : (
                <View style={{ gap: 10 }}>
                  {patches.map((brand) => (
                    <Pressable
                      key={brand.id}
                      style={({ pressed }) => [
                        styles.patchCard,
                        {
                          backgroundColor: isDark ? '#121826' : '#ffffff',
                          borderColor: isDark ? '#273244' : '#D4DCE8',
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={() =>
                        router.push({
                          pathname: '/catalog/[brandId]',
                          params: { brandId: brand.id },
                        } as any)
                      }
                    >
                      <View style={[styles.patchAvatar, { backgroundColor: isDark ? '#2B1742' : '#F3E8FF' }]}> 
                          {resolveProfileImageSource(brand as any).src ? (
                            <StableImage uri={resolveProfileImageSource(brand as any).src ?? undefined} containerStyle={styles.patchAvatarImg} imageStyle={styles.patchAvatarImg} />
                        ) : (
                          <AppText style={styles.patchAvatarText} tone="primary"> 
                            {initials(brand.firstName, brand.lastName, brand.username)}
                          </AppText>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText style={styles.patchName} numberOfLines={1}>
                          {brand.brandName || [brand.firstName, brand.lastName].filter(Boolean).join(' ')}
                        </AppText>
                        {brand.location ? (
                          <AppText style={styles.patchLocation} tone="muted" numberOfLines={1}>
                            📍 {brand.location}
                          </AppText>
                        ) : null}
                      </View>
                      <AppText variant="subtitle" tone="muted">›</AppText>
                    </Pressable>
                  ))}
                </View>
              )
            ) : activeTab === 'Orders' ? (
              orders.length === 0 ? (
                <OrdersEmpty isDark={isDark} primary={primary} />
              ) : (
                <View style={{ gap: 10 }}>
                  {orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isDark={isDark}
                      onPress={() => {/* navigate to order detail */}}
                    />
                  ))}
                </View>
              )
            ) : null}
          </Animated.View>

          {shouldShowBlockingLoader ? (
            <LoaderBlock
              message={`Loading ${activeTab.toLowerCase()}`}
              minHeight={164}
              style={styles.tabLoadingOverlay}
            />
          ) : null}

          {shouldShowRefreshingHint ? (
            <View style={[styles.refreshPill, { borderColor: isDark ? '#273244' : '#D4DCE8', backgroundColor: isDark ? '#121826' : '#ffffff' }]}> 
              <ActivityIndicator size="small" color={primary} />
              <AppText style={styles.refreshPillText} tone="muted">Updating…</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── SHEETS ── */}
      <SizeFitSheet
        visible={showSizeFit}
        sizeFit={sizeFit}
        isDark={isDark}
        primary={primary}
        onClose={() => setShowSizeFit(false)}
        onSave={handleSaveSizeFit}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  ambientGradient: { ...StyleSheet.absoluteFillObject, height: 320 },
  scrollContent: { paddingBottom: 40 },

  // Header
  header: { paddingHorizontal: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Avatar
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 18 },
  avatarFallback: {
    width: 72, height: 72, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 24, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },

  // Identity
  identityBlock: { flex: 1, minWidth: 0 },
  displayName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  username: { marginTop: 1, fontSize: 13, fontWeight: '500' },
  metaRow: { marginTop: 3, gap: 3 },
  metaText: { fontSize: 12, fontWeight: '500' },

  // Action strip
  actionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 0,
  },
  actionBtn: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1,
  },
  actionLabel: { fontSize: 12, fontWeight: '700' },

  // Size fit card
  sizeFitCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
  sizeFitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sizeFitTitle: { fontSize: 13, fontWeight: '700' },
  sizeFitEditBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50 },
  sizeFitEditText: { fontSize: 12, fontWeight: '800' },
  measurementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  measurementItem: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: '30%', flex: 1 },
  measurementKey: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  measurementVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  sizeFitEmpty: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  sizeFitEmptyText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  sizeFitEmptyCta: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  // Tab bar
  tabBar: { flexDirection: 'row', position: 'relative', borderBottomWidth: 1, paddingBottom: 0 },
  tabItem: { alignItems: 'center', paddingVertical: 10 },
  tabLabel: { fontSize: 13 },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2.5, borderRadius: 2 },

  // Tab loading
  tabLoading: { paddingVertical: 40, alignItems: 'center' },
  tabLoadingOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshPill: {
    position: 'absolute',
    right: 16,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshPillText: { fontSize: 12, fontWeight: '700' },

  // Saved grid
  savedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  savedCard: {
    width: (SW - 48) / 2, borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  savedThumbWrap: { position: 'relative', aspectRatio: 4 / 5 },
  savedThumb: { width: '100%', height: '100%' },
  savedThumbFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  savedBookmarkBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#121826', borderRadius: 20,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  savedTitle: { fontSize: 13, fontWeight: '700' },
  savedBrand: { fontSize: 12, marginTop: 2 },

  // Patches
  patchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, borderWidth: 1,
  },
  patchAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  patchAvatarImg: { width: '100%', height: '100%' },
  patchAvatarText: { fontSize: 16, fontWeight: '800' },
  patchName: { fontSize: 14, fontWeight: '700' },
  patchLocation: { fontSize: 12, marginTop: 2 },

  // Orders
  orderCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 16, borderWidth: 1,
  },
  orderCardLeft: {},
  orderThumb: { width: 52, height: 52, borderRadius: 12 },
  orderThumbFallback: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orderCardBody: { flex: 1, minWidth: 0 },
  orderName: { fontSize: 13, fontWeight: '700' },
  orderMore: { fontSize: 12, marginTop: 1 },
  orderDate: { fontSize: 12, marginTop: 3 },
  orderCardRight: { alignItems: 'flex-end', gap: 4 },
  orderStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 50 },
  orderStatusText: { fontSize: 12, fontWeight: '700' },
  orderAmount: { fontSize: 13, fontWeight: '800' },

  // Empty states
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
  profileUnavailableText: { textAlign: 'center', paddingHorizontal: 24 },
  emptyCta: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 50 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Edit / Size Fit sheets
  editSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    maxHeight: '90%',
  },
  sheetHandle: { paddingTop: 12, paddingBottom: 6, alignItems: 'center' },
  sheetHandleBar: { width: 40, height: 4, borderRadius: 2 },
  editSheetInner: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  editSheetTitle: { fontSize: 20, fontWeight: '800' },
  editSheetSub: { marginTop: 4, fontSize: 13 },
  inputGroup: { gap: tokens.spacing.sm },
  editLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginLeft: 2 },
  editInput: {
    height: 50, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, fontSize: 15, fontWeight: '500',
  },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  editCancelBtn: {
    flex: 1, height: 50, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  editCancelText: { fontSize: 14, fontWeight: '600' },
  editSaveBtn: {
    flex: 2, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  editSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Unit toggle
  unitToggle: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  unitBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  unitBtnText: { fontSize: 13, fontWeight: '700' },
});

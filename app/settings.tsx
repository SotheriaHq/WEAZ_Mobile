import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/src/auth/AuthContext';
import { hasActiveBrandMembership } from '@/src/auth/brandAccess';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

type SettingsRow = {
  icon: string;
  title: string;
  subtitle?: string;
  metadata?: string;
  danger?: boolean;
  onPress?: () => void;
};

type SettingsSection = {
  title: string;
  rows: SettingsRow[];
};

function SettingRow({ row }: { row: SettingsRow }) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={row.onPress}
      disabled={!row.onPress}
      accessibilityRole={row.onPress ? 'button' : undefined}
      accessibilityLabel={row.title}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: row.danger ? theme.colors.surfaceAlt : theme.colors.primarySoft }]}>
        <AppText variant="body">{row.icon}</AppText>
      </View>
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold" tone={row.danger ? 'danger' : 'default'} numberOfLines={1}>
          {row.title}
        </AppText>
        {row.subtitle ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {row.subtitle}
          </AppText>
        ) : null}
      </View>
      {row.metadata ? (
        <AppText variant="captionRegular" tone="muted" numberOfLines={1} style={styles.metadata}>
          {row.metadata}
        </AppText>
      ) : null}
      {row.onPress ? (
        <AppText variant="body" tone="muted" style={styles.chevron}>
          {'>'}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function SettingsSectionBlock({ section }: { section: SettingsSection }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.sectionWrap, { borderBottomColor: theme.colors.border }]}>
      <AppText variant="captionBold" tone="muted" style={styles.sectionTitle}>
        {section.title.toUpperCase()}
      </AppText>
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {section.rows.map((row) => (
          <SettingRow key={`${section.title}-${row.title}`} row={row} />
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const isBrand = hasActiveBrandMembership(user);

  const comingSoon = React.useCallback(
    (title: string) => {
      toast.info(`${title} will open when that settings screen is ready.`);
    },
    [toast],
  );

  const sections = React.useMemo<SettingsSection[]>(() => {
    const base: SettingsSection[] = [
      {
        title: 'Account',
        rows: [
          {
            icon: '👤',
            title: 'Profile information',
            subtitle: 'Name, username, photo',
            onPress: () => router.push('/(tabs)/me-edit' as never),
          },
          {
            icon: '✉️',
            title: 'Phone & email',
            subtitle: 'Login and contact details',
            metadata: user?.email ? 'Email set' : undefined,
            onPress: () => comingSoon('Phone & email'),
          },
          {
            icon: '🔐',
            title: 'Password & security',
            subtitle: 'Password, sessions, passkeys',
            onPress: () => comingSoon('Password & security'),
          },
        ],
      },
      {
        title: 'Privacy & Security',
        rows: [
          {
            icon: '🛡️',
            title: 'Privacy controls',
            subtitle: 'Visibility, blocked users',
            onPress: () => comingSoon('Privacy controls'),
          },
          {
            icon: '📱',
            title: 'Login sessions',
            subtitle: 'Manage active devices',
            onPress: () => comingSoon('Login sessions'),
          },
          {
            icon: '🔑',
            title: 'Two-factor authentication',
            subtitle: 'Extra account protection',
            onPress: () => comingSoon('Two-factor authentication'),
          },
        ],
      },
      {
        title: 'Notifications',
        rows: [
          {
            icon: '🔔',
            title: 'Push notifications',
            subtitle: 'Likes, comments, messages',
            onPress: () => router.push('/settings/notifications' as never),
          },
          {
            icon: '📨',
            title: 'Email notifications',
            subtitle: 'Orders and account updates',
            onPress: () => comingSoon('Email notifications'),
          },
          {
            icon: '💬',
            title: 'Chat alerts',
            subtitle: 'Message and thread alerts',
            onPress: () => comingSoon('Chat alerts'),
          },
        ],
      },
      {
        title: 'Shopping',
        rows: [
          {
            icon: '📦',
            title: 'Orders',
            subtitle: 'Track purchases and custom requests',
            onPress: () => router.push('/orders' as never),
          },
          {
            icon: '🗂️',
            title: 'Saved designs',
            subtitle: 'Designs you want to revisit',
            onPress: () => router.push({ pathname: '/(tabs)/me', params: { tab: 'saved' } } as never),
          },
          {
            icon: '📏',
            title: 'Measurements / My fits',
            subtitle: 'Saved fittings for custom orders',
            onPress: () => router.push('/(tabs)/me' as never),
          },
          {
            icon: '💳',
            title: 'Payment settings',
            subtitle: 'Cards, payouts, billing if available',
            onPress: () => comingSoon('Payment settings'),
          },
        ],
      },
      {
        title: 'Data & Storage',
        rows: [
          {
            icon: '🖼️',
            title: 'Media cache',
            subtitle: 'Manage image and video cache',
            onPress: () => comingSoon('Media cache'),
          },
          {
            icon: '⬆️',
            title: 'Upload preferences',
            subtitle: 'Image quality and data usage',
            onPress: () => comingSoon('Upload preferences'),
          },
          {
            icon: '🎨',
            title: 'Theme',
            subtitle: 'Light, Dark, or System default',
            onPress: () => router.push('/settings/theme' as never),
          },
        ],
      },
      {
        title: 'Support',
        rows: [
          { icon: '❔', title: 'Help center', subtitle: 'Guides and common questions', onPress: () => comingSoon('Help center') },
          { icon: '⚠️', title: 'Report a problem', subtitle: 'Tell us what went wrong', onPress: () => comingSoon('Report a problem') },
          { icon: '📄', title: 'Terms & conditions', onPress: () => comingSoon('Terms & conditions') },
          { icon: '🔏', title: 'Privacy policy', onPress: () => comingSoon('Privacy policy') },
        ],
      },
      {
        title: 'Account actions',
        rows: [
          {
            icon: '🚪',
            title: 'Sign out',
            subtitle: 'Leave this device',
            onPress: () => {
              void signOut().finally(() => router.replace('/(auth)/login' as never));
            },
          },
          {
            icon: '🗑️',
            title: 'Delete account',
            subtitle: 'Permanently remove your Threadly account',
            danger: true,
            onPress: () => comingSoon('Delete account'),
          },
        ],
      },
    ];

    if (!isBrand) return base;

    return [
      ...base.slice(0, 4),
      {
        title: 'Studio / Brand',
        rows: [
          { icon: '🏷️', title: 'Store profile', subtitle: 'Brand identity and public profile', onPress: () => router.push('/catalog' as never) },
          { icon: '🧵', title: 'Catalog settings', subtitle: 'Designs, products, collections', onPress: () => router.push('/catalog' as never) },
          { icon: '✅', title: 'Verification', subtitle: 'Brand approval and documents', onPress: () => router.push('/studio' as never) },
          { icon: '🏦', title: 'Payouts', subtitle: 'Bank and settlement settings', onPress: () => router.push('/studio' as never) },
        ],
      },
      ...base.slice(4),
    ];
  }, [comingSoon, isBrand, signOut, user?.email]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/(tabs)" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Settings</AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            Account, shopping, privacy, and support
          </AppText>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, tokens.spacing.lg) }]}
      >
        {sections.map((section) => (
          <SettingsSectionBlock key={section.title} section={section} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  sectionWrap: {
    gap: tokens.spacing.xs,
    paddingBottom: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    paddingHorizontal: tokens.spacing.xs,
    letterSpacing: 0,
  },
  section: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  rowPressed: {
    opacity: 0.78,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metadata: {
    maxWidth: 92,
    flexShrink: 1,
  },
  chevron: {
    flexShrink: 0,
    width: 16,
    textAlign: 'right',
  },
});

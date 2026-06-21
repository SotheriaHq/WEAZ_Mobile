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
import { navPerf } from '@/src/utils/navPerf';
import { topLevelNavigate } from '@/src/utils/mobileNavigation';

type SettingsRow = {
  emoji: string;
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
  return (
    <Pressable
      onPress={row.onPress}
      disabled={!row.onPress}
      accessibilityRole={row.onPress ? 'button' : undefined}
      accessibilityLabel={row.title}
      style={({ pressed }) => [
        styles.row,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.iconWrap}>
        <AppText variant="body" accessibilityLabel={`${row.title} icon`}>
          {row.emoji}
        </AppText>
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
        <AppText variant="subtitle" tone="muted" style={styles.chevron}>
          ›
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
  const insets = useSafeAreaInsets();
  const isBrand = hasActiveBrandMembership(user);

  React.useEffect(() => {
    navPerf.screenMounted('profile-to-settings');
    navPerf.firstVisibleUi('profile-to-settings');
  }, []);

  React.useLayoutEffect(() => {
    navPerf.shellVisible('profile-to-settings');
  }, []);

  const sections = React.useMemo<SettingsSection[]>(() => {
    const base: SettingsSection[] = [
      {
        title: 'Account',
        rows: [
          {
            emoji: '👤',
            title: 'Profile information',
            subtitle: 'Name, username, photo',
            onPress: () => router.push('/(tabs)/me-edit' as never),
          },
          {
            emoji: '📍',
            title: 'Location',
            subtitle: 'Saved city, address, and device settings',
            onPress: () => router.push('/settings/location' as never),
          },
          {
            emoji: '📧',
            title: 'Phone & email',
            subtitle: 'Login and contact details',
            metadata: user?.email ? 'Email set' : undefined,
            onPress: () => router.push('/settings/account-security' as never),
          },
          {
            emoji: '🔒',
            title: 'Password & security',
            subtitle: 'Password, sessions, passkeys',
            onPress: () => router.push('/settings/account-security' as never),
          },
        ],
      },
      {
        title: 'Privacy & Security',
        rows: [
          {
            emoji: '🛡️',
            title: 'Privacy controls',
            subtitle: 'Visibility, blocked users',
            onPress: () => router.push('/settings/privacy' as never),
          },
          {
            emoji: '📱',
            title: 'Login sessions',
            subtitle: 'Manage active devices',
            onPress: () => router.push('/settings/account-security' as never),
          },
          {
            emoji: '🔑',
            title: 'Two-factor authentication',
            subtitle: 'Extra account protection',
            onPress: () => router.push('/settings/account-security' as never),
          },
        ],
      },
      {
        title: 'Notifications',
        rows: [
          {
            emoji: '🔔',
            title: 'Push notifications',
            subtitle: 'Likes, comments, messages',
            onPress: () => router.push('/settings/notifications' as never),
          },
          {
            emoji: '📧',
            title: 'Email notifications',
            subtitle: 'Orders and account updates',
            onPress: () => router.push('/settings/email-preferences' as never),
          },
          {
            emoji: '💬',
            title: 'Chat alerts',
            subtitle: 'Message and thread alerts',
            onPress: () => router.push('/settings/notifications' as never),
          },
        ],
      },
      {
        title: 'Shopping',
        rows: [
          {
            emoji: '🔖',
            title: 'Saved runway',
            subtitle: 'Runway looks you want to revisit',
            onPress: () => topLevelNavigate({ pathname: '/(tabs)/me', params: { tab: 'saved' } } as never),
          },
          {
            emoji: '📏',
            title: 'Measurements / My fits',
            subtitle: 'Saved fittings for custom orders',
            onPress: () => topLevelNavigate('/(tabs)/me' as never),
          },
          {
            emoji: '↔️',
            title: 'Sizing settings',
            subtitle: 'Region, fit preference, and auto-apply',
            onPress: () => router.push('/settings/sizing' as never),
          },
          {
            emoji: '📐',
            title: 'Size Guide / Charts',
            subtitle: 'Sizing systems, measurements, and limitations',
            onPress: () => router.push('/size-guide' as never),
          },
          {
            emoji: '🧵',
            title: 'Market preferences',
            subtitle: 'Hidden content and market reset controls',
            onPress: () => router.push('/settings/market-preferences' as never),
          },
          {
            emoji: '💳',
            title: 'Payment settings',
            subtitle: 'Checkout, receipts, and payment policy',
            onPress: () => router.push('/settings/payment' as never),
          },
        ],
      },
      {
        title: 'App preferences',
        rows: [
          {
            emoji: '⬆️',
            title: 'Upload preferences',
            subtitle: 'Quality limits and data usage',
            onPress: () => router.push('/settings/upload-preferences' as never),
          },
          {
            emoji: '🌗',
            title: 'Theme',
            subtitle: 'Light, Dark, or System default',
            onPress: () => router.push('/settings/theme' as never),
          },
        ],
      },
      {
        title: 'Support',
        rows: [
          {
            emoji: '❓',
            title: 'Help center',
            subtitle: 'Guides and common questions',
            onPress: () => router.push('/settings/support' as never),
          },
          {
            emoji: '⚠️',
            title: 'Report a problem',
            subtitle: 'Get to the right support path',
            onPress: () => router.push('/settings/support' as never),
          },
          { emoji: '📄', title: 'Terms & conditions', onPress: () => router.push('/legal/terms' as never) },
          { emoji: '🛡️', title: 'Privacy policy', onPress: () => router.push('/legal/privacy' as never) },
          { emoji: '⚖️', title: 'Legal center', onPress: () => router.push('/legal' as never) },
        ],
      },
      {
        title: 'Account actions',
        rows: [
          {
            emoji: '🚪',
            title: 'Sign out',
            subtitle: 'Sign out of this device',
            onPress: () => {
              void signOut().finally(() => router.replace('/(auth)/login' as never));
            },
          },
          {
            emoji: '🗑️',
            title: 'Delete account',
            subtitle: 'Permanently remove your WEAZ account',
            danger: true,
            onPress: () => router.push('/settings/delete-account' as never),
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
          { emoji: '🏪', title: 'Store profile', subtitle: 'Brand identity and public profile', onPress: () => topLevelNavigate('/catalog' as never) },
          { emoji: '🗂️', title: 'Catalog settings', subtitle: 'Runway, products, collections', onPress: () => topLevelNavigate('/catalog' as never) },
          { emoji: '✅', title: 'Verification', subtitle: 'Brand approval and documents', onPress: () => router.push('/studio' as never) },
          { emoji: '🏦', title: 'Payouts', subtitle: 'Bank and settlement settings', onPress: () => router.push('/studio' as never) },
        ],
      },
      ...base.slice(4),
    ];
  }, [isBrand, signOut, user?.email]);

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

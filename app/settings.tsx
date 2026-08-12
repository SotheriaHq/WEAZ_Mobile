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
import { drillDownPush, topLevelNavigate } from '@/src/utils/mobileNavigation';

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
            title: 'Your bio',
            subtitle: 'Photo, name, username, phone, location',
            // `from` is what brings the user back HERE. Your bio lives in the
            // (tabs) group, and popping that group boundary lands on Runway
            // rather than on Settings — see the note in me-edit.tsx.
            onPress: () =>
              drillDownPush({
                pathname: '/(tabs)/me-edit',
                params: { from: '/settings' },
              } as never),
          },
          {
            emoji: '📧',
            title: 'Phone & email',
            subtitle: 'Login and contact details',
            metadata: user?.email ? 'Email set' : undefined,
            // Both rows land on the same route, but `focus` decides which
            // concern it renders — they used to open an identical screen under
            // an identical heading, which read as one of them being broken.
            onPress: () =>
              drillDownPush({
                pathname: '/settings/account-security',
                params: { focus: 'email' },
              } as never),
          },
          {
            emoji: '🔒',
            title: 'Password & security',
            subtitle: 'Password, sessions, passkeys',
            onPress: () =>
              drillDownPush({
                pathname: '/settings/account-security',
                params: { focus: 'password' },
              } as never),
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
            onPress: () => drillDownPush('/settings/privacy' as never),
          },
          {
            emoji: '🔑',
            title: 'Two-factor authentication',
            subtitle: 'Extra account protection',
            onPress: () => drillDownPush('/settings/account-security' as never),
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
            onPress: () => drillDownPush('/settings/notifications' as never),
          },
          {
            emoji: '📧',
            title: 'Email notifications',
            subtitle: 'Orders and account updates',
            onPress: () => drillDownPush('/settings/email-preferences' as never),
          },
        ],
      },
      // Shopping — shopper-only, and settings ONLY.
      //
      // Two rows are gone. "Saved runway" and "Measurements / My fits" were not
      // settings at all: they navigated to a tab on the profile screen, so a
      // brand tapping "Saved runway" was handed a shopper profile rendered with
      // brand data, and a shopper got a round trip out of Settings to a screen
      // they reach in one tap from the nav bar. Settings rows open settings.
      {
        title: 'Shopping',
        rows: [
          {
            emoji: '↔️',
            title: 'Sizing settings',
            subtitle: 'Region, fit preference, and auto-apply',
            onPress: () => drillDownPush('/settings/sizing' as never),
          },
          {
            emoji: '📐',
            title: 'Size Guide / Charts',
            subtitle: 'Sizing systems, measurements, and limitations',
            onPress: () => drillDownPush('/size-guide' as never),
          },
          {
            emoji: '🧵',
            title: 'Market preferences',
            subtitle: 'Hidden content and market reset controls',
            onPress: () => drillDownPush('/settings/market-preferences' as never),
          },
          {
            emoji: '💳',
            title: 'Payment settings',
            subtitle: 'Checkout, receipts, and payment policy',
            onPress: () => drillDownPush('/settings/payment' as never),
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
            onPress: () => drillDownPush('/settings/upload-preferences' as never),
          },
          {
            emoji: '🌗',
            title: 'Theme',
            subtitle: 'Light, Dark, or System default',
            onPress: () => drillDownPush('/settings/theme' as never),
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
            onPress: () => drillDownPush('/settings/support' as never),
          },
          {
            emoji: '⚠️',
            title: 'Report a problem',
            subtitle: 'Get to the right support path',
            onPress: () => drillDownPush('/settings/support' as never),
          },
          { emoji: '📄', title: 'Terms & conditions', onPress: () => drillDownPush('/legal/terms' as never) },
          { emoji: '🛡️', title: 'Privacy policy', onPress: () => drillDownPush('/legal/privacy' as never) },
          { emoji: '⚖️', title: 'Legal center', onPress: () => drillDownPush('/legal' as never) },
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
              // Browse-first: after sign-out the home surface is the guest
              // Runway, never the auth screen.
              void signOut().finally(() => router.replace('/(tabs)' as never));
            },
          },
          {
            emoji: '🗑️',
            title: 'Delete account',
            subtitle: 'Permanently remove your WIEZ account',
            danger: true,
            onPress: () => drillDownPush('/settings/delete-account' as never),
          },
        ],
      },
    ];

    if (!isBrand) return base;

    // A brand does not shop. Sizing, size charts, market preferences and
    // checkout settings are all buyer surfaces, and leaving them in the brand's
    // Settings is what put a brand on a shopper profile in the first place.
    const brandSections = base.filter((section) => section.title !== 'Shopping');
    const shoppingIndex = base.findIndex((section) => section.title === 'Shopping');
    const insertAt = shoppingIndex === -1 ? brandSections.length : shoppingIndex;

    return [
      ...brandSections.slice(0, insertAt),
      {
        title: 'Studio / Brand',
        rows: [
          { emoji: '🏪', title: 'Store profile', subtitle: 'Brand identity and public profile', onPress: () => topLevelNavigate('/catalog' as never) },
          { emoji: '🗂️', title: 'My Content settings', subtitle: 'Designs, products, collections', onPress: () => topLevelNavigate('/catalog' as never) },
          { emoji: '✅', title: 'Verification', subtitle: 'Brand approval and documents', onPress: () => drillDownPush('/studio' as never) },
          { emoji: '🏦', title: 'Payouts', subtitle: 'Bank and settlement settings', onPress: () => drillDownPush('/studio' as never) },
        ],
      },
      ...brandSections.slice(insertAt),
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

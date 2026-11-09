import React, { useCallback, useMemo } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader, SettingsStateCard } from '@/components/settings/SettingsPrimitives';
import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import {
  NotificationSectionRow,
  NotificationToggleRow,
  PermissionWarning,
  SaveFailedBanner,
} from '@/components/settings/notifications/NotificationSettingsParts';
import { AppText } from '@/components/ui/AppText';
import {
  notificationSectionHref,
  PUSH_MASTER_TOGGLE,
  readToggle,
  summarizeNotificationSection,
  visibleNotificationSections,
  type NotificationSectionConfig,
  type NotificationToggle,
} from '@/src/notifications/notificationSections';
import { useNotificationDevice } from '@/src/notifications/useNotificationDevice';
import { useNotificationSettings } from '@/src/notifications/useNotificationSettings';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

/**
 * Notifications overview: the push switch, then one row per section.
 *
 * Each row says where its section stands ("4 of 6 on", "22:00 – 07:00",
 * "Ready") and opens a screen with only that section. The sections that only
 * matter while push is on leave with the switch; their saved values stay put
 * and come back with it.
 */
export default function NotificationSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { settings, loading, loadError, reload, isPending, failed, patch, retryFailed, dismissFailure } =
    useNotificationSettings();
  const pushOn = settings?.push.enabled === true;
  const device = useNotificationDevice(pushOn);
  const { openPhoneSettings } = device;

  const onToggle = useCallback(
    (item: NotificationToggle, value: boolean) => {
      void patch({ section: item.section, key: item.key, value });
    },
    [patch],
  );

  const openSettings = useCallback(() => {
    void openPhoneSettings().then((opened) => {
      if (!opened) toast.info('Open notification permissions from your phone’s Settings app.');
    });
  }, [openPhoneSettings, toast]);

  const sections = useMemo(() => (settings ? visibleNotificationSections(settings) : []), [settings]);
  const deviceSummaryInput = { permission: device.permission, phone: device.status.phone, server: device.status.server };

  const renderRow = (section: NotificationSectionConfig) => {
    if (!settings) return null;
    const summary = summarizeNotificationSection(section, settings, deviceSummaryInput);
    return (
      <NotificationSectionRow
        key={section.id}
        emoji={section.emoji}
        title={section.title}
        summary={summary}
        attention={section.id === 'device' && (summary === 'Needs attention' || summary === 'Off in phone settings')}
        onPress={() => router.push(notificationSectionHref(section.id) as never)}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title="Notifications" subtitle="Choose what reaches you, and how" />

      {loading && !settings ? (
        <View style={styles.stateWrap}>
          <SettingsStateCard title="Loading notification settings…" loading />
        </View>
      ) : !settings ? (
        <View style={styles.stateWrap}>
          <SettingsStateCard
            title="Could not load settings"
            body={loadError ?? 'Notification settings are unavailable right now.'}
            actionTitle="Retry"
            onAction={reload}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            // The last row clears the home indicator with room to spare.
            { paddingBottom: insets.bottom + tokens.spacing['2xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {pushOn && device.permission === 'denied' ? <PermissionWarning onOpenSettings={openSettings} /> : null}
          {failed ? <SaveFailedBanner message={failed.message} onRetry={retryFailed} onDismiss={dismissFailure} /> : null}

          <NotificationToggleRow
            item={PUSH_MASTER_TOGGLE}
            value={readToggle(settings, PUSH_MASTER_TOGGLE)}
            pending={isPending(PUSH_MASTER_TOGGLE)}
            onToggle={onToggle}
          />

          {pushOn ? (
            <View style={styles.section}>
              <SettingsSectionHeading title="On this phone" />
              <View>{sections.filter((section) => section.group === 'phone').map(renderRow)}</View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SettingsSectionHeading title="What you hear about" />
            {!pushOn ? (
              <AppText variant="captionRegular" tone="muted">
                Push is off. These still decide what reaches your notifications inbox.
              </AppText>
            ) : null}
            <View>{sections.filter((section) => section.group === 'topics').map(renderRow)}</View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  section: {
    gap: tokens.spacing.sm,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
});

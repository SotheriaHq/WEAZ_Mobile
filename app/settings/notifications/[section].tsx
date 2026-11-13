import React, { useCallback } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsSectionHeading } from '@/components/settings/SettingsSectionHeading';
import { SettingsHeader, SettingsStateCard } from '@/components/settings/SettingsPrimitives';
import {
  DeviceStatusPanel,
  NotificationToggleRow,
  PermissionWarning,
  QuietHoursPanel,
  SaveFailedBanner,
} from '@/components/settings/notifications/NotificationSettingsParts';
import {
  getNotificationSection,
  NOTIFICATION_SECTION_ROUTE,
  PUSH_MASTER_TOGGLE,
  readToggle,
  visibleNotificationToggles,
  type NotificationToggle,
} from '@/src/notifications/notificationSections';
import type { NotificationSettingPatchDescriptor } from '@/src/notifications/notificationSettings';
import { useNotificationDevice } from '@/src/notifications/useNotificationDevice';
import { useNotificationSettings } from '@/src/notifications/useNotificationSettings';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/toast/ToastContext';

/**
 * One notification section on its own screen.
 *
 * Reads the same settings the overview holds (useNotificationSettings), so a
 * switch flipped here is already right on the overview when the user goes back.
 */
export default function NotificationSectionScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const sectionId = Array.isArray(params.section) ? params.section[0] : params.section;
  const section = getNotificationSection(sectionId);

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
  const onPatch = useCallback(
    (next: NotificationSettingPatchDescriptor) => {
      void patch(next);
    },
    [patch],
  );
  const openSettings = useCallback(() => {
    void openPhoneSettings().then((opened) => {
      if (!opened) toast.info('Open notification permissions from your phone’s Settings app.');
    });
  }, [openPhoneSettings, toast]);

  if (!section) return <Redirect href={NOTIFICATION_SECTION_ROUTE as never} />;

  const renderBody = () => {
    if (!settings) return null;
    // The master switch decides: a push-only section with push off explains
    // itself and offers the way back, instead of showing switches that do
    // nothing.
    if (section.requiresPush && !pushOn) {
      return (
        <SettingsStateCard
          title="Push notifications are off"
          body={`${section.title} only applies while push notifications are on. Your choices here are kept.`}
          actionTitle={isPending(PUSH_MASTER_TOGGLE) ? 'Turning on…' : 'Turn on push notifications'}
          onAction={() => onToggle(PUSH_MASTER_TOGGLE, true)}
        />
      );
    }
    if (section.id === 'device') {
      return (
        <>
          {device.permission === 'denied' ? <PermissionWarning onOpenSettings={openSettings} /> : null}
          <DeviceStatusPanel
            permission={device.permission}
            status={device.status}
            detail={device.detail}
            retrying={device.retrying}
            onRetry={device.retry}
          />
        </>
      );
    }
    if (section.id === 'quiet-hours') {
      return (
        <QuietHoursPanel
          settings={settings}
          quietTogglePending={isPending({ section: 'push', key: 'quietHoursEnabled' })}
          timesPending={
            isPending({ section: 'push', key: 'quietHoursStart' }) || isPending({ section: 'push', key: 'quietHoursEnd' })
          }
          onToggle={onToggle}
          onPatch={onPatch}
        />
      );
    }
    return (
      <View>
        {visibleNotificationToggles(section, settings).map((item) => (
          <NotificationToggleRow
            key={item.id}
            item={item}
            value={readToggle(settings, item)}
            pending={isPending(item)}
            onToggle={onToggle}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <SettingsHeader title={section.title} subtitle={section.description} fallbackHref={NOTIFICATION_SECTION_ROUTE} />
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
          {failed ? <SaveFailedBanner message={failed.message} onRetry={retryFailed} onDismiss={dismissFailure} /> : null}
          <SettingsSectionHeading title={section.id === 'device' ? 'Delivery status' : section.id === 'quiet-hours' ? 'Schedule' : 'Preferences'} />
          {renderBody()}
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
    gap: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type * as ExpoNotificationsType from 'expo-notifications';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareFormScroll } from '@/components/ui/KeyboardAwareFormScroll';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { AppTimePickerSheet } from '@/components/ui/AppTimePickerSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { NotificationsApi } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  applyNotificationSettingsPatch,
  buildNotificationSettingsPatch,
  isValidQuietHour,
  normalizeQuietHourInput,
  pushControlVisibility,
  type NotificationSettingPatchDescriptor,
  type NotificationSettings,
  type NotificationSettingsSection,
} from '@/src/notifications/notificationSettings';
import {
  describePushDeviceStatus,
  describePushSkipReason,
  registerAuthenticatedPushToken,
  usePushRegistrationState,
  type PushDeviceStatus,
} from '@/src/notifications/pushTokenRegistration';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';
import { MuseLoader } from '@/components/ui/MuseLoader';

type DevicePermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

type ToggleConfig = {
  id: string;
  label: string;
  /** Optional: a row whose label already says it needs no second sentence. */
  description?: string;
  section: NotificationSettingsSection;
  key: string;
  emoji?: string;
};

type ToggleSectionConfig = {
  title: string;
  description?: string;
  items: ToggleConfig[];
};

const DELIVERY_ITEMS: ToggleConfig[] = [
  {
    id: 'push.enabled',
    label: 'Push notifications',
    description: 'Allow WIEZ to send mobile push notifications.',
    section: 'push',
    key: 'enabled',
  },
  {
    id: 'push.showPreview',
    label: 'Show message previews',
    description: 'Show notification details on your lock screen and banner previews.',
    section: 'push',
    key: 'showPreview',
  },
  {
    id: 'push.sound',
    label: 'Sound',
    description: 'Play the default notification sound for WIEZ pushes.',
    section: 'push',
    key: 'sound',
  },
  {
    id: 'push.vibration',
    label: 'Vibration',
    description: 'Allow vibration for supported mobile notification alerts.',
    section: 'push',
    key: 'vibration',
  },
];

const ACTIVITY_ITEMS: ToggleConfig[] = [
  {
    id: 'comments.enabled',
    label: 'Comments',
    description: 'Activity on your designs, products, and posts.',
    section: 'comments',
    key: 'enabled',
  },
  {
    id: 'comments.replies',
    label: 'Replies',
    description: 'Replies to your comment threads.',
    section: 'comments',
    key: 'replies',
  },
  {
    id: 'social.follows',
    label: 'Profile patches',
    description: 'When someone patches you or shows profile interest.',
    section: 'social',
    key: 'follows',
  },
  {
    id: 'social.threads',
    label: 'Threads',
    description: 'When someone threads your content.',
    section: 'social',
    key: 'threads',
  },
  {
    id: 'social.patches',
    label: 'Brand patches',
    description: 'Patch requests and accepted patch activity.',
    section: 'social',
    key: 'patches',
  },
  {
    id: 'tags.mentions',
    label: 'Tags/Mentions',
    description: 'Mentions and tag-based discovery matches.',
    section: 'tags',
    key: 'mentions',
  },
];

const COMMERCE_BRAND_ITEMS: ToggleConfig[] = [
  {
    id: 'collections.lifecycle',
    label: 'Collection lifecycle',
    description: 'Published, unpublished, deleted, and lifecycle updates.',
    section: 'collections',
    key: 'lifecycle',
  },
  {
    id: 'collections.access',
    label: 'Private access',
    description: 'Private collection requests, approvals, and revocations.',
    section: 'collections',
    key: 'access',
  },
  {
    id: 'brand.patchRequests',
    label: 'Brand patch requests',
    description: 'Connection requests from other brands.',
    section: 'brand',
    key: 'patchRequests',
  },
  {
    id: 'brand.contributions',
    label: 'Contributions',
    description: 'Contribution invites and collaboration activity.',
    section: 'brand',
    key: 'contributions',
  },
  {
    id: 'brand.verificationPrompts',
    label: 'Verification prompts',
    description: 'Brand verification reminders and review prompts.',
    section: 'brand',
    key: 'verificationPrompts',
  },
  {
    id: 'orders.placed',
    label: 'Order placed',
    description: 'New order confirmations after checkout succeeds.',
    section: 'orders',
    key: 'placed',
  },
  {
    id: 'orders.statusChanges',
    label: 'Order status changes',
    description: 'Processing, shipped, delivered, return, and refund updates.',
    section: 'orders',
    key: 'statusChanges',
  },
];

const MESSAGING_ITEMS: ToggleConfig[] = [
  {
    id: 'messaging.newMessages',
    label: 'New messages',
    description: 'New order and support thread messages.',
    section: 'messaging',
    key: 'newMessages',
  },
  {
    id: 'messaging.reminders',
    label: 'Unread reminders',
    description: 'Reminders for unread message threads.',
    section: 'messaging',
    key: 'reminders',
  },
  {
    id: 'messaging.moderation',
    label: 'Moderation notices',
    description: 'Visibility and moderation changes on message threads.',
    section: 'messaging',
    key: 'moderation',
  },
  {
    id: 'messaging.sound',
    label: 'Sound alerts',
    description: 'Sound preference for messaging alerts.',
    section: 'messaging',
    key: 'sound',
  },
  {
    id: 'messaging.readReceipts',
    label: 'Read receipts (colored ✓✓)',
    description: 'When ON: sent messages show colored ticks when read; others see when you read theirs. When OFF: you see no colored ticks, and others cannot see when you read their messages. Mutual setting.',
    section: 'messaging',
    key: 'readReceipts',
  },
  {
    id: 'messaging.deliveryReceipts',
    label: 'Delivery receipts (double ✓✓)',
    description: 'When ON: sent messages show double ticks once delivered. When OFF: all messages show a single tick only — you also won\'t see double ticks on others\' messages. Mutual setting.',
    section: 'messaging',
    key: 'deliveryReceipts',
  },
];

const DELIVERY_SECTION: ToggleSectionConfig = {
  title: 'Delivery',
  description: 'Controls how WIEZ push notifications appear on this device.',
  items: DELIVERY_ITEMS,
};

// With push off, only the switch that turns it back on.
const DELIVERY_SECTION_PUSH_OFF: ToggleSectionConfig = {
  ...DELIVERY_SECTION,
  items: DELIVERY_ITEMS.filter((item) => item.id === 'push.enabled'),
};

const PERMISSION_LABELS: Record<DevicePermissionStatus, string> = {
  granted: 'Allowed',
  denied: 'Off in phone settings',
  undetermined: 'Not asked yet',
  unavailable: 'Not available here',
};

const PHONE_LABELS: Record<PushDeviceStatus['phone'], string> = {
  ready: 'Set up',
  'needs-app-update': 'Needs an app update',
  failed: 'Could not set up',
  'waiting-for-permission': 'Waiting for permission',
  'not-checked': 'Checking…',
};

const SERVER_LABELS: Record<PushDeviceStatus['server'], string> = {
  saved: 'Saved',
  failed: 'Could not save',
  waiting: 'Waiting for this phone',
  'not-checked': 'Checking…',
};

type StatusTone = 'default' | 'success' | 'warning' | 'danger' | 'muted';

function toneFor(value: string): StatusTone {
  if (value === 'Allowed' || value === 'Set up' || value === 'Saved') return 'success';
  if (value === 'Could not set up' || value === 'Could not save') return 'danger';
  if (value === 'Checking…') return 'muted';
  return 'warning';
}

const TOGGLE_SECTIONS: ToggleSectionConfig[] = [
  {
    title: 'Activity categories',
    items: ACTIVITY_ITEMS,
  },
  {
    title: 'Commerce / brand',
    items: COMMERCE_BRAND_ITEMS,
  },
  {
    title: 'Messaging',
    items: MESSAGING_ITEMS,
  },
];

function getErrorMessage(error: unknown, fallback: string) {
  const message =
    (error as { response?: { data?: { message?: string | string[] } }; message?: string })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(Boolean).join(', ');
  if (typeof message === 'string' && message.trim()) return message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function readBooleanSetting(settings: NotificationSettings, item: ToggleConfig): boolean {
  return Boolean((settings[item.section] as Record<string, unknown>)?.[item.key]);
}

async function readDevicePermissionStatus(): Promise<DevicePermissionStatus> {
  if (Platform.OS === 'web') return 'unavailable';

  try {
    const ExpoNotifications = await Promise.resolve().then(() => require('expo-notifications') as typeof ExpoNotificationsType);
    const permissions = await ExpoNotifications.getPermissionsAsync();
    if (permissions.status === ExpoNotifications.PermissionStatus.GRANTED) return 'granted';
    if (permissions.status === ExpoNotifications.PermissionStatus.DENIED) return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

function ToggleSettingRow({
  item,
  value,
  disabled,
  pending,
  onToggle,
}: {
  item: ToggleConfig;
  value: boolean;
  disabled: boolean;
  pending: boolean;
  onToggle: (nextValue: boolean) => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={item.label}
      disabled={disabled}
      onPress={() => onToggle(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        pressed && !disabled ? styles.rowPressed : null,
      ]}
    >
      {item.emoji ? (
        <View style={styles.emojiWrap}>
          <AppText variant="body">{item.emoji}</AppText>
        </View>
      ) : null}
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold">{item.label}</AppText>
        {item.description ? (
          <AppText variant="captionRegular" tone="muted">
            {item.description}
          </AppText>
        ) : null}
        {/*
          Show the receipt states in the colours the thread actually uses.

          "Read receipts (colored ✓✓)" described a colour the reader had no way
          to picture, and the descriptions for these three rows run to two dense
          sentences each about what is and is not shared. A live sample of the
          ticks answers "what will I see?" in the same glance, and it stays
          honest because it uses the same tones the message bubbles do.
        */}
        {item.id === 'messaging.readReceipts' ? (
          <View style={styles.receiptLegend}>
            <AppText variant="captionRegular" tone="muted">✓ Sent</AppText>
            <AppText variant="captionRegular" tone="muted">✓✓ Delivered</AppText>
            <AppText variant="captionBold" tone={value ? 'success' : 'muted'}>
              ✓✓ Read
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.switchSlot}>
        {pending ? <MuseLoader size={18} /> : null}
        <View pointerEvents="none" style={styles.switchWrapper}>
          <Switch
            value={value}
            disabled={disabled}
            trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primary }}
            thumbColor={Platform.OS === 'android' ? (value ? theme.colors.surface : theme.colors.textMuted) : undefined}
            ios_backgroundColor={theme.colors.surfaceAlt}
            style={styles.compactSwitch}
          />
        </View>
      </View>
    </Pressable>
  );
}

function ToggleSectionBlock({
  section,
  settings,
  pendingKey,
  saving,
  onPatch,
}: {
  section: ToggleSectionConfig;
  settings: NotificationSettings;
  pendingKey: string | null;
  saving: boolean;
  onPatch: (patch: NotificationSettingPatchDescriptor) => void;
}) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeading}>
        <AppText variant="captionBold" tone="secondary" style={styles.sectionTitle}>
          {section.title.toUpperCase()}
        </AppText>
      </View>
      <View style={styles.sectionRows}>
        {section.items.map((item) => {
          const value = readBooleanSetting(settings, item);
          const patchKey = `${item.section}.${item.key}`;
          return (
            <ToggleSettingRow
              key={item.id}
              item={item}
              value={value}
              disabled={pendingKey === patchKey}
              pending={pendingKey === patchKey}
              onToggle={(nextValue) =>
                onPatch({
                  section: item.section,
                  key: item.key,
                  value: nextValue,
                })
              }
            />
          );
        })}
      </View>
    </View>
  );
}

function PermissionWarning({
  visible,
  onOpenSettings,
}: {
  visible: boolean;
  onOpenSettings: () => void;
}) {
  const { theme } = useTheme();
  if (!visible) return null;

  return (
    <View style={[styles.warningCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.warning }]}>
      <View style={styles.warningCopy}>
        <AppText variant="bodyBold" tone="warning">
          Device notifications are off
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Notifications are enabled in WIEZ, but disabled at device level.
        </AppText>
      </View>
      <Button title="Open settings" size="sm" variant="secondary" onPress={onOpenSettings} />
    </View>
  );
}

function PatchErrorBanner({
  message,
  retryDisabled,
  onRetry,
}: {
  message: string | null;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  if (!message) return null;

  return (
    <View style={[styles.errorCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger }]}>
      <View style={styles.warningCopy}>
        <AppText variant="bodyBold" tone="danger">
          Setting was not saved
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          {message}
        </AppText>
      </View>
      <Button title="Retry" size="sm" variant="outline" disabled={retryDisabled} onPress={onRetry} />
    </View>
  );
}

/**
 * Push takes four things to reach this phone, and each can fail on its own:
 * the WIEZ preference, the phone's permission, a push token from the phone,
 * and WIEZ saving that token. One line each, so "it doesn't work" names which.
 */
function DeviceStatusSection({
  permission,
  status,
  detail,
  retrying,
  onRetry,
}: {
  permission: DevicePermissionStatus;
  status: PushDeviceStatus;
  detail: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const rows: Array<[string, string]> = [
    ['Notifications in WIEZ', 'On'],
    ['Phone permission', PERMISSION_LABELS[permission]],
    ['This phone', PHONE_LABELS[status.phone]],
    ['Saved with WIEZ', SERVER_LABELS[status.server]],
  ];
  const showRetry =
    status.retryable && status.server !== 'saved' && status.phone !== 'not-checked';

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeading}>
        <AppText variant="captionBold" tone="secondary" style={styles.sectionTitle}>
          THIS DEVICE
        </AppText>
      </View>
      <View style={[styles.moduleCard, { backgroundColor: theme.colors.surface }]}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.statusRow}>
            <AppText variant="body" style={styles.statusLabel}>
              {label}
            </AppText>
            <AppText
              variant="bodyBold"
              tone={label === 'Notifications in WIEZ' ? 'success' : toneFor(value)}
              style={styles.statusValue}
            >
              {value}
            </AppText>
          </View>
        ))}
        {detail ? (
          <AppText variant="captionRegular" tone="muted">
            {detail}
          </AppText>
        ) : null}
        {showRetry ? (
          <Button
            title={retrying ? 'Trying again…' : 'Try again'}
            size="sm"
            variant="outline"
            disabled={retrying}
            onPress={onRetry}
          />
        ) : null}
      </View>
    </View>
  );
}

function QuietHoursSection({
  settings,
  saving,
  pendingKey,
  onPatch,
}: {
  settings: NotificationSettings;
  saving: boolean;
  pendingKey: string | null;
  onPatch: (patch: NotificationSettingPatchDescriptor) => void;
}) {
  // The times only mean something while quiet hours are on.
  const showTimes = pushControlVisibility(settings.push).quietHourTimes;
  const { theme } = useTheme();
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);

  const commitQuietHour = useCallback(
    (field: 'quietHoursStart' | 'quietHoursEnd', value: string | null) => {
      onPatch({
        section: 'push',
        key: field,
        value,
      });
    },
    [onPatch],
  );

  const startLabel = settings.push.quietHoursStart || 'Not set';
  const endLabel = settings.push.quietHoursEnd || 'Not set';

  return (
    // One description, not two. The section header said "Pause non-critical push
    // delivery during a daily window" and the toggle under it said "Mute
    // supported push notifications during your selected hours" — the same
    // sentence twice, in two type sizes, about one switch.
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeading}>
        <AppText variant="captionBold" tone="secondary" style={styles.sectionTitle}>
          QUIET HOURS
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Pause non-critical push delivery during a daily window.
        </AppText>
      </View>

      <View style={[styles.moduleCard, { backgroundColor: theme.colors.surface }]}>
        <ToggleSettingRow
          item={{
            id: 'push.quietHoursEnabled',
            label: 'Enable quiet hours',
            section: 'push',
            key: 'quietHoursEnabled',
          }}
          value={settings.push.quietHoursEnabled}
          disabled={pendingKey === 'push.quietHoursEnabled'}
          pending={pendingKey === 'push.quietHoursEnabled'}
          onToggle={(nextValue) =>
            onPatch({
              section: 'push',
              key: 'quietHoursEnabled',
              value: nextValue,
            })
          }
        />

        {/* A time is a choice, not free text. These open a picker instead of
            asking the user to type HH:mm and find out on blur whether they got
            the format right. */}
        {showTimes ? (
        <>
        <Pressable
          onPress={() => setOpenPicker('start')}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Quiet hours start time"
          style={({ pressed }) => [
            styles.timeRow,
            pressed ? styles.timeRowPressed : null,
          ]}
        >
          <AppText variant="body" style={styles.timeRowLabel}>Starts</AppText>
          <AppText
            variant="bodyBold"
            tone={settings.push.quietHoursStart ? 'default' : 'muted'}
          >
            {startLabel}
          </AppText>
          <AppText variant="subtitle" tone="muted">›</AppText>
        </Pressable>

        <Pressable
          onPress={() => setOpenPicker('end')}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Quiet hours end time"
          style={({ pressed }) => [
            styles.timeRow,
            pressed ? styles.timeRowPressed : null,
          ]}
        >
          <AppText variant="body" style={styles.timeRowLabel}>Ends</AppText>
          <AppText
            variant="bodyBold"
            tone={settings.push.quietHoursEnd ? 'default' : 'muted'}
          >
            {endLabel}
          </AppText>
          <AppText variant="subtitle" tone="muted">›</AppText>
        </Pressable>

        {(pendingKey === 'push.quietHoursStart' || pendingKey === 'push.quietHoursEnd') ? (
          <View style={styles.inlineSaving}>
            <MuseLoader size={18} />
            <AppText variant="captionRegular" tone="muted">
              Saving quiet hours...
            </AppText>
          </View>
        ) : null}
        </>
        ) : null}
      </View>

      <AppTimePickerSheet
        visible={openPicker === 'start'}
        title="Quiet hours start"
        value={settings.push.quietHoursStart ?? null}
        fallbackHour={22}
        onChange={(next) => commitQuietHour('quietHoursStart', next)}
        onClose={() => setOpenPicker(null)}
      />
      <AppTimePickerSheet
        visible={openPicker === 'end'}
        title="Quiet hours end"
        value={settings.push.quietHoursEnd ?? null}
        fallbackHour={7}
        onChange={(next) => commitQuietHour('quietHoursEnd', next)}
        onClose={() => setOpenPicker(null)}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, token, user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedPatch, setFailedPatch] = useState<NotificationSettingPatchDescriptor | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [devicePermissionStatus, setDevicePermissionStatus] = useState<DevicePermissionStatus>('unavailable');

  const saving = Boolean(pendingKey);

  const refreshDevicePermissionStatus = useCallback(async () => {
    const nextStatus = await readDevicePermissionStatus();
    setDevicePermissionStatus(nextStatus);
    return nextStatus;
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);

    try {
      const nextSettings = await NotificationsApi.getSettings();
      setSettings(nextSettings);
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load notification settings right now.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevicePermissionStatus();
  }, [refreshDevicePermissionStatus]);

  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated') {
      setLoading(false);
      setLoadError('Sign in to manage notification settings.');
      return;
    }

    void loadSettings();
  }, [loadSettings, status]);

  const registration = usePushRegistrationState();
  const deviceStatus = describePushDeviceStatus(registration.result);
  const [retryingRegistration, setRetryingRegistration] = useState(false);

  // The outcome lands in `registration` (shown in "This device"), not in the
  // settings error banner: the preference itself saved fine, so "Setting was
  // not saved" with a Retry that re-sent the setting was the wrong message and
  // a Retry that could not retry the registration.
  const triggerPushRegistration = useCallback(
    (force = true) => {
      setRetryingRegistration(true);
      void registerAuthenticatedPushToken({
        userId: user?.id ?? null,
        authToken: token,
        force,
      })
        .then((result) => {
          if (result.status === 'skipped' && result.reason === 'permission-denied') {
            setDevicePermissionStatus('denied');
            return;
          }
          void refreshDevicePermissionStatus();
        })
        .finally(() => setRetryingRegistration(false));
    },
    [refreshDevicePermissionStatus, token, user?.id],
  );

  // Opening this screen before the app's own attempt has reported: check now.
  useEffect(() => {
    if (status !== 'authenticated' || !settings?.push.enabled) return;
    if (registration.result) return;
    triggerPushRegistration(false);
    // Only on first sight of an enabled push setting with no outcome yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, settings?.push.enabled]);

  const registrationDetail =
    registration.result &&
    (registration.result.status === 'failed' ||
      (registration.result.status === 'skipped' &&
        registration.result.reason !== 'already-registered' &&
        registration.result.reason !== 'permission-denied'))
      ? describePushSkipReason(registration.result.reason)
      : null;

  const savePatch = useCallback(
    async (patch: NotificationSettingPatchDescriptor) => {
      if (!settings) return;

      const patchKey = `${patch.section}.${patch.key}`;
      const previousSettings = settings;
      setPendingKey(patchKey);
      setFailedPatch(null);
      setActionError(null);
      setSettings(applyNotificationSettingsPatch(settings, patch));

      try {
        const nextSettings = await NotificationsApi.updateSettings(
          buildNotificationSettingsPatch(patch.section, patch.key, patch.value),
        );
        setSettings(nextSettings);

        if (patch.section === 'push' && patch.key === 'enabled' && patch.value === true) {
          triggerPushRegistration();
        }
      } catch (error) {
        setSettings(previousSettings);
        setFailedPatch(patch);
        setActionError(getErrorMessage(error, 'Try saving this setting again.'));
      } finally {
        setPendingKey((current) => (current === patchKey ? null : current));
      }
    },
    [settings, triggerPushRegistration],
  );

  const handlePatch = useCallback(
    (patch: NotificationSettingPatchDescriptor) => {
      if (saving) return;
      void savePatch(patch);
    },
    [savePatch, saving],
  );

  const retryFailedPatch = useCallback(() => {
    if (!failedPatch || saving) return;
    void savePatch(failedPatch);
  }, [failedPatch, savePatch, saving]);

  const openDeviceSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {
      setActionError('Open notification permissions from your device Settings app.');
    });
  }, []);

  const permissionWarningVisible = useMemo(
    () => Boolean(settings?.push.enabled && devicePermissionStatus === 'denied'),
    [devicePermissionStatus, settings?.push.enabled],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <AppBackButton fallbackHref="/settings" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Notifications</AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            Push delivery, alerts, and activity categories
          </AppText>
        </View>
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <MuseLoader size={20} />
          <AppText variant="body" tone="muted">
            Loading notification settings...
          </AppText>
        </View>
      ) : loadError || !settings ? (
        <View style={styles.stateWrap}>
          <AppText variant="bodyBold">Could not load settings</AppText>
          <AppText variant="bodyRegular" tone="muted" style={styles.centerText}>
            {loadError ?? 'Notification settings are unavailable right now.'}
          </AppText>
          <Button title="Retry" size="sm" onPress={() => void loadSettings()} />
        </View>
      ) : (
        <KeyboardAwareFormScroll
          style={styles.keyboardWrap}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, tokens.spacing.xl) },
          ]}
        >
          <PermissionWarning visible={permissionWarningVisible} onOpenSettings={openDeviceSettings} />
          <PatchErrorBanner
            message={actionError}
            retryDisabled={!failedPatch || saving}
            onRetry={retryFailedPatch}
          />

          {/* Push off: only the switch that turns it on. Previews, sound,
              vibration and quiet hours keep their saved values while hidden. */}
          <ToggleSectionBlock
            section={
              pushControlVisibility(settings.push).pushDependents
                ? DELIVERY_SECTION
                : DELIVERY_SECTION_PUSH_OFF
            }
            settings={settings}
            pendingKey={pendingKey}
            saving={saving}
            onPatch={handlePatch}
          />

          {pushControlVisibility(settings.push).pushDependents ? (
            <>
              <DeviceStatusSection
                permission={devicePermissionStatus}
                status={deviceStatus}
                detail={registrationDetail}
                retrying={retryingRegistration}
                onRetry={() => triggerPushRegistration(true)}
              />
              <QuietHoursSection
                settings={settings}
                saving={saving}
                pendingKey={pendingKey}
                onPatch={handlePatch}
              />
            </>
          ) : null}

          {TOGGLE_SECTIONS.map((section) => (
            <ToggleSectionBlock
              key={section.title}
              section={section}
              settings={settings}
              pendingKey={pendingKey}
              saving={saving}
              onPatch={handlePatch}
            />
          ))}
        </KeyboardAwareFormScroll>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  content: {
    gap: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xl,
  },
  centerText: {
    textAlign: 'center',
  },
  sectionWrap: {
    gap: tokens.spacing.sm,
  },
  sectionHeading: {
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
  },
  sectionTitle: {
    letterSpacing: 0,
  },
  sectionRows: {
    gap: tokens.spacing.xs,
  },
  moduleCard: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    ...tokens.elevation.sm,
  },
  toggleRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
  },
  emojiWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  receiptLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.xs,
  },
  switchSlot: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
  },
  switchWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactSwitch: {
    transform: [{ scale: Platform.OS === 'ios' ? 0.82 : 0.88 }],
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    padding: tokens.spacing.md,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    padding: tokens.spacing.md,
  },
  warningCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  timeRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.xs,
    paddingVertical: tokens.spacing.sm,
  },
  timeRowLabel: {
    flex: 1,
    minWidth: 0,
  },
  statusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  statusLabel: {
    flex: 1,
    minWidth: 0,
  },
  statusValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  timeRowPressed: {
    opacity: 0.72,
  },
  inlineSaving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ExpoNotifications from 'expo-notifications';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { NotificationsApi } from '@/src/api/NotificationsApi';
import { useAuth } from '@/src/auth/AuthContext';
import {
  applyNotificationSettingsPatch,
  buildNotificationSettingsPatch,
  isValidQuietHour,
  normalizeQuietHourInput,
  type NotificationSettingPatchDescriptor,
  type NotificationSettings,
  type NotificationSettingsSection,
} from '@/src/notifications/notificationSettings';
import { registerAuthenticatedPushToken } from '@/src/notifications/pushTokenRegistration';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type DevicePermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

type ToggleConfig = {
  id: string;
  label: string;
  description: string;
  section: NotificationSettingsSection;
  key: string;
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
    description: 'Allow WEAZ to send mobile push notifications.',
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
    description: 'Play the default notification sound for WEAZ pushes.',
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
  description: 'Controls how WEAZ push notifications appear on this device.',
  items: DELIVERY_ITEMS,
};

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
        { borderBottomColor: theme.colors.border },
        pressed && !disabled ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold">{item.label}</AppText>
        <AppText variant="captionRegular" tone="muted">
          {item.description}
        </AppText>
      </View>
      <View style={styles.switchSlot}>
        {pending ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        <View pointerEvents="none">
          <Switch
            value={value}
            disabled={disabled}
            trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primarySoft }}
            thumbColor={value ? theme.colors.primary : theme.colors.textMuted}
            ios_backgroundColor={theme.colors.surfaceAlt}
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
  const { theme } = useTheme();

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeading}>
        <AppText variant="captionBold" tone="muted" style={styles.sectionTitle}>
          {section.title.toUpperCase()}
        </AppText>
        {section.description ? (
          <AppText variant="captionRegular" tone="muted">
            {section.description}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {section.items.map((item, index) => {
          const value = readBooleanSetting(settings, item);
          const patchKey = `${item.section}.${item.key}`;
          return (
            <View key={item.id} style={index === section.items.length - 1 ? styles.lastRowWrap : null}>
              <ToggleSettingRow
                item={item}
                value={value}
                disabled={saving}
                pending={pendingKey === patchKey}
                onToggle={(nextValue) =>
                  onPatch({
                    section: item.section,
                    key: item.key,
                    value: nextValue,
                  })
                }
              />
            </View>
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
          Notifications are enabled in WEAZ, but disabled at device level.
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
  const { theme } = useTheme();
  const [draftStart, setDraftStart] = useState(settings.push.quietHoursStart ?? '');
  const [draftEnd, setDraftEnd] = useState(settings.push.quietHoursEnd ?? '');
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    setDraftStart(settings.push.quietHoursStart ?? '');
    setDraftEnd(settings.push.quietHoursEnd ?? '');
    setStartError(null);
    setEndError(null);
  }, [settings.push.quietHoursStart, settings.push.quietHoursEnd]);

  const commitQuietHour = useCallback(
    (field: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
      const normalized = normalizeQuietHourInput(value);
      const setError = field === 'quietHoursStart' ? setStartError : setEndError;

      if (normalized !== null && !isValidQuietHour(normalized)) {
        setError('Use HH:mm, for example 22:30.');
        return;
      }

      setError(null);
      onPatch({
        section: 'push',
        key: field,
        value: normalized,
      });
    },
    [onPatch],
  );

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeading}>
        <AppText variant="captionBold" tone="muted" style={styles.sectionTitle}>
          QUIET HOURS
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Pause non-critical push delivery during a daily window.
        </AppText>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <ToggleSettingRow
          item={{
            id: 'push.quietHoursEnabled',
            label: 'Enable quiet hours',
            description: 'Mute supported push notifications during your selected hours.',
            section: 'push',
            key: 'quietHoursEnabled',
          }}
          value={settings.push.quietHoursEnabled}
          disabled={saving}
          pending={pendingKey === 'push.quietHoursEnabled'}
          onToggle={(nextValue) =>
            onPatch({
              section: 'push',
              key: 'quietHoursEnabled',
              value: nextValue,
            })
          }
        />
        <View style={styles.timeInputs}>
          <Input
            label="Start time"
            value={draftStart}
            onChangeText={setDraftStart}
            onBlur={() => commitQuietHour('quietHoursStart', draftStart)}
            onSubmitEditing={() => commitQuietHour('quietHoursStart', draftStart)}
            placeholder="22:00"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            error={startError ?? undefined}
            helperText="HH:mm, 24-hour time"
            containerStyle={styles.timeInput}
          />
          <Input
            label="End time"
            value={draftEnd}
            onChangeText={setDraftEnd}
            onBlur={() => commitQuietHour('quietHoursEnd', draftEnd)}
            onSubmitEditing={() => commitQuietHour('quietHoursEnd', draftEnd)}
            placeholder="07:00"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            error={endError ?? undefined}
            helperText="Clear to save no time"
            containerStyle={styles.timeInput}
          />
        </View>
        {(pendingKey === 'push.quietHoursStart' || pendingKey === 'push.quietHoursEnd') ? (
          <View style={styles.inlineSaving}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <AppText variant="captionRegular" tone="muted">
              Saving quiet hours...
            </AppText>
          </View>
        ) : null}
      </View>
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

  const triggerPushRegistration = useCallback(() => {
    void registerAuthenticatedPushToken({
      userId: user?.id ?? null,
      authToken: token,
    })
      .then((result) => {
        if (result.status === 'skipped' && result.reason === 'permission-denied') {
          setDevicePermissionStatus('denied');
          return;
        }
        void refreshDevicePermissionStatus();
      })
      .catch(() => {
        setActionError('Push preference was saved, but this device could not register for push yet.');
      });
  }, [refreshDevicePermissionStatus, token, user?.id]);

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
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <AppBackButton fallbackHref="/settings" />
        <View style={styles.headerCopy}>
          <AppText variant="title">Notifications</AppText>
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            Push delivery, alerts, and activity categories
          </AppText>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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

            <ToggleSectionBlock
              section={DELIVERY_SECTION}
              settings={settings}
              pendingKey={pendingKey}
              saving={saving}
              onPatch={handlePatch}
            />

            <QuietHoursSection
              settings={settings}
              saving={saving}
              pendingKey={pendingKey}
              onPatch={handlePatch}
            />

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
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  content: {
    gap: tokens.spacing.lg,
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
  sectionCard: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  toggleRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRowWrap: {
    overflow: 'hidden',
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  switchSlot: {
    minWidth: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.md,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing.md,
  },
  warningCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  timeInputs: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  timeInput: {
    flex: 1,
    minWidth: 0,
  },
  inlineSaving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.md,
  },
});

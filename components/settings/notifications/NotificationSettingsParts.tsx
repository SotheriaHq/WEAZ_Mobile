import React, { memo, useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { AppTimePickerSheet } from '@/components/ui/AppTimePickerSheet';
import { Button } from '@/components/ui/Button';
import { MuseLoader } from '@/components/ui/MuseLoader';
import type { DevicePermissionStatus } from '@/src/notifications/useNotificationDevice';
import { QUIET_HOURS_TOGGLE, type NotificationToggle } from '@/src/notifications/notificationSections';
import {
  pushControlVisibility,
  type NotificationSettingPatchDescriptor,
  type NotificationSettings,
} from '@/src/notifications/notificationSettings';
import type { PushDeviceStatus } from '@/src/notifications/pushTokenRegistration';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/** A switch row. The whole row is the control; the label and sentence describe it. */
export const NotificationToggleRow = memo(function NotificationToggleRow({
  item,
  value,
  pending,
  onToggle,
}: {
  item: NotificationToggle;
  value: boolean;
  /** Its save is in flight: shows progress and refuses a second flip of the same switch. */
  pending: boolean;
  onToggle: (item: NotificationToggle, nextValue: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: pending, busy: pending }}
      accessibilityLabel={item.label}
      accessibilityHint={item.description}
      disabled={pending}
      onPress={() => onToggle(item, !value)}
      style={({ pressed }) => [styles.toggleRow, pressed && !pending ? styles.pressed : null]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold">{item.label}</AppText>
        {item.description ? (
          <AppText variant="captionRegular" tone="muted">
            {item.description}
          </AppText>
        ) : null}
        {item.id === 'messaging.readReceipts' ? (
          // The receipt states in the tones the conversation itself uses.
          <View style={styles.receiptLegend} importantForAccessibility="no-hide-descendants">
            <AppText variant="captionRegular" tone="muted">✓ Sent</AppText>
            <AppText variant="captionRegular" tone="muted">✓✓ Delivered</AppText>
            <AppText variant="captionBold" tone={value ? 'success' : 'muted'}>✓✓ Read</AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.switchSlot}>
        {pending ? <MuseLoader size={18} /> : null}
        <View pointerEvents="none">
          <Switch
            value={value}
            disabled={pending}
            trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primary }}
            thumbColor={Platform.OS === 'android' ? (value ? theme.colors.surface : theme.colors.textMuted) : undefined}
            ios_backgroundColor={theme.colors.surfaceAlt}
          />
        </View>
      </View>
    </Pressable>
  );
});

/** One row on the overview: a section, where it stands, and the way in. */
export const NotificationSectionRow = memo(function NotificationSectionRow({
  emoji,
  title,
  summary,
  attention = false,
  onPress,
}: {
  emoji: string;
  title: string;
  summary: string;
  attention?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${summary}`}
      accessibilityHint={`Opens ${title} settings`}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.emojiSlot} importantForAccessibility="no-hide-descendants">
        <AppText variant="subtitle">{emoji}</AppText>
      </View>
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="captionRegular" tone={attention ? 'warning' : 'muted'}>
          {summary}
        </AppText>
      </View>
      <AppText variant="subtitle" tone="muted" importantForAccessibility="no">
        ›
      </AppText>
    </Pressable>
  );
});

export function PermissionWarning({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.noticeCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.warning }]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold" tone="warning">
          Notifications are off for WIEZ on this phone
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          Notifications are enabled in WIEZ, but disabled at device level. Allow them in your phone's settings and
          WIEZ picks it up when you come back.
        </AppText>
      </View>
      <Button title="Open settings" size="sm" variant="secondary" onPress={onOpenSettings} />
    </View>
  );
}

export function SaveFailedBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.noticeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.danger }]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold" tone="danger">
          Setting was not saved
        </AppText>
        <AppText variant="captionRegular" tone="muted">
          {message}
        </AppText>
      </View>
      <View style={styles.noticeActions}>
        <Button title="Retry" size="sm" variant="outline" onPress={onRetry} />
        <Button title="Dismiss" size="sm" variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}

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

type StatusTone = 'success' | 'warning' | 'danger' | 'muted';
function toneFor(value: string): StatusTone {
  if (value === 'Allowed' || value === 'Set up' || value === 'Saved' || value === 'On') return 'success';
  if (value === 'Could not set up' || value === 'Could not save') return 'danger';
  if (value === 'Checking…') return 'muted';
  return 'warning';
}

/**
 * Push takes four things to reach this phone, and each can fail on its own:
 * the WIEZ preference, the phone's permission, a push token from the phone,
 * and WIEZ saving that token. One line each, so "it doesn't work" names which.
 */
export function DeviceStatusPanel({
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
  const rows: Array<[string, string]> = [
    ['Notifications in WIEZ', 'On'],
    ['Phone permission', PERMISSION_LABELS[permission]],
    ['This phone', PHONE_LABELS[status.phone]],
    ['Saved with WIEZ', SERVER_LABELS[status.server]],
  ];
  const showRetry = status.retryable && status.server !== 'saved' && status.phone !== 'not-checked';
  return (
    <View style={styles.panel}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.statusRow} accessible accessibilityLabel={`${label}: ${value}`}>
          <AppText variant="body" style={styles.statusLabel}>
            {label}
          </AppText>
          <AppText variant="bodyBold" tone={toneFor(value)} style={styles.statusValue}>
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
  );
}

export function QuietHoursPanel({
  settings,
  quietTogglePending,
  timesPending,
  onToggle,
  onPatch,
}: {
  settings: NotificationSettings;
  quietTogglePending: boolean;
  timesPending: boolean;
  onToggle: (item: NotificationToggle, nextValue: boolean) => void;
  onPatch: (patch: NotificationSettingPatchDescriptor) => void;
}) {
  // The times only mean something while quiet hours are on.
  const showTimes = pushControlVisibility(settings.push).quietHourTimes;
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  const commit = useCallback(
    (field: 'quietHoursStart' | 'quietHoursEnd', value: string | null) => {
      onPatch({ section: 'push', key: field, value });
    },
    [onPatch],
  );
  const start = settings.push.quietHoursStart;
  const end = settings.push.quietHoursEnd;

  return (
    <View style={styles.panel}>
      <NotificationToggleRow
        item={QUIET_HOURS_TOGGLE}
        value={settings.push.quietHoursEnabled}
        pending={quietTogglePending}
        onToggle={onToggle}
      />
      {/* A time is a choice, not free text: these open a picker. */}
      {showTimes ? (
        <>
          <AppText variant="captionRegular" tone="muted">Times use UTC. Both times are needed. Equal times pause notifications all day.</AppText>
          <TimeRow label="Starts" value={start} onPress={() => setOpenPicker('start')} disabled={timesPending} />
          <TimeRow label="Ends" value={end} onPress={() => setOpenPicker('end')} disabled={timesPending} />
          {timesPending ? (
            <View style={styles.inlineSaving} accessibilityLiveRegion="polite">
              <MuseLoader size={18} />
              <AppText variant="captionRegular" tone="muted">
                Saving quiet hours…
              </AppText>
            </View>
          ) : null}
        </>
      ) : null}
      <AppTimePickerSheet
        visible={openPicker === 'start'}
        title="Quiet hours start"
        value={start ?? null}
        fallbackHour={22}
        onChange={(next) => commit('quietHoursStart', next)}
        onClose={() => setOpenPicker(null)}
      />
      <AppTimePickerSheet
        visible={openPicker === 'end'}
        title="Quiet hours end"
        value={end ?? null}
        fallbackHour={7}
        onChange={(next) => commit('quietHoursEnd', next)}
        onClose={() => setOpenPicker(null)}
      />
    </View>
  );
}

function TimeRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Quiet hours ${label.toLowerCase()}, ${value ?? 'not set'}`}
      accessibilityHint="Opens a time picker"
      style={({ pressed }) => [styles.timeRow, pressed ? styles.pressed : null]}
    >
      <AppText variant="body" style={styles.statusLabel}>
        {label}
      </AppText>
      <AppText variant="bodyBold" tone={value ? 'default' : 'muted'}>
        {value ?? 'Not set'}
      </AppText>
      <AppText variant="subtitle" tone="muted" importantForAccessibility="no">
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  sectionRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  emojiSlot: {
    width: 32,
    alignItems: 'center',
    flexShrink: 0,
  },
  pressed: {
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
    minWidth: 52,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
  },
  noticeCard: {
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    padding: tokens.spacing.md,
  },
  noticeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  panel: {
    gap: tokens.spacing.sm,
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
  timeRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  inlineSaving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
});

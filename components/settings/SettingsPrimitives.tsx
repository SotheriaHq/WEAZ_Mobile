import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppBackButton } from '@/components/ui/AppBackButton';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export function SettingsHeader({
  title,
  subtitle,
  fallbackHref = '/settings',
}: {
  title: string;
  subtitle?: string;
  fallbackHref?: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
      <AppBackButton fallbackHref={fallbackHref as never} />
      <View style={styles.headerCopy}>
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function SettingsStateCard({
  title,
  body,
  loading = false,
  actionTitle,
  onAction,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  actionTitle?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Card padding="lg" style={styles.stateCard}>
      {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      <AppText variant="bodyBold" style={styles.centerText}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" tone="muted" style={styles.centerText}>
          {body}
        </AppText>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} size="sm" variant="secondary" onPress={onAction} />
      ) : null}
    </Card>
  );
}

export function SettingsToggleRow({
  title,
  description,
  value,
  disabled = false,
  busy = false,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  const { theme } = useTheme();
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.settingRow,
        { borderColor: theme.colors.border },
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold">{title}</AppText>
        {description ? (
          <AppText variant="captionRegular" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          styles.switchTrack,
          {
            backgroundColor: value ? theme.colors.primary : theme.colors.surfaceAlt,
            borderColor: value ? theme.colors.primary : theme.colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            {
              backgroundColor: theme.colors.textInverse,
              transform: [{ translateX: value ? 18 : 0 }],
            },
          ]}
        />
        {busy ? (
          <View style={styles.switchBusy} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SettingsOptionRow({
  title,
  description,
  selected,
  disabled = false,
  onPress,
}: {
  title: string;
  description?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
        },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.rowCopy}>
        <AppText variant="bodyBold" tone={selected ? 'primary' : 'default'}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="captionRegular" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

export function SettingsSection({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <AppText variant="captionBold" tone="muted">
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
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
  stateCard: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  section: {
    gap: tokens.spacing.sm,
  },
  settingRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: tokens.spacing.xs,
  },
  switchTrack: {
    width: 48,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  switchBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.6,
  },
});

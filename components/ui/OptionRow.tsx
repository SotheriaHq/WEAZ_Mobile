import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  valueTone?: 'muted' | 'danger' | 'primary' | 'default';
  valueState?: 'default' | 'placeholder' | 'selected' | 'error' | 'pending';
  required?: boolean;
  leading?: string | React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
};

export function OptionRow({
  title,
  subtitle,
  value,
  valueTone = 'muted',
  valueState = 'default',
  required = false,
  leading,
  trailing,
  disabled,
  divider = true,
  style,
  onPress,
}: Props) {
  const { theme } = useTheme();

  const renderContent = (pressed = false) => {
    const resolvedState =
      valueState === 'default'
        ? valueTone === 'danger'
          ? 'error'
          : value
            ? 'selected'
            : 'placeholder'
        : valueState;
    const stateBorderColor =
      resolvedState === 'error'
        ? theme.colors.danger
        : resolvedState === 'pending'
          ? theme.colors.warning
          : resolvedState === 'selected'
            ? theme.colors.focusRing
            : theme.colors.border;
    const stateBackgroundColor =
      resolvedState === 'selected'
        ? theme.colors.surface
        : theme.colors.surfaceAlt;
    const resolvedValueTone =
      resolvedState === 'error'
        ? 'danger'
        : resolvedState === 'pending'
          ? 'warning'
          : resolvedState === 'selected'
            ? 'primary'
            : 'muted';

    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: pressed
              ? theme.colors.surface
              : stateBackgroundColor,
            borderColor: pressed ? theme.colors.primary : stateBorderColor,
          },
          divider ? styles.rowSpacing : null,
          disabled ? styles.disabled : null,
          style,
        ]}
      >
        {leading ? (
          <View style={styles.leadingWrap}>
            {typeof leading === 'string' ? (
              <AppText variant="subtitle">{leading}</AppText>
            ) : (
              leading
            )}
          </View>
        ) : null}
        <View style={styles.copy}>
          <AppText variant="bodyBold" numberOfLines={1}>
            {title}
            {required ? (
              <AppText variant="bodyBold" tone="danger">{' '}*</AppText>
            ) : null}
          </AppText>
          {subtitle ? (
            <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.trailingWrap}>
          {trailing ??
            (value ? (
              <View
                style={[
                  styles.valuePill,
                  {
                    backgroundColor:
                      resolvedState === 'selected'
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                    borderColor: stateBorderColor,
                  },
                ]}
              >
                <AppText
                  variant={resolvedState === 'placeholder' ? 'captionRegular' : 'captionBold'}
                  tone={resolvedValueTone}
                  numberOfLines={1}
                >
                  {value}
                </AppText>
              </View>
            ) : (
              <AppText variant="subtitle" tone="muted">{'>'}</AppText>
            ))}
        </View>
      </View>
    );
  };

  if (!onPress) return renderContent();

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => renderContent(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
  },
  rowSpacing: {
    marginBottom: tokens.spacing.sm,
  },
  disabled: {
    opacity: 0.58,
  },
  leadingWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  trailingWrap: {
    maxWidth: '42%',
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  valuePill: {
    maxWidth: '100%',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.md,
  },
});

export default OptionRow;

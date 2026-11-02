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
  const { scheme, theme } = useTheme();

  const renderContent = (pressed = false) => {
    const resolvedState =
      valueState === 'default'
        ? valueTone === 'danger'
          ? 'error'
          : value
            ? 'selected'
            : 'placeholder'
        : valueState;
    const resolvedValueTone =
      resolvedState === 'error'
        ? 'danger'
        : resolvedState === 'pending'
          ? 'warning'
          : resolvedState === 'selected'
            ? 'primary'
            : 'muted';

    const pillBg =
      resolvedState === 'selected'
        ? theme.colors.primarySoft
        : resolvedState === 'error'
          ? theme.colors.disabledSurface
          : theme.colors.surfaceAlt;

    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
            borderWidth: 0,
          },
          divider ? styles.rowSpacing : null,
          disabled ? styles.disabled : null,
          style,
        ]}
      >
        {leading ? (
          <View style={[styles.leadingWrap, { backgroundColor: theme.colors.primarySoft }]}>
            {typeof leading === 'string' ? (
              <AppText variant="subtitle">{leading}</AppText>
            ) : (
              leading
            )}
          </View>
        ) : null}
        <View style={styles.copy}>
          <AppText variant="bodyBold">
            {title}
            {required ? (
              <AppText variant="bodyBold" tone="danger">{' '}*</AppText>
            ) : null}
          </AppText>
          {subtitle ? (
            <AppText variant="captionRegular" tone="muted">
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
                    backgroundColor: pillBg,
                    borderWidth: 0,
                  },
                ]}
              >
                <AppText
                  variant={resolvedState === 'placeholder' ? 'captionRegular' : 'captionBold'}
                  tone={resolvedValueTone}
                  numberOfLines={1}
                >
                  {value}
                  {resolvedState === 'selected' ? '  ⌄' : ''}
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
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    borderWidth: 0,
    borderRadius: tokens.radius.lg,
  },
  rowSpacing: {
    marginBottom: tokens.spacing.sm,
  },
  disabled: {
    opacity: 0.58,
  },
  leadingWrap: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    
  },
  copy: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
  trailingWrap: {
    maxWidth: '55%',
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  valuePill: {
    maxWidth: '100%',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderWidth: 0,
    borderRadius: tokens.radius.full,
  },
});

export default OptionRow;

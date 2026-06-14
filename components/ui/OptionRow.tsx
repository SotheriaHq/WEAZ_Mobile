import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  /** Tone for the inline value (e.g. "danger" to flag a required-missing field). */
  valueTone?: 'muted' | 'danger' | 'primary' | 'default';
  /** Renders an inline red asterisk beside the title (no spelled-out "Required"). */
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
  required = false,
  leading,
  trailing,
  disabled,
  divider = true,
  style,
  onPress,
}: Props) {
  const { theme } = useTheme();
  const content = (
    <View
      style={[
        styles.row,
        divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border } : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.leadingWrap}>
        {typeof leading === 'string' ? (
          <AppText variant="subtitle">{leading}</AppText>
        ) : leading ? (
          leading
        ) : null}
      </View>
      <View style={styles.copy}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {title}
          {required ? <AppText variant="bodyBold" tone="danger"> *</AppText> : null}
        </AppText>
        {subtitle ? (
          <AppText variant="captionRegular" tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.trailingWrap}>
        {trailing ?? (value ? <AppText variant="captionBold" tone={valueTone}>{value}</AppText> : <AppText variant="subtitle" tone="muted">›</AppText>)}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      {content}
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
  },
  pressed: {
    opacity: 0.82,
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
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

export default OptionRow;

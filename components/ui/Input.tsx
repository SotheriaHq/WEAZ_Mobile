import React from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  helperText?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Input({
  label,
  error,
  helperText,
  leading,
  trailing,
  containerStyle,
  multiline,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const hasError = Boolean(error);

  return (
    <View style={containerStyle}>
      <AppText variant="caption" tone="secondary" style={styles.label}>
        {label}
      </AppText>
      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? 104 : 52,
            backgroundColor: theme.colors.surface,
            borderColor: hasError ? theme.colors.danger : theme.colors.border,
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          {...rest}
          multiline={multiline}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              paddingLeft: leading ? tokens.spacing.xl2 : tokens.spacing.lg,
              paddingRight: trailing ? 44 : tokens.spacing.lg,
              paddingTop: multiline ? tokens.spacing.lg : 0,
              paddingBottom: multiline ? tokens.spacing.lg : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              fontFamily: tokens.fontFamily.regular,
              fontSize: tokens.typography.body.size,
              lineHeight: tokens.typography.body.lineHeight,
            },
          ]}
          placeholderTextColor={theme.colors.textMuted}
        />
        {trailing ? (
          <Pressable style={styles.trailing} accessibilityRole="button">
            {trailing}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" style={styles.message}>
          {error}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" tone="muted" style={styles.message}>
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: tokens.spacing.sm,
    letterSpacing: 0,
    textTransform: 'none',
  },
  field: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  input: {
    minHeight: 52,
  },
  leading: {
    position: 'absolute',
    left: tokens.spacing.lg,
    zIndex: 2,
  },
  trailing: {
    position: 'absolute',
    right: tokens.spacing.lg,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: tokens.spacing.xs,
  },
});

export default Input;

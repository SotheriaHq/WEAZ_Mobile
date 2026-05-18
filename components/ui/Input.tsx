import React from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hideLabel?: boolean;
  error?: string;
  helperText?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  variant?: 'default' | 'bare';
};

export const Input = React.forwardRef<TextInput, InputProps>(function Input({
  label,
  hideLabel = false,
  error,
  helperText,
  leading,
  trailing,
  containerStyle,
  variant = 'default',
  multiline,
  ...rest
}, ref) {
  const { theme } = useTheme();
  const hasError = Boolean(error);
  const isBare = variant === 'bare';

  return (
    <View style={containerStyle}>
      {!hideLabel ? (
        <AppText variant="caption" tone="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? 104 : 52,
            backgroundColor: isBare ? 'transparent' : theme.colors.surface,
            borderColor: isBare ? 'transparent' : hasError ? theme.colors.danger : theme.colors.border,
            borderWidth: isBare ? 0 : 1,
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              paddingLeft: isBare ? 0 : leading ? tokens.spacing.xl2 : tokens.spacing.lg,
              paddingRight: isBare ? 0 : trailing ? 44 : tokens.spacing.lg,
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
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
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
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  label: {
    marginBottom: tokens.spacing.sm,
    letterSpacing: 0,
    textTransform: 'none',
  },
  field: {
    borderRadius: tokens.radius.lg,
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

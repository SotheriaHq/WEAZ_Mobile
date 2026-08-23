import React from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useKeyboardFormField } from '@/components/ui/KeyboardAwareFormScroll';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  hideLabel?: boolean;
  /**
   * Marks the field itself, with the `*` beside its label.
   *
   * Required-ness belongs ON the field. The alternative — a roll-call of field
   * names in a banner or footer — asks the reader to match names against fields
   * they cannot see, which is how a form ends up reporting a problem the user
   * cannot find. The mark is state-aware: brand colour at rest, danger once the
   * field is actually blocking.
   */
  required?: boolean;
  error?: string;
  helperText?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * `default` — filled, rounded box.
   * `bare` — no chrome at all; the parent draws the container.
   * `underline` — a single rule under the field. Reads as a line of writing
   *   rather than a stack of boxes, which is what a long profile form wants:
   *   the placeholder carries the hint and the label sits above.
   */
  variant?: 'default' | 'bare' | 'underline';
};

export const Input = React.forwardRef<TextInput, InputProps>(function Input({
  label,
  hideLabel = false,
  required = false,
  error,
  helperText,
  leading,
  trailing,
  containerStyle,
  variant = 'default',
  multiline,
  onFocus,
  ...rest
}, ref) {
  const { theme } = useTheme();
  const keyboardForm = useKeyboardFormField();
  const hasError = Boolean(error);
  const isBare = variant === 'bare';
  const isUnderline = variant === 'underline';
  const isPlain = isBare || isUnderline;
  // A field that looks identical whether or not the caret is in it gives the
  // user nothing to read the form by. Focus now moves the border to the brand
  // colour and thickens it, which is the difference between "a box" and "the
  // box I am typing in".
  const [isFocused, setIsFocused] = React.useState(false);
  const activeBorderColor = hasError
    ? theme.colors.danger
    : isFocused
      ? theme.colors.primary
      : theme.colors.border;
  const activeBorderWidth = isFocused || hasError ? 1.5 : 1;

  return (
    <View style={containerStyle}>
      {!hideLabel ? (
        <View style={styles.labelRow}>
          <AppText
            variant="smallBold"
            tone={hasError ? 'danger' : isFocused ? 'primary' : 'secondary'}
            style={styles.label}
          >
            {label}
          </AppText>
          {required ? (
            <AppText variant="smallBold" tone={hasError ? 'danger' : 'primary'}>
              *
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.field,
          isUnderline && styles.fieldUnderline,
          {
            minHeight: multiline ? 104 : 52,
            backgroundColor: isPlain ? 'transparent' : theme.colors.surface,
            borderColor: isBare ? 'transparent' : activeBorderColor,
            borderWidth: isPlain ? 0 : activeBorderWidth,
            ...(isUnderline
              ? { borderBottomWidth: activeBorderWidth, borderBottomColor: activeBorderColor }
              : null),
          },
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          onBlur={(event) => {
            setIsFocused(false);
            rest.onBlur?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
            // Scroll the caret clear of the keyboard when nested in KeyboardAwareFormScroll.
            keyboardForm?.onFieldFocus();
          }}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              paddingLeft: isPlain ? 0 : leading ? tokens.spacing.xl2 : tokens.spacing.lg,
              paddingRight: isPlain ? 0 : trailing ? 44 : tokens.spacing.lg,
              paddingTop: multiline ? tokens.spacing.lg : 0,
              paddingBottom: multiline ? tokens.spacing.lg : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              // Medium, not regular. What the user types is the content of the
              // screen and was rendering one weight lighter than the body text
              // around it — the field read as a disabled preview of itself.
              fontFamily: tokens.fontFamily.medium,
              fontWeight: '500',
              fontSize: tokens.typography.body.size,
              lineHeight: tokens.typography.body.lineHeight,
            },
          ]}
          placeholderTextColor={theme.colors.textPlaceholder}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  label: {
    // Vertical rhythm moved to `labelRow`, which now owns the row the label and
    // the required mark share.
    flexShrink: 1,
    letterSpacing: 0,
    textTransform: 'none',
  },
  field: {
    borderRadius: tokens.radius.lg,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fieldUnderline: {
    // Square, so the rule reads as a writing line and not a clipped box.
    borderRadius: 0,
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

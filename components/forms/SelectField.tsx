import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { tokens } from '@/src/styles/tokens';
import { useTheme } from '@/src/theme/ThemeProvider';

/**
 * A labelled trigger for a value the user PICKS rather than types.
 *
 * It is deliberately `Input`'s twin, not `OptionRow`'s: the two components
 * answer different questions. `OptionRow` is a settings row — a destination with
 * a current value shown as a pill on the right. This is a FORM FIELD, and it has
 * to line up beside real `Input`s in a stack of fields, share their label
 * treatment, their required mark, their error/helper slot and their three
 * variants, or a form of mixed typed and picked fields reads as two forms
 * spliced together.
 *
 * Every screen that needed one had been re-implementing it locally (the brand
 * profile editor's `ProfileSelectField` is the surviving example), which is
 * exactly the duplication Rule 31 is about. This is the shared one.
 *
 * The trigger itself is a `Pressable`, not a disabled `TextInput`: a disabled
 * input is still a tab stop on some platforms and reads to a screen reader as a
 * field the user has failed to fill in, when there is nothing here to type.
 */

export type SelectFieldProps = {
  label: string;
  hideLabel?: boolean;
  /** The chosen value's display text. Empty renders `placeholder`. */
  value?: string | null;
  placeholder: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  /** Shown in place of the chevron while the option list is in flight. */
  loading?: boolean;
  /** Rendered before the value — a flag, a mark. */
  leading?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /** Matches `Input`'s variants so the two stack cleanly. */
  variant?: 'default' | 'bare' | 'underline';
  onPress: () => void;
  testID?: string;
};

export function SelectField({
  label,
  hideLabel = false,
  value,
  placeholder,
  required = false,
  error,
  helperText,
  disabled = false,
  loading = false,
  leading,
  containerStyle,
  variant = 'default',
  onPress,
  testID,
}: SelectFieldProps) {
  const { theme } = useTheme();
  const hasError = Boolean(error);
  const isBare = variant === 'bare';
  const isUnderline = variant === 'underline';
  const isPlain = isBare || isUnderline;
  const hasValue = Boolean(String(value ?? '').trim());

  const borderColor = hasError ? theme.colors.danger : theme.colors.border;
  const borderWidth = hasError ? 1.5 : 1;

  return (
    <View style={containerStyle}>
      {!hideLabel ? (
        <View style={styles.labelRow}>
          <AppText
            variant="smallBold"
            tone={hasError ? 'danger' : 'secondary'}
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

      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: hasValue ? String(value) : placeholder }}
        accessibilityState={{ disabled: disabled || loading }}
        testID={testID}
        style={({ pressed }) => [
          styles.field,
          isUnderline && styles.fieldUnderline,
          {
            backgroundColor: isPlain ? 'transparent' : theme.colors.surface,
            borderColor: isBare
              ? 'transparent'
              : pressed && !disabled
                ? theme.colors.primary
                : borderColor,
            borderWidth: isPlain ? 0 : borderWidth,
            ...(isUnderline
              ? {
                  borderBottomWidth: borderWidth,
                  borderBottomColor:
                    pressed && !disabled ? theme.colors.primary : borderColor,
                }
              : null),
            paddingHorizontal: isPlain ? 0 : tokens.spacing.lg,
          },
          disabled && styles.disabled,
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <AppText
          variant="body"
          tone={hasValue ? 'default' : 'muted'}
          numberOfLines={1}
          style={styles.value}
        >
          {hasValue ? String(value) : placeholder}
        </AppText>
        {/*
          A chevron, not the word "Choose". Every platform picker uses a
          disclosure marker here; spelling out the verb on every field is noise
          the reader has to get past on the way to the value.
        */}
        <AppText variant="subtitle" tone={disabled ? 'muted' : 'secondary'} style={styles.chevron}>
          ›
        </AppText>
      </Pressable>

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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  label: {
    flexShrink: 1,
    letterSpacing: 0,
    textTransform: 'none',
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  fieldUnderline: {
    // Square, so the rule reads as a writing line and not a clipped box.
    borderRadius: 0,
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    // The glyph's own bearing sits it slightly low against a 52pt row.
    marginTop: -2,
  },
  disabled: {
    opacity: 0.55,
  },
  message: {
    marginTop: tokens.spacing.xs,
  },
});

export default SelectField;
